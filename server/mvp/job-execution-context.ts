import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jobCostPolicy } from "./execution-policy";

type Execution = { jobId: string; startedAt: Date; stage: string; recoveryAttempt?: number; checkpointOnly?: boolean; allowedCheckpointWork?: string[] };
const context = new AsyncLocalStorage<Execution>();
export const currentJobExecution = () => context.getStore();
export function withJobExecution<T>(value: Execution, work: () => Promise<T>) { return context.run(value, work); }
export function stableJson(value: unknown): string {
  const canonical = (item: any): any => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])])) : item;
  return JSON.stringify(canonical(JSON.parse(JSON.stringify(value))));
}
export const fingerprint = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

// Existing JobStage rows store small private control records. Heavy files stay on the private volume.
async function locked<T>(execution: Execution, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${execution.jobId} FOR UPDATE`;
    const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: execution.jobId } });
    if (job.status !== "RUNNING" || job.startedAt?.getTime() !== execution.startedAt.getTime()) throw new Error("LEASE_LOST");
    return work(tx);
  });
}
type PaidEntry = { id: string; purpose: string; stage: string; model: string; actualModel: string | null; maximum: number; estimate: number | null; usage: unknown; status: string; startedAt: string; finishedAt?: string; category: string; retry: boolean; mandatoryReserve: number };
type CostRecord = { policy: ReturnType<typeof jobCostPolicy>; entries: PaidEntry[]; terminal?: { jobStatus: "COMPLETED" | "FAILED"; at: string } };
const committed = (entries: PaidEntry[]) => entries.reduce((sum, item) => sum + (item.estimate ?? item.maximum), 0);

// Call inside the SAME transaction that makes the job terminal. Uncertain/in-flight
// spend is not refunded: retain its full reservation until late usage reconciliation.
export async function closeJobCostControl(tx: Prisma.TransactionClient, jobId: string, jobStatus: "COMPLETED" | "FAILED") {
  const row = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
  if (!row) return;
  const record = row.outputJson as unknown as CostRecord;
  const at = new Date();
  record.terminal = { jobStatus, at: at.toISOString() };
  for (const entry of record.entries) if (entry.status === "reserved") entry.status = "pending_reconciliation";
  await tx.blueprintJobStage.update({ where: { id: row.id }, data: { status: jobStatus, progress: 100, completedAt: at, outputJson: json(record) } });
}
export async function reserveJobCall(purpose: string, model: string, maximum: number, providerAttempt = 0) {
  const execution = context.getStore();
  if (!execution) return null;
  if (execution.checkpointOnly) throw new Error(`CHECKPOINT_ONLY_PAID_CALL_FORBIDDEN: ${purpose}`);
  const id = randomUUID();
  await locked(execution, async (tx) => {
    const row = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } } });
    const record = row?.outputJson as unknown as CostRecord ?? { policy: jobCostPolicy(), entries: [] };
    const policy = record.policy; // Persisted at the first call; changing env cannot reset an existing job's cap.
    const optional = /hero|image|visual|matrix_layout|compact|deep_research/i.test(purpose);
    // Conservative remaining-work allowance, not a claim of a known future invoice.
    // Every later request is independently bounded again. Scientific work is paused,
    // never shortened, if actual context cannot fit the remaining envelope.
    const mandatoryReserve = /final_title|executive_summary/.test(execution.stage) ? 0.05 : policy.mandatoryReserve;
    const spent = committed(record.entries);
    const deepSpent = committed(record.entries.filter((entry) => entry.category === "DEEP_RESEARCH_COST"));
    if (!Number.isFinite(maximum) || maximum <= 0 || record.entries.some((entry) => entry.estimate !== null && entry.estimate > entry.maximum) || spent + maximum + mandatoryReserve > policy.hard || optional && spent + maximum > policy.soft || /deep_research/.test(purpose) && deepSpent + maximum > policy.deep) throw new Error("COST_LIMIT_REACHED: checkpoint conservado; no se autorizo otra llamada.");
    record.entries.push({ id, purpose, stage: execution.stage, model, actualModel: null, maximum, estimate: null, usage: null, status: "reserved", startedAt: new Date().toISOString(), category: /deep_research/.test(purpose) ? "DEEP_RESEARCH_COST" : optional ? "OPTIONAL_PRESENTATION_COST" : "SUCCESSFUL_SCIENTIFIC_COST", retry: providerAttempt > 0 || (execution.recoveryAttempt ?? 0) > 0, mandatoryReserve });
    delete record.terminal;
    await tx.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } }, create: { jobId: execution.jobId, stageKey: "control:cost", status: "RUNNING", progress: 0, outputJson: json(record) }, update: { status: "RUNNING", completedAt: null, outputJson: json(record) } });
  });
  const finish = async (estimate: number | null, usage: unknown, actualModel?: string) => {
    // Settle the reservation even after a lease expires: the old call can still have incurred cost.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${execution.jobId} FOR UPDATE`;
      const row = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } } });
      const record = row.outputJson as unknown as CostRecord;
      const entry = record.entries.find((item) => item.id === id)!;
      if (entry.status === "completed") return;
      if (estimate !== null && (!Number.isFinite(estimate) || estimate < 0)) throw new Error("Invalid usage estimate");
      Object.assign(entry, { estimate, usage, actualModel: actualModel ?? null, status: estimate === null ? "failed_unknown_usage" : "completed", finishedAt: new Date().toISOString() });
      if (estimate === null) entry.category = "FAILED_CALL_COST";
      await tx.blueprintJobStage.update({ where: { id: row.id }, data: { outputJson: json(record) } });
    });
  };
  return { complete: finish, fail: () => finish(null, null) };
}

