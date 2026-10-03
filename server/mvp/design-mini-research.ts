import { prisma } from "@/lib/prisma";
import { checkpointSettledCost } from "./checkpoint-currency";
import { fingerprint, stageCheckpoint, versionedCheckpointKey } from "./job-execution-context";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import { DESIGN_MINI_RESEARCH_PURPOSE } from "@/server/retrieval/web-discovery-contract";
import { runWebDiscoveryOperation, readCompletedWebDiscovery } from "@/server/retrieval/web-discovery-operation";
import { createOpenAiWebDiscoveryProvider } from "@/server/retrieval/web-discovery-provider";
import { convergeWebCandidate, type ExistingScientificSource } from "@/server/retrieval/web-candidate-convergence";
import { METHOD_DOCUMENT_INSPECTION_VERSION } from "./design-support-document";
import { inspectMethodSupportCandidate } from "./design-support-inspection";
export { recoverCompletedMethodResearch } from "./design-mini-research-recovery";
import type { DesignSupportSource } from "./design-support-addendum";
import { designSupportGaps, type DesignSupportGap } from "./design-support-gap";
export { designSupportGaps } from "./design-support-gap";
import { normalizeConcept } from "@/lib/retrieval-scientific-concepts";
import { normalizePublicWebUrl } from "@/server/retrieval/web-discovery-validation";

export const DESIGN_MINI_RESEARCH_POLICY = { version: "design-mini-research.v2", maxOperations: 2, maxToolCalls: 2, maxCandidates: 5, maxDocuments: 4, maxOutputTokens: 4096 } as const;
type VerifiedSupport = DesignSupportSource;
export type DesignMiniResearchResult = {
  status: "NOT_NEEDED" | "NO_SAFE_CONTEXT" | "VERIFIED_SUPPORT" | "LIMITED";
  support: VerifiedSupport[]; limitations: string[];
  operations: Array<{ operationId: string; estimatedCostUsd: number | null; usage: unknown; state: string }>;
  acquiredDocuments?: number;
};

