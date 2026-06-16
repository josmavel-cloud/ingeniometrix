import assert from "node:assert/strict";

import {
  buildEvidenceGapActionPlan,
  renderEvidenceGapActionPlanReport,
} from "@/server/blueprint-engine/quality/evidence-gap-action-plan";
import { buildQualityDashboard, renderProductionReadinessReport } from "@/server/blueprint-engine/quality/production-readiness-dashboard";
import { buildRapidDeepResearchFallbackDecision } from "@/server/blueprint-engine/quality/rapid-deep-research-fallback-decision";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";
import { buildEvidenceGapRunSummaryFields } from "@/scripts/run-evidence-selected-sources-steps-2-6";

function postReport(
  overrides: Partial<PostInspectionSourceSufficiencyReportV1> = {},
): PostInspectionSourceSufficiencyReportV1 {
  return {
    artifact_type: "post_inspection_source_sufficiency",
    artifact_version: "v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    case_id: "case-neutral",
    decision: "READY_FOR_FULL_EXTRACTION",
    selected_source_count: 4,
    inspected_source_count: 4,
    usable_source_count: 4,
    direct_usable_source_count: 2,
    contextual_or_partial_source_count: 2,
    method_signal_source_count: 2,
    theory_signal_source_count: 2,
    variable_signal_source_count: 2,
    equation_candidate_count: 0,
    table_candidate_count: 0,
    figure_candidate_count: 0,
    secondary_reference_candidate_count: 0,
    source_ids_ready_for_full_extraction: ["src-1", "src-2", "src-3", "src-4"],
    source_ids_needing_replacement: [],
    source_ids_needing_manual_review: [],
    source_ids_for_deep_research_light: [],
    missing_evidence_categories: [],
    recommendations: [],
    reasons: ["Synthetic source set is sufficient."],
    warnings: [],
    blockers: [],
    ...overrides,
  };
}

function decision(post: PostInspectionSourceSufficiencyReportV1, requestedByCli = false) {
  return buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli,
    postInspectionSufficiency: post,
  });
}

function testReadyPlanContinues() {
  const post = postReport();
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });

  assert.equal(plan.status, "ready_for_full_extraction");
  assert.equal(plan.can_continue_full_extraction, true);
  assert.equal(plan.should_run_rapid_deep_research, false);
  assert.equal(plan.actions[0]?.action_type, "continue_full_extraction");
}

function testManualPdfReviewBlocksAndGuidesUpload() {
  const post = postReport({
    decision: "NEEDS_MANUAL_PDF_REVIEW",
    source_ids_needing_manual_review: ["src-2"],
    blockers: ["Source identity review required."],
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });

  assert.equal(plan.status, "needs_manual_pdf_or_identity_review");
  assert.equal(plan.can_continue_full_extraction, false);
  assert.equal(plan.should_upload_user_pdfs, true);
  assert.equal(plan.actions.some((item) => item.action_type === "upload_or_review_user_provided_pdfs"), true);
}

function testNoUsableEvidenceBlocksWithoutDeepResearch() {
  const post = postReport({
    decision: "BLOCK_INSUFFICIENT_REAL_EVIDENCE",
    inspected_source_count: 2,
    usable_source_count: 0,
    direct_usable_source_count: 0,
    source_ids_needing_replacement: ["src-1", "src-2"],
    missing_evidence_categories: ["direct_nuclear_sources"],
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });

  assert.equal(plan.status, "blocked_no_usable_evidence");
  assert.equal(plan.can_continue_full_extraction, false);
  assert.equal(plan.should_run_rapid_deep_research, false);
  assert.equal(plan.actions.some((item) => item.action_type === "stop_and_replace_sources"), true);
}

function testPostInspectionGapsRecommendRapidFallback() {
  const post = postReport({
    decision: "NEEDS_DEEP_RESEARCH_LIGHT",
    method_signal_source_count: 0,
    theory_signal_source_count: 0,
    missing_evidence_categories: ["method_or_study_design", "theory_or_model"],
    source_ids_for_deep_research_light: ["src-1", "src-2"],
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });

  assert.equal(plan.status, "needs_deep_research_fallback");
  assert.equal(plan.should_run_rapid_deep_research, true);
  assert.equal(plan.actions.some((item) => item.action_type === "run_rapid_deep_research_fallback"), true);
}

