import assert from "node:assert/strict";

import type {
  BlueprintLaunchLimitedInspectionItem,
  BlueprintLaunchLimitedSourceInspectionResult,
  BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";
import {
  buildDeepResearchLightArtifacts,
  shouldBuildDeepResearchLightArtifacts,
} from "@/server/blueprint-engine/quality/deep-research-light";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";

function sourceBundle(): BlueprintLaunchSelectedSourceBundle {
  return {
    savedAt: "2026-01-01T00:00:00.000Z",
    manifestPath: "synthetic/source-selection.json",
    selectedCount: 2,
    pdfLinkedCount: 2,
    searchQuery: "neutral intervention outcome population",
    intakeTopic: "Neutral intervention for improving an observed outcome in a defined population",
    sources: [
      {
        selectedOrder: 1,
        relevanceScore: 87,
        scoreLabel: "ALTO",
        reference: {
          id: "src-alpha",
          title: "Neutral intervention and observed outcome in applied settings",
          translatedTitle: null,
          doi: "10.1000/neutral.alpha",
          year: 2024,
          venue: "Synthetic Journal",
          abstract: "A neutral source about an intervention and observed outcome.",
          translatedAbstract: null,
          landingPageUrl: "https://example.test/alpha",
          authorsJson: ["A. Author"],
          sourceLanguage: "en",
          displayLanguage: "en",
          hasAutoTranslation: false,
          pdfUrl: "https://example.test/alpha.pdf",
          pdfAccessible: true,
        },
      },
      {
        selectedOrder: 2,
        relevanceScore: 72,
        scoreLabel: "MEDIO",
        reference: {
          id: "src-beta",
          title: "Measurement indicators for neutral applied research",
          translatedTitle: null,
          doi: null,
          year: 2023,
          venue: "Synthetic Methods",
          abstract: "A neutral source about indicators.",
          translatedAbstract: null,
          landingPageUrl: "https://example.test/beta",
          authorsJson: ["B. Author"],
          sourceLanguage: "en",
          displayLanguage: "en",
          hasAutoTranslation: false,
          pdfUrl: "https://example.test/beta.pdf",
          pdfAccessible: true,
        },
      },
    ],
  };
}

function item(overrides: Partial<BlueprintLaunchLimitedInspectionItem>): BlueprintLaunchLimitedInspectionItem {
  return {
    sourceId: "src-alpha",
    title: "Neutral intervention and observed outcome in applied settings",
    plannedContentUrl: "https://example.test/alpha.pdf",
    status: "inspected",
    inspectedKind: "pdf",
    localPrimaryPath: null,
    localSampleTextPath: null,
    byteSize: 1200,
    pageCount: 8,
    sampledPageCount: 6,
    textCharCount: 5200,
    sampleTextCharCount: 1800,
    identityStatus: "matched",
    titleTokenMatchRatio: 0.7,
    doiMatched: true,
    methodSignalCount: 0,
    theorySignalCount: 0,
    variableSignalCount: 0,
    equationCandidateCount: 0,
    tableCandidateCount: 0,
    figureCandidateCount: 0,
    secondaryReferenceCandidateCount: 0,
    secondaryReferenceCandidates: [],
    inspectionSummary: "Synthetic neutral summary.",
    methodSignals: [],
    theorySignals: [],
    variableSignals: [],
    warnings: [],
    ...overrides,
  };
}

function limitedInspection(items: BlueprintLaunchLimitedInspectionItem[]): BlueprintLaunchLimitedSourceInspectionResult {
  return {
    artifact_type: "limited_source_inspection",
    artifact_version: "v1",
    savedAt: "2026-01-01T00:00:00.000Z",
    summary: "Synthetic limited inspection.",
    runDir: null,
    attemptedCount: items.length,
    inspectedCount: items.filter((entry) => entry.status === "inspected").length,
    usableInspectionCount: items.filter((entry) => entry.textCharCount >= 500).length,
    failedCount: 0,
    skippedCount: 0,
    postInspectionDecision: "NEEDS_DEEP_RESEARCH_LIGHT",
    postInspectionReasons: ["Synthetic gap."],
    sourceIdsForFullExtraction: items.map((entry) => entry.sourceId),
    sourceIdsNeedingReplacement: [],
    sourceIdsNeedingManualReview: [],
    sourceIdsForDeepResearchLight: items.map((entry) => entry.sourceId),
    secondaryReferenceCandidateCount: items.reduce(
      (sum, entry) => sum + entry.secondaryReferenceCandidateCount,
      0,
    ),
    items,
    warnings: [],
  };
}

function postReport(overrides: Partial<PostInspectionSourceSufficiencyReportV1>): PostInspectionSourceSufficiencyReportV1 {
  return {
    artifact_type: "post_inspection_source_sufficiency",
    artifact_version: "v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    case_id: "case-neutral",
    decision: "NEEDS_DEEP_RESEARCH_LIGHT",
    selected_source_count: 2,
    inspected_source_count: 2,
    usable_source_count: 2,
    direct_usable_source_count: 1,
    contextual_or_partial_source_count: 1,
    method_signal_source_count: 0,
    theory_signal_source_count: 0,
    variable_signal_source_count: 1,
    equation_candidate_count: 0,
    table_candidate_count: 0,
    figure_candidate_count: 0,
    secondary_reference_candidate_count: 0,
    source_ids_ready_for_full_extraction: ["src-alpha", "src-beta"],
    source_ids_needing_replacement: [],
    source_ids_needing_manual_review: [],
    source_ids_for_deep_research_light: ["src-alpha", "src-beta"],
    missing_evidence_categories: ["method_or_study_design", "theory_or_model"],
    recommendations: [],
    reasons: ["Synthetic missing method/theory categories."],
    warnings: [],
    blockers: ["Synthetic gap."],
    ...overrides,
  };
}

function testMissingCategoriesCreateQueryFamilies() {
  const artifacts = buildDeepResearchLightArtifacts({
    caseId: "case-neutral",
    intake: {
      topic: "Neutral intervention for improving an observed outcome in a defined population",
      problemContext: "The current intake needs a method and framework.",
    },
    bundle: sourceBundle(),
    evidencePlanning: null,
    limitedInspection: limitedInspection([item({}), item({ sourceId: "src-beta", title: "Measurement indicators" })]),
    postInspectionSufficiency: postReport({}),
    referenceCandidateOutputPath: "artifacts-local/synthetic/deep-research-light-reference-candidates.json",
  });

  assert.equal(shouldBuildDeepResearchLightArtifacts({ postInspectionSufficiency: postReport({}) }), true);
  assert.ok(
    artifacts.searchPlan.query_families.some((family) => family.category === "method_or_study_design"),
  );
  assert.ok(artifacts.searchPlan.query_families.some((family) => family.category === "theory_or_model"));
  assert.ok(
    artifacts.searchPlan.query_families
      .flatMap((family) => family.queries)
      .some((query) => query.includes("methodology") || query.includes("metodologia")),
  );
}

function testSecondaryReferencesBecomeNonCitableQueue() {
  const secondaryMarker = "Smith J. 2021. A neutral framework for applied evaluation. Journal of Neutral Evidence. doi:10.1000/neutral.secondary";
  const artifacts = buildDeepResearchLightArtifacts({
    caseId: "case-neutral",
    intake: { topic: "Neutral intervention topic" },
    bundle: sourceBundle(),
    evidencePlanning: null,
    limitedInspection: limitedInspection([
      item({
        secondaryReferenceCandidateCount: 1,
        secondaryReferenceCandidates: [secondaryMarker],
      }),
    ]),
    postInspectionSufficiency: postReport({
      decision: "READY_WITH_WARNINGS",
      missing_evidence_categories: [],
      secondary_reference_candidate_count: 1,
      blockers: [],
      warnings: ["secondary reference candidate detected"],
    }),
    referenceCandidateOutputPath: "artifacts-local/synthetic/deep-research-light-reference-candidates.json",
  });

  assert.equal(artifacts.referenceCandidates.candidate_count, 1);
  assert.equal(artifacts.referenceCandidates.candidates[0]?.citable_status, "not_citable_until_recovered");
  assert.equal(artifacts.referenceCandidates.candidates[0]?.doi, "10.1000/neutral.secondary");
  assert.ok(
    artifacts.searchPlan.query_families.some((family) => family.category === "secondary_reference_recovery"),
  );
}

function testNoStaleTopicDefaults() {
  const artifacts = buildDeepResearchLightArtifacts({
    caseId: "case-neutral",
    intake: { topic: "Neutral topic only" },
    bundle: sourceBundle(),
    evidencePlanning: null,
    limitedInspection: limitedInspection([item({})]),
    postInspectionSufficiency: postReport({}),
    referenceCandidateOutputPath: null,
  });
  const serialized = JSON.stringify(artifacts).toLowerCase();
  for (const forbidden of [
    "adaptive reuse",
    "toronto",
    "mass timber",
    "office-to-residential",
    "seismic isolators",
    "aisladores",
    "shaking table",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `Unexpected stale term: ${forbidden}`);
  }
}

testMissingCategoriesCreateQueryFamilies();
testSecondaryReferencesBecomeNonCitableQueue();
testNoStaleTopicDefaults();

console.log("test-deep-research-light: pass");
