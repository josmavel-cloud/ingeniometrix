export type AcademicEditorialPolicyContext = {
  country_context?: string | null;
  knowledge_area_label?: string | null;
  template_key?: string | null;
};

export type AcademicEditorialPolicy = {
  policy_version: "academic_editorial_policy.v1";
  title_reformulation_rule: string;
  short_header_title_rule: string;
  keywords_rule: string;
  redundancy_rule: string;
  bullet_usage_rule: string;
  length_budget_rule: string;
  section_opening_rule: string;
  objective_repetition_rule: string;
  final_title_instruction: string;
  short_header_title_instruction: string;
  keywords_instruction: string;
  redundancy_constraints: string[];
  bullet_policy: string;
  target_word_budget_by_section: Record<string, number>;
  master_target_pages: number;
  institutional_target_pages: number;
  context_notes: string[];
};

export type AcademicTitleInput = {
  current_title?: string | null;
  method_or_technique?: string | null;
  object_of_study?: string | null;
  scope_or_sample?: string | null;
  problem_or_purpose?: string | null;
  country_context?: string | null;
};

export type EditorialInspectionInput = {
  section_key: string;
  section_title?: string | null;
  content: string;
  word_budget?: number | null;
};

export type EditorialInspectionResult = {
  opening_repeats_heading: boolean;
  generic_opening_phrase: boolean;
  duplicated_objective_list: boolean;
  keywords_not_one_line: boolean;
  keywords_item_count_invalid: boolean;
  exceeds_word_budget: boolean;
  repeated_opening_phrase_count: number;
  warnings: string[];
};

export type EnforcedEditorialMetadata = {
  final_title: string;
  short_method_title: string;
  keywords_line: string;
  keyword_count: number;
  title_changed: boolean;
  warnings: string[];
  editorial_policy_extra_llm_calls: 0;
};

export type EditorialBudgetEnforcementResult = {
  content: string;
  original_word_count: number;
  final_word_count: number;
  trimmed: boolean;
  safe_to_trim: boolean;
  warnings: string[];
};

const DEFAULT_TARGET_WORD_BUDGET_BY_SECTION: Record<string, number> = {
  title_refined: 28,
  abstract: 240,
  keywords: 35,
  introduction: 360,
  problem_statement: 380,
  problem_formulation: 260,
  justification: 320,
  theoretical_justification: 220,
  practical_justification: 220,
  methodological_justification: 220,
  research_antecedents: 520,
  state_of_the_art: 520,
  theoretical_framework: 680,
  theoretical_bases: 520,
  research_questions: 160,
  general_research_question: 80,
  specific_research_questions: 160,
  general_objective: 80,
  specific_objectives: 160,
  general_hypothesis: 90,
  specific_hypotheses: 180,
  variables_or_categories: 260,
  variables_indicators: 260,
  methodology: 520,
  methodological_approach: 260,
  research_design: 260,
  population_and_sample: 260,
  data_collection_techniques: 260,
  research_procedure: 260,
  analysis_plan: 260,
  ethics: 180,
  scope_and_limitations: 240,
  consistency_matrix: 220,
  schedule: 160,
  budget: 160,
  references: 260,
  annexes: 160,
};

const BULLET_ELIGIBLE_SECTION_KEYS = new Set([
  "specific_objectives",
  "research_questions",
  "specific_research_questions",
  "specific_hypotheses",
  "variables_or_categories",
  "variables_indicators",
  "population_and_sample",
  "data_collection_techniques",
  "research_procedure",
  "analysis_plan",
  "scope_and_limitations",
  "consistency_matrix",
  "schedule",
  "budget",
  "ethics",
]);

const GENERIC_OPENING_PATTERN =
  /^(la presente seccion|esta seccion|el presente apartado|este apartado|el planteamiento del problema es|en esta seccion se|a continuacion se)/i;

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function words(value: string) {
  return cleanText(value).split(/\s+/).filter(Boolean);
}

