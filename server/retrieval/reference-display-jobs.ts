import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { DISPLAY_TRANSLATION_POLICY, ensureReferenceTranslationsForLanguage,
  readReferenceDisplayTranslations, referenceDisplayContentHash, resolveReferenceSourceLanguage } from "./reference-translation-service";

const BATCH_SIZE = 4;
type ReferenceRow = Awaited<ReturnType<typeof loadReferences>>[number];

async function loadReferences(userId: string, projectId: string, ids?: string[]) {
  return prisma.projectReference.findMany({ where: { projectId, project: { userId },
    ...(ids ? { referenceId: { in: ids } } : {}) }, include: { reference: true },
    orderBy: [{ selected: "desc" }, { createdAt: "asc" }], take: ids ? Math.min(ids.length, BATCH_SIZE) : 16 });
}

function batchIdentity(projectId: string, language: string, rows: ReferenceRow[]) {
  return `reference-display:${fingerprint([projectId, language, DISPLAY_TRANSLATION_POLICY,
    rows.map(row => [row.referenceId, referenceDisplayContentHash(row.reference)]).sort(([a], [b]) => a.localeCompare(b))])}`;
}

/** Idempotent acquisition. A mounted card can request recovery for existing
 * references; GET/render never dispatches a model call. */
export async function enqueueReferenceDisplayJobs(userId: string, projectId: string, language = "es") {
  if (!await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } }))
    throw new Error("PROJECT_NOT_FOUND");
  const rows = await loadReferences(userId, projectId);
  const existing = await readReferenceDisplayTranslations(rows.map(row => row.reference), language);
  const pending = rows.filter(row => {
    const source = resolveReferenceSourceLanguage(row.reference);
    const cached = existing.get(row.referenceId);
    if (source === language || cached?.sourceLanguage === language) return false;
    return !cached?.translatedTitle || Boolean(row.reference.abstract && !cached.translatedAbstract);
  });
  const jobs = [];
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    const requestKey = batchIdentity(projectId, language, batch);
    jobs.push(await prisma.referenceDisplayJob.upsert({ where: { requestKey },
      create: { userId, projectId, requestKey, targetLanguage: language,
        referenceIdsJson: batch.map(row => row.referenceId) as Prisma.InputJsonValue }, update: {} }));
  }
  return jobs.map(job => ({ id: job.id, status: job.status, failureCategory: job.failureCategory }));
}

export async function referenceDisplayStatus(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return prisma.referenceDisplayJob.findMany({ where: { userId, projectId }, orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, status: true, failureCategory: true, referenceIdsJson: true } });
}

export async function runNextReferenceDisplayJob() {
  // A lost worker lease must never cause an uncertain model call to be replayed.
  await prisma.referenceDisplayJob.updateMany({ where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: "FAILED", failureCategory: "WORKER_INTERRUPTED_RECONCILIATION_REQUIRED", completedAt: new Date() } });
  const job = await prisma.$transaction(async tx => {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "ReferenceDisplayJob"
      WHERE status = 'QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!row) return null;
    return tx.referenceDisplayJob.update({ where: { id: row.id }, data: { status: "RUNNING", lockedAt: new Date() } });
  });
  if (!job) return null;
  try {
    const ids = job.referenceIdsJson as string[];
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > BATCH_SIZE || ids.some(id => typeof id !== "string"))
      throw new Error("REFERENCE_DISPLAY_JOB_INPUT_INVALID");
    const rows = await loadReferences(job.userId, job.projectId, ids);
    if (rows.length !== ids.length || batchIdentity(job.projectId, job.targetLanguage, rows) !== job.requestKey)
      throw new Error("REFERENCE_DISPLAY_INPUT_CHANGED");
    await withPaidOperation({ userId: job.userId, projectId: job.projectId, requestId: job.requestKey,
      purpose: "REFERENCE_DISPLAY", revision: job.requestKey,
      inputs: { ids, policyVersion: DISPLAY_TRANSLATION_POLICY } }, async () => {
      await ensureReferenceTranslationsForLanguage({ references: rows.map(row => row.reference),
        targetLanguage: job.targetLanguage, strict: true });
      return { completedReferenceIds: ids };
    });
    await prisma.referenceDisplayJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return { id: job.id, status: "COMPLETED" };
  } catch (error) {
    const category = error instanceof Error && /PRE_JOB_COST_LIMIT|BUDGET_BLOCKED/.test(error.message)
      ? "BUDGET_UNAVAILABLE" : error instanceof Error && /^REFERENCE_DISPLAY_/.test(error.message)
        ? error.message : "TRANSLATION_FAILED";
    await prisma.referenceDisplayJob.update({ where: { id: job.id }, data: { status: category === "BUDGET_UNAVAILABLE" ? "BUDGET_UNAVAILABLE" : "FAILED",
      failureCategory: category, completedAt: new Date() } });
    return { id: job.id, status: category === "BUDGET_UNAVAILABLE" ? "BUDGET_UNAVAILABLE" : "FAILED" };
  }
}
