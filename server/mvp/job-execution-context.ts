import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INTERNAL_PILOT_COST_POLICY_VERSION, internalPilotJobCostPolicy, jobCostPolicy } from "./execution-policy";
import { assertCommercialPaidAuthorization, settleCommercialJob } from "@/server/commercial/ledger";
import { INTERNAL_GENERATION_POLICY, settleInternalGenerationJob } from "@/server/commercial/internal-generation";
import { wholeJobCostEquation } from "./whole-job-cost-forecast";
import { assertQaCommitment, qaJobPolicy } from "./qa-acceptance-policy";
import { reserveLinkedJobOperation, settleLinkedJobOperation } from "./pre-job-budget";

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
type PaidEntry = { id: string; paidOperationId?: string; purpose: string; stage: string; model: string; actualModel: string | null; maximum: number; estimate: number | null; usage: unknown; status: string; startedAt: string; finishedAt?: string; category: string; retry: boolean; mandatoryReserve: number; inputTokensReserved?: number; tokenCountProvenance?: string };
type CostRecord = { policy: ReturnType<typeof jobCostPolicy> & { version?: string }; entries: PaidEntry[]; terminal?: { jobStatus: "COMPLETED" | "FAILED"; at: string } };
async function initialCostRecord(tx: Prisma.TransactionClient, jobId: string): Promise<CostRecord> {
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId }, select: { metadataJson: true } });
  const metadata = job.metadataJson as { commercialPolicy?: string; costPolicyVersion?: string } | null;
  const pilot = metadata?.commercialPolicy === INTERNAL_GENERATION_POLICY &&
    metadata.costPolicyVersion === INTERNAL_PILOT_COST_POLICY_VERSION;
  const qa = await qaJobPolicy(tx, jobId);
  return { policy: qa?.policy ?? (pilot ? internalPilotJobCostPolicy() : jobCostPolicy()), entries: [] };
}
const committed = (entries: PaidEntry[]) => entries.reduce((sum, item) => sum + (item.estimate ?? item.maximum), 0);

// Call inside the SAME transaction that makes the job terminal. Uncertain/in-flight
// spend is not refunded: retain its full reservation until late usage reconciliation.
export async function closeJobCostControl(tx: Prisma.TransactionClient, jobId: string, jobStatus: "COMPLETED" | "FAILED") {
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId }, select: { metadataJson: true } });
  if ((job.metadataJson as { commercialPolicy?: string } | null)?.commercialPolicy === INTERNAL_GENERATION_POLICY)
    await settleInternalGenerationJob(tx, jobId, jobStatus);
  else await settleCommercialJob(tx, jobId, jobStatus);
  const row = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
  if (!row) return;
  const record = row.outputJson as unknown as CostRecord;
  const at = new Date();
  record.terminal = { jobStatus, at: at.toISOString() };
  for (const entry of record.entries) if (entry.status === "reserved") entry.status = "pending_reconciliation";
  await tx.blueprintJobStage.update({ where: { id: row.id }, data: { status: jobStatus, progress: 100, completedAt: at, outputJson: json(record) } });
}
async function settleJobCall(jobId: string, id: string, estimate: number | null, usage: unknown, actualModel?: string) {
  // Settle even after a lease expires: the already-dispatched call can still incur cost.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${jobId} FOR UPDATE`;
    const row = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
    const record = row.outputJson as unknown as CostRecord;
    const entry = record.entries.find((item) => item.id === id);
    if (!entry) throw new Error("PAID_RESERVATION_NOT_FOUND");
    if (entry.status === "completed" || entry.status === "failed_unknown_usage") return;
    if (estimate !== null && (!Number.isFinite(estimate) || estimate < 0)) throw new Error("Invalid usage estimate");
    Object.assign(entry, { estimate, usage, actualModel: actualModel ?? null, status: estimate === null ? "failed_unknown_usage" : "completed", finishedAt: new Date().toISOString() });
    if (estimate === null) entry.category = "FAILED_CALL_COST";
    if (entry.paidOperationId) await settleLinkedJobOperation(tx, id, estimate, usage, actualModel);
    await tx.blueprintJobStage.update({ where: { id: row.id }, data: { outputJson: json(record) } });
  });
}

