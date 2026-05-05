import {
  buildEnforcedAcademicMetadata,
  enforceEditorialWordBudget,
  inspectAcademicEditorialPolicy,
} from "../server/blueprint-v2/editorial/academic-editorial-policy";

type TestResult = {
  name: string;
  passed: boolean;
  details?: string;
};

function test(name: string, passed: boolean, details?: string): TestResult {
  return { name, passed, details };
}

function words(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

const richContext = {
  current_title:
    "Evaluacion del uso de aisladores sismicos en edificios peruanos de mediana altura",
  method_or_technique:
    "Revision sistematica aplicada de literatura tecnica, analisis comparativo de criterios tecnicos y diseno de una matriz de evaluacion multicriterio.",
  object_of_study:
    "Uso y evaluacion de aisladores sismicos en edificios peruanos de mediana altura ubicados en zonas de alta amenaza sismica.",
  scope_or_sample:
    "Edificios peruanos de concreto armado de mediana altura, de uso residencial, educativo o administrativo.",
  problem_or_purpose:
    "El Peru se ubica en un contexto de alta sismicidad y requiere reducir la demanda sismica en edificaciones urbanas.",
  country_context: "PE",
  knowledge_area_label: "ingenieria sismorresistente",
};

const metadata = buildEnforcedAcademicMetadata(richContext);
const keywordItems = metadata.keywords_line
  .split(";")
  .map((item) => item.trim())
  .filter(Boolean);
const genericKeywords = new Set([
  "proyecto de investigacion",
  "metodologia aplicada",
  "analisis academico",
]);
const longSection = [
  "La evaluacion debe partir de criterios tecnicos verificables y de una delimitacion prudente del caso.",
  "El analisis conserva el alcance de propuesta porque la evidencia disponible no permite afirmar resultados locales definitivos.",
  "La matriz multicriterio organiza desempeno estructural, restricciones normativas, costos preliminares y condiciones de implementacion.",
  "Las fuentes adyacentes solo se usan como antecedentes y no como demostracion directa del comportamiento de aisladores en edificios peruanos.",
].join(" ");
const budgetResult = enforceEditorialWordBudget({
  content: longSection,
  max_words: 28,
  content_kind: "rich_text",
});
const duplicateObjectiveInspection = inspectAcademicEditorialPolicy({
  section_key: "specific_objectives",
  section_title: "Objetivos especificos",
  content: [
    "- OE1 Analizar criterios tecnicos para evaluar aisladores sismicos en edificios peruanos.",
    "- OE2 Comparar condiciones de aplicacion en edificios de mediana altura.",
    "- OE1 Analizar criterios tecnicos para evaluar aisladores sismicos en edificios peruanos.",
  ].join("\n"),
  word_budget: 120,
});
const overBudgetInspection = inspectAcademicEditorialPolicy({
  section_key: "justification",
  section_title: "Justificacion",
  content: longSection,
  word_budget: 20,
});

const results: TestResult[] = [
  test(
    "final title is not copied unchanged when richer context exists",
    metadata.final_title !== richContext.current_title &&
      /revision sistematica|analisis comparativo/i.test(metadata.final_title) &&
      /aisladores sismicos/i.test(metadata.final_title) &&
      /alta amenaza sismica|demanda sismica/i.test(metadata.final_title),
    metadata.final_title,
  ),
  test(
    "short method title is compact and not methodology prose",
    words(metadata.short_method_title) >= 5 &&
      words(metadata.short_method_title) <= 12 &&
      /revision sistematica|analisis comparativo/i.test(
        metadata.short_method_title,
      ) &&
      !/decision de|requiere un procedimiento|durante el desarrollo|en esta seccion/i.test(
        metadata.short_method_title,
      ),
    metadata.short_method_title,
  ),
  test(
    "keywords are one line, specific, and not generic-only",
    !metadata.keywords_line.includes("\n") &&
      keywordItems.length >= 4 &&
      keywordItems.length <= 7 &&
      keywordItems.some((item) => /aisladores sismicos/i.test(item)) &&
      keywordItems.some((item) => /revision sistematica|analisis comparativo|multicriterio/i.test(item)) &&
      !keywordItems.every((item) => genericKeywords.has(item.toLowerCase())),
    metadata.keywords_line,
  ),
  test(
    "over-budget narrative section is trimmed safely",
    budgetResult.trimmed &&
      budgetResult.final_word_count <= 28 &&
      budgetResult.original_word_count > budgetResult.final_word_count,
    JSON.stringify(budgetResult),
  ),
  test(
    "over-budget section is flagged by editorial inspection",
    overBudgetInspection.exceeds_word_budget,
    overBudgetInspection.warnings.join(", "),
  ),
  test(
    "duplicated objective content is flagged",
    duplicateObjectiveInspection.duplicated_objective_list,
    duplicateObjectiveInspection.warnings.join(", "),
  ),
  test(
    "editorial metadata enforcement uses no extra LLM calls",
    metadata.editorial_policy_extra_llm_calls === 0,
    `extra_llm_calls=${metadata.editorial_policy_extra_llm_calls}`,
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
  `\nEditorial output enforcement tests: ${results.length - failed.length}/${results.length} passed`,
);

if (failed.length > 0) {
  process.exitCode = 1;
}

