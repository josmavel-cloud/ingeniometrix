import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfiguredLlmProvider } from "@/llm";
import type { LlmProvider } from "@/llm/provider";
import type {
  AssetHandoffRecord,
  EvidenceEngineHandoffV1,
  EvidenceUnitHandoffRecord,
  JsonValue,
  SectionPacketHandoffRecord,
  SourceHandoffRecord,
} from "@/server/blueprint-engine/contracts";
import { summarizeCitationSemantics } from "@/server/blueprint-engine/quality/citation-semantics";
import type { ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";
import {
  summarizeSourceHealthFromHandoff,
  type SourceAllowedEvidenceUse,
  type SourceHealth,
  type SourceHealthClassification,
  type SourceHealthSummary,
  type SourceTopicFit,
} from "@/server/blueprint-engine/quality/source-health";
import { readLlmUsageRegistry, type LlmUsageTotals } from "@/server/llm-usage-registry";

export const METHOD_SELECTION_PROMPT_VERSION = "method_selection_prompt.v1";
const METHOD_SELECTION_CACHE_VERSION = "method_selection_cache.v1";
const DEFAULT_METHOD_SELECTION_CACHE_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "method-selection-cache",
);

export type KnowledgeAreaRoute =
  | "engineering"
  | "medicine_public_health"
  | "business"
  | "education"
  | "social_science"
  | "public_policy"
  | "environmental"
  | "humanities"
  | "law"
  | "interdisciplinary"
  | "unknown";

export type MethodSelectionStatus =
  | "selected"
  | "provisional"
  | "insufficient_evidence"
  | "blocked";

export type MethodSelectionConfidence = "high" | "medium" | "low" | "blocked" | "unknown";
export type CandidateConfidence = "high" | "medium" | "low" | "insufficient" | "unknown";

export type StudyStrategyFamily =
  | "single_method"
  | "method_comparison"
  | "systematic_review"
  | "simulation"
  | "experimental_design"
  | "case_study"
  | "mixed_method"
  | "design_science"
  | "model_validation"
  | "evidence_based_evaluation"
  | "quantitative_observational"
  | "qualitative"
  | "unknown";

export type CandidateType =
  | "method"
  | "theory"
  | "technique"
  | "model"
  | "tool_software"
  | "variable_indicator"
  | "data_source"
  | "instrument_protocol"
  | "validation_strategy";

export type CandidateEvidenceStrength =
  | "direct_source_backed"
  | "paraphrase_source_backed"
  | "asset_backed"
  | "metadata_only"
  | "intake_only"
  | "required_but_missing"
  | "unsupported";

export type MethodRequirementType =
  | "analytical_model"
  | "equation_or_formula"
  | "statistical_model"
  | "theoretical_framework"
  | "research_design"
  | "instrument_or_protocol"
  | "data_collection_plan"
  | "sampling_plan"
  | "variable_indicator_matrix"
  | "software_or_tool"
  | "validation_strategy"
  | "ethics_or_compliance";

export type DisciplineRequirementStatus =
  | "source_backed"
  | "inferred_need"
  | "required_but_missing"
  | "not_applicable";

export type DisciplineRequirementUsePolicy =
  | "can_render_equation"
  | "describe_model_only"
  | "describe_design_only"
  | "describe_protocol_only"
  | "declare_pending_validation"
  | "do_not_use";

export type MethodSelectionProjectContextV1 = {
  project_id: string;
  language: string;
  country_context: string;
  degree_level: string;
  knowledge_area_label: string | null;
  template_key: string | null;
  topic_summary: string | null;
  problem_summary: string | null;
  research_line_summary: string | null;
  population_or_context_summary: string | null;
};

export type MethodSelectionIntakeWeakPriorV1 = {
  methodology_preference: string | null;
  available_data: string | null;
  constraints: string | null;
  advisor_or_user_notes: string | null;
  warning: "intake_is_weak_prior_not_evidence";
};

export type MethodSelectionSourceContextV1 = {
  source_id: string;
  title: string;
  year: number | null;
  venue: string | null;
  abstract_or_secondary_summary: string | null;
  source_health: SourceHealth;
  topic_fit: SourceTopicFit;
  allowed_evidence_use: SourceAllowedEvidenceUse;
};

export type KnowledgeAreaRouteDecision = {
  route: KnowledgeAreaRoute;
  confidence: "high" | "medium" | "low" | "unknown";
  route_evidence_ids: string[];
  route_source_ids: string[];
  modern_methodology_families: string[];
  borrowed_method_warnings: string[];
};

export type MethodSelectionEvidenceUnitContextV1 = {
  evidence_id: string;
  source_id: string;
  section_keys: string[];
  unit_type: EvidenceUnitHandoffRecord["unit_type"];
  citation_eligibility: EvidenceUnitHandoffRecord["citation_eligibility"];
  claim_scope: EvidenceUnitHandoffRecord["claim_scope"];
  evidence_use: "direct" | "cautious" | "context_only" | "gap_only" | "do_not_use";
  source_health: SourceHealth;
  topic_fit: SourceTopicFit;
  allowed_evidence_use: SourceAllowedEvidenceUse;
  priority: "primary" | "secondary" | "demoted";
  relevance_reason: string;
  text_excerpt: string | null;
  summary_es: string | null;
  asset_key: string | null;
  score: number;
};

export type MethodSelectionSectionPacketContextV1 = {
  section_key: string;
  readiness: string;
  summary: string | null;
  evidence_ids: string[];
  source_ids: string[];
  key_points: string[];
  missing_elements: string[];
  do_not_claim: string[];
};

export type MethodSelectionAssetContextV1 = {
  asset_key: string;
  source_id: string;
  asset_kind: AssetHandoffRecord["asset_kind"];
  title: string | null;
  caption: string | null;
  text_content: string | null;
  latex: string | null;
  citation_eligibility: AssetHandoffRecord["citation_eligibility"];
  recommended_section_keys: string[];
};

export type MethodSelectionEvidenceContextV1 = {
  artifact_type: "method_selection_evidence_context";
  artifact_version: "v1";
  generated_at: string;
  prompt_version: typeof METHOD_SELECTION_PROMPT_VERSION;
  project_context: MethodSelectionProjectContextV1;
  intake_weak_prior: MethodSelectionIntakeWeakPriorV1;
  handoff_id: string;
  evidence_run_id: string | null;
  immutable_snapshot_hash: string | null;
  evidence_quality_context: MethodSelectionArtifactV1["evidence_quality_context"];
  source_health_summary: Omit<SourceHealthSummary, "sources">;
  citation_semantics_summary: ReturnType<typeof summarizeCitationSemantics>;
  sources: MethodSelectionSourceContextV1[];
  reduced_evidence_units: MethodSelectionEvidenceUnitContextV1[];
  method_relevant_section_packets: MethodSelectionSectionPacketContextV1[];
  asset_metadata: MethodSelectionAssetContextV1[];
  warnings: string[];
};

export type StudyStrategyCandidate = {
  strategy_id: string;
  label_es: string;
  strategy_family: StudyStrategyFamily;
  confidence: CandidateConfidence;
  evidence_ids: string[];
  source_ids: string[];
  rationale: string;
  warnings: string[];
};

export type MethodCandidate = {
  candidate_id: string;
  label_es: string;
  label_en: string | null;
  candidate_type: CandidateType;
  knowledge_area_family: KnowledgeAreaRoute;
  method_role: "primary" | "alternative" | "supporting" | "context_only" | "rejected";
  strategy_family: StudyStrategyFamily;
  fit_score: number;
  confidence: CandidateConfidence;
  evidence_strength: CandidateEvidenceStrength;
  topic_fit: SourceTopicFit;
  source_ids: string[];
  evidence_ids: string[];
  original_excerpt_ids: string[];
  section_keys: string[];
  positive_signals: string[];
  negative_signals: string[];
  assumptions: string[];
  limitations: string[];
  warnings: string[];
};

export type VariableIndicatorCandidate = {
  candidate_id: string;
  label_es: string;
  construct_or_variable: string;
  role: "input" | "output" | "parameter" | "indicator" | "construct" | "category";
  unit: string | null;
  evidence_ids: string[];
  source_ids: string[];
  status: "source_backed" | "inferred_need" | "required_but_missing";
  warnings: string[];
};

export type DataRequirementCandidate = {
  requirement_id: string;
  label_es: string;
  data_source_type: string;
  required_for: string;
  evidence_ids: string[];
  source_ids: string[];
  status: "source_backed" | "inferred_need" | "required_but_missing";
  warnings: string[];
};

export type DisciplineMethodRequirement = {
  requirement_id: string;
  knowledge_area_family: KnowledgeAreaRoute;
  requirement_type: MethodRequirementType;
  label_es: string;
  method_family: string;
  status: DisciplineRequirementStatus;
  variables: Array<{
    symbol: string | null;
    label_es: string;
    unit: string | null;
    role: "input" | "output" | "parameter" | "indicator" | "construct" | "category";
  }>;
  instruments_or_protocols: string[];
  required_inputs: string[];
  output_indicators: string[];
  equation_latex: string | null;
  software_or_tools: string[];
  source_ids: string[];
  evidence_ids: string[];
  asset_keys: string[];
  use_policy: DisciplineRequirementUsePolicy;
  warnings: string[];
};

export type MethodEvidenceBinding = {
  binding_id: string;
  target_type:
    | "study_strategy"
    | "method"
    | "theory"
    | "technique"
    | "model"
    | "tool_software"
    | "variable_indicator"
    | "data_source"
    | "instrument_protocol"
    | "validation_strategy"
    | "discipline_requirement";
  target_id: string;
  evidence_ids: string[];
  source_ids: string[];
  support_level:
    | "direct_source_backed"
    | "cautious_source_backed"
    | "context_only"
    | "inferred_need"
    | "unsupported";
  warnings: string[];
};