export async function claimJobControlSlot(key: string, maximum: number) {
  const execution = context.getStore();
  if (!execution) return true;
  if (!Number.isInteger(maximum) || maximum < 0) throw new Error(`Invalid control slot maximum: ${key}`);
  return locked(execution, async (tx) => {
    const stageKey = `control:${key}`;
    const row = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } } });
    const record = row?.outputJson as { used?: number; maximum?: number } | null;
    const used = record?.used ?? 0;
    if (used >= maximum) return false;
    const output = { used: used + 1, maximum, updatedAt: new Date().toISOString() };
    await tx.blueprintJobStage.upsert({
      where: { jobId_stageKey: { jobId: execution.jobId, stageKey } },
      create: { jobId: execution.jobId, stageKey, status: "COMPLETED", progress: 100, completedAt: new Date(), outputJson: json(output) },
      update: { status: "COMPLETED", progress: 100, completedAt: new Date(), outputJson: json(output) },
    });
    return true;
  });
}

export async function jobCostSnapshot() {
  const execution = context.getStore();
  if (!execution) return null;
  const row = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } } });
  const record = row?.outputJson as unknown as CostRecord | null;
  if (!record) return { jobId: execution.jobId, calls: 0, entries: [], pricing: "estimated, not provider invoice" };
  return { jobId: execution.jobId, ...record, calls: record.entries.length, committed_usd: committed(record.entries), estimated_known_usd: record.entries.reduce((sum, entry) => sum + (entry.estimate ?? 0), 0), unknown_usage_calls: record.entries.filter((entry) => entry.estimate === null).length, retry_committed_usd: committed(record.entries.filter((entry) => entry.retry)), pricing: "estimated from provider tokens; actual billed USD unknown" };
}

export function classifyPlanSourceDisposition(input: {
  hasEvidenceCard: boolean;
  materializationStatus?: string | null;
}) {
  if (input.hasEvidenceCard) return "USED" as const;
  if (input.materializationStatus && /UNUSABLE|FAILED|REJECTED/i.test(input.materializationStatus)) {
    return "REJECTED_AFTER_INSPECTION" as const;
  }
  return "CONSIDERED_NOT_USED" as const;
}

