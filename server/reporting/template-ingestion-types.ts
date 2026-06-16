import normalizedTemplateSourceDocumentSchemaJson from "@/ai/schemas/normalized-template-source-document.schema.json";
import templateSourceConventionalFallbacksSchemaJson from "@/ai/schemas/template-source-conventional-fallbacks.schema.json";
import templateSourceSemanticAnalysisSchemaJson from "@/ai/schemas/template-source-semantic-analysis.schema.json";
import templateCandidateSchemaJson from "@/ai/schemas/template-candidate.schema.json";

export const NORMALIZED_TEMPLATE_SOURCE_DOCUMENT_SCHEMA_NAME =
  "normalized_template_source_document";
export const TEMPLATE_SOURCE_CONVENTIONAL_FALLBACKS_SCHEMA_NAME =
  "template_source_conventional_fallbacks";
export const TEMPLATE_SOURCE_SEMANTIC_ANALYSIS_SCHEMA_NAME =
  "template_source_semantic_analysis";
export const TEMPLATE_CANDIDATE_SCHEMA_NAME = "template_candidate";

export const normalizedTemplateSourceDocumentSchema =
  normalizedTemplateSourceDocumentSchemaJson as Record<string, unknown>;
export const templateSourceConventionalFallbacksSchema =
  templateSourceConventionalFallbacksSchemaJson as Record<string, unknown>;
export const templateSourceSemanticAnalysisSchema =
  templateSourceSemanticAnalysisSchemaJson as Record<string, unknown>;
export const templateCandidateSchema = templateCandidateSchemaJson as Record<string, unknown>;

export type TemplateSourceType = "pdf_native_text" | "pdf_image" | "docx" | "text" | "manual";

export type TemplateDocumentKind =
  | "thesis_plan_instance"
  | "template_guide"
  | "thesis_final_instance"
  | "unknown";

export type TemplateMethodologyMode =
  | "quantitative"
  | "qualitative"
  | "technical"
  | "mixed"
  | "unknown";

export type CitationStyle = "APA7" | "VANCOUVER" | "ISO690" | "IEEE" | "CHICAGO" | "UNKNOWN";

export type TemplateReviewStatus = "draft" | "needs_review" | "reviewed";

export type CaptionPosition = "top" | "bottom";
export type NotePosition = "top" | "bottom" | "below_caption";
export type CaptionPrefixStyle = "label_title" | "label_period_title" | "label_colon_title";
export type CaptionFontStyle = "inherit" | "italic" | "bold";
export type EquationAlignment = "center" | "left" | "split";
export type EquationReferenceStyle = "parenthetical" | "inline";
export type CitationInlineStyle = "author_year" | "numeric" | "footnote";
export type ReferenceOrdering = "alphabetical" | "citation_order" | "manual";
export type ParagraphAlignment = "left" | "justify" | "center";
export type NumberingFormat = "plain" | "level_decimal";
export type PageNumberPosition = "top_right" | "bottom_center" | "bottom_right";
export type DoiPolicy = "preferred" | "required" | "ignore";

export type TemplatePageRule = {
  paper_size?: string | null;
  margin_left_cm?: number | null;
  margin_right_cm?: number | null;
  margin_top_cm?: number | null;
  margin_bottom_cm?: number | null;
  page_numbering?: boolean | null;
  page_number_position?: PageNumberPosition | null;
};

export type TemplateTitleRule = {
  level: number;
  numbered?: boolean | null;
  uppercase?: boolean | null;
  numbering_format?: NumberingFormat | null;
  spacing_before_pt?: number | null;
  spacing_after_pt?: number | null;
};

export type TemplateParagraphRule = {
  font_family?: string | null;
  font_size_pt?: number | null;
  line_spacing?: number | null;
  alignment?: ParagraphAlignment | null;
  space_before_pt?: number | null;
  space_after_pt?: number | null;
  first_line_indent_cm?: number | null;
};

