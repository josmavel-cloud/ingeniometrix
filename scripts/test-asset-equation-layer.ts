import {
  buildAssetLayoutPlanForDiagnostics,
} from "../server/blueprint-v2/lab/academic-document-compiler";
import {
  buildProfessionalEquationReport,
} from "../server/blueprint-v2/lab/professional-equation-report";
import type {
  AcademicDocument,
  AcademicSection,
  AssetPlacement,
} from "../server/blueprint-v2/lab/academic-document-model";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

function section(sectionKey: string, title: string): AcademicSection {
  return {
    section_key: sectionKey,
    title,
    level: 1,
    source_ids: [],
    evidence_ids: [],
    original_excerpt_ids: [],
    asset_keys: [],
    citation_anchors: [],
    blocks: [],
    warnings: [],
  };
}

function asset(input: Partial<AssetPlacement> & Pick<AssetPlacement, "asset_key" | "section_key" | "render_mode">): AssetPlacement {
  return {
    asset_key: input.asset_key,
    source_id: input.source_id ?? "source-1",
    section_key: input.section_key,
    placement: input.placement ?? "after_paragraph",
    paragraph_anchor: input.paragraph_anchor ?? 0,
    caption: input.caption ?? "Apoyo academico",
    render_mode: input.render_mode,
    renderable: input.renderable ?? true,
    file_path: input.file_path ?? null,
    text_content: input.text_content ?? null,
    warnings: input.warnings ?? [],
  };
}

const sections = [
  section("theoretical_framework", "Marco teorico"),
  section("methodology", "Metodologia"),
  section("results_plan", "Plan de resultados"),
];

const layout = buildAssetLayoutPlanForDiagnostics({
  sections,
  mainBodySectionKeys: sections.map((item) => item.section_key),
  assetPlacements: [
    asset({
      asset_key: "eq-methodology",
      section_key: "methodology",
      render_mode: "equation",
      text_content: "$$ y = \\frac{x}{t} $$",
      caption: "Relacion formal de la metodologia",
    }),
    asset({
      asset_key: "eq-complex-fallback",
      section_key: "methodology",
      render_mode: "equation",
      text_content: "$$ A = \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} $$",
      caption: "Matriz formal recuperada de la fuente original",
    }),
    asset({
      asset_key: "fig-results",
      section_key: "results_plan",
      render_mode: "image",
      file_path: "artifacts-local/test-assets/results.png",
      caption: "Diagrama de resultados",
    }),
    asset({
      asset_key: "eq-source-image-fallback",
      section_key: "results_plan",
      render_mode: "image",
      file_path: "artifacts-local/test-assets/equation-complex.png",
      text_content: "$$ B = \\begin{bmatrix} b_1 \\\\ b_2 \\end{bmatrix} $$",
      caption: "Ecuacion matricial recuperada como imagen de fuente",
    }),
    asset({
      asset_key: "eq-theory-image",
      section_key: "theoretical_framework",
      render_mode: "image",
      file_path: "artifacts-local/test-assets/equation.png",
      caption: "Ecuacion source-backed del marco teorico",
      text_content: "F = m a",
    }),
  ],
});

const firstEquation = layout.equations[0];
const secondEquation = layout.equations[1];
const thirdEquation = layout.equations[2];
const fourthEquation = layout.equations[3];
const firstFigure = layout.figures[0];
const equationReport = buildProfessionalEquationReport({
  documents: [
    {
      label: "synthetic",
      document: {
        variant: "master",
        layout_plan: {
          equations: layout.equations,
        },
      } as unknown as AcademicDocument,
    },
  ],
});

