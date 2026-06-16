import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import { loadMasterTemplateRuntime } from "@/server/reporting/template-runtime/master-template";
import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import type {
  EffectiveTemplateElementRules,
  TemplateCandidateSection,
} from "@/server/reporting/template-ingestion-types";

export type MasterTemplatePlaygroundSection = {
  id: string;
  title: string;
  level: number;
  required: boolean;
  contentKind: string;
  purpose: string | null;
};

export type MasterTemplatePlaygroundSnapshot = {
  source: "system" | "fallback";
  templateName: string;
  templateKey: string;
  versionLabel: string;
  methodologyMode: string;
  citationStyle: string;
  sectionCount: number;
  requiredSectionCount: number;
  coverFieldCount: number;
  format: {
    paperSize: string;
    marginsCm: string;
    fontFamily: string;
    fontSizePt: number;
    lineSpacing: number;
    paragraphAlignment: string;
    titleNumbering: string;
    citationInlineStyle: string;
    referenceOrdering: string;
    tableCaptionPosition: string;
    figureCaptionPosition: string;
  };
  sections: MasterTemplatePlaygroundSection[];
  notes: string[];
};

function flattenSections(
  sections: TemplateCandidateSection[],
): MasterTemplatePlaygroundSection[] {
  return sections.flatMap((section) => [
    {
      id: section.id,
      title: section.title,
      level: section.level,
      required: section.required,
      contentKind: section.content_kind,
      purpose: section.guidance?.purpose?.trim() ?? null,
    },
    ...(section.children ? flattenSections(section.children) : []),
  ]);
}

function formatAlignment(value: string) {
  switch (value) {
    case "justify":
      return "Justificado";
    case "center":
      return "Centrado";
    case "left":
    default:
      return "Izquierda";
  }
}

function formatTitleNumbering(rules: EffectiveTemplateElementRules["titles"]) {
  const numberedLevels = rules
    .filter((rule) => rule.numbered)
    .map((rule) => `H${rule.level}`)
    .join(", ");

  return numberedLevels.length > 0 ? numberedLevels : "Sin numeracion";
}

function buildSnapshotFromRuntime(
  runtime: LoadedTemplateVersionRuntime,
): MasterTemplatePlaygroundSnapshot {
  const sections = flattenSections(runtime.templateCandidate.sections);
  const requiredSectionCount = sections.filter((section) => section.required).length;
  const formatRules = runtime.effectiveElementRules;

  return {
    source: "system",
    templateName: runtime.templateName,
    templateKey: runtime.templateKey,
    versionLabel: `v${runtime.versionNumber}`,
    methodologyMode: runtime.methodologyMode ?? "unknown",
    citationStyle: runtime.citationStyle ?? "UNKNOWN",
    sectionCount: sections.length,
    requiredSectionCount,
    coverFieldCount: runtime.templateCandidate.cover_template.fields.length,
    format: {
      paperSize: formatRules.page.paper_size,
      marginsCm: `${formatRules.page.margin_left_cm}/${formatRules.page.margin_right_cm}/${formatRules.page.margin_top_cm}/${formatRules.page.margin_bottom_cm}`,
      fontFamily: formatRules.paragraph.font_family,
      fontSizePt: formatRules.paragraph.font_size_pt,
      lineSpacing: formatRules.paragraph.line_spacing,
      paragraphAlignment: formatAlignment(formatRules.paragraph.alignment),
      titleNumbering: formatTitleNumbering(formatRules.titles),
      citationInlineStyle: formatRules.citation.inline_style,
      referenceOrdering: formatRules.reference_list.ordering,
      tableCaptionPosition: formatRules.table.caption_position,
      figureCaptionPosition: formatRules.figure.caption_position,
    },
    sections,
    notes: [
      ...runtime.runtimeWarnings,
      "Snapshot cargado desde el master template real del sistema.",
    ],
  };
}