export type TemplateEquationRule = {
  numbering?: boolean | null;
  alignment?: EquationAlignment | null;
  reference_style?: EquationReferenceStyle | null;
  numbering_format?: NumberingFormat | null;
  label_prefix?: string | null;
};

export type TemplateCaptionRule = {
  prefix_style?: CaptionPrefixStyle | null;
  separator?: string | null;
  font_style?: CaptionFontStyle | null;
};

export type TemplateTableRule = {
  caption_position?: CaptionPosition | null;
  allow_vertical_lines?: boolean | null;
  numbering?: boolean | null;
  source_note_required?: boolean | null;
  note_position?: NotePosition | null;
  numbering_format?: NumberingFormat | null;
  label?: string | null;
};

export type TemplateFigureRule = {
  caption_position?: CaptionPosition | null;
  numbering?: boolean | null;
  source_note_required?: boolean | null;
  note_position?: NotePosition | null;
  numbering_format?: NumberingFormat | null;
  label?: string | null;
};

export type TemplateCitationRule = {
  numbering?: boolean | null;
  inline_style?: CitationInlineStyle | null;
};

export type TemplateReferenceListRule = {
  numbering?: boolean | null;
  ordering?: ReferenceOrdering | null;
  heading_title?: string | null;
  require_cited_only?: boolean | null;
  doi_policy?: DoiPolicy | null;
};

export type NormalizedAssetCandidate = {
  asset_key: string;
  kind: "logo" | "seal" | "cover_image" | "unknown";
  source_strategy: "provided_file" | "extracted_from_document" | "placeholder";
  source_path?: string | null;
  page_number?: number | null;
  mime_type?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  has_transparency?: boolean | null;
  confidence?: number;
};

export type ExtractedTemplateAssetInput = {
  asset_key: string;
  kind: "logo" | "seal" | "cover_image" | "unknown";
  source_path?: string | null;
  mime_type?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  has_transparency?: boolean | null;
};

export type ExtractedPdfNativeTextPage = {
  page_number: number;
  raw_text: string;
};

export type ExtractedPdfNativeTextSourceInput = {
  source_id: string;
  document_path?: string | null;
  language?: string | null;
  document_kind_hint?: TemplateDocumentKind;
  pages: ExtractedPdfNativeTextPage[];
  provided_assets?: ExtractedTemplateAssetInput[];
};

export type ExtractedDocxParagraph = {
  paragraph_index: number;
  text: string;
  style_id?: string | null;
  style_name?: string | null;
  num_id?: string | null;
  ilvl?: string | null;
};

export type ExtractedDocxSourceInput = {
  source_id: string;
  document_path?: string | null;
  language?: string | null;
  document_kind_hint?: TemplateDocumentKind;
  paragraphs: ExtractedDocxParagraph[];
  provided_assets?: ExtractedTemplateAssetInput[];
};

export type NormalizedPageSpan = {
  start_page: number;
  end_page: number;
};

export type NormalizedListItem = {
  text: string;
  ordinal?: number | null;
};

export type NormalizedTableCell = {
  text: string;
  col_span?: number | null;
  row_span?: number | null;
};

export type NormalizedTableRow = {
  cells: NormalizedTableCell[];
};

export type NormalizedReferenceEntry = {
  raw_text: string;
  authors?: string[];
  year?: number | null;
  title?: string | null;
  doi?: string | null;
};

export type NormalizedBlock = {
  id: string;
  type:
    | "cover"
    | "field"
    | "section"
    | "subsection"
    | "paragraph"
    | "bullet_list"
    | "numbered_list"
    | "table"
    | "references"
    | "unknown";
  label?: string | null;
  ordinal?: string | null;
  level?: number | null;
  semantic_key?: string | null;
  raw_text: string;
  normalized_text?: string | null;
  items?: NormalizedListItem[];
  table?: {
    caption?: string | null;
    rows: NormalizedTableRow[];
  };
  references?: NormalizedReferenceEntry[];
  page_span: NormalizedPageSpan;
  confidence?: number;
};

