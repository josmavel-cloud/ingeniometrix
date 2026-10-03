import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma, type BlueprintJobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeInternalGenerationCapability, INTERNAL_GENERATION_POLICY, reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { assertExpectedGenerationContext, generationContextForUser, type GenerationContext } from "@/server/projects/generation-context-service";
import { researchProjectFingerprint } from "@/server/projects/generation-input-snapshot";
import { activeQaCampaign, assertQaCommitment, qaJobPolicy, QA_COST_POLICY_VERSION } from "./qa-acceptance-policy";
import { fingerprint } from "./job-execution-context";
import { decisionContextFingerprint } from "./scientific-decision-contracts";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import type { DesignSupportSource } from "./design-support-addendum";
import { supportReuseIdentity, verifyReusableSupportSource } from "./design-support-reuse";
import { DESIGN_MINI_RESEARCH_PURPOSE, type WebDiscoveryResult } from "@/server/retrieval/web-discovery-contract";

export const SCIENTIFIC_CONTINUATION_VERSION = "method-coverage-continuation.v1";
export const SCIENTIFIC_CONTINUATION_REASON = "METHOD_COVERAGE_RECONSTRUCTION";
export const SCIENTIFIC_CONTINUATION_GRANT_EVENT = "SCIENTIFIC_CONTINUATION_QA_AUTHORIZED";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const active = ["QUEUED", "RUNNING", "WAITING_NEXT_STAGE", "WAITING_USER_DECISION"] as const;
type Checkpoint = { fingerprint: string; value: unknown; outputHash: string; files: { path: string; hash: string }[] };
type ParentData = { runId: string; inputFingerprint: string; inputSnapshotId: string; expectedContext: GenerationContext;
  step5: { status: string; stepRunId: string; artifactManifestPath: string } };
export type ScientificContinuation = {
  version: typeof SCIENTIFIC_CONTINUATION_VERSION; reason: typeof SCIENTIFIC_CONTINUATION_REASON;
  parentJobId: string; parentRunId: string; parentSnapshotId: string; frozenInputFingerprint: string;
  researchFingerprint: string; effectiveEvidenceFingerprint: string; evidenceLedgerHash: string;
  grantAuditId: string; operationIdentity: string;
  reusedCheckpointIds: Array<{ id: string; stageKey: string; outputHash: string; inputFingerprint: string }>;
};
function permittedCheckpoint(key: string) {
  return key === "checkpoint:EVIDENCE" || key === "checkpoint:SCIENTIFIC_DECISION" ||
    key.startsWith("checkpoint:DESIGN_SUPPORT_") || key.startsWith("checkpoint:DESIGN_MINI_RESEARCH_V2_ACQUISITION3_") ||
    key.startsWith("checkpoint:AUTONOMOUS_DESIGN_PATCH_") || key.startsWith("checkpoint:AUTONOMOUS_DESIGN_TARGETED_CRITIC_");
}
export function validateContinuationCheckpoint(row: Pick<BlueprintJobStage, "status" | "stageKey" | "outputJson">) {
  const saved = row.outputJson as unknown as Checkpoint | null;
  if (row.status !== "COMPLETED" || !permittedCheckpoint(row.stageKey) || !saved?.fingerprint ||
    !saved.outputHash || fingerprint(saved.value) !== saved.outputHash || !Array.isArray(saved.files))
    throw new Error("SCIENTIFIC_CONTINUATION_CHECKPOINT_INVALID");
  return saved;
}
async function validateFiles(saved: Checkpoint) {
  for (const file of saved.files) if (fingerprint(await readFile(file.path)) !== file.hash)
    throw new Error("SCIENTIFIC_CONTINUATION_ARTIFACT_CHANGED");
}
function sourceValues(value: unknown): DesignSupportSource[] {
  const raw = value as { support?: unknown[]; source?: unknown } | null;
  const values = Array.isArray(value) ? value : Array.isArray(raw?.support) ? raw.support : raw?.source ? [raw.source] : [];
  return values.filter((v): v is DesignSupportSource => Boolean(v && typeof v === "object" &&
    (v as DesignSupportSource).provenance === "SYSTEM_DESIGN_SUPPORT" && (v as DesignSupportSource).document?.passages));
}

