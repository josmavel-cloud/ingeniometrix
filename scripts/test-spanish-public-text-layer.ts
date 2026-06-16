import {
  normalizeSpanishPublicText,
  sentenceStyleCapitalizePublicText,
} from "../server/blueprint-v2/editorial/capitalization-hygiene";
import { normalizeAcademicDocumentPublicFields } from "../server/blueprint-v2/editorial/public-document-normalizer";
import { buildSpanishPublicTextQaReport } from "../server/blueprint-v2/editorial/spanish-public-text-qa";
import {
  placeCitationInAcademicTextForDiagnostics,
  shouldSplitDensePublicBlockForDiagnostics,
} from "../server/blueprint-v2/lab/docx-renderer";
import type { AcademicDocument } from "../server/blueprint-v2/lab/academic-document-model";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

function repeatedSentence(count: number) {
  return Array.from({ length: count }, (_, index) =>
    `Criterio ${index + 1}: el texto organiza una idea verificable para facilitar la lectura acad\u00e9mica.`,
  ).join(" ");
}

function academicDocument(sectionText: string): AcademicDocument {
  return {
    artifact_type: "academic_document_model",
    artifact_version: "v1",
    variant: "master",
    template_key: "diagnostic",
    template_name: "Diagnostic",
    citation_style: "APA7",
    report_archetype: "indexed_paper_like",
    metadata: {
      title: "Evaluaci\u00f3n metodol\u00f3gica aplicada",
      short_header_title: "Evaluaci\u00f3n metodol\u00f3gica",
      keywords_line: "Evaluaci\u00f3n metodol\u00f3gica; datos comparables; validaci\u00f3n",
      subtitle: "Documento acad\u00e9mico",
      university: null,
      program: null,
      generated_at: "2026-01-01T00:00:00.000Z",
    },
    branding: [],
    editorial_plan: {
      artifact_type: "academic_editorial_plan",
      artifact_version: "v1",
      source: "deterministic_preflight",
      archetype: "indexed_paper_like",
      main_body_section_keys: ["state_of_the_art"],
      annex_section_keys: [],
      suppressed_section_keys: [],
      title_overrides: {},
      duplicate_pairs: [],
      quality_warnings: [],
    },
    llm_editorial_passes: [],
    public_sanitization_passes: [],
    llm_layout_passes: [],
    layout_plan: {
      artifact_type: "academic_docx_layout_plan",
      artifact_version: "v1",
      generated_at: "2026-01-01T00:00:00.000Z",
      source: "deterministic_preflight",
      figures: [],
      equations: [],
      schedule_visual: null,
      schedule_gantt_rows: [],
      budget_rows: [],
      budget_total_range: null,
      appendix_public_items: [],
      appendix_internal_items: [],
      cover_visual: {
        hero_visual_type: "methodological_infographic_cover",
        source_handoff_id: null,
        source_evidence_run_id: null,
        source_snapshot_hash: null,
        deterministic_template_asset: true,
        title: "Evaluaci\u00f3n metodol\u00f3gica aplicada",
        subtitle: "Flujo metodol\u00f3gico",
        concept: "Proceso acad\u00e9mico verificable",
        method_summary: "Revisi\u00f3n, dise\u00f1o, an\u00e1lisis y validaci\u00f3n.",
        prompt: "",
        hero_prompt_summary: "Infograf\u00eda metodol\u00f3gica acad\u00e9mica.",
        hero_visual_caption: "Infograf\u00eda metodol\u00f3gica.",
        negative_prompt: "",
        image_path: null,
        image_model: null,
        image_generation_status: "not_requested",
        image_generation_warnings: [],
        image_layout: {
          width_px: 1024,
          height_px: 1536,
          min_first_page_height_pct: 60,
        },
        palette: {
          background: "FFFFFF",
          primary: "111111",
          accent: "333333",
          muted: "CCCCCC",
        },
      },
      suppressed_asset_keys: [],
      public_annex_policy: {
        include_internal_traceability: false,
        omitted_internal_fields: [],
      },
      warnings: [],
    },
    style_contract: {
      title: "Title",
      subtitle: "Subtitle",
      heading1: "Heading1",
      heading2: "Heading2",
      heading3: "Heading3",
      heading4: "Heading4",
      heading5: "Heading5",
      body: "Normal",
      caption: "Caption",
      table: "Table",
      tableHeader: "TableHeader",
      matrixCell: "MatrixCell",
      reference: "Reference",
      annexHeading: "Heading1",
    },
    sections: [
      {
        section_key: "state_of_the_art",
        title: "Estado del arte",
        level: 1,
        source_ids: [],
        evidence_ids: [],
        original_excerpt_ids: [],
        asset_keys: [],
        citation_anchors: [],
        blocks: [
          {
            block_type: "paragraph",
            text: sectionText,
            citation_anchor_ids: [],
          },
        ],
        warnings: [],
      },
    ],
    matrix: {
      artifact_type: "consistency_matrix_artifact",
      artifact_version: "v1",
      generated_at: "2026-01-01T00:00:00.000Z",
      general_block: {
        problema_principal: null,
        objetivo_general: null,
        hipotesis_general: null,
      },
      general_row: null,
      specific_rows: [],
      table_model: null,
      validation: {
        row_alignment_ok: true,
        can_continue_step_11: true,
        warnings: [],
        blockers: [],
      },
      warnings: [],
      blockers: [],
    },
    matrix_layout: {
      orientation: "portrait",
      column_widths_pct: [100],
      font_size_pt: 8,
      repeat_header: true,
      allow_wrap: true,
      split_strategy: "single_table",
    },
    references: [],
    asset_placements: [],
    qa_policy: {
      require_landscape_matrix: true,
      require_references: true,
      require_traceability_annex: false,
      forbid_markdown_markers: true,
    },
    warnings: [],
  } as unknown as AcademicDocument;
}