// A late provider response may establish the cost of a call previously marked
// unknown. Its durable response record is the proof linking usage to the job;
// an aggregate invoice or a caller-supplied amount alone is not sufficient.
export async function reconcileBackgroundJobUsage(input: {
  jobId: string; logicalAttemptKey: string; reservationId: string; responseId: string;
  requestFingerprint: string; estimate: number; usage: unknown; actualModel: string;
}) {
  if (!Number.isFinite(input.estimate) || input.estimate < 0 || !input.responseId || !input.actualModel || !input.usage)
    throw new Error("BACKGROUND_USAGE_EVIDENCE_INVALID");
  return prisma.$transaction(async (tx) => {
    const job = await tx.$queryRaw<Array<{ id: string; userId: string; projectId: string }>>`
      SELECT id, "userId", "projectId" FROM "BlueprintJob" WHERE id = ${input.jobId} FOR UPDATE`;
    if (job.length !== 1) throw new Error("BACKGROUND_JOB_NOT_FOUND");
    const response = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: {
      jobId: input.jobId, stageKey: backgroundStageKey(input.logicalAttemptKey) } } });
    const proof = response?.outputJson as unknown as BackgroundProviderResponseRecord | null;
    if (!proof || proof.responseId !== input.responseId || proof.requestFingerprint !== input.requestFingerprint ||
      proof.reservationId !== input.reservationId || proof.actualModel !== input.actualModel ||
      !proof.usage || fingerprint(proof.usage) !== fingerprint(input.usage) ||
      !["completed", "incomplete", "failed", "cancelled"].includes(proof.providerStatus ?? ""))
      throw new Error("BACKGROUND_USAGE_PROVENANCE_MISMATCH");
    const cost = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: input.jobId, stageKey: "control:cost" } } });
    const record = cost.outputJson as unknown as CostRecord;
    const entry = record.entries.find(item => item.id === input.reservationId);
    if (!entry || entry.model !== proof.model) throw new Error("PAID_RESERVATION_NOT_FOUND");
    if (entry.status === "completed") {
      if (entry.estimate !== input.estimate || fingerprint(entry.usage ?? null) !== fingerprint(input.usage))
        throw new Error("BACKGROUND_USAGE_CONTRADICTORY");
      return { reconciled: false, estimate: entry.estimate };
    }
    if (!["reserved", "pending_reconciliation", "failed_unknown_usage"].includes(entry.status))
      throw new Error("BACKGROUND_USAGE_STATE_INVALID");
    const previous = { status: entry.status, maximum: entry.maximum, estimate: entry.estimate };
    if (entry.paidOperationId) await settleLinkedJobOperation(tx, entry.id, input.estimate, input.usage, input.actualModel);
    Object.assign(entry, { status: "completed", estimate: input.estimate, usage: input.usage,
      actualModel: input.actualModel, finishedAt: new Date().toISOString(),
      category: input.estimate > entry.maximum ? "BOUND_VIOLATED_COST" :
        proof.providerStatus === "completed" ? "RECONCILED_PROVIDER_COST" : "FAILED_CALL_COST" });
    await tx.blueprintJobStage.update({ where: { id: cost.id }, data: { outputJson: json(record) } });
    await tx.auditLog.create({ data: { userId: job[0].userId, projectId: job[0].projectId,
      actorType: "SYSTEM", eventType: "BACKGROUND_JOB_USAGE_RECONCILED",
      payloadJson: json({ jobId: input.jobId, reservationId: input.reservationId,
        responseId: input.responseId, requestFingerprint: input.requestFingerprint,
        previous, estimate: input.estimate, exceededReservation: input.estimate > entry.maximum }) } });
    return { reconciled: true, estimate: input.estimate };
  });
}