const results: TestResult[] = [
  test(
    "equation numbering follows document section order",
      firstEquation?.asset_key === "eq-theory-image" &&
      firstEquation.equation_number === 1 &&
      secondEquation?.asset_key === "eq-complex-fallback" &&
      secondEquation.equation_number === 2 &&
      thirdEquation?.asset_key === "eq-methodology" &&
      thirdEquation.equation_number === 3 &&
      fourthEquation?.asset_key === "eq-source-image-fallback" &&
      fourthEquation.equation_number === 4,
    JSON.stringify(layout.equations),
  ),
  test(
    "equation image is not also counted as figure",
    layout.figures.length === 1 && firstFigure?.asset_key === "fig-results",
    JSON.stringify(layout.figures),
  ),
  test(
    "figure numbering follows document section order",
    firstFigure?.figure_number === 1 && firstFigure.section_key === "results_plan",
    JSON.stringify(layout.figures),
  ),
  test(
    "equation plan includes professional purpose",
    Boolean(firstEquation?.purpose) &&
      /^Prop[o\u00f3]sito acad[e\u00e9]mico:/.test(firstEquation?.purpose ?? "") &&
      /fuente original|Contexto fuente/i.test(firstEquation?.purpose ?? ""),
    JSON.stringify(firstEquation),
  ),
  test(
    "equation plan includes variable notes without invented definitions",
    (firstEquation?.variable_notes.length ?? 0) > 0 &&
      firstEquation?.variable_notes.every((note) => /no recuperada|no recuperado/i.test(note.description)),
    JSON.stringify(firstEquation?.variable_notes),
  ),
  test(
    "equation explanation is grounded in recovered source material",
    Boolean(firstEquation?.source_grounded_explanation_available) &&
      /fuente original/i.test(firstEquation?.purpose ?? "") &&
      /F = m a|marco teorico/i.test(firstEquation?.source_context_summary ?? ""),
    JSON.stringify({
      purpose: firstEquation?.purpose,
      source_context_summary: firstEquation?.source_context_summary,
    }),
  ),
  test(
    "unsupported equation without source image uses generated image fallback",
    secondEquation?.render_strategy === "generated_equation_image" &&
      secondEquation.professional_render_available === true,
    JSON.stringify(secondEquation),
  ),
  test(
    "equation with source image prefers image fallback when no safe native formula exists",
    fourthEquation?.render_strategy === "source_equation_image" &&
      fourthEquation.professional_render_available === true,
    JSON.stringify(fourthEquation),
  ),
  test(
    "equation public labels are normalized to Spanish",
    !/source-backed|Ecuacion|teorico|metodologia/i.test(
      [
        firstEquation?.caption,
        firstEquation?.purpose,
        firstEquation?.body_reference,
        secondEquation?.caption,
        secondEquation?.purpose,
        secondEquation?.body_reference,
      ].join(" "),
    ),
    JSON.stringify(layout.equations),
  ),
  test(
    "readable equation display avoids raw frac command",
    !/\\frac/.test(secondEquation?.display_text ?? ""),
    JSON.stringify(secondEquation),
  ),
  test(
    "public equation fields avoid raw LaTeX markers",
    !/\\frac|\\begin|\\end|\$\$|beginbmatrix|endbmatrix|bmatrix/.test(
      [
        firstEquation?.display_text,
        firstEquation?.source_context_summary,
        secondEquation?.display_text,
        secondEquation?.source_context_summary,
        thirdEquation?.display_text,
        fourthEquation?.display_text,
        fourthEquation?.source_context_summary,
      ].join(" "),
    ),
    JSON.stringify(layout.equations),
  ),
  test(
    "matrix fallback does not create LaTeX environment tokens as variables",
    !secondEquation?.variable_notes.some((note) =>
      /begin|end|bmatrix|matrix|array|cases|trix|matriz|fuente|formal|recuper/i.test(note.symbol),
    ) &&
      !fourthEquation?.variable_notes.some((note) =>
        /begin|end|bmatrix|matrix|array|cases|trix|matriz|fuente|formal|recuper/i.test(note.symbol),
      ),
    JSON.stringify([secondEquation?.variable_notes, fourthEquation?.variable_notes]),
  ),
  test(
    "professional equation report captures render strategies and source grounding",
    equationReport.rendered_equation_count === 4 &&
      equationReport.source_image_fallback_count === 1 &&
      equationReport.generated_image_fallback_count === 1 &&
      equationReport.source_grounded_explanation_count === 4 &&
      equationReport.raw_latex_public_leak_count === 0,
    JSON.stringify(equationReport),
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

console.log(`\nAsset/equation layer self-diagnostic: ${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}