export async function createBlueprintVersionOnce(data: Prisma.BlueprintVersionUncheckedCreateInput, scientificInputs: unknown) {
  const execution = context.getStore();
  if (!execution) return prisma.blueprintVersion.create({ data });
  return locked(execution, async (tx) => {
    const stageKey = "checkpoint:BLUEPRINT_VERSION";
    const hash = fingerprint(scientificInputs);
    const existing = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } } });
    const output = existing?.outputJson as { versionId: string; fingerprint: string } | null;
    if (output) {
      if (output.fingerprint !== hash) throw new Error("INPUT_CHANGED: published scientific version is immutable");
      return tx.blueprintVersion.findUniqueOrThrow({ where: { id: output.versionId, projectId: data.projectId } });
    }
    const latest = await tx.blueprintVersion.findFirst({ where: { projectId: data.projectId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
    const inputSnapshot = await tx.generationInputSnapshot.findFirst({ where: { jobId: execution.jobId }, orderBy: { revision: "desc" } });
    const evidenceLedger = await tx.projectEvidenceLedger.findFirst({ where: { projectId: data.projectId }, orderBy: { createdAt: "desc" }, include: { evidenceCards: { select: { id: true, referenceId: true, evidenceBasis: true, qualityStatus: true } }, sourceMaterializations: { select: { id: true, referenceId: true, materializationType: true, status: true } } } });
    const generationManifest = {
      version: "plan-version-manifest.v1",
      jobId: execution.jobId,
      inputSnapshot: inputSnapshot ? { id: inputSnapshot.id, revision: inputSnapshot.revision, draftId: inputSnapshot.draftId, draftRevision: inputSnapshot.draftRevision, contentHash: inputSnapshot.contentHash } : null,
      scientificInputs,
      evidence: evidenceLedger ? { ledgerId: evidenceLedger.id, stepRunId: evidenceLedger.stepRunId, evidenceCardIds: evidenceLedger.evidenceCards.map((card) => card.id), materializationIds: evidenceLedger.sourceMaterializations.map((item) => item.id) } : null,
      policies: inputSnapshot && typeof inputSnapshot.payloadJson === "object" && inputSnapshot.payloadJson && !Array.isArray(inputSnapshot.payloadJson) ? (inputSnapshot.payloadJson as Record<string, unknown>).policies ?? null : null,
      approvals: inputSnapshot && typeof inputSnapshot.payloadJson === "object" && inputSnapshot.payloadJson && !Array.isArray(inputSnapshot.payloadJson) ? (inputSnapshot.payloadJson as Record<string, unknown>).userApprovals ?? null : null,
    };
    const version = await tx.blueprintVersion.create({ data: { ...data, versionNumber: (latest?.versionNumber ?? 0) + 1, generationJobId: execution.jobId, generationInputSnapshotId: inputSnapshot?.id, originatingDraftRevision: inputSnapshot?.draftRevision, generationManifestJson: json(generationManifest) } });
    const selected = await tx.projectReference.findMany({ where: { projectId: data.projectId, selected: true }, select: { id: true, referenceId: true, relevanceScore: true, selectionReason: true } });
    const cardsByReference = new Map((evidenceLedger?.evidenceCards ?? []).map((card) => [card.referenceId, card]));
    const materializationsByReference = new Map((evidenceLedger?.sourceMaterializations ?? []).map((item) => [item.referenceId, item]));
    if (selected.length > 0) {
      await tx.planSourceDisposition.createMany({ data: selected.map((item) => {
        const card = cardsByReference.get(item.referenceId);
        const materialization = materializationsByReference.get(item.referenceId);
        const status = classifyPlanSourceDisposition({ hasEvidenceCard: Boolean(card), materializationStatus: materialization?.status });
        return {
          id: randomUUID(),
          blueprintVersionId: version.id,
          projectReferenceId: item.id,
          status,
          reason: status === "USED" ? "La fuente produjo evidencia consumida por el plan publicado." : status === "REJECTED_AFTER_INSPECTION" ? `La inspeccion termino con estado ${materialization?.status}.` : "La fuente fue seleccionada e inspeccionada, pero no produjo evidencia usada en esta version.",
          evidenceLevel: card?.evidenceBasis ?? materialization?.materializationType ?? null,
          relevanceDimensionsJson: json({ aggregateScore: item.relevanceScore }),
          provenanceJson: json({ selectionReason: item.selectionReason, evidenceCardId: card?.id ?? null, materializationId: materialization?.id ?? null }),
        };
      }) });
    }
    await tx.project.update({ where: { id: data.projectId }, data: { activeBlueprintVersionId: version.id } });
    if (inputSnapshot?.draftId && inputSnapshot.draftRevision) {
      await tx.projectDraft.updateMany({ where: { id: inputSnapshot.draftId, revision: inputSnapshot.draftRevision }, data: { staleScopesJson: json([]), lastInvalidatedAt: null } });
    }
    await tx.blueprintJobStage.create({ data: { jobId: execution.jobId, stageKey, status: "COMPLETED", progress: 100, completedAt: new Date(), outputJson: { versionId: version.id, fingerprint: hash } } });
    return version;
  });
}

