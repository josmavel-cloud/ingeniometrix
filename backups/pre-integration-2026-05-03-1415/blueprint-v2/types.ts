import type { Intake, Project, ProjectReference, Reference } from "@prisma/client";

import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

export type MasterBlueprintEngineProject = Project & {
  intake: Intake;
  projectReferences: Array<
    ProjectReference & {
      reference: Reference;
    }
  >;
  blueprintVersions?: Array<{
    versionNumber: number;
  }>;
};

export type BlueprintRunStageKey =
  | "preparing"
  | "gating_sources"
  | "acquiring_evidence"
  | "downloading_pdfs"
  | "extracting_evidence"
  | "planning_sections"
  | "generating_sections"
  | "building_matrix"
  | "composing_blueprint"
  | "validating_blueprint"
  | "deriving_university_blueprint"
  | "persisting"
  | "completed"
  | "failed";

export type BlueprintRunStage = {
  stageKey: BlueprintRunStageKey;
  label: string;
  progress: number;
  createdAt: string;
};

export type BlueprintRunManifest = {
  engine_name: "MasterBlueprintEngine";
  engine_version: string;
  run_id: string;
  project_id: string;
  user_id: string;
  started_at: string;
  completed_at: string | null;
  master_template_key: string;
  master_template_version_id: string | null;
  selected_template_key: string;
  stages: BlueprintRunStage[];
};

export type BlueprintSourceOrigin =
  | "selected_source"
  | "provider_expansion"
  | "websearch_source";

export type BlueprintSourceRecord = {
  source_id: string;
  reference_id: string | null;
  origin: BlueprintSourceOrigin;
  label: string;
  title: string;
  normalized_title: string;
  doi: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  landing_page_url: string | null;
  pdf_url: string | null;
  query: string | null;
  snippet: string | null;
  selected_order: number | null;
  citation_count: number | null;
  is_open_access: boolean;
  raw_openalex_json: unknown | null;
  raw_crossref_json: unknown | null;
  eligible_for_formal_reference: boolean;
};

export type SourceIntakeGateResult = {
  minimum_required_sources: number;
  selected_source_count: number;
  missing_source_count: number;
  fallback_required: boolean;
  coverage_warnings: string[];
  selected_sources: BlueprintSourceRecord[];
};

export type SourceAcquisitionDecision = {
  source_id: string;
  accepted: boolean;
  reason: string;
  origin: BlueprintSourceOrigin;
  query: string | null;
};

export type EvidenceAcquisitionResult = {
  target_source_count: number;
  source_registry: BlueprintSourceRecord[];
  provider_expansion_sources: BlueprintSourceRecord[];
  websearch_sources: BlueprintSourceRecord[];
  decisions: SourceAcquisitionDecision[];
  warnings: string[];
};

export type PdfDownloadStatus = "downloaded" | "skipped" | "failed";
export type PdfAccessStrategy =
  | "direct_pdf_url"
  | "landing_page_discovery"
  | "doi_resolution"
  | "open_access_fallback"
  | "websearch_pdf_url";

export type PdfDownloadRecord = {
  source_id: string;
  title: string;
  pdf_url: string | null;
  resolved_pdf_url: string | null;
  access_strategy: PdfAccessStrategy | null;
  http_status: number | null;
  status: PdfDownloadStatus;
  reason: string | null;
  stored_file_path: string | null;
  file_size_bytes: number | null;
};

export type PdfDownloadResult = {
  records: PdfDownloadRecord[];
  warnings: string[];
};

export type PdfAssetRecord = {
  source_id: string;
  asset_key: string;
  title: string;
  kind: "image" | "equation" | "table";
  caption: string | null;
  page_number: number | null;
  file_path: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  text_content: string | null;
  extraction_origin: "pdf_native" | "llm_reconstructed";
  extracted: boolean;
};

export type EvidenceSnippet = {
  snippet_id: string;
  source_id: string | null;
  origin: "source" | "pdf" | "websearch" | "assumption_backed" | "intake";
  label: string;
  text: string;
  section_hint_keys: string[];
  confidence: number;
};

export type ExtractedEvidencePack = {
  source_id: string;
  problem_signal: string | null;
  method_signal: string | null;
  context_signal: string | null;
  finding_signal: string | null;
  limitation_signal: string | null;
  future_line_signal: string | null;
  abstract_summary: string | null;
  pdf_summary: string | null;
  pdf_sections: {
    abstract: string | null;
    methodology: string | null;
    results: string | null;
    conclusions: string | null;
    limitations: string | null;
    future_work: string | null;
  };
  snippets: EvidenceSnippet[];
  assets: PdfAssetRecord[];
};

