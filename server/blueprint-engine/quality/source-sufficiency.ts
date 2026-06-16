import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import type { MethodGenerationContractV1 } from "@/server/blueprint-engine/quality/method-generation-contract";
import type { ProductionSafetyEvaluation } from "@/server/blueprint-engine/quality/production-safety";
import type { SecondaryReferenceRecoveryQueueV1 } from "@/server/blueprint-engine/quality/secondary-reference-recovery";
import { summarizeSourceHealthFromHandoff } from "@/server/blueprint-engine/quality/source-health";

export type SourceSufficiencyRecommendation = {
  recommendation_id: string;
  category:
    | "add_core_method_sources"
    | "add_theory_or_model_sources"
    | "add_validation_or_data_sources"
    | "add_context_application_sources"
    | "replace_weak_or_adjacent_sources"
    | "recover_secondary_references"
    | "review_user_provided_pdfs";
  priority: "high" | "medium" | "low";
  rationale: string;
  suggested_query_terms: string[];
  acceptance_criteria: string[];
};

export type SourceSufficiencyReportV1 = {
  artifact_type: "source_sufficiency_recommendations";
  artifact_version: "v1";
  generated_at: string;
  handoff_id: string | null;
  case_id: string | null;
  production_eligible: boolean;
  source_count: number;
  usable_full_text_source_count: number;
  metadata_only_source_count: number;
  unresolved_source_count: number;
  adjacent_source_count: number;
  user_provided_pdf_production_review_required: boolean;
  secondary_reference_candidate_count: number;
  recommendations: SourceSufficiencyRecommendation[];
  warnings: string[];
  blockers: string[];
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function methodTerms(contract?: MethodGenerationContractV1 | null) {
  return unique([
    contract?.primary_method_label,
    contract?.selected_strategy_label,
    ...((contract?.technique_terms ?? []).slice(0, 4)),
    ...((contract?.model_terms ?? []).slice(0, 4)),
    ...((contract?.tool_terms ?? []).slice(0, 4)),
    ...((contract?.variable_terms ?? []).slice(0, 4)),
  ]).slice(0, 10);
}

function routeLabel(contract?: MethodGenerationContractV1 | null) {
  return contract?.route && contract.route !== "unknown" ? contract.route : "knowledge_area_route_pending";
}

export function buildSourceSufficiencyReport(input: {
  case_id?: string | null;
  handoff?: EvidenceEngineHandoffV1 | null;
  methodContract?: MethodGenerationContractV1 | null;
  productionSafety?: ProductionSafetyEvaluation | null;
  secondaryReferenceQueue?: SecondaryReferenceRecoveryQueueV1 | null;
  minUsableFullTextSources?: number | null;
  userProvidedPdfProductionReviewRequired?: boolean;
}): SourceSufficiencyReportV1 {
  const handoff = input.handoff ?? null;
  const health = handoff
    ? summarizeSourceHealthFromHandoff(handoff)
    : {
        source_count: 0,
        usable_full_text_source_count: 0,
        metadata_only_source_count: 0,
        unresolved_source_count: 0,
        adjacent_source_count: 0,
      };
  const minUsable = input.minUsableFullTextSources ?? 4;
  const terms = methodTerms(input.methodContract);
  const route = routeLabel(input.methodContract);
  const recommendations: SourceSufficiencyRecommendation[] = [];

  if (health.usable_full_text_source_count < minUsable) {
    recommendations.push({
      recommendation_id: "add-core-method-sources",
      category: "add_core_method_sources",
      priority: "high",
      rationale: `Usable full-text sources are below the production minimum (${health.usable_full_text_source_count}/${minUsable}).`,
      suggested_query_terms: unique([...terms, route, "state of the art", "methodology", "review"]).slice(0, 8),
      acceptance_criteria: [
        "At least the configured minimum of usable full-text sources is selected.",
        "New sources directly support the central method, technique, model, or study strategy.",
        "Sources have recoverable full text and source-backed excerpts.",
      ],
    });
  }

  if ((input.methodContract?.missing_requirements ?? []).length > 0) {
    recommendations.push({
      recommendation_id: "add-theory-or-model-sources",
      category: "add_theory_or_model_sources",
      priority: "high",
      rationale: "The method contract still has missing discipline-specific requirements.",
      suggested_query_terms: unique([
        ...terms,
        ...input.methodContract!.missing_requirements.slice(0, 6),
        "theoretical framework",
        "model",
        "variables",
      ]).slice(0, 10),
      acceptance_criteria: [
        "Missing requirements are supported by recovered source text or assets.",
        "Equations, instruments, protocols, variables, or tools are source-backed when required by the route.",
      ],
    });
  }

  if (health.adjacent_source_count > 0 || health.metadata_only_source_count > 0 || health.unresolved_source_count > 0) {
    recommendations.push({
      recommendation_id: "replace-weak-or-adjacent-sources",
      category: "replace_weak_or_adjacent_sources",
      priority: "high",
      rationale: "Some selected sources are adjacent, metadata-only, or unresolved and should not carry central claims.",
      suggested_query_terms: unique([...terms, "direct evidence", "full text", "empirical validation"]).slice(0, 8),
      acceptance_criteria: [
        "Adjacent/context-only sources are replaced or explicitly limited to background use.",
        "Metadata-only and unresolved sources are not used as production evidence.",
      ],
    });
  }

  if ((input.secondaryReferenceQueue?.candidate_count ?? 0) > 0) {
    recommendations.push({
      recommendation_id: "recover-secondary-references",
      category: "recover_secondary_references",
      priority: "medium",
      rationale: "Recovered PDFs contain cited sources that may strengthen the evidence base but are not yet recovered.",
      suggested_query_terms: input.secondaryReferenceQueue!.candidates
        .slice(0, 6)
        .map((candidate) => candidate.recommended_search_query),
      acceptance_criteria: [
        "Secondary references are searched as new candidates.",
        "Only recovered, selected, and validated secondary references enter final citations.",
      ],
    });
  }

  if (input.userProvidedPdfProductionReviewRequired) {
    recommendations.push({
      recommendation_id: "review-user-provided-pdfs",
      category: "review_user_provided_pdfs",
      priority: "medium",
      rationale: "User-provided PDFs are diagnostic-only until an explicit production review flag exists.",
      suggested_query_terms: [],
      acceptance_criteria: [
        "Reviewer confirms provenance, file integrity, and allowed production use.",
        "Production eligibility keeps blocking until review metadata is explicit.",
      ],
    });
  }

  if (recommendations.length === 0 && !input.productionSafety?.production_eligible) {
    recommendations.push({
      recommendation_id: "resolve-production-blockers",
      category: "add_validation_or_data_sources",
      priority: "medium",
      rationale: "Production is still blocked; inspect the production readiness reasons.",
      suggested_query_terms: unique([...terms, route, "validation", "data"]).slice(0, 8),
      acceptance_criteria: ["All production readiness blockers are resolved without weakening gates."],
    });
  }

  return {
    artifact_type: "source_sufficiency_recommendations",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    handoff_id: handoff?.handoff_id ?? null,
    case_id: input.case_id ?? null,
    production_eligible: input.productionSafety?.production_eligible ?? false,
    source_count: health.source_count,
    usable_full_text_source_count: health.usable_full_text_source_count,
    metadata_only_source_count: health.metadata_only_source_count,
    unresolved_source_count: health.unresolved_source_count,
    adjacent_source_count: health.adjacent_source_count,
    user_provided_pdf_production_review_required: Boolean(input.userProvidedPdfProductionReviewRequired),
    secondary_reference_candidate_count: input.secondaryReferenceQueue?.candidate_count ?? 0,
    recommendations,
    warnings: unique([
      ...(input.productionSafety?.warnings ?? []),
      ...(input.secondaryReferenceQueue?.warnings ?? []),
    ]),
    blockers: input.productionSafety?.production_ineligibility_reasons ?? [],
  };
}

export function renderSourceSufficiencyReport(report: SourceSufficiencyReportV1) {
  return [
    "# Source Sufficiency Recommendations",
    "",
    `- case_id: ${report.case_id ?? "unknown"}`,
    `- handoff_id: ${report.handoff_id ?? "none"}`,
    `- production_eligible: ${report.production_eligible}`,
    `- source_count: ${report.source_count}`,
    `- usable_full_text_source_count: ${report.usable_full_text_source_count}`,
    `- metadata_only_source_count: ${report.metadata_only_source_count}`,
    `- unresolved_source_count: ${report.unresolved_source_count}`,
    `- adjacent_source_count: ${report.adjacent_source_count}`,
    `- secondary_reference_candidate_count: ${report.secondary_reference_candidate_count}`,
    "",
    "## Recommendations",
    ...(report.recommendations.length
      ? report.recommendations.map((item, index) =>
          [
            `${index + 1}. ${item.category} (${item.priority})`,
            `   - rationale: ${item.rationale}`,
            `   - suggested_query_terms: ${item.suggested_query_terms.join("; ") || "none"}`,
            `   - acceptance_criteria: ${item.acceptance_criteria.join(" | ")}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Production Blockers",
    ...(report.blockers.length ? report.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}
