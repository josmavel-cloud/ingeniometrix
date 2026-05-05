import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type {
  PublicAppendixItem,
  ResearchBudgetPlan,
  ResearchBudgetRow,
  ScheduleGanttRow,
} from "@/server/blueprint-v2/editorial/project-management-policy";
import type {
  SectionEvidenceBinding,
  SectionEvidenceSupportSummary,
} from "@/server/blueprint-v2/types";

export type AcademicDocumentVariant = "master" | "university";
export type AcademicCitationStyle = "APA7";
export type AcademicReportArchetype = "indexed_paper_like" | "institutional_thesis_project";

export type AcademicDocumentMetadata = {
  title: string;
  short_header_title?: string | null;
  keywords_line?: string | null;
  subtitle: string;
  university: string | null;
  program: string | null;
  generated_at: string;
};

export type AcademicBrandingAsset = {
  role: "master_logo" | "institution_logo";
  label: string;
  asset_key: string;
  available: boolean;
  file_path: string | null;
  content_base64: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  warnings: string[];
};

export type WordStyleContract = {
  title: string;
  subtitle: string;
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  heading5: string;
  body: string;
  caption: string;
  table: string;
  tableHeader: string;
  matrixCell: string;
  reference: string;
  annexHeading: string;
};

export type AcademicReference = {
  source_id: string;
  reference_id: string | null;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  apa_label: string;
  apa_reference: string;
};

export type CitationAnchor = {
  anchor_id: string;
  section_key: string;
  paragraph_index: number;
  source_ids: string[];
  evidence_ids?: string[];
  original_excerpt_ids?: string[];
  rendered_citation: string;
  reason: string;
};

export type AcademicTextBlock = {
  block_type: "paragraph" | "bullet";
  text: string;
  citation_anchor_ids: string[];
};

export type AcademicTableBlock = {
  block_type: "table";
  rows: string[][];
  layout: TableLayoutDecision;
  caption: string | null;
};

export type AcademicSectionBlock = AcademicTextBlock | AcademicTableBlock;

export type AcademicSection = {
  section_key: string;
  title: string;
  level: number;
  source_ids: string[];
  evidence_ids?: string[];
  original_excerpt_ids?: string[];
  asset_keys?: string[];
  evidence_support_summary?: SectionEvidenceSupportSummary;
  support_tier?: SectionEvidenceBinding["support_tier"];
  section_evidence_binding_score?: number;
  unsupported_or_cautious_claim_warnings?: string[];
  citation_anchors: CitationAnchor[];
  blocks: AcademicSectionBlock[];
  warnings: string[];
};

export type AcademicEditorialPlan = {
  artifact_type: "academic_editorial_plan";
  artifact_version: "v1";
  source: "deterministic_preflight";
  archetype: AcademicReportArchetype;
  main_body_section_keys: string[];
  annex_section_keys: string[];
  suppressed_section_keys: string[];
  title_overrides: Record<string, string>;
  duplicate_pairs: Array<{
    left_section_key: string;
    right_section_key: string;
    similarity: number;
    action: "keep_both" | "suppress_left" | "suppress_right" | "review";
    reason: string;
  }>;
  quality_warnings: string[];
};

export type AcademicLlmEditorialPass = {
  artifact_type: "academic_llm_editorial_pass";
  artifact_version: "v1";
  generated_at: string;
  llm_used: boolean;
  status: "applied" | "skipped" | "failed";
  model: string | null;
  tracking_label: string;
  usage: {
    provider: string;
    model: string;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    cost_cad: number;
    duration_ms: number;
  } | null;
  section_operations: Array<{
    section_key: string;
    revised_title: string | null;
    applied: boolean;
    operation_summary: string;
    warnings: string[];
  }>;
  warnings: string[];
};

export type AcademicLlmLayoutPass = {
  artifact_type: "academic_llm_layout_pass";
  artifact_version: "v1";
  generated_at: string;
  llm_used: boolean;
  status: "applied" | "skipped" | "failed";
  model: string | null;
  tracking_label: string;
  usage: AcademicLlmEditorialPass["usage"];
  figure_updates: number;
  equation_updates: number;
  cover_visual_updated: boolean;
  warnings: string[];
};

export type AcademicPublicSanitizationPass = {
  artifact_type: "academic_public_sanitization_pass";
  artifact_version: "v1";
  generated_at: string;
  source: "deterministic";
  source_title_replacements: number;
  citation_anchors_added: number;
  sections_touched: string[];
  remaining_title_leaks: Array<{
    section_key: string;
    source_id: string;
    title: string;
    context: string;
  }>;
  warnings: string[];
};