export type AssumptionInput = {
  assumption_id: string;
  statement: string;
  reason: string;
  section_keys: string[];
};

export type EvidenceLedger = {
  source_registry: BlueprintSourceRecord[];
  evidence_packs: ExtractedEvidencePack[];
  assets: PdfAssetRecord[];
  assumptions: AssumptionInput[];
  snippets: EvidenceSnippet[];
  warnings: string[];
};

export type MasterTemplateSectionRuntime = {
  section_id: string;
  title: string;
  semantic_key: string;
  path_titles: string[];
  level: number;
  content_kind: string;
  required: boolean;
  instructions: string[];
  purpose: string | null;
  min_words: number | null;
  max_words: number | null;
};

export type MasterTemplateRuntime = {
  template_key: string;
  template_name: string;
  template_version_id: string;
  methodology_mode: string | null;
  citation_style: string | null;
  required_section_keys: string[];
  sections: MasterTemplateSectionRuntime[];
  guidance_notes: string[];
};

export type SectionGenerationPhase =
  | "body"
  | "logic"
  | "framing"
  | "references"
  | "matrix";

export type SectionGenerationPlanItem = {
  section_key: string;
  title: string;
  phase: SectionGenerationPhase;
  order: number;
  depends_on_keys: string[];
  instructions: string[];
  purpose: string | null;
  content_kind: string;
  required: boolean;
  min_words: number | null;
  max_words: number | null;
};

export type SectionPromptManifestItem = {
  section_key: string;
  title: string;
  phase: SectionGenerationPhase;
  prompt: string;
  evidence_snippet_ids: string[];
  supporting_source_ids: string[];
  supporting_pdf_source_ids: string[];
  supporting_web_source_ids: string[];
  supporting_assumption_ids: string[];
};

export type SectionPromptPlan = {
  generation_plan: SectionGenerationPlanItem[];
  prompt_manifest: SectionPromptManifestItem[];
};

export type DomainGenerationProfile = {
  domain_family:
    | "arquitectura_urbanismo"
    | "ingenieria_tecnica"
    | "salud_clinica"
    | "ciencias_sociales"
    | "educacion"
    | "negocios_gestion"
    | "derecho_politica_publica"
    | "general";
  evidence_style: "conceptual" | "empirical" | "technical" | "normative" | "mixed";
  preferred_output_modes: Array<
    | "narrative"
    | "comparative"
    | "criteria_table"
    | "equation_supported"
    | "figure_supported"
    | "code_or_algorithm"
    | "normative_matrix"
  >;
  reasoning: string[];
};

export type SectionInlineMark =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "subscript"
  | "superscript"
  | "highlight";

export type SectionInlineSpan = {
  span_id: string;
  text: string;
  marks?: SectionInlineMark[];
  link_url?: string | null;
  citation_source_ids?: string[];
  assumption_ids?: string[];
  snippet_ids?: string[];
  meta?: Record<string, unknown>;
};

