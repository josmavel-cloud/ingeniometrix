import type {
  EvidenceLedger,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number) {
  return Number.parseFloat(value.toFixed(2));
}

function ratio(numerator: number, denominator: number) {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function isRealFallback(draft: MasterSectionDraft) {
  return Boolean(
    draft.fallback_cause && draft.fallback_cause !== "deterministic_section",
  );
}

function allQualityChecks(draft: MasterSectionDraft) {
  return Object.values(draft.quality_checks ?? {});
}

function passRatio(values: boolean[]) {
  return values.length === 0
    ? 1
    : ratio(values.filter(Boolean).length, values.length);
}

function buildSectionDiagnostics(drafts: MasterSectionDraft[]) {
  return drafts
    .filter((draft) => draft.section_key !== "consistency_matrix")
    .map((draft) => {
      const failedChecks = Object.entries(draft.quality_checks ?? {})
        .filter(([, value]) => !value)
        .map(([key]) => key);

      return {
        section_key: draft.section_key,
        wave: draft.wave ?? null,
        words: countWords(draft.content),
        prompt_chars: draft.prompt?.length ?? 0,
        execution_mode: draft.execution_profile?.execution_mode ?? null,
        fallback_cause: draft.fallback_cause ?? null,
        real_fallback: isRealFallback(draft),
        attempt_count: draft.attempt_count ?? 0,
        total_tokens: draft.llm_metrics?.total_tokens ?? 0,
        cost_cad: draft.llm_metrics?.cost_cad ?? 0,
        duration_ms: draft.llm_metrics?.duration_ms ?? 0,
        used_evidence_count: draft.used_evidence_ids?.length ?? 0,
        used_original_excerpt_count: draft.used_original_excerpt_ids?.length ?? 0,
        used_reference_count: draft.used_reference_ids?.length ?? 0,
        used_asset_count: draft.used_asset_keys?.length ?? 0,
        failed_checks: failedChecks,
      };
    });
}

export function buildPackageQualitySummary(input: {
  caseName: string;
  runDir?: string | null;
  generatedAt?: string;
  promptPlan?: SectionPromptPlan | null;
  drafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
  validationReport?: MasterBlueprintValidationReport | null;
  execution?: {
    llm_enabled?: boolean;
    llm_policy?: "required" | "disabled";
    provider_name?: string | null;
    model_name?: string | null;
    fallback_sections_count?: number;
  } | null;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const drafts = input.drafts.filter(
    (draft) => draft.section_key !== "consistency_matrix",
  );
  const diagnostics = buildSectionDiagnostics(input.drafts);
  const llmDrafts = drafts.filter((draft) => draft.llm_metrics);
  const deterministicDrafts = drafts.filter(
    (draft) => draft.fallback_cause === "deterministic_section",
  );
  const realFallbackDrafts = drafts.filter(isRealFallback);
  const allChecks = drafts.flatMap(allQualityChecks);
  const maxWordFailures = drafts.filter(
    (draft) => draft.quality_checks?.max_words_pass === false,
  );
  const claimFailures = drafts.filter(
    (draft) => draft.quality_checks?.claims_guard_pass === false,
  );
  const languageFailures = drafts.filter(
    (draft) => draft.quality_checks?.language_pass === false,
  );
  const formatFailures = drafts.filter(
    (draft) => draft.quality_checks?.format_contamination_pass === false,
  );
  const citationDeferredFailures = drafts.filter(
    (draft) => draft.quality_checks?.citation_deferred_pass === false,
  );
  const punctuationFailures = drafts.filter(
    (draft) => draft.quality_checks?.punctuation_pass === false,
  );
  const withEvidence = drafts.filter(
    (draft) => (draft.used_evidence_ids?.length ?? 0) > 0,
  );
  const withOriginalExcerpts = drafts.filter(
    (draft) => (draft.used_original_excerpt_ids?.length ?? 0) > 0,
  );
  const withReferences = drafts.filter(
    (draft) => (draft.used_reference_ids?.length ?? 0) > 0,
  );
  const withSources = drafts.filter(
    (draft) => (draft.supported_source_ids?.length ?? 0) > 0,
  );
  const withAssetIntents = drafts.filter(
    (draft) =>
      (draft.used_asset_keys?.length ?? 0) > 0 &&
      (draft.asset_placement_intents?.length ?? 0) >=
        (draft.used_asset_keys?.length ?? 0),
  );
  const assetUsingDrafts = drafts.filter(
    (draft) => (draft.used_asset_keys?.length ?? 0) > 0,
  );
  const totalTokens = drafts.reduce(
    (sum, draft) => sum + (draft.llm_metrics?.total_tokens ?? 0),
    0,
  );
  const totalCostCad = drafts.reduce(
    (sum, draft) => sum + (draft.llm_metrics?.cost_cad ?? 0),
    0,
  );
  const totalDurationMs = drafts.reduce(
    (sum, draft) => sum + (draft.llm_metrics?.duration_ms ?? 0),
    0,
  );
  const totalPromptChars = drafts.reduce(
    (sum, draft) => sum + (draft.prompt?.length ?? 0),
    0,
  );

  const contentQualityScore = clamp01(
    passRatio(allChecks) * 0.7 +
      (1 - ratio(maxWordFailures.length, drafts.length)) * 0.2 +
      (1 -
        ratio(
          drafts.filter((draft) => countWords(draft.content) < 40).length,
          drafts.length,
        )) *
        0.1,
  );
  const traceabilityScore = clamp01(
    ratio(withSources.length, drafts.length) * 0.25 +
      ratio(withEvidence.length, drafts.length) * 0.25 +
      ratio(withOriginalExcerpts.length, drafts.length) * 0.2 +
      ratio(withReferences.length, drafts.length) * 0.25 +
      clamp01(input.evidenceLedger.source_registry.length / 6) * 0.05,
  );
  const executionScore = clamp01(
    (1 - ratio(realFallbackDrafts.length, drafts.length)) * 0.45 +
      (1 - ratio(drafts.filter((draft) => (draft.attempt_count ?? 0) > 1).length, drafts.length)) *
        0.15 +
      ratio(llmDrafts.length + deterministicDrafts.length, drafts.length) * 0.25 +
      (totalCostCad <= 1 ? 0.15 : totalCostCad <= 2 ? 0.08 : 0.02),
  );
  const academicSafetyScore = clamp01(
    (1 - ratio(claimFailures.length, drafts.length)) * 0.35 +
      (1 - ratio(languageFailures.length, drafts.length)) * 0.2 +
      (1 - ratio(citationDeferredFailures.length, drafts.length)) * 0.25 +
      (input.validationReport?.quality_report.semantic_review?.criteria.find(
        (criterion) => criterion.key === "academic_prudence",
      )?.score_5 ?? 4) /
        5 *
        0.2,
  );
  const assetDocxReadinessScore =
    assetUsingDrafts.length === 0
      ? 0.75
      : clamp01(ratio(withAssetIntents.length, assetUsingDrafts.length));
  const overallPackageScore100 = round2(
    100 *
      clamp01(
        contentQualityScore * 0.25 +
          traceabilityScore * 0.25 +
          executionScore * 0.2 +
          academicSafetyScore * 0.2 +
          assetDocxReadinessScore * 0.1,
      ),
  );

  return {
    artifact_type: "package_quality_summary",
    artifact_version: "v1",
    generated_at: generatedAt,
    case_name: input.caseName,
    run_dir: input.runDir ?? null,
    benchmark_ready: true,
    overall_package_score_100: overallPackageScore100,
    component_scores_100: {
      content_quality: round2(contentQualityScore * 100),
      traceability: round2(traceabilityScore * 100),
      execution: round2(executionScore * 100),
      academic_safety: round2(academicSafetyScore * 100),
      asset_docx_readiness: round2(assetDocxReadinessScore * 100),
    },
    gates: {
      validation_passed: input.validationReport?.quality_report.passed ?? null,
      validation_score_10: input.validationReport?.quality_report.score_10 ?? null,
      real_fallback_count: realFallbackDrafts.length,
      deterministic_section_count: deterministicDrafts.length,
      max_word_failure_count: maxWordFailures.length,
      claims_guard_failure_count: claimFailures.length,
      language_failure_count: languageFailures.length,
      format_contamination_failure_count: formatFailures.length,
      citation_deferred_failure_count: citationDeferredFailures.length,
      punctuation_failure_count: punctuationFailures.length,
      sections_without_references_count: drafts.length - withReferences.length,
    },
    execution: {
      llm_enabled: input.execution?.llm_enabled ?? null,
      llm_policy: input.execution?.llm_policy ?? null,
      provider_name: input.execution?.provider_name ?? null,
      model_name: input.execution?.model_name ?? null,
      llm_section_count: llmDrafts.length,
      deterministic_section_count: deterministicDrafts.length,
      total_tokens: totalTokens,
      total_cost_cad: round2(totalCostCad),
      total_duration_ms: totalDurationMs,
      total_prompt_chars: totalPromptChars,
    },
    coverage: {
      draft_count: drafts.length,
      prompt_plan_section_count: input.promptPlan?.generation_plan.length ?? null,
      sections_with_sources: withSources.length,
      sections_with_evidence_ids: withEvidence.length,
      sections_with_original_excerpts: withOriginalExcerpts.length,
      sections_with_references: withReferences.length,
      sections_with_assets: assetUsingDrafts.length,
      sections_with_asset_placement_intents: withAssetIntents.length,
    },
    worst_sections: diagnostics
      .filter(
        (section) =>
          section.real_fallback ||
          section.failed_checks.length > 0 ||
          section.used_reference_count === 0,
      )
      .sort(
        (left, right) =>
          Number(right.real_fallback) - Number(left.real_fallback) ||
          right.failed_checks.length - left.failed_checks.length ||
          right.prompt_chars - left.prompt_chars,
      )
      .slice(0, 12),
    top_cost_sections: diagnostics
      .slice()
      .sort((left, right) => right.cost_cad - left.cost_cad)
      .slice(0, 8),
    diagnostics,
  };
}