async function inspectParent(userId: string, projectId: string, parentJobId: string) {
  const parent = await prisma.blueprintJob.findFirst({ where: { id: parentJobId, userId, projectId },
    include: { inputSnapshots: true, stages: { orderBy: { completedAt: "desc" } } } });
  if (!parent) throw new Error("PROJECT_NOT_FOUND");
  const data = parent.stageDataJson as unknown as ParentData;
  const metadata = parent.metadataJson as { scientificProfile?: string; commercialPolicy?: string; qaCampaignId?: string;
    scientificContinuation?: unknown } | null;
  if (parent.status !== "FAILED" || parent.currentStage !== "resolving_design" || parent.lockedAt ||
    (parent.errorJson as { category?: string } | null)?.category !== "SCIENTIFIC_INSUFFICIENCY" ||
    metadata?.scientificProfile !== "rc4" || metadata.commercialPolicy !== INTERNAL_GENERATION_POLICY ||
    metadata.scientificContinuation || !data?.runId || !data.inputFingerprint || !data.expectedContext || !data.step5?.stepRunId)
    throw new Error("SCIENTIFIC_CONTINUATION_NOT_ELIGIBLE");
  const snapshot = parent.inputSnapshots.find(row => row.id === data.inputSnapshotId);
  const payload = snapshot?.payloadJson as unknown as { project: Record<string, any>; evidenceSet?: { id: string; contentHash: string; snapshotJson: unknown } };
  if (!snapshot || fingerprint(snapshot.payloadJson) !== snapshot.contentHash || payload.project.id !== projectId ||
    payload.project.userId !== userId || researchProjectFingerprint(payload.project) !== data.inputFingerprint ||
    !payload.evidenceSet || fingerprint(payload.evidenceSet.snapshotJson) !== payload.evidenceSet.contentHash)
    throw new Error("SCIENTIFIC_CONTINUATION_SNAPSHOT_INVALID");
  const stages = parent.stages.filter(row => row.status === "COMPLETED" && permittedCheckpoint(row.stageKey));
  for (const row of stages) await validateFiles(validateContinuationCheckpoint(row));
  const evidence = stages.find(row => row.stageKey === "checkpoint:EVIDENCE");
  const decision = stages.find(row => row.stageKey === "checkpoint:SCIENTIFIC_DECISION");
  if (!evidence || !decision) throw new Error("SCIENTIFIC_CONTINUATION_CHECKPOINT_MISSING");
  const bundle = validateContinuationCheckpoint(decision).value as ScientificDecisionBundle;
  const { decisionFingerprint: decisionHash, ...decisionValue } = bundle;
  if (fingerprint(decisionValue) !== decisionHash) throw new Error("SCIENTIFIC_CONTINUATION_DECISION_CORRUPT");
  const extraction = validateContinuationCheckpoint(evidence).value as { project_id: string; step_run_id: string };
  const ledgerRow = await prisma.projectEvidenceLedger.findFirst({ where: { projectId, stepRunId: data.step5.stepRunId } });
  const ledger = ledgerRow?.ledgerJson as unknown as MvpStep5EvidenceLedger;
  if (!ledger || ledger.project_id !== projectId || ledger.step_run_id !== data.step5.stepRunId ||
    extraction.project_id !== projectId || extraction.step_run_id !== data.step5.stepRunId ||
    decisionContextFingerprint(payload.project.intake, ledger) !== bundle.contextFingerprint)
    throw new Error("SCIENTIFIC_CONTINUATION_EVIDENCE_MISMATCH");
  const cost = parent.stages.find(row => row.stageKey === "control:cost")?.outputJson as { entries?: Array<{ status: string; estimate: number | null }> } | null;
  if (!cost?.entries || cost.entries.some(entry => entry.status !== "completed" || entry.estimate === null || !Number.isFinite(entry.estimate)))
    throw new Error("SCIENTIFIC_CONTINUATION_USAGE_UNCERTAIN");
  if (parent.stages.some(row => row.stageKey.startsWith("provider:background:") &&
      (row.outputJson as { status?: string } | null)?.status !== "COMPLETED"))
    throw new Error("SCIENTIFIC_CONTINUATION_RESPONSE_UNCERTAIN");
  const digest = stages.find(row => row.stageKey.startsWith("checkpoint:DESIGN_SUPPORT_DIGEST_"));
  const effectiveEvidenceFingerprint = digest
    ? (validateContinuationCheckpoint(digest).value as { effectiveEvidenceFingerprint: string }).effectiveEvidenceFingerprint
    : bundle.contextFingerprint;
  if (!effectiveEvidenceFingerprint) throw new Error("SCIENTIFIC_CONTINUATION_EVIDENCE_IDENTITY_MISSING");
  return { parent, data, metadata, snapshot, payload, stages, bundle, ledger, effectiveEvidenceFingerprint };
}

