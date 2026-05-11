import assert from "node:assert/strict";
import path from "node:path";

import {
  applySelectionState,
  type BlueprintLaunchSearchSnapshot,
  type BlueprintLaunchSourceAccessResolutionResult,
} from "@/blueprint_launch/server/local-playground-store";
import {
  annotateSupplementalSourceAccessResolution,
  buildReferenceListItem,
  buildSelectedSourceBundle,
  buildSupplementalSelectedSourcePolicyReport,
  type CandidateSource,
} from "./run-evidence-selected-sources-steps-2-6";

function supplementalCandidate(): CandidateSource {
  return {
    candidate_id: "dr-supp-neutral-method",
    title: "Neutral supplemental method source",
    authors: ["Neutral Author"],
    year: 2025,
    venue: "Neutral Journal",
    doi: "10.1000/neutral-method",
    abstract: "Neutral source discovered as a candidate for a missing method evidence gap.",
    landing_page_url: "https://example.test/neutral-method",
    pdf_url: null,
    open_access_status: "reference_url_unverified",
    relevance_score: 48,
    rank: 2,
    provider: "openai_deep_research",
    warnings: ["candidate_only_not_citable_yet"],
    citable_status: "candidate_only_not_citable_yet",
    supplemental_source: "rapid_deep_research_fallback",
    evidence_candidate_id: "dr-ev-neutral-method",
    evidence_need_id: "method_or_study_design",
    gap_addressed: "Missing source-backed method support.",
    confidence: "medium",
    must_pass_source_selection: true,
    must_pass_pdf_or_source_inspection: true,
    must_pass_evidence_engine: true,
  };
}

function baseCandidate(): CandidateSource {
  return {
    candidate_id: "base-neutral-source",
    title: "Neutral base source",
    authors: ["Base Author"],
    year: 2024,
    venue: "Neutral Journal",
    doi: "10.1000/base-neutral",
    abstract: "Base source.",
    landing_page_url: "https://example.test/base-neutral",
    pdf_url: "https://example.test/base-neutral.pdf",
    open_access_status: "pdf_url_unverified",
    relevance_score: 60,
    rank: 1,
    provider: "openalex",
    warnings: [],
  };
}

function main() {
  const references = [baseCandidate(), supplementalCandidate()].map((candidate, index) =>
    buildReferenceListItem({
      candidate,
      index,
      searchQuery: "neutral current intake query",
    }),
  );
  const selectedReferences = applySelectionState(references, [
    "base-neutral-source",
    "dr-supp-neutral-method",
  ]);
  const searchSnapshot: BlueprintLaunchSearchSnapshot = {
    savedAt: "2026-01-01T00:00:00.000Z",
    searchQuery: "neutral current intake query",
    attemptedQueries: ["neutral current intake query"],
    totalResults: selectedReferences.length,
    metadata: null,
    references: selectedReferences,
  };
  const bundle = buildSelectedSourceBundle({
    outputFolder: path.join(process.cwd(), "artifacts-local", "test-deep-research-provenance"),
    searchSnapshot,
    savedIntake: {
      savedAt: "2026-01-01T00:00:00.000Z",
      status: "ready",
      intake: {
        topic: "Neutral topic",
        problemContext: "Neutral problem.",
        researchLine: "Neutral line.",
        academicConstraints: "Neutral constraints.",
        targetPopulation: "Neutral population.",
        availableData: "Neutral data.",
        preferredMethodology: "Neutral method.",
        advisorNotes: "Neutral notes.",
      },
      derivedSearchQuery: "neutral current intake query",
      projectContext: {
        knowledgeAreaLabel: "Neutral knowledge area",
      },
    },
  });
  const report = buildSupplementalSelectedSourcePolicyReport(bundle);
  const serializedBundle = JSON.stringify(bundle);

  assert.equal(bundle.selectedCount, 2);
  assert.equal(report.supplemental_source_count, 1);
  assert.deepEqual(report.supplemental_source_ids, ["dr-supp-neutral-method"]);
  assert(serializedBundle.includes("rapid_deep_research_fallback"));
  assert(serializedBundle.includes("candidate_only_not_citable_yet"));
  assert(report.policy_warnings.some((warning) => warning.includes("Evidence Engine")));

  const sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult = {
    savedAt: "2026-01-01T00:00:00.000Z",
    summary: "Synthetic.",
    completePublicCount: 1,
    partialPublicCount: 1,
    metadataOnlyCount: 0,
    unresolvedCount: 0,
    llmPromptCount: 0,
    llmPrompts: [],
    items: [
      {
        sourceId: "base-neutral-source",
        title: "Neutral base source",
        status: "complete_public",
        kind: "pdf",
        resolvedContentUrl: "https://example.test/base-neutral.pdf",
        finalUrl: "https://example.test/base-neutral.pdf",
        resolvedVia: "synthetic",
        languageDetected: "en",
        confidence: 0.8,
        hasCompletePublicContent: true,
        candidateSummary: [],
        attempts: [],
        warnings: [],
      },
      {
        sourceId: "dr-supp-neutral-method",
        title: "Neutral supplemental method source",
        status: "partial_public",
        kind: "landing_only",
        resolvedContentUrl: null,
        finalUrl: "https://example.test/neutral-method",
        resolvedVia: "synthetic",
        languageDetected: "en",
        confidence: 0.4,
        hasCompletePublicContent: false,
        candidateSummary: [],
        attempts: [],
        warnings: [],
      },
    ],
  };
  const annotated = annotateSupplementalSourceAccessResolution({
    sourceAccessResolution,
    bundle,
  });
  const supplementalWarnings =
    annotated.items.find((item) => item.sourceId === "dr-supp-neutral-method")?.warnings ?? [];
  const baseWarnings =
    annotated.items.find((item) => item.sourceId === "base-neutral-source")?.warnings ?? [];

  assert.equal(baseWarnings.length, 0);
  assert(supplementalWarnings.includes("source_origin=rapid_deep_research_fallback"));
  assert(
    supplementalWarnings.includes(
      "citable_status=candidate_only_not_citable_yet_until_local_inspection_and_evidence_engine",
    ),
  );

  const serializedReport = JSON.stringify(report).toLowerCase();
  for (const staleTerm of ["adaptive reuse", "seismic isolators", "shaking table"]) {
    assert.equal(serializedReport.includes(staleTerm), false);
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "selected_source_bundle_preserves_deep_research_provenance",
          "supplemental_policy_report_identifies_selected_supplements",
          "source_access_resolution_receives_non_citable_warnings",
          "base_sources_are_not_annotated",
          "no_unrelated_stale_terms_are_introduced",
        ],
      },
      null,
      2,
    ),
  );
}

main();