export type MethodSectionIntegrationPlan = {
  title_guidance: string;
  abstract_guidance: string;
  objectives_guidance: string;
  theoretical_framework_guidance: string;
  methodology_guidance: string;
  keywords_guidance: string;
  hero_infographic_guidance: string;
  gantt_budget_guidance: string;
  warnings: string[];
};

export type MethodGenerationConstraints = {
  artifact_is_read_only: true;
  do_not_feed_generation_yet: true;
  claim_ceiling: string;
  planned_vs_executed_rule: string;
  no_invented_requirements_rule: string;
  source_support_rule: string;
  warnings: string[];
};

export type MethodSelectionScoringSummary = {
  score_version: "method_fit_score.v1";
  winning_score: number | null;
  confidence: MethodSelectionConfidence;
  score_explanation: string[];
  competing_candidate_count: number;
  weak_evidence_penalties: string[];
};

export type MethodSelectionLlmOutputV1 = {
  status: MethodSelectionStatus;
  knowledge_area_route: KnowledgeAreaRouteDecision;
  selected_strategy: StudyStrategyCandidate | null;
  primary_method: MethodCandidate | null;
  alternative_methods: MethodCandidate[];
  theories: MethodCandidate[];
  techniques: MethodCandidate[];
  models: MethodCandidate[];
  tools_software: MethodCandidate[];
  variables_indicators: VariableIndicatorCandidate[];
  data_requirements: DataRequirementCandidate[];
  discipline_method_requirements: DisciplineMethodRequirement[];
  method_evidence_bindings: MethodEvidenceBinding[];
  section_integration_plan: MethodSectionIntegrationPlan;
  generation_constraints: MethodGenerationConstraints;
  scoring_summary: MethodSelectionScoringSummary;
  assumptions: string[];
  limitations: string[];
  warnings: string[];
  blockers: string[];
};

export type MethodSelectionArtifactV1 = MethodSelectionLlmOutputV1 & {
  artifact_type: "method_selection_artifact";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  case_id?: string | null;
  handoff_id: string;
  evidence_run_id?: string | null;
  immutable_snapshot_hash?: string | null;
  evidence_quality_context: {
    production_eligible: boolean;
    diagnostic_compatible: boolean;
    degraded_handoff: boolean;
    quality_gate_status?: string | null;
    source_count: number;
    usable_full_text_source_count: number;
    metadata_only_source_count: number;
    unresolved_source_count: number;
    adjacent_source_count: number;
    evidence_unit_count: number;
    reduced_evidence_unit_count?: number | null;
    true_source_backed_direct_quote_count?: number | null;
    warnings: string[];
    blockers: string[];
  };
};

export type MethodSelectionValidationReportV1 = {
  artifact_type: "method_selection_validation_report";
  artifact_version: "v1";
  generated_at: string;
  passed: boolean;
  status_before_validation: MethodSelectionStatus;
  status_after_validation: MethodSelectionStatus;
  confidence_before_validation: MethodSelectionConfidence;
  confidence_after_validation: MethodSelectionConfidence;
  validation_downgrades: string[];
  removed_or_rewritten_claims: string[];
  invalid_evidence_ids: string[];
  invalid_source_ids: string[];
  invalid_asset_keys: string[];
  metadata_only_primary_support_count: number;
  unresolved_primary_support_count: number;
  adjacent_primary_support_count: number;
  invented_requirement_count: number;
  contamination_warnings: string[];
  warnings: string[];
  blockers: string[];
  telemetry: {
    method_selection_llm_called: boolean;
    cache_hit: boolean;
    model: string | null;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    estimated_cost_cad: number;
    duration_ms: number | null;
    cache_key: string;
  };
};

type MethodSelectionRunResult = {
  evidenceContext: MethodSelectionEvidenceContextV1;
  artifact: MethodSelectionArtifactV1;
  validationReport: MethodSelectionValidationReportV1;
  reportMarkdown: string;
};