export type NormalizedTemplateSourceDocument = {
  source_id: string;
  source_type: TemplateSourceType;
  document_kind: TemplateDocumentKind;
  language: string;
  institution: {
    university_name: string;
    school_name?: string | null;
    program_name?: string | null;
    mention?: string | null;
    degree_level?: string | null;
    discipline_area?: string | null;
    confidence?: number;
  };
  assets: NormalizedAssetCandidate[];
  cover: {
    raw_text: string;
    university_name?: string | null;
    school_name?: string | null;
    program_name?: string | null;
    document_label?: string | null;
    author_lines?: string[];
    advisor_lines?: string[];
    place_label?: string | null;
    date_label?: string | null;
    logo_asset_key?: string | null;
    page_span?: NormalizedPageSpan;
  };
  blocks: NormalizedBlock[];
  warnings: string[];
};

export type TemplateSourceSemanticAnalysisSection = {
  block_id: string;
  title: string;
  semantic_key: string | null;
  required: boolean;
  content_kind: "rich_text" | "bullet_list" | "numbered_list" | "table" | "references" | "mixed";
  instruction_candidates: string[];
  word_limit: {
    min_words?: number | null;
    recommended_words?: number | null;
    max_words?: number | null;
  };
  confidence: number;
  notes?: string[];
};

export type TemplateSourceSemanticAnalysis = {
  derived_from_source_id: string;
  document_role: TemplateDocumentKind;
  template_family_guess: string;
  institution: {
    university_name?: string | null;
    school_name?: string | null;
    program_name?: string | null;
    mention?: string | null;
    degree_level?: string | null;
    discipline_area?: string | null;
    confidence: number;
  };
  methodology_mode: TemplateMethodologyMode;
  citation_style_guess: CitationStyle;
  sections: TemplateSourceSemanticAnalysisSection[];
  element_rule_candidates: {
    page: TemplatePageRule & {
      confidence: number;
      notes?: string[];
    };
    titles: Array<{
      level: number;
      numbered?: boolean | null;
      uppercase?: boolean | null;
      numbering_format?: NumberingFormat | null;
      spacing_before_pt?: number | null;
      spacing_after_pt?: number | null;
      confidence: number;
      notes?: string[];
    }>;
    paragraph: TemplateParagraphRule & {
      confidence: number;
      notes?: string[];
    };
    equation: TemplateEquationRule & {
      confidence: number;
      notes?: string[];
    };
    table: TemplateTableRule & {
      confidence: number;
      notes?: string[];
    };
    figure: TemplateFigureRule & {
      confidence: number;
      notes?: string[];
    };
    caption: TemplateCaptionRule & {
      confidence: number;
      notes?: string[];
    };
    citation: TemplateCitationRule & {
      confidence: number;
      notes?: string[];
    };
    reference_list: TemplateReferenceListRule & {
      confidence: number;
      notes?: string[];
    };
  };
  warnings: string[];
  review_notes: string[];
};

export type TemplateSourceConventionalFallbacks = {
  derived_from_source_id: string;
  citation_style_guess: CitationStyle;
  methodology_mode: TemplateMethodologyMode;
  element_rule_candidates: {
    page: TemplatePageRule & {
      confidence: number;
      notes?: string[];
    };
    paragraph: TemplateParagraphRule & {
      confidence: number;
      notes?: string[];
    };
    equation: TemplateEquationRule & {
      confidence: number;
      notes?: string[];
    };
    table: TemplateTableRule & {
      confidence: number;
      notes?: string[];
    };
    figure: TemplateFigureRule & {
      confidence: number;
      notes?: string[];
    };
    caption: TemplateCaptionRule & {
      confidence: number;
      notes?: string[];
    };
    citation: TemplateCitationRule & {
      confidence: number;
      notes?: string[];
    };
    reference_list: TemplateReferenceListRule & {
      confidence: number;
      notes?: string[];
    };
  };
  warnings: string[];
  review_notes: string[];
};