const normalizedLabel = sentenceStyleCapitalizePublicText(
  "direct workflow output con validacion",
  "table_cell",
);
const protectedUrl = normalizeSpanishPublicText("https://example.com/output/direct", "sentence");
const protectedQuote = normalizeSpanishPublicText('"investigacion sin acento"', "sentence");
const placedCitation = placeCitationInAcademicTextForDiagnostics(
  "La primera oraci\u00f3n desarrolla un argumento metodol\u00f3gico. La segunda conserva la lectura fluida.",
  "(Fuente, 2026)",
);
const denseText = repeatedSentence(20);
const denseQa = buildSpanishPublicTextQaReport({
  documents: [{ label: "dense", document: academicDocument(denseText) }],
});
const incompleteQa = buildSpanishPublicTextQaReport({
  documents: [
    {
      label: "incomplete",
      document: academicDocument("El argumento metodol\u00f3gico queda pendiente de"),
    },
  ],
});
const cleanQa = buildSpanishPublicTextQaReport({
  documents: [
    {
      label: "clean",
      document: academicDocument(
        "El argumento metodol\u00f3gico se presenta con una frase completa y verificable.",
      ),
    },
  ],
});
const dirtyDocument = academicDocument(
  "La primera oracion desarrolla una relacion metodologica segun el ambito de evaluacion.",
);
dirtyDocument.metadata.title = "evaluacion metodologica con relacion teorica";
dirtyDocument.metadata.short_header_title = "metodologia y analisis";
dirtyDocument.layout_plan.equations = [
  {
    asset_key: "eq-1",
    source_id: "source-1",
    section_key: "theoretical_framework",
    equation_number: 1,
    latex: "F = m a",
    display_text: "F = m a",
    caption: "Ecuacion del marco teorico",
    purpose: "Objetivo: explicar la relacion entre variables sin inventar significado.",
    variable_notes: [
      {
        symbol: "F",
        description: "Descripcion pendiente de validacion en la fuente.",
      },
    ],
    source_note: "Fuente: elaboracion propia a partir de evidencia trazable.",
    body_reference: "La Ecuacion 1 apoya el marco teorico.",
    file_path: null,
    warnings: [],
  },
];
dirtyDocument.matrix.general_block = {
  problema_principal: "Como se evalua la relacion metodologica?",
  objetivo_general: "Evaluar la relacion metodologica.",
  hipotesis_general: "La relacion metodologica permite una evaluacion prudente.",
};
const normalizedDocument = normalizeAcademicDocumentPublicFields(dirtyDocument);
const normalizedQa = buildSpanishPublicTextQaReport({
  documents: [{ label: "normalized", document: normalizedDocument }],
});
const denseNormalizedDocument = normalizeAcademicDocumentPublicFields(academicDocument(denseText));
const denseNormalizedQa = buildSpanishPublicTextQaReport({
  documents: [{ label: "dense-normalized", document: denseNormalizedDocument }],
});
const translatedTechnicalTerms = normalizeSpanishPublicText(
  "model-based feedback feedforward testing root mean square con integracion servohidraulica.",
);