type MethodSelectionRunOptions = {
  caseId?: string | null;
  provider?: LlmProvider | null;
  model?: string | null;
  cacheRoot?: string | null;
  generatedAt?: string;
  productionSafety?: {
    production_eligible?: boolean | null;
    diagnostic_compatible?: boolean | null;
    production_ineligibility_reasons?: string[];
    warnings?: string[];
    counts?: {
      usable_full_text_sources?: number | null;
      metadata_only_sources?: number | null;
      unresolved_sources?: number | null;
      adjacent_sources?: number | null;
      true_source_backed_direct_quote_count?: number | null;
    };
  } | null;
  collectUsage?: boolean;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function clip(value: string | null | undefined, max = 700) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function usageDelta(after: LlmUsageTotals | null, before: LlmUsageTotals | null): LlmUsageTotals {
  if (!after || !before) {
    return {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      costCad: 0,
    };
  }

  return {
    calls: Math.max(0, after.calls - before.calls),
    inputTokens: Math.max(0, after.inputTokens - before.inputTokens),
    cachedInputTokens: Math.max(0, after.cachedInputTokens - before.cachedInputTokens),
    outputTokens: Math.max(0, after.outputTokens - before.outputTokens),
    totalTokens: Math.max(0, after.totalTokens - before.totalTokens),
    costUsd: Number(Math.max(0, after.costUsd - before.costUsd).toFixed(6)),
    costCad: Number(Math.max(0, after.costCad - before.costCad).toFixed(6)),
  };
}

function sourceHealthById(sourceHealth: SourceHealthSummary) {
  return new Map(sourceHealth.sources.map((source) => [source.source_id, source]));
}

function sourceById(handoff: EvidenceEngineHandoffV1) {
  return new Map(handoff.source_registry.map((source) => [source.source_id, source]));
}

function evidenceById(handoff: EvidenceEngineHandoffV1) {
  return new Map(handoff.evidence_units.map((unit) => [unit.evidence_id, unit]));
}

function assetByKey(handoff: EvidenceEngineHandoffV1) {
  return new Map(handoff.asset_registry.map((asset) => [asset.asset_key, asset]));
}

function secondarySummaryFromSource(source: SourceHandoffRecord) {
  const raw = asRecord(source.citation_metadata.raw);
  return clip(
    asString(raw.abstract) ??
      asString(raw.abstractText) ??
      asString(raw.abstract_text) ??
      asString(raw.summary) ??
      asString(raw.description),
    850,
  );
}

function methodRelevanceScore(input: {
  sectionKeys: string[];
  label?: string | null;
  text?: string | null;
  unitType?: string | null;
  citationEligibility?: string | null;
  evidenceUse?: string | null;
  sourceHealth?: SourceHealthClassification | null;
}) {
  const joined = normalize(
    [
      ...input.sectionKeys,
      input.label,
      input.text,
      input.unitType,
      input.citationEligibility,
    ].join(" "),
  );
  const methodPatterns = [
    /\bmethod\b/,
    /\bmethodology\b/,
    /\bdesign\b/,
    /\bstrategy\b/,
    /\bframework\b/,
    /\btheory\b/,
    /\bmodel\b/,
    /\bvariable\b/,
    /\bindicator\b/,
    /\bprotocol\b/,
    /\binstrument\b/,
    /\bvalidation\b/,
    /\banalysis\b/,
    /\bdata\b/,
    /\btool\b/,
    /\bsoftware\b/,
    /\btechnique\b/,
    /\bmetodo\b/,
    /\bmetodologia\b/,
    /\bdiseno\b/,
    /\benfoque\b/,
    /\bestrategia\b/,
    /\bmarco\b/,
    /\bteoria\b/,
    /\bmodelo\b/,
    /\bvariable\b/,
    /\bindicador\b/,
    /\bprotocolo\b/,
    /\binstrumento\b/,
    /\bvalidacion\b/,
    /\banalisis\b/,
    /\bdatos\b/,
    /\bherramienta\b/,
    /\btecnica\b/,
  ];
  let score = methodPatterns.reduce((sum, pattern) => sum + (pattern.test(joined) ? 8 : 0), 0);
  if (input.citationEligibility === "direct_quote") score += 24;
  if (input.citationEligibility === "asset_reference") score += 18;
  if (input.unitType === "equation" || input.unitType === "table") score += 16;
  if (input.evidenceUse === "direct") score += 18;
  if (input.evidenceUse === "cautious") score += 6;
  if (input.evidenceUse === "context_only") score -= 24;
  if (input.sourceHealth?.source_health === "metadata_only") score -= 35;
  if (input.sourceHealth?.source_health === "unresolved") score -= 50;
  if (input.sourceHealth?.topic_fit === "adjacent") score -= 15;
  return Math.max(0, score);
}

function evidenceUseFromReduced(
  unit: EvidenceUnitHandoffRecord,
  reducedPack: ReducedEvidencePackV1,
) {
  const reduced = reducedPack.evidence_units.find((entry) => entry.evidence_id === unit.evidence_id);
  if (reduced) {
    return {
      evidenceUse: reduced.evidence_use,
      score: reduced.score,
    };
  }

  return {
    evidenceUse: "context_only" as const,
    score: 0,
  };
}

function evidenceQualityContext(input: {
  handoff: EvidenceEngineHandoffV1;
  reducedPack: ReducedEvidencePackV1;
  sourceHealth: SourceHealthSummary;
  options?: MethodSelectionRunOptions;
}): MethodSelectionArtifactV1["evidence_quality_context"] {
  const citationSummary = summarizeCitationSemantics(input.handoff.evidence_units);
  const productionEligible =
    input.options?.productionSafety?.production_eligible ??
    (input.handoff.quality_gate.status === "pass" &&
      input.sourceHealth.usable_full_text_source_count >= 4 &&
      !input.sourceHealth.metadata_only_source_used_as_direct_evidence &&
      !input.sourceHealth.unresolved_source_used_as_production_evidence);
  const diagnosticCompatible = input.options?.productionSafety?.diagnostic_compatible ?? true;
  const blockers = unique([
    ...input.handoff.quality_gate.blockers,
    ...(input.options?.productionSafety?.production_ineligibility_reasons ?? []),
  ]);
  const warnings = unique([
    ...input.handoff.warnings,
    ...input.handoff.quality_gate.warnings,
    ...input.sourceHealth.source_health_warnings,
    ...input.reducedPack.warnings,
    ...(input.options?.productionSafety?.warnings ?? []),
  ]);

  return {
    production_eligible: productionEligible,
    diagnostic_compatible: diagnosticCompatible,
    degraded_handoff:
      !productionEligible ||
      input.handoff.quality_gate.status !== "pass" ||
      input.handoff.readiness === "blocked",
    quality_gate_status: input.handoff.quality_gate.status,
    source_count: input.handoff.source_registry.length,
    usable_full_text_source_count:
      input.options?.productionSafety?.counts?.usable_full_text_sources ??
      input.sourceHealth.usable_full_text_source_count,
    metadata_only_source_count:
      input.options?.productionSafety?.counts?.metadata_only_sources ??
      input.sourceHealth.metadata_only_source_count,
    unresolved_source_count:
      input.options?.productionSafety?.counts?.unresolved_sources ??
      input.sourceHealth.unresolved_source_count,
    adjacent_source_count:
      input.options?.productionSafety?.counts?.adjacent_sources ??
      input.sourceHealth.adjacent_source_count,
    evidence_unit_count: input.handoff.evidence_units.length,
    reduced_evidence_unit_count: input.reducedPack.reduced_counts.evidence_units,
    true_source_backed_direct_quote_count:
      input.options?.productionSafety?.counts?.true_source_backed_direct_quote_count ??
      citationSummary.true_source_backed_direct_quote_count,
    warnings,
    blockers,
  };
}

export function buildMethodSelectionEvidenceContext(input: {
  handoff: EvidenceEngineHandoffV1;
  reducedEvidencePack: ReducedEvidencePackV1;
  options?: MethodSelectionRunOptions;
}): MethodSelectionEvidenceContextV1 {
  const generatedAt = input.options?.generatedAt ?? new Date().toISOString();
  const sourceHealth = summarizeSourceHealthFromHandoff(input.handoff);
  const sourceHealthMap = sourceHealthById(sourceHealth);
  const reducedEvidenceIds = new Set(
    input.reducedEvidencePack.evidence_units.map((unit) => unit.evidence_id),
  );
  const scoredUnits = input.handoff.evidence_units
    .map((unit) => {
      const reduced = evidenceUseFromReduced(unit, input.reducedEvidencePack);
      const health = sourceHealthMap.get(unit.source_id);
      const text = unit.original_text ?? unit.summary_es ?? unit.caption;
      const relevance = methodRelevanceScore({
        sectionKeys: unit.section_keys,
        label: unit.label,
        text,
        unitType: unit.unit_type,
        citationEligibility: unit.citation_eligibility,
        evidenceUse: reduced.evidenceUse,
        sourceHealth: health,
      });
      return {
        unit,
        health,
        text,
        relevance,
        reduced,
      };
    })
    .filter((entry) => {
      if (!entry.health) return false;
      if (entry.relevance >= 18) return true;
      if (reducedEvidenceIds.has(entry.unit.evidence_id) && entry.reduced.evidenceUse !== "context_only") {
        return true;
      }
      return false;
    })
    .sort((left, right) => right.relevance - left.relevance || right.reduced.score - left.reduced.score)
    .slice(0, 48);

  const reducedUnits: MethodSelectionEvidenceUnitContextV1[] = scoredUnits.map((entry) => {
    const health = entry.health ?? {
      source_health: "unknown" as const,
      topic_fit: "unknown" as const,
      allowed_evidence_use: "context_only" as const,
    };
    const priority =
      entry.reduced.evidenceUse === "direct" || entry.unit.citation_eligibility === "direct_quote"
        ? "primary"
        : entry.reduced.evidenceUse === "cautious" || entry.unit.citation_eligibility === "asset_reference"
          ? "secondary"
          : "demoted";
    return {
      evidence_id: entry.unit.evidence_id,
      source_id: entry.unit.source_id,
      section_keys: entry.unit.section_keys,
      unit_type: entry.unit.unit_type,
      citation_eligibility: entry.unit.citation_eligibility,
      claim_scope: entry.unit.claim_scope,
      evidence_use: entry.reduced.evidenceUse,
      source_health: health.source_health,
      topic_fit: health.topic_fit,
      allowed_evidence_use: health.allowed_evidence_use,
      priority,
      relevance_reason:
        priority === "primary"
          ? "source_backed_method_relevant_evidence"
          : priority === "secondary"
            ? "cautious_or_asset_method_relevant_evidence"
            : "demoted_context_only_or_weak_evidence",
      text_excerpt: clip(entry.unit.original_text ?? entry.unit.caption, 900),
      summary_es: clip(entry.unit.summary_es, 600),
      asset_key: entry.unit.asset_key ?? null,
      score: entry.relevance + entry.reduced.score,
    };
  });

  const relevantEvidenceIds = new Set(reducedUnits.map((unit) => unit.evidence_id));
  const relevantSourceIds = new Set(reducedUnits.map((unit) => unit.source_id));
  const sectionPackets = input.handoff.section_packets
    .filter((packet) => {
      const joined = normalize(
        [
          packet.section_key,
          packet.summary,
          ...packet.key_points,
          ...packet.open_questions,
          ...packet.missing_elements,
          ...packet.do_not_claim,
        ].join(" "),
      );
      return (
        packet.evidence_ids.some((id) => relevantEvidenceIds.has(id)) ||
        methodRelevanceScore({ sectionKeys: [packet.section_key], text: joined }) >= 16
      );
    })
    .slice(0, 24)
    .map((packet): MethodSelectionSectionPacketContextV1 => ({
      section_key: packet.section_key,
      readiness: packet.readiness,
      summary: clip(packet.summary, 500),
      evidence_ids: packet.evidence_ids.filter((id) => relevantEvidenceIds.has(id)).slice(0, 12),
      source_ids: packet.source_ids.filter((id) => relevantSourceIds.has(id)).slice(0, 12),
      key_points: packet.key_points.map((item) => clip(item, 240)).filter(Boolean) as string[],
      missing_elements: packet.missing_elements.map((item) => clip(item, 220)).filter(Boolean) as string[],
      do_not_claim: packet.do_not_claim.map((item) => clip(item, 220)).filter(Boolean) as string[],
    }));

  const sourceContexts = input.handoff.source_registry
    .filter(
      (source) =>
        relevantSourceIds.has(source.source_id) ||
        input.reducedEvidencePack.source_distribution.some(
          (item) => item.source_id === source.source_id && item.reduced_evidence_unit_count > 0,
        ),
    )
    .map((source): MethodSelectionSourceContextV1 => {
      const health = sourceHealthMap.get(source.source_id);
      return {
        source_id: source.source_id,
        title: clip(source.title, 240) ?? "",
        year: source.year,
        venue: clip(source.venue, 160),
        abstract_or_secondary_summary: secondarySummaryFromSource(source),
        source_health: health?.source_health ?? "unknown",
        topic_fit: health?.topic_fit ?? "unknown",
        allowed_evidence_use: health?.allowed_evidence_use ?? "context_only",
      };
    });

  const relevantAssetKeys = new Set(
    reducedUnits.map((unit) => unit.asset_key).filter((key): key is string => Boolean(key)),
  );
  const assets = input.handoff.asset_registry
    .filter((asset) => {
      if (!input.handoff.source_registry.some((source) => source.source_id === asset.source_id)) return false;
      return (
        relevantAssetKeys.has(asset.asset_key) ||
        asset.citation_eligibility === "asset_reference" ||
        asset.asset_kind === "equation" ||
        asset.asset_kind === "table"
      );
    })
    .slice(0, 18)
    .map((asset): MethodSelectionAssetContextV1 => ({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      asset_kind: asset.asset_kind,
      title: clip(asset.title, 180),
      caption: clip(asset.caption, 360),
      text_content: clip(asset.text_content, 500),
      latex: clip(asset.latex, 500),
      citation_eligibility: asset.citation_eligibility,
      recommended_section_keys: asset.recommended_section_keys,
    }));

  const sourceSummaryWithoutSources = {
    ...sourceHealth,
    sources: undefined,
  };
  delete (sourceSummaryWithoutSources as Partial<SourceHealthSummary>).sources;

  return {
    artifact_type: "method_selection_evidence_context",
    artifact_version: "v1",
    generated_at: generatedAt,
    prompt_version: METHOD_SELECTION_PROMPT_VERSION,
    project_context: {
      project_id: input.handoff.project_id,
      language: input.handoff.project_context.language,
      country_context: input.handoff.project_context.country_context,
      degree_level: input.handoff.project_context.degree_level,
      knowledge_area_label: clip(input.handoff.project_context.academic_program, 180),
      template_key: input.handoff.project_context.target_template_key ?? null,
      topic_summary: clip(input.handoff.project_context.topic, 280),
      problem_summary: clip(input.handoff.project_context.problem_context, 500),
      research_line_summary: clip(input.handoff.project_context.research_line, 240),
      population_or_context_summary: clip(input.handoff.project_context.population_or_context, 240),
    },
    intake_weak_prior: {
      methodology_preference: clip(input.handoff.project_context.methodology_preference, 280),
      available_data: null,
      constraints: clip(input.handoff.project_context.constraints, 320),
      advisor_or_user_notes: clip(input.handoff.project_context.advisor_or_user_notes, 300),
      warning: "intake_is_weak_prior_not_evidence",
    },
    handoff_id: input.handoff.handoff_id,
    evidence_run_id: input.handoff.evidence_run_id ?? null,
    immutable_snapshot_hash: input.handoff.traceability.immutable_snapshot_hash ?? null,
    evidence_quality_context: evidenceQualityContext({
      handoff: input.handoff,
      reducedPack: input.reducedEvidencePack,
      sourceHealth,
      options: input.options,
    }),
    source_health_summary: sourceSummaryWithoutSources,
    citation_semantics_summary: summarizeCitationSemantics(input.handoff.evidence_units),
    sources: sourceContexts,
    reduced_evidence_units: reducedUnits,
    method_relevant_section_packets: sectionPackets,
    asset_metadata: assets,
    warnings: unique([
      "Context is compact and traceable; full PDFs, raw corpora, previous runs, mutable latest paths, and backend/debug text are intentionally excluded.",
      ...input.reducedEvidencePack.warnings,
    ]),
  };
}

function defaultSectionIntegrationPlan(): MethodSectionIntegrationPlan {
  return {
    title_guidance:
      "Use selected strategy/method only when evidence confidence is sufficient; otherwise keep method language provisional.",
    abstract_guidance:
      "Describe the study strategy and evidence boundary without claiming completed results.",
    objectives_guidance:
      "Align objective verbs with the selected strategy and avoid tasks requiring missing data or tools.",
    theoretical_framework_guidance:
      "Center source-backed theories, frameworks, models, or concepts; mark gaps as pending validation.",
    methodology_guidance:
      "Separate planned methodology from executed work and declare unsupported requirements.",
    keywords_guidance:
      "Include method, object, context, and key variable/construct only when supported.",
    hero_infographic_guidance:
      "Visualize topic, workflow, context, inputs, and expected academic output without unsupported methods or results.",
    gantt_budget_guidance:
      "Derive phases and budget rows from the selected strategy and missing requirements.",
    warnings: [],
  };
}

function defaultGenerationConstraints(warnings: string[] = []): MethodGenerationConstraints {
  return {
    artifact_is_read_only: true,
    do_not_feed_generation_yet: true,
    claim_ceiling:
      "This artifact is diagnostic/read-only and must not change generated sections until a later controlled batch.",
    planned_vs_executed_rule:
      "Do not present planned methods, requirements, tools, protocols, or models as completed work.",
    no_invented_requirements_rule:
      "Do not invent equations, formulas, instruments, datasets, software, protocols, samples, variables, or validation results.",
    source_support_rule:
      "Every selected method element must cite valid current evidence/source ids or be marked inferred_need/required_but_missing.",
    warnings,
  };
}

function fallbackLlmOutput(input: {
  context: MethodSelectionEvidenceContextV1;
  warning: string;
}): MethodSelectionLlmOutputV1 {
  return {
    status: input.context.evidence_quality_context.production_eligible
      ? "insufficient_evidence"
      : "blocked",
    knowledge_area_route: {
      route: "unknown",
      confidence: "unknown",
      route_evidence_ids: [],
      route_source_ids: [],
      modern_methodology_families: [],
      borrowed_method_warnings: [],
    },
    selected_strategy: null,
    primary_method: null,
    alternative_methods: [],
    theories: [],
    techniques: [],
    models: [],
    tools_software: [],
    variables_indicators: [],
    data_requirements: [],
    discipline_method_requirements: [],
    method_evidence_bindings: [],
    section_integration_plan: defaultSectionIntegrationPlan(),
    generation_constraints: defaultGenerationConstraints([input.warning]),
    scoring_summary: {
      score_version: "method_fit_score.v1",
      winning_score: null,
      confidence: "blocked",
      score_explanation: ["No high-quality LLM method-selection pass was available."],
      competing_candidate_count: 0,
      weak_evidence_penalties: [input.warning],
    },
    assumptions: [],
    limitations: ["Method selection was not completed because the LLM pass was unavailable."],
    warnings: [input.warning],
    blockers: [input.warning],
  };
}

function buildArtifact(input: {
  context: MethodSelectionEvidenceContextV1;
  llmOutput: MethodSelectionLlmOutputV1;
  caseId?: string | null;
  generatedAt?: string;
}): MethodSelectionArtifactV1 {
  return {
    artifact_type: "method_selection_artifact",
    artifact_version: "v1",
    generated_at: input.generatedAt ?? new Date().toISOString(),
    project_id: input.context.project_context.project_id,
    case_id: input.caseId ?? null,
    handoff_id: input.context.handoff_id,
    evidence_run_id: input.context.evidence_run_id,
    immutable_snapshot_hash: input.context.immutable_snapshot_hash,
    evidence_quality_context: input.context.evidence_quality_context,
    ...input.llmOutput,
    generation_constraints: {
      ...defaultGenerationConstraints(),
      ...input.llmOutput.generation_constraints,
      artifact_is_read_only: true,
      do_not_feed_generation_yet: true,
    },
  };
}

function statusRank(status: MethodSelectionStatus) {
  return {
    selected: 3,
    provisional: 2,
    insufficient_evidence: 1,
    blocked: 0,
  }[status];
}

function confidenceRank(confidence: MethodSelectionConfidence | CandidateConfidence) {
  return {
    high: 4,
    medium: 3,
    low: 2,
    insufficient: 1,
    blocked: 0,
    unknown: 0,
  }[confidence];
}

function capStatus(current: MethodSelectionStatus, maximum: MethodSelectionStatus) {
  return statusRank(current) > statusRank(maximum) ? maximum : current;
}

function capConfidence<T extends MethodSelectionConfidence | CandidateConfidence>(
  current: T,
  maximum: T,
): T {
  return confidenceRank(current) > confidenceRank(maximum) ? maximum : current;
}

function sourceSupportProblem(input: {
  sourceIds: string[];
  sourceHealth: Map<string, SourceHealthClassification>;
}) {
  let metadataOnly = 0;
  let unresolved = 0;
  let adjacent = 0;
  for (const sourceId of input.sourceIds) {
    const health = input.sourceHealth.get(sourceId);
    if (!health) continue;
    if (health.source_health === "metadata_only") metadataOnly += 1;
    if (health.source_health === "unresolved") unresolved += 1;
    if (health.topic_fit === "adjacent" || health.topic_fit === "background") adjacent += 1;
  }

  return { metadataOnly, unresolved, adjacent };
}

function sanitizeIds(ids: string[], valid: Set<string>, invalid: Set<string>) {
  const clean: string[] = [];
  for (const id of unique(ids)) {
    if (valid.has(id)) {
      clean.push(id);
    } else {
      invalid.add(id);
    }
  }
  return clean;
}

function withCandidateWarnings<T extends { warnings: string[] }>(candidate: T, warnings: string[]) {
  return {
    ...candidate,
    warnings: unique([...(candidate.warnings ?? []), ...warnings]),
  };
}

function sanitizeCandidate(input: {
  candidate: MethodCandidate;
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  invalidSourceIds: Set<string>;
  invalidEvidenceIds: Set<string>;
  sourceHealth: Map<string, SourceHealthClassification>;
  validationWarnings: string[];
}) {
  const cleanSourceIds = sanitizeIds(input.candidate.source_ids, input.sourceIds, input.invalidSourceIds);
  const cleanEvidenceIds = sanitizeIds(
    input.candidate.evidence_ids,
    input.evidenceIds,
    input.invalidEvidenceIds,
  );
  const supportProblem = sourceSupportProblem({
    sourceIds: cleanSourceIds,
    sourceHealth: input.sourceHealth,
  });
  const warnings: string[] = [];
  let candidate = {
    ...input.candidate,
    source_ids: cleanSourceIds,
    evidence_ids: cleanEvidenceIds,
    original_excerpt_ids: sanitizeIds(
      input.candidate.original_excerpt_ids,
      input.evidenceIds,
      input.invalidEvidenceIds,
    ),
  };

  if (input.candidate.source_ids.length !== cleanSourceIds.length) {
    warnings.push("invalid_source_ids_removed");
  }
  if (input.candidate.evidence_ids.length !== cleanEvidenceIds.length) {
    warnings.push("invalid_evidence_ids_removed");
  }
  if (candidate.evidence_strength !== "intake_only" && candidate.evidence_strength !== "required_but_missing") {
    if (cleanEvidenceIds.length === 0 && cleanSourceIds.length === 0) {
      warnings.push("source_support_missing_or_invalid");
      candidate = {
        ...candidate,
        confidence: capConfidence(candidate.confidence, "insufficient"),
        evidence_strength: "unsupported",
      };
    }
  }
  if (supportProblem.metadataOnly > 0 || supportProblem.unresolved > 0) {
    warnings.push("metadata_only_or_unresolved_source_cannot_prove_method");
    candidate = {
      ...candidate,
      confidence: capConfidence(candidate.confidence, "low"),
      evidence_strength:
        candidate.evidence_strength === "direct_source_backed" ? "metadata_only" : candidate.evidence_strength,
    };
  }
  if (supportProblem.adjacent > 0 && candidate.method_role === "primary") {
    warnings.push("adjacent_or_background_source_cannot_support_primary_method_claim");
    candidate = {
      ...candidate,
      confidence: capConfidence(candidate.confidence, "low"),
      method_role: "context_only",
    };
  }
  input.validationWarnings.push(...warnings.map((warning) => `${candidate.candidate_id}:${warning}`));
  return withCandidateWarnings(candidate, warnings);
}

function sanitizeRequirement(input: {
  requirement: DisciplineMethodRequirement;
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  assetKeys: Set<string>;
  invalidSourceIds: Set<string>;
  invalidEvidenceIds: Set<string>;
  invalidAssetKeys: Set<string>;
  validationWarnings: string[];
}) {
  const sourceIds = sanitizeIds(input.requirement.source_ids, input.sourceIds, input.invalidSourceIds);
  const evidenceIds = sanitizeIds(input.requirement.evidence_ids, input.evidenceIds, input.invalidEvidenceIds);
  const assetKeys = sanitizeIds(input.requirement.asset_keys, input.assetKeys, input.invalidAssetKeys);
  const warnings: string[] = [];
  let requirement = {
    ...input.requirement,
    source_ids: sourceIds,
    evidence_ids: evidenceIds,
    asset_keys: assetKeys,
  };

  if (input.requirement.source_ids.length !== sourceIds.length) warnings.push("invalid_source_ids_removed");
  if (input.requirement.evidence_ids.length !== evidenceIds.length) warnings.push("invalid_evidence_ids_removed");
  if (input.requirement.asset_keys.length !== assetKeys.length) warnings.push("invalid_asset_keys_removed");

  const needsProof =
    requirement.status === "source_backed" ||
    requirement.use_policy === "can_render_equation" ||
    requirement.equation_latex !== null ||
    requirement.software_or_tools.length > 0;

  if (needsProof && evidenceIds.length === 0 && sourceIds.length === 0 && assetKeys.length === 0) {
    warnings.push("requirement_not_source_backed_downgraded");
    requirement = {
      ...requirement,
      status: "required_but_missing",
      equation_latex: null,
      use_policy: "declare_pending_validation",
    };
  }

  if (
    requirement.requirement_type === "equation_or_formula" &&
    requirement.equation_latex &&
    evidenceIds.length === 0 &&
    assetKeys.length === 0
  ) {
    warnings.push("equation_without_source_support_removed");
    requirement = {
      ...requirement,
      status: "required_but_missing",
      equation_latex: null,
      use_policy: "declare_pending_validation",
    };
  }

  input.validationWarnings.push(...warnings.map((warning) => `${requirement.requirement_id}:${warning}`));
  return {
    ...requirement,
    warnings: unique([...(requirement.warnings ?? []), ...warnings]),
  };
}

function sanitizeVariable(input: {
  variable: VariableIndicatorCandidate;
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  invalidSourceIds: Set<string>;
  invalidEvidenceIds: Set<string>;
}) {
  const evidenceIds = sanitizeIds(input.variable.evidence_ids, input.evidenceIds, input.invalidEvidenceIds);
  const sourceIds = sanitizeIds(input.variable.source_ids, input.sourceIds, input.invalidSourceIds);
  const warnings: string[] = [];
  let status = input.variable.status;
  if (input.variable.status === "source_backed" && evidenceIds.length === 0 && sourceIds.length === 0) {
    status = "inferred_need";
    warnings.push("source_backed_variable_without_valid_support_downgraded");
  }
  return {
    ...input.variable,
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    status,
    warnings: unique([...(input.variable.warnings ?? []), ...warnings]),
  };
}

function sanitizeDataRequirement(input: {
  requirement: DataRequirementCandidate;
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  invalidSourceIds: Set<string>;
  invalidEvidenceIds: Set<string>;
}) {
  const evidenceIds = sanitizeIds(input.requirement.evidence_ids, input.evidenceIds, input.invalidEvidenceIds);
  const sourceIds = sanitizeIds(input.requirement.source_ids, input.sourceIds, input.invalidSourceIds);
  const warnings: string[] = [];
  let status = input.requirement.status;
  if (status === "source_backed" && evidenceIds.length === 0 && sourceIds.length === 0) {
    status = "inferred_need";
    warnings.push("source_backed_data_requirement_without_valid_support_downgraded");
  }
  return {
    ...input.requirement,
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    status,
    warnings: unique([...(input.requirement.warnings ?? []), ...warnings]),
  };
}

function sanitizeBinding(input: {
  binding: MethodEvidenceBinding;
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  invalidSourceIds: Set<string>;
  invalidEvidenceIds: Set<string>;
}) {
  const evidenceIds = sanitizeIds(input.binding.evidence_ids, input.evidenceIds, input.invalidEvidenceIds);
  const sourceIds = sanitizeIds(input.binding.source_ids, input.sourceIds, input.invalidSourceIds);
  const warnings: string[] = [];
  let supportLevel = input.binding.support_level;
  if (supportLevel !== "inferred_need" && evidenceIds.length === 0 && sourceIds.length === 0) {
    supportLevel = "unsupported";
    warnings.push("binding_without_valid_support");
  }
  return {
    ...input.binding,
    evidence_ids: evidenceIds,
    source_ids: sourceIds,
    support_level: supportLevel,
    warnings: unique([...(input.binding.warnings ?? []), ...warnings]),
  };
}

function publicTextFromArtifact(artifact: MethodSelectionArtifactV1) {
  return [
    artifact.knowledge_area_route.route,
    artifact.selected_strategy?.label_es,
    artifact.primary_method?.label_es,
    ...artifact.alternative_methods.map((item) => item.label_es),
    ...artifact.theories.map((item) => item.label_es),
    ...artifact.techniques.map((item) => item.label_es),
    ...artifact.models.map((item) => item.label_es),
    ...artifact.tools_software.map((item) => item.label_es),
    ...artifact.variables_indicators.map((item) => item.label_es),
    ...artifact.data_requirements.map((item) => item.label_es),
    ...artifact.discipline_method_requirements.map((item) => item.label_es),
    ...artifact.assumptions,
    ...artifact.limitations,
    ...artifact.warnings,
    ...artifact.blockers,
  ].join("\n");
}

export function validateAndNormalizeMethodSelectionArtifact(input: {
  artifact: MethodSelectionArtifactV1;
  handoff: EvidenceEngineHandoffV1;
  reducedEvidencePack: ReducedEvidencePackV1;
  telemetry: MethodSelectionValidationReportV1["telemetry"];
}): { artifact: MethodSelectionArtifactV1; validationReport: MethodSelectionValidationReportV1 } {
  const sourceIds = new Set(input.handoff.source_registry.map((source) => source.source_id));
  const evidenceIds = new Set(input.handoff.evidence_units.map((unit) => unit.evidence_id));
  const reducedEvidenceIds = new Set(input.reducedEvidencePack.evidence_units.map((unit) => unit.evidence_id));
  for (const id of reducedEvidenceIds) evidenceIds.add(id);
  const assetKeys = new Set(input.handoff.asset_registry.map((asset) => asset.asset_key));
  const sourceHealth = sourceHealthById(summarizeSourceHealthFromHandoff(input.handoff));
  const invalidEvidenceIds = new Set<string>();
  const invalidSourceIds = new Set<string>();
  const invalidAssetKeys = new Set<string>();
  const validationWarnings: string[] = [];
  const validationDowngrades: string[] = [];
  const removedOrRewrittenClaims: string[] = [];
  let metadataOnlyPrimarySupportCount = 0;
  let unresolvedPrimarySupportCount = 0;
  let adjacentPrimarySupportCount = 0;
  let inventedRequirementCount = 0;
  let artifact = {
    ...input.artifact,
    alternative_methods: input.artifact.alternative_methods.map((candidate) =>
      sanitizeCandidate({
        candidate,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
        sourceHealth,
        validationWarnings,
      }),
    ),
    theories: input.artifact.theories.map((candidate) =>
      sanitizeCandidate({
        candidate,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
        sourceHealth,
        validationWarnings,
      }),
    ),
    techniques: input.artifact.techniques.map((candidate) =>
      sanitizeCandidate({
        candidate,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
        sourceHealth,
        validationWarnings,
      }),
    ),
    models: input.artifact.models.map((candidate) =>
      sanitizeCandidate({
        candidate,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
        sourceHealth,
        validationWarnings,
      }),
    ),
    tools_software: input.artifact.tools_software.map((candidate) =>
      sanitizeCandidate({
        candidate,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
        sourceHealth,
        validationWarnings,
      }),
    ),
    variables_indicators: input.artifact.variables_indicators.map((variable) =>
      sanitizeVariable({
        variable,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
      }),
    ),
    data_requirements: input.artifact.data_requirements.map((requirement) =>
      sanitizeDataRequirement({
        requirement,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
      }),
    ),
    discipline_method_requirements: input.artifact.discipline_method_requirements.map((requirement) =>
      sanitizeRequirement({
        requirement,
        sourceIds,
        evidenceIds,
        assetKeys,
        invalidSourceIds,
        invalidEvidenceIds,
        invalidAssetKeys,
        validationWarnings,
      }),
    ),
    method_evidence_bindings: input.artifact.method_evidence_bindings.map((binding) =>
      sanitizeBinding({
        binding,
        sourceIds,
        evidenceIds,
        invalidSourceIds,
        invalidEvidenceIds,
      }),
    ),
  };

  if (artifact.primary_method) {
    const sanitizedPrimary = sanitizeCandidate({
      candidate: artifact.primary_method,
      sourceIds,
      evidenceIds,
      invalidSourceIds,
      invalidEvidenceIds,
      sourceHealth,
      validationWarnings,
    });
    const support = sourceSupportProblem({
      sourceIds: sanitizedPrimary.source_ids,
      sourceHealth,
    });
    metadataOnlyPrimarySupportCount = support.metadataOnly;
    unresolvedPrimarySupportCount = support.unresolved;
    adjacentPrimarySupportCount = support.adjacent;
    artifact = {
      ...artifact,
      primary_method: sanitizedPrimary,
    };
  }

  inventedRequirementCount = artifact.discipline_method_requirements.filter(
    (requirement) =>
      requirement.status === "required_but_missing" &&
      requirement.warnings.some((warning) => /downgraded|removed|without_source/i.test(warning)),
  ).length;

  let status = artifact.status;
  let scoreConfidence = artifact.scoring_summary.confidence;
  const evidenceWeak =
    !artifact.evidence_quality_context.production_eligible ||
    artifact.evidence_quality_context.usable_full_text_source_count < 2 ||
    artifact.evidence_quality_context.degraded_handoff;

  if (evidenceWeak && status === "selected") {
    status = "provisional";
    validationDowngrades.push("degraded_or_weak_evidence_prevents_selected_status");
  }
  if (artifact.primary_method?.confidence === "insufficient" && status !== "blocked") {
    status = capStatus(status, "insufficient_evidence");
    validationDowngrades.push("primary_method_insufficient_confidence");
  }
  if (!artifact.primary_method && status !== "blocked") {
    status = capStatus(status, "insufficient_evidence");
    validationDowngrades.push("missing_primary_method");
  }
  if (metadataOnlyPrimarySupportCount > 0 || unresolvedPrimarySupportCount > 0) {
    status = capStatus(status, "provisional");
    scoreConfidence = capConfidence(scoreConfidence, "low");
    validationDowngrades.push("metadata_only_or_unresolved_sources_cannot_make_method_production_ready");
  }
  if (adjacentPrimarySupportCount > 0) {
    status = capStatus(status, "provisional");
    scoreConfidence = capConfidence(scoreConfidence, "low");
    validationDowngrades.push("adjacent_sources_limited_to_cautious_or_contextual_method_support");
  }
  if (input.artifact.evidence_quality_context.quality_gate_status === "blocked") {
    status = "blocked";
    scoreConfidence = "blocked";
    validationDowngrades.push("blocked_quality_gate_forces_method_selection_blocked");
  }

  const contaminationWarnings = unique([
    /artifacts-local|backend|debug|latest-consolidated|latest[\\/.-]/i.test(publicTextFromArtifact(artifact))
      ? "method_selection_public_text_contains_backend_or_mutable_latest_marker"
      : null,
  ]);

  if (contaminationWarnings.length > 0) {
    status = capStatus(status, "provisional");
    validationDowngrades.push("contamination_marker_detected_in_method_selection_text");
  }

  artifact = {
    ...artifact,
    status,
    scoring_summary: {
      ...artifact.scoring_summary,
      confidence: scoreConfidence,
      weak_evidence_penalties: unique([
        ...artifact.scoring_summary.weak_evidence_penalties,
        ...validationDowngrades,
      ]),
    },
    warnings: unique([
      ...artifact.warnings,
      ...validationWarnings,
      ...validationDowngrades,
      ...contaminationWarnings,
    ]),
    blockers: unique([
      ...artifact.blockers,
      status === "blocked" && validationDowngrades.length > 0
        ? "Method selection blocked by validation downgrade."
        : null,
    ]),
  };

  const blockers = unique([
    ...artifact.blockers,
    contaminationWarnings.length > 0 ? "Method selection contains contamination markers." : null,
  ]);
  const validationReport: MethodSelectionValidationReportV1 = {
    artifact_type: "method_selection_validation_report",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    passed: blockers.length === 0 && contaminationWarnings.length === 0,
    status_before_validation: input.artifact.status,
    status_after_validation: artifact.status,
    confidence_before_validation: input.artifact.scoring_summary.confidence,
    confidence_after_validation: artifact.scoring_summary.confidence,
    validation_downgrades: unique(validationDowngrades),
    removed_or_rewritten_claims: unique(removedOrRewrittenClaims),
    invalid_evidence_ids: Array.from(invalidEvidenceIds),
    invalid_source_ids: Array.from(invalidSourceIds),
    invalid_asset_keys: Array.from(invalidAssetKeys),
    metadata_only_primary_support_count: metadataOnlyPrimarySupportCount,
    unresolved_primary_support_count: unresolvedPrimarySupportCount,
    adjacent_primary_support_count: adjacentPrimarySupportCount,
    invented_requirement_count: inventedRequirementCount,
    contamination_warnings: contaminationWarnings,
    warnings: unique(validationWarnings),
    blockers,
    telemetry: input.telemetry,
  };

  return { artifact, validationReport };
}

function llmOutputJsonSchema(): Record<string, unknown> {
  const confidence = ["high", "medium", "low", "insufficient", "unknown"];
  const routeConfidence = ["high", "medium", "low", "unknown"];
  const methodStatus = ["selected", "provisional", "insufficient_evidence", "blocked"];
  const route = [
    "engineering",
    "medicine_public_health",
    "business",
    "education",
    "social_science",
    "public_policy",
    "environmental",
    "humanities",
    "law",
    "interdisciplinary",
    "unknown",
  ];
  const strategy = [
    "single_method",
    "method_comparison",
    "systematic_review",
    "simulation",
    "experimental_design",
    "case_study",
    "mixed_method",
    "design_science",
    "model_validation",
    "evidence_based_evaluation",
    "quantitative_observational",
    "qualitative",
    "unknown",
  ];
  const stringArray = { type: "array", items: { type: "string" } };
  const nullableString = { type: ["string", "null"] };
  const candidate = {
    type: "object",
    additionalProperties: false,
    required: [
      "candidate_id",
      "label_es",
      "label_en",
      "candidate_type",
      "knowledge_area_family",
      "method_role",
      "strategy_family",
      "fit_score",
      "confidence",
      "evidence_strength",
      "topic_fit",
      "source_ids",
      "evidence_ids",
      "original_excerpt_ids",
      "section_keys",
      "positive_signals",
      "negative_signals",
      "assumptions",
      "limitations",
      "warnings",
    ],
    properties: {
      candidate_id: { type: "string" },
      label_es: { type: "string" },
      label_en: nullableString,
      candidate_type: {
        enum: [
          "method",
          "theory",
          "technique",
          "model",
          "tool_software",
          "variable_indicator",
          "data_source",
          "instrument_protocol",
          "validation_strategy",
        ],
      },
      knowledge_area_family: { enum: route },
      method_role: { enum: ["primary", "alternative", "supporting", "context_only", "rejected"] },
      strategy_family: { enum: strategy },
      fit_score: { type: "number" },
      confidence: { enum: confidence },
      evidence_strength: {
        enum: [
          "direct_source_backed",
          "paraphrase_source_backed",
          "asset_backed",
          "metadata_only",
          "intake_only",
          "required_but_missing",
          "unsupported",
        ],
      },
      topic_fit: { enum: ["direct", "adjacent", "background", "weak", "unknown"] },
      source_ids: stringArray,
      evidence_ids: stringArray,
      original_excerpt_ids: stringArray,
      section_keys: stringArray,
      positive_signals: stringArray,
      negative_signals: stringArray,
      assumptions: stringArray,
      limitations: stringArray,
      warnings: stringArray,
    },
  };
  const variable = {
    type: "object",
    additionalProperties: false,
    required: [
      "candidate_id",
      "label_es",
      "construct_or_variable",
      "role",
      "unit",
      "evidence_ids",
      "source_ids",
      "status",
      "warnings",
    ],
    properties: {
      candidate_id: { type: "string" },
      label_es: { type: "string" },
      construct_or_variable: { type: "string" },
      role: { enum: ["input", "output", "parameter", "indicator", "construct", "category"] },
      unit: nullableString,
      evidence_ids: stringArray,
      source_ids: stringArray,
      status: { enum: ["source_backed", "inferred_need", "required_but_missing"] },
      warnings: stringArray,
    },
  };
  const dataRequirement = {
    type: "object",
    additionalProperties: false,
    required: [
      "requirement_id",
      "label_es",
      "data_source_type",
      "required_for",
      "evidence_ids",
      "source_ids",
      "status",
      "warnings",
    ],
    properties: {
      requirement_id: { type: "string" },
      label_es: { type: "string" },
      data_source_type: { type: "string" },
      required_for: { type: "string" },
      evidence_ids: stringArray,
      source_ids: stringArray,
      status: { enum: ["source_backed", "inferred_need", "required_but_missing"] },
      warnings: stringArray,
    },
  };
  const requirement = {
    type: "object",
    additionalProperties: false,
    required: [
      "requirement_id",
      "knowledge_area_family",
      "requirement_type",
      "label_es",
      "method_family",
      "status",
      "variables",
      "instruments_or_protocols",
      "required_inputs",
      "output_indicators",
      "equation_latex",
      "software_or_tools",
      "source_ids",
      "evidence_ids",
      "asset_keys",
      "use_policy",
      "warnings",
    ],
    properties: {
      requirement_id: { type: "string" },
      knowledge_area_family: { enum: route },
      requirement_type: {
        enum: [
          "analytical_model",
          "equation_or_formula",
          "statistical_model",
          "theoretical_framework",
          "research_design",
          "instrument_or_protocol",
          "data_collection_plan",
          "sampling_plan",
          "variable_indicator_matrix",
          "software_or_tool",
          "validation_strategy",
          "ethics_or_compliance",
        ],
      },
      label_es: { type: "string" },
      method_family: { type: "string" },
      status: { enum: ["source_backed", "inferred_need", "required_but_missing", "not_applicable"] },
      variables: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["symbol", "label_es", "unit", "role"],
          properties: {
            symbol: nullableString,
            label_es: { type: "string" },
            unit: nullableString,
            role: { enum: ["input", "output", "parameter", "indicator", "construct", "category"] },
          },
        },
      },
      instruments_or_protocols: stringArray,
      required_inputs: stringArray,
      output_indicators: stringArray,
      equation_latex: nullableString,
      software_or_tools: stringArray,
      source_ids: stringArray,
      evidence_ids: stringArray,
      asset_keys: stringArray,
      use_policy: {
        enum: [
          "can_render_equation",
          "describe_model_only",
          "describe_design_only",
          "describe_protocol_only",
          "declare_pending_validation",
          "do_not_use",
        ],
      },
      warnings: stringArray,
    },
  };
  const strategyCandidate = {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["strategy_id", "label_es", "strategy_family", "confidence", "evidence_ids", "source_ids", "rationale", "warnings"],
    properties: {
      strategy_id: { type: "string" },
      label_es: { type: "string" },
      strategy_family: { enum: strategy },
      confidence: { enum: confidence },
      evidence_ids: stringArray,
      source_ids: stringArray,
      rationale: { type: "string" },
      warnings: stringArray,
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "status",
      "knowledge_area_route",
      "selected_strategy",
      "primary_method",
      "alternative_methods",
      "theories",
      "techniques",
      "models",
      "tools_software",
      "variables_indicators",
      "data_requirements",
      "discipline_method_requirements",
      "method_evidence_bindings",
      "section_integration_plan",
      "generation_constraints",
      "scoring_summary",
      "assumptions",
      "limitations",
      "warnings",
      "blockers",
    ],
    properties: {
      status: { enum: methodStatus },
      knowledge_area_route: {
        type: "object",
        additionalProperties: false,
        required: [
          "route",
          "confidence",
          "route_evidence_ids",
          "route_source_ids",
          "modern_methodology_families",
          "borrowed_method_warnings",
        ],
        properties: {
          route: { enum: route },
          confidence: { enum: routeConfidence },
          route_evidence_ids: stringArray,
          route_source_ids: stringArray,
          modern_methodology_families: stringArray,
          borrowed_method_warnings: stringArray,
        },
      },
      selected_strategy: strategyCandidate,
      primary_method: { ...candidate, type: ["object", "null"] },
      alternative_methods: { type: "array", items: candidate },
      theories: { type: "array", items: candidate },
      techniques: { type: "array", items: candidate },
      models: { type: "array", items: candidate },
      tools_software: { type: "array", items: candidate },
      variables_indicators: { type: "array", items: variable },
      data_requirements: { type: "array", items: dataRequirement },
      discipline_method_requirements: { type: "array", items: requirement },
      method_evidence_bindings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["binding_id", "target_type", "target_id", "evidence_ids", "source_ids", "support_level", "warnings"],
          properties: {
            binding_id: { type: "string" },
            target_type: {
              enum: [
                "study_strategy",
                "method",
                "theory",
                "technique",
                "model",
                "tool_software",
                "variable_indicator",
                "data_source",
                "instrument_protocol",
                "validation_strategy",
                "discipline_requirement",
              ],
            },
            target_id: { type: "string" },
            evidence_ids: stringArray,
            source_ids: stringArray,
            support_level: {
              enum: [
                "direct_source_backed",
                "cautious_source_backed",
                "context_only",
                "inferred_need",
                "unsupported",
              ],
            },
            warnings: stringArray,
          },
        },
      },
      section_integration_plan: {
        type: "object",
        additionalProperties: false,
        required: [
          "title_guidance",
          "abstract_guidance",
          "objectives_guidance",
          "theoretical_framework_guidance",
          "methodology_guidance",
          "keywords_guidance",
          "hero_infographic_guidance",
          "gantt_budget_guidance",
          "warnings",
        ],
        properties: {
          title_guidance: { type: "string" },
          abstract_guidance: { type: "string" },
          objectives_guidance: { type: "string" },
          theoretical_framework_guidance: { type: "string" },
          methodology_guidance: { type: "string" },
          keywords_guidance: { type: "string" },
          hero_infographic_guidance: { type: "string" },
          gantt_budget_guidance: { type: "string" },
          warnings: stringArray,
        },
      },
      generation_constraints: {
        type: "object",
        additionalProperties: false,
        required: [
          "artifact_is_read_only",
          "do_not_feed_generation_yet",
          "claim_ceiling",
          "planned_vs_executed_rule",
          "no_invented_requirements_rule",
          "source_support_rule",
          "warnings",
        ],
        properties: {
          artifact_is_read_only: { const: true },
          do_not_feed_generation_yet: { const: true },
          claim_ceiling: { type: "string" },
          planned_vs_executed_rule: { type: "string" },
          no_invented_requirements_rule: { type: "string" },
          source_support_rule: { type: "string" },
          warnings: stringArray,
        },
      },
      scoring_summary: {
        type: "object",
        additionalProperties: false,
        required: [
          "score_version",
          "winning_score",
          "confidence",
          "score_explanation",
          "competing_candidate_count",
          "weak_evidence_penalties",
        ],
        properties: {
          score_version: { const: "method_fit_score.v1" },
          winning_score: { type: ["number", "null"] },
          confidence: { enum: ["high", "medium", "low", "blocked", "unknown"] },
          score_explanation: stringArray,
          competing_candidate_count: { type: "number" },
          weak_evidence_penalties: stringArray,
        },
      },
      assumptions: stringArray,
      limitations: stringArray,
      warnings: stringArray,
      blockers: stringArray,
    },
  };
}