function buildFallbackSnapshot(): MasterTemplatePlaygroundSnapshot {
  const sections: MasterTemplatePlaygroundSection[] = [
    {
      id: "cover",
      title: "Portada institucional",
      level: 1,
      required: true,
      contentKind: "rich_text",
      purpose: "Presentar identidad institucional, titulo y datos formales del trabajo.",
    },
    {
      id: "problem_statement",
      title: "Planteamiento del problema",
      level: 1,
      required: true,
      contentKind: "rich_text",
      purpose: "Definir el problema, contexto y delimitacion del estudio.",
    },
    {
      id: "objectives",
      title: "Objetivos",
      level: 1,
      required: true,
      contentKind: "numbered_list",
      purpose: "Declarar objetivo general y objetivos especificos.",
    },
    {
      id: "justification",
      title: "Justificacion",
      level: 1,
      required: true,
      contentKind: "rich_text",
      purpose: "Sustentar relevancia teorica, practica y metodologica.",
    },
    {
      id: "theoretical_framework",
      title: "Marco teorico y antecedentes",
      level: 1,
      required: true,
      contentKind: "mixed",
      purpose: "Organizar antecedentes, conceptos y vacios relevantes.",
    },
    {
      id: "hypothesis",
      title: "Hipotesis o preguntas directrices",
      level: 1,
      required: true,
      contentKind: "numbered_list",
      purpose: "Formular supuestos o preguntas alineadas a los objetivos.",
    },
    {
      id: "methodology",
      title: "Metodologia",
      level: 1,
      required: true,
      contentKind: "mixed",
      purpose: "Definir enfoque, diseno, poblacion, muestra, tecnicas e instrumentos.",
    },
    {
      id: "consistency_matrix",
      title: "Matriz de consistencia",
      level: 1,
      required: true,
      contentKind: "table",
      purpose: "Alinear problema, objetivos, hipotesis, variables y tecnicas.",
    },
    {
      id: "schedule",
      title: "Cronograma",
      level: 1,
      required: true,
      contentKind: "table",
      purpose: "Ordenar fases y tiempos del trabajo.",
    },
    {
      id: "references",
      title: "Referencias",
      level: 1,
      required: true,
      contentKind: "references",
      purpose: "Listar solo fuentes citadas con trazabilidad bibliografica.",
    },
  ];

  return {
    source: "fallback",
    templateName: "Master Template LATAM",
    templateKey: "MASTER_TEMPLATE_LATAM",
    versionLabel: "fallback-local",
    methodologyMode: "mixed",
    citationStyle: "APA7",
    sectionCount: sections.length,
    requiredSectionCount: sections.filter((section) => section.required).length,
    coverFieldCount: 8,
    format: {
      paperSize: "A4",
      marginsCm: "3/2.5/2.5/2.5",
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 1.5,
      paragraphAlignment: "Justificado",
      titleNumbering: "H1, H2, H3",
      citationInlineStyle: "author_year",
      referenceOrdering: "alphabetical",
      tableCaptionPosition: "top",
      figureCaptionPosition: "bottom",
    },
    sections,
    notes: [
      "No se pudo leer el master template real desde la base local.",
      "Se muestra un resumen fallback para mantener operativo el playground.",
    ],
  };
}

export async function getMasterTemplatePlaygroundSnapshot() {
  try {
    const runtime = await loadMasterTemplateRuntime();
    return buildSnapshotFromRuntime(runtime);
  } catch {
    return buildFallbackSnapshot();
  }
}

export async function buildMasterTemplatePlaygroundDocxBuffer() {
  const snapshot = await getMasterTemplatePlaygroundSnapshot();

  const doc = new Document({
    creator: "Ingeniometrix",
    title: `${snapshot.templateName} - Resumen`,
    description: "Resumen DOCX del master template usado en Blueprint Launch.",
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun(`${snapshot.templateName}`)],
          }),
          new Paragraph({
            children: [
              new TextRun(`Template key: ${snapshot.templateKey} | Version: ${snapshot.versionLabel}`),
            ],
          }),
          new Paragraph({
            children: [new TextRun(`Origen del snapshot: ${snapshot.source}`)],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Formato base")],
          }),
          new Paragraph({ text: `Papel: ${snapshot.format.paperSize}` }),
          new Paragraph({ text: `Margenes (izq/der/sup/inf cm): ${snapshot.format.marginsCm}` }),
          new Paragraph({ text: `Fuente: ${snapshot.format.fontFamily} ${snapshot.format.fontSizePt} pt` }),
          new Paragraph({ text: `Interlineado: ${snapshot.format.lineSpacing}` }),
          new Paragraph({ text: `Alineacion de parrafo: ${snapshot.format.paragraphAlignment}` }),
          new Paragraph({ text: `Numeracion de titulos: ${snapshot.format.titleNumbering}` }),
          new Paragraph({ text: `Citas en linea: ${snapshot.format.citationInlineStyle}` }),
          new Paragraph({ text: `Orden de referencias: ${snapshot.format.referenceOrdering}` }),
          new Paragraph({ text: `Leyenda de tablas: ${snapshot.format.tableCaptionPosition}` }),
          new Paragraph({ text: `Leyenda de figuras: ${snapshot.format.figureCaptionPosition}` }),
          new Paragraph({ text: "" }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Secciones")],
          }),
          ...snapshot.sections.map(
            (section) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [
                  new TextRun(
                    `L${section.level} | ${section.required ? "Obligatoria" : "Opcional"} | ${section.title} | ${section.contentKind}`,
                  ),
                ],
              }),
          ),
          new Paragraph({ text: "" }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Notas")],
          }),
          ...snapshot.notes.map(
            (note) =>
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun(note)],
              }),
          ),
        ],
      },
    ],
  });

  return {
    snapshot,
    buffer: await Packer.toBuffer(doc),
  };
}