// The provider retrieval happens before this short transaction. A closed job
// has no execution lease, but its response identity and request fingerprint
// remain immutable and can still receive late evidence.
export async function recordRetrievedBackgroundResponse(input: {
  jobId: string; logicalAttemptKey: string; responseId: string; requestFingerprint: string;
  providerStatus: string; actualModel: string; usage: unknown; outputText?: string | null;
}) {
  if (!input.responseId || !input.actualModel || !["completed", "incomplete", "failed", "cancelled"].includes(input.providerStatus))
    throw new Error("BACKGROUND_RETRIEVAL_EVIDENCE_INVALID");
  await prisma.$transaction(async tx => {
    const job = await tx.$queryRaw<Array<{ id: string; userId: string; projectId: string }>>`
      SELECT id, "userId", "projectId" FROM "BlueprintJob" WHERE id = ${input.jobId} FOR UPDATE`;
    if (job.length !== 1) throw new Error("BACKGROUND_JOB_NOT_FOUND");
    const row = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: input.jobId, stageKey: backgroundStageKey(input.logicalAttemptKey) } } });
    const current = row.outputJson as unknown as BackgroundProviderResponseRecord;
    if (current.responseId !== input.responseId || current.requestFingerprint !== input.requestFingerprint)
      throw new Error("BACKGROUND_USAGE_PROVENANCE_MISMATCH");
    if (current.usage && fingerprint(current.usage) !== fingerprint(input.usage))
      throw new Error("BACKGROUND_USAGE_CONTRADICTORY");
    if (current.actualModel && current.actualModel !== input.actualModel)
      throw new Error("BACKGROUND_MODEL_CONTRADICTORY");
    if (current.providerStatus && !["queued", "in_progress"].includes(current.providerStatus) && current.providerStatus !== input.providerStatus)
      throw new Error("BACKGROUND_STATUS_CONTRADICTORY");
    if (current.outputText && input.outputText && current.outputText !== input.outputText)
      throw new Error("BACKGROUND_OUTPUT_CONTRADICTORY");
    const changed = current.providerStatus !== input.providerStatus || !current.usage && Boolean(input.usage) ||
      !current.outputText && Boolean(input.outputText);
    if (!changed) return;
    const updated = { ...current, providerStatus: input.providerStatus, actualModel: input.actualModel,
      usage: input.usage, outputText: input.outputText ?? current.outputText ?? null,
      status: current.status === "COMPLETED" ? "COMPLETED" : input.providerStatus === "completed" ? "PENDING" : input.providerStatus.toUpperCase(),
      updatedAt: new Date().toISOString() };
    await tx.blueprintJobStage.update({ where: { id: row.id }, data: { outputJson: json(updated) } });
    await tx.auditLog.create({ data: { userId: job[0].userId, projectId: job[0].projectId,
      actorType: "SYSTEM", eventType: "BACKGROUND_RESPONSE_RETRIEVED_LATE",
      payloadJson: json({ jobId: input.jobId, responseId: input.responseId,
        requestFingerprint: input.requestFingerprint, priorStatus: current.providerStatus,
        providerStatus: input.providerStatus, usagePresent: Boolean(input.usage), outputPresent: Boolean(input.outputText) }) } });
  });
}

export async function settleCurrentJobCall(id: string, estimate: number | null, usage: unknown, actualModel?: string) {
  const execution = context.getStore();
  if (!execution) throw new Error("PERSISTENT_PAID_CONTEXT_REQUIRED");
  return settleJobCall(execution.jobId, id, estimate, usage, actualModel);
}

