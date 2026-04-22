import canonicalReportDocumentSchemaJson from "@/ai/schemas/canonical-report-document.schema.json";

export const CANONICAL_REPORT_DOCUMENT_SCHEMA_NAME = "canonical_report_document";

export const canonicalReportDocumentSchema =
  canonicalReportDocumentSchemaJson as Record<string, unknown>;

export type CanonicalReportDocument = {
  document_id: string;
  document_kind: "thesis_plan";
  derivation: {
    template_version_id: string;
    template_key: string;
    template_family: string;
    source_kind: "synthetic" | "blueprint";
    synthetic: boolean;
    for_testing_only?: boolean;
    not_for_academic_use?: boolean;
  };
  language: string;
  institution: CanonicalInstitution;
  presentation: CanonicalPresentationRules;
  cover: CanonicalCover;
  body: {
    sections: CanonicalSectionNode[];
  };
  references: CanonicalReferenceEntry[];
  annexes: CanonicalAnnex[];
  assets: CanonicalAssetRef[];
  warnings: string[];
};

export type CanonicalPresentationRules = {
  page: {
    paper_size?: string | null;
    margin_left_cm?: number | null;
    margin_right_cm?: number | null;
    margin_top_cm?: number | null;
    margin_bottom_cm?: number | null;
    page_numbering?: boolean | null;
    page_number_position?: "top_right" | "bottom_center" | "bottom_right" | null;
  };
  titles: Array<{
    level: number;
    numbered?: boolean | null;
    uppercase?: boolean | null;
    numbering_format?: "plain" | "level_decimal" | null;
    spacing_before_pt?: number | null;
    spacing_after_pt?: number | null;
  }>;
  paragraph: {
    font_family?: string | null;
    font_size_pt?: number | null;
    line_spacing?: number | null;
    alignment?: "left" | "justify" | "center" | null;
    space_before_pt?: number | null;
    space_after_pt?: number | null;
    first_line_indent_cm?: number | null;
  };
  equation: {
    numbering?: boolean | null;
    alignment?: "center" | "left" | "split" | null;
    reference_style?: "parenthetical" | "inline" | null;
    numbering_format?: "plain" | "level_decimal" | null;
    label_prefix?: string | null;
  };
  table: {
    caption_position?: "top" | "bottom" | null;
    allow_vertical_lines?: boolean | null;
    numbering?: boolean | null;
    source_note_required?: boolean | null;
    note_position?: "top" | "bottom" | "below_caption" | null;
    numbering_format?: "plain" | "level_decimal" | null;
    label?: string | null;
  };
  figure: {
    caption_position?: "top" | "bottom" | null;
    numbering?: boolean | null;
    source_note_required?: boolean | null;
    note_position?: "top" | "bottom" | "below_caption" | null;
    numbering_format?: "plain" | "level_decimal" | null;
    label?: string | null;
  };
  caption: {
    prefix_style?: "label_title" | "label_period_title" | "label_colon_title" | null;
    separator?: string | null;
    font_style?: "inherit" | "italic" | "bold" | null;
  };
  citation: {
    numbering?: boolean | null;
    inline_style?: "author_year" | "numeric" | "footnote" | null;
  };
  reference_list: {
    numbering?: boolean | null;
    ordering?: "alphabetical" | "citation_order" | "manual" | null;
    heading_title?: string | null;
    require_cited_only?: boolean | null;
    doi_policy?: "preferred" | "required" | "ignore" | null;
  };
};

export type CanonicalInstitution = {
  university_name: string;
  school_name?: string | null;
  program_name?: string | null;
  mention?: string | null;
  degree_level?: string | null;
  discipline_area?: string | null;
};

export type CanonicalCoverFieldValue = {
  key: string;
  label: string;
  value_type: "text" | "person_name" | "date" | "location" | "asset";
  value: string | null;
};

export type CanonicalCover = {
  document_label?: string | null;
  fields: CanonicalCoverFieldValue[];
};

export type CanonicalCaption = {
  label?: string | null;
  title: string;
  note?: string | null;
  source_label?: string | null;
  position: "top" | "bottom";
};

export type CanonicalTableCell = {
  text: string;
  col_span?: number | null;
  row_span?: number | null;
};

export type CanonicalTableRow = {
  cells: CanonicalTableCell[];
};

export type CanonicalTableBlock = {
  caption: CanonicalCaption;
  rows: CanonicalTableRow[];
  numbered: boolean;
};

export type CanonicalFigureBlock = {
  caption: CanonicalCaption;
  placeholder_text: string;
  numbered: boolean;
  image_asset_key?: string | null;
  image_width_px?: number | null;
  image_height_px?: number | null;
};

export type CanonicalEquationBlock = {
  latex: string;
  label?: string | null;
  numbered: boolean;
  alignment: "center" | "left" | "split";
  omml_key?: string | null;
};

export type CanonicalReferenceEntry = {
  id: string;
  text: string;
  synthetic?: boolean;
};

export type CanonicalContentBlock = {
  id: string;
  kind:
    | "paragraph"
    | "bullet_list"
    | "numbered_list"
    | "table"
    | "figure"
    | "equation"
    | "reference_list"
    | "placeholder_note";
  text?: string | null;
  items?: string[];
  table?: CanonicalTableBlock;
  figure?: CanonicalFigureBlock;
  equation?: CanonicalEquationBlock;
  references?: CanonicalReferenceEntry[];
};

export type CanonicalSectionNode = {
  id: string;
  title: string;
  level: number;
  semantic_key?: string | null;
  blocks: CanonicalContentBlock[];
  children: CanonicalSectionNode[];
};

export type CanonicalAnnex = {
  id: string;
  title: string;
  blocks: CanonicalContentBlock[];
};

export type CanonicalAssetRef = {
  asset_key: string;
  kind: string;
  role: "cover_logo" | "cover_image" | "annex_asset" | "generic";
  stored_path?: string | null;
  mime_type?: string | null;
  width_px?: number | null;
  height_px?: number | null;
};