const results: TestResult[] = [
  test(
    "public labels are translated and accented",
    /Directo/.test(normalizedLabel) &&
      normalizedLabel.includes("flujo metodol\u00f3gico") &&
      /salida/i.test(normalizedLabel) &&
      normalizedLabel.includes("validaci\u00f3n"),
    normalizedLabel,
  ),
  test(
    "URLs and quoted evidence remain protected",
    protectedUrl === "https://example.com/output/direct" &&
      protectedQuote === '"investigacion sin acento"',
    `${protectedUrl} | ${protectedQuote}`,
  ),
  test(
    "citation can be placed before the paragraph ending",
    placedCitation.indexOf("(Fuente, 2026)") > 0 &&
      placedCitation.indexOf("(Fuente, 2026)") < placedCitation.lastIndexOf("."),
    placedCitation,
  ),
  test(
    "dense public paragraphs are flagged and split-eligible",
    denseQa.findings.some((finding) => finding.kind === "dense_public_paragraph") &&
      shouldSplitDensePublicBlockForDiagnostics("state_of_the_art", denseText),
    JSON.stringify(denseQa.findings),
  ),
  test(
    "incomplete public sentence is flagged",
    incompleteQa.findings.some((finding) => finding.kind === "incomplete_public_sentence"),
    JSON.stringify(incompleteQa.findings),
  ),
  test(
    "clean short public text has no QA findings",
    cleanQa.passed,
    JSON.stringify(cleanQa.findings),
  ),
  test(
    "pre-render public document normalization removes common accent defects",
    Boolean(
      normalizedQa.passed &&
        normalizedDocument.metadata.title.includes("Evaluaci\u00f3n metodol\u00f3gica") &&
        normalizedDocument.layout_plan.equations[0]?.caption.includes("Ecuaci\u00f3n") &&
        normalizedDocument.matrix.general_block.problema_principal?.startsWith("C\u00f3mo se eval\u00faa") &&
        normalizedDocument.matrix.general_block.problema_principal?.includes("relaci\u00f3n"),
    ),
    JSON.stringify({
      findings: normalizedQa.findings,
      title: normalizedDocument.metadata.title,
      equation_caption: normalizedDocument.layout_plan.equations[0]?.caption,
      matrix_problem: normalizedDocument.matrix.general_block.problema_principal,
    }),
  ),
  test(
    "pre-render public document normalization splits dense public paragraphs",
    denseNormalizedDocument.sections[0]?.blocks.length > 1 &&
      !denseNormalizedQa.findings.some((finding) => finding.kind === "dense_public_paragraph"),
    JSON.stringify({
      block_count: denseNormalizedDocument.sections[0]?.blocks.length,
      findings: denseNormalizedQa.findings,
    }),
  ),
  test(
    "common public English and accent defects are normalized",
    translatedTechnicalTerms.includes("basado en modelo") &&
      translatedTechnicalTerms.includes("retroalimentaci\u00f3n") &&
      translatedTechnicalTerms.includes("prealimentaci\u00f3n") &&
      translatedTechnicalTerms.includes("ensayo") &&
      translatedTechnicalTerms.includes("ra\u00edz media cuadr\u00e1tica") &&
      translatedTechnicalTerms.includes("integraci\u00f3n") &&
      translatedTechnicalTerms.includes("servohidr\u00e1ulica"),
    translatedTechnicalTerms,
  ),
];

const failed = results.filter((result) => !result.passed);

for (const result of results) {
  console.log(
    `${result.passed ? "PASS" : "FAIL"} ${result.name}${
      result.details ? ` :: ${result.details}` : ""
    }`,
  );
}

console.log(
  `\nSpanish public text layer self-diagnostic: ${results.length - failed.length}/${results.length} passed`,
);

if (failed.length > 0) {
  process.exitCode = 1;
}
