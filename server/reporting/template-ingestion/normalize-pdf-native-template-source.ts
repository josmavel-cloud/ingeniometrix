import type {
  ExtractedPdfNativeTextPage,
  ExtractedPdfNativeTextSourceInput,
  NormalizedBlock,
  NormalizedListItem,
  NormalizedReferenceEntry,
  NormalizedTemplateSourceDocument,
  TemplateDocumentKind,
} from "@/server/reporting/template-ingestion-types";
import { normalizeTemplateAssets } from "@/server/reporting/template-ingestion/normalize-template-assets";

const SEMANTIC_KEY_BY_LABEL: Record<string, string> = {
  "NOMBRE DEL ESTUDIANTE": "student_name",
  "NOMBRES DE ASESORES": "advisors",
  MENCION: "mention",
  TITULO: "project_title",
  RESUMEN: "abstract",
  "INTRODUCCION Y JUSTIFICACION": "introduction_justification",
  OBJETIVOS: "objectives",
  "OBJETIVO GENERAL": "general_objective",
  "OBJETIVOS ESPECIFICOS": "specific_objectives",
  ALCANCE: "scope",
  HIPOTESIS: "hypotheses",
  "ESTADO DEL ARTE": "state_of_the_art",
  METODOLOGIA: "methodology",
  "CRONOGRAMA Y PRESUPUESTO": "schedule_budget",
  REFERENCIAS: "references",
};

const BULLET_PREFIX = /^[\u2022\u25AA\u25E6-]\s+/u;
const REFERENCE_ENTRY_PREFIX = /^\p{Lu}[^()]{2,120}\(\d{4}[a-z]?\),?/u;

type HeadingMatch = {
  ordinal: string;
  label: string;
  level: number;
};

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

