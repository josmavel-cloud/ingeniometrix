import assert from "node:assert/strict";

import {
  buildRapidDeepResearchFallbackDecision,
  renderRapidDeepResearchFallbackDecisionReport,
} from "@/server/blueprint-engine/quality/rapid-deep-research-fallback-decision";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";

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

function testFlagIsOnlyPermissionNotTrigger() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: false,
    postInspectionSufficiency: postReport({
      decision: "NEEDS_DEEP_RESEARCH_LIGHT",
      missing_evidence_categories: ["theory_or_model"],
    }),
  });

  assert.equal(decision.decision, "skip");
  assert.equal(decision.eligible_to_call_llm, false);
  assert.equal(decision.reason_code, "rapid_fallback_cli_not_requested");
}

function testStep3AloneCannotTriggerFallback() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: null,
  });

  assert.equal(decision.decision, "skip");
  assert.equal(decision.stage, "pre_inspection_unavailable");
  assert.equal(decision.reason_code, "post_inspection_not_available");
  assert.ok(decision.skipped_reasons.join(" ").includes("Step 3"));
  assert.equal(decision.policy.does_not_use_step_3_pre_materialization_gate_as_trigger, true);
}

function testEnoughEvidenceSkipsFallbackEvenWhenRequested() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport(),
  });

  assert.equal(decision.decision, "skip");
  assert.equal(decision.eligible_to_call_llm, false);
  assert.equal(decision.reason_code, "evidence_already_sufficient");
}

function testNoInspectedSourceSkipsFallback() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "BLOCK_INSUFFICIENT_REAL_EVIDENCE",
      inspected_source_count: 0,
      usable_source_count: 0,
      direct_usable_source_count: 0,
      missing_evidence_categories: ["direct_nuclear_sources"],
    }),
  });

  assert.equal(decision.decision, "skip");
  assert.equal(decision.reason_code, "no_sources_inspected");
}

function testNoUsableTextSkipsFallback() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "BLOCK_INSUFFICIENT_REAL_EVIDENCE",
      inspected_source_count: 3,
      usable_source_count: 0,
      direct_usable_source_count: 0,
      missing_evidence_categories: ["direct_nuclear_sources"],
    }),
  });

  assert.equal(decision.decision, "skip");
  assert.equal(decision.reason_code, "no_usable_inspected_source_text");
}

function testManualReviewSkipsFallback() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "NEEDS_MANUAL_PDF_REVIEW",
      source_ids_needing_manual_review: ["src-2"],
      blockers: ["Source identity review required."],
    }),
  });

  assert.equal(decision.decision, "skip");
  assert.equal(decision.reason_code, "manual_pdf_or_identity_review_required_first");
}

function testPostInspectionGapsTriggerFallback() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "NEEDS_DEEP_RESEARCH_LIGHT",
      missing_evidence_categories: ["method_or_study_design", "theory_or_model"],
      method_signal_source_count: 0,
      theory_signal_source_count: 0,
      blockers: ["Post-inspection evidence categories remain incomplete."],
    }),
  });

  assert.equal(decision.decision, "run");
  assert.equal(decision.eligible_to_call_llm, true);
  assert.equal(decision.reason_code, "post_inspection_gap_detected");
  assert.ok(decision.run_reasons.join(" ").includes("method_or_study_design"));
}

function testSecondaryReferencesCanTriggerFallback() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "READY_WITH_WARNINGS",
      secondary_reference_candidate_count: 3,
      warnings: ["secondary references detected"],
    }),
  });

  assert.equal(decision.decision, "run");
  assert.equal(decision.reason_code, "secondary_reference_recovery_needed");
}

function testReplacementNeedCanTriggerFallbackAfterSomeUsableInspection() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "NEEDS_SOURCE_REPLACEMENT",
      usable_source_count: 1,
      direct_usable_source_count: 1,
      source_ids_needing_replacement: ["src-3", "src-4"],
      blockers: ["Usable inspected source count is below the configured minimum."],
    }),
  });

  assert.equal(decision.decision, "run");
  assert.equal(decision.reason_code, "replacement_sources_needed");
}

function testReportIsPolicyExplicitAndNeutral() {
  const decision = buildRapidDeepResearchFallbackDecision({
    caseId: "case-neutral",
    requestedByCli: true,
    postInspectionSufficiency: postReport({
      decision: "NEEDS_DEEP_RESEARCH_LIGHT",
      missing_evidence_categories: ["variables_or_indicators"],
    }),
  });
  const report = renderRapidDeepResearchFallbackDecisionReport(decision).toLowerCase();
  assert.ok(report.includes("post-inspection evidence only"));
  assert.ok(report.includes("step 3 pre-materialization gates are not valid triggers"));
  for (const stale of ["adaptive reuse", "toronto", "seismic isolators", "shaking table"]) {
    assert.equal(report.includes(stale), false, `Unexpected stale term in decision report: ${stale}`);
  }
}

function main() {
  testFlagIsOnlyPermissionNotTrigger();
  testStep3AloneCannotTriggerFallback();
  testEnoughEvidenceSkipsFallbackEvenWhenRequested();
  testNoInspectedSourceSkipsFallback();
  testNoUsableTextSkipsFallback();
  testManualReviewSkipsFallback();
  testPostInspectionGapsTriggerFallback();
  testSecondaryReferencesCanTriggerFallback();
  testReplacementNeedCanTriggerFallbackAfterSomeUsableInspection();
  testReportIsPolicyExplicitAndNeutral();
  console.log("test-rapid-deep-research-fallback-decision: pass");
}

main();
