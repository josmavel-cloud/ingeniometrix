import { readFile } from "node:fs/promises";

import JSZip from "jszip";

export type DocxQaReport = {
  artifact_type: "docx_qa_report";
  artifact_version: "v1";
  generated_at: string;
  docx_path: string;
  passed: boolean;
  score_100: number;
  checks: {
    zip_readable: boolean;
    has_document_xml: boolean;
    has_cover_text: boolean;
    has_matrix_heading: boolean;
    has_landscape_section: boolean;
    has_references_heading: boolean;
    no_public_traceability_annex: boolean;
    has_media_assets: boolean;
    has_figure_caption: boolean;
    no_control_heading_in_body: boolean;
    has_table_header_repeat: boolean;
    has_academic_header_footer: boolean;
    has_asset_source_notes: boolean;
    has_schedule_gantt: boolean;
    has_table_of_contents: boolean;
    no_duplicate_table_of_contents: boolean;
    has_numbered_headings: boolean;
    no_source_title_leaks: boolean;
    no_latex_literals: boolean;
    no_forced_caps_headings: boolean;
    has_professional_equations: boolean;
    no_internal_provider_markers: boolean;
    no_public_appendix_debug_leak: boolean;
    no_external_relationships: boolean;
    markdown_removed: boolean;
    min_table_count_pass: boolean;
    min_section_count_pass: boolean;
  };
  metrics: {
    table_count: number;
    section_count: number;
    landscape_section_count: number;
    repeated_table_header_count: number;
    markdown_marker_count: number;
    media_count: number;
    header_count: number;
    footer_count: number;
    figure_caption_count: number;
    source_note_count: number;
    equation_caption_count: number;
    source_title_leak_count: number;
    latex_literal_count: number;
    forced_caps_count: number;
    numbered_heading_count: number;
    toc_field_count: number;
    visible_toc_heading_count: number;
    duplicate_toc_block_count: number;
    schedule_gantt_marker_count: number;
    public_appendix_debug_marker_count: number;
    external_relationship_count: number;
    math_object_count: number;
    control_heading_count: number;
  };
  failures: string[];
  warnings: string[];
};

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceTitleLeakVariants(title: string) {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  const words = cleanTitle.split(/\s+/).filter(Boolean);
  const variants = new Set<string>([cleanTitle]);
  const colonPrefix = cleanTitle.split(":")[0]?.trim();

  if (colonPrefix && colonPrefix.length >= 10) {
    variants.add(colonPrefix);
  }

  for (const count of [8, 6, 5, 4, 3]) {
    if (words.length < count) {
      continue;
    }

    const prefix = words.slice(0, count).join(" ").trim();
    if (prefix.length >= 12) {
      variants.add(prefix);
    }
  }

  return Array.from(variants).sort((left, right) => right.length - left.length);
}

function countSourceTitleLeaks(publicText: string, titles: string[]) {
  return titles
    .filter((title) => title.trim().length >= 18)
    .reduce((sum, title) => {
      const variants = sourceTitleLeakVariants(title);
      return (
        sum +
        variants.reduce(
          (variantSum, variant) =>
            variantSum +
            countMatches(
              publicText,
              new RegExp(
                String.raw`\b${escapeRegExp(variant)}\s*(?:\.\.\.|\u2026)?(?=\W|$)`,
                "gi",
              ),
            ),
          0,
        )
      );
    }, 0);
}

function hasAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function decodeXmlText(value: string) {
  return value
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<w:p[\s\S]*?>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function countVisibleTableOfContentsHeadings(documentText: string) {
  return countMatches(documentText, /\bTabla de contenido\b/gi);
}

export function detectDuplicateTableOfContents(documentText: string) {
  const visibleHeadingCount = countVisibleTableOfContentsHeadings(documentText);
  return {
    visible_heading_count: visibleHeadingCount,
    duplicate_block_count: Math.max(0, visibleHeadingCount - 1),
    has_duplicate_table_of_contents: visibleHeadingCount > 1,
  };
}

export function hasRecognizedScheduleGanttText(documentText: string) {
  if (!/Cronograma/i.test(documentText)) {
    return true;
  }

  return (
    /Cronograma referencial/i.test(documentText) ||
    /tipo Gantt/i.test(documentText) ||
    (/Fase/i.test(documentText) && /Dependencia/i.test(documentText) && /Entregable/i.test(documentText))
  );
}

export function countPublicAppendixDebugMarkers(documentText: string) {
  const appendixIndex = documentText.search(/Anexo\s+[A-Z]\./i);
  const appendixText = appendixIndex >= 0 ? documentText.slice(appendixIndex) : documentText;
  return countMatches(
    appendixText,
    /artifacts-local|backend|debug|prompt trace|source_id|asset_key|file_path|run hash|immutable_snapshot_hash|OpenAlex URL|trazabilidad academica|control de trazabilidad/gi,
  );
}

function scoreChecks(checks: Record<string, boolean>) {
  const values = Object.values(checks);
  const passed = values.filter(Boolean).length;
  return Math.round((passed / Math.max(1, values.length)) * 100);
}

export async function validateDocxPackage(input: {
  docxPath: string;
  minTableCount: number;
  minSectionCount: number;
  forbiddenSourceTitles?: string[];
}): Promise<DocxQaReport> {
  const failures: string[] = [];
  const warnings: string[] = [];
  let documentXml = "";
  let settingsXml = "";
  let mediaCount = 0;
  let headerCount = 0;
  let footerCount = 0;
  let externalRelationshipCount = 0;
  let zipReadable = false;
  let hasDocumentXml = false;

  try {
    const buffer = await readFile(input.docxPath);
    const zip = await JSZip.loadAsync(buffer);
    zipReadable = true;
    const documentFile = zip.file("word/document.xml");
    const settingsFile = zip.file("word/settings.xml");
    hasDocumentXml = Boolean(documentFile);
    documentXml = documentFile ? await documentFile.async("string") : "";
    settingsXml = settingsFile ? await settingsFile.async("string") : "";
    mediaCount = Object.keys(zip.files).filter((fileName) =>
      fileName.startsWith("word/media/"),
    ).length;
    headerCount = Object.keys(zip.files).filter((fileName) =>
      /^word\/header\d+\.xml$/.test(fileName),
    ).length;
    footerCount = Object.keys(zip.files).filter((fileName) =>
      /^word\/footer\d+\.xml$/.test(fileName),
    ).length;
    const relFileNames = Object.keys(zip.files).filter((fileName) =>
      /_rels\/.+\.rels$/.test(fileName),
    );
    const relContents = await Promise.all(
      relFileNames.map(async (fileName) => zip.file(fileName)?.async("string") ?? ""),
    );
    externalRelationshipCount = relContents.reduce(
      (sum, content) => sum + countMatches(content, /TargetMode="External"/g),
      0,
    );
  } catch (error) {
    failures.push(
      error instanceof Error ? error.message : "No se pudo abrir el paquete DOCX.",
    );
  }

  const tableCount = countMatches(documentXml, /<w:tbl>/g);
  const sectionCount = countMatches(documentXml, /<w:sectPr\b/g);
  const landscapeSectionCount = countMatches(documentXml, /w:orient="landscape"/g);
  const repeatedTableHeaderCount = countMatches(documentXml, /<w:tblHeader\b/g);
  const markdownMarkerCount = countMatches(documentXml, /##|\*\*|\|---/g);
  const figureCaptionCount = countMatches(documentXml, /Figura\s+\d+/g);
  const sourceNoteCount = countMatches(documentXml, /Fuente:/g);
  const equationCaptionCount = countMatches(documentXml, /Ecuacion\s+\d+/g);
  const controlHeadingCount = countMatches(documentXml, /Resumen ejecutivo de control/g);
  const internalProviderMarkerCount = countMatches(
    documentXml,
    /OpenAlex|source_id|asset_key|file_path|runtime backend|Master Template|Plantilla:/g,
  );
  const documentText = decodeXmlText(documentXml);
  const referencesIndex = documentText.indexOf("Referencias");
  const publicText = referencesIndex >= 0 ? documentText.slice(0, referencesIndex) : documentText;
  const sourceTitleLeakCount = countSourceTitleLeaks(
    publicText,
    input.forbiddenSourceTitles ?? [],
  );
  const latexLiteralCount = countMatches(documentXml, /LaTeX:|\\frac|\\lambda|lambda_max/g);
  const forcedCapsCount = countMatches(documentXml, /<w:caps\b/g);
  const numberedHeadingCount = countMatches(
    documentText,
    /\b\d+(?:\.\d+)*\.\s+[A-ZÁÉÍÓÚÑA-Za-z]/g,
  );
  const tocFieldCount = countMatches(documentXml, /TOC \\o|Tabla de contenido/g);
  const tocAnalysis = detectDuplicateTableOfContents(documentText);
  const scheduleGanttMarkerCount = hasRecognizedScheduleGanttText(documentText) ? 1 : 0;
  const publicAppendixDebugMarkerCount = countPublicAppendixDebugMarkers(documentText);
  const mathObjectCount = countMatches(documentXml, /<m:oMath\b/g);
  const hasPublicTraceabilityAnnex =
    documentXml.includes("Declaracion de trazabilidad academica") ||
    documentXml.includes("Control de trazabilidad");

  const checks = {
    zip_readable: zipReadable,
    has_document_xml: hasDocumentXml,
    has_cover_text: hasAny(documentXml, [
      "Documento master academico",
      "Plan de tesis institucional",
      "revision academica",
    ]),
    has_matrix_heading: documentXml.includes("Matriz de consistencia"),
    has_landscape_section: landscapeSectionCount > 0,
    has_references_heading: documentXml.includes("Referencias"),
    no_public_traceability_annex: !hasPublicTraceabilityAnnex,
    has_media_assets: mediaCount > 0,
    has_figure_caption: figureCaptionCount > 0 || mediaCount > 0,
    no_control_heading_in_body: controlHeadingCount === 0,
    has_table_header_repeat: repeatedTableHeaderCount > 0,
    has_academic_header_footer: headerCount > 0 && footerCount > 0,
    has_asset_source_notes: figureCaptionCount === 0 || sourceNoteCount > 0,
    has_schedule_gantt: hasRecognizedScheduleGanttText(documentText),
    has_table_of_contents: tocFieldCount > 0,
    no_duplicate_table_of_contents: !tocAnalysis.has_duplicate_table_of_contents,
    has_numbered_headings: numberedHeadingCount > 0,
    no_source_title_leaks: sourceTitleLeakCount === 0,
    no_latex_literals: latexLiteralCount === 0,
    no_forced_caps_headings: forcedCapsCount === 0,
    has_professional_equations: equationCaptionCount === 0 || mathObjectCount > 0,
    no_internal_provider_markers: internalProviderMarkerCount === 0,
    no_public_appendix_debug_leak: publicAppendixDebugMarkerCount === 0,
    no_external_relationships: externalRelationshipCount === 0,
    markdown_removed: markdownMarkerCount === 0,
    min_table_count_pass: tableCount >= input.minTableCount,
    min_section_count_pass: sectionCount >= input.minSectionCount,
  };

  for (const [key, value] of Object.entries(checks)) {
    if (!value) {
      failures.push(`DOCX QA fallo: ${key}.`);
    }
  }

  if (!settingsXml.includes("w:updateFields")) {
    warnings.push("No se detecto updateFields en word/settings.xml; Word puede requerir actualizar campos manualmente.");
  }

  const score = scoreChecks(checks);

  return {
    artifact_type: "docx_qa_report",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    docx_path: input.docxPath,
    passed: failures.length === 0,
    score_100: score,
    checks,
    metrics: {
      table_count: tableCount,
      section_count: sectionCount,
      landscape_section_count: landscapeSectionCount,
      repeated_table_header_count: repeatedTableHeaderCount,
      header_count: headerCount,
      footer_count: footerCount,
      source_note_count: sourceNoteCount,
      equation_caption_count: equationCaptionCount,
      source_title_leak_count: sourceTitleLeakCount,
      latex_literal_count: latexLiteralCount,
      forced_caps_count: forcedCapsCount,
      numbered_heading_count: numberedHeadingCount,
      toc_field_count: tocFieldCount,
      visible_toc_heading_count: tocAnalysis.visible_heading_count,
      duplicate_toc_block_count: tocAnalysis.duplicate_block_count,
      schedule_gantt_marker_count: scheduleGanttMarkerCount,
      public_appendix_debug_marker_count: publicAppendixDebugMarkerCount,
      external_relationship_count: externalRelationshipCount,
      math_object_count: mathObjectCount,
      markdown_marker_count: markdownMarkerCount,
      media_count: mediaCount,
      figure_caption_count: figureCaptionCount,
      control_heading_count: controlHeadingCount,
    },
    failures,
    warnings,
  };
}
