import { createHash } from "node:crypto";

import type { LlmProvider, TextGenerationResult } from "@/llm/provider";
import type { ConsistencyMatrixRow, MasterSectionDraft } from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

type MatrixStatus = "pass" | "warn" | "blocked";
type RowStatus = "complete" | "partial" | "blocked";
type DerivationSource =
  | "draft"
  | "llm_aligned"
  | "objective_to_question_rule"
  | "general_fallback"
  | "missing";

export type ConsistencyMatrixSpecificRow = {
  index: number;
  row_id?: string;
  interrogante_especifica: string | null;
  objetivo_especifico: string | null;
  hipotesis_especifica: string | null;
  variable_o_categoria?: string | null;
  dimension_o_criterio?: string | null;
  metodo_vinculado?: string | null;
  tecnica?: string | null;
  instrumento?: string | null;
  alignment_score?: number;
  question_derivation_source: DerivationSource;
  objective_derivation_source: DerivationSource;
  hypothesis_derivation_source: DerivationSource;
  status: RowStatus;
  warnings: string[];
};

export type ConsistencyMatrixArtifact = {
  artifact_type: "consistency_matrix";
  artifact_version: "v2_upt_compatible" | "v3_llm_aligned";
  generated_at: string;
  llm_used: boolean;
  llm_generation?: {
    provider: string;
    model: string;
    model_tier: "low" | "medium" | "high" | "unknown";
    tracking_label: string;
    input_hash: string;
    prompt_char_count: number;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    cost_cad: number;
    duration_ms: number;
  } | null;
  status: MatrixStatus;
  can_continue_step_11: boolean;
  general_block: {
    problema_principal: string | null;
    objetivo_general: string | null;
    hipotesis_general: string | null;
  };
  specific_rows: ConsistencyMatrixSpecificRow[];
  variables_block: {
    variable_independiente: string | null;
    indicadores_independiente: string[];
    variable_dependiente: string | null;
    indicadores_dependiente: string[];
    categorias: string[];
  };
  methodology_block: {
    tipo_investigacion: string | null;
    diseno_investigacion: string | null;
    ambito_estudio: string | null;
    poblacion: string | null;
    muestra: string | null;
    tecnicas_recoleccion: string[];
    instrumentos: string[];
    plan_analisis: string | null;
  };
  validation: {
    row_alignment_ok: boolean;
    required_inputs_present: boolean;
    blocked_reasons: string[];
    warnings: string[];
    source_section_keys: string[];
    weak_source_section_keys: string[];
    fallback_source_section_keys: string[];
    derived_field_count: number;
    missing_field_count: number;
    row_alignment_scores?: Array<{
      row_id: string;
      score: number;
      status: RowStatus;
      warnings: string[];
    }>;
    llm_validation_warnings?: string[];
  };
  table_model?: ConsistencyMatrixTableModel;
  legacy_rows: ConsistencyMatrixRow[];
};

export type ConsistencyMatrixTableModel = {
  orientation: "landscape";
  caption: string;
  columns: Array<{
    key: string;
    label: string;
    width_pct: number;
    align: "left" | "center";
  }>;
  header_rows: string[][];
  body_rows: Array<{
    row_id: string;
    cells: string[];
    warnings: string[];
  }>;
  render_hints: {
    repeat_header: true;
    font_size_pt: number;
    table_width_pct: number;
    autofit: false;
    allow_page_break_inside_rows: false;
    cell_padding_twips: number;
  };
};

const MATRIX_SOURCE_KEYS = [
  "problem_statement",
  "research_questions",
  "general_research_question",
  "specific_research_questions",
  "general_objective",
  "specific_objectives",
  "hypotheses",
  "general_hypothesis",
  "specific_hypotheses",
  "variables_or_categories",
  "variables_indicators",
  "methodology",
  "methodological_approach",
  "research_design",
  "population_and_sample",
  "data_collection_techniques",
  "research_instruments",
  "analysis_plan",
] as const;

const STOPWORDS = new Set([
  "para",
  "como",
  "cual",
  "cuales",
  "que",
  "del",
  "los",
  "las",
  "una",
  "uno",
  "con",
  "por",
  "sobre",
  "entre",
  "desde",
  "esta",
  "este",
  "estos",
  "estas",
  "investigacion",
  "proyecto",
  "estudio",
  "caso",
  "marco",
  "criterios",
  "criterio",
]);

type LlmConsistencyMatrixResponse = {
  general_block: ConsistencyMatrixArtifact["general_block"];
  specific_rows: Array<{
    row_id: string;
    interrogante_especifica: string;
    objetivo_especifico: string;
    hipotesis_especifica: string | null;
    variable_o_categoria: string | null;
    dimension_o_criterio: string | null;
    metodo_vinculado: string | null;
    tecnica: string | null;
    instrumento: string | null;
  }>;
  variables_block: ConsistencyMatrixArtifact["variables_block"];
  methodology_block: ConsistencyMatrixArtifact["methodology_block"];
  unresolved_gaps: string[];
  confidence_notes: string[];
};

type LlmHypothesisRepairResponse = {
  repairs: Array<{
    row_id: string;
    hipotesis_especifica: string;
  }>;
};

function createTextHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function normalizeForCompare(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticTerms(value: string | null | undefined) {
  return normalizeForCompare(value)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 4)
    .filter((term) => !STOPWORDS.has(term))
    .map((term) =>
      term
        .replace(/(cion|ciones|mente|idad|idades|amiento|amientos|acion|aciones)$/i, "")
        .replace(/(es|s)$/i, ""),
    )
    .filter((term) => term.length >= 4);
}

