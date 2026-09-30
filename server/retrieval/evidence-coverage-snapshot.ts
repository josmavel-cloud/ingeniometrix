import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";
import type { ProjectReferenceSearchSnapshot } from "./reference-search-v2";
import type { CoverageSource } from "./evidence-gap-contract";
import { coverageHash } from "./evidence-coverage";
import { sourceRelevanceTier } from "./source-relevance-tier";
import { SOURCE_SUFFICIENCY_POLICY } from "@/lib/source-sufficiency-policy";
import { evaluateEvidenceCoverage } from "./evidence-coverage";

// Read-only adapter for existing private search snapshots. Diagnostic PaidOperation results
// are deliberately not an input: they have not been integrated into the current Sources pool.
export function evaluateSnapshotCoverage(intent: ResearchSearchIntent, snapshot: ProjectReferenceSearchSnapshot,
  history: ProjectReferenceSearchSnapshot[] = [], additionalSources: CoverageSource[] = []) {
  const trace = snapshot.inputTrace;
  if (snapshot.stale || !trace || trace.projectId !== intent.projectId || trace.definitionHash !== intent.definitionHash ||
      trace.confirmedDraftRevision !== intent.confirmedDraftRevision) throw new Error("COVERAGE_SNAPSHOT_INTENT_MISMATCH");
  const compatible = [snapshot, ...history].filter(s => s.inputTrace?.searchIntentHash === trace.searchIntentHash &&
    !s.stale && s.inputTrace?.projectId === intent.projectId && s.inputTrace?.definitionHash === intent.definitionHash &&
    s.inputTrace?.confirmedDraftRevision === intent.confirmedDraftRevision);
  const sources: CoverageSource[] = (snapshot.candidateAdmissions ?? []).map(row => {
    const assessment = row.scoreBreakdown?.candidateAssessment;
    const validOrigin = assessment?.origin === "MODEL_REVIEW" && compatible.some(s =>
      s.candidateAdmissions?.some(old => old.candidateKey === row.candidateKey &&
        old.scoreBreakdown?.candidateAssessment?.metadataHash === assessment.metadataHash &&
        JSON.stringify(old.scoreBreakdown.candidateAssessment) === JSON.stringify(assessment)) &&
      s.semanticReview?.itemValidation?.some(item => item.candidateId === row.candidateKey && item.status === "VALID"));
    return { candidateId: row.candidateKey, title: row.title ?? "", abstract: row.inspectionMetadata?.abstract ?? null,
      year: row.year, authors: row.inspectionMetadata?.authors, venue: row.inspectionMetadata?.venue,
      projectId: intent.projectId, searchIntentHash: trace.searchIntentHash,
      provenanceRef: `search-snapshot:${snapshot.savedAt}:${row.candidateKey}`, assessment,
      assessmentValidation: assessment?.origin === "DETERMINISTIC" ? "DETERMINISTIC" : validOrigin ? "VALID" : "UNVERIFIED",
      identity: row.doi ? "PROVIDER_IDENTIFIED" : "UNCERTAIN",
      // This historical contract has no authoritative issuer/type verification.
      sourceType: "UNKNOWN", officialAuthority: { status: "UNKNOWN" },
      access: { reportedPdf: Boolean(row.inspectionMetadata?.access.pdfUrl), materializedFullText: false } };
  });
  const coverage = evaluateEvidenceCoverage({ intent, searchIntentHash: trace.searchIntentHash, sourcePoolIntentHash: trace.searchIntentHash,
    sources: [...sources, ...additionalSources], enrichment: snapshot.metadata.enrichment });
  const core = sources.filter(source => source.abstract?.trim() && sourceRelevanceTier(source.assessment,
    Boolean(source.candidateId.startsWith("doi:") || source.candidateId.startsWith("openalex:") || source.identity === "PROVIDER_IDENTIFIED")) === "CORE");
  if (core.length < 3) {
    const dimensionId = coverageHash({ policy: SOURCE_SUFFICIENCY_POLICY, intent: trace.searchIntentHash });
    coverage.gaps.push({ schemaVersion: "EvidenceGap.v1", gapPolicyVersion: coverage.gapPolicyVersion,
      gapId: `minimum-source:${dimensionId}`, dimensionId, searchIntentHash: trace.searchIntentHash,
      sourcePoolVersion: coverage.sourcePoolVersion, kind: "DISCOVERY", importance: "MATERIAL", type: "MINIMUM_SOURCE_COVERAGE",
      intentFieldRefs: ["topic", "problem", "purpose", "object", "concepts"],
      requiredDimension: "Additional credible scholarly or primary sources materially relevant to the confirmed intent, covering weaknesses in the central set and avoiding known works",
      coverageObservations: [], insufficiencyReason: "CORE_USABLE_COVERAGE_BELOW_POLICY_MINIMUM",
      desiredEvidenceRole: "DIRECT", preferredSourceTypes: ["SCHOLARLY", "INSTITUTIONAL_REPORT", "OFFICIAL_GOVERNMENT_SOURCE"],
      contextualRequirements: [], unresolvedPremises: [], accessPreference: "RELEVANCE_BEFORE_ACCESS",
      uncertainty: ["Finite observed pool; absence does not establish that relevant literature does not exist"],
      decisionOrigin: "CONFIRMED_FIELD_POLICY", status: "OPEN", webDiscoveryEligible: true,
      eligibilityReason: "Automatic controller must exhaust lower-cost convergence and reserve budget first",
      route: "WEB_DISCOVERY_CANDIDATE" });
    coverage.gapsHash = coverageHash(coverage.gaps);
  }
  return coverage;
}
