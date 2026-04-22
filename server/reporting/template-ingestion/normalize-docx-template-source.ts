import type {
  ExtractedDocxParagraph,
  ExtractedDocxSourceInput,
  NormalizedBlock,
  NormalizedListItem,
  NormalizedTemplateSourceDocument,
  TemplateDocumentKind,
} from "@/server/reporting/template-ingestion-types";
import { normalizeTemplateAssets } from "@/server/reporting/template-ingestion/normalize-template-assets";

const SEMANTIC_KEY_BY_LABEL: Record<string, string> = {
  "DATOS GENERALES": "general_data",
  "TITULO TENTATIVO": "project_title",
  "AREAS DE INVESTIGACION": "research_areas",
  "LINEA DE INVESTIGACION": "research_line",
  AUTOR: "student_name",
  ASESOR: "advisors",
  "LUGAR DONDE SE REALIZARA LA INVESTIGACION": "research_location",
  "EL PROBLEMA DE INVESTIGACION": "research_problem",
  "PLANTEAMIENTO DEL PROBLEMA": "problem_statement",
  "FORMULACION DEL PROBLEMA": "research_questions",
  "FORMULACION DEL PROBLEMA PRINCIPAL": "main_research_question",
  "FORMULACION DE LOS PROBLEMAS ESPECIFICOS": "specific_research_questions",
  "JUSTIFICACION DEL PROBLEMA": "justification",
  OBJETIVOS: "objectives",
  "OBJETIVOS GENERAL": "general_objective",
  "OBJETIVO GENERAL": "general_objective",
  "OBJETIVOS ESPECIFICOS": "specific_objectives",
  HIPOTESIS: "hypotheses",
  "HIPOTESIS GENERAL": "general_hypothesis",
  "HIPOTESIS ESPECIFICOS": "specific_hypotheses",
  "HIPOTESIS ESPECIFICAS": "specific_hypotheses",
  "VARIABLES E INDICADORES": "variables_indicators",
  "IDENTIFICACION DE LA VARIABLE": "variable_identification",
  INDICADORES: "indicators",
  "MARCO TEORICO": "theoretical_framework",
  "ANTECEDENTES DEL PROBLEMA": "problem_background",
  "ANTECEDENTES A NIVEL INTERNACIONAL": "international_background",
  "ANTECEDENTES A NIVEL NACIONAL": "national_background",
  "BASES TEORICAS": "theoretical_bases",
  "BASES TEORICO CIENTIFICAS": "scientific_theoretical_bases",
  METODOLOGIA: "methodology",
  "MATRIZ DE CONSISTENCIA": "consistency_matrix",
  CRONOGRAMA: "schedule",
  PRESUPUESTO: "budget",
  REFERENCIAS: "references",
  ANEXOS: "annexes",
};

const INDEX_SECTION_TITLES = new Set(["INDICE DE TABLAS", "INDICE DE FIGURAS", "INDICE DE ANEXOS"]);
const LIST_STYLE_NAMES = new Set(["List Paragraph"]);

type HeadingMatch = {
  label: string;
  level: number;
};

