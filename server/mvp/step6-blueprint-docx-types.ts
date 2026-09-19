export const MVP_STEP6_KEY = "step_6_blueprint_docx";
export const MVP_STEP6_PROMPT_VERSION = "ingeniometrix-step6-blueprint-docx-v3";

export type MvpStep6SectionPriority = "required" | "recommended" | "annex";
export type MvpStep6SectionOutputMode =
  | "narrative"
  | "bullet_list"
  | "native_table"
  | "figure_supported"
  | "equation_supported"
  | "references";

export type MvpStep6SectionGenerationWave =
  | "core"
  | "complementary"
  | "deterministic"
  | "editorial";

export type MvpStep6CitationAnchor = {
  section_key: string;
  block_id: string | null;
  paragraph_index: number;
  sentence_index: number | null;
  source_id: string;
  evidence_id: string | null;
  snippet_id: string | null;
  citation_label: string;
  claim_summary: string;
};

export type MvpStep6SectionPlanItem = {
  section_key: string;
  title: string;
  level: 1 | 2 | 3;
  order: number;
  priority: MvpStep6SectionPriority;
  purpose: string;
  min_words: number;
  max_words: number;
  output_modes: MvpStep6SectionOutputMode[];
  evidence_section_keys: string[];
  required_source_count: number;
  allowed_claim_types: string[];
  claims_to_avoid: string[];
  asset_policy: {
    allow_figures: boolean;
    allow_equations: boolean;
    allow_tables: boolean;
    max_assets: number;
  };
  fallback_policy: string;
};

export type MvpStep6ContentBlock =
  | {
      kind: "paragraph";
      text: string;
    }
  | {
      kind: "bullet_list";
      items: string[];
    }
  | {
      kind: "table";
      title: string;
      rows: string[][];
      source_note: string;
      render_hint?: "standard" | "compact_landscape" | "compact";
    }
  | {
      kind: "figure";
      caption_type?: "figure" | "table" | "equation";
      title: string;
      image_path: string | null;
      source_note: string;
      asset_key: string | null;
      source_id: string | null;
      render_hint?: "standard" | "landscape_full";
    }
  | {
      kind: "equation";
      latex: string;
      source_note: string;
      asset_key: string | null;
      source_id: string | null;
    }
  | {
      kind: "reference_list";
      items: string[];
    };

export type MvpStep6SectionDraft = {
  section_key: string;
  title: string;
  level: 1 | 2 | 3;
  order: number;
  status: "generated" | "deterministic_fallback" | "blocked";
  generation_source: "llm" | "deterministic" | "system";
  word_count: number;
  generation_wave: MvpStep6SectionGenerationWave;
  blocks: MvpStep6ContentBlock[];
  citation_anchors: MvpStep6CitationAnchor[];
  used_source_ids: string[];
  used_evidence_ids: string[];
  used_snippet_ids: string[];
  used_asset_keys: string[];
  assumptions: string[];
  limitations: string[];
  warnings: string[];
};

export type MvpStep6HeroImagePlan = {
  prompt_version: string;
  placement: "cover" | "post_matrix_summary";
  visual_type: "methodological_infographic_cover" | "methodological_summary_hero";
  prompt: string;
  negative_prompt: string;
  summary: string;
  image_path: string | null;
  image_model: string | null;
  status: "generated" | "svg_fallback" | "failed" | "skipped";
  warnings: string[];
};

export type MvpStep6VisualAssetPlan = {
  asset_id: string;
  asset_type: "hero_infographic" | "conceptual_diagram" | "methodology_workflow" | "evidence_comparison_table" | "research_design_table" | "consistency_matrix_image" | "consistency_matrix_table" | "equation" | "source_asset";
  purpose: string;
  destination_section: string;
  origin: "original_design" | "evidence_synthesis" | "reproduced_source";
  content_specification: unknown;
  supporting_source_ids: string[];
  rendering_method: string;
  caption: string;
  attribution: string;
  quality_requirements: string[];
  status: "generated" | "accepted" | "rejected" | "not_applicable" | "failed";
  output_paths: string[];
  failure_reason: string | null;
  validation: unknown;
};

export type MvpStep6VisualPlan = {
  artifact_type: "mvp_step6_visual_plan";
  artifact_version: "v1";
  generated_at: string;
  research_design_hash: string;
  matrix_hash: string;
  matrix_sequence: string[];
  assets: MvpStep6VisualAssetPlan[];
  image_requests: { initial: number; repairs: number };
  warnings: string[];
};

export type MvpStep6PageBudgetPlan = {
  artifact_type: "mvp_step6_page_budget_plan";
  artifact_version: "v1";
  max_pages: number;
  estimated_pages: number;
  max_body_words: number;
  words_per_page_estimate: number;
  fixed_page_reservations: Array<{
    label: string;
    pages: number;
  }>;
  section_budgets: Array<{
    section_key: string;
    target_words: number;
    max_words: number;
    estimated_pages: number;
    notes: string;
  }>;
  compression_policy: string[];
};

export type MvpStep6TitlePlan = {
  artifact_type: "mvp_step6_title_plan";
  artifact_version: "v1";
  status: "generated" | "fallback" | "failed";
  model: string | null;
  prompt_version: string | null;
  original_title: string;
  title: string;
  short_title: string;
  rationale: string;
  keywords: string[];
  warnings: string[];
};