function trimToWords(value: string, maxWords: number) {
  return words(value).slice(0, maxWords).join(" ");
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function keywordize(value: string) {
  return cleanText(value)
    .replace(/[.,;:]+$/g, "")
    .replace(/^(evaluacion|analisis|diseno|estudio|modelo|sistema)\s+de\s+/i, "$1 de ")
    .trim();
}

function firstSentenceOrClause(value: string, maxWords = 12) {
  const text = cleanText(value)
    .split(/[.;]\s+|\n+/)[0]
    ?.split(/,\s+/)[0] ?? "";
  return trimToWords(text, maxWords);
}

function extractMethodTerms(value: string | null | undefined) {
  const text = normalize(value);
  const original = cleanText(value);
  const candidates: string[] = [];

  const knownPatterns = [
    /revision sistematica aplicada/,
    /revision sistematica/,
    /analisis comparativo/,
    /matriz (de )?evaluacion multicriterio/,
    /evaluacion multicriterio/,
    /modelacion numerica/,
    /simulacion numerica/,
    /estudio de caso/,
    /diseno experimental/,
    /estudio transversal/,
    /estudio correlacional/,
    /enfoque cualitativo/,
    /enfoque cuantitativo/,
    /metodo mixto/,
  ];

  for (const pattern of knownPatterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      candidates.push(match[0]);
    }
  }

  if (candidates.length === 0) {
    const fallback = firstSentenceOrClause(original, 8);
    if (fallback && words(fallback).length <= 8) {
      candidates.push(fallback);
    }
  }

  const compact: string[] = [];
  for (const candidate of uniqueNonEmpty(candidates)) {
    const normalizedCandidate = normalize(candidate);
    if (
      compact.some((existing) => {
        const normalizedExisting = normalize(existing);
        return (
          normalizedExisting.includes(normalizedCandidate) ||
          normalizedCandidate.includes(normalizedExisting)
        );
      })
    ) {
      continue;
    }
    compact.push(candidate);
  }

  return compact.slice(0, 2).join(" y ");
}

function extractObjectTerms(value: string | null | undefined) {
  const text = cleanText(value)
    .replace(/^uso y evaluacion de\s+/i, "")
    .replace(/^evaluacion de(l| la| los| las)?\s+/i, "")
    .replace(/^analisis de(l| la| los| las)?\s+/i, "")
    .replace(/\s+ubicados?.*$/i, "")
    .replace(/\s+para\s+identificar.*$/i, "")
    .trim();

  return trimToWords(text, 8);
}

function extractScopeTerms(value: string | null | undefined) {
  const text = cleanText(value)
    .replace(/\s+ubicados?.*$/i, "")
    .replace(/\s+de uso\s+.*$/i, "")
    .trim();

  return trimToWords(text, 8);
}

function extractProblemTerms(value: string | null | undefined) {
  const text = normalize(value);
  if (text.includes("alta sismicidad") || text.includes("amenaza sismica")) {
    return "alta amenaza sismica";
  }
  if (text.includes("demanda sismica")) {
    return "reduccion de demanda sismica";
  }
  if (text.includes("adherencia")) {
    return "baja adherencia";
  }
  if (text.includes("deteccion temprana")) {
    return "deteccion temprana";
  }

  return firstSentenceOrClause(value ?? "", 8);
}

function isGenericKeyword(value: string) {
  return /^(proyecto de investigacion|metodologia aplicada|analisis academico|tesis|investigacion|contexto peruano)$/i.test(
    normalize(value),
  );
}

