import {
  buildAcademicEditorialPolicy,
  buildKeywordsLine,
  buildShortHeaderTitle,
  buildTitleReformulationInstruction,
  inspectAcademicEditorialPolicy,
  recommendedContentKindForSection,
  suggestAcademicTitle,
} from "../server/blueprint-v2/editorial/academic-editorial-policy";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function assertTest(name: string, condition: boolean, details?: string): TestResult {
  return { name, passed: condition, details };
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

const titleInput = {
  current_title:
    "Evaluacion de una estrategia academica para mejorar un problema aplicado",
  method_or_technique: "analisis comparativo aplicado",
  object_of_study: "adherencia al tratamiento en pacientes cronicos",
  scope_or_sample: "hospitales publicos de Lima",
  problem_or_purpose: "baja continuidad del seguimiento clinico",
  country_context: "PE",
};

const titleInstruction = buildTitleReformulationInstruction(titleInput);
const suggestedTitle = suggestAcademicTitle(titleInput);
const shortHeader = buildShortHeaderTitle(titleInput);
const keywordsLine = buildKeywordsLine({
  ...titleInput,
  knowledge_area_label: "salud publica",
});
const badOpening = inspectAcademicEditorialPolicy({
  section_key: "problem_statement",
  section_title: "Planteamiento del problema",
  content:
    "El planteamiento del problema es el punto de partida del estudio. Luego se describe el caso.",
  word_budget: 80,
});
const duplicatedObjectives = inspectAcademicEditorialPolicy({
  section_key: "specific_objectives",
  section_title: "Objetivos especificos",
  content: [
    "- OE1 Analizar la continuidad del seguimiento clinico en el caso delimitado.",
    "- OE2 Identificar barreras de adherencia en la muestra prevista.",
    "- OE1 Analizar la continuidad del seguimiento clinico en el caso delimitado.",
  ].join("\n"),
  word_budget: 120,
});
const keywordInspection = inspectAcademicEditorialPolicy({
  section_key: "keywords",
  section_title: "Palabras clave",
  content: keywordsLine,
  word_budget: 35,
});
const policy = buildAcademicEditorialPolicy({
  country_context: "PE",
  knowledge_area_label: "salud publica",
  template_key: "UPC",
});

const tests: TestResult[] = [
  assertTest(
    "title rule carries method, scope, and problem",
    titleInstruction.includes("metodo/enfoque") &&
      titleInstruction.includes(titleInput.method_or_technique) &&
      suggestedTitle.includes(titleInput.scope_or_sample) &&
      suggestedTitle.includes(titleInput.problem_or_purpose),
    suggestedTitle,
  ),
  assertTest(
    "short header is method-focused and not arbitrary truncation",
    wordCount(shortHeader) <= 12 &&
      shortHeader.includes("analisis comparativo") &&
      shortHeader.includes("adherencia") &&
      shortHeader !== titleInput.current_title.slice(0, shortHeader.length),
    shortHeader,
  ),
  assertTest(
    "keywords are one line with 4-7 semicolon-separated items",
    !keywordsLine.includes("\n") &&
      keywordsLine.split(";").map((item) => item.trim()).filter(Boolean)
        .length >= 4 &&
      keywordsLine.split(";").map((item) => item.trim()).filter(Boolean)
        .length <= 7 &&
      !keywordInspection.keywords_not_one_line &&
      !keywordInspection.keywords_item_count_invalid,
    keywordsLine,
  ),
  assertTest(
    "generic problem-opening phrase is flagged",
    badOpening.generic_opening_phrase && badOpening.opening_repeats_heading,
    badOpening.warnings.join(", "),
  ),
  assertTest(
    "duplicated objective list is flagged",
    duplicatedObjectives.duplicated_objective_list,
    duplicatedObjectives.warnings.join(", "),
  ),
  assertTest(
    "bullet-eligible sections request bullet structure",
    recommendedContentKindForSection("specific_objectives", "rich_text") ===
      "bullet_list" &&
      recommendedContentKindForSection("theoretical_framework", "rich_text") ===
        "rich_text",
  ),
  assertTest(
    "master and institutional word/page budgets exist",
    policy.master_target_pages === 15 &&
      policy.institutional_target_pages === 10 &&
      policy.target_word_budget_by_section.methodology > 0 &&
      policy.target_word_budget_by_section.keywords > 0,
  ),
];

const failed = tests.filter((test) => !test.passed);

for (const test of tests) {
  const status = test.passed ? "PASS" : "FAIL";
  console.log(`${status} ${test.name}${test.details ? ` :: ${test.details}` : ""}`);
}

console.log(`\nAcademic editorial policy tests: ${tests.length - failed.length}/${tests.length} passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}