export type MvpStep6AcademicStyleContract = {
  artifact_type: "mvp_step6_academic_style_contract";
  artifact_version: "v1";
  renderer: "docx_code_template";
  logo_asset_path: string | null;
  language: "es";
  tone: "academico_profesional_sobrio";
  citation_policy: "solo_fuentes_recuperadas";
  document_policy: string[];
  fraud_safety: string[];
  page: {
    paper_size: "letter";
    margin_top_cm: number;
    margin_right_cm: number;
    margin_bottom_cm: number;
    margin_left_cm: number;
  };
  typography: {
    body_font: string;
    body_size_pt: number;
    line_spacing: "one_point_fifteen" | "one_point_five" | "double";
    paragraph_alignment: "justify";
    first_line_indent_cm: number;
  };
  headings: Array<{
    level: 1 | 2 | 3 | 4 | 5;
    style_id: string;
    numbered: boolean;
  }>;
  captions: {
    table_prefix: string;
    figure_prefix: string;
    equation_prefix: string;
    source_note_prefix: string;
  };
  header_footer: {
    header_left: string;
    header_right: string;
    footer_center: string;
  };
};

export type MvpStep6CrossReferencePlanItem = {
  ref_id: string;
  ref_type: "figure" | "table" | "equation" | "matrix";
  label: string;
  title: string;
  section_key: string;
  source_id: string | null;
  asset_key: string | null;
  source_note: string | null;
  original_pdf_mentions: Array<{
    source_id: string;
    page_number: number | null;
    mention: string;
    context_excerpt: string;
  }>;
  used_in_section_keys: string[];
};

export type MvpStep6EditorialReport = {
  artifact_type: "mvp_step6_editorial_report";
  artifact_version: "v1";
  status: "applied" | "skipped" | "failed";
  model: string | null;
  prompt_version: string | null;
  revised_section_count: number;
  warnings: string[];
  notes: string[];
};

export type MvpStep6BlueprintPackage = {
  scientific_plan?: {
    definition: import("./research-plan-contracts").ResearchDefinition;
    design: import("./research-plan-contracts").ResearchDesign;
    matrix: import("zod").infer<typeof import("./research-plan-contracts").consistencyMatrixSchema>;
    generation_order: string[];
  };
  artifact_type: "mvp_step6_blueprint_docx_package";
  artifact_version: "v1";
  project_id: string;
  step_run_id: string;
  blueprint_version_id: string | null;
  generated_at: string;
  academic_style_contract: MvpStep6AcademicStyleContract;
  page_budget_plan: MvpStep6PageBudgetPlan;
  title_plan: MvpStep6TitlePlan;
  section_generation_order: Array<{
    wave: MvpStep6SectionGenerationWave;
    section_keys: string[];
    model_tier: "strong_reasoning" | "fast_light" | "deterministic";
  }>;
  section_plan: MvpStep6SectionPlanItem[];
  section_drafts: MvpStep6SectionDraft[];
  editorial_report: MvpStep6EditorialReport;
  hero_image: MvpStep6HeroImagePlan;
  summary_hero_image: MvpStep6HeroImagePlan;
  visual_plan?: MvpStep6VisualPlan;
  citation_coordinate_plan: MvpStep6CitationAnchor[];
  cross_reference_plan: MvpStep6CrossReferencePlanItem[];
  asset_placement_plan: Array<{
    section_key: string;
    asset_key: string;
    placement: "after_opening_context" | "after_method_context" | "annex";
    source_id: string | null;
  }>;
  traceability_matrix: Array<{
    section_key: string;
    source_ids: string[];
    evidence_ids: string[];
    snippet_ids: string[];
    asset_keys: string[];
    warnings: string[];
  }>;
  coherence_report: {
    status: "passed" | "passed_with_warnings" | "failed";
    checks: Array<{
      key: string;
      passed: boolean;
      detail: string;
    }>;
    warnings: string[];
  };
  step7_export_contract: {
    docx_path: string;
    blueprint_version_id: string | null;
    references_available: boolean;
    evidence_log_available: boolean;
    citation_style: string;
  };
};

export type MvpStep6Result = {
  pdf_path?: string;
  step_key: typeof MVP_STEP6_KEY;
  prompt_version: typeof MVP_STEP6_PROMPT_VERSION;
  project_id: string;
  step_run_id: string;
  blueprint_version_id: string;
  status: "completed" | "partially_completed";
  started_at: string;
  completed_at: string;
  duration_ms: number;
  artifact_dir: string;
  artifact_manifest_path: string;
  docx_path: string;
  artifacts: {
    manifest: string;
    section_plan: string;
    section_drafts: string;
    blueprint_package: string;
    coherence_report: string;
    validation_report: string;
    traceability_matrix: string;
    style_contract: string;
    page_budget_plan: string;
    title_plan: string;
    section_generation_order: string;
    citation_coordinate_plan: string;
    cross_reference_plan: string;
    asset_placement_plan: string;
    editorial_report: string;
    hero_image_plan: string;
    summary_hero_image_plan: string;
    step7_export_contract: string;
    api_usage_report: string;
  };
  metrics: {
    section_count: number;
    llm_section_count: number;
    deterministic_section_count: number;
    source_count: number;
    evidence_item_count: number;
    asset_count: number;
    warning_count: number;
  };
  api_usage: {
    run_id: string;
    report_path: string;
    llm_calls_executed: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    estimated_cost_cad: number;
  };
  warnings: string[];
};