export function buildAcademicEditorialPolicy(
  context: AcademicEditorialPolicyContext = {},
): AcademicEditorialPolicy {
  const countryNote =
    normalize(context.country_context) === "pe"
      ? "Incluir contexto peruano solo si el intake, la muestra, el caso o la plantilla lo justifican."
      : "Incluir contexto geografico solo si aparece en el intake, la muestra, el caso o la plantilla.";

  return {
    policy_version: "academic_editorial_policy.v1",
    title_reformulation_rule:
      "Reformular el titulo en espanol academico de posgrado. Debe combinar, cuando corresponda, metodo, tecnica o enfoque principal; objeto de estudio; alcance, muestra, caso o aplicacion; y problema o proposito. No debe afirmar resultados todavia.",
    short_header_title_rule:
      "Generar una version corta para encabezado de 8 a 12 palabras. Debe conservar metodo o enfoque y objeto central; no debe ser una truncacion mecanica.",
    keywords_rule:
      "Generar entre 4 y 7 palabras clave academicas en espanol, en una sola linea estilo articulo indexado, separadas por punto y coma.",
    redundancy_rule:
      "Revisar para concision academica: no repetir el encabezado en la primera frase, no duplicar objetivos o preguntas, no introducir la seccion con formulas genericas y no agregar claims nuevos.",
    bullet_usage_rule:
      "Usar vinetas cuando mejoren la lectura en objetivos, preguntas, variables, procedimientos, limitaciones, cronograma, presupuesto y criterios. Mantener prosa en secciones argumentativas.",
    length_budget_rule:
      "Planificar textos breves: documento master alrededor de 15 paginas y plan institucional alrededor de 10 paginas, con secciones compactas y sin relleno.",
    section_opening_rule:
      "Abrir cada seccion con una afirmacion sustantiva; evitar repetir el titulo o iniciar con 'La presente seccion', 'Este apartado' o formulas similares.",
    objective_repetition_rule:
      "Los objetivos y preguntas deben aparecer una sola vez como lista controlada; otras secciones pueden referirse a ellos sin repetirlos literalmente.",
    final_title_instruction:
      "Reformula el titulo final con metodo/enfoque, objeto de estudio, alcance/caso/muestra y problema/proposito, sin prometer resultados ni validaciones ejecutadas.",
    short_header_title_instruction:
      "Crea un titulo corto de encabezado con 8 a 12 palabras, centrado en metodo/enfoque y objeto, sin cortar arbitrariamente el titulo largo.",
    keywords_instruction:
      "Devuelve 4 a 7 palabras clave en una sola linea separada por punto y coma; prioriza metodo, objeto, contexto y variable tecnica principal.",
    redundancy_constraints: [
      "No repetir el encabezado de la seccion en la primera frase.",
      "No usar aperturas genericas como 'La presente seccion' o 'El planteamiento del problema es'.",
      "No duplicar la lista de objetivos, preguntas o hipotesis en secciones posteriores.",
      "Conservar citas, evidencia IDs y limites de soporte; no agregar claims no soportados.",
      "Reducir transiciones artificiales y frases de relleno.",
    ],
    bullet_policy:
      "Preferir listas breves en secciones operativas; preferir parrafos compactos en justificacion, marco teorico, antecedentes y discusion metodologica.",
    target_word_budget_by_section: { ...DEFAULT_TARGET_WORD_BUDGET_BY_SECTION },
    master_target_pages: 15,
    institutional_target_pages: 10,
    context_notes: [
      countryNote,
      context.knowledge_area_label
        ? `Adaptar terminologia al area: ${cleanText(context.knowledge_area_label)}.`
        : "Adaptar terminologia al area academica declarada.",
      context.template_key
        ? `Respetar convenciones de plantilla ${cleanText(context.template_key)} sin alargar por relleno.`
        : "Respetar la plantilla institucional disponible.",
    ],
  };
}

export function sectionPrefersBullets(sectionKey: string) {
  return BULLET_ELIGIBLE_SECTION_KEYS.has(sectionKey);
}

export function recommendedContentKindForSection(
  sectionKey: string,
  currentKind: string | null | undefined,
) {
  if (sectionPrefersBullets(sectionKey)) {
    return currentKind === "table" ? "table" : "bullet_list";
  }

  return currentKind ?? "rich_text";
}

export function buildTitleReformulationInstruction(input: AcademicTitleInput) {
  const parts = uniqueNonEmpty([
    input.method_or_technique ? `metodo/enfoque: ${input.method_or_technique}` : null,
    input.object_of_study ? `objeto: ${input.object_of_study}` : null,
    input.scope_or_sample ? `alcance/caso/muestra: ${input.scope_or_sample}` : null,
    input.problem_or_purpose ? `problema/proposito: ${input.problem_or_purpose}` : null,
    normalize(input.country_context) === "pe" ? "contexto geografico: Peru si corresponde" : null,
  ]);

  return [
    "Reformula el titulo de investigacion en espanol academico de posgrado.",
    "Integra estos componentes cuando esten disponibles:",
    ...parts.map((part) => `- ${part}`),
    "No afirmes resultados todavia; evita vaguedad y exceso de longitud.",
  ].join("\n");
}

export function suggestAcademicTitle(input: AcademicTitleInput) {
  const method = extractMethodTerms(input.method_or_technique);
  const object = extractObjectTerms(input.object_of_study || input.current_title);
  const scopeCandidate = extractScopeTerms(input.scope_or_sample);
  const scope =
    scopeCandidate &&
    normalize(object)
      .split(/\s+/)
      .filter((token) => token.length >= 5)
      .some((token) => normalize(scopeCandidate).includes(token))
      ? ""
      : scopeCandidate;
  const problem = extractProblemTerms(input.problem_or_purpose);
  const country = normalize(input.country_context) === "pe" ? "en el contexto peruano" : "";

  const core = uniqueNonEmpty([
    method ? `${method} para evaluar ${object || "el objeto de estudio"}` : object,
    scope ? `en ${scope}` : null,
    problem ? `ante ${problem}` : null,
    country,
  ]).join(" ");

  return trimToWords(core || cleanText(input.current_title) || "Titulo academico por precisar", 24);
}