export async function reserveJobCall(purpose: string, model: string, maximum: number, providerAttempt = 0, paidOperationId?: string,
  tokenCount?: { inputTokens: number; provenance: string }) {
  const execution = context.getStore();
  if (!execution) return null;
  if (execution.checkpointOnly) throw new Error(`CHECKPOINT_ONLY_PAID_CALL_FORBIDDEN: ${purpose}`);
  const id = randomUUID();
  await locked(execution, async (tx) => {
    const owner = await tx.blueprintJob.findUniqueOrThrow({ where: { id: execution.jobId }, select: { userId: true } });
    await assertQaCommitment(tx, owner.userId, maximum);
    const commercialCap = await assertCommercialPaidAuthorization(tx, execution.jobId);
    const row = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } } });
    const record = row?.outputJson as unknown as CostRecord ?? await initialCostRecord(tx, execution.jobId);
    const policy = record.policy; // Persisted at the first call; changing env cannot reset an existing job's cap.
    const optional = /hero|image|visual|matrix_layout|editorial_compaction|deep_research/i.test(purpose);
    // Conservative remaining-work allowance, not a claim of a known future invoice.
    // Every later request is independently bounded again. Scientific work is paused,
    // never shortened, if actual context cannot fit the remaining envelope.
    const mandatoryReserve = /final_title|executive_summary/.test(execution.stage) ? 0.05 : policy.mandatoryReserve;
    const spent = committed(record.entries);
    if (commercialCap !== null && spent + maximum + mandatoryReserve > commercialCap) throw new Error("COST_LIMIT_REACHED: commercial policy snapshot");
    const deepSpent = committed(record.entries.filter((entry) => entry.category === "DEEP_RESEARCH_COST"));
    if (!Number.isFinite(maximum) || maximum <= 0 || record.entries.some((entry) => entry.estimate !== null && entry.estimate > entry.maximum) || spent + maximum + mandatoryReserve > policy.hard || optional && spent + maximum > policy.soft || /deep_research/.test(purpose) && deepSpent + maximum > policy.deep) throw new Error("COST_LIMIT_REACHED: checkpoint conservado; no se autorizo otra llamada.");
    if (paidOperationId) await reserveLinkedJobOperation(tx, { id, jobId: execution.jobId, userId: owner.userId,
      operationId: paidOperationId, purpose, model, maximumUsd: maximum });
    record.entries.push({ id, paidOperationId, purpose, stage: execution.stage, model, actualModel: null, maximum, estimate: null, usage: null, status: "reserved", startedAt: new Date().toISOString(), category: /deep_research/.test(purpose) ? "DEEP_RESEARCH_COST" : optional ? "OPTIONAL_PRESENTATION_COST" : "SUCCESSFUL_SCIENTIFIC_COST", retry: providerAttempt > 0 || (execution.recoveryAttempt ?? 0) > 0, mandatoryReserve,
      ...(tokenCount ? { inputTokensReserved: tokenCount.inputTokens, tokenCountProvenance: tokenCount.provenance } : {}) });
    delete record.terminal;
    await tx.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } }, create: { jobId: execution.jobId, stageKey: "control:cost", status: "RUNNING", progress: 0, outputJson: json(record) }, update: { status: "RUNNING", completedAt: null, outputJson: json(record) } });
  });
  const finish = (estimate: number | null, usage: unknown, actualModel?: string) => settleJobCall(execution.jobId, id, estimate, usage, actualModel);
  return { id, complete: finish, fail: () => finish(null, null) };
}

export type BackgroundProviderResponseRecord = {
  version: "background-response.v1";
  provider: string;
  model: string;
  localCallId: string;
  logicalAttemptKey: string;
  requestFingerprint: string;
  reservedCost: number;
  reservationId: string | null;
  responseId: string | null;
  status: "CLAIMED" | "DISPATCHING" | "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | "INCOMPLETE" | "CREATE_UNCERTAIN";
  providerStatus: string | null;
  correlation: unknown;
  createdAt: string;
  updatedAt: string;
  outputText?: string | null;
  usage?: unknown;
  actualModel?: string | null;
  error?: string | null;
};

const backgroundStageKey = (logicalAttemptKey: string) => `provider:background:${logicalAttemptKey}`;

export async function claimBackgroundProviderResponse(input: Omit<BackgroundProviderResponseRecord, "version" | "localCallId" | "reservationId" | "responseId" | "status" | "providerStatus" | "createdAt" | "updatedAt">) {
  const execution = context.getStore();
  if (!execution) throw new Error("PERSISTENT_BACKGROUND_CONTEXT_REQUIRED");
  return locked(execution, async (tx) => {
    const stageKey = backgroundStageKey(input.logicalAttemptKey);
    const existing = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } } });
    if (existing) {
      const record = existing.outputJson as unknown as BackgroundProviderResponseRecord;
      if (record.requestFingerprint !== input.requestFingerprint || record.model !== input.model || record.provider !== input.provider) throw new Error("BACKGROUND_LOGICAL_ATTEMPT_CONFLICT");
      return { created: false, record };
    }
    const now = new Date().toISOString();
    const record: BackgroundProviderResponseRecord = { ...input, version: "background-response.v1", localCallId: randomUUID(), reservationId: null, responseId: null, status: "CLAIMED", providerStatus: null, createdAt: now, updatedAt: now };
    await tx.blueprintJobStage.create({ data: { jobId: execution.jobId, stageKey, status: "RUNNING", progress: 0, startedAt: new Date(), inputJson: json({ logicalAttemptKey: input.logicalAttemptKey, requestFingerprint: input.requestFingerprint }), outputJson: json(record) } });
    return { created: true, record };
  });
}

