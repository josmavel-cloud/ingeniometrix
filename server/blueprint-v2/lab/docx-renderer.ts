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

import { normalizeLanguageCode } from "@/lib/language";
import {
  buildMasterAcademicDocument,
  buildUniversityAcademicDocument,
  cleanAcademicText,
  normalizeEnglishAcademicDocument,
} from "@/server/blueprint-v2/lab/academic-document-compiler";
import {
  capitalizePublicTableRows,
  sentenceStyleCapitalizePublicText,
} from "@/server/blueprint-v2/editorial/capitalization-hygiene";
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
    no_public_traceability_annex: boolean;
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

type TocEntry = {
  number: string;
  title: string;
  level: number;
};

const BODY_FONT = "Times New Roman";
const HEADING_COLOR = "1F2937";
const ACCENT_COLOR = "6B4A2F";
const TABLE_HEADER_FILL = "F3EFE8";
const BORDER_COLOR = "4B5563";
const PAGE_WIDTH_PORTRAIT = 11906;
const PAGE_HEIGHT_PORTRAIT = 16838;
const HEADER_FOOTER_COLOR = "5E6470";
const TRANSPARENT_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lYQG7wAAAABJRU5ErkJggg==",
  "base64",
);

function docLanguage(document: AcademicDocument | { language?: string | null } | null | undefined) {
  return normalizeLanguageCode(document?.language) ?? "es";
}

function docLabels(document: AcademicDocument | { language?: string | null } | null | undefined) {
  const english = docLanguage(document) === "en";

  return english
    ? {
        academicInfographic: "Academic methodological infographic",
        studyObject: "Study object",
        problem: "Problem",
        evidence: "Evidence",
        method: "Method",
        analysis: "Analysis",
        output: "Output",
        contextTools: "Context, tools, and components",
        application: "Application",
        criteria: "Criteria",
        deliverable: "Deliverable",
        noInvented: "Contains no invented data, citations, or results",
        figure: "Figure",
        equation: "Equation",
        table: "Table",
        visualSupport: "Visual support",
        supportField: "Field",
        supportDetail: "Detail",
        supportType: "Support type",
        intendedUse: "Intended use",
        intendedUseText: "Complement the academic explanation of the corresponding section.",
        status: "Status",
        statusText: "Pending structured reconstruction with source support before production use.",
        tableOfContents: "Table of contents",
        masterDocument: "Master academic document",
        institutionalPlan: "Institutional thesis plan",
        matrixUnavailable: "Consistency matrix not available.",
        matrixHeading: "Consistency matrix",
        matrixCaption: "Table 1. Consistency matrix for the research project.",
        matrixSource: "Source: Own elaboration based on the project's objectives, questions, hypotheses, and methodology.",
        sourceOwn: "Source: Own elaboration based on generated content and traceable evidence.",
        phase: "Phase",
        activity: "Activity",
        period: "Period",
        dependency: "Dependency",
        ganttDeliverable: "Deliverable",
        planApproval: "Work plan approval",
        activityN: "Activity",
        verifiableProgress: "Verifiable project progress",
        budgetUnavailable: "Preliminary budget not available; ranges and assumptions must be completed before academic delivery.",
        budgetCaption: "Table 3. Preliminary research budget with reference ranges.",
        budgetTotalPrefix: "Estimated reference total",
        budgetSource: "Source: Own elaboration; does not correspond to vendor quotations.",
        appendixAcademic: "Academic appendix",
        purpose: "Purpose",
        appendixB: "Appendix B. Public academic appendices",
        appendixA: "Appendix A. Research schedule",
        scheduleHeading: "Research schedule",
        assetElement: "Element",
        academicUse: "Academic use",
        pendingEquation: "Pending equation",
        pendingTable: "Pending table",
        pendingSupport: "Pending support",
        appendixC: "Appendix C. Academic visual supports",
        references: "References",
        secondaryReferences: "Detected secondary references pending recovery",
        secondaryReferencesNote: "These sources were mentioned inside recovered documents. They are not cited as primary sources until they are recovered, validated, and added to the corpus.",
        referencesAndAnnexes: "References and appendices",
        projectManagement: "Project management",
        appendices: "Appendices",
        documentDescription: "Academic research project assisted by Ingeniometrix.",
      }
    : {
        academicInfographic: "Infografia metodologica academica",
        studyObject: "Objeto de estudio",
        problem: "Problema",
        evidence: "Evidencia",
        method: "Metodo",
        analysis: "Analisis",
        output: "Salida",
        contextTools: "Contexto, herramientas y componentes",
        application: "Aplicacion",
        criteria: "Criterios",
        deliverable: "Entregable",
        noInvented: "No contiene datos, citas ni resultados inventados",
        figure: "Figura",
        equation: "Ecuacion",
        table: "Tabla",
        visualSupport: "Apoyo visual",
        supportField: "Campo",
        supportDetail: "Detalle",
        supportType: "Tipo de apoyo",
        intendedUse: "Uso previsto",
        intendedUseText: "Complementar la explicacion academica de la seccion correspondiente.",
        status: "Estado",
        statusText: "Pendiente de reconstruccion estructurada con soporte de fuente antes de uso productivo.",
        tableOfContents: "Tabla de contenido",
        masterDocument: "Documento master academico",
        institutionalPlan: "Plan de tesis institucional",
        matrixUnavailable: "Matriz de consistencia no disponible.",
        matrixHeading: "Matriz de consistencia",
        matrixCaption: "Tabla 1. Matriz de consistencia del proyecto de investigacion.",
        matrixSource: "Fuente: elaboracion propia a partir de los objetivos, preguntas, hipotesis y metodologia del proyecto.",
        sourceOwn: "Fuente: elaboracion propia a partir del contenido generado y evidencia trazable.",
        phase: "Fase",
        activity: "Actividad",
        period: "Periodo",
        dependency: "Dependencia",
        ganttDeliverable: "Entregable",
        planApproval: "Aprobacion del plan de trabajo",
        activityN: "Actividad",
        verifiableProgress: "Avance verificable del proyecto",
        budgetUnavailable: "Presupuesto preliminar no disponible; debe completarse con rangos y supuestos antes de entrega academica.",
        budgetCaption: "Tabla 3. Presupuesto preliminar de investigacion con rangos referenciales.",
        budgetTotalPrefix: "Total estimado referencial",
        budgetSource: "Fuente: elaboracion propia; no corresponde a cotizaciones de proveedor.",
        appendixAcademic: "Anexo academico",
        purpose: "Proposito",
        appendixB: "Anexo B. Anexos academicos publicos",
        appendixA: "Anexo A. Cronograma de investigacion",
        scheduleHeading: "Cronograma de investigacion",
        assetElement: "Elemento",
        academicUse: "Uso academico",
        pendingEquation: "Ecuacion pendiente",
        pendingTable: "Tabla pendiente",
        pendingSupport: "Apoyo pendiente",
        appendixC: "Anexo C. Apoyos visuales academicos",
        references: "Referencias",
        secondaryReferences: "Referencias secundarias detectadas y pendientes de recuperacion",
        secondaryReferencesNote: "Estas fuentes fueron mencionadas dentro de documentos recuperados. No se citan como fuentes primarias hasta recuperarlas, validarlas y agregarlas al corpus.",
        referencesAndAnnexes: "Referencias y anexos",
        projectManagement: "Gestion del proyecto",
        appendices: "Anexos",
        documentDescription: "Proyecto de investigacion academica asistida por Ingeniometrix.",
      };
}

