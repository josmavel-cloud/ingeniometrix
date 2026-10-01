import { fingerprint, stageCheckpoint } from "./job-execution-context";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import { DESIGN_MINI_RESEARCH_PURPOSE } from "@/server/retrieval/web-discovery-contract";
import { runWebDiscoveryOperation } from "@/server/retrieval/web-discovery-operation";
import { createOpenAiWebDiscoveryProvider } from "@/server/retrieval/web-discovery-provider";
import { convergeWebCandidate, type ExistingScientificSource } from "@/server/retrieval/web-candidate-convergence";
import { fetchPublicDocument } from "@/server/retrieval/safe-document-fetch";
import { observedSourceMetadata } from "@/server/retrieval/observed-source-metadata";
import { normalizeConcept } from "@/lib/retrieval-scientific-concepts";
import { normalizePublicWebUrl } from "@/server/retrieval/web-discovery-validation";

export const DESIGN_MINI_RESEARCH_POLICY = { version: "design-mini-research.v1", maxOperations: 2, maxToolCalls: 2, maxCandidates: 5 } as const;
type VerifiedSupport = { gapId: string; title: string; authors: string[]; year: number; doi: string | null; abstract: string; observedUrl: string; observationIds: string[]; bodyHash: string; provenance: "COMPLETED_WEB_SEARCH_AND_OBSERVED_METADATA" };

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
export type DesignSupportGap = { gapId: string; question: string; whyMaterial: string;
  requiredEvidenceType: "SCHOLARLY_METHOD_OR_STANDARD"; searchProjection: string;
  existingEvidenceIds: string[]; scopeBoundary: string; maxCandidates: 5; status: "OPEN" };

export function designSupportGaps(bundle: ScientificDecisionBundle): DesignSupportGap[] {
  const alternative = bundle.decision.alternatives.find(item => item.id === bundle.decision.recommended_id);
  const method = alternative && "primary_method" in alternative ? String(alternative.primary_method) : null;
  const object = bundle.intent.unit_population_corpus || bundle.intent.scope;
  if (!method || !object) return [];
  return bundle.critique.assessments.filter(assessment => assessment.alternative_id === bundle.decision.recommended_id)
    .flatMap(assessment => assessment.critical_findings)
    .filter(finding => finding.severity === "BLOCKING" && /method|validation|theor|framework|evidence|applicab/i.test(finding.affected_field) &&
      !/scope|data_requirements|access/i.test(finding.affected_field) && finding.required_action.length >= 24)
    .slice(0, DESIGN_MINI_RESEARCH_POLICY.maxOperations)
    .map((finding, index) => ({ gapId: `design-support-${index + 1}`,
      question: `¿Qué evidencia primaria o metodología establecida permite verificar la aplicabilidad de ${method} a ${object}, respecto de ${finding.affected_field}?`,
      whyMaterial: finding.issue, requiredEvidenceType: "SCHOLARLY_METHOD_OR_STANDARD" as const,
      searchProjection: finding.required_action, existingEvidenceIds: bundle.evidence_pack.items.map(item => item.evidence_id),
      scopeBoundary: bundle.intent.scope, maxCandidates: 5 as const, status: "OPEN" as const }));
}

// A web proposal is never promoted into the user's selected EvidenceSet. Only
// independently observed bibliographic metadata with a real abstract can be
// offered as separate, inspectable design support.
export async function researchDesignSupport(input: { userId: string; projectId: string; runId: string; bundle: ScientificDecisionBundle }) {
  const { bundle } = input;
  const material = designSupportGaps(bundle);
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
  const known = bundle.evidence_pack.selected_sources.slice(0, 30).map(source => ({ doi: source.doi ?? undefined, title: source.title }));
  const existing: ExistingScientificSource[] = bundle.evidence_pack.selected_sources.map(source => ({ id: source.source_id, title: source.title, authors: [], year: source.year, doi: source.doi, workType: null, observedUrls: [], selected: true, assessmentValid: true, doiProvenance: "PROVIDER_METADATA" }));
  const sourcePoolVersion = fingerprint(known);
  const support: VerifiedSupport[] = [];
  const limitations: string[] = [];
  const operations: Array<{ operationId: string; estimatedCostUsd: number | null; usage: unknown; state: string }> = [];
  for (const [index, finding] of material.entries()) {
    const gapId = finding.gapId;
    const gap = { gapId, searchIntentHash: intentHash, kind: "EVIDENCE" as const, importance: "MATERIAL" as const,
      requiredDimension: finding.question.slice(0, 700), desiredEvidenceRole: "METHODOLOGICAL" as const,
      preferredSourceTypes: ["SCHOLARLY" as const, "STANDARD_OR_CODE" as const], unresolvedPremises: [], webDiscoveryEligible: true };
    const gapSetHash = fingerprint([bundle.decisionFingerprint, gapId, finding, gap.requiredDimension]);
    try {
      const verified = await stageCheckpoint(`DESIGN_MINI_RESEARCH_${index + 1}`, { policy: DESIGN_MINI_RESEARCH_POLICY, gapSetHash, sourcePoolVersion }, async () => {
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
        for (const candidate of discovery.candidates.slice(0, DESIGN_MINI_RESEARCH_POLICY.maxCandidates)) {
          const convergence = convergeWebCandidate({ context: { operationId: discovery.operationId, projectId: input.projectId,
            searchIntentHash: intentHash, gapSetHash, discoveredSourcePoolVersion: sourcePoolVersion,
            currentSourcePoolVersion: sourcePoolVersion, allowedGapIds: [gapId] }, discovery, candidate, existing });
          if (convergence.identityOutcome !== "NEW_SOURCE_CANDIDATE" || !convergence.semanticReviewRequired ||
            !["PEER_REVIEWED_ARTICLE", "CONFERENCE_PAPER", "ACADEMIC_REPOSITORY"].includes(candidate.proposal.identityProposal.sourceType)) continue;
          try {
            const fetched = await fetchPublicDocument(candidate.proposal.observedUrl, { Accept: "text/html" }, 2 * 1024 * 1024, 15_000);
            if (!fetched.ok || !fetched.contentType.includes("text/html")) continue;
            const metadata = observedSourceMetadata(fetched.body.toString("utf8"), candidate.proposal.identityProposal.title);
            if (!metadata?.abstract || !designSupportMetadataEligible({ title: metadata.title, abstract: metadata.abstract,
              doi: metadata.doi, venue: metadata.venue, observedUrl: fetched.finalUrl,
              requestedUrl: candidate.proposal.observedUrl, method, object })) continue;
            accepted.push({ gapId, title: metadata.title, authors: metadata.authors, year: metadata.year!, doi: metadata.doi,
              abstract: metadata.abstract.slice(0, 4000), observedUrl: fetched.finalUrl,
              observationIds: convergence.discoveryObservationIds, bodyHash: metadata.bodyHash,
              provenance: "COMPLETED_WEB_SEARCH_AND_OBSERVED_METADATA" });
          } catch { /* A failed or ambiguous source stays excluded. */ }
        }
        return { support: accepted, limitation: accepted.length ? null : "No se verificó una fuente técnica adicional con identidad y resumen observados.", operation };
      });
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