export type TemplateCandidateSection = {
  id: string;
  title: string;
  level: number;
  required: boolean;
  repeatable?: boolean;
  semantic_key?: string | null;
  content_kind: "rich_text" | "bullet_list" | "numbered_list" | "table" | "references" | "mixed";
  guidance?: {
    purpose?: string | null;
    instructions?: string[];
    min_words?: number | null;
    recommended_words?: number | null;
    max_words?: number | null;
    source_kind: "explicit_source_rule" | "inferred_from_instance" | "system_default";
  };
  children?: TemplateCandidateSection[];
};

export type TemplateCandidate = {
  derived_from_source_id: string;
  template_key_guess?: string | null;
  template_family: string;
  language: string;
  institution: {
    university_name: string;
    school_name?: string | null;
    program_name?: string | null;
    mention?: string | null;
    degree_level?: string | null;
    discipline_area?: string | null;
  };
  methodology_mode: TemplateMethodologyMode;
  citation_style: CitationStyle;
  review_status: TemplateReviewStatus;
  logo_policy: {
    strategy: "provided_asset_first" | "extract_from_document_fallback" | "document_only" | "none";
    primary_asset_key?: string | null;
    placement?: "cover_top" | "cover_header" | "none" | null;
    alignment?: "left" | "center" | "right" | null;
  };
  cover_template: {
    document_label?: string | null;
    fields: Array<{
      key: string;
      label: string;
      value_type: "text" | "person_name" | "date" | "location" | "asset";
      required: boolean;
    }>;
  };
  sections: TemplateCandidateSection[];
  element_rules: {
    page: TemplatePageRule;
    titles: TemplateTitleRule[];
    paragraph: TemplateParagraphRule;
    equation: TemplateEquationRule;
    table: TemplateTableRule;
    figure: TemplateFigureRule;
    caption: TemplateCaptionRule;
    citation: TemplateCitationRule;
    reference_list: TemplateReferenceListRule;
  };
  validations: {
    required_section_keys: string[];
    requires_logo?: boolean;
    requires_references?: boolean;
    human_review_required: boolean;
  };
  warnings: string[];
};

export type EffectiveTemplateElementRules = {
  page: {
    paper_size: string;
    margin_left_cm: number;
    margin_right_cm: number;
    margin_top_cm: number;
    margin_bottom_cm: number;
    page_numbering: boolean;
    page_number_position: PageNumberPosition;
  };
  titles: Array<{
    level: number;
    numbered: boolean;
    uppercase: boolean;
    numbering_format: NumberingFormat;
    spacing_before_pt: number;
    spacing_after_pt: number;
  }>;
  paragraph: {
    font_family: string;
    font_size_pt: number;
    line_spacing: number;
    alignment: ParagraphAlignment;
    space_before_pt: number;
    space_after_pt: number;
    first_line_indent_cm: number;
  };
  equation: {
    numbering: boolean;
    alignment: EquationAlignment;
    reference_style: EquationReferenceStyle;
    numbering_format: NumberingFormat;
    label_prefix: string;
  };
  table: {
    caption_position: CaptionPosition;
    allow_vertical_lines: boolean;
    numbering: boolean;
    source_note_required: boolean;
    note_position: NotePosition;
    numbering_format: NumberingFormat;
    label: string;
  };
  figure: {
    caption_position: CaptionPosition;
    numbering: boolean;
    source_note_required: boolean;
    note_position: NotePosition;
    numbering_format: NumberingFormat;
    label: string;
  };
  caption: {
    prefix_style: CaptionPrefixStyle;
    separator: string;
    font_style: CaptionFontStyle;
  };
  citation: {
    numbering: boolean;
    inline_style: CitationInlineStyle;
  };
  reference_list: {
    numbering: boolean;
    ordering: ReferenceOrdering;
    heading_title: string;
    require_cited_only: boolean;
    doi_policy: DoiPolicy;
  };
};

export type TemplateExtractionPipelineResult = {
  normalizedDocument: NormalizedTemplateSourceDocument;
  semanticAnalysis: TemplateSourceSemanticAnalysis | null;
  templateCandidate: TemplateCandidate;
};