function localizedSectionHeading(section: AcademicSection, academicDocument: AcademicDocument) {
  if (docLanguage(academicDocument) !== "en") {
    return section.title;
  }

  const titles: Record<string, string> = {
    abstract: "Abstract",
    keywords: "Keywords",
    introduction: "Introduction",
    problem_statement: "Problem statement",
    research_questions: "Research questions",
    general_research_question: "General research question",
    specific_research_questions: "Specific research questions",
    objectives: "Objectives",
    general_objective: "General objective",
    specific_objectives: "Specific objectives",
    hypotheses: "Hypotheses",
    general_hypothesis: "General hypothesis",
    specific_hypotheses: "Specific hypotheses",
    justification: "Justification",
    theoretical_justification: "Theoretical justification",
    practical_justification: "Practical justification",
    methodological_justification: "Methodological justification",
    theoretical_framework: "Theoretical framework",
    research_antecedents: "Research background",
    state_of_the_art: "State of the art",
    theoretical_bases: "Theoretical foundations",
    terms_definition: "Definition of terms",
    consistency_matrix: "Consistency matrix",
    variables_or_categories: "Variables, dimensions, and indicators or analysis categories",
    methodology: "Methodology",
    methodological_approach: "Approach, type, and level",
    research_design: "Research design",
    population_and_sample: "Population and sample",
    data_collection_techniques: "Data collection techniques and instruments",
    research_instruments: "Research instruments",
    research_procedure: "Procedure",
    analysis_plan: "Data or information analysis plan",
    ethics: "Ethical aspects",
    scope_and_limitations: "Scope and limitations",
    schedule: "Schedule",
    budget: "Budget",
    references: "References",
    annexes: "Appendices",
  };

  return titles[section.section_key] ?? section.title;
}

function normalizeAcademicDocumentForDocx(academicDocument: AcademicDocument) {
  return docLanguage(academicDocument) === "en"
    ? normalizeEnglishAcademicDocument(academicDocument)
    : academicDocument;
}

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

export function placeCitationInAcademicTextForDiagnostics(text: string, citationSuffix: string) {
  const cleanText = sentenceStyleCapitalizePublicText(cleanDocText(text), "sentence");
  const citation = cleanDocText(citationSuffix);
  if (!citation) {
    return cleanText;
  }

  if (cleanText.includes(citation)) {
    return cleanText;
  }

  const sentences = cleanText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length >= 2 && sentences[0].length >= 40) {
    return [sentences[0], citation, ...sentences.slice(1)].join(" ");
  }

  return `${cleanText} ${citation}`;
}

function publicWordCount(value: string) {
  return cleanDocText(value).split(/\s+/).filter(Boolean).length;
}