export function buildMethodSelectionPrompt(context: MethodSelectionEvidenceContextV1) {
  return [
    "You are building a read-only MethodSelectionArtifactV1 for Ingeniometrix.",
    "Use only the supplied JSON evidence context. Do not use outside knowledge as factual evidence.",
    "Do not assume any knowledge area by default. First route by knowledge area and research intent.",
    "Project context and intake are weak priors only; they are not proof.",
    "Every method, theory, model, tool, variable, data requirement, instrument, protocol, validation strategy, equation, or formula must cite valid evidence_ids/source_ids from the context or be marked inferred_need/required_but_missing.",
    "Do not invent equations, formulas, instruments, datasets, software, protocols, samples, variables, units, validation results, or completed work.",
    "Do not treat metadata-only or unresolved sources as sufficient method support.",
    "Do not treat adjacent/background evidence as central support.",
    "If evidence is weak, degraded, or blocked, status must be provisional, insufficient_evidence, or blocked.",
    "For engineering, physics, quantitative-applied, modeling, computational, or control routes: actively inspect for analytical models, equations/formulas, variables with units, parameters, software/tools, assumptions, boundary conditions, simulation/experimental protocol, and validation/calibration needs.",
    "For non-engineering routes: do not force equations, physical models, simulation protocols, or engineering variables. Use route-appropriate requirements such as study design, instruments, protocols, sampling, data collection, statistical models, theoretical frameworks, qualitative procedures, stakeholder/regulatory analysis, corpus selection, or interpretive criteria.",
    "Keep generation_constraints read-only; this artifact must not alter title, abstract, objectives, sections, visuals, schedule, budget, or DOCX generation yet.",
    "Return only structured JSON matching the provided schema.",
    "",
    "EVIDENCE_CONTEXT_JSON:",
    JSON.stringify(context),
  ].join("\n");
}

