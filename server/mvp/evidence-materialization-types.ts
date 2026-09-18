export const MVP_STEP5_KEY = "step_5_evidence_materialization";
export const MVP_STEP5_PROMPT_VERSION = "ingeniometrix-step5-evidence-materialization-v2";

export type MvpStep5CitationStyle = "APA7" | "ISO690" | "VANCOUVER" | "IEEE";

export type MvpStep5SourceRegistryRecord = {
  source_id: string;
  project_reference_id: string;
  reference_id: string;
  selected_order: number | null;
  provider: string;
  relevance_score: number | null;
  citation_key: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  landing_page_url: string | null;
  work_type: string | null;
  has_abstract: boolean;
  has_doi: boolean;
  has_landing_page: boolean;
  formatted_reference: string;
  formatting_status: "formatted" | "fallback_apa7_pending_renderer";
  selection_reason: string | null;
};

export type MvpStep5ReferenceRecord = {
  citation_key: string;
  reference_id: string;
  project_reference_id: string;
  citation_style: MvpStep5CitationStyle;
  formatted_reference: string;
  inline_citation_hint: string;
  reference_metadata: {
    doi: string | null;
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    landing_page_url: string | null;
  };
};

export type MvpStep5EvidenceBasis = "PDF_FULLTEXT" | "PDF_SAMPLE_TEXT" | "ABSTRACT_METADATA" | "VERIFIED_METADATA_ONLY";

export type MvpStep5TextChunk = {
  chunk_id: string;
  source_id: string;
  reference_id: string;
  citation_key: string;
  page_start: number;
  page_end: number;
  char_start: number;
  char_end: number;
  text: string;
};

export type MvpStep5PdfMaterialization = {
  source_id: string;
  reference_id: string;
  citation_key: string;
  status: "materialized" | "skipped_no_pdf" | "failed";
  original_pdf_path: string | null;
  source_pdf_path: string | null;
  fulltext_path: string | null;
  pages_path: string | null;
  chunks_path: string | null;
  pdf_sha256: string | null;
  fulltext_sha256: string | null;
  page_count: number;
  char_count: number;
  chunk_count: number;
  asset_signal_counts: {
    equations: number;
    tables: number;
    figures: number;
  };
  warnings: string[];
  errors: string[];
};

export type MvpStep5PdfLayoutCandidate = {
  candidate_id: string;
  source_id: string;
  page_number: number;
  asset_kind: "equation" | "table" | "figure";
  detection_method:
      | "pymupdf_image_block"
      | "pymupdf_find_tables"
      | "pymupdf_equation_text_line"
      | "caption_inferred_region";
  bbox_pdf_points: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  body_bbox_pdf_points?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  caption_bbox_pdf_points?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  page_width_points: number;
  page_height_points: number;
  caption_text: string | null;
  nearby_text: string | null;
  score_100: number;
  crop_path: string | null;
  body_crop_path?: string | null;
  page_image_path: string | null;
  crop_pixels: {
    width: number;
    height: number;
    dpi: number;
  } | null;
  body_crop_pixels?: {
    width: number;
    height: number;
    dpi: number;
  } | null;
  warnings: string[];
  errors: string[];
};

export type MvpStep5PdfLayoutInventory = {
  source_id: string;
  reference_id: string;
  citation_key: string;
  status: "completed" | "failed" | "skipped_no_pdf";
  extractor: "pymupdf";
  extractor_version: string | null;
  pdf_path: string | null;
  page_count: number;
  pages: Array<{
    page_number: number;
    width_points: number;
    height_points: number;
    text_line_count: number;
    image_block_count: number;
    candidate_count: number;
  }>;
  candidates: MvpStep5PdfLayoutCandidate[];
  warnings: string[];
  errors: string[];
};

