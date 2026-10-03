import { readFile } from "node:fs/promises";
import { checkpointSettledCost } from "./checkpoint-currency";
import { prisma } from "@/lib/prisma";
import { currentJobExecution, fingerprint, stageCheckpoint, versionedCheckpointKey } from "./job-execution-context";
import { METHOD_DOCUMENT_INSPECTION_VERSION } from "./design-support-document";
import { inspectMethodSupportCandidate } from "./design-support-inspection";
import type { DesignSupportSource } from "./design-support-addendum";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import { DESIGN_MINI_RESEARCH_PURPOSE, type WebDiscoveryResult } from "@/server/retrieval/web-discovery-contract";
import { convergeWebCandidate, type ExistingScientificSource } from "@/server/retrieval/web-candidate-convergence";

export const METHOD_RESEARCH_REINSPECTION_VERSION = "completed-method-research-reinspection.v1";
type Stage = { id: string; stageKey: string; status: string; inputJson?: unknown; outputJson: unknown };
type CostEntry = { id: string; purpose: string; stage: string; paidOperationId?: string; status: string; estimate: number | null; usage: unknown };
type HistoricalOperation = { id: string; userId: string; projectId: string | null; revision: string; requestId: string;
  purpose: string; inputFingerprint: string; status: string; resultJson: unknown;
  calls: Array<{ id: string; status: string; estimatedMicros: number | null; usageJson: unknown; attributionJson: unknown }> };
type Envelope = { fingerprint: string; value: { source?: DesignSupportSource | null; acquired?: boolean; inspectionVersion?: string; reason?: string | null; manifest?: unknown };
  outputHash: string; files: Array<{ path: string; hash: string }> };
export type RecoveredMethodResearch = {
  support: DesignSupportSource[];
  operations: Array<{ operationId: string; estimatedCostUsd: number | null; estimatedCostMicros: number | null; usage: unknown; state: string }>;
  researchOperations: number; acquiredDocuments: number;
  researchAudit: Array<{ ordinal: number; gapIds: string[]; originalQuestionAvailable: false;
    operationIds: string[]; requestId: string; discoveryInputFingerprint: string; resultFingerprint: string;
    inspectionVersion: string; status: string; addedSources: string[]; historicalAcquiredDocuments: number;
    additionalAcquiredDocuments: number; networkAcquisitions: number; acquiredDocuments: number;
    checkpoints: Array<{ checkpointId: string; inspectedCheckpoint: string; reason: string | null; manifest: unknown }> }>;
};
const empty = (): RecoveredMethodResearch => ({ support: [], operations: [], researchOperations: 0, acquiredDocuments: 0, researchAudit: [] });

/** Pure authority proof. A discovered source never becomes reusable merely by
 * matching a title: its paid call, job cost entry, scope and observations agree. */