// This is a conservative screening gate, not a claim about full-text quality.
// The independent design critic still decides whether the source can support a
// specific methodological assertion. Ambiguous metadata stays out of support.
export function designSupportMetadataEligible(input: { title: string; abstract: string | null; doi: string | null;
  venue: string | null; observedUrl: string; requestedUrl: string; method: string; object: string }) {
  if (!input.abstract || input.abstract.trim().length < 80 || !(input.doi || input.venue)) return false;
  const observed = normalizePublicWebUrl(input.observedUrl);
  if (!observed || observed !== normalizePublicWebUrl(input.requestedUrl)) return false;
  const words = (value: string) => new Set(normalizeConcept(value).split(" ").filter(word => word.length >= 5));
  const body = words(`${input.title} ${input.abstract}`);
  const relevant = (value: string) => [...words(value)].some(word => body.has(word));
  return relevant(input.method) && relevant(input.object);
}
// A web proposal is never promoted into the user's selected EvidenceSet. Only
// independently observed bibliographic metadata with a real abstract can be
// offered as separate, inspectable design support.
export async function researchDesignSupport(input: { userId: string; projectId: string; runId: string; bundle: ScientificDecisionBundle; gaps?: DesignSupportGap[]; operationOrdinal?: 1 | 2; methodCoverage?: { version: "method-coverage-reconstruction.v1"; ordinal: number; cellIds: string[]; documentAllowance: number }; knownSupport?: DesignSupportSource[]; focusedQuestion?: string; beforeDiscovery?: () => Promise<void> }, dependencies: { readCompleted?: typeof readCompletedWebDiscovery } = {}): Promise<DesignMiniResearchResult> {
  const { bundle } = input;
  const material = (input.gaps ?? designSupportGaps(bundle)).slice(0, 1);
  const closure = input.methodCoverage;
  if (closure && (closure.version !== "method-coverage-reconstruction.v1" || !Number.isInteger(closure.ordinal) || closure.ordinal < 1 || closure.ordinal > 4 || !closure.cellIds.length || closure.documentAllowance < 0 || closure.documentAllowance > 4)) throw new Error("METHOD_COVERAGE_RESEARCH_POLICY_INVALID");
  const ordinal = closure?.ordinal ?? input.operationOrdinal ?? 1;
  const cycle = closure ? `METHOD_COVERAGE_RESEARCH_V1_${ordinal}` : `DESIGN_MINI_RESEARCH_V2_ACQUISITION3_${ordinal}`;
  const selected = bundle.decision.alternatives.find(item => item.id === bundle.decision.recommended_id);
  const method = selected && "primary_method" in selected ? String(selected.primary_method) : "";
  const object = bundle.intent.unit_population_corpus || bundle.intent.scope;
  if (!material.length) return { status: "NOT_NEEDED" as const, support: [] as VerifiedSupport[], limitations: [] as string[], operations: [] as Array<{ operationId: string; estimatedCostUsd: number | null; usage: unknown; state: string }> };
  const intentHash = fingerprint([bundle.contextFingerprint, bundle.intent]);
  const scientificSignals = [
    ["topic", bundle.intent.user_statements.topic], ["problem", bundle.intent.problem], ["purpose", bundle.intent.expected_outcome],
    ["object", bundle.intent.unit_population_corpus], ["concepts", bundle.intent.user_statements.constructs],
  ].filter((item): item is [string, string] => typeof item[1] === "string" && Boolean(item[1].trim()))
    .slice(0, 12).map(([field, value]) => ({ field, value: value.slice(0, 400) }));
  if (!scientificSignals.length) return { status: "NO_SAFE_CONTEXT" as const, support: [] as VerifiedSupport[], limitations: ["No se pudo formular una búsqueda técnica sin cambiar el alcance confirmado."], operations: [] as Array<{ operationId: string; estimatedCostUsd: number | null; usage: unknown; state: string }> };
  const known = [...bundle.evidence_pack.selected_sources.slice(0, 30).map(source => ({ doi: source.doi ?? undefined, title: source.title })),
    ...(input.knownSupport ?? []).map(source => ({ doi: source.doi ?? undefined, title: source.title, url: source.document.finalUrl }))];
  const existing: ExistingScientificSource[] = bundle.evidence_pack.selected_sources.map(source => ({ id: source.source_id, title: source.title, authors: [], year: source.year, doi: source.doi, workType: null, observedUrls: [], selected: true, assessmentValid: true, doiProvenance: "PROVIDER_METADATA" }));
  existing.push(...(input.knownSupport ?? []).map(source => ({ id: source.sourceId, title: source.title, authors: source.authors,
    year: source.year, doi: source.doi, workType: null, observedUrls: [source.document.observedUrl, source.document.finalUrl],
    selected: false, assessmentValid: false, doiProvenance: "VERIFIED_IDENTITY" as const })));
  const sourcePoolVersion = fingerprint(known);
  const support: VerifiedSupport[] = [];
  const limitations: string[] = [];
  const operations: Array<{ operationId: string; estimatedCostUsd: number | null; usage: unknown; state: string }> = [];
  let acquiredDocuments = 0;
  for (const [index, finding] of material.entries()) {
    const gapId = finding.gapId;
    const gap = { gapId, searchIntentHash: intentHash, kind: "EVIDENCE" as const, importance: "MATERIAL" as const,
      requiredDimension: !closure && ordinal === 1 ? finding.question.slice(0, 700) : `${finding.question} Brecha restante del dictamen independiente: ${input.focusedQuestion ?? finding.searchProjection}`, desiredEvidenceRole: "METHODOLOGICAL" as const,
      preferredSourceTypes: ["SCHOLARLY" as const, "STANDARD_OR_CODE" as const], unresolvedPremises: [], webDiscoveryEligible: true };
    const gapSetHash = fingerprint([bundle.decisionFingerprint, gapId, finding, gap.requiredDimension, ordinal, ...(closure ? [closure.version, closure.cellIds, input.runId] : [])]);
    try {
      const checkpointInput = { policy: DESIGN_MINI_RESEARCH_POLICY, gapSetHash, sourcePoolVersion, inspectionPolicy: METHOD_DOCUMENT_INSPECTION_VERSION };
      // A different scientific gap gets a content-addressed checkpoint. Failed
      // pre-dispatch inputs remain inspectable instead of being overwritten.
      const checkpointKey = await versionedCheckpointKey(cycle, checkpointInput);
      const verified = await stageCheckpoint(checkpointKey, checkpointInput, async () => {
        const discoveryInput = { userId: input.userId, projectId: input.projectId, smoke: false,
          purpose: DESIGN_MINI_RESEARCH_PURPOSE as typeof DESIGN_MINI_RESEARCH_PURPOSE, gapSetHash, seenSetHash: sourcePoolVersion,
          researchIntentProjection: { searchIntentHash: intentHash, scientificSignals }, evidenceGaps: [gap],
          seenSourceIdentities: known, policy: { maxToolCalls: DESIGN_MINI_RESEARCH_POLICY.maxToolCalls,
            maxCandidates: DESIGN_MINI_RESEARCH_POLICY.maxCandidates, maxOutputTokens: DESIGN_MINI_RESEARCH_POLICY.maxOutputTokens },
          provider: { discover: async () => { throw new Error("CACHED_DISCOVERY_MUST_NOT_DISPATCH"); } } };
        let discovery = await (dependencies.readCompleted ?? readCompletedWebDiscovery)(discoveryInput);
        if (!discovery) {
          await input.beforeDiscovery?.();
          const key = process.env.OPENAI_API_KEY;
          if (!key) throw new Error("DESIGN_MINI_RESEARCH_PROVIDER_UNAVAILABLE");
          discovery = await runWebDiscoveryOperation({ ...discoveryInput, provider: createOpenAiWebDiscoveryProvider({ apiKey: key }) });
        }
        const calls = await prisma.paidOperationCall.findMany({ where: { operationId: discovery.operationId },
          select: { estimatedMicros: true, status: true } });
        if (discovery.estimatedCostUsd !== null && (!calls.length || calls.some(call => call.status !== "COMPLETED" || call.estimatedMicros === null)))
          throw new Error("METHOD_RESEARCH_SETTLED_COST_UNVERIFIED");
        const operation = { operationId: discovery.operationId,
          ...checkpointSettledCost(discovery.estimatedCostUsd === null ? null : calls.reduce((sum, call) => sum + call.estimatedMicros!, 0)),
          usage: discovery.usage, state: discovery.state };
        if (!["COMPLETED", "PARTIAL"].includes(discovery.state)) return { support: [] as VerifiedSupport[], limitation: `Miniinvestigación: ${discovery.state}`, operation, acquiredDocuments: 0 };
        const accepted: VerifiedSupport[] = [];
        let acquisitions = 0, inspectedCandidates = 0;
        for (const candidate of discovery.candidates.slice(0, DESIGN_MINI_RESEARCH_POLICY.maxCandidates)) {
          const convergence = convergeWebCandidate({ context: { operationId: discovery.operationId, projectId: input.projectId,
            searchIntentHash: intentHash, gapSetHash, discoveredSourcePoolVersion: sourcePoolVersion,
            currentSourcePoolVersion: sourcePoolVersion, allowedGapIds: [gapId] }, discovery, candidate, existing });
          if (convergence.identityOutcome !== "NEW_SOURCE_CANDIDATE" || !convergence.semanticReviewRequired) continue;
          // Inspect at most five observed candidates; acquire at most two documents
          // per operation/four per job. An HTTP denial is not an acquired document.
          if (acquisitions >= Math.min(2, closure?.documentAllowance ?? 2)) break;
          const slot = (ordinal - 1) * 5 + ++inspectedCandidates;
          const inspectionInput = { operationId: discovery.operationId, url: candidate.proposal.observedUrl,
            policy: DESIGN_MINI_RESEARCH_POLICY.version, inspectionPolicy: METHOD_DOCUMENT_INSPECTION_VERSION };
          const inspectionKey = await versionedCheckpointKey(closure ? `METHOD_COVERAGE_DOCUMENT_V1_${slot}` : `DESIGN_SUPPORT_DOCUMENT_ACQUISITION3_${slot}`, inspectionInput);
          const inspected = await stageCheckpoint(inspectionKey, inspectionInput, () => inspectMethodSupportCandidate({
            userId: input.userId, projectId: input.projectId, runId: input.runId, gapId,
            observedUrl: candidate.proposal.observedUrl, question: finding.question,
            expectedTitle: candidate.proposal.identityProposal.title, expectedDoi: candidate.proposal.identityProposal.doi,
            observationIds: convergence.discoveryObservationIds,
          }), value => value.manifest?.privateArtifactPath ? [value.manifest.privateArtifactPath] : []);
          if (inspected.acquired) acquisitions++;
          if (inspected.source && !accepted.some(source => source.document.sha256 === inspected.source!.document.sha256)) accepted.push(inspected.source);
        }
        return { support: accepted, limitation: accepted.length ? null : "No se verificó un documento adicional con identidad y pasajes inspeccionables.", operation, acquiredDocuments: acquisitions };
      }, value => value.support.flatMap(source => source.document.privateArtifactPath ? [source.document.privateArtifactPath] : []));
      // Persisted count includes fetched documents later rejected by identity or
      // extraction; the resolver's job-wide limit must not count only accepted sources.
      acquiredDocuments += verified.acquiredDocuments ?? Math.min(2, closure?.documentAllowance ?? 2);
      support.push(...verified.support);
      operations.push(verified.operation);
      if (closure && verified.operation.estimatedCostUsd === null &&
          ["TIMEOUT_UNKNOWN_USAGE", "PROVIDER_UNAVAILABLE", "FAILED_RETRYABLE"].includes(verified.operation.state))
        throw new Error("METHOD_RESEARCH_USAGE_UNCERTAIN");
      if (verified.limitation) limitations.push(verified.limitation);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "DESIGN_MINI_RESEARCH_UNAVAILABLE";
      // This closure requires method support before reconstruction. A financial
      // preflight denial is not exhausted scientific discovery and must preserve
      // the original cause, not lead to four identical denials and a paid patch.
      if (closure && (code === "METHOD_RESEARCH_USAGE_UNCERTAIN" || /COST|BUDGET|CAP|PAID_REQUEST|QA_/.test(code))) throw error;
      limitations.push(/COST|BUDGET|CAP|PAID_REQUEST/.test(code) ? "La miniinvestigación quedó limitada por el presupuesto o una operación pendiente de conciliación." : "La miniinvestigación técnica no produjo evidencia verificable adicional.");
    }
  }
  return { status: support.length ? "VERIFIED_SUPPORT" as const : "LIMITED" as const, support, limitations, operations, acquiredDocuments };
}