// Trusted operations entry only. No browser endpoint can create funding authority.
// One grant authorizes one child identity; history/counters and historical costs remain untouched.
export async function authorizeScientificContinuationQa(input: { userId: string; projectId: string; parentJobId: string;
  issuedBy: string; reason: string; extendCampaign48Hours?: boolean }) {
  if (!input.issuedBy.trim() || !input.reason.trim()) throw new Error("SCIENTIFIC_CONTINUATION_AUTHORITY_REQUIRED");
  const inspected = await inspectParent(input.userId, input.projectId, input.parentJobId);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`;
    if (!await activeInternalGenerationCapability(input.userId, tx)) throw new Error("INTERNAL_GENERATION_CAPABILITY_REQUIRED");
    const campaign = await tx.qaAcceptanceCampaign.findFirst({ where: { id: inspected.metadata!.qaCampaignId, userId: input.userId, status: "ACTIVE" } });
    if (!inspected.metadata?.qaCampaignId || !campaign) throw new Error("QA_AUTHORIZATION_REQUIRED");
    await tx.$queryRaw`SELECT id FROM "QaAcceptanceCampaign" WHERE id = ${campaign.id} FOR UPDATE`;
    const prior = await tx.auditLog.findFirst({ where: { userId: input.userId, projectId: input.projectId,
      eventType: SCIENTIFIC_CONTINUATION_GRANT_EVENT, payloadJson: { path: ["parentJobId"], equals: input.parentJobId } } });
    if (prior) return prior;
    const expiresAt = input.extendCampaign48Hours ? new Date(campaign.expiresAt.getTime() + 48 * 3600_000) : campaign.expiresAt;
    if (expiresAt <= new Date()) throw new Error("QA_AUTHORIZATION_EXPIRED_OR_INVALID");
    if (input.extendCampaign48Hours) {
      await tx.qaAcceptanceCampaign.update({ where: { id: campaign.id }, data: { expiresAt } });
      await tx.auditLog.create({ data: { userId: input.userId, projectId: input.projectId, actorType: "SYSTEM",
        eventType: "QA_CAMPAIGN_EXPIRY_EXTENDED", payloadJson: json({ version: SCIENTIFIC_CONTINUATION_VERSION,
          campaignId: campaign.id, issuedBy: input.issuedBy, reason: input.reason,
          previousExpiresAt: campaign.expiresAt.toISOString(), expiresAt: expiresAt.toISOString(),
          budgetsUnchanged: true, historicalUsageUnchanged: true }) } });
    }
    return tx.auditLog.create({ data: { userId: input.userId, projectId: input.projectId, actorType: "SYSTEM",
      eventType: SCIENTIFIC_CONTINUATION_GRANT_EVENT, payloadJson: json({ version: SCIENTIFIC_CONTINUATION_VERSION,
        reason: SCIENTIFIC_CONTINUATION_REASON, authorizationReason: input.reason, issuedBy: input.issuedBy,
        parentJobId: input.parentJobId, projectId: input.projectId, campaignId: campaign.id,
        frozenInputFingerprint: inspected.snapshot.contentHash, maxContinuations: 1,
        expiresAt: expiresAt.toISOString(), previousAttempts: inspected.parent.attempts,
        previousMaxAttempts: inspected.parent.maxAttempts, historicalUsageUnchanged: true }) } });
  });
}

export async function enqueueScientificContinuationForUser(userId: string, projectId: string, parentJobId: string) {
  // All filesystem verification is outside the short transaction; hashes are checked again at execution.
  const inspected = await inspectParent(userId, projectId, parentJobId);
  const operationIdentity = fingerprint({ version: SCIENTIFIC_CONTINUATION_VERSION, parentJobId, userId,
    projectId, frozenInputFingerprint: inspected.snapshot.contentHash });
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    const existing = await tx.blueprintJob.findFirst({ where: { userId, projectId,
      metadataJson: { path: ["scientificContinuation", "operationIdentity"], equals: operationIdentity } } });
    if (existing) return { jobId: existing.id, status: existing.status, reused: true };
    const parent = await tx.blueprintJob.findFirstOrThrow({ where: { id: parentJobId, userId, projectId } });
    if (parent.updatedAt.getTime() !== inspected.parent.updatedAt.getTime()) throw new Error("SCIENTIFIC_CONTINUATION_PARENT_CHANGED");
    if (await tx.blueprintJob.count({ where: { userId, projectId, status: { in: [...active] } } })) throw new Error("SCIENTIFIC_CONTINUATION_COMPETING_JOB");
    if (!await activeInternalGenerationCapability(userId, tx)) throw new Error("INTERNAL_GENERATION_CAPABILITY_REQUIRED");
    const campaign = await activeQaCampaign(tx, userId);
    if (!campaign || campaign.id !== inspected.metadata!.qaCampaignId) throw new Error("QA_AUTHORIZATION_REQUIRED");
    const grant = await tx.auditLog.findFirst({ where: { userId, projectId, eventType: SCIENTIFIC_CONTINUATION_GRANT_EVENT,
      payloadJson: { path: ["parentJobId"], equals: parentJobId } }, orderBy: { createdAt: "desc" } });
    const authorization = grant?.payloadJson as { version?: string; campaignId?: string; frozenInputFingerprint?: string;
      expiresAt?: string; maxContinuations?: number } | null;
    if (!grant || authorization?.version !== SCIENTIFIC_CONTINUATION_VERSION || authorization.campaignId !== campaign.id ||
      authorization.frozenInputFingerprint !== inspected.snapshot.contentHash || authorization.maxContinuations !== 1 ||
      !authorization.expiresAt || new Date(authorization.expiresAt) <= new Date()) throw new Error("SCIENTIFIC_CONTINUATION_NOT_AUTHORIZED");
    const currentContext = await generationContextForUser(userId, projectId, tx);
    assertExpectedGenerationContext(inspected.data.expectedContext, currentContext);
    if (currentContext.evidenceSetId !== inspected.payload.evidenceSet!.id) throw new Error("EVIDENCE_SET_CHANGED");
    const currentEvidence = await tx.projectEvidenceSet.findFirst({ where: { id: currentContext.evidenceSetId, projectId, createdBy: userId },
      select: { contentHash: true, snapshotJson: true } });
    if (!currentEvidence || currentEvidence.contentHash !== inspected.payload.evidenceSet!.contentHash ||
      fingerprint(currentEvidence.snapshotJson) !== currentEvidence.contentHash) throw new Error("EVIDENCE_SET_CHANGED");
    const live = await tx.project.findFirstOrThrow({ where: { id: projectId, userId },
      include: { intake: true, projectReferences: { where: { selected: true }, orderBy: { id: "asc" } } } });
    if (researchProjectFingerprint(live) !== inspected.data.inputFingerprint) throw new Error("INPUT_CHANGED");
    await assertQaCommitment(tx, userId, campaign.jobCapMicros / 1e6);
    const id = randomUUID();
    const contract: ScientificContinuation = { version: SCIENTIFIC_CONTINUATION_VERSION, reason: SCIENTIFIC_CONTINUATION_REASON,
      parentJobId, parentRunId: inspected.data.runId, parentSnapshotId: inspected.snapshot.id,
      frozenInputFingerprint: inspected.snapshot.contentHash, researchFingerprint: inspected.data.inputFingerprint,
      effectiveEvidenceFingerprint: inspected.effectiveEvidenceFingerprint, evidenceLedgerHash: fingerprint(inspected.ledger),
      grantAuditId: grant.id, operationIdentity,
      reusedCheckpointIds: inspected.stages.map(row => { const saved = validateContinuationCheckpoint(row);
        return { id: row.id, stageKey: row.stageKey, outputHash: saved.outputHash, inputFingerprint: saved.fingerprint }; }) };
    const job = await tx.blueprintJob.create({ data: { id, userId, projectId, status: "QUEUED", currentStage: "resolving_design",
      progress: 50, language: parent.language, runnerKind: "database-worker", maxAttempts: 3,
      metadataJson: json({ engine: "canonical-mvp-step5-step6", privateArtifacts: true, executionPolicy: "b4.v1",
        scientificProfile: "rc4", commercialPolicy: INTERNAL_GENERATION_POLICY, costPolicyVersion: QA_COST_POLICY_VERSION,
        qaCampaignId: campaign.id, scientificContinuation: contract }) } });
    // This is a new immutable provenance record of inherited input, not a copied scientific execution/checkpoint.
    const snapshot = await tx.generationInputSnapshot.create({ data: { jobId: id, revision: 1,
      draftId: inspected.snapshot.draftId, draftRevision: inspected.snapshot.draftRevision,
      contentHash: inspected.snapshot.contentHash, payloadJson: inspected.snapshot.payloadJson as Prisma.InputJsonValue } });
    await tx.blueprintJob.update({ where: { id }, data: { stageDataJson: json({ runId: `secure-pilot-${id}`,
      inputFingerprint: inspected.data.inputFingerprint, inputSnapshotId: snapshot.id,
      expectedContext: inspected.data.expectedContext, operationId: operationIdentity, step5: inspected.data.step5 }) } });
    await reserveInternalGenerationJob(tx, id);
    await tx.project.update({ where: { id: projectId }, data: { status: "BLUEPRINT_GENERATING" } });
    await tx.auditLog.create({ data: { userId, projectId, actorType: "USER", eventType: "SCIENTIFIC_CONTINUATION_ENQUEUED",
      payloadJson: json({ jobId: id, ...contract, originalAttemptsUnchanged: true, newCallsAttributedToChild: true,
        checkpointValuesCopied: false, priorUsageCopied: false }) } });
    return { jobId: job.id, status: job.status, reused: false };
  });
}

export async function readScientificContinuation(jobId: string) {
  const child = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: jobId }, include: { inputSnapshots: true } });
  const contract = (child.metadataJson as { scientificContinuation?: ScientificContinuation } | null)?.scientificContinuation;
  if (!contract) return null;
  if (contract.version !== SCIENTIFIC_CONTINUATION_VERSION || contract.reason !== SCIENTIFIC_CONTINUATION_REASON)
    throw new Error("SCIENTIFIC_CONTINUATION_VERSION_INVALID");
  await qaJobPolicy(prisma, jobId);
  const inspected = await inspectParent(child.userId, child.projectId, contract.parentJobId);
  const data = child.stageDataJson as unknown as ParentData;
  const snapshot = child.inputSnapshots.find(row => row.id === data.inputSnapshotId);
  if (!snapshot || snapshot.contentHash !== contract.frozenInputFingerprint || fingerprint(snapshot.payloadJson) !== snapshot.contentHash ||
    inspected.snapshot.id !== contract.parentSnapshotId || inspected.snapshot.contentHash !== snapshot.contentHash ||
    inspected.data.runId !== contract.parentRunId || inspected.data.inputFingerprint !== contract.researchFingerprint ||
    fingerprint(inspected.ledger) !== contract.evidenceLedgerHash || inspected.effectiveEvidenceFingerprint !== contract.effectiveEvidenceFingerprint ||
    data.step5.stepRunId !== inspected.data.step5.stepRunId || data.runId === inspected.data.runId)
    throw new Error("SCIENTIFIC_CONTINUATION_INHERITANCE_INVALID");
  if (contract.reusedCheckpointIds.length !== inspected.stages.length) throw new Error("SCIENTIFIC_CONTINUATION_CHECKPOINT_SET_CHANGED");
  for (const expected of contract.reusedCheckpointIds) {
    const row = inspected.stages.find(stage => stage.id === expected.id && stage.stageKey === expected.stageKey);
    if (!row) throw new Error("SCIENTIFIC_CONTINUATION_CHECKPOINT_MISSING");
    const saved = validateContinuationCheckpoint(row);
    if (saved.outputHash !== expected.outputHash || saved.fingerprint !== expected.inputFingerprint)
      throw new Error("SCIENTIFIC_CONTINUATION_CHECKPOINT_CHANGED");
  }
  return { contract, parentJob: inspected.parent, decision: inspected.bundle, ledger: inspected.ledger,
    evidenceCheckpoint: validateContinuationCheckpoint(inspected.stages.find(row => row.stageKey === "checkpoint:EVIDENCE")!).value,
    reusedStages: inspected.stages };
}

// Derive an explicitly inherited support set. Every byte hash and completed web
// observation is checked; passage/source identities remain stable. New addenda are sealed for the child.
export async function inheritedDesignSupport(jobId: string): Promise<DesignSupportSource[]> {
  const continuation = await readScientificContinuation(jobId);
  if (!continuation) return [];
  return loadInheritedSupport(continuation.parentJob, continuation.reusedStages, continuation.contract.parentSnapshotId);
}
async function loadInheritedSupport(parentJob: Awaited<ReturnType<typeof inspectParent>>["parent"],
  reusedStages: BlueprintJobStage[], parentSnapshotId: string): Promise<DesignSupportSource[]> {
  const snapshot = parentJob.inputSnapshots.find(row => row.id === parentSnapshotId)!;
  const identity = supportReuseIdentity(snapshot.payloadJson as Parameters<typeof supportReuseIdentity>[0], parentJob);
  if (!identity) throw new Error("SCIENTIFIC_CONTINUATION_SUPPORT_IDENTITY_INVALID");
  const operations = await prisma.paidOperation.findMany({ where: { userId: parentJob.userId, projectId: parentJob.projectId,
    purpose: DESIGN_MINI_RESEARCH_PURPOSE, status: "COMPLETED" }, select: { id: true, resultJson: true } });
  const sources: DesignSupportSource[] = [];
  for (const row of reusedStages) for (const source of sourceValues(validateContinuationCheckpoint(row).value)) {
    // Latest inspected version wins for identical document bytes; the old version stays in parent checkpoints.
    if (sources.some(prior => prior.document.sha256 === source.document.sha256)) continue;
    const operation = operations.find(op => {
      const result = op.resultJson as unknown as WebDiscoveryResult | null;
      const completed = new Set(result?.diagnostics?.response?.webSearchCalls.filter(call =>
        call.status === "completed" && call.actionType === "search").map(call => call.id));
      return result?.operationId === op.id && result.diagnostics?.toolLimit?.accepted === true &&
        source.observationIds.every(id => result.observations?.some(o => o.observationId === id && completed.has(o.toolCallId)));
    });
    if (!operation || !await verifyReusableSupportSource(source, operation.resultJson as unknown as WebDiscoveryResult))
      throw new Error("SCIENTIFIC_CONTINUATION_SUPPORT_PROVENANCE_INVALID");
    sources.push({ ...source, reusedFrom: { policyVersion: SCIENTIFIC_CONTINUATION_VERSION, jobId: parentJob.id,
      checkpointId: row.id, checkpointHash: validateContinuationCheckpoint(row).outputHash,
      originalGapId: source.gapId, scientificIdentityHash: identity, discoveryOperationId: operation.id } });
  }
  return sources;
}

/** Read-only preflight for operations: validates actual stored artifacts without granting or enqueueing. */
export async function inspectScientificContinuationReadiness(userId: string, projectId: string, parentJobId: string) {
  const inspected = await inspectParent(userId, projectId, parentJobId);
  const sources = await loadInheritedSupport(inspected.parent, inspected.stages, inspected.snapshot.id);
  return { parentJobId, attempts: inspected.parent.attempts, maxAttempts: inspected.parent.maxAttempts,
    frozenInputFingerprint: inspected.snapshot.contentHash, ledgerFingerprint: fingerprint(inspected.ledger),
    effectiveEvidenceFingerprint: inspected.effectiveEvidenceFingerprint,
    completedCheckpointCount: inspected.stages.length,
    sources: sources.map(source => ({ sourceId: source.sourceId, sha256: source.document.sha256,
      passageCount: source.document.passages.length, locatorCount: source.document.passages.filter(p => p.locator).length,
      provenance: source.provenance })) };
}
