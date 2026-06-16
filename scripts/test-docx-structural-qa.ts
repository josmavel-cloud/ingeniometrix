import fs from "node:fs";
import path from "node:path";

import JSZip from "jszip";

import {
  buildDeterministicFigureCaption,
  buildScheduleGanttTableRows,
} from "../server/blueprint-v2/lab/docx-renderer";
import { patchDocxPackage } from "../server/blueprint-v2/lab/docx-ooxml-patcher";
import {
  countPublicAppendixDebugMarkers,
  detectDuplicateTableOfContents,
  hasRecognizedScheduleGanttText,
  validateDocxPackage,
} from "../server/blueprint-v2/lab/docx-qa-engine";
import { sanitizePublicAppendixText } from "../server/blueprint-engine/quality/production-safety";
import type { ScheduleVisualPlan } from "../server/blueprint-v2/lab/academic-document-model";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

async function writeFakeDocx(docxPath: string, documentXml: string) {
  const zip = new JSZip();
  zip.file("word/document.xml", documentXml);
  zip.file("word/settings.xml", "<w:settings><w:updateFields w:val=\"true\"/></w:settings>");
  zip.file("word/_rels/document.xml.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>");
  zip.file("word/header1.xml", "<w:hdr>Ingeniometrix</w:hdr>");
  zip.file("word/footer1.xml", "<w:ftr>1</w:ftr>");
  zip.file("word/media/cover.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  fs.mkdirSync(path.dirname(docxPath), { recursive: true });
  fs.writeFileSync(docxPath, await zip.generateAsync({ type: "nodebuffer" }));
}

const fallbackCaption = buildDeterministicFigureCaption({
  figureNumber: 1,
  sectionTitle: "metodologia",
  assetKind: "infografia metodologica",
  sourceLabel: "evidencia trazable",
});

const schedulePlan: ScheduleVisualPlan = {
  label: "Cronograma visual de investigacion",
  caption: "Cronograma referencial tipo Gantt para la ejecucion del proyecto de investigacion.",
  source_note:
    "Fuente: elaboracion propia a partir del plan de trabajo generado para el proyecto. Los meses son referenciales.",
  tasks: [
    {
      task: "Revision teorica y organizacion de antecedentes",
      start_month: 1,
      end_month: 2,
      phase: "revision",
      dependency: "Aprobacion del plan de trabajo",
      deliverable: "Matriz de antecedentes",
    },
  ],
};
const scheduleRows = buildScheduleGanttTableRows(schedulePlan);
const duplicateToc = detectDuplicateTableOfContents(
  "Tabla de contenido Introduccion Tabla de contenido Metodologia",
);
const appendixLeakText =
  "Anexo A. Declaracion de trazabilidad academica artifacts-local/run source_id file_path";
const sanitizedAppendixText = sanitizePublicAppendixText(appendixLeakText);

const fakeDocxPath = path.join(
  process.cwd(),
  "artifacts-local",
  "test-docx-structural-qa",
  "structural-pass.docx",
);

async function main() {
  await writeFakeDocx(
    fakeDocxPath,
    [
      "<w:document><w:body>",
      "Documento master academico",
      "Tabla de contenido",
      "1. Introduccion",
      "Matriz de consistencia",
      "<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr></w:tr></w:tbl>",
      "Cronograma referencial tipo Gantt",
      "Fase Actividad Periodo M1 M2 M3 M4 M5 M6 Dependencia Entregable",
      "Figura 1. Infografia metodologica de metodologia.",
      "Fuente: elaboracion propia a partir del intake y evidencia trazable.",
      "Ecuacion 1. Razon de consistencia",
      "<m:oMath><m:r>CR</m:r></m:oMath>",
      "Referencias",
      "Anexo A. Gestion del proyecto",
      "<w:sectPr w:orient=\"landscape\"/>",
      "</w:body></w:document>",
    ].join(" "),
  );

  const qaReport = await validateDocxPackage({
    docxPath: fakeDocxPath,
    minTableCount: 1,
    minSectionCount: 1,
  });
  const patchReport = await patchDocxPackage({ docxPath: fakeDocxPath });
  const patchedZip = await JSZip.loadAsync(fs.readFileSync(fakeDocxPath));
  const patchedSettings = await patchedZip.file("word/settings.xml")?.async("string");

  const results: TestResult[] = [
    test(
      "rendered document package with one media item has one figure caption",
      qaReport.checks.has_media_assets &&
        qaReport.checks.has_figure_caption &&
        qaReport.metrics.figure_caption_count === 1,
      JSON.stringify({
        has_media_assets: qaReport.checks.has_media_assets,
        has_figure_caption: qaReport.checks.has_figure_caption,
        figure_caption_count: qaReport.metrics.figure_caption_count,
      }),
    ),
    test(
      "missing asset caption gets deterministic fallback caption",
      fallbackCaption ===
        "Figura 1. Infograf\u00eda metodol\u00f3gica de Metodolog\u00eda derivado de evidencia trazable.",
      fallbackCaption,
    ),
    test(
      "schedule plan produces Gantt-style table rows recognized by QA",
      Boolean(scheduleRows[0]?.includes("Dependencia")) &&
        Boolean(scheduleRows[0]?.includes("Entregable")) &&
        hasRecognizedScheduleGanttText(
          "Cronograma referencial tipo Gantt Fase Dependencia Entregable",
        ),
      JSON.stringify(scheduleRows),
    ),
    test(
      "institutional fallback media can satisfy media/caption checks without provider assets",
      qaReport.checks.has_media_assets && qaReport.checks.has_asset_source_notes,
      JSON.stringify({
        media_count: qaReport.metrics.media_count,
        source_note_count: qaReport.metrics.source_note_count,
      }),
    ),
    test(
      "duplicate visible TOC fixture is detected",
      duplicateToc.has_duplicate_table_of_contents &&
        duplicateToc.duplicate_block_count === 1,
      JSON.stringify(duplicateToc),
    ),
    test(
      "public appendix policy blocks backend/debug leakage",
      countPublicAppendixDebugMarkers(appendixLeakText) > 0 &&
        countPublicAppendixDebugMarkers(sanitizedAppendixText) === 0,
      sanitizedAppendixText,
    ),
    test(
      "public DOCX QA rejects public traceability annex and external links",
      qaReport.checks.no_public_traceability_annex &&
        qaReport.checks.no_external_relationships &&
        qaReport.metrics.external_relationship_count === 0,
      JSON.stringify({
        no_public_traceability_annex: qaReport.checks.no_public_traceability_annex,
        no_external_relationships: qaReport.checks.no_external_relationships,
        external_relationship_count: qaReport.metrics.external_relationship_count,
      }),
    ),
    test(
      "OOXML patch disables automatic field updates for standalone DOCX",
      patchReport.patches_applied.includes("word/settings.xml:disableUpdateFields") &&
        Boolean(patchedSettings?.includes('<w:updateFields w:val="false"/>')) &&
        !Boolean(patchedSettings?.includes('w:val="true"')),
      JSON.stringify({ patchReport, patchedSettings }),
    ),
  ];

  const failed = results.filter((result) => !result.passed);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
    if (!result.passed && result.details) {
      console.log(`  ${result.details}`);
    }
  }

  console.log(`\nDOCX structural QA tests: ${results.length - failed.length}/${results.length} passed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
