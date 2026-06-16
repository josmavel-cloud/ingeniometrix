import type { DeepResearchLightArtifactsV1 } from "@/server/blueprint-engine/quality/deep-research-light";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";

export type RapidDeepResearchFallbackDecisionReason =
  | "rapid_fallback_cli_not_requested"
  | "post_inspection_not_available"
  | "no_sources_inspected"
  | "no_usable_inspected_source_text"
  | "manual_pdf_or_identity_review_required_first"
  | "evidence_already_sufficient"
  | "post_inspection_gap_detected"
  | "replacement_sources_needed"
  | "secondary_reference_recovery_needed";

export type RapidDeepResearchFallbackDecisionV1 = {
  artifact_type: "rapid_deep_research_fallback_decision";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  requested_by_cli: boolean;
  decision: "run" | "skip";
  eligible_to_call_llm: boolean;
  stage: "post_inspection" | "pre_inspection_unavailable";
  reason_code: RapidDeepResearchFallbackDecisionReason;
  post_inspection_decision: PostInspectionSourceSufficiencyReportV1["decision"] | null;
  inspected_source_count: number;
  usable_source_count: number;
  direct_usable_source_count: number;
  missing_evidence_categories: string[];
  secondary_reference_candidate_count: number;
  deep_research_light_query_family_count: number;
  run_reasons: string[];
  skipped_reasons: string[];
  warnings: string[];
  blockers: string[];
  policy: {
    based_on_post_inspection_only: true;
    does_not_use_step_3_pre_materialization_gate_as_trigger: true;
    requires_human_source_selection: true;
    does_not_bypass_evidence_engine: true;
    does_not_make_candidates_citable: true;
  };
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.replace(/\s+/g, " ").trim()).filter((value): value is string => Boolean(value))),
  );
}

function reason(input: {
  postInspectionSufficiency: PostInspectionSourceSufficiencyReportV1;
  hasMissingCategories: boolean;
  hasSecondaryReferenceCandidates: boolean;
}) {
  if (input.postInspectionSufficiency.decision === "NEEDS_SOURCE_REPLACEMENT") {
    return "replacement_sources_needed" satisfies RapidDeepResearchFallbackDecisionReason;
  }

  if (input.hasSecondaryReferenceCandidates) {
    return "secondary_reference_recovery_needed" satisfies RapidDeepResearchFallbackDecisionReason;
  }

  if (
    input.postInspectionSufficiency.decision === "NEEDS_DEEP_RESEARCH_LIGHT" ||
    input.hasMissingCategories
  ) {
    return "post_inspection_gap_detected" satisfies RapidDeepResearchFallbackDecisionReason;
  }

  return "evidence_already_sufficient" satisfies RapidDeepResearchFallbackDecisionReason;
}