export type SectionStructuredData = {
  schema_type:
    | "table"
    | "chart"
    | "equation"
    | "matrix"
    | "timeline"
    | "tree"
    | "graph"
    | "form"
    | "dataset"
    | "custom";
  columns?: string[];
  rows?: Array<Array<string | number | boolean | null>>;
  values?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export type SectionAssetRef = {
  asset_key: string;
  asset_kind?: string | null;
  title?: string | null;
  caption?: string | null;
  mime_type?: string | null;
  source_ids?: string[];
  snippet_ids?: string[];
  page_number?: number | null;
  meta?: Record<string, unknown>;
};

export type SectionContentBlock = {
  block_id: string;
  kind:
    | "node"
    | "group"
    | "rich_text"
    | "structured_data"
    | "asset"
    | "embed"
    | "annotation";
  role:
    | "heading"
    | "subheading"
    | "paragraph"
    | "lead"
    | "abstract"
    | "keyword_list"
    | "list"
    | "list_item"
    | "table"
    | "table_row"
    | "table_cell"
    | "figure"
    | "chart"
    | "diagram"
    | "equation"
    | "equation_derivation"
    | "formula_definition"
    | "code"
    | "algorithm"
    | "quote"
    | "citation"
    | "footnote"
    | "definition"
    | "proposition"
    | "theorem"
    | "lemma"
    | "proof"
    | "example"
    | "case"
    | "result"
    | "finding"
    | "discussion"
    | "warning"
    | "assumption"
    | "limitation"
    | "recommendation"
    | "appendix_item"
    | "reference_entry"
    | "matrix"
    | "timeline"
    | "budget"
    | "unknown";
  variant?: string | null;
  title?: string | null;
  text?: string | null;
  spans?: SectionInlineSpan[];
  structured_data?: SectionStructuredData | null;
  asset_ref?: SectionAssetRef | null;
  children?: SectionContentBlock[];
  order?: number;
  layout_hint?: "full_width" | "inline" | "left" | "right" | "grid" | "stack" | null;
  semantics?: string[];
  source_ids?: string[];
  pdf_source_ids?: string[];
  web_source_ids?: string[];
  assumption_ids?: string[];
  snippet_ids?: string[];
  warnings?: string[];
  meta?: Record<string, unknown>;
};

export type SectionSupportLevel =
  | "reference_supported"
  | "pdf_supported"
  | "web_supported"
  | "intake_supported"
  | "assumption_backed";

export type MasterSectionDraft = {
  section_key: string;
  title: string;
  phase: SectionGenerationPhase;
  content: string;
  content_kind: string;
  wave?: string;
  generation_strategy?: string;
  prompt_mode?: string;
  domain_profile?: DomainGenerationProfile;
  content_blocks?: SectionContentBlock[];
  content_format_version?: string;
  support_level: SectionSupportLevel;
  supported_source_ids: string[];
  supported_pdf_source_ids: string[];
  supported_web_source_ids: string[];
  supported_assumption_ids: string[];
  evidence_snippet_ids: string[];
  used_evidence_ids?: string[];
  used_original_excerpt_ids?: string[];
  used_asset_keys?: string[];
  used_reference_ids?: string[];
  citation_policy?: {
    expected_density: "none" | "low" | "medium" | "high";
    citation_mode:
      | "inline_required"
      | "inline_optional"
      | "references_only"
      | "deferred_to_docx";
  };
  execution_profile?: {
    complexity: "micro" | "light" | "medium" | "heavy";
    execution_mode: "deterministic" | "llm-low" | "llm-medium" | "llm-high";
    timeout_ms: number;
    max_retry_attempts: number;
    prompt_budget: "tiny" | "small" | "medium";
    model_tier: "high" | "medium" | "low" | "deterministic";
  };
  llm_metrics?: {
    provider: string;
    model: string;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    cost_cad: number;
    duration_ms: number;
  };
  citation_intents?: Array<{
    reference_id: string;
    source_id: string;
    evidence_id: string | null;
    target_block_id: string | null;
    target_sentence_hint: string | null;
    citation_role:
      | "supporting"
      | "comparative"
      | "methodological"
      | "theoretical";
    strength: "required" | "recommended" | "optional";
    insertion_mode: "defer_to_docx";
  }>;
  asset_placement_intents?: Array<{
    asset_key: string;
    placement_role: "figure" | "table" | "equation" | "annex";
    anchor_block_id: string | null;
    insert_after_block_id: string | null;
    caption_override?: string | null;
    required_for_docx: boolean;
  }>;
  attempt_count?: number;
  retry_reasons?: string[];
  fallback_cause?: string | null;
  prompt_hash?: string;
  bundle_hash?: string | null;
  quality_checks?: {
    min_words_pass: boolean;
    max_words_pass: boolean;
    required_structure_pass: boolean;
    critical_assets_pass: boolean;
    claims_guard_pass: boolean;
    language_pass: boolean;
    format_contamination_pass: boolean;
    citation_deferred_pass: boolean;
    punctuation_pass: boolean;
    research_logic_shape_pass?: boolean;
  };
  warnings: string[];
  prompt: string;
};

export type ConsistencyMatrixRow = {
  objective: string;
  question: string;
  method: string;
  technique: string;
};

export type SectionProvenanceBreakdown = {
  section_key: string;
  word_count: number;
  from_sources_pct: number;
  from_pdfs_pct: number;
  from_websearch_pct: number;
  from_assumption_backed_pct: number;
};

export type DocumentProvenanceReport = {
  from_sources_pct: number;
  from_pdfs_pct: number;
  from_websearch_pct: number;
  from_assumption_backed_pct: number;
  section_breakdown: SectionProvenanceBreakdown[];
};

export type MasterBlueprintValidationReport = {
  required_sections_present: boolean;
  missing_required_section_keys: string[];
  warnings: string[];
  reference_traceability_ok: boolean;
  formal_reference_ids: string[];
  quality_report: MasterBlueprintQualityReport;
};

export type MasterBlueprintQualityComponentKey =
  | "structure"
  | "coherence"
  | "traceability"
  | "evidence_support"
  | "objective_quality"
  | "methodology_clarity";

export type MasterBlueprintQualityComponentReport = {
  key: MasterBlueprintQualityComponentKey;
  label: string;
  score: number;
  max_score: number;
  notes: string[];
};

export type MasterBlueprintSemanticCriterionKey =
  | "problem_objective_alignment"
  | "objective_specificity"
  | "research_question_quality"
  | "methodology_design"
  | "evidence_grounding"
  | "academic_prudence";

export type MasterBlueprintSemanticCriterionReport = {
  key: MasterBlueprintSemanticCriterionKey;
  label: string;
  score_5: number;
  notes: string[];
};

export type MasterBlueprintSemanticReviewReport = {
  model: string | null;
  score_10: number | null;
  summary: string | null;
  recommendation: "approve" | "review" | "reject" | "skipped";
  criteria: MasterBlueprintSemanticCriterionReport[];
  warnings: string[];
};

export type MasterBlueprintQualityReport = {
  threshold: number;
  passed: boolean;
  deterministic_score_10: number;
  semantic_score_10: number | null;
  score_10: number;
  hard_failures: string[];
  soft_warnings: string[];
  components: MasterBlueprintQualityComponentReport[];
  semantic_review: MasterBlueprintSemanticReviewReport | null;
};

export type UniversityBlueprintSection = {
  section_key: string;
  title: string;
  level?: number;
  path_titles?: string[];
  content: string;
  derived_from_master_keys: string[];
  generated_for_template: boolean;
  source_ids?: string[];
  evidence_snippet_ids?: string[];
  used_asset_keys?: string[];
  reduction_strategy?:
    | "llm_reduced_merge"
    | "llm_reduced_exact"
    | "deterministic_merge"
    | "deterministic_exact"
    | "deterministic_gap";
  reduction_summary?: string;
  warnings?: string[];
};

export type UniversityBlueprintBrandingAsset = {
  role: "institution_logo";
  label: string;
  asset_key: string;
  file_path: string | null;
  content_base64: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  source: "template_runtime_db" | "template_runtime_fixture" | "local_fallback";
  warnings: string[];
};

export type UniversityBlueprintReductionPlan = {
  artifact_type: "university_blueprint_reduction_plan";
  artifact_version: "v1";
  generated_at: string;
  reducer: "llm_global_reducer" | "deterministic_fallback";
  llm_used: boolean;
  llm_generation: {
    provider: string;
    model: string;
    tracking_label: string;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    cost_cad: number;
    duration_ms: number;
  } | null;
  master_section_count: number;
  template_section_count: number;
  generated_section_count: number;
  section_mappings: Array<{
    target_section_key: string;
    target_title: string;
    target_level: number;
    matched_master_keys: string[];
    strategy: UniversityBlueprintSection["reduction_strategy"];
    reason: string;
    warnings: string[];
  }>;
  warnings: string[];
};

export type UniversityBlueprintPackage = {
  template_key: string;
  template_name: string;
  template_version_id: string;
  sections: UniversityBlueprintSection[];
  branding_assets?: UniversityBlueprintBrandingAsset[];
  reduction_plan?: UniversityBlueprintReductionPlan;
  warnings: string[];
};

export type MasterBlueprintPackage = {
  manifest: BlueprintRunManifest;
  source_gate: SourceIntakeGateResult;
  acquisition: EvidenceAcquisitionResult;
  pdf_downloads: PdfDownloadResult;
  evidence_ledger: EvidenceLedger;
  master_template: MasterTemplateRuntime;
  section_prompt_plan: SectionPromptPlan;
  master_section_drafts: MasterSectionDraft[];
  consistency_matrix: ConsistencyMatrixRow[];
  provenance_report: DocumentProvenanceReport;
  validation_report: MasterBlueprintValidationReport;
  legacy_blueprint: ResearchBlueprintRecord;
  university_blueprint: UniversityBlueprintPackage;
};
