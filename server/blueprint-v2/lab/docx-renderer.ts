import fs from "node:fs";
import path from "node:path";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Math as DocxMath,
  MathFraction,
  MathRun,
  MathSubScript,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type FileChild,
  type IRunOptions,
} from "docx";

import {
  buildMasterAcademicDocument,
  buildUniversityAcademicDocument,
  cleanAcademicText,
} from "@/server/blueprint-v2/lab/academic-document-compiler";
import {
  capitalizePublicTableRows,
  sentenceStyleCapitalizePublicText,
} from "@/server/blueprint-v2/editorial/capitalization-hygiene";
import { sanitizePublicAppendixText } from "@/server/blueprint-engine/quality/production-safety";
import type {
  AcademicBrandingAsset,
  AcademicDocument,
  EquationLayoutPlan,
  FigureLayoutPlan,
  AcademicReference,
  AcademicSection,
  AssetPlacement,
  ScheduleVisualPlan,
} from "@/server/blueprint-v2/lab/academic-document-model";
import type {
  BudgetRange,
  PublicAppendixItem,
  ResearchBudgetRow,
} from "@/server/blueprint-v2/editorial/project-management-policy";
import {
  patchDocxPackage,
  type DocxOoxmlPatchReport,
} from "@/server/blueprint-v2/lab/docx-ooxml-patcher";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  MasterTemplateRuntime,
  UniversityBlueprintPackage,
  UniversityBlueprintSection,
} from "@/server/blueprint-v2/types";

type DocxVariant = "master" | "university";

export type LabDocxRenderManifest = {
  artifact_type: "lab_docx_render_manifest";
  artifact_version: "v1";
  generated_at: string;
  step_key: "master_docx_render" | "university_docx_render";
  variant: DocxVariant;
  template_key: string;
  template_name: string;
  report_archetype: "indexed_paper_like" | "institutional_thesis_project";
  output_docx_path: string;
  output_docx_file_name: string;
  relative_docx_path: string;
  file_size_bytes: number;
  section_count: number;
  matrix_rows: number;
  references_count: number;
  citation_style: "APA7";
  citations_inserted_count: number;
  academic_model_version: "v1";
  style_contract_keys: string[];
  asset_placement_count: number;
  renderable_asset_count: number;
  available_logo_count: number;
  rendered_image_asset_count: number;
  main_body_section_count: number;
  suppressed_section_count: number;
  duplicate_pair_count: number;
  llm_editorial_pass_count: number;
  llm_editorial_total_tokens: number;
  llm_editorial_cost_cad: number;
  llm_layout_pass_count: number;
  llm_layout_total_tokens: number;
  llm_layout_cost_cad: number;
  public_sanitization_pass_count: number;
  public_source_title_replacements: number;
  public_remaining_title_leak_count: number;
  hero_image_status: "not_requested" | "generated" | "skipped" | "failed";
  hero_image_model: string | null;
  hero_image_path: string | null;
  figure_plan_count: number;
  equation_plan_count: number;
  suppressed_text_asset_count: number;
  matrix_layout: {
    orientation: "portrait" | "landscape";
    font_size_pt: number;
    repeat_header: boolean;
  };
  ooxml_patch_report: DocxOoxmlPatchReport;
  academic_model_path?: string;
  qa_report_path?: string;
  qa_passed?: boolean;
  qa_score_100?: number;
  quality_checks: {
    docx_written: boolean;
    has_cover: boolean;
    has_matrix_table: boolean;
    has_references: boolean;
    has_traceability_annex: boolean;
    has_brand_logo: boolean;
    has_renderable_assets: boolean;
    control_content_moved_to_annex: boolean;
    has_editorial_plan: boolean;
    markdown_removed: boolean;
    landscape_matrix_section: boolean;
    has_academic_header_footer: boolean;
    has_asset_references: boolean;
    has_clean_public_annex: boolean;
    has_schedule_gantt: boolean;
    has_cover_visual: boolean;
    has_table_of_contents: boolean;
    has_numbered_headings: boolean;
    has_professional_equations: boolean;
    no_source_title_leaks: boolean;
    no_internal_runtime_markers: boolean;
  };
  warnings: string[];
};

type RenderSection = {
  section_key: string;
  title: string;
  content: string;
  level: number;
  supported_source_ids?: string[];
};

type TocEntry = {
  number: string;
  title: string;
  level: number;
};

type SourceLike = EvidenceLedger["source_registry"][number];

const BODY_FONT = "Times New Roman";
const HEADING_COLOR = "1F2937";
const ACCENT_COLOR = "6B4A2F";
const LIGHT_FILL = "F6F1EA";
const TABLE_HEADER_FILL = "F3EFE8";
const BORDER_COLOR = "4B5563";
const PAGE_WIDTH_PORTRAIT = 11906;
const PAGE_HEIGHT_PORTRAIT = 16838;
const HEADER_FOOTER_COLOR = "5E6470";
const TRANSPARENT_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lYQG7wAAAABJRU5ErkJggg==",
  "base64",
);

function cmToTwip(value: number) {
  return Math.round(value * 566.93);
}

function ptToHalfPt(value: number) {
  return Math.round(value * 2);
}

function ptToTwip(value: number) {
  return Math.round(value * 20);
}

function cleanDocText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripListPrefix(value: string) {
  return value
    .replace(/^\s*[-*]\s*/, "")
    .replace(/^\s*\d+[\).\-\s]+/, "")
    .trim();
}

function splitParagraphs(value: string) {
  return cleanDocText(value)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactHeaderText(value: string, maxLength = 88) {
  const text = cleanDocText(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function parseListItems(value: string) {
  return cleanDocText(value)
    .split(/\n+/)
    .map(stripListPrefix)
    .filter(Boolean);
}

function parseMarkdownTable(value: string) {
  const rows = cleanDocText(value)
    .split(/\n+/)
    .filter((line) => /^\s*\|/.test(line))
    .filter((line) => !/\|?\s*:?-{3,}:?\s*(\||$)/.test(line))
    .map((line) =>
      line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => cleanDocText(cell)),
    );

  return rows.length >= 2 ? rows : [];
}

function textRun(text: string, options: Partial<IRunOptions> = {}) {
  return new TextRun({
    text,
    font: BODY_FONT,
    size: ptToHalfPt(11),
    ...options,
  });
}

function paragraph(text: string, options: {
  bold?: boolean;
  italics?: boolean;
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  beforePt?: number;
  afterPt?: number;
  indentFirstLine?: boolean;
  sizePt?: number;
  color?: string;
} = {}) {
  return new Paragraph({
    alignment: options.alignment ?? AlignmentType.JUSTIFIED,
    spacing: {
      before: ptToTwip(options.beforePt ?? 0),
      after: ptToTwip(options.afterPt ?? 6),
      line: 360,
    },
    indent: {
      firstLine: options.indentFirstLine === false ? 0 : cmToTwip(0.75),
    },
    children: [
      textRun(text, {
        bold: options.bold,
        italics: options.italics,
        color: options.color,
        size: ptToHalfPt(options.sizePt ?? 11),
      }),
    ],
  });
}

function heading(text: string, level: number) {
  const headingText = sentenceStyleCapitalizePublicText(text, "heading");
  const headingLevel =
    level <= 1
      ? HeadingLevel.HEADING_1
      : level === 2
        ? HeadingLevel.HEADING_2
        : level === 3
          ? HeadingLevel.HEADING_3
          : level === 4
            ? HeadingLevel.HEADING_4
            : HeadingLevel.HEADING_5;
  const sizeByLevel: Record<number, number> = {
    1: 14,
    2: 12.5,
    3: 11.5,
    4: 11,
    5: 10.5,
  };

  return new Paragraph({
    heading: headingLevel,
    spacing: {
      before: ptToTwip(level <= 1 ? 16 : level === 2 ? 12 : 8),
      after: ptToTwip(level <= 2 ? 5 : 3),
    },
    indent: {
      firstLine: 0,
    },
    children: [
      textRun(headingText, {
        bold: true,
        color: HEADING_COLOR,
        size: ptToHalfPt(sizeByLevel[Math.min(5, Math.max(1, level))] ?? 11),
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    spacing: { after: ptToTwip(4), line: 320 },
    indent: {
      firstLine: 0,
      left: 0,
    },
    children: [
      textRun("- ", { bold: true }),
      textRun(text),
    ],
  });
}

function smallNote(text: string) {
  return paragraph(text, {
    italics: true,
    alignment: AlignmentType.LEFT,
    indentFirstLine: false,
    sizePt: 9,
    color: "5E6470",
  });
}

function headerFooterRun(text: string, options: Partial<IRunOptions> = {}) {
  return textRun(text, {
    size: ptToHalfPt(8.5),
    color: HEADER_FOOTER_COLOR,
    ...options,
  });
}

function buildAcademicHeader(input: {
  academicDocument: AcademicDocument;
  sectionLabel: string;
}) {
  const leftLabel = compactHeaderText(
    input.academicDocument.metadata.short_header_title ||
      input.academicDocument.metadata.title,
    54,
  );
  const rightLabel = compactHeaderText(input.sectionLabel, 46);

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: ptToTwip(4), line: 240 },
        indent: { firstLine: 0 },
        children: [
          headerFooterRun(`${leftLabel} | ${rightLabel}`, {
            italics: true,
          }),
        ],
      }),
    ],
  });
}

