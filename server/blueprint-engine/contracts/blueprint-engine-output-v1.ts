import type { ArtifactRef } from "@/server/blueprint-engine/contracts/artifact-ref";
import type {
  BlueprintEngineStepNumber,
  BlueprintCitationStyle,
} from "@/server/blueprint-engine/contracts/blueprint-engine-input-v1";
import type { JsonValue } from "@/server/blueprint-engine/contracts/evidence-engine-handoff-v1";

export type BlueprintRunStatus = "completed" | "warn" | "blocked" | "failed";
export type BlueprintStepStatus = BlueprintRunStatus | "skipped";

export type BlueprintEngineCostSummaryV1 = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_cad: number;
  duration_ms: number;
};

export type BlueprintEngineRunOutputV1 = {
  blueprint_run_id: string;
  project_id: string;
  user_id: string;
  evidence_handoff_id: string;
  status: BlueprintRunStatus;
  started_at: string;
  completed_at: string | null;
  template_versions: {
    master_template_key: string;
    master_template_version_id: string;
    institutional_template_key?: string | null;
    institutional_template_version_id?: string | null;
    citation_style?: BlueprintCitationStyle | null;
  };
  cost_summary: BlueprintEngineCostSummaryV1;
};

export type BlueprintEngineStepOutputV1 = {
  step_number: BlueprintEngineStepNumber;
  step_key:
    | "master_template_runtime"
    | "prompt_planning"
    | "section_generation"
    | "consistency_matrix"
    | "blueprint_composition"
    | "master_docx_render"
    | "university_docx_render";
  status: BlueprintStepStatus;
  artifact_refs: ArtifactRef[];
  warnings: string[];
  blockers: string[];
};

export type DocumentRenderOutputV1 = {
  docx_ref: ArtifactRef;
  pdf_ref?: ArtifactRef | null;
  manifest_ref: ArtifactRef;
  qa_report_ref: ArtifactRef;
  qa_passed: boolean;
  qa_score_100: number;
  warnings: string[];
};

export type ReferenceUseOutputV1 = {
  reference_id: string;
  source_id: string;
  section_keys: string[];
  citation_intent: "supporting" | "comparative" | "methodological" | "theoretical";
  formal_reference_allowed: boolean;
  evidence_ids: string[];
};

export type AssetPlacementOutputV1 = {
  asset_key: string;
  source_id: string;
  section_key: string;
  placement_role: "figure" | "table" | "equation" | "annex";
  caption: string | null;
  artifact_ref: ArtifactRef | null;
  required_for_docx: boolean;
  warnings: string[];
};

export type PackageQualityOutputV1 = {
  status: BlueprintRunStatus;
  score_100: number;
  traceability_passed: boolean;
  export_ready: boolean;
  warnings: string[];
  blockers: string[];
};

export type BlueprintEngineArtifactsV1 = {
  template_import_context: JsonValue;
  section_prompt_plan: JsonValue;
  section_drafts: JsonValue[];
  consistency_matrix: JsonValue;
  blueprint_composition: JsonValue;
  validation_report: JsonValue;
  provenance_report: JsonValue;
  university_blueprint?: JsonValue;
  master_docx?: DocumentRenderOutputV1 | null;
  institutional_docx?: DocumentRenderOutputV1 | null;
  references_working_set: ReferenceUseOutputV1[];
  asset_placement_plan: AssetPlacementOutputV1[];
  package_quality_summary: PackageQualityOutputV1;
};

export type BlueprintEngineOutputV1 = {
  schema_version: "blueprint_engine_output.v1";
  blueprint_run: BlueprintEngineRunOutputV1;
  steps: BlueprintEngineStepOutputV1[];
  artifacts: BlueprintEngineArtifactsV1;
};