export async function updateBackgroundProviderResponse(logicalAttemptKey: string, patch: Partial<BackgroundProviderResponseRecord>) {
  const execution = context.getStore();
  if (!execution) throw new Error("PERSISTENT_BACKGROUND_CONTEXT_REQUIRED");
  return locked(execution, async (tx) => {
    const row = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: backgroundStageKey(logicalAttemptKey) } } });
    const current = row.outputJson as unknown as BackgroundProviderResponseRecord;
    if (patch.responseId && current.responseId && patch.responseId !== current.responseId) throw new Error("BACKGROUND_RESPONSE_ID_IMMUTABLE");
    if (current.status === "COMPLETED" && patch.status && patch.status !== "COMPLETED") throw new Error("BACKGROUND_TERMINAL_STATE_IMMUTABLE");
    const record = { ...current, ...patch, logicalAttemptKey: current.logicalAttemptKey, requestFingerprint: current.requestFingerprint, localCallId: current.localCallId, updatedAt: new Date().toISOString() };
    const terminal = ["COMPLETED", "FAILED", "CANCELLED", "INCOMPLETE"].includes(record.status);
    await tx.blueprintJobStage.update({ where: { id: row.id }, data: { status: terminal ? record.status === "COMPLETED" ? "COMPLETED" : "FAILED" : "RUNNING", progress: terminal ? 100 : 1, completedAt: terminal ? new Date() : null, outputJson: json(record), errorJson: record.error ? json({ message: record.error }) : Prisma.DbNull } });
    return record;
  });
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