export type MvpStep5SourceAsset = {
  asset_id: string;
  source_id: string;
  reference_id: string;
  citation_key: string;
  asset_kind: "equation" | "table" | "figure";
  status: "ready_for_review" | "text_only" | "render_failed";
  page_number: number;
  detection_method: "text_signal" | "pymupdf_layout";
  caption_or_signal_text: string | null;
  caption_text?: string | null;
  nearby_text_excerpt: string | null;
  render_strategy: "page_image_fallback" | "text_only" | "layout_crop";
  image_path: string | null;
  structured_path: string | null;
  body_image_path?: string | null;
  fallback_image_path?: string | null;
  primary_representation?: "latex" | "image" | "text_only";
  quality_flags?: string[];
  coordinates?: {
    status: "exact_bbox" | "pending_exact_bbox";
    unit: "pdf_points";
    bbox: null | {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    page_width: number | null;
    page_height: number | null;
    source: "pymupdf_layout" | "text_signal";
    fallback_page_image_path: string | null;
  };
  fallback_insert_as_image: boolean;
  warnings: string[];
  errors: string[];
};

export type MvpStep5BudgetPolicy = {
  policy_version: "step5-budget-policy-v1";
  raw_asset_signal_cap_per_source: number;
  rendered_asset_page_cap_per_source: number;
  curated_asset_cap_per_source: number;
  curated_asset_total_target: number;
  curated_asset_total_hard_cap: number;
  min_asset_score_for_blueprint: number;
  max_chunks_per_source_for_light_summary: number;
  max_chars_per_source_for_light_summary: number;
  max_chunks_per_section_for_strong_model: number;
  max_total_chars_for_strong_model: number;
  source: "env_overrides_with_release0_defaults";
};

export type MvpStep5CuratedAsset = MvpStep5SourceAsset & {
  curation_status: "CURATED_FOR_BLUEPRINT";
  curation_score_100: number;
  curation_reason: string;
  section_key: string;
  citation_anchor: {
    citation_key: string;
    reference_id: string;
    source_id: string;
    page_number: number;
    asset_id: string;
    chunk_id: string | null;
  };
  coordinates: {
    status: "exact_bbox" | "pending_exact_bbox";
    unit: "pdf_points";
    bbox: null | {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    page_width: number | null;
    page_height: number | null;
    source: "pymupdf_layout" | "text_signal";
    fallback_page_image_path: string | null;
  };
};

export type MvpStep5VisualLocalizedAsset = {
  asset_id: string;
  source_id: string;
  reference_id: string;
  citation_key: string;
  asset_kind: MvpStep5SourceAsset["asset_kind"];
  section_key: string;
  page_number: number;
  prompt_version: string;
  model: string | null;
  localization_status: "localized" | "ambiguous" | "not_found" | "failed" | "skipped";
  confidence_100: number | null;
  bbox_normalized: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  bbox_pixels: {
    x: number;
    y: number;
    width: number;
    height: number;
    page_width: number;
    page_height: number;
  } | null;
  visual_description_es: string | null;
  equation_latex: string | null;
  equation_latex_status: "transcribed" | "partial" | "not_equation" | "failed" | "not_applicable" | null;
  equation_latex_confidence_100: number | null;
  page_image_path: string | null;
  cropped_image_path: string | null;
  fallback_page_image_path: string | null;
  citation_anchor: {
    citation_key: string;
    reference_id: string;
    source_id: string;
    page_number: number;
    chunk_id: string | null;
    asset_id: string;
  };
  warnings: string[];
  errors: string[];
};

export type MvpStep5EvidenceCard = {
  card_id: string;
  source_id: string;
  reference_id: string;
  project_reference_id: string;
  citation_key: string;
  evidence_basis: MvpStep5EvidenceBasis;
  allowed_evidence_use: "central_claim_support" | "method_support" | "context_only" | "gap_only" | "do_not_use";
  source_health: string;
  quality_status: "READY_FOR_PRELIMINARY_PLANNING" | "NEEDS_FULL_TEXT_REVIEW" | "INSUFFICIENT_FOR_SECTION_DRAFTING";
  quality_score_100: number;
  requires_full_text: boolean;
  assigned_section_keys: string[];
  text_excerpt: string | null;
  traceable_summary: string;
  extractable_claim_types: string[];
  extraction_gaps: string[];
  asset_candidates: {
    equations: number;
    tables: number;
    figures: number;
    fallback_rendering: "none" | "image_required_after_pdf_extraction";
  };
  source_artifacts: {
    downloaded_pdf_path: string | null;
    sample_text_path: string | null;
    fulltext_path: string | null;
    chunks_path: string | null;
    pages_path: string | null;
  };
  semantic_extraction?: {
    status: "not_run" | "completed" | "failed" | "skipped_no_text";
    quality_score_100: number | null;
    quality_decision: "sufficient_for_blueprint_preparation" | "needs_more_evidence" | "insufficient" | null;
    evidence_item_count: number;
    method_theory_count: number;
    variable_count: number;
    limitation_count: number;
    source_extraction_path: string | null;
  };
};

export type MvpStep5SemanticCitationAnchor = {
  citation_key: string;
  reference_id: string;
  source_id: string;
  page_number: number | null;
  chunk_id: string | null;
};

export type MvpStep5SemanticEvidenceItem = {
  evidence_id: string;
  source_id: string;
  citation_key: string;
  section_key: string;
  claim_type: string;
  traceable_summary_es: string;
  supporting_quote_or_paraphrase_es: string;
  citation_anchor: MvpStep5SemanticCitationAnchor;
  confidence_100: number;
  allowed_use: "blueprint_planning" | "theory_or_method_support" | "context_only" | "gap_only";
  gaps: string[];
};

export type MvpStep5SemanticExtraction = {
  source_id: string;
  reference_id: string;
  citation_key: string;
  prompt_version: string;
  model: string | null;
  status: "completed" | "failed" | "skipped_no_text";
  evidence_basis: MvpStep5EvidenceBasis;
  input_chunk_count: number;
  input_char_count: number;
  extracted_at: string;
  quality_score_100: number | null;
  quality_decision: "sufficient_for_blueprint_preparation" | "needs_more_evidence" | "insufficient" | null;
  technique_method_theory: Array<{
    label_es: string;
    type: "technique" | "method" | "theory" | "model" | "concept";
    description_es: string;
    citation_anchor: MvpStep5SemanticCitationAnchor;
    confidence_100: number;
  }>;
  variables_or_constructs: Array<{
    name_es: string;
    description_es: string;
    role: "variable" | "indicator" | "parameter" | "category" | "metric";
    citation_anchor: MvpStep5SemanticCitationAnchor;
    confidence_100: number;
  }>;
  limitations: Array<{
    limitation_es: string;
    citation_anchor: MvpStep5SemanticCitationAnchor;
    confidence_100: number;
  }>;
  evidence_items: MvpStep5SemanticEvidenceItem[];
  asset_reviews: Array<{
    asset_id: string;
    source_id: string;
    section_key: string;
    relevance_score_100: number;
    description_es: string;
    keep_for_blueprint: boolean;
    rendering_strategy: "use_page_image_fallback" | "needs_crop_or_reconstruction" | "do_not_use";
    citation_anchor: MvpStep5SemanticCitationAnchor;
  }>;
  section_coverage: Array<{
    section_key: string;
    coverage_score_100: number;
    usable_evidence_ids: string[];
    gaps: string[];
  }>;
  gaps: string[];
  warnings: string[];
  errors: string[];
  artifact_path: string | null;
};

export type MvpStep5SectionContentPlanItem = {
  section_key: string;
  section_label: string;
  purpose: string;
  evidence_targets: string[];
  preferred_source_ids: string[];
  required_reference_count: number;
  useful_asset_kinds: string[];
  extraction_targets: string[];
  allowed_claim_types: string[];
  claims_to_avoid: string[];
};

export type MvpStep5LlmWavePlanItem = {
  wave_key: string;
  status: "planned_not_executed" | "executed" | "partially_executed" | "failed";
  criticality: "critical" | "recommended" | "optional";
  model_tier: "fast_light" | "coding" | "strong_reasoning" | "deep_search_light";
  prompt_version: string;
  input_contract: string[];
  output_contract: string[];
  cache_key_material: string[];
  retry_strategy: string;
  fallback_strategy: string;
};

export type MvpStep5EvidenceLedger = {
  project_id: string;
  step_run_id: string;
  template_key: string;
  template_version_id: string | null;
  citation_style: MvpStep5CitationStyle;
  source_registry: MvpStep5SourceRegistryRecord[];
  references: MvpStep5ReferenceRecord[];
  pdf_materializations: MvpStep5PdfMaterialization[];
  pdf_layout_inventories: MvpStep5PdfLayoutInventory[];
  source_assets: MvpStep5SourceAsset[];
  curated_assets: MvpStep5CuratedAsset[];
  visual_localized_assets: MvpStep5VisualLocalizedAsset[];
  semantic_extractions: MvpStep5SemanticExtraction[];
  budget_policy: MvpStep5BudgetPolicy;
  evidence_cards: MvpStep5EvidenceCard[];
  section_content_plan: MvpStep5SectionContentPlanItem[];
  llm_wave_plan: MvpStep5LlmWavePlanItem[];
  artifact_manifest_path: string;
  warnings: string[];
};

export type MvpStep5Result = {
  step_key: typeof MVP_STEP5_KEY;
  prompt_version: typeof MVP_STEP5_PROMPT_VERSION;
  project_id: string;
  step_run_id: string;
  template_content_plan_id: string;
  evidence_ledger_id: string;
  status: "completed" | "partially_completed";
  template_key: string;
  template_version_id: string | null;
  citation_style: MvpStep5CitationStyle;
  selected_source_count: number;
  planned_section_count: number;
  planned_llm_wave_count: number;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  artifact_dir: string;
  artifact_manifest_path: string;
  artifacts: {
    manifest: string;
    source_registry: string;
    references: string;
    pdf_materializations: string;
    pdf_layout_inventories: string;
    source_assets: string;
    curated_assets: string;
    visual_localized_assets: string;
    blueprint_v2_evidence_ledger: string;
    semantic_extractions: string;
    budget_policy: string;
    api_usage_report: string;
    evidence_cards: string;
    extraction_gaps: string;
    section_content_plan: string;
    llm_wave_plan: string;
    evidence_ledger: string;
  };
  source_registry: MvpStep5SourceRegistryRecord[];
  references: MvpStep5ReferenceRecord[];
  pdf_materializations: MvpStep5PdfMaterialization[];
  pdf_layout_inventories: MvpStep5PdfLayoutInventory[];
  pdf_layout_candidate_count: number;
  materialized_pdf_count: number;
  fulltext_chunk_count: number;
  source_assets: MvpStep5SourceAsset[];
  source_asset_count: number;
  rendered_asset_page_count: number;
  curated_assets: MvpStep5CuratedAsset[];
  curated_asset_count: number;
  visual_localized_assets: MvpStep5VisualLocalizedAsset[];
  visual_localized_asset_count: number;
  semantic_extractions: MvpStep5SemanticExtraction[];
  semantic_extraction_count: number;
  budget_policy: MvpStep5BudgetPolicy;
  evidence_cards: MvpStep5EvidenceCard[];
  evidence_card_count: number;
  extraction_gap_count: number;
  section_content_plan: MvpStep5SectionContentPlanItem[];
  llm_wave_plan: MvpStep5LlmWavePlanItem[];
  warnings: string[];
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
};