export function buildRapidDeepResearchFallbackDecision(input: {
  caseId?: string | null;
  requestedByCli: boolean;
  postInspectionSufficiency?: PostInspectionSourceSufficiencyReportV1 | null;
  deepResearchLight?: DeepResearchLightArtifactsV1 | null;
}): RapidDeepResearchFallbackDecisionV1 {
  const post = input.postInspectionSufficiency ?? null;
  const base = {
    artifact_type: "rapid_deep_research_fallback_decision" as const,
    artifact_version: "v1" as const,
    generated_at: new Date().toISOString(),
    case_id: input.caseId ?? post?.case_id ?? null,
    requested_by_cli: input.requestedByCli,
    post_inspection_decision: post?.decision ?? null,
    inspected_source_count: post?.inspected_source_count ?? 0,
    usable_source_count: post?.usable_source_count ?? 0,
    direct_usable_source_count: post?.direct_usable_source_count ?? 0,
    missing_evidence_categories: post?.missing_evidence_categories ?? [],
    secondary_reference_candidate_count: post?.secondary_reference_candidate_count ?? 0,
    deep_research_light_query_family_count: input.deepResearchLight?.searchPlan.query_families.length ?? 0,
    warnings: unique([
      ...(post?.warnings ?? []),
      "Rapid Deep Research fallback is discovery-only; candidates still require source selection and Evidence Engine processing.",
    ]),
    blockers: [...(post?.blockers ?? [])],
    policy: {
      based_on_post_inspection_only: true as const,
      does_not_use_step_3_pre_materialization_gate_as_trigger: true as const,
      requires_human_source_selection: true as const,
      does_not_bypass_evidence_engine: true as const,
      does_not_make_candidates_citable: true as const,
    },
  };

  if (!input.requestedByCli) {
    return {
      ...base,
      decision: "skip",
      eligible_to_call_llm: false,
      stage: post ? "post_inspection" : "pre_inspection_unavailable",
      reason_code: "rapid_fallback_cli_not_requested",
      run_reasons: [],
      skipped_reasons: ["The --rapid-deep-research-fallback flag was not provided."],
    };
  }

  if (!post) {
    return {
      ...base,
      decision: "skip",
      eligible_to_call_llm: false,
      stage: "pre_inspection_unavailable",
      reason_code: "post_inspection_not_available",
      run_reasons: [],
      skipped_reasons: [
        "Post-inspection source sufficiency is not available; rapid Deep Research cannot be triggered by Step 3 metadata/pre-materialization gates.",
      ],
    };
  }

  if (post.inspected_source_count <= 0) {
    return {
      ...base,
      decision: "skip",
      eligible_to_call_llm: false,
      stage: "post_inspection",
      reason_code: "no_sources_inspected",
      run_reasons: [],
      skipped_reasons: [
        "No sources were inspected; recover/download/reselect sources before asking Deep Research to fill evidence gaps.",
      ],
    };
  }

  if (post.usable_source_count <= 0) {
    return {
      ...base,
      decision: "skip",
      eligible_to_call_llm: false,
      stage: "post_inspection",
      reason_code: "no_usable_inspected_source_text",
      run_reasons: [],
      skipped_reasons: [
        "No usable inspected source text is available; rapid Deep Research would be based on access failure rather than real evidence gaps.",
      ],
    };
  }

  if (post.decision === "NEEDS_MANUAL_PDF_REVIEW") {
    return {
      ...base,
      decision: "skip",
      eligible_to_call_llm: false,
      stage: "post_inspection",
      reason_code: "manual_pdf_or_identity_review_required_first",
      run_reasons: [],
      skipped_reasons: [
        "At least one source requires PDF/document identity review; resolve source identity before expanding with Deep Research.",
      ],
    };
  }

  const hasMissingCategories = post.missing_evidence_categories.length > 0;
  const hasSecondaryReferenceCandidates = post.secondary_reference_candidate_count > 0;
  const hasReplacementNeed = post.decision === "NEEDS_SOURCE_REPLACEMENT";
  const shouldRun =
    post.decision === "NEEDS_DEEP_RESEARCH_LIGHT" ||
    hasMissingCategories ||
    hasSecondaryReferenceCandidates ||
    hasReplacementNeed;

  if (!shouldRun) {
    return {
      ...base,
      decision: "skip",
      eligible_to_call_llm: false,
      stage: "post_inspection",
      reason_code: "evidence_already_sufficient",
      run_reasons: [],
      skipped_reasons: [
        "Post-inspection evidence is sufficient for the configured diagnostic path; no rapid Deep Research fallback is needed.",
      ],
    };
  }

  return {
    ...base,
    decision: "run",
    eligible_to_call_llm: true,
    stage: "post_inspection",
    reason_code: reason({
      postInspectionSufficiency: post,
      hasMissingCategories,
      hasSecondaryReferenceCandidates,
    }),
    run_reasons: unique([
      hasReplacementNeed
        ? "Post-inspection source set needs additional/replacement candidates based on inspected content."
        : null,
      hasMissingCategories
        ? `Post-inspection missing categories: ${post.missing_evidence_categories.join("; ")}.`
        : null,
      hasSecondaryReferenceCandidates
        ? `${post.secondary_reference_candidate_count} secondary reference candidate(s) were detected and need independent recovery.`
        : null,
      post.decision === "NEEDS_DEEP_RESEARCH_LIGHT"
        ? "Post-inspection source sufficiency explicitly recommends Deep Research Light."
        : null,
    ]),
    skipped_reasons: [],
  };
}

export function renderRapidDeepResearchFallbackDecisionReport(
  decision: RapidDeepResearchFallbackDecisionV1,
) {
  return [
    "# Rapid Deep Research Fallback Decision",
    "",
    `- case_id: ${decision.case_id ?? "unknown"}`,
    `- requested_by_cli: ${decision.requested_by_cli}`,
    `- decision: ${decision.decision}`,
    `- eligible_to_call_llm: ${decision.eligible_to_call_llm}`,
    `- reason_code: ${decision.reason_code}`,
    `- stage: ${decision.stage}`,
    `- post_inspection_decision: ${decision.post_inspection_decision ?? "none"}`,
    `- inspected_source_count: ${decision.inspected_source_count}`,
    `- usable_source_count: ${decision.usable_source_count}`,
    `- direct_usable_source_count: ${decision.direct_usable_source_count}`,
    `- missing_evidence_categories: ${decision.missing_evidence_categories.join("; ") || "none"}`,
    `- secondary_reference_candidate_count: ${decision.secondary_reference_candidate_count}`,
    `- deep_research_light_query_family_count: ${decision.deep_research_light_query_family_count}`,
    "",
    "## Policy",
    "- This decision is based on post-inspection evidence only.",
    "- Step 3 pre-materialization gates are not valid triggers for the LLM fallback.",
    "- Deep Research candidates still require human source selection and Evidence Engine processing.",
    "",
    "## Run Reasons",
    ...(decision.run_reasons.length ? decision.run_reasons.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Skipped Reasons",
    ...(decision.skipped_reasons.length ? decision.skipped_reasons.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Warnings",
    ...(decision.warnings.length ? decision.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Blockers",
    ...(decision.blockers.length ? decision.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}
