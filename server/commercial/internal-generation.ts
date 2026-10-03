import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INTERNAL_PILOT_COST_POLICY_VERSION, internalPilotJobCostPolicy, jobCostPolicy } from "@/server/mvp/execution-policy";
import { securityAudit } from "@/server/auth/security-events";
import { qaJobPolicy } from "@/server/mvp/qa-acceptance-policy";

type Tx = Prisma.TransactionClient;
export const INTERNAL_GENERATION_POLICY = "internal-platform-v1";

export async function activeInternalGenerationCapability(userId: string, tx: Tx = prisma) {
  const grants = await tx.internalGenerationCapability.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  return grants.find(grant => !grant.expiresAt || grant.expiresAt > new Date()) ?? null;
}

export async function reserveInternalGenerationJob(tx: Tx, jobId: string) {
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId } });
  if ((job.metadataJson as { commercialPolicy?: string } | null)?.commercialPolicy !== INTERNAL_GENERATION_POLICY ||
    !await tx.project.findFirst({ where: { id: job.projectId, userId: job.userId }, select: { id: true } }))
    throw new Error("INTERNAL_GENERATION_JOB_CONTEXT_INVALID");
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${job.userId} FOR UPDATE`;
  const prior = await tx.internalGenerationAuthorization.findUnique({ where: { jobId } });
  const grant = prior ? await tx.internalGenerationCapability.findUnique({ where: { id: prior.capabilityId } }) :
    await activeInternalGenerationCapability(job.userId, tx);
  if (!grant || grant.userId !== job.userId || grant.status !== "ACTIVE" || grant.expiresAt && grant.expiresAt <= new Date())
    throw new Error("INTERNAL_GENERATION_CAPABILITY_REQUIRED");
  await tx.$queryRaw`SELECT id FROM "InternalGenerationCapability" WHERE id = ${grant.id} FOR UPDATE`;
  const current = await tx.internalGenerationCapability.findUniqueOrThrow({ where: { id: grant.id } });
  if (current.status !== "ACTIVE" || current.expiresAt && current.expiresAt <= new Date())
    throw new Error("INTERNAL_GENERATION_CAPABILITY_REQUIRED");
  if (prior) {
    if (prior.status === "RESERVED") return prior;
    return tx.internalGenerationAuthorization.update({ where: { jobId }, data: { status: "RESERVED", closedAt: null } });
  }
  const pilot = (job.metadataJson as { costPolicyVersion?: string } | null)?.costPolicyVersion === INTERNAL_PILOT_COST_POLICY_VERSION;
  const qa = await qaJobPolicy(tx, jobId);
  const record = await tx.internalGenerationAuthorization.create({ data: { jobId, userId: job.userId, projectId: job.projectId,
    capabilityId: grant.id, policyVersion: INTERNAL_GENERATION_POLICY,
    hardCapMicros: Math.ceil((qa?.policy ?? (pilot ? internalPilotJobCostPolicy() : jobCostPolicy())).hard * 1_000_000) } });
  await securityAudit("INTERNAL_GENERATION_RESERVED", job.userId, { jobId, capabilityId: grant.id,
    hardCapMicros: record.hardCapMicros }, tx);
  return record;
}

export async function assertInternalGenerationAuthorization(tx: Tx, jobId: string) {
  const qa = await qaJobPolicy(tx, jobId);
  const record = await tx.internalGenerationAuthorization.findUnique({ where: { jobId }, include: { capability: true, job: true } });
  if (!record || record.policyVersion !== INTERNAL_GENERATION_POLICY || record.status !== "RESERVED" ||
    record.job.userId !== record.userId || record.job.projectId !== record.projectId ||
    record.capability.userId !== record.userId || record.capability.status !== "ACTIVE" ||
    record.capability.expiresAt && record.capability.expiresAt <= new Date())
    throw new Error("INTERNAL_GENERATION_CAPABILITY_REQUIRED");
  // A prospective, exact-job QA grant may fund new work. Never rewrite the
  // original internal authorization or saved cost policy to simulate a new cap.
  return qa?.overage ? qa.policy.hard : record.hardCapMicros / 1_000_000;
}

export async function settleInternalGenerationJob(tx: Tx, jobId: string, outcome: "COMPLETED" | "FAILED") {
  const auth = await tx.internalGenerationAuthorization.findUnique({ where: { jobId } });
  if (!auth || auth.status === "SETTLED" || auth.status === "FAILED") return;
  const cost = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
  const entries = (cost?.outputJson as { entries?: Array<{ estimate: number | null; maximum: number; status: string }> } | null)?.entries ?? [];
  const unknown = entries.some(entry => entry.estimate === null || !Number.isFinite(entry.estimate) || entry.estimate < 0);
  const knownMicros = Math.ceil(entries.reduce((sum, entry) => sum + (entry.estimate ?? entry.maximum), 0) * 1_000_000);
  if (outcome === "COMPLETED") {
    await assertInternalGenerationAuthorization(tx, jobId);
    const version = await tx.blueprintVersion.findFirst({ where: { OR: [{ generationJobId: jobId },
      { generatedArtifacts: { some: { jobId } } }] } });
    if (!version || version.projectId !== auth.projectId) throw new Error("INTERNAL_GENERATION_PUBLICATION_MISSING");
    const artifacts = await tx.generatedArtifact.findMany({ where: { jobId, blueprintVersionId: version.id,
      userId: auth.userId }, select: { kind: true } });
    if (!["BLUEPRINT_DOCX", "BLUEPRINT_PDF"].every(kind => artifacts.some(item => item.kind === kind)))
      throw new Error("INTERNAL_GENERATION_PUBLICATION_MISSING");
  }
  const status = unknown ? "COST_PENDING" : outcome === "COMPLETED" ? "SETTLED" : "FAILED";
  await tx.internalGenerationAuthorization.update({ where: { jobId }, data: { status, actualCostMicros: knownMicros,
    closedAt: status === "COST_PENDING" ? null : new Date() } });
  await securityAudit("INTERNAL_GENERATION_COST_CLOSED", auth.userId, { jobId, status,
    knownOrReservedMicros: knownMicros }, tx);
}

export async function reconcileInternalGenerationJobs() {
  const rows = await prisma.internalGenerationAuthorization.findMany({ where: { status: "COST_PENDING",
    job: { status: { in: ["FAILED", "CANCELLED", "COMPLETED"] } } }, include: { job: { select: { status: true } } }, take: 100 });
  for (const row of rows) await prisma.$transaction(tx => settleInternalGenerationJob(tx, row.jobId,
    row.job.status === "COMPLETED" ? "COMPLETED" : "FAILED"));
  return rows.length;
}