function repairCommonMojibake(value: string) {
  if (!/[ÃÂâ€]/.test(value)) {
    return value;
  }

  const repaired = Buffer.from(value, "latin1").toString("utf8");
  return repaired.includes("\ufffd") ? value : repaired;
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLabelKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizedIncludes(value: string | null | undefined, pattern: string) {
  return normalizeLabelKey(value ?? "").includes(normalizeLabelKey(pattern));
}

function firstMatchingLine(lines: string[], predicate: (line: string) => boolean) {
  return lines.find((line) => predicate(line)) ?? null;
}

function detectDocumentKind(
  firstParagraphsText: string,
  hint?: TemplateDocumentKind,
): TemplateDocumentKind {
  if (hint && hint !== "unknown") {
    return hint;
  }

  const normalizedText = normalizeLabelKey(firstParagraphsText);

  if (
    normalizedText.includes("PROYECTO DE INVESTIGACION") ||
    normalizedText.includes("PROYECTO DE TESIS") ||
    normalizedText.includes("PLAN DE TESIS")
  ) {
    return "thesis_plan_instance";
  }

  if (
    normalizedText.includes("GUIA") ||
    normalizedText.includes("MANUAL") ||
    normalizedText.includes("FORMATO")
  ) {
    return "template_guide";
  }

  if (normalizedText.includes("TESIS")) {
    return "thesis_final_instance";
  }

  return "unknown";
}

function resolveSemanticKey(label: string) {
  return SEMANTIC_KEY_BY_LABEL[normalizeLabelKey(label)] ?? null;
}

function isHeadingStyle(styleName: string | null | undefined) {
  return /^heading\s+[1-5]$/i.test(styleName ?? "");
}

function headingLevelFromStyle(styleName: string | null | undefined) {
  const match = (styleName ?? "").match(/^heading\s+([1-5])$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function isIndexParagraph(paragraph: ExtractedDocxParagraph) {
  const normalized = normalizeLabelKey(paragraph.text);
  return normalized.length > 0 && INDEX_SECTION_TITLES.has(normalized);
}

function isTableOfFiguresParagraph(paragraph: ExtractedDocxParagraph) {
  return (paragraph.style_name ?? "").toLowerCase() === "table of figures";
}

function looksLikeStandaloneHeading(text: string) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0 || normalized.length > 120) {
    return false;
  }

  return normalized === normalized.toUpperCase();
}

function detectHeading(paragraph: ExtractedDocxParagraph): HeadingMatch | null {
  const styleLevel = headingLevelFromStyle(paragraph.style_name);
  if (styleLevel) {
    return {
      label: paragraph.text.trim(),
      level: styleLevel,
    };
  }

  if (looksLikeStandaloneHeading(paragraph.text) && resolveSemanticKey(paragraph.text)) {
    return {
      label: paragraph.text.trim(),
      level: 2,
    };
  }

  return null;
}

function parseListItems(paragraphs: ExtractedDocxParagraph[]): NormalizedListItem[] {
  return paragraphs
    .filter(
      (paragraph) =>
        LIST_STYLE_NAMES.has(paragraph.style_name ?? "") ||
        paragraph.num_id !== null ||
        /^[\u2022\u25AA\u25E6-]\s+/u.test(paragraph.text),
    )
    .map((paragraph, index) => ({
      text: paragraph.text.replace(/^[\u2022\u25AA\u25E6-]\s+/u, "").trim(),
      ordinal: index + 1,
    }));
}

function extractMention(programLine: string | null) {
  if (!programLine) {
    return null;
  }

  const mentionMatch = programLine.match(/CON\s+MENCI[OÓ]N\s+EN\s+(.+)$/i);
  return mentionMatch?.[1]?.trim() ?? null;
}

function extractDegreeLevel(lines: string[], programLine: string | null) {
  const normalizedProgramLine = normalizeLabelKey(programLine ?? "");
  const normalizedLines = lines.map((line) => normalizeLabelKey(line));

  if (
    normalizedProgramLine.includes("MAESTRIA") ||
    normalizedLines.some((line) => line.includes("MAESTRIA"))
  ) {
    return "MAESTRIA";
  }

  if (
    normalizedProgramLine.includes("DOCTORADO") ||
    normalizedLines.some((line) => line.includes("DOCTORADO"))
  ) {
    return "DOCTORADO";
  }

  if (normalizedLines.some((line) => line.includes("POSGRADO"))) {
    return "POSGRADO";
  }

  return null;
}

function extractDisciplineArea(programLine: string | null) {
  if (!programLine) {
    return null;
  }

  return programLine
    .replace(/^MAESTR[IÍ]A EN\s+/i, "")
    .replace(/^DOCTORADO EN\s+/i, "")
    .replace(/\s+CON MENCI[OÓ]N EN\s+.*$/i, "")
    .trim();
}

function inferInstitutionFromCover(paragraphs: ExtractedDocxParagraph[]) {
  const lines = paragraphs.map((paragraph) => paragraph.text.trim()).filter(Boolean);
  const universityLine =
    firstMatchingLine(lines, (line) => normalizedIncludes(line, "UNIVERSIDAD")) ??
    lines[0] ??
    null;
  const schoolLine =
    firstMatchingLine(
      lines,
      (line) =>
        normalizedIncludes(line, "ESCUELA") ||
        normalizedIncludes(line, "FACULTAD") ||
        normalizedIncludes(line, "POSGRADO"),
    ) ?? null;
  const programLine =
    firstMatchingLine(
      lines,
      (line) =>
        !normalizedIncludes(line, "GRADO ACADEMICO") &&
        (normalizedIncludes(line, "MAESTRIA") ||
          normalizedIncludes(line, "DOCTORADO") ||
          normalizedIncludes(line, "SEGUNDA ESPECIALIDAD")),
    ) ?? null;
  const documentLabel =
    firstMatchingLine(
      lines,
      (line) =>
        normalizedIncludes(line, "PROYECTO DE INVESTIGACION") ||
        normalizedIncludes(line, "PROYECTO DE TESIS") ||
        normalizedIncludes(line, "PLAN DE TESIS") ||
        normalizeLabelKey(line) === "TESIS",
    ) ?? null;
  const dateLine = lines[lines.length - 1] ?? null;

  return {
    university_name: universityLine,
    school_name: schoolLine,
    program_name: programLine,
    mention: extractMention(programLine),
    degree_level: extractDegreeLevel(lines, programLine),
    discipline_area: extractDisciplineArea(programLine),
    document_label: documentLabel,
    date_label: dateLine,
  };
}

function collectCoverRoleValues(paragraphs: ExtractedDocxParagraph[], rolePatterns: RegExp[]) {
  const values: string[] = [];

  for (let index = 0; index < paragraphs.length; index += 1) {
    const text = paragraphs[index].text.trim();
    if (!rolePatterns.some((pattern) => pattern.test(text))) {
      continue;
    }

    const nextParagraph = paragraphs[index + 1];
    if (nextParagraph?.text) {
      values.push(nextParagraph.text.trim());
    }
  }

  return values;
}

function classifyBlockType(
  semanticKey: string | null,
  level: number,
  paragraphs: ExtractedDocxParagraph[],
) {
  if (semanticKey === "references") {
    return "references" as const;
  }

  if (
    semanticKey === "student_name" ||
    semanticKey === "advisors" ||
    semanticKey === "research_line" ||
    semanticKey === "research_areas" ||
    semanticKey === "research_location"
  ) {
    return "field" as const;
  }

  if (
    paragraphs.some((paragraph) => /^Tabla\s+\d+/i.test(paragraph.text)) &&
    (semanticKey === "schedule" || semanticKey === "budget" || semanticKey === "consistency_matrix")
  ) {
    return "table" as const;
  }

  if (level > 1) {
    return "subsection" as const;
  }

  return "section" as const;
}

function collectBodyParagraphs(paragraphs: ExtractedDocxParagraph[]) {
  const bodyStartIndex = paragraphs.findIndex(
    (paragraph) =>
      isHeadingStyle(paragraph.style_name) || resolveSemanticKey(paragraph.text) === "general_data",
  );

  return bodyStartIndex >= 0 ? paragraphs.slice(bodyStartIndex) : paragraphs;
}

export function normalizeDocxTemplateSource(
  input: ExtractedDocxSourceInput,
): NormalizedTemplateSourceDocument {
  if (input.paragraphs.length === 0) {
    throw new Error("La fuente DOCX no contiene parrafos.");
  }

  const repairedParagraphs = input.paragraphs.map((paragraph) => ({
    ...paragraph,
    text: repairCommonMojibake(paragraph.text),
  }));

  const bodyParagraphs = collectBodyParagraphs(repairedParagraphs).filter(
    (paragraph) => !isIndexParagraph(paragraph) && !isTableOfFiguresParagraph(paragraph),
  );
  const coverParagraphs = repairedParagraphs.slice(
    0,
    Math.max(0, repairedParagraphs.indexOf(bodyParagraphs[0])),
  );
  const coverInfo = inferInstitutionFromCover(coverParagraphs);
  const assetResult = normalizeTemplateAssets({
    providedAssets: input.provided_assets,
    wantsCoverLogo: true,
  });
  const documentKind = detectDocumentKind(
    repairedParagraphs
      .slice(0, 20)
      .map((paragraph) => paragraph.text)
      .join("\n"),
    input.document_kind_hint,
  );

  const blocks: NormalizedBlock[] = [];
  let currentHeading: HeadingMatch | null = null;
  let currentParagraphs: ExtractedDocxParagraph[] = [];

  function flushCurrentBlock() {
    if (!currentHeading) {
      return;
    }

    const semanticKey = resolveSemanticKey(currentHeading.label);
    const rawText = normalizeWhitespace(currentParagraphs.map((paragraph) => paragraph.text).join("\n"));
    const listItems = parseListItems(currentParagraphs);
    const hasTableCaption = currentParagraphs.some((paragraph) => /^Tabla\s+\d+/i.test(paragraph.text));

    blocks.push({
      id: `block-${blocks.length + 1}`,
      type: classifyBlockType(semanticKey, currentHeading.level, currentParagraphs),
      label: currentHeading.label,
      ordinal: null,
      level: currentHeading.level,
      semantic_key: semanticKey,
      raw_text: rawText,
      normalized_text: rawText || null,
      items: listItems.length > 0 ? listItems : undefined,
      table: hasTableCaption
        ? {
            caption: currentParagraphs.find((paragraph) => /^Tabla\s+\d+/i.test(paragraph.text))?.text ?? null,
            rows: currentParagraphs.map((paragraph) => ({
              cells: [{ text: paragraph.text }],
            })),
          }
        : undefined,
      references:
        semanticKey === "references"
          ? currentParagraphs.map((paragraph) => ({
              raw_text: paragraph.text,
            }))
          : undefined,
      page_span: {
        start_page: 1,
        end_page: 1,
      },
      confidence: semanticKey ? 0.95 : 0.75,
    });
  }

  for (const paragraph of bodyParagraphs) {
    const heading = detectHeading(paragraph);
    if (heading) {
      flushCurrentBlock();
      currentHeading = heading;
      currentParagraphs = [];
      continue;
    }

    if (currentHeading) {
      currentParagraphs.push(paragraph);
    }
  }

  flushCurrentBlock();

  const institution = {
    university_name: coverInfo.university_name ?? "Universidad no identificada",
    school_name: coverInfo.school_name ?? null,
    program_name: coverInfo.program_name ?? null,
    mention: coverInfo.mention ?? null,
    degree_level: coverInfo.degree_level ?? null,
    discipline_area: coverInfo.discipline_area ?? null,
    confidence: 0.8,
  };

  const warnings = [...assetResult.warnings];
  warnings.push(
    "La normalizacion DOCX usa estilos de Word y heuristicas de headings; conviene revisar manualmente secciones con estilo 'List Paragraph' que pueden representar subtitulos o listas.",
  );

  if (repairedParagraphs.some(isTableOfFiguresParagraph)) {
    warnings.push(
      "Se omitieron indices automaticos de tablas, figuras o anexos del DOCX para evitar que se confundan con el cuerpo de la plantilla.",
    );
  }

  return {
    source_id: input.source_id,
    source_type: "docx",
    document_kind: documentKind,
    language: input.language?.trim() || "es-PE",
    institution,
    assets: assetResult.assets,
    cover: {
      raw_text: coverParagraphs.map((paragraph) => paragraph.text).join("\n").trim(),
      university_name: coverInfo.university_name,
      school_name: coverInfo.school_name,
      program_name: coverInfo.program_name,
      document_label: coverInfo.document_label,
      author_lines: collectCoverRoleValues(coverParagraphs, [
        /^Presentado por:?$/i,
        /^Autor(?:es)?:?$/i,
      ]),
      advisor_lines: collectCoverRoleValues(coverParagraphs, [/^Asesor(?: de tesis)?(?:es)?:?$/i]),
      place_label: coverInfo.date_label,
      date_label: coverInfo.date_label,
      logo_asset_key: assetResult.logoAssetKey,
      page_span: {
        start_page: 1,
        end_page: 1,
      },
    },
    blocks,
    warnings,
  };
}