export function computeMethodSelectionCacheKey(input: {
  context: MethodSelectionEvidenceContextV1;
  model: string | null | undefined;
}) {
  return sha256({
    cache_version: METHOD_SELECTION_CACHE_VERSION,
    handoff_id: input.context.handoff_id,
    evidence_run_id: input.context.evidence_run_id,
    immutable_snapshot_hash: input.context.immutable_snapshot_hash,
    prompt_version: METHOD_SELECTION_PROMPT_VERSION,
    model: input.model ?? "provider_default",
    context_hash: sha256(input.context),
  });
}

async function readCache(cacheRoot: string, cacheKey: string) {
  try {
    const raw = await readFile(path.join(cacheRoot, `${cacheKey}.json`), "utf8");
    return JSON.parse(raw) as {
      artifact: MethodSelectionArtifactV1;
      validationReport: MethodSelectionValidationReportV1;
    };
  } catch {
    return null;
  }
}

async function writeCache(input: {
  cacheRoot: string;
  cacheKey: string;
  artifact: MethodSelectionArtifactV1;
  validationReport: MethodSelectionValidationReportV1;
}) {
  await mkdir(input.cacheRoot, { recursive: true });
  await writeFile(
    path.join(input.cacheRoot, `${input.cacheKey}.json`),
    `${JSON.stringify(
      {
        cache_version: METHOD_SELECTION_CACHE_VERSION,
        cached_at: new Date().toISOString(),
        artifact: input.artifact,
        validationReport: input.validationReport,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function resolveModel() {
  return (
    process.env.METHOD_SELECTION_MODEL?.trim() ||
    process.env.LLM_MODEL_HIGH?.trim() ||
    process.env.LLM_DEFAULT_MODEL?.trim() ||
    null
  );
}

function getProviderSafely(provider: LlmProvider | null | undefined) {
  if (provider !== undefined) {
    return provider;
  }

  try {
    return getConfiguredLlmProvider();
  } catch {
    return null;
  }
}

async function readUsageTotals(collect: boolean | undefined) {
  if (collect === false) return null;
  try {
    return (await readLlmUsageRegistry()).cumulative;
  } catch {
    return null;
  }
}

export async function buildMethodSelectionForHandoff(input: {
  handoff: EvidenceEngineHandoffV1;
  reducedEvidencePack: ReducedEvidencePackV1;
  options?: MethodSelectionRunOptions;
}): Promise<MethodSelectionRunResult> {
  const generatedAt = input.options?.generatedAt ?? new Date().toISOString();
  const evidenceContext = buildMethodSelectionEvidenceContext({
    handoff: input.handoff,
    reducedEvidencePack: input.reducedEvidencePack,
    options: {
      ...input.options,
      generatedAt,
    },
  });
  const model = input.options?.model ?? resolveModel();
  const cacheKey = computeMethodSelectionCacheKey({ context: evidenceContext, model });
  const cacheRoot =
    input.options?.cacheRoot === null
      ? null
      : input.options?.cacheRoot ?? DEFAULT_METHOD_SELECTION_CACHE_ROOT;
  const telemetryBase = {
    method_selection_llm_called: false,
    cache_hit: false,
    model,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    estimated_cost_cad: 0,
    duration_ms: null as number | null,
    cache_key: cacheKey,
  };

  if (cacheRoot) {
    const cached = await readCache(cacheRoot, cacheKey);
    if (cached?.artifact && cached.validationReport) {
      const validationReport = {
        ...cached.validationReport,
        telemetry: {
          ...cached.validationReport.telemetry,
          cache_hit: true,
          method_selection_llm_called: false,
          cache_key: cacheKey,
        },
      };
      return {
        evidenceContext,
        artifact: cached.artifact,
        validationReport,
        reportMarkdown: renderMethodSelectionReport(cached.artifact, validationReport),
      };
    }
  }

  const provider = getProviderSafely(input.options?.provider);
  let llmOutput: MethodSelectionLlmOutputV1;
  let telemetry = telemetryBase;

  if (!provider) {
    llmOutput = fallbackLlmOutput({
      context: evidenceContext,
      warning: "method_selection_llm_unavailable",
    });
  } else {
    const usageBefore = await readUsageTotals(input.options?.collectUsage);
    const started = Date.now();
    try {
      llmOutput = await provider.generateStructuredObject<MethodSelectionLlmOutputV1>({
        schemaName: "MethodSelectionLlmOutputV1",
        schema: llmOutputJsonSchema(),
        prompt: buildMethodSelectionPrompt(evidenceContext),
        model: model ?? undefined,
        trackingLabel: "method_selection.v1",
      });
      const usageAfter = await readUsageTotals(input.options?.collectUsage);
      const usage = usageDelta(usageAfter, usageBefore);
      telemetry = {
        ...telemetryBase,
        method_selection_llm_called: true,
        duration_ms: Date.now() - started,
        input_tokens: usage.inputTokens,
        cached_input_tokens: usage.cachedInputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        estimated_cost_usd: usage.costUsd,
        estimated_cost_cad: usage.costCad,
      };
    } catch (error) {
      llmOutput = fallbackLlmOutput({
        context: evidenceContext,
        warning: `method_selection_llm_failed:${error instanceof Error ? error.message : "unknown_error"}`,
      });
      telemetry = {
        ...telemetryBase,
        method_selection_llm_called: true,
        duration_ms: Date.now() - started,
      };
    }
  }

  const artifact = buildArtifact({
    context: evidenceContext,
    llmOutput,
    caseId: input.options?.caseId,
    generatedAt,
  });
  const normalized = validateAndNormalizeMethodSelectionArtifact({
    artifact,
    handoff: input.handoff,
    reducedEvidencePack: input.reducedEvidencePack,
    telemetry,
  });

  if (cacheRoot && normalized.validationReport.telemetry.method_selection_llm_called) {
    await writeCache({
      cacheRoot,
      cacheKey,
      artifact: normalized.artifact,
      validationReport: normalized.validationReport,
    });
  }

  return {
    evidenceContext,
    artifact: normalized.artifact,
    validationReport: normalized.validationReport,
    reportMarkdown: renderMethodSelectionReport(normalized.artifact, normalized.validationReport),
  };
}

function renderCandidate(candidate: MethodCandidate | null) {
  if (!candidate) return "- None selected.";
  return [
    `- id: ${candidate.candidate_id}`,
    `- label: ${candidate.label_es}`,
    `- type: ${candidate.candidate_type}`,
    `- role: ${candidate.method_role}`,
    `- confidence: ${candidate.confidence}`,
    `- fit score: ${candidate.fit_score}`,
    `- evidence ids: ${candidate.evidence_ids.join(", ") || "none"}`,
    `- source ids: ${candidate.source_ids.join(", ") || "none"}`,
    candidate.warnings.length ? `- warnings: ${candidate.warnings.join("; ")}` : "- warnings: none",
  ].join("\n");
}

function renderCandidateList(title: string, candidates: MethodCandidate[]) {
  if (candidates.length === 0) {
    return `## ${title}\n\nNone reported.\n`;
  }

  return [
    `## ${title}`,
    "",
    ...candidates.flatMap((candidate, index) => [
      `### ${index + 1}. ${candidate.label_es}`,
      "",
      renderCandidate(candidate),
      "",
    ]),
  ].join("\n");
}