export function completedMethodResearchProof(input: { jobId: string; userId: string; projectId: string; intentHash: string;
  stages: Stage[]; operations: HistoricalOperation[] }) {
  const cost = input.stages.find(row => row.stageKey === "control:cost")?.outputJson as { entries?: CostEntry[] } | undefined;
  const entries = (cost?.entries ?? []).filter(entry => entry.purpose === DESIGN_MINI_RESEARCH_PURPOSE &&
    /^METHOD_COVERAGE_RESEARCH_V1_[1-4](?::context:[a-f0-9]+)?$/.test(entry.stage));
  const seenOperations = new Set<string>(), ordinals = new Set<number>();
  return entries.map(entry => {
    const ordinal = Number(/^METHOD_COVERAGE_RESEARCH_V1_(\d+)/.exec(entry.stage)![1]);
    const operation = input.operations.find(op => op.id === entry.paidOperationId);
    const call = operation?.calls.find(item => item.id === entry.id);
    const attribution = call?.attributionJson as { jobId?: string; funding?: string } | undefined;
    const discovery = operation?.resultJson as WebDiscoveryResult | null;
    if (!operation || operation.userId !== input.userId || operation.projectId !== input.projectId ||
      operation.purpose !== DESIGN_MINI_RESEARCH_PURPOSE || operation.revision !== input.intentHash ||
      operation.status !== "COMPLETED" || !/^design-web:[a-f0-9]{64}$/.test(operation.requestId) ||
      !/^[a-f0-9]{64}$/.test(operation.inputFingerprint) || !call || call.status !== "COMPLETED" ||
      attribution?.jobId !== input.jobId || attribution.funding !== "JOB_LINKED" ||
      entry.status !== "completed" || entry.estimate === null || !Number.isFinite(entry.estimate) ||
      call.estimatedMicros !== Math.round(entry.estimate * 1_000_000) ||
      !entry.usage || fingerprint(entry.usage) !== fingerprint(call.usageJson) ||
      !discovery || discovery.schemaVersion !== "web-discovery-result.v1" ||
      discovery.operationId !== operation.id || !discovery.responseId ||
      !["COMPLETED", "PARTIAL"].includes(discovery.state) || discovery.estimatedCostUsd === null ||
      Math.round(discovery.estimatedCostUsd * 1_000_000) !== call.estimatedMicros ||
      !discovery.usage || Object.entries(discovery.usage).some(([key, value]) => (entry.usage as Record<string, unknown>)[key] !== value) || !Array.isArray(discovery.candidates) ||
      !Array.isArray(discovery.observations) || discovery.diagnostics?.toolLimit?.accepted !== true)
      throw new Error("METHOD_RESEARCH_RECOVERY_PROVENANCE_INVALID");
    if (seenOperations.has(operation.id) || ordinals.has(ordinal)) throw new Error("METHOD_RESEARCH_RECOVERY_IDENTITY_CONFLICT");
    seenOperations.add(operation.id); ordinals.add(ordinal);
    return { ordinal, operation, discovery, estimatedCostMicros: call.estimatedMicros };
  }).sort((a, b) => a.ordinal - b.ordinal);
}

async function validEnvelope(row: Stage, expectedInput: string): Promise<Envelope | null> {
  const saved = row.outputJson as Envelope | null;
  if (row.status !== "COMPLETED" || !saved || saved.fingerprint !== expectedInput ||
    fingerprint(saved.value) !== saved.outputHash || !Array.isArray(saved.files)) return null;
  try { for (const file of saved.files) if (fingerprint(await readFile(file.path)) !== file.hash) return null; }
  catch { return null; }
  return saved;
}

/** Re-inspect prior, already paid discoveries without entering the provider or
 * paid preflight path. The old aggregate checkpoint is deliberately irrelevant:
 * it may be corrupt, while the independently settled discovery remains sound. */