type Checkpoint<T> = { fingerprint: string; value: T; outputHash: string; files: { path: string; hash: string }[]; completedAt: string };
export async function stageCheckpoint<T>(key: string, inputs: unknown, work: () => Promise<T>, files: (value: T) => string[] = () => []): Promise<T> {
  const execution = context.getStore();
  if (!execution) return work();
  const stageKey = `checkpoint:${key}`;
  const hash = fingerprint({ version: "b4.v1", jobId: execution.jobId, inputs });
  const previous = await locked(execution, (tx) => tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } } }));
  const saved = previous?.outputJson as unknown as Checkpoint<T> | null;
  if (previous?.status === "COMPLETED" && saved?.fingerprint === hash && fingerprint(saved.value) === saved.outputHash) {
    let intact = true;
    for (const file of saved.files) { try { if (fingerprint(await readFile(file.path)) !== file.hash) intact = false; } catch { intact = false; } }
    if (intact) return structuredClone(saved.value);
  }
  if (execution.checkpointOnly && !execution.allowedCheckpointWork?.includes(key)) throw new Error(`CHECKPOINT_ONLY_MISSING_OR_INCOMPATIBLE: ${key}`);
  const oldInput = previous?.inputJson as { fingerprint?: string; attempts?: number } | null;
  const attempts = oldInput?.fingerprint === hash ? (oldInput.attempts ?? 0) + 1 : 1;
  if (attempts > (key.startsWith("EDITORIAL:") ? 1 : 3)) throw new Error(`STAGE_ATTEMPTS_EXHAUSTED: ${key}`);
  await locked(execution, (tx) => tx.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } }, create: { jobId: execution.jobId, stageKey, status: "RUNNING", progress: 0, startedAt: new Date(), inputJson: json({ fingerprint: hash, attempts }) }, update: { status: "RUNNING", startedAt: new Date(), completedAt: null, inputJson: json({ fingerprint: hash, attempts }), errorJson: Prisma.DbNull } }));
  try {
    const value = await context.run({ ...execution, stage: key }, work);
    const fileHashes = await Promise.all(files(value).map(async (file) => ({ path: file, hash: fingerprint(await readFile(file)) })));
    const checkpoint: Checkpoint<T> = { fingerprint: hash, value, outputHash: fingerprint(value), files: fileHashes, completedAt: new Date().toISOString() };
    await locked(execution, (tx) => tx.blueprintJobStage.update({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } }, data: { status: "COMPLETED", completedAt: new Date(), outputJson: json(checkpoint) } }));
    return value;
  } catch (error) {
    await locked(execution, (tx) => tx.blueprintJobStage.update({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } }, data: { status: "FAILED", completedAt: new Date(), errorJson: json({ message: error instanceof Error ? error.message : String(error) }) } })).catch(() => undefined);
    throw error;
  }
}
