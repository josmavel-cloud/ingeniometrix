import syntheticTemplateDocumentSchemaJson from "@/ai/schemas/synthetic-template-document.schema.json";

export const SYNTHETIC_TEMPLATE_DOCUMENT_SCHEMA_NAME = "synthetic_template_document";

export const syntheticTemplateDocumentSchema =
  syntheticTemplateDocumentSchemaJson as Record<string, unknown>;

export type SyntheticTemplateDocument = {
  derived_from_template_version_id: string;
  template_key: string;
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
  synthetic_flags: {
    synthetic: true;
    for_testing_only: true;
    not_for_academic_use: true;
  };
  cover: {
    document_label?: string | null;
    fields: SyntheticCoverFieldValue[];
  };
  sections: SyntheticSectionNode[];
  references: SyntheticReferenceEntry[];
  annexes: SyntheticAnnex[];
  warnings: string[];
};

export type SyntheticCoverFieldValue = {
  key: string;
  label: string;
  value_type: "text" | "person_name" | "date" | "location" | "asset";
  value: string | null;
};

export type SyntheticCaption = {
  label?: string | null;
  title: string;
  note?: string | null;
  source_label?: string | null;
  position: "top" | "bottom";
};

export type SyntheticTableCell = {
  text: string;
  col_span?: number | null;
  row_span?: number | null;
};

export type SyntheticTableRow = {
  cells: SyntheticTableCell[];
};

export type SyntheticTableBlock = {
  caption: SyntheticCaption;
  rows: SyntheticTableRow[];
  numbered: boolean;
};

export type SyntheticFigureBlock = {
  caption: SyntheticCaption;
  placeholder_text: string;
  numbered: boolean;
  image_asset_key?: string | null;
  image_width_px?: number | null;
  image_height_px?: number | null;
};

export type SyntheticEquationBlock = {
  latex: string;
  label?: string | null;
  numbered: boolean;
  alignment: "center" | "left" | "split";
  omml_key?: string | null;
};

export type SyntheticReferenceEntry = {
  id: string;
  text: string;
  synthetic: true;
};

export type SyntheticContentBlock = {
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
  table?: SyntheticTableBlock;
  figure?: SyntheticFigureBlock;
  equation?: SyntheticEquationBlock;
  references?: SyntheticReferenceEntry[];
};

export type SyntheticSectionNode = {
  id: string;
  title: string;
  level: number;
  semantic_key?: string | null;
  blocks: SyntheticContentBlock[];
  children: SyntheticSectionNode[];
};

export type SyntheticAnnex = {
  id: string;
  title: string;
  blocks: SyntheticContentBlock[];
};