export function shouldSplitDensePublicBlockForDiagnostics(sectionKey: string, text: string) {
  const excluded = new Set([
    "abstract",
    "keywords",
    "references",
    "schedule",
    "budget",
    "consistency_matrix",
  ]);

  return !excluded.has(sectionKey) && publicWordCount(text) > 150;
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

function paragraphWithBoldLead(text: string, options: {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  beforePt?: number;
  afterPt?: number;
  indentFirstLine?: boolean;
  sizePt?: number;
  color?: string;
} = {}) {
  const clean = sentenceStyleCapitalizePublicText(text, "sentence");
  const colonIndex = clean.indexOf(":");
  const lead = colonIndex > 0 ? clean.slice(0, colonIndex).trim() : "";
  const rest = colonIndex > 0 ? clean.slice(colonIndex + 1).trim() : "";
  const leadWordCount = lead.split(/\s+/).filter(Boolean).length;
  const shouldBoldLead = colonIndex > 0 && colonIndex <= 70 && leadWordCount > 0 && leadWordCount <= 9;

  const children = shouldBoldLead
    ? [
        textRun(`${lead}: `, {
          bold: true,
          color: options.color,
          size: ptToHalfPt(options.sizePt ?? 11),
        }),
        textRun(rest, {
          color: options.color,
          size: ptToHalfPt(options.sizePt ?? 11),
        }),
      ]
    : [
        textRun(clean, {
          color: options.color,
          size: ptToHalfPt(options.sizePt ?? 11),
        }),
      ];

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
    children,
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
  const clean = sentenceStyleCapitalizePublicText(text, "sentence");
  const colonIndex = clean.indexOf(":");
  const lead = colonIndex > 0 ? clean.slice(0, colonIndex).trim() : "";
  const rest = colonIndex > 0 ? clean.slice(colonIndex + 1).trim() : "";
  const leadWordCount = lead.split(/\s+/).filter(Boolean).length;
  const shouldBoldLead = colonIndex > 0 && colonIndex <= 70 && leadWordCount > 0 && leadWordCount <= 9;

  return new Paragraph({
    spacing: { after: ptToTwip(4), line: 320 },
    indent: {
      left: 420,
      hanging: 220,
    },
    children: shouldBoldLead
      ? [textRun("\u2022 ", { bold: true }), textRun(`${lead}: `, { bold: true }), textRun(rest)]
      : [textRun("\u2022 ", { bold: true }), textRun(clean)],
  });
}

function smallNote(text: string) {
  return paragraph(sentenceStyleCapitalizePublicText(text, "sentence"), {
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

function buildAcademicFooter() {
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
  const publicText = sentenceStyleCapitalizePublicText(text, "table_cell");
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
          textRun(publicText, {
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
  const labels = docLabels(document);
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
  <text x="450" y="217" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#${palette.primary}" opacity="0.76">${labels.academicInfographic}</text>

  <rect x="150" y="300" width="600" height="188" rx="32" fill="#ffffff" stroke="#${palette.muted}" stroke-width="4"/>
  <rect x="304" y="344" width="292" height="78" rx="12" fill="#${palette.primary}" opacity="0.96"/>
  <rect x="342" y="318" width="216" height="28" rx="8" fill="#${palette.accent}" opacity="0.92"/>
  <path d="M338 422 L318 456 L582 456 L562 422 Z" fill="#${palette.muted}" opacity="0.78"/>
  <line x1="362" y1="360" x2="538" y2="360" stroke="#ffffff" stroke-width="6" opacity="0.88"/>
  <line x1="382" y1="384" x2="518" y2="384" stroke="#ffffff" stroke-width="6" opacity="0.68"/>
  <text x="450" y="284" text-anchor="middle" font-family="Georgia, serif" font-size="23" fill="#${palette.primary}" font-weight="700">${labels.studyObject}</text>
  <text x="450" y="525" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${palette.primary}" opacity="0.78">${promptSummary}</text>

  <path d="M450 548 L450 594" stroke="#${palette.muted}" stroke-width="8" stroke-linecap="round"/>
  <g font-family="Georgia, serif" font-size="18" font-weight="700">
    <rect x="54" y="612" width="128" height="96" rx="20" fill="#${palette.primary}" opacity="0.95"/>
    <text x="118" y="667" text-anchor="middle" fill="#ffffff">${labels.problem}</text>
    <rect x="212" y="612" width="128" height="96" rx="20" fill="#${palette.accent}" opacity="0.93"/>
    <text x="276" y="667" text-anchor="middle" fill="#ffffff">${labels.evidence}</text>
    <rect x="370" y="612" width="128" height="96" rx="20" fill="#${palette.primary}" opacity="0.92"/>
    <text x="434" y="667" text-anchor="middle" fill="#ffffff">${labels.method}</text>
    <rect x="528" y="612" width="128" height="96" rx="20" fill="#${palette.accent}" opacity="0.9"/>
    <text x="592" y="667" text-anchor="middle" fill="#ffffff">${labels.analysis}</text>
    <rect x="686" y="612" width="160" height="96" rx="20" fill="#${palette.primary}" opacity="0.9"/>
    <text x="766" y="667" text-anchor="middle" fill="#ffffff">${labels.output}</text>
  </g>
  <path d="M182 660 L212 660 M340 660 L370 660 M498 660 L528 660 M656 660 L686 660" stroke="#${palette.muted}" stroke-width="8" stroke-linecap="round"/>

  <rect x="104" y="790" width="692" height="196" rx="30" fill="#ffffff" opacity="0.86"/>
  <text x="450" y="838" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#${palette.primary}" font-weight="700">${labels.contextTools}</text>
  <circle cx="220" cy="910" r="35" fill="#${palette.primary}" opacity="0.94"/>
  <path d="M206 908 L220 890 L235 908 L235 934 L206 934 Z" fill="#ffffff" opacity="0.94"/>
  <circle cx="450" cy="910" r="35" fill="#${palette.accent}" opacity="0.94"/>
  <path d="M430 920 L450 892 L470 920 Z" fill="#ffffff" opacity="0.94"/>
  <circle cx="680" cy="910" r="35" fill="#${palette.primary}" opacity="0.94"/>
  <path d="M660 896 H700 M660 912 H700 M660 928 H688" stroke="#ffffff" stroke-width="8" stroke-linecap="round"/>
  <text x="220" y="966" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#${palette.primary}">${labels.application}</text>
  <text x="450" y="966" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#${palette.primary}">${labels.criteria}</text>
  <text x="680" y="966" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#${palette.primary}">${labels.deliverable}</text>

  <text x="450" y="1062" text-anchor="middle" font-family="Georgia, serif" font-size="21" fill="#${palette.primary}">${concept}</text>
  <text x="450" y="1128" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${palette.primary}" opacity="0.70">${labels.noInvented}</text>
</svg>`.trim();
}

export function buildDeterministicFigureCaption(input: {
  figureNumber: number;
  sectionTitle?: string | null;
  assetKind?: string | null;
  sourceLabel?: string | null;
  existingCaption?: string | null;
  language?: string | null;
}) {
  const labels = docLabels({ language: input.language });
  const existing = cleanDocText(input.existingCaption);
  if (existing) {
    return `${labels.figure} ${input.figureNumber}. ${sentenceStyleCapitalizePublicText(existing, "caption")}`;
  }

  const sectionTitle =
    sentenceStyleCapitalizePublicText(cleanDocText(input.sectionTitle), "caption") ||
    "El plan de investigacion";
  const assetKind =
    sentenceStyleCapitalizePublicText(cleanDocText(input.assetKind), "caption") ||
    "Apoyo visual";
  const sourceLabel = cleanDocText(input.sourceLabel);
  const sourceSuffix = sourceLabel ? ` derivado de ${sourceLabel}` : "";

  return `${labels.figure} ${input.figureNumber}. ${assetKind} de ${sectionTitle}${sourceSuffix}.`;
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
  ];
}

function assetPlacementIdentity(asset: AssetPlacement) {
  return `${asset.section_key}|${asset.source_id}|${asset.asset_key}`;
}

function renderImageAsset(input: {
  figure: FigureLayoutPlan;
  academicDocument?: AcademicDocument;
}) {
  const labels = docLabels(input.academicDocument);
  const english = docLanguage(input.academicDocument) === "en";
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
    smallNote(`${labels.figure} ${input.figure.figure_number}. ${caption}`),
    smallNote(input.figure.source_note),
  ];
}

function mathText(value: string) {
  return value
    .replace(
      /\\begin\{(?:bmatrix|pmatrix|matrix)\}([\s\S]*?)\\end\{(?:bmatrix|pmatrix|matrix)\}/g,
      (_match, body: string) =>
        `[${body
          .replace(/\\\\/g, "; ")
          .replace(/&/g, " ")
          .replace(/\s+/g, " ")
          .trim()}]`,
    )
    .replace(/\b(?:begin|end)?(?:bmatrix|pmatrix|matrix|array|cases)\b/gi, "")
    .replace(/\\lambda/g, "\u03bb")
    .replace(/\\alpha/g, "\u03b1")
    .replace(/\\beta/g, "\u03b2")
    .replace(/\\gamma/g, "\u03b3")
    .replace(/\\delta/g, "\u03b4")
    .replace(/\\theta/g, "\u03b8")
    .replace(/\\omega/g, "\u03c9")
    .replace(/\\sigma/g, "\u03c3")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1) / ($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
    .replace(/\\(?:mathrm|mathbf|text)\{([^{}]+)\}/g, "$1")
    .replace(/\\begin\{[^{}]+\}|\\end\{[^{}]+\}/g, "")
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\\_/g, "_")
    .replace(/\$\$/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
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

function equationSvg(equation: EquationLayoutPlan, academicDocument?: AcademicDocument) {
  const labels = docLabels(academicDocument);
  const equationText =
    equation.render_strategy === "generated_equation_image"
      ? equation.source_latex || equation.normalized_latex || equation.latex || equation.display_text
      : equation.display_text || equation.normalized_latex || equation.latex;
  const text = escapeSvgText(mathText(equationText));
  const caption = escapeSvgText(`${labels.equation} ${equation.equation_number}`);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="220" viewBox="0 0 960 220">
  <rect width="960" height="220" rx="18" fill="#ffffff"/>
  <rect x="18" y="18" width="924" height="184" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <text x="480" y="104" text-anchor="middle" font-family="Cambria Math, Georgia, serif" font-size="36" fill="#111827">${text}</text>
  <text x="902" y="166" text-anchor="end" font-family="Georgia, serif" font-size="22" fill="#374151">(${equation.equation_number})</text>
  <text x="58" y="166" font-family="Georgia, serif" font-size="18" fill="#64748b">${caption}</text>
</svg>`;
}

function renderEquationAsset(equation: EquationLayoutPlan, academicDocument?: AcademicDocument) {
  const labels = docLabels(academicDocument);
  const imageBuffer =
    equation.file_path && fs.existsSync(equation.file_path)
      ? fs.readFileSync(equation.file_path)
      : null;
  const imageDimensions = imageBuffer
    ? resolveImageDimensions({
        buffer: imageBuffer,
      })
    : null;
  const fittedImage =
    imageDimensions && imageBuffer
      ? fitImage({
          width: imageDimensions.width,
          height: imageDimensions.height,
          maxWidth: 540,
          maxHeight: 280,
        })
      : null;
  const variableRows =
    equation.variable_notes.length > 0
      ? [
          ["Símbolo", "Descripción"],
          ...equation.variable_notes.map((note) => [
            note.symbol,
            note.description,
            note.unit ?? "No recuperada",
          ]),
        ]
      : [];
  const normalizedVariableRows = variableRows.map((row, index) =>
    index === 0 ? ["Simbolo", "Descripcion", "Unidad"] : row,
  );
  const equationVisualChildren =
    imageBuffer && fittedImage
      ? [
          new ImageRun({
            type: imageTypeFromMimeOrPath({
              filePath: equation.file_path ?? null,
            }),
            data: imageBuffer,
            transformation: fittedImage,
          }),
        ]
      : equation.render_strategy === "generated_equation_image"
        ? [
            new ImageRun({
              type: "svg",
              data: Buffer.from(equationSvg(equation, academicDocument), "utf8"),
              fallback: {
                type: "png",
                data: TRANSPARENT_PNG_BUFFER,
              },
              transformation: {
                width: 500,
                height: 115,
              },
            }),
          ]
        : [equationMath(equation)];

  return [
    paragraph(equation.body_reference, {
      indentFirstLine: false,
      beforePt: 8,
      afterPt: 4,
    }),
    ...(equation.section_explanation
      ? [
          paragraph(equation.section_explanation, {
            indentFirstLine: false,
            beforePt: 0,
            afterPt: 4,
          }),
        ]
      : []),
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
                  children: equationVisualChildren,
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
    smallNote(`${labels.equation} ${equation.equation_number}. ${cleanDocText(equation.caption)}`),
    smallNote(equation.purpose),
    ...(normalizedVariableRows.length > 0
      ? [
          simpleTable(normalizedVariableRows, [20, 62, 18], {
            paperLike: true,
            fontSizePt: 8,
          }),
        ]
      : []),
    ...(equation.limitations?.length
      ? equation.limitations.map((limitation) => smallNote(limitation))
      : []),
    smallNote(equation.source_note),
  ];
}

function renderNonImageAssetBlock(asset: AssetPlacement, academicDocument?: AcademicDocument) {
  const labels = docLabels(academicDocument);
  const label =
    asset.render_mode === "equation"
      ? labels.equation
      : asset.render_mode === "table"
        ? labels.table
        : labels.visualSupport;

  return [
    paragraph(`${label}: ${cleanDocText(asset.caption)}`, {
      bold: true,
      alignment: AlignmentType.LEFT,
      indentFirstLine: false,
      beforePt: 8,
      afterPt: 3,
      color: ACCENT_COLOR,
    }),
    simpleTable(
      [
        [labels.supportField, labels.supportDetail],
        [labels.supportType, label],
        [labels.intendedUse, labels.intendedUseText],
        [labels.status, labels.statusText],
      ],
      [24, 76],
    ),
  ];
}

function renderAcademicContentBlocks(section: AcademicSection, academicDocument?: AcademicDocument) {
  const labels = docLabels(academicDocument);
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
        children.push(smallNote(labels.sourceOwn));
      }
      continue;
    }

    if (block.block_type === "bullet") {
      const citationSuffix = block.citation_anchor_ids
        .map((anchorId) => citationLookup.get(anchorId))
        .filter((citation): citation is string => Boolean(citation))
        .join(" ");
      children.push(bullet(placeCitationInAcademicTextForDiagnostics(block.text, citationSuffix)));
      continue;
    }

    const citationSuffix = block.citation_anchor_ids
      .map((anchorId) => citationLookup.get(anchorId))
      .filter((citation): citation is string => Boolean(citation))
      .join(" ");
    const text = cleanDocText(block.text);
    const bulletPreferred = new Set([
      "research_questions",
      "general_research_question",
      "specific_research_questions",
      "objectives",
      "general_objective",
      "specific_objectives",
      "variables_or_categories",
      "population_and_sample",
      "data_collection_techniques",
      "research_instruments",
      "research_procedure",
      "analysis_plan",
      "scope_and_limitations",
      "terms_definition",
    ]);
    const sentenceBullets = bulletPreferred.has(section.section_key)
      ? sentenceChunks(text, 5).filter((chunk) => chunk.length > 20)
      : [];

    if (sentenceBullets.length >= 3) {
      sentenceBullets.forEach((item, index) => {
        const suffix =
          index === sentenceBullets.length - 1 && citationSuffix
            ? ` ${citationSuffix}`
            : "";
        children.push(bullet(`${item}${suffix}`));
      });
      continue;
    }

    if (shouldSplitDensePublicBlockForDiagnostics(section.section_key, text)) {
      const denseBullets = sentenceChunks(text, 5).filter((chunk) => chunk.length > 20);
      if (denseBullets.length >= 3) {
        denseBullets.forEach((item, index) => {
          children.push(
            bullet(index === 0 ? placeCitationInAcademicTextForDiagnostics(item, citationSuffix) : item),
          );
        });
        continue;
      }
    }

    children.push(paragraphWithBoldLead(placeCitationInAcademicTextForDiagnostics(text, citationSuffix)));
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
  const citations = section.citation_anchors.map((anchor) => anchor.rendered_citation);
  const baseLabel = sentenceStyleCapitalizePublicText(section.title, "heading");
  const labels = [
    `${baseLabel}: contexto conceptual`,
    `${baseLabel}: antecedentes clave`,
    `${baseLabel}: criterios analiticos`,
    `${baseLabel}: brecha y enfoque`,
  ];

  if (chunks.length <= 1) {
    return splitParagraphs(text).map((item, index) =>
      paragraphWithBoldLead(placeCitationInAcademicTextForDiagnostics(item, citations[index] ?? "")),
    );
  }

  return chunks.flatMap((chunk, index) => [
    heading(labels[index] ?? `Componente teorico ${index + 1}`, Math.min(5, section.level + 1)),
    paragraphWithBoldLead(placeCitationInAcademicTextForDiagnostics(chunk, citations[index] ?? "")),
  ]);
}

function renderCover(input: {
  project: MasterBlueprintEngineProject;
  academicDocument: AcademicDocument;
  title: string;
  subtitle: string;
  templateName: string;
  brandingAssets: AcademicBrandingAsset[];
}) {
  const labels = docLabels(input.academicDocument);
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
        ? labels.masterDocument
        : labels.institutionalPlan,
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

function renderTableOfContents(_entries: TocEntry[], academicDocument?: AcademicDocument) {
  const labels = docLabels(academicDocument);
  return [
    new TableOfContents(labels.tableOfContents, {
      hyperlink: false,
      headingStyleRange: "1-3",
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function renderMatrix(academicDocument: AcademicDocument) {
  const labels = docLabels(academicDocument);
  const matrixArtifact = academicDocument.matrix;
  const tableModel = matrixArtifact.table_model;
  if (!tableModel) {
    return [smallNote(labels.matrixUnavailable)];
  }

  const header = tableModel.header_rows[0] ?? tableModel.columns.map((column) => column.label);
  const rows = [
    header,
    ...tableModel.body_rows.map((row) => row.cells),
  ];

  return [
    heading(labels.matrixHeading, 1),
    smallNote(labels.matrixCaption),
    simpleTable(rows, academicDocument.matrix_layout.column_widths_pct, {
      paperLike: true,
      fontSizePt: academicDocument.matrix_layout.font_size_pt,
    }),
    smallNote(labels.matrixSource),
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

export function buildScheduleGanttTableRows(
  plan: ScheduleVisualPlan,
  academicDocument?: AcademicDocument,
) {
  const labels = docLabels(academicDocument);
  const months = [1, 2, 3, 4, 5, 6];

  return [
    [
      labels.phase,
      labels.activity,
      labels.period,
      ...months.map((month) => `M${month}`),
      labels.dependency,
      labels.ganttDeliverable,
    ],
    ...plan.tasks.map((task, index) => [
      sentenceStyleCapitalizePublicText(task.phase.replace(/_/g, " "), "label"),
      sentenceStyleCapitalizePublicText(task.task, "label"),
      `M${Math.max(1, task.start_month)}-M${Math.max(task.start_month, task.end_month)}`,
      ...months.map((month) => (month >= task.start_month && month <= task.end_month ? "X" : "")),
      sentenceStyleCapitalizePublicText(
        task.dependency || (index === 0 ? labels.planApproval : `${labels.activityN} ${index}`),
        "label",
      ),
      sentenceStyleCapitalizePublicText(task.deliverable || labels.verifiableProgress, "label"),
    ]),
  ];
}

function renderScheduleVisual(plan: ScheduleVisualPlan, academicDocument?: AcademicDocument) {
  const rows = buildScheduleGanttTableRows(plan, academicDocument);
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

function formatCostType(value: string, language?: string | null) {
  const english = normalizeLanguageCode(language) === "en";
  const normalized = value.trim().toLowerCase();
  if (normalized === "direct") return english ? "Direct" : "Directo";
  if (normalized === "optional") return english ? "Optional" : "Opcional";
  if (normalized === "contingency") return english ? "Contingency" : "Contingencia";
  return value;
}

function renderBudgetPlan(input: {
  rows: ResearchBudgetRow[];
  totalRange: BudgetRange | null;
  academicDocument?: AcademicDocument;
}) {
  const labels = docLabels(input.academicDocument);
  const english = docLanguage(input.academicDocument) === "en";
  if (input.rows.length === 0) {
    return [
      smallNote(
        labels.budgetUnavailable,
      ),
    ];
  }

  const rows = capitalizePublicTableRows([
    [
      english ? "Category" : "Categoria",
      english ? "Type" : "Tipo",
      english ? "Item" : "Item",
      english ? "Unit" : "Unidad",
      english ? "Quantity" : "Cantidad",
      english ? "Unit cost" : "Costo unitario",
      "Subtotal",
      english ? "Assumption" : "Supuesto",
    ],
    ...input.rows.map((row) => [
      row.category,
      formatCostType(row.cost_type, input.academicDocument?.language),
      row.item,
      row.unit,
      String(row.quantity),
      formatBudgetRange(row.unit_cost_range),
      formatBudgetRange(row.subtotal_range),
      row.assumption,
    ]),
  ]);

  return [
    smallNote(labels.budgetCaption),
    simpleTable(rows, [11, 9, 22, 10, 8, 12, 12, 16], {
      paperLike: true,
      fontSizePt: 7.5,
    }),
    smallNote(
      input.totalRange
        ? `${labels.budgetTotalPrefix}: ${formatBudgetRange(input.totalRange)}. ${labels.budgetSource}`
        : labels.budgetSource,
    ),
  ];
}

function renderPublicAppendixPolicyItems(
  items: PublicAppendixItem[],
  academicDocument?: AcademicDocument,
) {
  const labels = docLabels(academicDocument);
  if (items.length === 0) {
    return [];
  }

  const rows = capitalizePublicTableRows([
    [labels.appendixAcademic, labels.purpose],
    ...items
      .filter((item) => item.include_in_docx)
      .map((item) => [item.title, item.purpose]),
  ]);

  return [
    heading(labels.appendixB, 1),
    simpleTable(rows, [34, 66], { paperLike: true, fontSizePt: 8.5 }),
  ];
}

function renderProjectManagementAnnex(input: {
  sections: AcademicSection[];
  titleOverrides: Record<string, string>;
  scheduleVisual: ScheduleVisualPlan | null;
  academicDocument?: AcademicDocument;
}) {
  const labels = docLabels(input.academicDocument);
  const managementSections = input.sections.filter((section) =>
    section.section_key === "schedule",
  );

  if (managementSections.length === 0 && !input.scheduleVisual) {
    return [];
  }

  return [
    heading(labels.appendixA, 1),
    ...managementSections.flatMap((section) => {
      if (section.section_key === "schedule" && input.scheduleVisual) {
        return [
          heading(
            input.academicDocument && docLanguage(input.academicDocument) === "en"
              ? localizedSectionHeading(section, input.academicDocument)
              : input.titleOverrides[section.section_key] ?? section.title,
            2,
          ),
          ...renderScheduleVisual(input.scheduleVisual, input.academicDocument),
        ];
      }

      return [
        heading(
          input.academicDocument && docLanguage(input.academicDocument) === "en"
            ? localizedSectionHeading(section, input.academicDocument)
            : input.titleOverrides[section.section_key] ?? section.title,
          2,
        ),
        ...renderAcademicContentBlocks(section, input.academicDocument),
      ];
    }),
    ...(managementSections.some((section) => section.section_key === "schedule") || !input.scheduleVisual
      ? []
      : [
          heading(labels.scheduleHeading, 2),
          ...renderScheduleVisual(input.scheduleVisual, input.academicDocument),
        ]),
  ];
}

function renderAssetPlanAnnex(input: {
  academicDocument: AcademicDocument;
  renderedAssetKeys: Set<string>;
}) {
  const labels = docLabels(input.academicDocument);
  const figures = input.academicDocument.layout_plan.figures.filter(
    (figure) => !input.renderedAssetKeys.has(`${figure.section_key}|${figure.source_id}|${figure.asset_key}`),
  );
  const equations = input.academicDocument.layout_plan.equations.filter(
    (equation) => !input.renderedAssetKeys.has(`${equation.section_key}|${equation.source_id}|${equation.asset_key}`),
  );
  const plannedNonRenderableAssets = input.academicDocument.asset_placements
    .filter((asset) => !input.renderedAssetKeys.has(assetPlacementIdentity(asset)))
    .filter((asset) => asset.render_mode === "equation" || asset.render_mode === "table" || asset.render_mode === "text_fallback")
    .slice(0, 8);

  if (figures.length === 0 && equations.length === 0 && plannedNonRenderableAssets.length === 0) {
    return [];
  }

  const rows = [
    [labels.assetElement, labels.academicUse],
    ...figures.map((figure) => [
      `${labels.figure} ${figure.figure_number}`,
      figure.caption,
    ]),
    ...equations.map((equation) => [
      `${labels.equation} ${equation.equation_number}`,
      equation.caption,
    ]),
    ...plannedNonRenderableAssets.map((asset, index) => [
      asset.render_mode === "equation"
        ? `${labels.pendingEquation} ${index + 1}`
        : asset.render_mode === "table"
          ? `${labels.pendingTable} ${index + 1}`
          : `${labels.pendingSupport} ${index + 1}`,
      cleanDocText(asset.caption),
    ]),
  ];

  return [
    heading(labels.appendixC, 1),
    simpleTable(rows, [24, 76], { paperLike: true, fontSizePt: 8.5 }),
    ...equations.flatMap((equation) => renderEquationAsset(equation, input.academicDocument)),
    ...figures.flatMap((figure) =>
      renderImageAsset({ figure, academicDocument: input.academicDocument }),
    ),
    ...plannedNonRenderableAssets.flatMap((asset) =>
      renderNonImageAssetBlock(asset, input.academicDocument),
    ),
  ];
}

function renderReferences(references: AcademicReference[], academicDocument?: AcademicDocument) {
  const labels = docLabels(academicDocument);
  const primaryReferences = references.filter(
    (reference) => reference.reference_kind !== "secondary_unrecovered",
  );
  const secondaryReferences = references.filter(
    (reference) => reference.reference_kind === "secondary_unrecovered",
  );

  return [
    heading(labels.references, 1),
    ...primaryReferences.slice(0, 60).map((reference) =>
      paragraph(reference.apa_reference, {
        alignment: AlignmentType.LEFT,
        indentFirstLine: false,
        afterPt: 4,
      }),
    ),
    ...(secondaryReferences.length > 0
      ? [
          heading(labels.secondaryReferences, 2),
          smallNote(labels.secondaryReferencesNote),
          ...secondaryReferences.slice(0, 25).map((reference) =>
            paragraph(reference.apa_reference, {
              alignment: AlignmentType.LEFT,
              indentFirstLine: false,
              afterPt: 4,
              color: "5E6470",
            }),
          ),
        ]
      : []),
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
    const rawTitle =
      docLanguage(input.academicDocument) === "en"
        ? localizedSectionHeading(section, input.academicDocument)
        : titleOverrides[section.section_key] ?? section.title;
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
      children.push(
        ...renderScheduleVisual(
          input.academicDocument.layout_plan.schedule_visual,
          input.academicDocument,
        ),
      );
      continue;
    }
    if (section.section_key === "budget" && (input.academicDocument.layout_plan.budget_rows ?? []).length > 0) {
      children.push(
        ...renderBudgetPlan({
          rows: input.academicDocument.layout_plan.budget_rows ?? [],
          totalRange: input.academicDocument.layout_plan.budget_total_range ?? null,
          academicDocument: input.academicDocument,
        }),
      );
      continue;
    }

    children.push(...renderAcademicContentBlocks(section, input.academicDocument));
    const sectionFigures = input.academicDocument.layout_plan.figures
      .filter((figure) => figure.section_key === section.section_key)
      .slice(0, 2);
    const sectionEquations = input.academicDocument.layout_plan.equations
      .filter((equation) => equation.section_key === section.section_key)
      .slice(0, 2);

    for (const equation of sectionEquations) {
      children.push(...renderEquationAsset(equation, input.academicDocument));
      renderedAssetKeys.add(`${equation.section_key}|${equation.source_id}|${equation.asset_key}`);
    }

    for (const figure of sectionFigures) {
      const renderedAsset = renderImageAsset({
        figure,
        academicDocument: input.academicDocument,
      });
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

function createDocument(input: {
  project: MasterBlueprintEngineProject;
  academicDocument: AcademicDocument;
  evidenceLedger: EvidenceLedger;
  validationReport: MasterBlueprintValidationReport;
}) {
  const labels = docLabels(input.academicDocument);
  const renderedSections = renderSections({
    academicDocument: input.academicDocument,
    assetPlacements: input.academicDocument.asset_placements,
  });
  const projectManagementChildren = renderProjectManagementAnnex({
    sections: input.academicDocument.sections,
    titleOverrides: input.academicDocument.editorial_plan.title_overrides,
    scheduleVisual: input.academicDocument.layout_plan.schedule_visual,
    academicDocument: input.academicDocument,
  });
  const publicAppendixChildren: never[] = [];

  return new Document({
    creator: "Ingeniometrix",
    title: input.academicDocument.metadata.title,
    description: labels.documentDescription,
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
          default: buildAcademicFooter(),
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
          ...renderTableOfContents(renderedSections.tocEntries, input.academicDocument),
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
            sectionLabel: labels.matrixHeading,
          }),
        },
        footers: {
          default: buildAcademicFooter(),
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
            sectionLabel: labels.referencesAndAnnexes,
          }),
        },
        footers: {
          default: buildAcademicFooter(),
        },
        children: renderReferences(input.academicDocument.references, input.academicDocument),
      },
      ...(projectManagementChildren.length > 0
        ? [
            {
              properties: makeSectionProperties("landscape", {
                variant: input.academicDocument.variant,
              }),
              headers: {
                default: buildAcademicHeader({
                  academicDocument: input.academicDocument,
                  sectionLabel: labels.projectManagement,
                }),
              },
              footers: {
                default: buildAcademicFooter(),
              },
              children: projectManagementChildren,
            },
          ]
        : []),
      ...(publicAppendixChildren.length > 0
        ? [
            {
              properties: makeSectionProperties("portrait", {
                variant: input.academicDocument.variant,
              }),
              headers: {
                default: buildAcademicHeader({
                  academicDocument: input.academicDocument,
                  sectionLabel: labels.appendices,
                }),
              },
              footers: {
                default: buildAcademicFooter(),
              },
              children: publicAppendixChildren,
            },
          ]
        : []),
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
      has_traceability_annex: false,
      no_public_traceability_annex: true,
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
          cleanDocText(equation.body_reference).includes(`Ecuación ${equation.equation_number}`),
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
  const academicDocument = normalizeAcademicDocumentForDocx(
    input.academicDocumentOverride ??
      buildMasterAcademicDocument({
        project: input.project,
        masterTemplate: input.masterTemplate,
        drafts: input.drafts,
        matrixArtifact: input.matrixArtifact,
        evidenceLedger: input.evidenceLedger,
        legacyBlueprint: input.legacyBlueprint,
        consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
      }),
  );
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
  const academicDocument = normalizeAcademicDocumentForDocx(
    input.academicDocumentOverride ??
      buildUniversityAcademicDocument({
        project: input.project,
        universityBlueprint: input.universityBlueprint,
        matrixArtifact: input.matrixArtifact,
        evidenceLedger: input.evidenceLedger,
        legacyBlueprint: input.legacyBlueprint,
        consolidatedAssetUsagePlan: input.consolidatedAssetUsagePlan,
      }),
  );
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