function buildBlankHeader() {
  return new Header({
    children: [new Paragraph({ children: [] })],
  });
}

function buildAcademicFooter(input: {
  academicDocument: AcademicDocument;
}) {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: ptToTwip(4), after: 0, line: 240 },
        indent: { firstLine: 0 },
        children: [
          headerFooterRun("Pagina "),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: BODY_FONT,
            size: ptToHalfPt(8.5),
            color: HEADER_FOOTER_COLOR,
          }),
        ],
      }),
    ],
  });
}

function buildBlankFooter() {
  return new Footer({
    children: [new Paragraph({ children: [] })],
  });
}

function cell(text: string, options: {
  header?: boolean;
  widthPct?: number;
  align?: "left" | "center";
  shading?: string;
  fontSizePt?: number;
  minimalBorders?: boolean;
} = {}) {
  const nilBorder = { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
  const horizontalBorder = {
    style: BorderStyle.SINGLE,
    size: options.header ? 8 : 3,
    color: options.header ? BORDER_COLOR : "C9D1D9",
  };

  return new TableCell({
    width: options.widthPct
      ? {
          size: options.widthPct,
          type: WidthType.PERCENTAGE,
        }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.header
      ? { fill: options.shading ?? TABLE_HEADER_FILL }
      : options.shading
        ? { fill: options.shading }
        : undefined,
    margins: {
      top: options.header ? 130 : 120,
      bottom: options.header ? 130 : 120,
      left: 150,
      right: 150,
    },
    borders: {
      top: options.minimalBorders ? horizontalBorder : { style: BorderStyle.SINGLE, size: options.header ? 8 : 4, color: BORDER_COLOR },
      bottom: options.minimalBorders ? horizontalBorder : { style: BorderStyle.SINGLE, size: options.header ? 8 : 4, color: BORDER_COLOR },
      left: options.minimalBorders ? nilBorder : { style: BorderStyle.SINGLE, size: 3, color: "D7CEC4" },
      right: options.minimalBorders ? nilBorder : { style: BorderStyle.SINGLE, size: 3, color: "D7CEC4" },
    },
    children: [
      new Paragraph({
        alignment: options.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 300 },
        indent: { firstLine: 0 },
        children: [
          textRun(text, {
            bold: options.header,
            size: ptToHalfPt(options.fontSizePt ?? (options.header ? 8.5 : 8)),
          }),
        ],
      }),
    ],
  });
}

function simpleTable(rows: string[][], widths?: number[], options: {
  paperLike?: boolean;
  fontSizePt?: number;
} = {}) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: row.map((value, index) =>
            cell(value, {
              header: rowIndex === 0,
              widthPct: widths?.[index],
              align: rowIndex === 0 || (widths?.[index] ?? 100) <= 10 ? "center" : "left",
              fontSizePt: options.fontSizePt ?? 8.5,
              minimalBorders: options.paperLike ?? true,
            }),
          ),
        }),
    ),
  });
}

function imageTypeFromMimeOrPath(input: {
  mimeType?: string | null;
  filePath?: string | null;
}) {
  const mime = input.mimeType?.toLowerCase() ?? "";
  const ext = path.extname(input.filePath ?? "").toLowerCase();

  if (mime.includes("png") || ext === ".png") {
    return "png" as const;
  }

  if (mime.includes("gif") || ext === ".gif") {
    return "gif" as const;
  }

  if (mime.includes("bmp") || ext === ".bmp") {
    return "bmp" as const;
  }

  return "jpg" as const;
}

function resolveBinaryAsset(input: {
  filePath?: string | null;
  contentBase64?: string | null;
}) {
  if (input.contentBase64) {
    return Buffer.from(input.contentBase64, "base64");
  }

  if (input.filePath && fs.existsSync(input.filePath)) {
    return fs.readFileSync(input.filePath);
  }

  return null;
}

function readPngDimensions(buffer: Buffer) {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function resolveImageDimensions(input: {
  buffer: Buffer;
  widthPx?: number | null;
  heightPx?: number | null;
}) {
  if (input.widthPx && input.heightPx) {
    return { width: input.widthPx, height: input.heightPx };
  }

  return readPngDimensions(input.buffer) ?? readJpegDimensions(input.buffer) ?? null;
}

function fitImage(input: {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const safeWidth = Math.max(1, input.width);
  const safeHeight = Math.max(1, input.height);
  const widthRatio = input.maxWidth / safeWidth;
  const heightRatio = input.maxHeight / safeHeight;
  const scale = Math.min(1, widthRatio, heightRatio);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function renderBrandLogo(asset: AcademicBrandingAsset | null) {
  if (!asset?.available) {
    return [];
  }

  const buffer = resolveBinaryAsset({
    filePath: asset.file_path,
    contentBase64: asset.content_base64,
  });
  if (!buffer) {
    return [];
  }

  const dimensions =
    resolveImageDimensions({
      buffer,
      widthPx: asset.width_px,
      heightPx: asset.height_px,
    }) ?? { width: 640, height: 180 };
  const fitted = fitImage({
    ...dimensions,
    maxWidth: asset.role === "master_logo" ? 190 : 150,
    maxHeight: 90,
  });

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: ptToTwip(18) },
      children: [
        new ImageRun({
          type: imageTypeFromMimeOrPath({
            mimeType: asset.mime_type,
            filePath: asset.file_path,
          }),
          data: buffer,
          transformation: fitted,
        }),
      ],
    }),
  ];
}