export async function recoverCompletedMethodResearch(input: { userId: string; projectId: string; runId: string;
  bundle: ScientificDecisionBundle }, dependencies: { inspect?: typeof inspectMethodSupportCandidate } = {}): Promise<RecoveredMethodResearch> {
  const execution = currentJobExecution();
  if (!execution) return empty();
  const job = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: execution.jobId }, include: { stages: true } });
  if (job.userId !== input.userId || job.projectId !== input.projectId || (job.stageDataJson as { runId?: string } | null)?.runId !== input.runId)
    throw new Error("METHOD_RESEARCH_RECOVERY_OWNER_MISMATCH");
  const entries = ((job.stages.find(row => row.stageKey === "control:cost")?.outputJson as { entries?: CostEntry[] } | undefined)?.entries ?? []);
  const ids = [...new Set(entries.filter(entry => entry.purpose === DESIGN_MINI_RESEARCH_PURPOSE &&
    entry.stage.startsWith("METHOD_COVERAGE_RESEARCH_V1_")).flatMap(entry => entry.paidOperationId ? [entry.paidOperationId] : []))];
  const operations = await prisma.paidOperation.findMany({ where: { id: { in: ids } }, include: { calls: true } });
  const intentHash = fingerprint([input.bundle.contextFingerprint, input.bundle.intent]);
  const proof = completedMethodResearchProof({ jobId: job.id, userId: input.userId, projectId: input.projectId,
    intentHash, stages: job.stages, operations });
  const recovered = empty();
  if (!proof.length) return recovered;
  // Never reuse an ordinal already consumed, even if an earlier ordinal is absent.
  recovered.researchOperations = Math.max(...proof.map(item => item.ordinal));
  const existing: ExistingScientificSource[] = input.bundle.evidence_pack.selected_sources.map(source => ({
    id: source.source_id, title: source.title, authors: [], year: source.year, doi: source.doi,
    workType: null, observedUrls: [], selected: true, assessmentValid: true, doiProvenance: "PROVIDER_METADATA" }));
  const work = proof.map(item => ({ ...item, documents: item.discovery.candidates.slice(0, 5).flatMap(candidate => {
    const originalInputs = [undefined, METHOD_DOCUMENT_INSPECTION_VERSION].map(inspectionPolicy => fingerprint({ version: "b4.v1", jobId: job.id,
      inputs: { operationId: item.operation.id, url: candidate.proposal.observedUrl, policy: "design-mini-research.v2",
        ...(inspectionPolicy ? { inspectionPolicy } : {}) } }));
    const rows = job.stages.filter(row => /^checkpoint:METHOD_COVERAGE_DOCUMENT_V1_\d+(?::context:[a-f0-9]+)?$/.test(row.stageKey) &&
      originalInputs.includes((row.outputJson as { fingerprint?: string } | null)?.fingerprint ?? ""));
    if (rows.length > 1) throw new Error("METHOD_RESEARCH_DOCUMENT_IDENTITY_CONFLICT");
    return rows.map(row => ({ candidate, row, originalInput: (row.outputJson as Envelope).fingerprint }));
  }) }));
  // Count prior downloads, including rejected documents, before considering any
  // additional network fetch. Legacy re-fetch cannot claim a free acquisition.
  for (const item of work) for (const doc of item.documents) {
    const old = await validEnvelope(doc.row, doc.originalInput);
    if (!old) throw new Error("METHOD_RESEARCH_DOCUMENT_CHECKPOINT_INVALID");
    if (old.value.acquired) recovered.acquiredDocuments++;
  }
  if (recovered.acquiredDocuments > 4) throw new Error("METHOD_RESEARCH_DOCUMENT_LIMIT_EXCEEDED");
  for (const item of work) {
    const audit: RecoveredMethodResearch["researchAudit"][number] = { ordinal: item.ordinal,
      gapIds: [...new Set(item.discovery.candidates.flatMap(candidate => candidate.proposal.gapIds))],
      originalQuestionAvailable: false, operationIds: [item.operation.id], requestId: item.operation.requestId,
      discoveryInputFingerprint: item.operation.inputFingerprint, resultFingerprint: fingerprint(item.discovery),
      inspectionVersion: METHOD_DOCUMENT_INSPECTION_VERSION, status: "REINSPECTED_COMPLETED_DISCOVERY",
      addedSources: [], historicalAcquiredDocuments: 0, additionalAcquiredDocuments: 0,
      networkAcquisitions: 0, acquiredDocuments: 0, checkpoints: [] };
    for (const doc of item.documents) {
      const old = (await validEnvelope(doc.row, doc.originalInput))!;
      if (old.value.acquired) audit.historicalAcquiredDocuments++;
      if (!old.value.acquired) continue; // A failed HTTP attempt is not a license for blind re-fetch.
      const convergence = convergeWebCandidate({ context: { operationId: item.operation.id, projectId: input.projectId,
        searchIntentHash: intentHash, gapSetHash: item.operation.inputFingerprint,
        discoveredSourcePoolVersion: item.operation.inputFingerprint, currentSourcePoolVersion: item.operation.inputFingerprint,
        allowedGapIds: audit.gapIds }, discovery: item.discovery, candidate: doc.candidate, existing });
      // Original opaque request identity is used only to bind this reinspection;
      // no newly recomputed gap/seen hash is represented as the historical query.
      if (convergence.identityOutcome !== "NEW_SOURCE_CANDIDATE" || !convergence.semanticReviewRequired)
        throw new Error("METHOD_RESEARCH_RECOVERY_OBSERVATION_INVALID");
      // A current-version, hash-verified rejection is already a completed
      // inspection. It must not consume another download merely on restart.
      if (!old.value.source && old.value.inspectionVersion === METHOD_DOCUMENT_INSPECTION_VERSION) {
        audit.checkpoints.push({ checkpointId: doc.row.id, inspectedCheckpoint: doc.row.stageKey,
          reason: old.value.reason ?? "DOCUMENT_PROCEDURAL_SUPPORT_NOT_SUBSTANTIVE", manifest: old.value.manifest ?? null });
        continue;
      }
      const retained = old.value.source ?? undefined;
      const inspectionInput = { version: METHOD_RESEARCH_REINSPECTION_VERSION, inspection: METHOD_DOCUMENT_INSPECTION_VERSION,
        operationId: item.operation.id, originalRequestId: item.operation.requestId, originalInputFingerprint: item.operation.inputFingerprint,
        discoveryFingerprint: audit.resultFingerprint, documentCheckpointId: doc.row.id, originalDocumentInput: doc.originalInput,
        originalDocumentOutput: old.outputHash, observedUrl: doc.candidate.proposal.observedUrl,
        observationIds: convergence.discoveryObservationIds, retainedHash: retained?.document.sha256 ?? null };
      const key = await versionedCheckpointKey(`METHOD_DOCUMENT_REINSPECTION_V2_${fingerprint([item.operation.id, doc.row.id]).slice(0, 20)}`, inspectionInput);
      const inspected = await stageCheckpoint(key, inspectionInput, async () => {
        if (!retained && recovered.acquiredDocuments >= 4) throw new Error("METHOD_RESEARCH_DOCUMENT_LIMIT_EXCEEDED");
        return (dependencies.inspect ?? inspectMethodSupportCandidate)({ ...input, gapId: doc.candidate.proposal.gapIds[0],
          observedUrl: doc.candidate.proposal.observedUrl, expectedTitle: doc.candidate.proposal.identityProposal.title,
          expectedDoi: doc.candidate.proposal.identityProposal.doi,
          // Candidate rationale is discovery metadata, never asserted as the original question or evidence.
          question: doc.candidate.proposal.relevanceProposal.gapCoverage, observationIds: convergence.discoveryObservationIds,
          retainedSource: retained });
      }, result => result.manifest?.privateArtifactPath ? [result.manifest.privateArtifactPath] : []);
      const additional = !retained && inspected.acquired ? 1 : 0;
      recovered.acquiredDocuments += additional; audit.additionalAcquiredDocuments += additional;
      audit.networkAcquisitions += inspected.networkAcquisitions;
      audit.checkpoints.push({ checkpointId: doc.row.id, inspectedCheckpoint: key, reason: inspected.reason, manifest: inspected.manifest });
      if (inspected.source && !recovered.support.some(source => source.document.sha256 === inspected.source!.document.sha256)) {
        recovered.support.push(inspected.source); audit.addedSources.push(inspected.source.sourceId);
      }
    }
    audit.acquiredDocuments = audit.historicalAcquiredDocuments + audit.additionalAcquiredDocuments;
    recovered.researchAudit.push(audit);
    recovered.operations.push({ operationId: item.operation.id, ...checkpointSettledCost(item.estimatedCostMicros),
      usage: item.discovery.usage, state: item.discovery.state });
  }
  return recovered;
}