// Forecasts are planning records, never charges. The reservation guard still
// checks the actual serialized request at dispatch. This gate stops a costly
// discretionary step when even a conservative mandatory path cannot fit.
export async function preflightWholeJobCost(input: { nextStage: string; nextStageReservation: number; minimumRemainingMandatoryReservation: number }) {
  const execution = context.getStore();
  if (!execution) return null;
  const result = await locked(execution, async (tx) => {
    const row = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:cost" } } });
    const record = row?.outputJson as unknown as CostRecord ?? await initialCostRecord(tx, execution.jobId);
    const knownSpent = record.entries.reduce((sum, entry) => sum + (entry.estimate ?? 0), 0);
    const unknownReserved = record.entries.reduce((sum, entry) => sum + (entry.estimate === null ? entry.maximum : 0), 0);
    const safetyReserve = record.policy.mandatoryReserve;
    const equation = wholeJobCostEquation({ knownSpent, unknownReserved,
      nextStageReservation: input.nextStageReservation,
      minimumRemainingMandatoryReservation: input.minimumRemainingMandatoryReservation,
      safetyReserve, hardCap: record.policy.hard });
    const forecast = { version: "whole-job-preflight.v1", nextStage: input.nextStage,
      knownSpent, unknownReserved, nextStageReservation: input.nextStageReservation,
      minimumRemainingMandatoryReservation: input.minimumRemainingMandatoryReservation,
      safetyReserve, hardCap: record.policy.hard,
      projectedCommitment: equation.projectedCommitment,
      at: new Date().toISOString() };
    if (![forecast.nextStageReservation, forecast.minimumRemainingMandatoryReservation].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("WHOLE_JOB_FORECAST_INVALID");
    await tx.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: "control:forecast" } },
      create: { jobId: execution.jobId, stageKey: "control:forecast", status: "COMPLETED", progress: 100, completedAt: new Date(), outputJson: json(forecast) },
      update: { status: "COMPLETED", progress: 100, completedAt: new Date(), outputJson: json(forecast) } });
    return { forecast, allowed: equation.allowed };
  });
  // Persist a rejected forecast too; it is causal evidence, not a charge.
  if (!result.allowed) throw new Error("COST_LIMIT_REACHED: el trabajo restante completo no cabe bajo el tope del job.");
  return result.forecast;
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
// Preserve a prior scientific result when new evidence changes its context.
// Equal inputs retain the original key; new inputs get a deterministic version.
export async function versionedCheckpointKey(key: string, inputs: unknown) {
  const execution = context.getStore();
  if (!execution) return key;
  const hash = fingerprint({ version: "b4.v1", jobId: execution.jobId, inputs });
  const prior = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: {
    jobId: execution.jobId, stageKey: `checkpoint:${key}` } }, select: { inputJson: true, outputJson: true } });
  const previousHash = (prior?.outputJson as { fingerprint?: string } | null)?.fingerprint ??
    (prior?.inputJson as { fingerprint?: string } | null)?.fingerprint;
  return previousHash && previousHash !== hash ? `${key}:context:${hash}` : key;
}
// Read-only compatibility path: reusable results must match their original full
// request and this job. Never adopt a latest checkpoint merely by stage name.
export async function readCompletedCheckpoint<T>(key: string, inputs: unknown): Promise<T | null> {
  const execution = context.getStore();
  if (!execution) return null;
  const row = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: {
    jobId: execution.jobId, stageKey: `checkpoint:${key}` } } });
  const saved = row?.outputJson as unknown as Checkpoint<T> | null;
  if (row?.status !== "COMPLETED" || !saved || saved.fingerprint !== fingerprint({ version: "b4.v1", jobId: execution.jobId, inputs }) ||
    fingerprint(saved.value) !== saved.outputHash) return null;
  for (const file of saved.files) if (fingerprint(await readFile(file.path)) !== file.hash) return null;
  return structuredClone(saved.value);
}
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
  const oldError = previous?.errorJson as { category?: string; message?: string } | null;
  const providerRetrievalContinuation = previous?.status === "RUNNING" && oldError?.category === "PROVIDER_RESPONSE_PENDING";
  const budgetPreflightContinuation = previous?.status === "FAILED" && /COST_LIMIT_REACHED: el trabajo restante completo/.test(oldError?.message ?? "");
  const attempts = oldInput?.fingerprint === hash ? providerRetrievalContinuation || budgetPreflightContinuation ? (oldInput.attempts ?? 1) : (oldInput.attempts ?? 0) + 1 : 1;
  if (attempts > (key.startsWith("EDITORIAL:") ? 1 : 3)) throw new Error(`STAGE_ATTEMPTS_EXHAUSTED: ${key}`);
  await locked(execution, (tx) => tx.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } }, create: { jobId: execution.jobId, stageKey, status: "RUNNING", progress: 0, startedAt: new Date(), inputJson: json({ fingerprint: hash, attempts }) }, update: { status: "RUNNING", startedAt: new Date(), completedAt: null, inputJson: json({ fingerprint: hash, attempts }), errorJson: Prisma.DbNull } }));
  try {
    const value = await context.run({ ...execution, stage: key }, work);
    const fileHashes = await Promise.all(files(value).map(async (file) => ({ path: file, hash: fingerprint(await readFile(file)) })));
    const checkpoint: Checkpoint<T> = { fingerprint: hash, value, outputHash: fingerprint(value), files: fileHashes, completedAt: new Date().toISOString() };
    await locked(execution, (tx) => tx.blueprintJobStage.update({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } }, data: { status: "COMPLETED", completedAt: new Date(), outputJson: json(checkpoint) } }));
    return value;
  } catch (error) {
    const pending = error instanceof Error && error.name === "ProviderResponsePendingError";
    await locked(execution, (tx) => tx.blueprintJobStage.update({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey } }, data: { status: pending ? "RUNNING" : "FAILED", completedAt: pending ? null : new Date(), errorJson: json({ message: error instanceof Error ? error.message : String(error), ...(pending ? { category: "PROVIDER_RESPONSE_PENDING" } : {}) }) } })).catch(() => undefined);
    throw error;
  }
}
