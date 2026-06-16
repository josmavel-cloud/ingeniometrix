import {
  enforceEditorialWordBudget,
  hasIncompleteAcademicEnding,
} from "../server/blueprint-v2/editorial/academic-editorial-policy";
import { buildAcademicSectionBlocksForDiagnostics } from "../server/blueprint-v2/lab/academic-document-compiler";
import { buildConsistencyMatrixArtifactFromSections } from "../server/blueprint-v2/sections/consistency-matrix-engine";
import type { MasterSectionDraft } from "../server/blueprint-v2/types";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

function draft(sectionKey: string, title: string, content: string): MasterSectionDraft {
  return {
    section_key: sectionKey,
    title,
    phase: "logic",
    content,
    content_kind: "rich_text",
    support_level: "assumption_backed",
    supported_source_ids: [],
    supported_pdf_source_ids: [],
    supported_web_source_ids: [],
    supported_assumption_ids: [],
    evidence_snippet_ids: [],
    warnings: [],
    prompt: "",
  };
}

const budgetResult = enforceEditorialWordBudget({
  content:
    "La primera oracion queda completa y verificable. La segunda oracion quedaria incompleta por exceso de presupuesto.",
  max_words: 7,
  content_kind: "rich_text",
});

const objectiveBlocks = buildAcademicSectionBlocksForDiagnostics({
  sectionKey: "objectives",
  content: [
    "Los objetivos son los siguientes y no deben renderizarse como introduccion.",
    "Objetivo general:",
    "Analizar la relacion metodologica principal del estudio delimitado.",
    "",
    "Objetivos especificos:",
    "- OE1: Identificar los criterios tecnicos relevantes para el analisis.",
    "- OE2: Comparar las alternativas segun el alcance definido.",
  ].join("\n"),
});

const hypothesisBlocks = buildAcademicSectionBlocksForDiagnostics({
  sectionKey: "hypotheses",
  content: [
    "Hipotesis general:",
    "La estrategia propuesta permite orientar el analisis sin afirmar resultados ejecutados.",
    "",
    "Hipotesis especificas:",
    "- HE1: Los criterios seleccionados permiten organizar la comparacion metodologica.",
    "- HE2: La delimitacion del alcance reduce ambiguedades de interpretacion.",
  ].join("\n"),
});

const malformedObjectiveBlocks = buildAcademicSectionBlocksForDiagnostics({
  sectionKey: "objectives",
  content: [
    "Objetivo general:",
    "Objetivo general: Evaluar la relacion entre el problema, el metodo y el alcance definido.",
    "",
    "Objetivos especificos:",
    "- OE1: Objetivos especificos:",
    "- OE2: Identificar criterios verificables del alcance.",
    "- OE3: Comparar los indicadores con evidencia trazable.",
  ].join("\n"),
});

const malformedHypothesisBlocks = buildAcademicSectionBlocksForDiagnostics({
  sectionKey: "hypotheses",
  content: [
    "Hipotesis general:",
    "Hipotesis general: La estrategia metodologica orienta el analisis sin afirmar resultados.",
    "",
    "Hipotesis especificas:",
    "- HE1: Hipotesis especificas:",
    "- HE2: Los criterios permiten organizar la validacion pendiente.",
  ].join("\n"),
});

const variableBlocks = buildAcademicSectionBlocksForDiagnostics({
  sectionKey: "variables_or_categories",
  content: [
    "Las variables se organizan de forma operacional para facilitar la revision academica.",
    "Variable\tDimension\tIndicador\tFuente",
    "Variable independiente\tMetodo aplicado\tCriterio de seleccion\tEvidencia trazable",
    "Variable dependiente\tResultado esperado\tIndicador verificable\tEvidencia trazable",
  ].join("\n"),
});