function testPublishedSupplementRunReturnsToSourceSelection() {
  const post = postReport({
    decision: "NEEDS_DEEP_RESEARCH_LIGHT",
    missing_evidence_categories: ["variables_or_indicators"],
    source_ids_for_deep_research_light: ["src-3"],
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
    supplementRunFolder: "artifacts-local/evidence-candidate-search-runs/case-neutral/supplement",
    supplementCandidateCount: 3,
  });

  assert.equal(plan.status, "deep_research_supplement_ready_for_selection");
  assert.equal(plan.should_return_to_source_selection, true);
  assert.equal(plan.actions.some((item) => item.action_type === "select_deep_research_supplement_sources"), true);
}

function testSecondaryReferencesAreActionableButDoNotBlock() {
  const post = postReport({
    decision: "READY_WITH_WARNINGS",
    secondary_reference_candidate_count: 5,
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });

  assert.equal(plan.should_recover_secondary_references, true);
  assert.equal(plan.can_continue_full_extraction, true);
  assert.equal(plan.actions.some((item) => item.action_type === "recover_secondary_references"), true);
}

function testReportIsNeutralAndPolicyExplicit() {
  const post = postReport({
    decision: "NEEDS_SOURCE_REPLACEMENT",
    usable_source_count: 1,
    direct_usable_source_count: 1,
    source_ids_needing_replacement: ["src-2", "src-3"],
  });
  const report = renderEvidenceGapActionPlanReport(
    buildEvidenceGapActionPlan({
      postInspectionSufficiency: post,
      rapidFallbackDecision: decision(post, true),
    }),
  ).toLowerCase();

  assert.ok(report.includes("evidence engine"));
  assert.ok(report.includes("seleccion humana"));
  for (const stale of ["adaptive reuse", "toronto", "seismic isolators", "shaking table"]) {
    assert.equal(report.includes(stale), false, `Unexpected stale term in action plan report: ${stale}`);
  }
}

function testRunSummaryFieldsExposeActionPlan() {
  const post = postReport({
    decision: "NEEDS_SOURCE_REPLACEMENT",
    usable_source_count: 1,
    source_ids_needing_replacement: ["src-3"],
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });
  const fields = buildEvidenceGapRunSummaryFields(plan);

  assert.equal(fields.evidence_gap_action_status, "needs_source_replacement");
  assert.equal(fields.evidence_gap_should_return_to_source_selection, true);
  assert.equal(fields.evidence_gap_should_upload_user_pdfs, false);
  assert.equal(fields.evidence_gap_action_count > 0, true);
}

function testDashboardAndProductionReportExposeActionPlan() {
  const post = postReport({
    decision: "NEEDS_MANUAL_PDF_REVIEW",
    source_ids_needing_manual_review: ["src-2"],
  });
  const plan = buildEvidenceGapActionPlan({
    postInspectionSufficiency: post,
    rapidFallbackDecision: decision(post, true),
  });
  const dashboard = buildQualityDashboard({
    run_id: "run-neutral",
    case_id: "case-neutral",
    evidence_gap_action_plan: plan,
  });
  const report = renderProductionReadinessReport(dashboard);

  assert.equal(dashboard.evidence_gap_action_plan.present, true);
  assert.equal(dashboard.evidence_gap_action_plan.status, "needs_manual_pdf_or_identity_review");
  assert.equal(dashboard.next_recommended_action, plan.recommended_next_action_es);
  assert.ok(report.includes("Evidence Gap Action Plan"));
  assert.ok(report.includes("should_upload_user_pdfs: true"));
}

function main() {
  testReadyPlanContinues();
  testManualPdfReviewBlocksAndGuidesUpload();
  testNoUsableEvidenceBlocksWithoutDeepResearch();
  testPostInspectionGapsRecommendRapidFallback();
  testPublishedSupplementRunReturnsToSourceSelection();
  testSecondaryReferencesAreActionableButDoNotBlock();
  testReportIsNeutralAndPolicyExplicit();
  testRunSummaryFieldsExposeActionPlan();
  testDashboardAndProductionReportExposeActionPlan();
  console.log("test-evidence-gap-action-plan: pass");
}

main();