function lexicalOverlapScore(left: string | null | undefined, right: string | null | undefined) {
  const leftTerms = new Set(semanticTerms(left));
  const rightTerms = new Set(semanticTerms(right));

  if (leftTerms.size === 0 || rightTerms.size === 0) {
    return 0;
  }

  const intersection = Array.from(leftTerms).filter((term) => rightTerms.has(term)).length;

  return Number((intersection / Math.max(leftTerms.size, rightTerms.size)).toFixed(3));
}

function safeJsonParse<T>(value: string): T {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error("La respuesta LLM no contiene un objeto JSON.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
}

function cleanMatrixField(value: string | null | undefined, maxLength = 520) {
  const normalized = compactMatrixText(value, maxLength)
    .replace(/\|---+\|?/g, "")
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .trim();

  return normalized && !isPlaceholder(normalized) ? normalized : null;
}

function getDraft(drafts: MasterSectionDraft[], key: string) {
  return drafts.find((draft) => draft.section_key === key) ?? null;
}

function getSectionContent(drafts: MasterSectionDraft[], key: string, fallback = "") {
  return getDraft(drafts, key)?.content ?? fallback;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripReferenceLikeParentheticals(value: string) {
  return value
    .replace(
      /\(([^)]*(?:adaptive reuse|framework|existing building|existing buildings|urban buildings|dirty laundry|multi-criteria|ecosystem services|demolition)[^)]*)\)/gi,
      "",
    )
    .replace(/\(([^)]{70,})\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function compactMatrixText(value: string | null | undefined, maxLength = 360) {
  const normalized = stripReferenceLikeParentheticals(normalizeText(value));

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxLength);
  const sentenceBoundary = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf(";"));

  return `${clipped.slice(0, sentenceBoundary > 120 ? sentenceBoundary + 1 : maxLength).trim()}...`;
}

function stripListPrefix(value: string) {
  return value
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^\s*\d+[\).\-\s]+/, "")
    .replace(/^\s*[a-zA-Z][\).\-\s]+/, "")
    .trim();
}

function isPlaceholder(value: string | null | undefined) {
  return /por precisar|pendiente|sin dato|no disponible|por definir|falta/i.test(value ?? "");
}

function isHeadingOnly(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  return [
    "objetivos especificos",
    "problemas especificos",
    "hipotesis especificas",
    "metodologia",
    "diseno de investigacion",
    "tipo de investigacion",
    "tipo de investigacion aplicada",
    "nivel de investigacion",
    "poblacion y muestra",
    "poblacion de estudio",
    "analisis de datos",
    "tecnicas e instrumentos",
    "tecnicas de recoleccion de datos",
    "instrumentos",
    "variables",
    "variables o categorias",
  ].includes(normalized);
}

function parseListItems(content: string) {
  return normalizeText(content)
    .split(/\r?\n/)
    .map(stripListPrefix)
    .map((line) => compactMatrixText(line.replace(/\s+/g, " ").trim(), 420))
    .filter((line) => line.length > 0)
    .filter((line) => !isHeadingOnly(line))
    .filter((line) => !/^tabla\s+\d+/i.test(line))
    .filter((line) => !/^figura\s+\d+/i.test(line));
}

function firstMeaningfulText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = compactMatrixText(value);
    if (normalized && !isPlaceholder(normalized)) {
      return normalized;
    }
  }

  return null;
}

function firstMeaningfulLine(content: string) {
  return parseListItems(content).find((line) => !isPlaceholder(line)) ?? null;
}

function findLineContaining(content: string, patterns: RegExp[]) {
  const lines = parseListItems(content);

  return (
    lines.find((line) => patterns.some((pattern) => pattern.test(line))) ??
    null
  );
}

function findQuestion(content: string) {
  const lines = parseListItems(content);

  return (
    lines.find((line) => /\?/.test(line)) ??
    lines.find((line) => /^(como|cual|que|de que manera|en que medida)\b/i.test(line)) ??
    null
  );
}

function deriveQuestionFromObjective(objective: string) {
  const normalized = objective.replace(/^[*-]\s*/, "").replace(/[.]+$/g, "").trim();

  if (!normalized) {
    return "Pregunta por afinar con el asesor.";
  }

  const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  const verbMatch = lowered.match(
    /^(identificar|describir|analizar|evaluar|determinar|establecer|proponer|examinar|comparar|estimar)\s+(.+)$/i,
  );

  if (!verbMatch) {
    return `Como se manifiesta ${lowered}?`;
  }

  const [, verb, remainder] = verbMatch;

  switch (verb.toLowerCase()) {
    case "identificar":
      return `Que elementos permiten identificar ${remainder}?`;
    case "describir":
      return `Como se caracteriza ${remainder}?`;
    case "analizar":
    case "examinar":
      return `Como se relaciona ${remainder} con el problema de investigacion?`;
    case "evaluar":
    case "estimar":
      return `En que medida ${remainder}?`;
    case "determinar":
    case "establecer":
      return `Que relacion existe respecto de ${remainder}?`;
    case "comparar":
      return `Que diferencias o similitudes se observan en ${remainder}?`;
    case "proponer":
      return `Que lineamientos resultan pertinentes para ${remainder}?`;
    default:
      return `Como se manifiesta ${lowered}?`;
  }
}

function getSpecificObjectives(drafts: MasterSectionDraft[]) {
  return parseListItems(getSectionContent(drafts, "specific_objectives")).filter(
    (line) => !/^objetivo general/i.test(line),
  );
}

function getSpecificQuestions(drafts: MasterSectionDraft[]) {
  return parseListItems(getSectionContent(drafts, "specific_research_questions")).filter(
    (line) => /\?|^(como|cual|que|de que manera|en que medida)\b/i.test(line),
  );
}

function getSpecificHypotheses(drafts: MasterSectionDraft[]) {
  return parseListItems(getSectionContent(drafts, "specific_hypotheses")).filter(
    (line) => !/^hipotesis general/i.test(line),
  );
}