const matrix = buildConsistencyMatrixArtifactFromSections([
  draft(
    "general_research_question",
    "Pregunta general",
    "Como se puede evaluar la estrategia metodologica central en el alcance definido?",
  ),
  draft(
    "specific_research_questions",
    "Preguntas especificas",
    [
      "- Como se identifican los criterios tecnicos relevantes?",
      "- Como se comparan las alternativas dentro del alcance delimitado?",
    ].join("\n"),
  ),
  draft(
    "general_objective",
    "Objetivo general",
    "Evaluar la estrategia metodologica central en el alcance definido.",
  ),
  draft(
    "specific_objectives",
    "Objetivos especificos",
    [
      "- Identificar los criterios tecnicos relevantes.",
      "- Comparar las alternativas dentro del alcance delimitado.",
    ].join("\n"),
  ),
  draft(
    "general_hypothesis",
    "Hipotesis general",
    "La estrategia metodologica central permite una evaluacion ordenada del alcance definido.",
  ),
  draft(
    "specific_hypotheses",
    "Hipotesis especificas",
    [
      "- Los criterios tecnicos organizan la evaluacion.",
      "- La comparacion de alternativas mejora la claridad del alcance.",
    ].join("\n"),
  ),
]);

const matrixGeneralRow = matrix.table_model?.body_rows.find((row) => row.row_id === "G");
const objectiveBulletCount = objectiveBlocks.filter((block) => block.block_type === "bullet").length;
const hypothesisBulletCount = hypothesisBlocks.filter((block) => block.block_type === "bullet").length;
const malformedObjectiveText = malformedObjectiveBlocks
  .map((block) => ("text" in block ? block.text : ""))
  .join("\n");
const malformedHypothesisText = malformedHypothesisBlocks
  .map((block) => ("text" in block ? block.text : ""))
  .join("\n");
const variableTable = variableBlocks.find((block) => block.block_type === "table");

const results: TestResult[] = [
  test(
    "word budget keeps complete sentences only",
    budgetResult.content === "La primera oracion queda completa y verificable." &&
      !hasIncompleteAcademicEnding(budgetResult.content),
    JSON.stringify(budgetResult),
  ),
  test(
    "objectives render as general plus specific bullets without intro",
    objectiveBlocks[0]?.block_type === "paragraph" &&
      /Objetivo general:/i.test(objectiveBlocks[0].text) &&
      objectiveBulletCount === 2 &&
      !objectiveBlocks.some((block) =>
        "text" in block && /Los objetivos son/i.test(block.text),
      ),
    JSON.stringify(objectiveBlocks),
  ),
  test(
    "hypotheses render as general plus specific bullets without intro",
    hypothesisBlocks[0]?.block_type === "paragraph" &&
      /Hip[o\u00f3]tesis general:/i.test(hypothesisBlocks[0].text) &&
      hypothesisBulletCount === 2,
    JSON.stringify(hypothesisBlocks),
  ),
  test(
    "malformed objective placeholder bullets are removed",
    !/OE1:\s*Objetivos/i.test(malformedObjectiveText) &&
      /OE1:\s*Identificar criterios/i.test(malformedObjectiveText) &&
      /Objetivos espec\u00edficos:/i.test(malformedObjectiveText),
    JSON.stringify(malformedObjectiveBlocks),
  ),
  test(
    "malformed hypothesis placeholder bullets are removed",
    !/HE1:\s*Hip[o\u00f3]tesis/i.test(malformedHypothesisText) &&
      /HE1:\s*Los criterios/i.test(malformedHypothesisText) &&
      /Hip[o\u00f3]tesis espec\u00edficas:/i.test(malformedHypothesisText),
    JSON.stringify(malformedHypothesisBlocks),
  ),
  test(
    "variables section can render as professional table",
    Boolean(variableTable) &&
      variableTable?.rows.length === 3 &&
      variableTable.rows[0]?.includes("Variable"),
    JSON.stringify(variableBlocks),
  ),
  test(
    "consistency matrix includes general row with general question",
    Boolean(matrixGeneralRow) &&
      /Como se puede evaluar/i.test(matrixGeneralRow?.cells[1] ?? "") &&
      /Evaluar la estrategia/i.test(matrixGeneralRow?.cells[2] ?? ""),
    JSON.stringify(matrixGeneralRow),
  ),
  test(
    "specific matrix rows preserve question-objective-hypothesis concordance",
    matrix.specific_rows.length === 2 &&
      matrix.specific_rows.every((row) => row.interrogante_especifica && row.objetivo_especifico) &&
      matrix.specific_rows.every((row) => row.hipotesis_especifica),
    JSON.stringify(matrix.specific_rows),
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

console.log(`\nAcademic structure layer self-diagnostic: ${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}