export function buildShortHeaderTitle(input: AcademicTitleInput) {
  const method = extractMethodTerms(input.method_or_technique);
  const object = extractObjectTerms(input.object_of_study || input.current_title);
  const candidate = uniqueNonEmpty([
    method || "Enfoque aplicado",
    object || "objeto de estudio",
  ]).join(" para ");

  return trimToWords(candidate, 12);
}

export function buildKeywordsLine(input: AcademicTitleInput & {
  keywords?: string[] | null;
  knowledge_area_label?: string | null;
}) {
  const method = extractMethodTerms(input.method_or_technique);
  const object = extractObjectTerms(input.object_of_study);
  const scope = extractScopeTerms(input.scope_or_sample);
  const problem = extractProblemTerms(input.problem_or_purpose);
  const rawCandidates = uniqueNonEmpty([
    ...(input.keywords ?? []),
    method,
    object,
    scope,
    problem,
    input.knowledge_area_label,
    normalize(input.country_context) === "pe" ? "contexto peruano" : null,
  ])
    .map(keywordize)
    .filter((item) => words(item).length <= 8);
  const specificCandidates = rawCandidates.filter((item) => !isGenericKeyword(item));
  const candidates =
    specificCandidates.length >= 4
      ? specificCandidates.slice(0, 7)
      : uniqueNonEmpty([
          ...specificCandidates,
          ...rawCandidates.filter((item) => !specificCandidates.includes(item)),
        ]).slice(0, 7);

  while (candidates.length < 4) {
    const fallbackKeywords = [
      "proyecto de investigacion",
      "metodologia aplicada",
      "analisis academico",
    ];
    candidates.push(fallbackKeywords[candidates.length % fallbackKeywords.length]);
  }

  return candidates.slice(0, 7).join("; ");
}

export function buildEnforcedAcademicMetadata(
  input: AcademicTitleInput & {
    keywords?: string[] | null;
    knowledge_area_label?: string | null;
  },
): EnforcedEditorialMetadata {
  const finalTitle = suggestAcademicTitle(input);
  const shortMethodTitle = buildShortHeaderTitle({
    ...input,
    current_title: finalTitle,
  });
  const keywordsLine = buildKeywordsLine({
    ...input,
    current_title: finalTitle,
  });
  const keywordCount = keywordsLine
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean).length;
  const currentTitle = cleanText(input.current_title);
  const warnings = [
    normalize(finalTitle) === normalize(currentTitle)
      ? "final_title_unchanged_from_input"
      : null,
    words(shortMethodTitle).length > 12
      ? "short_method_title_above_target"
      : null,
    /\b(decision de|requiere un procedimiento|durante el desarrollo|en esta seccion)\b/i.test(
      normalize(shortMethodTitle),
    )
      ? "short_method_title_looks_like_prose"
      : null,
    keywordCount < 4 || keywordCount > 7 ? "keyword_count_out_of_range" : null,
    keywordsLine
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .every(isGenericKeyword)
      ? "keywords_are_generic_only"
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    final_title: finalTitle,
    short_method_title: shortMethodTitle,
    keywords_line: keywordsLine,
    keyword_count: keywordCount,
    title_changed: normalize(finalTitle) !== normalize(currentTitle),
    warnings,
    editorial_policy_extra_llm_calls: 0,
  };
}

export function enforceEditorialWordBudget(input: {
  content: string;
  max_words: number | null | undefined;
  content_kind?: string | null;
}): EditorialBudgetEnforcementResult {
  const originalWords = words(input.content);
  const maxWords = input.max_words ?? null;
  const contentKind = input.content_kind ?? "rich_text";
  const safeToTrim =
    Boolean(maxWords && maxWords > 0) &&
    !["table", "matrix", "structured_data"].includes(contentKind);

  if (!maxWords || originalWords.length <= maxWords || !safeToTrim) {
    return {
      content: input.content,
      original_word_count: originalWords.length,
      final_word_count: originalWords.length,
      trimmed: false,
      safe_to_trim: safeToTrim,
      warnings:
        maxWords && originalWords.length > maxWords && !safeToTrim
          ? ["over_budget_not_trimmed_for_structured_content"]
          : [],
    };
  }

  const lines = input.content.split(/\r?\n/);
  const keptLines: string[] = [];
  let remaining = maxWords;
  for (const line of lines) {
    const lineWords = words(line);
    if (lineWords.length === 0) {
      if (keptLines.at(-1) !== "") {
        keptLines.push("");
      }
      continue;
    }
    if (remaining <= 0) {
      break;
    }
    if (lineWords.length <= remaining) {
      keptLines.push(line);
      remaining -= lineWords.length;
      continue;
    }
    keptLines.push(lineWords.slice(0, remaining).join(" ").replace(/[,:;]+$/g, "."));
    remaining = 0;
  }
  const trimmedContent = keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    content: trimmedContent,
    original_word_count: originalWords.length,
    final_word_count: words(trimmedContent).length,
    trimmed: true,
    safe_to_trim: true,
    warnings: [
      `editorial_word_budget_trimmed:${originalWords.length}->${words(trimmedContent).length}`,
    ],
  };
}

