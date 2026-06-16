import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  ConsolidatedEvidenceArtifact,
  ConsolidatedEvidenceUnit,
} from "@/blueprint_launch/server/local-playground-store";
import type {
  MasterSectionDraft,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";

export type ExtendedPlanItem = SectionPromptPlan["generation_plan"][number] & {
  wave?: string;
  generation_strategy?: string;
  prompt_mode?: string;
  readiness?: string;
  enough_to_draft?: boolean;
  source_ids?: string[];
  snippet_ids?: string[];
  asset_keys?: string[];
  critical_asset_keys?: string[];
  useful_asset_keys?: string[];
  imported_source_ids?: string[];
  imported_snippet_ids?: string[];
  imported_asset_keys?: string[];
  assumption_ids?: string[];
  support_strategy?: string | null;
  required_context_keys?: string[];
  upstream_context_keys?: string[];
  retry_policy?: {
    enabled?: boolean;
    max_attempts?: number;
    retry_on?: string[];
  };
  needs_followup_before_strong_draft?: boolean;
};

export type ExtendedManifestItem = SectionPromptPlan["prompt_manifest"][number] & {
  wave?: string;
  generation_strategy?: string;
  prompt_mode?: string;
  readiness?: string;
  enough_to_draft?: boolean;
  source_ids?: string[];
  asset_keys?: string[];
  critical_asset_keys?: string[];
  useful_asset_keys?: string[];
  imported_source_ids?: string[];
  imported_snippet_ids?: string[];
  imported_asset_keys?: string[];
  assumption_ids?: string[];
  required_context_keys?: string[];
  upstream_context_keys?: string[];
  retry_policy?: {
    enabled?: boolean;
    max_attempts?: number;
    retry_on?: string[];
  };
  support_strategy?: string | null;
  needs_followup_before_strong_draft?: boolean;
};

export type SectionEvidenceHydrationPlanItem = {
  section_key: string;
  wave?: string;
  priority_evidence_ids?: string[];
  priority_original_excerpt_ids?: string[];
  priority_snippet_ids?: string[];
  priority_source_ids?: string[];
  critical_asset_keys?: string[];
  useful_asset_keys?: string[];
  claims_allowed?: string[];
  claims_to_avoid?: string[];
  key_gaps?: string[];
  required_structure?: string[];
  min_words?: number | null;
  max_words?: number | null;
  required_original_fragments?: string[];
  chunk_rehydration_hints?: string[];
};

export type ClaimsAndLimitsGuidanceItem = {
  section_key: string;
  allowed_claims?: string[];
  claims_to_avoid?: string[];
  claims_conditioned?: string[];
  validation_needs?: string[];
};

export type MethodScopeGuidanceItem = {
  section_key: string;
  treatment?: string;
  expected_elements?: string[];
  supporting_method_signals?: string[];
  avoid?: string[];
};

export type FinalSectionsGuidance = {
  late_section_keys?: string[];
  abstract_rule?: string;
  keywords_rule?: string;
  references_rule?: string;
  title_refinement_rule?: string;
};

export type SectionExecutionComplexity =
  | "micro"
  | "light"
  | "medium"
  | "heavy";

export type SectionExecutionMode =
  | "deterministic"
  | "llm-low"
  | "llm-medium"
  | "llm-high";

export type SectionPromptBudget = "tiny" | "small" | "medium";

export type SectionExecutionProfile = {
  key: string;
  complexity: SectionExecutionComplexity;
  execution_mode: SectionExecutionMode;
  timeout_ms: number;
  max_retry_attempts: number;
  prompt_budget: SectionPromptBudget;
  use_assets: boolean;
  use_working_references: boolean;
  use_embeddings_retrieval: boolean;
  model_tier: "high" | "medium" | "low" | "deterministic";
};

export type TheoryBundle = {
  section_key: string;
  focus_mode: "framework" | "antecedents" | "state_of_art" | "bases";
  core_constructs: string[];
  framework_candidates: string[];
  supporting_definitions: string[];
  comparative_precedents: string[];
  field_gaps: string[];
  priority_quotes: string[];
  priority_reference_ids: string[];
  evidence_ids: string[];
  bundle_hash: string;
};

export type MethodBundle = {
  section_key: string;
  study_type: string[];
  design_type: string[];
  unit_of_analysis: string[];
  data_support: string[];
  analysis_strategy: string[];
  criteria_or_categories: string[];
  limits_and_conditions: string[];
  priority_quotes: string[];
  evidence_ids: string[];
  bundle_hash: string;
};

export type ResearchFrameLight = {
  topic_refined?: string;
  problem_core?: string;
  case_or_unit_of_analysis?: string | null;
  study_purpose?: string;
  study_question_type?: string;
  methodological_orientation?: string;
  expected_deliverable?: string;
  scope_limits?: string[];
  claims_ceiling?: string;
};

export type ResearchLogicContractPlan = {
  enabled?: boolean;
  mode?: string;
  row_id_format?: string;
  correspondence_rules?: string[];
  step9_prompt_rules?: string[];
  step10_llm_rules?: string[];
  code_validation_rules?: string[];
  docx_table_contract?: {
    orientation?: string;
    row_count_target?: string;
    required_columns?: string[];
  };
};

export type EnrichedPromptPlan = SectionPromptPlan & {
  research_frame_light?: ResearchFrameLight;
  research_logic_contract_plan?: ResearchLogicContractPlan;
  section_evidence_hydration_plan?: SectionEvidenceHydrationPlanItem[];
  claims_and_limits_guidance?: ClaimsAndLimitsGuidanceItem[];
  method_scope_guidance?: MethodScopeGuidanceItem[];
  final_sections_guidance?: FinalSectionsGuidance;
};

export type RuntimePromptContext = {
  prompt: string;
  used_evidence_ids: string[];
  used_original_excerpt_ids: string[];
  used_snippet_ids: string[];
  used_source_ids: string[];
  used_asset_keys: string[];
  blocked_claims: string[];
  conditioned_claims: string[];
  prompt_char_count: number;
  prompt_hash?: string;
  bundle_hash?: string | null;
};

export type WaveContextState = Partial<
  Record<
    | "foundation_context"
    | "development_context"
    | "support_integration_context"
    | "final_synthesis_inputs"
    | "references_working_set"
    | "refined_title",
    string
  >
>;

export type PriorSection = {
  section_key: string;
  title: string;
  content: string;
};

export function getDraftText(drafts: MasterSectionDraft[], sectionKey: string) {
  return drafts.find((draft) => draft.section_key === sectionKey)?.content ?? "";
}

export function buildEvidenceUnitMap(
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null,
) {
  return new Map(
    (consolidatedEvidence?.evidence_units ?? []).map((unit) => [
      unit.evidence_id,
      unit,
    ]),
  );
}

export function uniqueEvidenceUnits(
  values: Array<ConsolidatedEvidenceUnit | null | undefined>,
) {
  const seen = new Set<string>();
  const result: ConsolidatedEvidenceUnit[] = [];

  for (const value of values) {
    if (!value || seen.has(value.evidence_id)) {
      continue;
    }

    seen.add(value.evidence_id);
    result.push(value);
  }

  return result;
}

export async function loadReadonlyConsolidatedEvidence(
  consolidatedEvidencePath: string | null | undefined,
): Promise<ConsolidatedEvidenceArtifact | null> {
  if (!consolidatedEvidencePath) {
    return null;
  }

  try {
    const raw = await readFile(consolidatedEvidencePath, "utf8");
    const parsed = JSON.parse(raw) as ConsolidatedEvidenceArtifact;
    return parsed?.artifact_type === "consolidated_evidence" ? parsed : null;
  } catch {
    return null;
  }
}

export function getSectionHydrationItem(
  promptPlan: EnrichedPromptPlan,
  sectionKey: string,
) {
  return (
    promptPlan.section_evidence_hydration_plan?.find(
      (item) => item.section_key === sectionKey,
    ) ?? null
  );
}

export function getClaimsGuidanceItem(
  promptPlan: EnrichedPromptPlan,
  sectionKey: string,
) {
  return (
    promptPlan.claims_and_limits_guidance?.find(
      (item) => item.section_key === sectionKey,
    ) ?? null
  );
}

export function getMethodGuidanceItem(
  promptPlan: EnrichedPromptPlan,
  sectionKey: string,
) {
  return (
    promptPlan.method_scope_guidance?.find(
      (item) => item.section_key === sectionKey,
    ) ?? null
  );
}

export function isTheoreticalSection(sectionKey: string) {
  return [
    "theoretical_framework",
    "theoretical_bases",
    "research_antecedents",
    "state_of_the_art",
  ].includes(sectionKey);
}

export function isMethodSection(sectionKey: string) {
  return [
    "methodology",
    "methodological_approach",
    "research_design",
    "analysis_plan",
    "variables_or_categories",
    "variables_indicators",
    "categories_subcategories",
    "evaluation_criteria",
    "population_and_sample",
    "data_collection_techniques",
    "research_instruments",
    "research_procedure",
  ].includes(sectionKey);
}

export function isDeterministicSection(sectionKey: string) {
  return sectionKey === "references";
}

export function sanitizeRecoveredText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/Ã¼/g, "ü")
    .replace(/Â¿/g, "¿")
    .replace(/Â¡/g, "¡")
    .replace(/â/g, "'")
    .replace(/â/g, "-")
    .replace(/â/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function createContentHash(...parts: Array<string | null | undefined>) {
  const digest = createHash("sha1");
  for (const part of parts) {
    digest.update(part ?? "");
    digest.update("\n---\n");
  }
  return digest.digest("hex");
}

export function resolveSectionExecutionProfile(
  sectionKey: string,
  wave?: string,
): SectionExecutionProfile {
  if (isDeterministicSection(sectionKey)) {
    return {
      key: sectionKey,
      complexity: "micro",
      execution_mode: "deterministic",
      timeout_ms: 12_000,
      max_retry_attempts: 1,
      prompt_budget: "tiny",
      use_assets: false,
      use_working_references: sectionKey === "references",
      use_embeddings_retrieval: false,
      model_tier: "deterministic",
    };
  }

  if (isTheoreticalSection(sectionKey)) {
    return {
      key: sectionKey,
      complexity: "heavy",
      execution_mode: "llm-high",
      timeout_ms: 90_000,
      max_retry_attempts: 3,
      prompt_budget: "small",
      use_assets: false,
      use_working_references: false,
      use_embeddings_retrieval: true,
      model_tier: "high",
    };
  }

  if (isMethodSection(sectionKey)) {
    return {
      key: sectionKey,
      complexity: "heavy",
      execution_mode:
        sectionKey === "variables_indicators" ? "llm-medium" : "llm-high",
      timeout_ms: 85_000,
      max_retry_attempts: 3,
      prompt_budget: "medium",
      use_assets: [
        "methodology",
        "analysis_plan",
        "variables_or_categories",
        "evaluation_criteria",
      ].includes(sectionKey),
      use_working_references: false,
      use_embeddings_retrieval: true,
      model_tier: sectionKey === "variables_indicators" ? "medium" : "high",
    };
  }

  if (
    [
      "problem_statement",
      "introduction",
      "justification",
      "abstract",
      "title_refined",
    ].includes(sectionKey)
  ) {
    return {
      key: sectionKey,
      complexity: "medium",
      execution_mode: "llm-medium",
      timeout_ms: 30_000,
      max_retry_attempts: 2,
      prompt_budget: "small",
      use_assets: false,
      use_working_references: wave === "refinement_and_final",
      use_embeddings_retrieval: false,
      model_tier: "medium",
    };
  }

  if (
    [
      "general_research_question",
      "specific_research_questions",
      "general_objective",
      "specific_objectives",
      "objectives",
      "research_questions",
      "keywords",
      "theoretical_justification",
      "practical_justification",
      "methodological_justification",
      "general_hypothesis",
      "specific_hypotheses",
      "schedule",
      "budget",
      "annexes",
    ].includes(sectionKey)
  ) {
    return {
      key: sectionKey,
      complexity: "light",
      execution_mode: "llm-low",
      timeout_ms: 30_000,
      max_retry_attempts: 2,
      prompt_budget: "tiny",
      use_assets: false,
      use_working_references: false,
      use_embeddings_retrieval: false,
      model_tier: "low",
    };
  }

  return {
    key: sectionKey,
    complexity: "medium",
    execution_mode: "llm-medium",
    timeout_ms: 45_000,
    max_retry_attempts: 2,
    prompt_budget: "small",
    use_assets: wave === "support_integration",
    use_working_references: wave === "citation_and_references",
    use_embeddings_retrieval: false,
    model_tier: "medium",
  };
}
