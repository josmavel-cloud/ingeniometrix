import { fingerprint, stageCheckpoint } from "./job-execution-context";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import { DESIGN_MINI_RESEARCH_PURPOSE } from "@/server/retrieval/web-discovery-contract";
import { runWebDiscoveryOperation } from "@/server/retrieval/web-discovery-operation";
import { createOpenAiWebDiscoveryProvider } from "@/server/retrieval/web-discovery-provider";
import { convergeWebCandidate, type ExistingScientificSource } from "@/server/retrieval/web-candidate-convergence";
import path from "node:path";
import { acquireSupportDocument } from "./design-support-document";
import type { DesignSupportSource } from "./design-support-addendum";
import { designSupportGaps, type DesignSupportGap } from "./design-support-gap";
export { designSupportGaps } from "./design-support-gap";
import { normalizeConcept } from "@/lib/retrieval-scientific-concepts";
import { normalizePublicWebUrl } from "@/server/retrieval/web-discovery-validation";

export const DESIGN_MINI_RESEARCH_POLICY = { version: "design-mini-research.v2", maxOperations: 2, maxToolCalls: 2, maxCandidates: 5, maxDocuments: 4 } as const;
type VerifiedSupport = DesignSupportSource;

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
export async function researchDesignSupport(input: { userId: string; projectId: string; runId: string; bundle: ScientificDecisionBundle; gaps?: DesignSupportGap[]; operationOrdinal?: 1 | 2; knownSupport?: DesignSupportSource[] }) {
  const { bundle } = input;
  const material = (input.gaps ?? designSupportGaps(bundle)).slice(0, 1);
  const ordinal = input.operationOrdinal ?? 1;
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
  for (const [index, finding] of material.entries()) {
    const gapId = finding.gapId;
    const gap = { gapId, searchIntentHash: intentHash, kind: "EVIDENCE" as const, importance: "MATERIAL" as const,
      requiredDimension: finding.question.slice(0, 700), desiredEvidenceRole: "METHODOLOGICAL" as const,
      preferredSourceTypes: ["SCHOLARLY" as const, "STANDARD_OR_CODE" as const], unresolvedPremises: [], webDiscoveryEligible: true };
    const gapSetHash = fingerprint([bundle.decisionFingerprint, gapId, finding, gap.requiredDimension, ordinal]);
    try {
      const verified = await stageCheckpoint(`DESIGN_MINI_RESEARCH_V2_ACQUISITION3_${ordinal}`, { policy: DESIGN_MINI_RESEARCH_POLICY, gapSetHash, sourcePoolVersion }, async () => {
        const key = process.env.OPENAI_API_KEY;
        if (!key) throw new Error("DESIGN_MINI_RESEARCH_PROVIDER_UNAVAILABLE");
        const discovery = await runWebDiscoveryOperation({ userId: input.userId, projectId: input.projectId, smoke: false,
          purpose: DESIGN_MINI_RESEARCH_PURPOSE, gapSetHash, seenSetHash: sourcePoolVersion,
          researchIntentProjection: { searchIntentHash: intentHash, scientificSignals }, evidenceGaps: [gap],
          seenSourceIdentities: known, policy: { maxToolCalls: DESIGN_MINI_RESEARCH_POLICY.maxToolCalls,
            maxCandidates: DESIGN_MINI_RESEARCH_POLICY.maxCandidates, maxOutputTokens: 4096 },
          provider: createOpenAiWebDiscoveryProvider({ apiKey: key }) });
        const operation = { operationId: discovery.operationId, estimatedCostUsd: discovery.estimatedCostUsd, usage: discovery.usage, state: discovery.state };
        if (!["COMPLETED", "PARTIAL"].includes(discovery.state)) return { support: [] as VerifiedSupport[], limitation: `Miniinvestigación: ${discovery.state}`, operation };
        const accepted: VerifiedSupport[] = [];
        let acquisitions = 0, inspectedCandidates = 0;
        for (const candidate of discovery.candidates.slice(0, DESIGN_MINI_RESEARCH_POLICY.maxCandidates)) {
          const convergence = convergeWebCandidate({ context: { operationId: discovery.operationId, projectId: input.projectId,
            searchIntentHash: intentHash, gapSetHash, discoveredSourcePoolVersion: sourcePoolVersion,
            currentSourcePoolVersion: sourcePoolVersion, allowedGapIds: [gapId] }, discovery, candidate, existing });
          if (convergence.identityOutcome !== "NEW_SOURCE_CANDIDATE" || !convergence.semanticReviewRequired) continue;
          // Inspect at most five observed candidates; acquire at most two documents
          // per operation/four per job. An HTTP denial is not an acquired document.
          if (acquisitions >= 2) break;
          const slot = (ordinal - 1) * 5 + ++inspectedCandidates;
          const inspected = await stageCheckpoint(`DESIGN_SUPPORT_DOCUMENT_ACQUISITION3_${slot}`, {
            operationId: discovery.operationId, url: candidate.proposal.observedUrl, policy: DESIGN_MINI_RESEARCH_POLICY.version,
          }, async () => {
            try {
              const document = await acquireSupportDocument(candidate.proposal.observedUrl, `${finding.question} ${candidate.proposal.identityProposal.title}`,
                path.resolve("artifacts-local", "design-support", fingerprint([input.userId, input.projectId, input.runId])));
              const expected = normalizeConcept(candidate.proposal.identityProposal.title);
              const observed = normalizeConcept(document.title);
              // Identity is checked against the acquired title. Relevance and
              // methodological applicability remain independent critic decisions.
              if (!expected || !observed || !(observed.includes(expected) || expected.includes(observed)) || !document.passages.length)
                return { source: null, acquired: true, reason: "DOCUMENT_IDENTITY_OR_TEXT_UNVERIFIED" };
              const source: VerifiedSupport = { sourceId: `DS-${fingerprint([input.projectId, input.runId, document.sha256]).slice(0, 20)}`,
                gapId, title: document.title, authors: document.bibliography?.authors ?? [], year: document.bibliography?.year ?? null, doi: document.bibliography?.doi ?? null,
                observationIds: convergence.discoveryObservationIds, document, provenance: "SYSTEM_DESIGN_SUPPORT" };
              return { source, acquired: true, reason: null };
            } catch (error) {
              const code = (error as { code?: string }).code ?? (error instanceof Error ? error.message : "");
              return { source: null, acquired: false, reason: /^DOCUMENT_[A-Z_]+$|^DESIGN_SUPPORT_[A-Z_]+$|^ERR_INVALID_IP_ADDRESS$|^ETIMEDOUT$|^ECONNRESET$|^ENOTFOUND$/.test(code)
                ? code : "DOCUMENT_ACQUISITION_FAILED" };
            }
          }, value => value.source?.document.privateArtifactPath ? [value.source.document.privateArtifactPath] : []);
          if (inspected.acquired) acquisitions++;
          if (inspected.source && !accepted.some(source => source.document.sha256 === inspected.source!.document.sha256)) accepted.push(inspected.source);
        }
        return { support: accepted, limitation: accepted.length ? null : "No se verificó un documento adicional con identidad y pasajes inspeccionables.", operation };
      }, value => value.support.flatMap(source => source.document.privateArtifactPath ? [source.document.privateArtifactPath] : []));
      support.push(...verified.support);
      operations.push(verified.operation);
      if (verified.limitation) limitations.push(verified.limitation);
    } catch (error) {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "DESIGN_MINI_RESEARCH_UNAVAILABLE";
      limitations.push(/COST|BUDGET|CAP|PAID_REQUEST/.test(code) ? "La miniinvestigación quedó limitada por el presupuesto o una operación pendiente de conciliación." : "La miniinvestigación técnica no produjo evidencia verificable adicional.");
    }
  }
  return { status: support.length ? "VERIFIED_SUPPORT" as const : "LIMITED" as const, support, limitations, operations };
}
