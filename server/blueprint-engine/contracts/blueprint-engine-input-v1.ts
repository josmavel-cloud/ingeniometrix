import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts/evidence-engine-handoff-v1";

export type BlueprintEngineStepNumber = 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type BlueprintExecutionMode = "full" | "resume" | "render_only" | "dry_run";
export type BlueprintModelPolicy = "default" | "cost_optimized" | "quality_first";
export type BlueprintCitationStyle = "APA7" | "ISO690" | "VANCOUVER" | "IEEE";

export type BlueprintEngineRunRequestV1 = {
  blueprint_run_id?: string;
  project_id: string;
  user_id: string;
  requested_at: string;
  target_steps: BlueprintEngineStepNumber[];
  execution_mode: BlueprintExecutionMode;
  language: "es";
};

export type BlueprintEngineTemplateSelectionV1 = {
  master_template_key: "MASTER_TEMPLATE_LATAM";
  master_template_version_id: string;
  institutional_template_key?: string | null;
  institutional_template_version_id?: string | null;
  citation_style?: BlueprintCitationStyle | null;
};

export type BlueprintEngineProjectContextV1 = {
  topic: string;
  problem_context: string | null;
  research_line: string | null;
  methodology_preference: string | null;
  population_or_context: string | null;
  constraints: string | null;
  degree_level: string;
  university: string | null;
  program: string | null;
  country_context: "PE" | string;
};

export type BlueprintEngineGenerationOptionsV1 = {
  allow_llm: boolean;
  require_llm_for_sections: boolean;
  model_policy: BlueprintModelPolicy;
  use_prompt_cache: boolean;
  reuse_cached_artifacts: boolean;
  max_cost_cad?: number | null;
  max_runtime_ms?: number | null;
};

export type BlueprintEngineInputV1 = {
  schema_version: "blueprint_engine_input.v1";
  run_request: BlueprintEngineRunRequestV1;
  templates: BlueprintEngineTemplateSelectionV1;
  project_context: BlueprintEngineProjectContextV1;
  evidence_handoff: EvidenceEngineHandoffV1;
  generation_options?: BlueprintEngineGenerationOptionsV1;
};