function routeSectionTitle(route: KnowledgeAreaRoute) {
  if (route === "engineering") return "Engineering / quantitative method requirements";
  if (route === "medicine_public_health") return "Health/public health method requirements";
  if (route === "education") return "Education method requirements";
  if (route === "business") return "Business/management method requirements";
  if (route === "public_policy" || route === "social_science") {
    return "Policy/social-science method requirements";
  }
  if (route === "environmental") return "Environmental method requirements";
  if (route === "humanities" || route === "law") return "Humanities/law method requirements";
  if (route === "interdisciplinary") return "Interdisciplinary method requirements";
  return "Route-specific method requirements";
}

export function renderMethodSelectionReport(
  artifact: MethodSelectionArtifactV1,
  validation: MethodSelectionValidationReportV1,
) {
  const routeRequirements = artifact.discipline_method_requirements;
  const requirementLines =
    routeRequirements.length === 0
      ? ["- None reported."]
      : routeRequirements.map((requirement) =>
          [
            `- ${requirement.requirement_id}: ${requirement.label_es}`,
            `  - type: ${requirement.requirement_type}`,
            `  - status: ${requirement.status}`,
            `  - use policy: ${requirement.use_policy}`,
            `  - evidence ids: ${requirement.evidence_ids.join(", ") || "none"}`,
            `  - source ids: ${requirement.source_ids.join(", ") || "none"}`,
            `  - missing/pending warnings: ${requirement.warnings.join("; ") || "none"}`,
          ].join("\n"),
        );

  return [
    "# Method Selection Report",
    "",
    "This report is diagnostic and read-only. It must not alter downstream generation yet.",
    "",
    "## Route",
    "",
    `- route: ${artifact.knowledge_area_route.route}`,
    `- route confidence: ${artifact.knowledge_area_route.confidence}`,
    `- status: ${artifact.status}`,
    `- method confidence: ${artifact.scoring_summary.confidence}`,
    `- production eligible: ${artifact.evidence_quality_context.production_eligible}`,
    `- diagnostic compatible: ${artifact.evidence_quality_context.diagnostic_compatible}`,
    `- LLM called: ${validation.telemetry.method_selection_llm_called}`,
    `- cache hit: ${validation.telemetry.cache_hit}`,
    `- model: ${validation.telemetry.model ?? "provider_default_or_unavailable"}`,
    "",
    "## Selected Strategy",
    "",
    artifact.selected_strategy
      ? [
          `- id: ${artifact.selected_strategy.strategy_id}`,
          `- label: ${artifact.selected_strategy.label_es}`,
          `- family: ${artifact.selected_strategy.strategy_family}`,
          `- confidence: ${artifact.selected_strategy.confidence}`,
          `- evidence ids: ${artifact.selected_strategy.evidence_ids.join(", ") || "none"}`,
          `- source ids: ${artifact.selected_strategy.source_ids.join(", ") || "none"}`,
          `- rationale: ${artifact.selected_strategy.rationale}`,
        ].join("\n")
      : "- None selected.",
    "",
    "## Primary Method Candidate",
    "",
    renderCandidate(artifact.primary_method),
    "",
    renderCandidateList("Alternative Methods", artifact.alternative_methods),
    renderCandidateList("Theories", artifact.theories),
    renderCandidateList("Techniques", artifact.techniques),
    renderCandidateList("Models", artifact.models),
    renderCandidateList("Tools / Software", artifact.tools_software),
    "## Variables / Indicators",
    "",
    artifact.variables_indicators.length === 0
      ? "- None reported."
      : artifact.variables_indicators
          .map(
            (item) =>
              `- ${item.candidate_id}: ${item.label_es} | role=${item.role} | unit=${item.unit ?? "none"} | status=${item.status} | evidence=${item.evidence_ids.join(", ") || "none"}`,
          )
          .join("\n"),
    "",
    "## Data Requirements",
    "",
    artifact.data_requirements.length === 0
      ? "- None reported."
      : artifact.data_requirements
          .map(
            (item) =>
              `- ${item.requirement_id}: ${item.label_es} | source type=${item.data_source_type} | status=${item.status} | evidence=${item.evidence_ids.join(", ") || "none"}`,
          )
          .join("\n"),
    "",
    `## ${routeSectionTitle(artifact.knowledge_area_route.route)}`,
    "",
    requirementLines.join("\n"),
    "",
    "## Fit Score Explanation",
    "",
    `- winning score: ${artifact.scoring_summary.winning_score ?? "none"}`,
    `- confidence: ${artifact.scoring_summary.confidence}`,
    `- competing candidates: ${artifact.scoring_summary.competing_candidate_count}`,
    artifact.scoring_summary.score_explanation.length
      ? artifact.scoring_summary.score_explanation.map((item: string) => `- ${item}`).join("\n")
      : "- No explanation reported.",
    "",
    "## Missing Requirements And Limitations",
    "",
    artifact.limitations.length ? artifact.limitations.map((item) => `- ${item}`).join("\n") : "- None reported.",
    "",
    "## Validation",
    "",
    `- validation passed: ${validation.passed}`,
    `- status before validation: ${validation.status_before_validation}`,
    `- status after validation: ${validation.status_after_validation}`,
    `- validation downgrades: ${validation.validation_downgrades.join("; ") || "none"}`,
    `- invalid evidence ids: ${validation.invalid_evidence_ids.join(", ") || "none"}`,
    `- invalid source ids: ${validation.invalid_source_ids.join(", ") || "none"}`,
    `- invalid asset keys: ${validation.invalid_asset_keys.join(", ") || "none"}`,
    `- invented requirement downgrades: ${validation.invented_requirement_count}`,
    `- contamination warnings: ${validation.contamination_warnings.join("; ") || "none"}`,
    "",
    "## Production Limitations",
    "",
    artifact.evidence_quality_context.blockers.length
      ? artifact.evidence_quality_context.blockers.map((item) => `- ${item}`).join("\n")
      : "- No production blockers reported by method selection context.",
    "",
    "## Warnings",
    "",
    artifact.warnings.length ? artifact.warnings.map((item) => `- ${item}`).join("\n") : "- None.",
    "",
  ].join("\n");
}

export const methodSelectionTestInternals = {
  stableStringify,
  sha256,
  llmOutputJsonSchema,
  methodRelevanceScore,
};
