import { buildLimitedInspectionItemFromText } from "@/blueprint_launch/server/source-limited-inspection";
import type { BlueprintLaunchEvidencePlanningResult } from "@/blueprint_launch/server/local-playground-store";
import {
  buildPostInspectionSourceSufficiencyReport,
  shouldStopAfterPostInspectionSufficiency,
} from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";
import type { PdfRelevanceReviewResultV1 } from "@/server/blueprint-engine/quality/pdf-relevance-review";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function repeated(text: string, count = 20) {
  return Array.from({ length: count }, () => text).join(" ");
}

function evidencePlanning(sourceIds: string[]): Pick<
  BlueprintLaunchEvidencePlanningResult,
  "sourceCards" | "replacementRecommendedSourceIds" | "identityBlockedSourceIds" | "sufficiencyWarnings"
> {
  return {
    sourceCards: sourceIds.map((sourceId, index) => ({
      sourceId,
      title: `Neutral current source ${index + 1}`,
      year: 2026,
      scoreLabel: "ALTO",
      relevanceScore: 90,
      detectedLanguage: "en",
      accessStatus: "complete_public",
      accessKind: "pdf",
      resolverFamily: "publisher_pdf",
      contentUrl: `https://example.org/${sourceId}.pdf`,
      topicRelevance: index === 2 ? "parcial" : "directa",
      proposalUsefulness: index === 2 ? "media" : "alta",
      sourceRole: "Synthetic neutral source for current intake only.",
      supportsSectionKeys: ["methodology", "theoretical_or_technical_framework"],
      methodologyHints: ["method"],
      frameworkHints: ["framework"],
      extractionFocus: ["variables"],
      expectedEvidenceTypes: ["text", "references"],
      riskFlags: [],
      qualityFlags: [],
    })),
    replacementRecommendedSourceIds: [],
    identityBlockedSourceIds: [],
    sufficiencyWarnings: [],
  };
}

function limitedInspection(items: ReturnType<typeof buildLimitedInspectionItemFromText>[]) {
  return {
    artifact_type: "limited_source_inspection" as const,
    artifact_version: "v1" as const,
    savedAt: new Date().toISOString(),
    summary: "synthetic",
    runDir: null,
    attemptedCount: items.length,
    inspectedCount: items.filter((item) => item.status === "inspected").length,
    usableInspectionCount: items.filter((item) => item.status === "inspected" && item.textCharCount >= 500).length,
    failedCount: items.filter((item) => item.status === "failed").length,
    skippedCount: items.filter((item) => item.status === "skipped").length,
    postInspectionDecision: "PROCEED_TO_FULL_EXTRACTION" as const,
    postInspectionReasons: [],
    sourceIdsForFullExtraction: items.map((item) => item.sourceId),
    sourceIdsNeedingReplacement: [],
    sourceIdsNeedingManualReview: [],
    sourceIdsForDeepResearchLight: [],
    secondaryReferenceCandidateCount: items.reduce((sum, item) => sum + item.secondaryReferenceCandidateCount, 0),
    items,
    warnings: [],
  };
}

function pdfRelevanceReview(input: Array<{ sourceId: string; relevanceClass?: PdfRelevanceReviewResultV1["items"][number]["relevance_class"] }>): PdfRelevanceReviewResultV1 {
  const items = input.map((item) => ({
    source_id: item.sourceId,
    title: `Neutral current source ${item.sourceId}`,
    inspected_text_available: item.relevanceClass !== "unusable",
    relevance_class: item.relevanceClass ?? "nuclear_direct",
    allowed_evidence_use: item.relevanceClass === "methodological"
      ? "method_support" as const
      : item.relevanceClass === "contextual_background"
        ? "context_only" as const
        : item.relevanceClass === "weak_or_replace"
          ? "gap_only" as const
          : item.relevanceClass === "unusable"
            ? "do_not_use" as const
            : "central_claim_support" as const,
    confidence: "medium" as const,
    coverage: {
      central_problem: item.relevanceClass === "contextual_background" ? "partial" as const : "strong" as const,
      population_or_context: "partial" as const,
      main_variable_or_phenomenon: "partial" as const,
      method_or_design: "partial" as const,
      theory_or_model: "partial" as const,
      data_or_instrument: "partial" as const,
    },
    matched_keyword_categories: {
      necessary: ["current"],
      complementary: [],
      optional: [],
    },
    supporting_excerpt_refs: [],
    warnings: [],
    blockers: [],
  }));

  return {
    artifact_type: "pdf_relevance_review",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: "synthetic-current-case",
    review_mode: "deterministic_fallback",
    llm_status: "skipped",
    llm_prompt_count: 0,
    llm_call_count: 0,
    model: null,
    keyword_categories: {
      necessary: ["current"],
      complementary: [],
      optional: [],
    },
    source_count: items.length,
    reviewed_source_count: items.length,
    nuclear_direct_source_count: items.filter((item) => item.relevance_class === "nuclear_direct").length,
    methodological_source_count: items.filter((item) => item.relevance_class === "methodological").length,
    theoretical_source_count: items.filter((item) => item.relevance_class === "theoretical").length,
    contextual_or_adjacent_source_count: items.filter((item) => item.relevance_class === "contextual_background" || item.relevance_class === "adjacent").length,
    weak_or_unusable_source_count: items.filter((item) => item.relevance_class === "weak_or_replace" || item.relevance_class === "unusable").length,
    source_ids_nuclear_direct: items.filter((item) => item.relevance_class === "nuclear_direct").map((item) => item.source_id),
    source_ids_needing_replacement: items.filter((item) => item.relevance_class === "weak_or_replace" || item.relevance_class === "unusable").map((item) => item.source_id),
    items,
    warnings: [],
    blockers: [],
  };
}

