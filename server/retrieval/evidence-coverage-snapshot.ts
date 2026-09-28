import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";
import type { ProjectReferenceSearchSnapshot } from "./reference-search-v2";
import type { CoverageSource } from "./evidence-gap-contract";
import { evaluateEvidenceCoverage } from "./evidence-coverage";

// Read-only adapter for existing private search snapshots. Diagnostic PaidOperation results
// are deliberately not an input: they have not been integrated into the current Sources pool.
export function evaluateSnapshotCoverage(intent: ResearchSearchIntent, snapshot: ProjectReferenceSearchSnapshot,
  history: ProjectReferenceSearchSnapshot[] = []) {
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
  return evaluateEvidenceCoverage({ intent, searchIntentHash: trace.searchIntentHash, sourcePoolIntentHash: trace.searchIntentHash,
    sources, enrichment: snapshot.metadata.enrichment });
}