function splitNonEmptyLines(value: string) {
  return normalizeWhitespace(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectDocumentKind(firstPageText: string, hint?: TemplateDocumentKind): TemplateDocumentKind {
  if (hint && hint !== "unknown") {
    return hint;
  }

  if (/PLAN DE TESIS/i.test(firstPageText)) {
    return "thesis_plan_instance";
  }

  if (/GUIA|MANUAL|FORMATO/i.test(firstPageText)) {
    return "template_guide";
  }

  if (/TESIS/i.test(firstPageText)) {
    return "thesis_final_instance";
  }

  return "unknown";
}

function detectHeading(line: string): HeadingMatch | null {
  const topLevelMatch = line.match(/^(\d+)\.\s+(.+)$/);
  if (topLevelMatch) {
    return {
      ordinal: topLevelMatch[1],
      label: topLevelMatch[2].trim(),
      level: 1,
    };
  }

  const nestedMatch = line.match(/^((?:\d+\.)+\d+)\s+(.+)$/);
  if (!nestedMatch) {
    return null;
  }

  return {
    ordinal: nestedMatch[1],
    label: nestedMatch[2].trim(),
    level: nestedMatch[1].split(".").length,
  };
}

function buildHeaderFrequencyMap(pages: ExtractedPdfNativeTextPage[]) {
  const frequency = new Map<string, number>();

  for (const page of pages) {
    const lines = splitNonEmptyLines(page.raw_text).slice(0, 3);
    for (const line of lines) {
      frequency.set(line, (frequency.get(line) ?? 0) + 1);
    }
  }

  return frequency;
}

function cleanPageText(
  page: ExtractedPdfNativeTextPage,
  repeatedFirstLines: Map<string, number>,
) {
  const lines = splitNonEmptyLines(page.raw_text);

  if (page.page_number === 1) {
    return lines.join("\n");
  }

  const cleanedLines = lines.filter((line, index) => {
    if (/^\d+$/.test(line)) {
      return false;
    }

    if (index <= 2 && (repeatedFirstLines.get(line) ?? 0) > 1) {
      return false;
    }

    return true;
  });

  return cleanedLines.join("\n");
}

function resolveSemanticKey(label: string) {
  return SEMANTIC_KEY_BY_LABEL[normalizeLabelKey(label)] ?? null;
}

function parseListItems(rawText: string): NormalizedListItem[] {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => BULLET_PREFIX.test(line))
    .map((line, index) => ({
      text: line.replace(BULLET_PREFIX, "").trim(),
      ordinal: index + 1,
    }));
}

function parseReferenceEntries(rawText: string): NormalizedReferenceEntry[] {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: string[] = [];
  let current = "";

  for (const line of lines) {
    const startsNewEntry = current.length === 0 || REFERENCE_ENTRY_PREFIX.test(line);

    if (startsNewEntry) {
      if (current.length > 0) {
        entries.push(current.trim());
      }
      current = line;
      continue;
    }

    current = `${current} ${line}`.trim();
  }

  if (current.length > 0) {
    entries.push(current.trim());
  }

  return entries.map((entry) => {
    const yearMatch = entry.match(/\((\d{4})[a-z]?\)/);
    const doiMatch = entry.match(/https?:\/\/doi\.org\/\S+|10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
    const titleMatch = yearMatch
      ? entry.slice(yearMatch.index! + yearMatch[0].length).match(/^\.\s*([^.[\]]+)/)
      : null;

    return {
      raw_text: entry,
      year: yearMatch ? Number.parseInt(yearMatch[1], 10) : null,
      title: titleMatch?.[1]?.trim() ?? null,
      doi: doiMatch?.[0] ?? null,
    };
  });
}

function maybeBuildTableBlock(rawText: string) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const captionLine = lines.find((line) => /^Tabla\s+\d+/i.test(line));

  if (!captionLine) {
    return null;
  }

  return {
    caption: captionLine,
    rows: lines
      .filter((line) => line !== captionLine)
      .map((line) => ({
        cells: [{ text: line }],
      })),
  };
}

function classifyBlockType(semanticKey: string | null, level: number, rawText: string) {
  if (semanticKey === "references") {
    return "references" as const;
  }

  if (semanticKey === "student_name" || semanticKey === "advisors" || semanticKey === "mention") {
    return "field" as const;
  }

  if (semanticKey === "schedule_budget" && /Tabla\s+\d+/i.test(rawText)) {
    return "table" as const;
  }

  if (level > 1) {
    return "subsection" as const;
  }

  return "section" as const;
}

function inferInstitutionFromCover(coverText: string) {
  const lines = splitNonEmptyLines(coverText);
  const universityLine = lines.find((line) => /UNIVERSIDAD/i.test(line)) ?? lines[0] ?? null;
  const schoolLine = lines.find((line) => /ESCUELA|FACULTAD/i.test(line)) ?? null;
  const programLine =
    lines.find((line) => /MAESTRIA|DOCTORADO/i.test(line) && !/ESCUELA|FACULTAD/i.test(line)) ??
    null;
  const documentLabel = lines.find((line) => /PLAN DE TESIS|TESIS/i.test(line)) ?? null;
  const dateLine = lines[lines.length - 1] ?? null;

  return {
    university_name: universityLine,
    school_name: schoolLine,
    program_name: programLine,
    document_label: documentLabel,
    date_label: dateLine,
  };
}

function collectCoverRoleValues(coverText: string, rolePatterns: RegExp[]) {
  const lines = splitNonEmptyLines(coverText);
  const values: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!rolePatterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    const nextLine = lines[index + 1];
    if (nextLine) {
      values.push(nextLine);
    }
  }

  return values;
}

function enrichInstitution(
  coverInfo: ReturnType<typeof inferInstitutionFromCover>,
  blocks: NormalizedBlock[],
) {
  const mentionBlock = blocks.find((block) => block.semantic_key === "mention");

  return {
    university_name: coverInfo.university_name ?? "Universidad no identificada",
    school_name: coverInfo.school_name ?? null,
    program_name: coverInfo.program_name ?? null,
    mention: mentionBlock?.normalized_text ?? null,
    degree_level: /MAESTRIA/i.test(coverInfo.program_name ?? "") ? "MAESTRIA" : null,
    discipline_area: coverInfo.program_name
      ? coverInfo.program_name.replace(/^MAESTRIA EN\s+/i, "").trim()
      : null,
    confidence: 0.8,
  };
}