function usefulItem(sourceId: string, extraText = "") {
  return buildLimitedInspectionItemFromText({
    sourceId,
    title: `Neutral current source ${sourceId}`,
    doi: `10.1000/${sourceId}`,
    inspectedKind: "pdf",
    text: repeated(
      `Neutral current source ${sourceId} 10.1000/${sourceId} method study design instrument sample population framework model variable indicator outcome factor validation ${extraText}`,
    ),
    secondaryReferenceCandidateCount: 2,
  });
}

function run() {
  const ready = buildPostInspectionSourceSufficiencyReport({
    case_id: "synthetic-current-case",
    selected_source_count: 3,
    evidencePlanning: evidencePlanning(["source-a", "source-b", "source-c"]),
    limitedInspection: limitedInspection([
      usefulItem("source-a"),
      usefulItem("source-b"),
      usefulItem("source-c"),
    ]),
    pdfRelevanceReview: pdfRelevanceReview([
      { sourceId: "source-a" },
      { sourceId: "source-b" },
      { sourceId: "source-c", relevanceClass: "contextual_background" },
    ]),
    minUsableFullTextSources: 3,
  });
  assert(
    ready.decision === "READY_WITH_WARNINGS",
    "Secondary references should keep otherwise-ready report in READY_WITH_WARNINGS, not block.",
  );
  assert(ready.usable_source_count === 3, "Usable source count should be computed.");
  assert(ready.direct_usable_source_count === 2, "Direct source count should use Step 4B PDF relevance review.");
  assert(!shouldStopAfterPostInspectionSufficiency({ report: ready, allowBlocked: false }), "Ready report should not stop.");

  const noMethod = buildPostInspectionSourceSufficiencyReport({
    case_id: "synthetic-current-case",
    selected_source_count: 3,
    evidencePlanning: evidencePlanning(["source-a", "source-b", "source-c"]),
    limitedInspection: limitedInspection([
      buildLimitedInspectionItemFromText({
        sourceId: "source-a",
        title: "Neutral current source source-a",
        inspectedKind: "pdf",
        text: repeated("Neutral current source source-a descriptive background."),
      }),
      buildLimitedInspectionItemFromText({
        sourceId: "source-b",
        title: "Neutral current source source-b",
        inspectedKind: "pdf",
        text: repeated("Neutral current source source-b descriptive background."),
      }),
      buildLimitedInspectionItemFromText({
        sourceId: "source-c",
        title: "Neutral current source source-c",
        inspectedKind: "pdf",
        text: repeated("Neutral current source source-c descriptive background."),
      }),
    ]),
    pdfRelevanceReview: pdfRelevanceReview([
      { sourceId: "source-a" },
      { sourceId: "source-b" },
      { sourceId: "source-c" },
    ]),
    minUsableFullTextSources: 3,
  });
  assert(noMethod.decision === "NEEDS_DEEP_RESEARCH_LIGHT", "Missing method/theory/variable categories should route to fallback.");
  assert(noMethod.missing_evidence_categories.includes("method_or_study_design"), "Missing method category should be explicit.");

  const mismatch = buildPostInspectionSourceSufficiencyReport({
    case_id: "synthetic-current-case",
    selected_source_count: 3,
    evidencePlanning: evidencePlanning(["source-a", "source-b", "source-c"]),
    limitedInspection: limitedInspection([
      usefulItem("source-a"),
      usefulItem("source-b"),
      buildLimitedInspectionItemFromText({
        sourceId: "source-c",
        title: "Neutral current source source-c",
        inspectedKind: "pdf",
        text: repeated("Unrelated text with method framework variable signals but mismatched identity."),
      }),
    ]),
    pdfRelevanceReview: pdfRelevanceReview([
      { sourceId: "source-a" },
      { sourceId: "source-b" },
      { sourceId: "source-c", relevanceClass: "unusable" },
    ]),
    minUsableFullTextSources: 2,
  });
  assert(mismatch.decision === "NEEDS_MANUAL_PDF_REVIEW", "Mismatched source must require manual review.");

  const tooFew = buildPostInspectionSourceSufficiencyReport({
    case_id: "synthetic-current-case",
    selected_source_count: 3,
    evidencePlanning: evidencePlanning(["source-a", "source-b", "source-c"]),
    limitedInspection: limitedInspection([usefulItem("source-a")]),
    pdfRelevanceReview: pdfRelevanceReview([{ sourceId: "source-a" }]),
    minUsableFullTextSources: 3,
  });
  assert(tooFew.decision === "NEEDS_SOURCE_REPLACEMENT", "Too few usable inspected sources should require replacement.");
  assert(shouldStopAfterPostInspectionSufficiency({ report: tooFew, allowBlocked: false }), "Too few sources should stop.");

  const noUsable = buildPostInspectionSourceSufficiencyReport({
    case_id: "synthetic-current-case",
    selected_source_count: 2,
    evidencePlanning: evidencePlanning(["source-a", "source-b"]),
    limitedInspection: limitedInspection([
      buildLimitedInspectionItemFromText({
        sourceId: "source-a",
        title: "Neutral current source source-a",
        status: "failed",
        inspectedKind: "unknown",
        text: "",
      }),
    ]),
    pdfRelevanceReview: pdfRelevanceReview([
      { sourceId: "source-a", relevanceClass: "unusable" },
    ]),
  });
  assert(noUsable.decision === "BLOCK_INSUFFICIENT_REAL_EVIDENCE", "No usable real text should block.");
}

run();
console.log("test-post-inspection-source-sufficiency: ok");