function escapeSvgText(value: string) {
  return cleanDocText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCoverInfographicSvg(document: AcademicDocument) {
  const visual = document.layout_plan.cover_visual;
  const title = escapeSvgText(visual.title);
  const subtitle = escapeSvgText(compactHeaderText(visual.subtitle, 84));
  const concept = escapeSvgText(compactHeaderText(visual.concept, 118));
  const promptSummary = escapeSvgText(compactHeaderText(visual.hero_prompt_summary ?? visual.method_summary, 92));
  const palette = visual.palette;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" rx="44" fill="#${palette.background}"/>
  <rect x="60" y="64" width="780" height="186" rx="28" fill="#ffffff" opacity="0.86"/>
  <text x="450" y="126" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#${palette.primary}" font-weight="700">${title}</text>
  <text x="450" y="176" text-anchor="middle" font-family="Georgia, serif" font-size="23" fill="#${palette.accent}" font-weight="700">${subtitle}</text>
  <text x="450" y="217" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#${palette.primary}" opacity="0.76">Infografia metodologica academica</text>

  <rect x="150" y="300" width="600" height="188" rx="32" fill="#ffffff" stroke="#${palette.muted}" stroke-width="4"/>
  <rect x="304" y="344" width="292" height="78" rx="12" fill="#${palette.primary}" opacity="0.96"/>
  <rect x="342" y="318" width="216" height="28" rx="8" fill="#${palette.accent}" opacity="0.92"/>
  <path d="M338 422 L318 456 L582 456 L562 422 Z" fill="#${palette.muted}" opacity="0.78"/>
  <line x1="362" y1="360" x2="538" y2="360" stroke="#ffffff" stroke-width="6" opacity="0.88"/>
  <line x1="382" y1="384" x2="518" y2="384" stroke="#ffffff" stroke-width="6" opacity="0.68"/>
  <text x="450" y="284" text-anchor="middle" font-family="Georgia, serif" font-size="23" fill="#${palette.primary}" font-weight="700">Objeto de estudio</text>
  <text x="450" y="525" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${palette.primary}" opacity="0.78">${promptSummary}</text>

  <path d="M450 548 L450 594" stroke="#${palette.muted}" stroke-width="8" stroke-linecap="round"/>
  <g font-family="Georgia, serif" font-size="18" font-weight="700">
    <rect x="54" y="612" width="128" height="96" rx="20" fill="#${palette.primary}" opacity="0.95"/>
    <text x="118" y="667" text-anchor="middle" fill="#ffffff">Problema</text>
    <rect x="212" y="612" width="128" height="96" rx="20" fill="#${palette.accent}" opacity="0.93"/>
    <text x="276" y="667" text-anchor="middle" fill="#ffffff">Evidencia</text>
    <rect x="370" y="612" width="128" height="96" rx="20" fill="#${palette.primary}" opacity="0.92"/>
    <text x="434" y="667" text-anchor="middle" fill="#ffffff">Metodo</text>
    <rect x="528" y="612" width="128" height="96" rx="20" fill="#${palette.accent}" opacity="0.9"/>
    <text x="592" y="667" text-anchor="middle" fill="#ffffff">Analisis</text>
    <rect x="686" y="612" width="160" height="96" rx="20" fill="#${palette.primary}" opacity="0.9"/>
    <text x="766" y="667" text-anchor="middle" fill="#ffffff">Salida</text>
  </g>
  <path d="M182 660 L212 660 M340 660 L370 660 M498 660 L528 660 M656 660 L686 660" stroke="#${palette.muted}" stroke-width="8" stroke-linecap="round"/>

  <rect x="104" y="790" width="692" height="196" rx="30" fill="#ffffff" opacity="0.86"/>
  <text x="450" y="838" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#${palette.primary}" font-weight="700">Contexto, herramientas y componentes</text>
  <circle cx="220" cy="910" r="35" fill="#${palette.primary}" opacity="0.94"/>
  <path d="M206 908 L220 890 L235 908 L235 934 L206 934 Z" fill="#ffffff" opacity="0.94"/>
  <circle cx="450" cy="910" r="35" fill="#${palette.accent}" opacity="0.94"/>
  <path d="M430 920 L450 892 L470 920 Z" fill="#ffffff" opacity="0.94"/>
  <circle cx="680" cy="910" r="35" fill="#${palette.primary}" opacity="0.94"/>
  <path d="M660 896 H700 M660 912 H700 M660 928 H688" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
  <text x="220" y="966" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#${palette.primary}">Aplicacion</text>
  <text x="450" y="966" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#${palette.primary}">Criterios</text>
  <text x="680" y="966" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#${palette.primary}">Entregable</text>

  <text x="450" y="1062" text-anchor="middle" font-family="Georgia, serif" font-size="21" fill="#${palette.primary}">${concept}</text>
  <text x="450" y="1128" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${palette.primary}" opacity="0.70">No contiene datos, citas ni resultados inventados</text>
</svg>`.trim();
}

export function buildDeterministicFigureCaption(input: {
  figureNumber: number;
  sectionTitle?: string | null;
  assetKind?: string | null;
  sourceLabel?: string | null;
  existingCaption?: string | null;
}) {
  const existing = cleanDocText(input.existingCaption);
  if (existing) {
    return `Figura ${input.figureNumber}. ${sentenceStyleCapitalizePublicText(existing, "caption")}`;
  }

  const sectionTitle =
    sentenceStyleCapitalizePublicText(cleanDocText(input.sectionTitle), "caption") ||
    "El plan de investigacion";
  const assetKind =
    sentenceStyleCapitalizePublicText(cleanDocText(input.assetKind), "caption") ||
    "Apoyo visual";
  const sourceLabel = cleanDocText(input.sourceLabel);
  const sourceSuffix = sourceLabel ? ` derivado de ${sourceLabel}` : "";

  return `Figura ${input.figureNumber}. ${assetKind} de ${sectionTitle}${sourceSuffix}.`;
}

function renderCoverVisual(input: {
  academicDocument: AcademicDocument;
  fallbackLogo: AcademicBrandingAsset | null;
}) {
  const heroBuffer = resolveBinaryAsset({
    filePath: input.academicDocument.layout_plan.cover_visual.image_path,
  });
  if (heroBuffer) {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: ptToTwip(8), after: ptToTwip(14) },
        children: [
          new ImageRun({
            type: imageTypeFromMimeOrPath({
              mimeType: "image/png",
              filePath: input.academicDocument.layout_plan.cover_visual.image_path,
            }),
            data: heroBuffer,
            transformation: {
              width: 500,
              height: 720,
            },
          }),
        ],
      }),
      smallNote(
        buildDeterministicFigureCaption({
          figureNumber: 1,
          sectionTitle: "portada",
          assetKind: "infografia metodologica",
          existingCaption:
            input.academicDocument.layout_plan.cover_visual.hero_visual_caption ??
            input.academicDocument.layout_plan.cover_visual.title,
        }),
      ),
      smallNote("Fuente: elaboracion propia a partir del intake, el plan de evidencia y la metodologia propuesta."),
    ];
  }

  const fallbackBuffer = resolveBinaryAsset({
    filePath: input.fallbackLogo?.file_path,
    contentBase64: input.fallbackLogo?.content_base64,
  }) ?? TRANSPARENT_PNG_BUFFER;

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: ptToTwip(14), after: ptToTwip(18) },
      children: [
        new ImageRun({
          type: "svg",
          data: Buffer.from(buildCoverInfographicSvg(input.academicDocument), "utf8"),
          fallback: {
            type: imageTypeFromMimeOrPath({
              mimeType: input.fallbackLogo?.mime_type,
              filePath: input.fallbackLogo?.file_path,
            }),
            data: fallbackBuffer,
          },
          transformation: {
            width: 500,
            height: 620,
          },
        }),
      ],
    }),
    smallNote(
      buildDeterministicFigureCaption({
        figureNumber: 1,
        sectionTitle: "portada",
        assetKind: "infografia metodologica",
        existingCaption:
          input.academicDocument.layout_plan.cover_visual.hero_visual_caption ??
          input.academicDocument.layout_plan.cover_visual.title,
      }),
    ),
    smallNote("Fuente: elaboracion propia a partir del intake, el plan de evidencia y la metodologia propuesta."),
  ];
}

function assetPlacementIdentity(asset: AssetPlacement) {
  return `${asset.section_key}|${asset.source_id}|${asset.asset_key}`;
}

function renderImageAsset(input: {
  figure: FigureLayoutPlan;
}) {
  const buffer = resolveBinaryAsset({ filePath: input.figure.file_path });
  if (!buffer) {
    return [];
  }

  const dimensions = resolveImageDimensions({ buffer }) ?? { width: 960, height: 540 };
  const fitted = fitImage({
    ...dimensions,
    maxWidth: 430,
    maxHeight: 320,
  });
  const caption = cleanDocText(input.figure.caption);

  return [
    paragraph(input.figure.body_reference, {
      indentFirstLine: false,
      beforePt: 6,
      afterPt: 4,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: ptToTwip(8), after: ptToTwip(4) },
      children: [
        new ImageRun({
          type: imageTypeFromMimeOrPath({
            mimeType: null,
            filePath: input.figure.file_path,
          }),
          data: buffer,
          transformation: fitted,
        }),
      ],
    }),
    smallNote(`Figura ${input.figure.figure_number}. ${caption}`),
    smallNote(input.figure.source_note),
  ];
}

function mathText(value: string) {
  return value
    .replace(/\\lambda/g, "\u03bb")
    .replace(/\\_/g, "_")
    .replace(/[{}]/g, "")
    .trim();
}

function mathComponentsFromExpression(value: string) {
  const normalized = value.trim();
  const lambdaSubscript = normalized.match(/^\\lambda_\{?([a-zA-Z0-9]+)\}?(.*)$/);
  if (lambdaSubscript) {
    return [
      new MathSubScript({
        children: [new MathRun("\u03bb")],
        subScript: [new MathRun(lambdaSubscript[1] ?? "")],
      }),
      new MathRun(mathText(lambdaSubscript[2] ?? "")),
    ];
  }

  return [new MathRun(mathText(normalized))];
}

function equationMath(equation: EquationLayoutPlan) {
  const latex = cleanDocText(equation.latex);
  const fraction = latex.match(/^(.+?)=\s*\\frac\{(.+)\}\{(.+)\}$/);

  if (fraction) {
    return new DocxMath({
      children: [
        new MathRun(`${mathText(fraction[1] ?? "")} = `),
        new MathFraction({
          numerator: mathComponentsFromExpression(fraction[2] ?? ""),
          denominator: mathComponentsFromExpression(fraction[3] ?? ""),
        }),
      ],
    });
  }

  return new DocxMath({
    children: [new MathRun(mathText(equation.display_text || equation.latex))],
  });
}

function renderEquationAsset(equation: EquationLayoutPlan) {
  return [
    paragraph(equation.body_reference, {
      indentFirstLine: false,
      beforePt: 8,
      afterPt: 4,
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 86, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: {
                top: 80,
                bottom: 80,
                left: 80,
                right: 80,
              },
              borders: {
                top: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 0, line: 320 },
                  indent: { firstLine: 0 },
                  children: [equationMath(equation)],
                }),
              ],
            }),
            cell(`(${equation.equation_number})`, {
              widthPct: 14,
              align: "center",
              fontSizePt: 10,
              minimalBorders: true,
            }),
          ],
        }),
      ],
    }),
  ];
}

function renderNonImageAssetBlock(asset: AssetPlacement) {
  const label =
    asset.render_mode === "equation"
      ? "Ecuacion"
      : asset.render_mode === "table"
        ? "Tabla"
        : "Asset";

  return [
    paragraph(`${label} planificada: ${cleanDocText(asset.caption)}`, {
      bold: true,
      alignment: AlignmentType.LEFT,
      indentFirstLine: false,
      beforePt: 8,
      afterPt: 3,
      color: ACCENT_COLOR,
    }),
    simpleTable(
      [
        ["Campo", "Detalle"],
        ["asset_key", asset.asset_key],
        ["seccion destino", asset.section_key],
        ["modo", asset.render_mode],
        ["fuente", asset.source_id],
        ["notas", cleanDocText(asset.text_content) || "Pendiente de reconstruccion estructurada."],
      ],
      [24, 76],
    ),
  ];
}

function authorLastName(author: string) {
  const clean = author.replace(/\s+/g, " ").trim();
  const parts = clean.split(" ");
  return parts.at(-1) ?? clean;
}

function citationLabel(source: SourceLike) {
  const year = source.year ?? "s.f.";
  if (source.authors.length === 0) {
    return `(${year})`;
  }

  if (source.authors.length === 1) {
    return `(${authorLastName(source.authors[0])}, ${year})`;
  }

  if (source.authors.length === 2) {
    return `(${authorLastName(source.authors[0])} & ${authorLastName(source.authors[1])}, ${year})`;
  }

  return `(${authorLastName(source.authors[0])} et al., ${year})`;
}

function buildSourceLookup(evidenceLedger: EvidenceLedger) {
  const lookup = new Map<string, SourceLike>();
  for (const source of evidenceLedger.source_registry) {
    lookup.set(source.source_id, source);
    if (source.reference_id) {
      lookup.set(source.reference_id, source);
    }
  }
  return lookup;
}

function sectionCitations(input: {
  section: RenderSection;
  sourceLookup: Map<string, SourceLike>;
}) {
  return Array.from(
    new Set((input.section.supported_source_ids ?? []).map((id) => input.sourceLookup.get(id))),
  )
    .filter((source): source is SourceLike => Boolean(source))
    .slice(0, 2)
    .map(citationLabel);
}

function shouldInsertCitations(sectionKey: string) {
  return ![
    "abstract",
    "keywords",
    "references",
    "consistency_matrix",
    "schedule",
    "budget",
    "annexes",
    "general_objective",
    "specific_objectives",
    "research_questions",
    "general_research_question",
    "specific_research_questions",
    "general_hypothesis",
    "specific_hypotheses",
  ].includes(sectionKey);
}

function renderContentBlock(input: {
  section: RenderSection;
  sourceLookup: Map<string, SourceLike>;
}) {
  const citations = shouldInsertCitations(input.section.section_key)
    ? sectionCitations({ section: input.section, sourceLookup: input.sourceLookup })
    : [];
  const markdownTable = parseMarkdownTable(input.section.content);

  if (markdownTable.length > 0) {
    const nonTableText = cleanDocText(input.section.content)
      .split(/\n+/)
      .filter((line) => !/^\s*\|/.test(line))
      .join("\n");

    return [
      ...splitParagraphs(nonTableText).flatMap((item) => [paragraph(item)]),
      simpleTable(markdownTable, markdownTable[0].map((_, index) => (index === 0 ? 24 : 19))),
    ];
  }

  if (/^[-*]\s/m.test(input.section.content)) {
    return parseListItems(input.section.content).map((item) => bullet(item));
  }

  return splitParagraphs(input.section.content).map((item, index) => {
    const citationSuffix = index < citations.length && !/[)]\.$/.test(item)
      ? ` ${citations[index]}`
      : "";
    return paragraph(`${item}${citationSuffix}`);
  });
}

function renderAcademicContentBlocks(section: AcademicSection) {
  if (section.section_key === "theoretical_framework") {
    return renderStructuredTheoreticalFramework(section);
  }

  const citationLookup = new Map(
    section.citation_anchors.map((anchor) => [anchor.anchor_id, anchor.rendered_citation]),
  );
  const children: FileChild[] = [];

  for (const block of section.blocks) {
    if (block.block_type === "table") {
      if (block.caption) {
        children.push(smallNote(block.caption));
      }
      children.push(simpleTable(block.rows, block.layout.column_widths_pct, {
        paperLike: true,
        fontSizePt: block.layout.font_size_pt,
      }));
      if (block.caption) {
        children.push(smallNote("Fuente: elaboracion propia a partir del contenido generado y evidencia trazable."));
      }
      continue;
    }

    if (block.block_type === "bullet") {
      children.push(bullet(block.text));
      continue;
    }

    const citationSuffix = block.citation_anchor_ids
      .map((anchorId) => citationLookup.get(anchorId))
      .filter((citation): citation is string => Boolean(citation))
      .join(" ");

    children.push(paragraph(`${block.text}${citationSuffix ? ` ${citationSuffix}` : ""}`));
  }

  return children;
}

function sentenceChunks(value: string, chunkCount: number) {
  const sentences = cleanDocText(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length === 0) {
    return [];
  }

  const perChunk = Math.max(1, Math.ceil(sentences.length / chunkCount));
  const chunks: string[] = [];
  for (let index = 0; index < sentences.length; index += perChunk) {
    chunks.push(sentences.slice(index, index + perChunk).join(" "));
  }
  return chunks;
}

function renderStructuredTheoreticalFramework(section: AcademicSection) {
  const text = section.blocks
    .map((block) => ("text" in block ? block.text : ""))
    .join(" ");
  const chunks = sentenceChunks(text, 4);
  const labels = [
    "Reutilizacion adaptativa y sostenibilidad urbana",
    "Vacancia, subutilizacion y valor del parque edificado",
    "Criterios de decision para compatibilidad de nuevo uso",
    "Brecha metodologica que orienta la propuesta",
  ];

  if (chunks.length <= 1) {
    return splitParagraphs(text).map((item) => paragraph(item));
  }

  return chunks.flatMap((chunk, index) => [
    heading(labels[index] ?? `Componente teorico ${index + 1}`, Math.min(5, section.level + 1)),
    paragraph(chunk),
  ]);
}

function formatAuthorApa(author: string) {
  const parts = author.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length <= 1) {
    return author;
  }
  const lastName = parts.pop();
  const initials = parts
    .map((part) => part.charAt(0).toUpperCase())
    .filter(Boolean)
    .map((initial) => `${initial}.`)
    .join(" ");

  return `${lastName}, ${initials}`;
}

function formatReferenceApa(source: SourceLike) {
  const authors =
    source.authors.length > 0
      ? source.authors.slice(0, 8).map(formatAuthorApa).join(", ")
      : "Autor no disponible";
  const year = source.year ?? "s.f.";
  const venue = source.venue ? ` ${source.venue}.` : "";
  const doi = source.doi ? ` https://doi.org/${source.doi.replace(/^https?:\/\/doi.org\//i, "")}` : "";

  return `${authors} (${year}). ${source.title}.${venue}${doi}`;
}

function renderCover(input: {
  project: MasterBlueprintEngineProject;
  academicDocument: AcademicDocument;
  title: string;
  subtitle: string;
  templateName: string;
  brandingAssets: AcademicBrandingAsset[];
}) {
  const preferredLogo =
    input.brandingAssets.find((asset) => asset.available) ??
    input.brandingAssets.find((asset) => asset.role === "master_logo") ??
    input.brandingAssets.find((asset) => asset.role === "institution_logo") ??
    null;

  return [
    new Paragraph({ spacing: { after: ptToTwip(18) }, children: [] }),
    ...renderBrandLogo(preferredLogo),
    paragraph(input.project.university || "Universidad", {
      bold: true,
      alignment: AlignmentType.CENTER,
      indentFirstLine: false,
      sizePt: 11,
    }),
    paragraph(input.project.program || "Programa de maestria", {
      alignment: AlignmentType.CENTER,
      indentFirstLine: false,
      sizePt: 10.5,
    }),
    paragraph(sentenceStyleCapitalizePublicText(input.title, "title"), {
      bold: true,
      alignment: AlignmentType.CENTER,
      indentFirstLine: false,
      sizePt: 14,
    }),
    paragraph(sentenceStyleCapitalizePublicText(input.subtitle, "sentence"), {
      bold: true,
      alignment: AlignmentType.CENTER,
      indentFirstLine: false,
      sizePt: 11,
      color: ACCENT_COLOR,
    }),
    ...renderCoverVisual({
      academicDocument: input.academicDocument,
      fallbackLogo: preferredLogo,
    }),
    paragraph(
      input.academicDocument.variant === "master"
        ? "Documento master academico"
        : "Plan de tesis institucional",
      {
      alignment: AlignmentType.CENTER,
      indentFirstLine: false,
      sizePt: 10,
      color: "5E6470",
      },
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function renderTableOfContents(_entries: TocEntry[]) {
  return [
    new TableOfContents("Tabla de contenido", {
      hyperlink: true,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function renderMatrix(academicDocument: AcademicDocument) {
  const matrixArtifact = academicDocument.matrix;
  const tableModel = matrixArtifact.table_model;
  if (!tableModel) {
    return [smallNote("Matriz de consistencia no disponible.")];
  }

  const header = tableModel.header_rows[0] ?? tableModel.columns.map((column) => column.label);
  const rows = [
    header,
    ...tableModel.body_rows.map((row) => row.cells),
  ];

  return [
    heading("Matriz de consistencia", 1),
    smallNote("Tabla 1. Matriz de consistencia del proyecto de investigacion."),
    simpleTable(rows, academicDocument.matrix_layout.column_widths_pct, {
      paperLike: true,
      fontSizePt: academicDocument.matrix_layout.font_size_pt,
    }),
    smallNote("Fuente: elaboracion propia a partir de los objetivos, preguntas, hipotesis y metodologia generados con trazabilidad."),
  ];
}

function phaseFill(phase: ScheduleVisualPlan["tasks"][number]["phase"]) {
  switch (phase) {
    case "metodologia":
    case "ejecucion":
      return "D7E8F7";
    case "analisis":
      return "D8E7DF";
    case "redaccion":
      return "E7D8C9";
    case "revision":
    case "revision_asesor":
      return "E4ECD6";
    case "cierre":
      return "D8DDE8";
    default:
      return "EFE7DC";
  }
}

export function buildScheduleGanttTableRows(plan: ScheduleVisualPlan) {
  const months = [1, 2, 3, 4, 5, 6];

  return [
    [
      "Fase",
      "Actividad",
      "Periodo",
      ...months.map((month) => `M${month}`),
      "Dependencia",
      "Entregable",
    ],
    ...plan.tasks.map((task, index) => [
      sentenceStyleCapitalizePublicText(task.phase.replace(/_/g, " "), "label"),
      sentenceStyleCapitalizePublicText(task.task, "label"),
      `M${Math.max(1, task.start_month)}-M${Math.max(task.start_month, task.end_month)}`,
      ...months.map((month) => (month >= task.start_month && month <= task.end_month ? "X" : "")),
      sentenceStyleCapitalizePublicText(
        task.dependency || (index === 0 ? "Aprobacion del plan de trabajo" : `Actividad ${index}`),
        "label",
      ),
      sentenceStyleCapitalizePublicText(task.deliverable || "Avance verificable del proyecto", "label"),
    ]),
  ];
}

function renderScheduleVisual(plan: ScheduleVisualPlan) {
  const rows = buildScheduleGanttTableRows(plan);
  const widths = [10, 28, 12, 5, 5, 5, 5, 5, 5, 12, 18];

  return [
    smallNote(`Tabla 2. ${plan.caption}`),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: rows.map(
        (row, rowIndex) =>
          new TableRow({
            tableHeader: rowIndex === 0,
            children: row.map((value, index) => {
              const task = plan.tasks[rowIndex - 1];
              return cell(value, {
                header: rowIndex === 0,
                widthPct: widths[index],
                align: index <= 2 || index >= 9 ? "left" : "center",
                fontSizePt: rowIndex === 0 ? 8.5 : 8,
                shading:
                  rowIndex > 0 && index >= 3 && index <= 8 && value
                    ? phaseFill(task?.phase ?? "planificacion")
                    : undefined,
                minimalBorders: true,
              });
            }),
          }),
      ),
    }),
    smallNote(plan.source_note),
  ];
}

function formatBudgetRange(range: BudgetRange) {
  return `${range.currency} ${range.min.toLocaleString("en-US")} - ${range.max.toLocaleString("en-US")}`;
}

function renderBudgetPlan(input: {
  rows: ResearchBudgetRow[];
  totalRange: BudgetRange | null;
}) {
  if (input.rows.length === 0) {
    return [
      smallNote(
        "Presupuesto preliminar no disponible; debe completarse con rangos y supuestos antes de entrega academica.",
      ),
    ];
  }

  const rows = capitalizePublicTableRows([
    [
      "Categoria",
      "Tipo",
      "Item",
      "Unidad",
      "Cantidad",
      "Costo unitario",
      "Subtotal",
      "Supuesto",
    ],
    ...input.rows.map((row) => [
      row.category,
      row.cost_type,
      row.item,
      row.unit,
      String(row.quantity),
      formatBudgetRange(row.unit_cost_range),
      formatBudgetRange(row.subtotal_range),
      row.assumption,
    ]),
  ]);

  return [
    smallNote("Tabla 3. Presupuesto preliminar de investigacion con rangos referenciales."),
    simpleTable(rows, [11, 9, 22, 10, 8, 12, 12, 16], {
      paperLike: true,
      fontSizePt: 7.5,
    }),
    smallNote(
      input.totalRange
        ? `Total estimado referencial: ${formatBudgetRange(input.totalRange)}. Fuente: elaboracion propia; no corresponde a cotizaciones de proveedor.`
        : "Fuente: elaboracion propia; no corresponde a cotizaciones de proveedor.",
    ),
  ];
}

function renderPublicAppendixPolicyItems(items: PublicAppendixItem[]) {
  if (items.length === 0) {
    return [];
  }

  const rows = capitalizePublicTableRows([
    ["Anexo academico", "Proposito"],
    ...items
      .filter((item) => item.include_in_docx)
      .map((item) => [item.title, item.purpose]),
  ]);

  return [
    heading("Anexo D. Indice de anexos academicos publicos", 1),
    smallNote(
      "Los anexos publicos se limitan a contenidos academicos utiles para lectura, evaluacion metodologica y gestion del proyecto.",
    ),
    simpleTable(rows, [34, 66], { paperLike: true, fontSizePt: 8.5 }),
  ];
}

function renderTraceabilityAnnex(input: {
  evidenceLedger: EvidenceLedger;
  validationReport: MasterBlueprintValidationReport;
  matrixArtifact: ConsistencyMatrixArtifact;
}) {
  const quality = input.validationReport.quality_report;
  const rows = [
    ["Criterio", "Resultado"],
    ["Calidad academica preliminar", sanitizePublicAppendixText(`${quality.score_10}/10`)],
    [
      "Trazabilidad de referencias",
      sanitizePublicAppendixText(
        input.validationReport.reference_traceability_ok ? "Verificada" : "Requiere revision",
      ),
    ],
    [
      "Matriz de consistencia",
      sanitizePublicAppendixText(
        `${input.matrixArtifact.specific_rows.length} filas; alineacion: ${input.matrixArtifact.validation.row_alignment_ok ? "verificada" : "por revisar"}`,
      ),
    ],
    ["Fuentes formales", `${input.evidenceLedger.source_registry.filter((source) => source.eligible_for_formal_reference).length}`],
    [
      "Advertencias",
      sanitizePublicAppendixText(
        [...input.validationReport.warnings, ...input.matrixArtifact.validation.warnings].slice(0, 4).join(" | ") ||
          "Sin advertencias criticas",
      ),
    ],
  ];

  return [
    heading("Anexo A. Declaracion de trazabilidad academica", 1),
    smallNote(
      "Este anexo resume condiciones academicas verificables del documento. Los identificadores tecnicos de proveedores, rutas locales y registros internos quedan fuera del documento publico.",
    ),
    simpleTable(rows, [28, 72], { paperLike: true, fontSizePt: 8.5 }),
  ];
}

function renderProjectManagementAnnex(input: {
  sections: AcademicSection[];
  titleOverrides: Record<string, string>;
  scheduleVisual: ScheduleVisualPlan | null;
  budgetRows: ResearchBudgetRow[];
  budgetTotalRange: BudgetRange | null;
}) {
  const managementSections = input.sections.filter((section) =>
    ["schedule", "budget", "annexes"].includes(section.section_key),
  );

  if (managementSections.length === 0 && !input.scheduleVisual && input.budgetRows.length === 0) {
    return [];
  }

  return [
    heading("Anexo C. Gestion del proyecto", 1),
    smallNote(
      "Contenido operativo movido a anexo para preservar un cuerpo principal con lectura tipo articulo academico.",
    ),
    ...managementSections.flatMap((section) => {
      if (section.section_key === "schedule" && input.scheduleVisual) {
        return [
          heading(input.titleOverrides[section.section_key] ?? section.title, 2),
          ...renderScheduleVisual(input.scheduleVisual),
        ];
      }

      if (section.section_key === "budget") {
        return [
          heading(input.titleOverrides[section.section_key] ?? section.title, 2),
          ...renderBudgetPlan({
            rows: input.budgetRows,
            totalRange: input.budgetTotalRange,
          }),
        ];
      }

      return [
        heading(input.titleOverrides[section.section_key] ?? section.title, 2),
        ...renderAcademicContentBlocks(section),
      ];
    }),
    ...(managementSections.some((section) => section.section_key === "schedule") || !input.scheduleVisual
      ? []
      : [
          heading("Cronograma de investigacion", 2),
          ...renderScheduleVisual(input.scheduleVisual),
        ]),
    ...(managementSections.some((section) => section.section_key === "budget") || input.budgetRows.length === 0
      ? []
      : [
          heading("Presupuesto referencial", 2),
          ...renderBudgetPlan({
            rows: input.budgetRows,
            totalRange: input.budgetTotalRange,
          }),
        ]),
  ];
}

function renderAssetPlanAnnex(input: {
  academicDocument: AcademicDocument;
  renderedAssetKeys: Set<string>;
}) {
  const figures = input.academicDocument.layout_plan.figures.filter(
    (figure) => !input.renderedAssetKeys.has(`${figure.section_key}|${figure.source_id}|${figure.asset_key}`),
  );
  const equations = input.academicDocument.layout_plan.equations.filter(
    (equation) => !input.renderedAssetKeys.has(`${equation.section_key}|${equation.source_id}|${equation.asset_key}`),
  );

  if (figures.length === 0 && equations.length === 0) {
    return [
      heading("Anexo B. Registro academico de apoyos visuales", 1),
      smallNote("No quedaron figuras o ecuaciones pendientes de insercion en anexos publicos. Los apoyos textuales no publicables se conservan fuera del DOCX para revision interna."),
    ];
  }

  const rows = [
    ["Elemento", "Seccion", "Uso academico"],
    ...figures.map((figure) => [
      `Figura ${figure.figure_number}`,
      figure.section_key,
      figure.caption,
    ]),
    ...equations.map((equation) => [
      `Ecuacion ${equation.equation_number}`,
      equation.section_key,
      equation.caption,
    ]),
  ];

  return [
    heading("Anexo B. Registro academico de apoyos visuales", 1),
    smallNote("Solo se muestran apoyos visuales publicables. Identificadores tecnicos, rutas locales, hashes y enlaces de proveedor quedan fuera del DOCX y se conservan en registros internos."),
    simpleTable(rows, [20, 20, 60], { paperLike: true, fontSizePt: 8.5 }),
    ...equations.flatMap((equation) => renderEquationAsset(equation)),
    ...figures.flatMap((figure) => renderImageAsset({ figure })),
  ];
}

function renderReferences(references: AcademicReference[]) {
  return [
    heading("Referencias", 1),
    ...references.slice(0, 24).map((reference) =>
      paragraph(reference.apa_reference, {
        alignment: AlignmentType.LEFT,
        indentFirstLine: false,
        afterPt: 4,
      }),
    ),
  ];
}

function makeSectionProperties(orientation: "portrait" | "landscape", options: {
  titlePage?: boolean;
  variant?: DocxVariant;
} = {}) {
  const landscape = orientation === "landscape";
  const institutional = options.variant === "university";

  return {
    page: {
      size: {
        orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        // docx swaps width/height internally when orientation is landscape.
        width: PAGE_WIDTH_PORTRAIT,
        height: PAGE_HEIGHT_PORTRAIT,
      },
      margin: {
        top: cmToTwip(2.54),
        bottom: cmToTwip(2.54),
        left: cmToTwip(landscape ? 1.8 : institutional ? 3 : 2.54),
        right: cmToTwip(landscape ? 1.8 : 2.54),
        header: cmToTwip(1.25),
        footer: cmToTwip(1.25),
      },
    },
    titlePage: options.titlePage,
  };
}

function renderSections(input: {
  academicDocument: AcademicDocument;
  assetPlacements: AssetPlacement[];
}) {
  const children: FileChild[] = [];
  const tocEntries: TocEntry[] = [];
  const renderedAssetKeys = new Set<string>();
  const bodyKeys = new Set(input.academicDocument.editorial_plan.main_body_section_keys);
  const titleOverrides = input.academicDocument.editorial_plan.title_overrides;
  const counters = [0, 0, 0, 0, 0];

  function nextSectionNumber(level: number) {
    const safeLevel = Math.min(5, Math.max(1, level));
    counters[safeLevel - 1] += 1;
    for (let index = safeLevel; index < counters.length; index += 1) {
      counters[index] = 0;
    }

    if (safeLevel > 1 && counters[0] === 0) {
      counters[0] = 1;
    }

    return counters.slice(0, safeLevel).filter((count) => count > 0).join(".");
  }

  for (const section of input.academicDocument.sections) {
    if (section.section_key === "consistency_matrix" || section.section_key === "references") {
      continue;
    }

    if (!bodyKeys.has(section.section_key)) {
      continue;
    }

    const sectionNumber = nextSectionNumber(section.level);
    const rawTitle = titleOverrides[section.section_key] ?? section.title;
    const numberedTitle = /^\d+(?:\.\d+)*\.?\s/.test(rawTitle)
      ? rawTitle
      : `${sectionNumber}. ${rawTitle}`;
    tocEntries.push({
      number: sectionNumber,
      title: rawTitle,
      level: section.level,
    });
    children.push(heading(numberedTitle, section.level));
    if (section.section_key === "schedule" && input.academicDocument.layout_plan.schedule_visual) {
      children.push(...renderScheduleVisual(input.academicDocument.layout_plan.schedule_visual));
      continue;
    }
    if (section.section_key === "budget" && (input.academicDocument.layout_plan.budget_rows ?? []).length > 0) {
      children.push(
        ...renderBudgetPlan({
          rows: input.academicDocument.layout_plan.budget_rows ?? [],
          totalRange: input.academicDocument.layout_plan.budget_total_range ?? null,
        }),
      );
      continue;
    }

    children.push(...renderAcademicContentBlocks(section));
    const sectionFigures = input.academicDocument.layout_plan.figures
      .filter((figure) => figure.section_key === section.section_key)
      .slice(0, 2);
    const sectionEquations = input.academicDocument.layout_plan.equations
      .filter((equation) => equation.section_key === section.section_key)
      .slice(0, 2);

    for (const equation of sectionEquations) {
      children.push(...renderEquationAsset(equation));
      renderedAssetKeys.add(`${equation.section_key}|${equation.source_id}|${equation.asset_key}`);
    }

    for (const figure of sectionFigures) {
      const renderedAsset = renderImageAsset({ figure });
      if (renderedAsset.length === 0) {
        continue;
      }

      renderedAssetKeys.add(`${figure.section_key}|${figure.source_id}|${figure.asset_key}`);
      children.push(...renderedAsset);
    }
  }

  return {
    children,
    renderedAssetKeys,
    tocEntries,
  };
}

function buildMasterSections(input: {
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
}): RenderSection[] {
  const draftMap = new Map(input.drafts.map((draft) => [draft.section_key, draft]));
  const sections: RenderSection[] = [];
  const mergedIntoParent = new Set(["variables_indicators", "categories_subcategories"]);
  const unique = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

  for (const templateSection of input.masterTemplate.sections) {
    if (mergedIntoParent.has(templateSection.semantic_key)) {
      continue;
    }

    const draft = draftMap.get(templateSection.semantic_key);
    const mergeDrafts =
      templateSection.semantic_key === "variables_or_categories"
        ? [
            draft,
            draftMap.get("variables_indicators"),
            draftMap.get("categories_subcategories"),
          ].filter((item): item is MasterSectionDraft => Boolean(item))
        : draft
          ? [draft]
          : [];
    if (mergeDrafts.length === 0) {
      continue;
    }

    sections.push({
      section_key: templateSection.semantic_key,
      title: templateSection.title || draft?.title || templateSection.semantic_key,
      content: unique(mergeDrafts.map((item) => cleanDocText(item.content))).join("\n\n"),
      level: templateSection.level,
      supported_source_ids: unique(
        mergeDrafts.flatMap((item) => [
          ...item.supported_source_ids,
          ...item.supported_pdf_source_ids,
        ]),
      ),
    });
  }

  return sections;
}

function buildUniversitySections(universityBlueprint: UniversityBlueprintPackage): RenderSection[] {
  return universityBlueprint.sections.map((section: UniversityBlueprintSection) => ({
    section_key: section.section_key,
    title: section.title,
    content: section.content,
    level: section.level ?? (section.section_key.includes("_") ? 2 : 1),
    supported_source_ids: section.source_ids ?? [],
  }));
}

function createDocument(input: {
  project: MasterBlueprintEngineProject;
  academicDocument: AcademicDocument;
  evidenceLedger: EvidenceLedger;
  validationReport: MasterBlueprintValidationReport;
}) {
  const renderedSections = renderSections({
    academicDocument: input.academicDocument,
    assetPlacements: input.academicDocument.asset_placements,
  });

  return new Document({
    creator: "Ingeniometrix",
    title: input.academicDocument.metadata.title,
    description: "Proyecto de investigacion generado con trazabilidad academica.",
    styles: {
      default: {
        document: {
          run: {
            font: BODY_FONT,
            size: ptToHalfPt(11),
          },
          paragraph: {
            spacing: { line: 360, after: ptToTwip(6) },
          },
        },
      },
    },
    sections: [
      {
        properties: makeSectionProperties("portrait", {
          titlePage: true,
          variant: input.academicDocument.variant,
        }),
        headers: {
          first: buildBlankHeader(),
          default: buildAcademicHeader({
            academicDocument: input.academicDocument,
            sectionLabel: "Cuerpo principal",
          }),
        },
        footers: {
          first: buildBlankFooter(),
          default: buildAcademicFooter({
            academicDocument: input.academicDocument,
          }),
        },
        children: [
          ...renderCover({
            project: input.project,
            academicDocument: input.academicDocument,
            title: input.academicDocument.metadata.title,
            subtitle: input.academicDocument.metadata.subtitle,
            templateName: input.academicDocument.template_name,
            brandingAssets: input.academicDocument.branding,
          }),
          ...renderTableOfContents(renderedSections.tocEntries),
          ...renderedSections.children,
        ],
      },
      {
        properties: makeSectionProperties("landscape", {
          variant: input.academicDocument.variant,
        }),
        headers: {
          default: buildAcademicHeader({
            academicDocument: input.academicDocument,
            sectionLabel: "Matriz de consistencia",
          }),
        },
        footers: {
          default: buildAcademicFooter({
            academicDocument: input.academicDocument,
          }),
        },
        children: renderMatrix(input.academicDocument),
      },
      {
        properties: makeSectionProperties("portrait", {
          variant: input.academicDocument.variant,
        }),
        headers: {
          default: buildAcademicHeader({
            academicDocument: input.academicDocument,
            sectionLabel: "Referencias y anexos",
          }),
        },
        footers: {
          default: buildAcademicFooter({
            academicDocument: input.academicDocument,
          }),
        },
        children: [
          ...renderReferences(input.academicDocument.references),
          ...renderTraceabilityAnnex({
            evidenceLedger: input.evidenceLedger,
            validationReport: input.validationReport,
            matrixArtifact: input.academicDocument.matrix,
          }),
          ...renderProjectManagementAnnex({
            sections: input.academicDocument.sections,
            titleOverrides: input.academicDocument.editorial_plan.title_overrides,
            scheduleVisual: input.academicDocument.layout_plan.schedule_visual,
            budgetRows: input.academicDocument.layout_plan.budget_rows ?? [],
            budgetTotalRange: input.academicDocument.layout_plan.budget_total_range ?? null,
          }),
          ...renderPublicAppendixPolicyItems(input.academicDocument.layout_plan.appendix_public_items ?? []),
          ...renderAssetPlanAnnex({
            academicDocument: input.academicDocument,
            renderedAssetKeys: renderedSections.renderedAssetKeys,
          }),
        ],
      },
    ],
  });
}

function hasMarkdown(value: string) {
  return /(^#{1,6}\s)|(\*\*)|(\|---)/m.test(value);
}

async function writeDocx(input: {
  document: Document;
  outputPath: string;
}) {
  const buffer = await Packer.toBuffer(input.document);
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(input.outputPath, buffer);
  return patchDocxPackage({ docxPath: input.outputPath });
}

function buildManifest(input: {
  stepKey: "master_docx_render" | "university_docx_render";
  variant: DocxVariant;
  outputPath: string;
  runDir: string;
  academicDocument: AcademicDocument;
  ooxmlPatchReport: DocxOoxmlPatchReport;
}): LabDocxRenderManifest {
  const stats = fs.statSync(input.outputPath);
  const availableLogoCount = input.academicDocument.branding.filter((asset) => asset.available).length;
  const renderableImageAssetCount = input.academicDocument.asset_placements.filter(
    (placement) => placement.renderable && placement.render_mode === "image",
  ).length;
  const llmEditorialUsage = input.academicDocument.llm_editorial_passes.reduce(
    (totals, pass) => ({
      totalTokens: totals.totalTokens + (pass.usage?.total_tokens ?? 0),
      costCad: totals.costCad + (pass.usage?.cost_cad ?? 0),
    }),
    { totalTokens: 0, costCad: 0 },
  );
  const llmLayoutUsage = input.academicDocument.llm_layout_passes.reduce(
    (totals, pass) => ({
      totalTokens: totals.totalTokens + (pass.usage?.total_tokens ?? 0),
      costCad: totals.costCad + (pass.usage?.cost_cad ?? 0),
    }),
    { totalTokens: 0, costCad: 0 },
  );
  const suppressedTextAssetCount = input.academicDocument.asset_placements.filter(
    (placement) =>
      input.academicDocument.layout_plan.suppressed_asset_keys.includes(placement.asset_key) &&
      (placement.render_mode === "text_fallback" || !placement.renderable),
  ).length;
  const publicSourceTitleReplacements = input.academicDocument.public_sanitization_passes.reduce(
    (sum, pass) => sum + pass.source_title_replacements,
    0,
  );
  const publicRemainingTitleLeakCount = input.academicDocument.public_sanitization_passes.reduce(
    (sum, pass) => sum + pass.remaining_title_leaks.length,
    0,
  );
  const warnings = [
    input.academicDocument.matrix.status !== "pass"
      ? `Matriz en estado ${input.academicDocument.matrix.status}: ${input.academicDocument.matrix.validation.warnings.join(" | ")}`
      : null,
    input.academicDocument.asset_placements.length === 0
      ? "No hay assets renderizables conectados al paquete activo; se agrega anexo de advertencia."
      : null,
    renderableImageAssetCount === 0
      ? "No se resolvieron imagenes fisicas para insertar en el DOCX; revisar extracted_assets."
      : null,
    availableLogoCount === 0
      ? "No se resolvio logo renderizable para la portada."
      : null,
    ...input.academicDocument.warnings.slice(0, 4),
    ...input.academicDocument.llm_editorial_passes.flatMap((pass) => pass.warnings).slice(0, 3),
    ...input.ooxmlPatchReport.warnings,
  ].filter((item): item is string => Boolean(item));

  return {
    artifact_type: "lab_docx_render_manifest",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    step_key: input.stepKey,
    variant: input.variant,
    template_key: input.academicDocument.template_key,
    template_name: input.academicDocument.template_name,
    report_archetype: input.academicDocument.report_archetype,
    output_docx_path: input.outputPath,
    output_docx_file_name: path.basename(input.outputPath),
    relative_docx_path: path.relative(input.runDir, input.outputPath),
    file_size_bytes: stats.size,
    section_count: input.academicDocument.sections.length,
    matrix_rows: input.academicDocument.matrix.specific_rows.length,
    references_count: input.academicDocument.references.length,
    citation_style: input.academicDocument.citation_style,
    citations_inserted_count: input.academicDocument.sections.reduce(
      (sum, section) => sum + section.citation_anchors.length,
      0,
    ),
    academic_model_version: input.academicDocument.artifact_version,
    style_contract_keys: Object.keys(input.academicDocument.style_contract),
    asset_placement_count: input.academicDocument.asset_placements.length,
    renderable_asset_count: input.academicDocument.asset_placements.filter(
      (placement) => placement.renderable,
    ).length,
    available_logo_count: availableLogoCount,
    rendered_image_asset_count: renderableImageAssetCount,
    main_body_section_count: input.academicDocument.editorial_plan.main_body_section_keys.length,
    suppressed_section_count: input.academicDocument.editorial_plan.suppressed_section_keys.length,
    duplicate_pair_count: input.academicDocument.editorial_plan.duplicate_pairs.length,
    llm_editorial_pass_count: input.academicDocument.llm_editorial_passes.length,
    llm_editorial_total_tokens: llmEditorialUsage.totalTokens,
    llm_editorial_cost_cad: Number(llmEditorialUsage.costCad.toFixed(6)),
    llm_layout_pass_count: input.academicDocument.llm_layout_passes.length,
    llm_layout_total_tokens: llmLayoutUsage.totalTokens,
    llm_layout_cost_cad: Number(llmLayoutUsage.costCad.toFixed(6)),
    public_sanitization_pass_count: input.academicDocument.public_sanitization_passes.length,
    public_source_title_replacements: publicSourceTitleReplacements,
    public_remaining_title_leak_count: publicRemainingTitleLeakCount,
    hero_image_status: input.academicDocument.layout_plan.cover_visual.image_generation_status,
    hero_image_model: input.academicDocument.layout_plan.cover_visual.image_model,
    hero_image_path: input.academicDocument.layout_plan.cover_visual.image_path,
    figure_plan_count: input.academicDocument.layout_plan.figures.length,
    equation_plan_count: input.academicDocument.layout_plan.equations.length,
    suppressed_text_asset_count: suppressedTextAssetCount,
    matrix_layout: {
      orientation: input.academicDocument.matrix_layout.orientation,
      font_size_pt: input.academicDocument.matrix_layout.font_size_pt,
      repeat_header: input.academicDocument.matrix_layout.repeat_header,
    },
    ooxml_patch_report: input.ooxmlPatchReport,
    quality_checks: {
      docx_written: stats.size > 10_000,
      has_cover: true,
      has_matrix_table: input.academicDocument.matrix.specific_rows.length > 0,
      has_references: input.academicDocument.references.length > 0,
      has_traceability_annex: true,
      has_brand_logo: availableLogoCount > 0,
      has_renderable_assets: renderableImageAssetCount > 0,
      control_content_moved_to_annex: true,
      has_editorial_plan: input.academicDocument.editorial_plan.artifact_version === "v1",
      markdown_removed: !input.academicDocument.sections.some((section) =>
        section.blocks.some((block) => "text" in block && hasMarkdown(cleanAcademicText(block.text))),
      ),
      landscape_matrix_section: input.academicDocument.matrix_layout.orientation === "landscape",
      has_academic_header_footer: true,
      has_asset_references:
        input.academicDocument.layout_plan.figures.every((figure) =>
          cleanDocText(figure.body_reference).includes(`Figura ${figure.figure_number}`),
        ) &&
        input.academicDocument.layout_plan.equations.every((equation) =>
          cleanDocText(equation.body_reference).includes(`Ecuacion ${equation.equation_number}`),
        ),
      has_clean_public_annex:
        input.academicDocument.layout_plan.public_annex_policy.include_internal_traceability === false,
      has_schedule_gantt: Boolean(input.academicDocument.layout_plan.schedule_visual),
      has_cover_visual:
        Boolean(input.academicDocument.layout_plan.cover_visual.concept) &&
        (input.academicDocument.layout_plan.cover_visual.image_generation_status === "generated" ||
          input.academicDocument.layout_plan.cover_visual.hero_visual_type === "methodological_infographic_cover"),
      has_table_of_contents: true,
      has_numbered_headings: true,
      has_professional_equations:
        input.academicDocument.layout_plan.equations.length === 0 ||
        input.academicDocument.layout_plan.equations.every((equation) => cleanDocText(equation.latex)),
      no_source_title_leaks: publicRemainingTitleLeakCount === 0,
      no_internal_runtime_markers: true,
    },
    warnings,
  } satisfies LabDocxRenderManifest;
}

function countSectionCitations(input: {
  sections: RenderSection[];
  evidenceLedger: EvidenceLedger;
}) {
  const sourceLookup = buildSourceLookup(input.evidenceLedger);

  return input.sections.reduce(
    (sum, section) =>
      sum +
      (shouldInsertCitations(section.section_key)
        ? sectionCitations({ section, sourceLookup }).length
        : 0),
    0,
  );
}

export async function renderMasterDocx(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  drafts: MasterSectionDraft[];
  matrixArtifact: ConsistencyMatrixArtifact;
  evidenceLedger: EvidenceLedger;
  validationReport: MasterBlueprintValidationReport;
  legacyBlueprint: ResearchBlueprintRecord;
  consolidatedAssetUsagePlan: Array<Record<string, unknown>>;
  academicDocumentOverride?: AcademicDocument;
  outputPath: string;
  runDir: string;
}) {
  const academicDocument =
    input.academicDocumentOverride ??
    buildMasterAcademicDocument({
      project: input.project,
      masterTemplate: input.masterTemplate,
      drafts: input.drafts,
      matrixArtifact: input.matrixArtifact,
      evidenceLedger: input.evidenceLedger,
      legacyBlueprint: input.legacyBlueprint,
      consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
    });
  const document = createDocument({
    project: input.project,
    academicDocument,
    evidenceLedger: input.evidenceLedger,
    validationReport: input.validationReport,
  });

  const ooxmlPatchReport = await writeDocx({ document, outputPath: input.outputPath });

  return buildManifest({
    stepKey: "master_docx_render",
    variant: "master",
    outputPath: input.outputPath,
    runDir: input.runDir,
    academicDocument,
    ooxmlPatchReport,
  });
}

export async function renderUniversityDocx(input: {
  project: MasterBlueprintEngineProject;
  universityBlueprint: UniversityBlueprintPackage;
  matrixArtifact: ConsistencyMatrixArtifact;
  evidenceLedger: EvidenceLedger;
  validationReport: MasterBlueprintValidationReport;
  legacyBlueprint: ResearchBlueprintRecord;
  consolidatedAssetUsagePlan: Array<Record<string, unknown>>;
  academicDocumentOverride?: AcademicDocument;
  outputPath: string;
  runDir: string;
}) {
  const academicDocument =
    input.academicDocumentOverride ??
    buildUniversityAcademicDocument({
      project: input.project,
      universityBlueprint: input.universityBlueprint,
      matrixArtifact: input.matrixArtifact,
      evidenceLedger: input.evidenceLedger,
      legacyBlueprint: input.legacyBlueprint,
      consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
    });
  const document = createDocument({
    project: input.project,
    academicDocument,
    evidenceLedger: input.evidenceLedger,
    validationReport: input.validationReport,
  });

  const ooxmlPatchReport = await writeDocx({ document, outputPath: input.outputPath });

  return buildManifest({
    stepKey: "university_docx_render",
    variant: "university",
    outputPath: input.outputPath,
    runDir: input.runDir,
    academicDocument,
    ooxmlPatchReport,
  });
}