export function normalizePdfNativeTemplateSource(
  input: ExtractedPdfNativeTextSourceInput,
): NormalizedTemplateSourceDocument {
  if (input.pages.length === 0) {
    throw new Error("La fuente PDF no contiene paginas.");
  }

  const repeatedFirstLines = buildHeaderFrequencyMap(input.pages.slice(1));
  const cleanedPages = input.pages.map((page) => ({
    page_number: page.page_number,
    text: cleanPageText(page, repeatedFirstLines),
  }));

  const coverText = cleanedPages[0]?.text ?? "";
  const coverInfo = inferInstitutionFromCover(coverText);
  const documentKind = detectDocumentKind(coverText, input.document_kind_hint);
  const assetResult = normalizeTemplateAssets({
    providedAssets: input.provided_assets,
    wantsCoverLogo: true,
  });

  const bodyLines = cleanedPages
    .slice(1)
    .flatMap((page) =>
      page.text
        .split("\n")
        .map((line) => ({ page_number: page.page_number, line: line.trim() }))
        .filter((item) => item.line.length > 0),
    );

  const blocks: NormalizedBlock[] = [];
  let currentHeading: HeadingMatch | null = null;
  let currentPageStart = 2;
  let currentLines: string[] = [];

  function flushCurrentBlock(endPage: number) {
    if (!currentHeading) {
      return;
    }

    const rawText = normalizeWhitespace(currentLines.join("\n"));
    const semanticKey = resolveSemanticKey(currentHeading.label);
    const items = parseListItems(rawText);
    const references = semanticKey === "references" ? parseReferenceEntries(rawText) : undefined;
    const table = semanticKey === "schedule_budget" ? maybeBuildTableBlock(rawText) : undefined;

    blocks.push({
      id: `block-${blocks.length + 1}`,
      type: classifyBlockType(semanticKey, currentHeading.level, rawText),
      label: currentHeading.label,
      ordinal: currentHeading.ordinal,
      level: currentHeading.level,
      semantic_key: semanticKey,
      raw_text: rawText,
      normalized_text: rawText || null,
      items: items.length > 0 ? items : undefined,
      table: table ?? undefined,
      references,
      page_span: {
        start_page: currentPageStart,
        end_page: endPage,
      },
      confidence: semanticKey ? 0.95 : 0.7,
    });
  }

  for (const item of bodyLines) {
    const heading = detectHeading(item.line);
    if (heading) {
      flushCurrentBlock(item.page_number);
      currentHeading = heading;
      currentPageStart = item.page_number;
      currentLines = [];
      continue;
    }

    if (currentHeading) {
      currentLines.push(item.line);
    }
  }

  flushCurrentBlock(cleanedPages[cleanedPages.length - 1]?.page_number ?? 1);

  const institution = enrichInstitution(coverInfo, blocks);
  const warnings = [...assetResult.warnings];

  if (!blocks.some((block) => block.semantic_key === "references")) {
    warnings.push("No se detecto una seccion de referencias en la fuente analizada.");
  }

  if (blocks.some((block) => block.semantic_key === "schedule_budget" && !block.table)) {
    warnings.push(
      "Se detecto una seccion de cronograma, pero la estructura tabular no pudo reconstruirse con alta fidelidad desde el PDF nativo.",
    );
  }

  warnings.push(
    "El estilo de citacion no se infiere de forma confiable desde esta instancia; requiere revision humana o fuente normativa complementaria.",
  );

  return {
    source_id: input.source_id,
    source_type: "pdf_native_text",
    document_kind: documentKind,
    language: input.language?.trim() || "es-PE",
    institution,
    assets: assetResult.assets,
    cover: {
      raw_text: coverText,
      university_name: coverInfo.university_name,
      school_name: coverInfo.school_name,
      program_name: coverInfo.program_name,
      document_label: coverInfo.document_label,
      author_lines: collectCoverRoleValues(coverText, [/^Estudiante:?$/i, /^Autor(?:es)?:?$/i]),
      advisor_lines: collectCoverRoleValues(coverText, [
        /^Asesor(?: de tesis)?:?$/i,
        /^Co Asesor(?: de Tesis)?:?$/i,
      ]),
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