function extractGeneralBlock(drafts: MasterSectionDraft[]) {
  const researchQuestions = getSectionContent(drafts, "research_questions");

  return {
    problema_principal: firstMeaningfulText(
      getSectionContent(drafts, "general_research_question"),
      findQuestion(researchQuestions),
      firstMeaningfulLine(getSectionContent(drafts, "problem_statement")),
    ),
    objetivo_general: firstMeaningfulText(
      getSectionContent(drafts, "general_objective"),
      firstMeaningfulLine(getSectionContent(drafts, "objectives")),
    ),
    hipotesis_general: firstMeaningfulText(
      getSectionContent(drafts, "general_hypothesis"),
      firstMeaningfulLine(getSectionContent(drafts, "hypotheses")),
    ),
  };
}

function extractVariablesBlock(drafts: MasterSectionDraft[]) {
  const content = [
    getSectionContent(drafts, "variables_or_categories"),
    getSectionContent(drafts, "variables_indicators"),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join("\n");
  const lines = parseListItems(content);
  const independentLine = lines.find((line) => /independiente|variable\s+x/i.test(line)) ?? null;
  const dependentLine = lines.find((line) => /dependiente|variable\s+y/i.test(line)) ?? null;
  const indicatorLines = lines.filter((line) => /indicador/i.test(line));
  const categoryLines = lines.filter((line) => /categoria|subcategoria/i.test(line));

  return {
    variable_independiente: independentLine,
    indicadores_independiente: indicatorLines
      .filter((line) => /independiente|variable\s+x/i.test(line))
      .slice(0, 8),
    variable_dependiente: dependentLine,
    indicadores_dependiente: indicatorLines
      .filter((line) => /dependiente|variable\s+y/i.test(line))
      .slice(0, 8),
    categorias: categoryLines.slice(0, 10),
  };
}

function extractMethodologyBlock(drafts: MasterSectionDraft[]) {
  const methodology = getSectionContent(drafts, "methodology");
  const methodologicalApproach = getSectionContent(drafts, "methodological_approach");
  const design = getSectionContent(drafts, "research_design");
  const populationSample = getSectionContent(drafts, "population_and_sample");
  const techniques = parseListItems(getSectionContent(drafts, "data_collection_techniques"));
  const instruments = parseListItems(getSectionContent(drafts, "research_instruments"));
  const analysisPlan = getSectionContent(drafts, "analysis_plan");

  return {
    tipo_investigacion: firstMeaningfulText(
      findLineContaining(methodologicalApproach, [/tipo/i, /enfoque/i, /nivel/i]),
      findLineContaining(methodology, [/tipo/i, /enfoque/i, /nivel/i]),
      firstMeaningfulLine(methodologicalApproach),
    ),
    diseno_investigacion: firstMeaningfulText(
      findLineContaining(design, [/dise/i]),
      findLineContaining(methodology, [/dise/i]),
      firstMeaningfulLine(design),
    ),
    ambito_estudio: firstMeaningfulText(
      findLineContaining(methodology, [/ambito/i, /lugar/i, /contexto/i]),
      findLineContaining(populationSample, [/ambito/i, /lugar/i, /contexto/i]),
    ),
    poblacion: firstMeaningfulText(
      findLineContaining(populationSample, [/poblacion/i]),
      firstMeaningfulLine(populationSample),
    ),
    muestra: firstMeaningfulText(findLineContaining(populationSample, [/muestra/i])),
    tecnicas_recoleccion: techniques.slice(0, 8).map((line) => compactMatrixText(line, 320)),
    instrumentos: instruments.slice(0, 8).map((line) => compactMatrixText(line, 320)),
    plan_analisis: firstMeaningfulText(analysisPlan, findLineContaining(methodology, [/analisis/i])),
  };
}

function buildSpecificRows(input: {
  objectives: string[];
  questions: string[];
  hypotheses: string[];
}) {
  const rowCount = Math.max(
    input.objectives.length,
    input.questions.length,
    input.hypotheses.length,
    0,
  );
  const rows: ConsistencyMatrixSpecificRow[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const objective = input.objectives[index] ?? null;
    const question = input.questions[index] ?? (objective ? deriveQuestionFromObjective(objective) : null);
    const hypothesis = input.hypotheses[index] ?? null;
    const warnings: string[] = [];
    const questionSource: DerivationSource = input.questions[index]
      ? "draft"
      : objective
        ? "objective_to_question_rule"
        : "missing";
    const objectiveSource: DerivationSource = objective ? "draft" : "missing";
    const hypothesisSource: DerivationSource = hypothesis ? "draft" : "missing";

    if (!objective) {
      warnings.push("Falta objetivo especifico para esta fila.");
    }

    if (!input.questions[index] && objective) {
      warnings.push("Pregunta especifica derivada desde el objetivo; requiere confirmacion.");
    } else if (!question) {
      warnings.push("Falta interrogante especifica para esta fila.");
    }

    if (!hypothesis) {
      warnings.push("Hipotesis especifica no disponible; puede ser no aplicable segun enfoque.");
    }

    rows.push({
      index: index + 1,
      row_id: `OE${index + 1}`,
      interrogante_especifica: question,
      objetivo_especifico: objective,
      hipotesis_especifica: hypothesis,
      alignment_score: lexicalOverlapScore(question, objective),
      question_derivation_source: questionSource,
      objective_derivation_source: objectiveSource,
      hypothesis_derivation_source: hypothesisSource,
      status: !objective || !question ? "blocked" : warnings.length > 0 ? "partial" : "complete",
      warnings,
    });
  }

  return rows;
}

function getWeakSourceSections(drafts: MasterSectionDraft[]) {
  return drafts
    .filter((draft) => {
      if (!MATRIX_SOURCE_KEYS.includes(draft.section_key as (typeof MATRIX_SOURCE_KEYS)[number])) {
        return false;
      }

      const words = normalizeText(draft.content).split(/\s+/).filter(Boolean).length;

      return (
        words < 12 ||
        Boolean(draft.fallback_cause && draft.fallback_cause !== "deterministic_section") ||
        draft.quality_checks?.language_pass === false ||
        draft.quality_checks?.required_structure_pass === false
      );
    })
    .map((draft) => draft.section_key);
}

function getFallbackSourceSections(drafts: MasterSectionDraft[]) {
  return drafts
    .filter(
      (draft) =>
        MATRIX_SOURCE_KEYS.includes(draft.section_key as (typeof MATRIX_SOURCE_KEYS)[number]) &&
        Boolean(draft.fallback_cause),
    )
    .map((draft) => draft.section_key);
}

function buildValidation(input: {
  drafts: MasterSectionDraft[];
  generalBlock: ConsistencyMatrixArtifact["general_block"];
  rows: ConsistencyMatrixSpecificRow[];
  variablesBlock: ConsistencyMatrixArtifact["variables_block"];
  methodologyBlock: ConsistencyMatrixArtifact["methodology_block"];
  objectives: string[];
  questions: string[];
  hypotheses: string[];
}) {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  if (!input.generalBlock.problema_principal) {
    blockedReasons.push("Falta problema principal o pregunta general.");
  }

  if (!input.generalBlock.objetivo_general) {
    blockedReasons.push("Falta objetivo general.");
  }

  if (input.objectives.length === 0) {
    blockedReasons.push("Faltan objetivos especificos.");
  }

  if (input.rows.some((row) => row.status === "blocked")) {
    blockedReasons.push("Hay filas especificas sin objetivo o pregunta.");
  }

  if (!input.methodologyBlock.tipo_investigacion && !input.methodologyBlock.diseno_investigacion) {
    blockedReasons.push("Falta tipo o diseno de investigacion.");
  }

  if (
    !input.methodologyBlock.poblacion &&
    !input.methodologyBlock.muestra &&
    input.methodologyBlock.tecnicas_recoleccion.length === 0
  ) {
    blockedReasons.push("Faltan poblacion/muestra o tecnicas de recoleccion.");
  }

  if (!input.generalBlock.hipotesis_general) {
    warnings.push("Hipotesis general ausente; puede ser aceptable si el enfoque no la requiere.");
  }

  if (input.questions.length !== input.objectives.length) {
    warnings.push(
      `Cantidad de preguntas especificas (${input.questions.length}) no coincide con objetivos especificos (${input.objectives.length}).`,
    );
  }

  if (input.hypotheses.length > 0 && input.hypotheses.length !== input.objectives.length) {
    warnings.push(
      `Cantidad de hipotesis especificas (${input.hypotheses.length}) no coincide con objetivos especificos (${input.objectives.length}).`,
    );
  }

  if (!input.variablesBlock.variable_independiente && !input.variablesBlock.variable_dependiente) {
    warnings.push("No se detectaron variables independiente/dependiente explicitas.");
  }

  const rowAlignmentScores = input.rows.map((row, index) => {
    const questionObjectiveScore = lexicalOverlapScore(
      row.interrogante_especifica,
      row.objetivo_especifico,
    );
    const hypothesisObjectiveScore = row.hipotesis_especifica
      ? lexicalOverlapScore(row.hipotesis_especifica, row.objetivo_especifico)
      : 0;
    const score = Number(
      Math.max(questionObjectiveScore, questionObjectiveScore * 0.75 + hypothesisObjectiveScore * 0.25).toFixed(3),
    );
    const rowWarnings = [
      score < 0.08 && row.interrogante_especifica && row.objetivo_especifico
        ? "Baja correspondencia semantica entre interrogante y objetivo."
        : null,
      row.hipotesis_especifica && hypothesisObjectiveScore < 0.05
        ? "La hipotesis no comparte suficiente nucleo conceptual con el objetivo."
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      row_id: row.row_id ?? `OE${index + 1}`,
      score,
      status: row.status,
      warnings: rowWarnings,
    };
  });

  if (rowAlignmentScores.some((row) => row.warnings.length > 0)) {
    warnings.push("Algunas filas tienen correspondencia semantica debil entre pregunta, objetivo o hipotesis.");
  }

  const weakSourceSectionKeys = getWeakSourceSections(input.drafts);
  const fallbackSourceSectionKeys = getFallbackSourceSections(input.drafts);

  if (weakSourceSectionKeys.length > 0) {
    warnings.push(`Secciones base debiles para matriz: ${weakSourceSectionKeys.join(", ")}.`);
  }

  if (fallbackSourceSectionKeys.length > 0) {
    warnings.push(
      `Secciones base con fallback o derivacion deterministica: ${fallbackSourceSectionKeys.join(", ")}.`,
    );
  }

  const derivedFieldCount = input.rows.filter(
    (row) =>
      row.question_derivation_source !== "draft" ||
      row.objective_derivation_source !== "draft" ||
      row.hypothesis_derivation_source !== "draft",
  ).length;
  const missingFieldCount =
    [
      input.generalBlock.problema_principal,
      input.generalBlock.objetivo_general,
      input.methodologyBlock.tipo_investigacion,
      input.methodologyBlock.diseno_investigacion,
      input.methodologyBlock.poblacion,
    ].filter((value) => !value).length +
    input.rows.reduce(
      (sum, row) =>
        sum +
        (row.interrogante_especifica ? 0 : 1) +
        (row.objetivo_especifico ? 0 : 1) +
        (row.hipotesis_especifica ? 0 : 1),
      0,
    );

  return {
    row_alignment_ok:
      input.objectives.length > 0 &&
      input.questions.length === input.objectives.length &&
      (input.hypotheses.length === 0 || input.hypotheses.length === input.objectives.length) &&
      rowAlignmentScores.every((row) => row.warnings.length === 0),
    required_inputs_present: blockedReasons.length === 0,
    blocked_reasons: blockedReasons,
    warnings,
    source_section_keys: MATRIX_SOURCE_KEYS.filter((key) => Boolean(getDraft(input.drafts, key))),
    weak_source_section_keys: weakSourceSectionKeys,
    fallback_source_section_keys: fallbackSourceSectionKeys,
    derived_field_count: derivedFieldCount,
    missing_field_count: missingFieldCount,
    row_alignment_scores: rowAlignmentScores,
    llm_validation_warnings: [],
  };
}

function summarizeMethod(methodology: ConsistencyMatrixArtifact["methodology_block"]) {
  return [
    methodology.tipo_investigacion,
    methodology.diseno_investigacion,
    methodology.poblacion,
    methodology.muestra,
    methodology.plan_analisis,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLegacyRows(input: {
  rows: ConsistencyMatrixSpecificRow[];
  generalBlock: ConsistencyMatrixArtifact["general_block"];
  methodologyBlock: ConsistencyMatrixArtifact["methodology_block"];
}) {
  const method =
    summarizeMethod(input.methodologyBlock) || "Metodologia por precisar con mayor detalle.";
  const technique =
    input.methodologyBlock.tecnicas_recoleccion[0] ||
    input.methodologyBlock.instrumentos[0] ||
    "Tecnica por precisar segun el diseno final.";
  const rows = input.rows
    .filter((row) => row.objetivo_especifico || row.interrogante_especifica)
    .map((row) => ({
      objective: row.objetivo_especifico ?? "Objetivo especifico por precisar.",
      question: row.interrogante_especifica ?? "Pregunta especifica por precisar.",
      method: row.metodo_vinculado ?? method,
      technique: row.tecnica ?? row.instrumento ?? technique,
    }));

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      objective: input.generalBlock.objetivo_general ?? "Objetivo general por precisar.",
      question: input.generalBlock.problema_principal ?? "Pregunta general por precisar.",
      method,
      technique,
    },
  ];
}

function buildTableModel(input: {
  rows: ConsistencyMatrixSpecificRow[];
  methodologyBlock: ConsistencyMatrixArtifact["methodology_block"];
}): ConsistencyMatrixTableModel {
  const columns = [
    { key: "codigo", label: "Codigo", width_pct: 6, align: "center" as const },
    { key: "interrogante", label: "Interrogante especifica", width_pct: 22, align: "left" as const },
    { key: "objetivo", label: "Objetivo especifico", width_pct: 22, align: "left" as const },
    { key: "hipotesis", label: "Hipotesis especifica", width_pct: 18, align: "left" as const },
    { key: "variable", label: "Variable/categoria", width_pct: 13, align: "left" as const },
    { key: "metodo", label: "Metodo", width_pct: 10, align: "left" as const },
    { key: "tecnica", label: "Tecnica/instrumento", width_pct: 9, align: "left" as const },
  ];

  return {
    orientation: "landscape",
    caption: "Matriz de consistencia",
    columns,
    header_rows: [columns.map((column) => column.label)],
    body_rows: input.rows.map((row, index) => ({
      row_id: row.row_id ?? `OE${index + 1}`,
      cells: [
        row.row_id ?? `OE${index + 1}`,
        row.interrogante_especifica ?? "Por precisar",
        row.objetivo_especifico ?? "Por precisar",
        row.hipotesis_especifica ?? "No aplica / por precisar",
        row.variable_o_categoria ?? row.dimension_o_criterio ?? "Por precisar",
        row.metodo_vinculado ?? input.methodologyBlock.tipo_investigacion ?? "Por precisar",
        [row.tecnica, row.instrumento].filter(Boolean).join(" / ") ||
          input.methodologyBlock.tecnicas_recoleccion[0] ||
          input.methodologyBlock.instrumentos[0] ||
          "Por precisar",
      ],
      warnings: row.warnings,
    })),
    render_hints: {
      repeat_header: true,
      font_size_pt: 8,
      table_width_pct: 100,
      autofit: false,
      allow_page_break_inside_rows: false,
      cell_padding_twips: 90,
    },
  };
}

function buildLlmInputSections(drafts: MasterSectionDraft[]) {
  return MATRIX_SOURCE_KEYS.map((key) => {
    const draft = getDraft(drafts, key);

    if (!draft) {
      return null;
    }

    return {
      section_key: key,
      support_level: draft.support_level,
      fallback_cause: draft.fallback_cause ?? null,
      warnings: (draft.warnings ?? []).slice(0, 3),
      content: clipText(normalizeText(draft.content), 1600),
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildLlmMatrixPrompt(input: {
  baseline: ConsistencyMatrixArtifact;
  drafts: MasterSectionDraft[];
}) {
  const payload = {
    baseline_general_block: input.baseline.general_block,
    baseline_specific_rows: input.baseline.specific_rows.map((row) => ({
      row_id: row.row_id,
      interrogante_especifica: row.interrogante_especifica,
      objetivo_especifico: row.objetivo_especifico,
      hipotesis_especifica: row.hipotesis_especifica,
      warnings: row.warnings,
    })),
    baseline_variables_block: input.baseline.variables_block,
    baseline_methodology_block: input.baseline.methodology_block,
    source_sections: buildLlmInputSections(input.drafts),
  };

  return [
    "Eres un metodologo academico senior. Tu tarea es redactar una matriz de consistencia para un PROYECTO de investigacion de maestria.",
    "No redactes una tesis completa. No inventes datos, resultados, validaciones locales ni citas.",
    "Usa exclusivamente el contenido generado en Step 9 que aparece en el JSON de entrada.",
    "Debes mejorar la correspondencia conceptual entre interrogante, objetivo e hipotesis.",
    "Reglas:",
    "- escribe todo en espanol academico claro",
    "- no incluyas Markdown, tablas Markdown, autores, anios, source_id, evidence_id ni titulos de fuentes",
    "- usa de 3 a 5 filas especificas, salvo que los drafts obliguen otra cantidad",
    "- cada fila debe tener el mismo nucleo conceptual en interrogante, objetivo e hipotesis",
    "- no devuelvas hipotesis_especifica null si existe interrogante y objetivo en la fila",
    "- si el enfoque no justifica hipotesis causal, redacta una hipotesis de trabajo o supuesto orientador prudente, claramente preliminar",
    "- variables pueden ser categorias/criterios si el estudio es propositivo, evaluativo o cualitativo aplicado",
    "- metodologia, tecnica e instrumento deben ser consistentes con el Step 9, no conjeturados fuera del contenido",
    "- si algo falta, usa null y registra el gap; no rellenes con fantasia",
    "",
    "Devuelve SOLO JSON valido con esta forma exacta:",
    JSON.stringify(
      {
        general_block: {
          problema_principal: "string|null",
          objetivo_general: "string|null",
          hipotesis_general: "string|null",
        },
        specific_rows: [
          {
            row_id: "OE1",
            interrogante_especifica: "string",
            objetivo_especifico: "string",
            hipotesis_especifica: "string|null",
            variable_o_categoria: "string|null",
            dimension_o_criterio: "string|null",
            metodo_vinculado: "string|null",
            tecnica: "string|null",
            instrumento: "string|null",
          },
        ],
        variables_block: {
          variable_independiente: "string|null",
          indicadores_independiente: ["string"],
          variable_dependiente: "string|null",
          indicadores_dependiente: ["string"],
          categorias: ["string"],
        },
        methodology_block: {
          tipo_investigacion: "string|null",
          diseno_investigacion: "string|null",
          ambito_estudio: "string|null",
          poblacion: "string|null",
          muestra: "string|null",
          tecnicas_recoleccion: ["string"],
          instrumentos: ["string"],
          plan_analisis: "string|null",
        },
        unresolved_gaps: ["string"],
        confidence_notes: ["string"],
      },
      null,
      2,
    ),
    "",
    "JSON de entrada:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildHypothesisRepairPrompt(input: {
  response: LlmConsistencyMatrixResponse;
}) {
  const rows = input.response.specific_rows
    .filter((row) => !cleanMatrixField(row.hipotesis_especifica, 520))
    .map((row) => ({
      row_id: row.row_id,
      interrogante_especifica: row.interrogante_especifica,
      objetivo_especifico: row.objetivo_especifico,
      variable_o_categoria: row.variable_o_categoria,
      metodo_vinculado: row.metodo_vinculado,
    }));

  return [
    "Completa SOLO las hipotesis faltantes de una matriz de consistencia para un proyecto de maestria.",
    "No inventes datos, resultados, validaciones locales ni citas.",
    "Redacta hipotesis de trabajo prudentes y preliminares, alineadas con la interrogante y el objetivo de la misma fila.",
    "Devuelve SOLO JSON valido con esta forma exacta:",
    JSON.stringify(
      {
        repairs: [
          {
            row_id: "OE1",
            hipotesis_especifica: "string",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Filas a reparar:",
    JSON.stringify(rows, null, 2),
  ].join("\n");
}

function applyHypothesisRepairs(input: {
  response: LlmConsistencyMatrixResponse;
  repairs: LlmHypothesisRepairResponse;
}) {
  const repairMap = new Map(
    input.repairs.repairs.map((repair) => [
      repair.row_id.trim(),
      cleanMatrixField(repair.hipotesis_especifica, 520),
    ]),
  );

  return {
    ...input.response,
    specific_rows: input.response.specific_rows.map((row) => {
      if (cleanMatrixField(row.hipotesis_especifica, 520)) {
        return row;
      }

      return {
        ...row,
        hipotesis_especifica: repairMap.get(row.row_id.trim()) ?? row.hipotesis_especifica,
      };
    }),
  };
}

function mergeDetailedResults(
  main: TextGenerationResult,
  repair: TextGenerationResult,
): TextGenerationResult {
  return {
    text: main.text,
    usage: {
      provider: main.usage.provider,
      model: main.usage.model,
      inputTokens: main.usage.inputTokens + repair.usage.inputTokens,
      cachedInputTokens: main.usage.cachedInputTokens + repair.usage.cachedInputTokens,
      outputTokens: main.usage.outputTokens + repair.usage.outputTokens,
      totalTokens: main.usage.totalTokens + repair.usage.totalTokens,
      costUsd: Number((main.usage.costUsd + repair.usage.costUsd).toFixed(6)),
      costCad: Number((main.usage.costCad + repair.usage.costCad).toFixed(6)),
      durationMs: main.usage.durationMs + repair.usage.durationMs,
    },
  };
}

function sanitizeLlmRows(rows: LlmConsistencyMatrixResponse["specific_rows"]) {
  return rows.slice(0, 6).map((row, index) => {
    const rowId = cleanMatrixField(row.row_id, 24) ?? `OE${index + 1}`;
    const question = cleanMatrixField(row.interrogante_especifica);
    const objective = cleanMatrixField(row.objetivo_especifico);
    const hypothesis = cleanMatrixField(row.hipotesis_especifica);
    const score = lexicalOverlapScore(question, objective);
    const warnings = [
      !question ? "Falta interrogante especifica." : null,
      !objective ? "Falta objetivo especifico." : null,
      !hypothesis ? "Falta hipotesis de trabajo o supuesto orientador para esta fila." : null,
      score < 0.08 && question && objective
        ? "Baja correspondencia semantica entre interrogante y objetivo."
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      index: index + 1,
      row_id: rowId,
      interrogante_especifica: question,
      objetivo_especifico: objective,
      hipotesis_especifica: hypothesis,
      variable_o_categoria: cleanMatrixField(row.variable_o_categoria, 260),
      dimension_o_criterio: cleanMatrixField(row.dimension_o_criterio, 260),
      metodo_vinculado: cleanMatrixField(row.metodo_vinculado, 260),
      tecnica: cleanMatrixField(row.tecnica, 220),
      instrumento: cleanMatrixField(row.instrumento, 220),
      alignment_score: score,
      question_derivation_source: "llm_aligned" as const,
      objective_derivation_source: "llm_aligned" as const,
      hypothesis_derivation_source: hypothesis ? ("llm_aligned" as const) : ("missing" as const),
      status: !question || !objective ? ("blocked" as const) : warnings.length > 0 ? ("partial" as const) : ("complete" as const),
      warnings,
    };
  });
}

function sanitizeLlmResponse(response: LlmConsistencyMatrixResponse) {
  return {
    general_block: {
      problema_principal: cleanMatrixField(response.general_block?.problema_principal, 680),
      objetivo_general: cleanMatrixField(response.general_block?.objetivo_general, 680),
      hipotesis_general: cleanMatrixField(response.general_block?.hipotesis_general, 680),
    },
    specific_rows: sanitizeLlmRows(response.specific_rows ?? []),
    variables_block: {
      variable_independiente: cleanMatrixField(response.variables_block?.variable_independiente, 260),
      indicadores_independiente: (response.variables_block?.indicadores_independiente ?? [])
        .map((item) => cleanMatrixField(item, 180))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8),
      variable_dependiente: cleanMatrixField(response.variables_block?.variable_dependiente, 260),
      indicadores_dependiente: (response.variables_block?.indicadores_dependiente ?? [])
        .map((item) => cleanMatrixField(item, 180))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8),
      categorias: (response.variables_block?.categorias ?? [])
        .map((item) => cleanMatrixField(item, 220))
        .filter((item): item is string => Boolean(item))
        .slice(0, 10),
    },
    methodology_block: {
      tipo_investigacion: cleanMatrixField(response.methodology_block?.tipo_investigacion, 360),
      diseno_investigacion: cleanMatrixField(response.methodology_block?.diseno_investigacion, 360),
      ambito_estudio: cleanMatrixField(response.methodology_block?.ambito_estudio, 360),
      poblacion: cleanMatrixField(response.methodology_block?.poblacion, 360),
      muestra: cleanMatrixField(response.methodology_block?.muestra, 360),
      tecnicas_recoleccion: (response.methodology_block?.tecnicas_recoleccion ?? [])
        .map((item) => cleanMatrixField(item, 220))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8),
      instrumentos: (response.methodology_block?.instrumentos ?? [])
        .map((item) => cleanMatrixField(item, 220))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8),
      plan_analisis: cleanMatrixField(response.methodology_block?.plan_analisis, 520),
    },
    unresolved_gaps: (response.unresolved_gaps ?? [])
      .map((item) => cleanMatrixField(item, 260))
      .filter((item): item is string => Boolean(item))
      .slice(0, 8),
    confidence_notes: (response.confidence_notes ?? [])
      .map((item) => cleanMatrixField(item, 260))
      .filter((item): item is string => Boolean(item))
      .slice(0, 8),
  };
}

function buildLlmValidationWarnings(input: {
  rows: ConsistencyMatrixSpecificRow[];
  unresolvedGaps: string[];
  confidenceNotes: string[];
}) {
  const warnings: string[] = [];

  if (input.rows.length < 3) {
    warnings.push("La matriz tiene menos de 3 filas especificas; revisar completitud metodologica.");
  }

  if (input.rows.length > 5) {
    warnings.push("La matriz tiene mas de 5 filas; revisar si el proyecto de maestria queda sobredimensionado.");
  }

  if (input.rows.some((row) => (row.alignment_score ?? 0) < 0.08)) {
    warnings.push("Una o mas filas mantienen baja correspondencia lexical; requiere revision humana.");
  }

  if (input.rows.some((row) => !row.hipotesis_especifica)) {
    warnings.push("Una o mas filas no tienen hipotesis de trabajo o supuesto orientador.");
  }

  if (input.unresolvedGaps.length > 0) {
    warnings.push(`Gaps declarados por LLM: ${input.unresolvedGaps.join(" | ")}`);
  }

  if (input.confidenceNotes.length > 0) {
    warnings.push(`Notas de confianza: ${input.confidenceNotes.join(" | ")}`);
  }

  return warnings;
}

function buildLlmArtifact(input: {
  drafts: MasterSectionDraft[];
  baseline: ConsistencyMatrixArtifact;
  response: LlmConsistencyMatrixResponse;
  detailedResult: TextGenerationResult;
  prompt: string;
  model: string;
}) {
  const sanitized = sanitizeLlmResponse(input.response);
  const validation = buildValidation({
    drafts: input.drafts,
    generalBlock: sanitized.general_block,
    rows: sanitized.specific_rows,
    variablesBlock: sanitized.variables_block,
    methodologyBlock: sanitized.methodology_block,
    objectives: sanitized.specific_rows
      .map((row) => row.objetivo_especifico)
      .filter((item): item is string => Boolean(item)),
    questions: sanitized.specific_rows
      .map((row) => row.interrogante_especifica)
      .filter((item): item is string => Boolean(item)),
    hypotheses: sanitized.specific_rows
      .map((row) => row.hipotesis_especifica)
      .filter((item): item is string => Boolean(item)),
  });
  const llmValidationWarnings = buildLlmValidationWarnings({
    rows: sanitized.specific_rows,
    unresolvedGaps: sanitized.unresolved_gaps,
    confidenceNotes: sanitized.confidence_notes,
  });
  const mergedValidation = {
    ...validation,
    warnings: [...validation.warnings, ...llmValidationWarnings],
    llm_validation_warnings: llmValidationWarnings,
  };
  const legacyRows = buildLegacyRows({
    rows: sanitized.specific_rows,
    generalBlock: sanitized.general_block,
    methodologyBlock: sanitized.methodology_block,
  });
  const status: MatrixStatus =
    mergedValidation.blocked_reasons.length > 0
      ? "blocked"
      : mergedValidation.warnings.length > 0 ||
          sanitized.specific_rows.some((row) => row.status === "partial")
        ? "warn"
        : "pass";

  return {
    artifact_type: "consistency_matrix" as const,
    artifact_version: "v3_llm_aligned" as const,
    generated_at: new Date().toISOString(),
    llm_used: true,
    llm_generation: {
      provider: input.detailedResult.usage.provider,
      model: input.detailedResult.usage.model,
      model_tier: "low" as const,
      tracking_label: "step10_consistency_matrix_llm_aligned",
      input_hash: createTextHash(input.prompt),
      prompt_char_count: input.prompt.length,
      input_tokens: input.detailedResult.usage.inputTokens,
      cached_input_tokens: input.detailedResult.usage.cachedInputTokens,
      output_tokens: input.detailedResult.usage.outputTokens,
      total_tokens: input.detailedResult.usage.totalTokens,
      cost_usd: input.detailedResult.usage.costUsd,
      cost_cad: input.detailedResult.usage.costCad,
      duration_ms: input.detailedResult.usage.durationMs,
    },
    status,
    can_continue_step_11: status !== "blocked",
    general_block: sanitized.general_block,
    specific_rows: sanitized.specific_rows,
    variables_block: sanitized.variables_block,
    methodology_block: sanitized.methodology_block,
    validation: mergedValidation,
    table_model: buildTableModel({
      rows: sanitized.specific_rows,
      methodologyBlock: sanitized.methodology_block,
    }),
    legacy_rows: legacyRows,
  } satisfies ConsistencyMatrixArtifact;
}

export function buildConsistencyMatrixArtifactFromSections(
  drafts: MasterSectionDraft[],
): ConsistencyMatrixArtifact {
  const generalBlock = extractGeneralBlock(drafts);
  const objectives = getSpecificObjectives(drafts);
  const questions = getSpecificQuestions(drafts);
  const hypotheses = getSpecificHypotheses(drafts);
  const rows = buildSpecificRows({ objectives, questions, hypotheses });
  const variablesBlock = extractVariablesBlock(drafts);
  const methodologyBlock = extractMethodologyBlock(drafts);
  const validation = buildValidation({
    drafts,
    generalBlock,
    rows,
    variablesBlock,
    methodologyBlock,
    objectives,
    questions,
    hypotheses,
  });
  const legacyRows = buildLegacyRows({ rows, generalBlock, methodologyBlock });
  const status: MatrixStatus =
    validation.blocked_reasons.length > 0
      ? "blocked"
      : validation.warnings.length > 0 || rows.some((row) => row.status === "partial")
        ? "warn"
        : "pass";

  return {
    artifact_type: "consistency_matrix",
    artifact_version: "v2_upt_compatible",
    generated_at: new Date().toISOString(),
    llm_used: false,
    llm_generation: null,
    status,
    can_continue_step_11: status !== "blocked",
    general_block: generalBlock,
    specific_rows: rows,
    variables_block: variablesBlock,
    methodology_block: methodologyBlock,
    validation,
    table_model: buildTableModel({ rows, methodologyBlock }),
    legacy_rows: legacyRows,
  };
}

export async function buildConsistencyMatrixArtifactFromSectionsWithLlm(input: {
  drafts: MasterSectionDraft[];
  provider: LlmProvider;
  model?: string | null;
}): Promise<ConsistencyMatrixArtifact> {
  const sourceDrafts = input.drafts.filter((draft) => draft.section_key !== "consistency_matrix");
  const baseline = buildConsistencyMatrixArtifactFromSections(sourceDrafts);
  const prompt = buildLlmMatrixPrompt({ baseline, drafts: sourceDrafts });
  const model = input.model?.trim() || process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini";
  let detailedResult = await input.provider.generateTextDetailed({
    prompt,
    model,
    trackingLabel: "step10_consistency_matrix_llm_aligned",
  });
  let response = safeJsonParse<LlmConsistencyMatrixResponse>(detailedResult.text);
  const prompts = [prompt];

  if (response.specific_rows.some((row) => !cleanMatrixField(row.hipotesis_especifica, 520))) {
    const repairPrompt = buildHypothesisRepairPrompt({ response });
    const repairResult = await input.provider.generateTextDetailed({
      prompt: repairPrompt,
      model,
      trackingLabel: "step10_consistency_matrix_hypothesis_repair",
    });
    const repairs = safeJsonParse<LlmHypothesisRepairResponse>(repairResult.text);

    response = applyHypothesisRepairs({ response, repairs });
    detailedResult = mergeDetailedResults(detailedResult, repairResult);
    prompts.push(repairPrompt);
  }

  return buildLlmArtifact({
    drafts: sourceDrafts,
    baseline,
    response,
    detailedResult,
    prompt: prompts.join("\n\n--- HYPOTHESIS_REPAIR ---\n\n"),
    model,
  });
}

export function buildConsistencyMatrixFromSections(
  drafts: MasterSectionDraft[],
): ConsistencyMatrixRow[] {
  return buildConsistencyMatrixArtifactFromSections(drafts).legacy_rows;
}
