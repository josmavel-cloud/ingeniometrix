import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import type {
  CanonicalAnnex,
  CanonicalContentBlock,
  CanonicalReferenceEntry,
  CanonicalReportDocument,
  CanonicalSectionNode,
} from "@/server/reporting/canonical-report-types";
import type {
  SyntheticAnnex,
  SyntheticContentBlock,
  SyntheticReferenceEntry,
  SyntheticSectionNode,
  SyntheticTemplateDocument,
} from "@/server/reporting/synthetic-document-types";

function mapReference(reference: SyntheticReferenceEntry) {
  return {
    id: reference.id,
    text: reference.text,
    synthetic: reference.synthetic,
  } satisfies CanonicalReferenceEntry;
}

function mapBlock(block: SyntheticContentBlock): CanonicalContentBlock {
  return {
    id: block.id,
    kind: block.kind,
    text: block.text ?? null,
    items: block.items,
    table: block.table
      ? {
          caption: { ...block.table.caption },
          rows: block.table.rows.map((row) => ({
            cells: row.cells.map((cell) => ({
              text: cell.text,
              col_span: cell.col_span ?? null,
              row_span: cell.row_span ?? null,
            })),
          })),
          numbered: block.table.numbered,
        }
      : undefined,
    figure: block.figure
      ? {
          caption: { ...block.figure.caption },
          placeholder_text: block.figure.placeholder_text,
          numbered: block.figure.numbered,
          image_asset_key: block.figure.image_asset_key ?? null,
          image_width_px: block.figure.image_width_px ?? null,
          image_height_px: block.figure.image_height_px ?? null,
        }
      : undefined,
    equation: block.equation
      ? {
          latex: block.equation.latex,
          label: block.equation.label ?? null,
          numbered: block.equation.numbered,
          alignment: block.equation.alignment,
          omml_key: block.equation.omml_key ?? null,
        }
      : undefined,
    references: block.references?.map(mapReference),
  };
}

function mapSection(section: SyntheticSectionNode): CanonicalSectionNode {
  return {
    id: section.id,
    title: section.title,
    level: section.level,
    semantic_key: section.semantic_key ?? null,
    blocks: section.blocks.map(mapBlock),
    children: section.children.map(mapSection),
  };
}

function mapAnnex(annex: SyntheticAnnex): CanonicalAnnex {
  return {
    id: annex.id,
    title: annex.title,
    blocks: annex.blocks.map(mapBlock),
  };
}

export function buildCanonicalReportFromSynthetic(input: {
  runtime: LoadedTemplateVersionRuntime;
  document: SyntheticTemplateDocument;
}) {
  const { runtime, document } = input;
  const presentation = {
    ...runtime.effectiveElementRules,
    caption: runtime.effectiveElementRules.caption ?? {
      prefix_style: "label_period_title",
      separator: ". ",
      font_style: "inherit",
    },
  };

  return {
    document_id: `canonical-${runtime.versionId}`,
    document_kind: "thesis_plan",
    derivation: {
      template_version_id: runtime.versionId,
      template_key: runtime.templateKey,
      template_family: runtime.templateCandidate.template_family,
      source_kind: "synthetic",
      synthetic: true,
      for_testing_only: document.synthetic_flags.for_testing_only,
      not_for_academic_use: document.synthetic_flags.not_for_academic_use,
    },
    language: document.language,
    institution: document.institution,
    presentation,
    cover: {
      document_label: document.cover.document_label ?? null,
      fields: document.cover.fields.map((field) => ({
        key: field.key,
        label: field.label,
        value_type: field.value_type,
        value: field.value,
      })),
    },
    body: {
      sections: document.sections.map(mapSection),
    },
    references: document.references.map(mapReference),
    annexes: document.annexes.map(mapAnnex),
    assets: runtime.assets.map((asset) => ({
      asset_key: asset.assetKey,
      kind: asset.kind,
      role:
        asset.assetKey === runtime.templateCandidate.logo_policy.primary_asset_key
          ? "cover_logo"
          : "generic",
      stored_path: asset.storedFilePath ?? null,
      content_base64: asset.fileBase64 ?? null,
      file_name: asset.fileName ?? null,
      mime_type: asset.mimeType ?? null,
      width_px: asset.widthPx ?? null,
      height_px: asset.heightPx ?? null,
    })),
    warnings: Array.from(new Set([...document.warnings, ...runtime.runtimeWarnings])),
  } satisfies CanonicalReportDocument;
}