export type AssetPlacement = {
  asset_key: string;
  source_id: string;
  section_key: string;
  placement: "after_paragraph" | "before_section" | "landscape_block" | "annex";
  paragraph_anchor: number | null;
  caption: string;
  render_mode: "image" | "table" | "equation" | "text_fallback";
  renderable: boolean;
  file_path: string | null;
  text_content: string | null;
  warnings: string[];
};

export type FigureLayoutPlan = {
  asset_key: string;
  source_id: string;
  section_key: string;
  figure_number: number;
  caption: string;
  source_note: string;
  body_reference: string;
  file_path: string;
  warnings: string[];
};

export type EquationLayoutPlan = {
  asset_key: string;
  source_id: string;
  section_key: string;
  equation_number: number;
  latex: string;
  display_text: string;
  caption: string;
  source_note: string;
  body_reference: string;
  warnings: string[];
};

export type ScheduleVisualTask = {
  task: string;
  start_month: number;
  end_month: number;
  phase:
    | "planificacion"
    | "revision"
    | "metodologia"
    | "ejecucion"
    | "analisis"
    | "redaccion"
    | "revision_asesor"
    | "cierre";
  dependency?: string | null;
  deliverable?: string | null;
  duration?: string | null;
  assumption?: string | null;
};

export type ScheduleVisualPlan = {
  label: string;
  caption: string;
  source_note: string;
  tasks: ScheduleVisualTask[];
};

export type CoverVisualPlan = {
  hero_visual_type?: "methodological_infographic_cover" | "conceptual_cover";
  source_handoff_id?: string | null;
  source_evidence_run_id?: string | null;
  source_snapshot_hash?: string | null;
  deterministic_template_asset?: boolean;
  title: string;
  subtitle: string;
  concept: string;
  method_summary: string;
  prompt: string;
  hero_prompt_summary?: string | null;
  hero_visual_caption?: string | null;
  negative_prompt: string;
  image_path: string | null;
  image_model: string | null;
  image_generation_status: "not_requested" | "generated" | "skipped" | "failed";
  image_generation_warnings: string[];
  image_layout: {
    width_px: number;
    height_px: number;
    min_first_page_height_pct: number;
  };
  palette: {
    background: string;
    primary: string;
    accent: string;
    muted: string;
  };
};

export type AcademicDocxLayoutPlan = {
  artifact_type: "academic_docx_layout_plan";
  artifact_version: "v1";
  generated_at: string;
  source: "deterministic_preflight" | "llm_refined";
  figures: FigureLayoutPlan[];
  equations: EquationLayoutPlan[];
  schedule_visual: ScheduleVisualPlan | null;
  schedule_gantt_rows?: ScheduleGanttRow[];
  budget_rows?: ResearchBudgetRow[];
  budget_total_range?: ResearchBudgetPlan["total_estimated_range"] | null;
  appendix_public_items?: PublicAppendixItem[];
  appendix_internal_items?: string[];
  cover_visual: CoverVisualPlan;
  suppressed_asset_keys: string[];
  public_annex_policy: {
    include_internal_traceability: boolean;
    omitted_internal_fields: string[];
  };
  warnings: string[];
};

export type TableLayoutDecision = {
  orientation: "portrait" | "landscape";
  column_widths_pct: number[];
  font_size_pt: number;
  repeat_header: boolean;
  allow_wrap: boolean;
  split_strategy: "single_table" | "chunked_by_rows";
};

export type AcademicDocumentQaPolicy = {
  require_landscape_matrix: boolean;
  require_references: boolean;
  require_traceability_annex: boolean;
  forbid_markdown_markers: boolean;
};

export type AcademicDocument = {
  artifact_type: "academic_document_model";
  artifact_version: "v1";
  variant: AcademicDocumentVariant;
  template_key: string;
  template_name: string;
  citation_style: AcademicCitationStyle;
  report_archetype: AcademicReportArchetype;
  metadata: AcademicDocumentMetadata;
  branding: AcademicBrandingAsset[];
  editorial_plan: AcademicEditorialPlan;
  llm_editorial_passes: AcademicLlmEditorialPass[];
  public_sanitization_passes: AcademicPublicSanitizationPass[];
  llm_layout_passes: AcademicLlmLayoutPass[];
  layout_plan: AcademicDocxLayoutPlan;
  style_contract: WordStyleContract;
  sections: AcademicSection[];
  matrix: ConsistencyMatrixArtifact;
  matrix_layout: TableLayoutDecision;
  references: AcademicReference[];
  asset_placements: AssetPlacement[];
  qa_policy: AcademicDocumentQaPolicy;
  warnings: string[];
};