function firstMeaningfulSentence(content: string) {
  return splitSentences(content).find((sentence) => sentence.length > 0) ?? "";
}

function normalizedLogicalItems(content: string) {
  return content
    .split(/\r?\n|;/)
    .map((line) =>
      normalize(line)
        .replace(/^(oe|p|h)?\s*\d+[\s.-]*/i, "")
        .replace(/^(objetivo especifico|pregunta especifica|hipotesis especifica)\s*\d*[:.-]*/i, "")
        .trim(),
    )
    .filter((line) => line.length > 18);
}

export function inspectAcademicEditorialPolicy(
  input: EditorialInspectionInput,
): EditorialInspectionResult {
  const content = input.content ?? "";
  const firstSentence = firstMeaningfulSentence(content);
  const normalizedTitle = normalize(input.section_title || input.section_key);
  const normalizedFirst = normalize(firstSentence);
  const titleTokens = normalizedTitle.split(/\s+/).filter((token) => token.length >= 4);
  const repeatedTitleTokens = titleTokens.filter((token) =>
    normalizedFirst.split(/\s+/).includes(token),
  ).length;
  const openingRepeatsHeading =
    titleTokens.length >= 2 &&
    repeatedTitleTokens / Math.max(titleTokens.length, 1) >= 0.67;
  const genericOpeningPhrase = GENERIC_OPENING_PATTERN.test(firstSentence);
  const items = normalizedLogicalItems(content);
  const seen = new Set<string>();
  let duplicatedObjectiveList = false;
  for (const item of items) {
    if (seen.has(item)) {
      duplicatedObjectiveList = true;
      break;
    }
    seen.add(item);
  }

  const keywordLines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keywordsNotOneLine =
    input.section_key === "keywords" &&
    (keywordLines.length !== 1 || /^[-*]\s/m.test(content));
  const keywordCount =
    input.section_key === "keywords"
      ? keywordLines.join(" ").split(";").map((item) => item.trim()).filter(Boolean).length
      : 0;
  const keywordsItemCountInvalid =
    input.section_key === "keywords" && (keywordCount < 4 || keywordCount > 7);
  const wordCount = words(content).length;
  const exceedsWordBudget = Boolean(input.word_budget && wordCount > input.word_budget);
  const openingCounts = new Map<string, number>();
  for (const sentence of splitSentences(content).slice(0, 12)) {
    const opening = normalize(sentence).split(/\s+/).slice(0, 4).join(" ");
    if (opening) {
      openingCounts.set(opening, (openingCounts.get(opening) ?? 0) + 1);
    }
  }
  const repeatedOpeningPhraseCount = Math.max(0, ...Array.from(openingCounts.values()));

  const warnings = [
    openingRepeatsHeading ? "opening_repeats_heading" : null,
    genericOpeningPhrase ? "generic_opening_phrase" : null,
    duplicatedObjectiveList ? "duplicated_objective_list" : null,
    keywordsNotOneLine ? "keywords_not_one_line" : null,
    keywordsItemCountInvalid ? "keywords_item_count_invalid" : null,
    exceedsWordBudget ? "exceeds_word_budget" : null,
    repeatedOpeningPhraseCount >= 3 ? "repeated_opening_phrase" : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    opening_repeats_heading: openingRepeatsHeading,
    generic_opening_phrase: genericOpeningPhrase,
    duplicated_objective_list: duplicatedObjectiveList,
    keywords_not_one_line: keywordsNotOneLine,
    keywords_item_count_invalid: keywordsItemCountInvalid,
    exceeds_word_budget: exceedsWordBudget,
    repeated_opening_phrase_count: repeatedOpeningPhraseCount,
    warnings,
  };
}
