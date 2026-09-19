import type {
  ExtendedPlanItem,
  SectionExecutionProfile,
} from "@/server/blueprint-v2/sections/section-generation-shared";
import { normalizeLanguageCode } from "@/lib/language";
import { inspectAcademicEditorialPolicy } from "@/server/blueprint-v2/editorial/academic-editorial-policy";
import { inspectSectionOutput } from "@/server/blueprint-v2/sections/section-output-normalizer";

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function countDuplicateLines(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  let duplicates = 0;

  for (const line of lines) {
    const normalized = line.toLowerCase();
    if (seen.has(normalized)) {
      duplicates += 1;
      continue;
    }
    seen.add(normalized);
  }

  return {
    total: lines.length,
    duplicates,
  };
}

function parseLogicalItems(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((line) =>
      line
        .replace(/^\s*[-*]\s*/, "")
        .replace(/^\s*(P|OE|H)?\s*\d+[\).\-\s:]*/i, "")
        .trim(),
    )
    .filter((line) => line.length > 12)
    .filter((line) => !/^objetivos?|preguntas?|hipotesis/i.test(line));
}

function inspectResearchLogicShape(sectionKey: string, content: string) {
  const items = parseLogicalItems(content);

  if (
    sectionKey === "specific_research_questions" ||
    sectionKey === "research_questions"
  ) {
    const questionCount = items.filter((item) => /\?|^(como|cual|que|de que manera|en que medida)\b/i.test(item)).length;

    return {
      failed: questionCount > 0 && questionCount < Math.min(items.length, 3),
      message: "Las preguntas especificas deben estar claramente formuladas y ser compatibles con P1..Pn.",
    };
  }

  if (sectionKey === "specific_objectives") {
    const objectiveVerbCount = items.filter((item) =>
      /^(identificar|describir|analizar|evaluar|determinar|establecer|proponer|comparar|sistematizar|formular|organizar)\b/i.test(
        item,
      ),
    ).length;

    return {
      failed: objectiveVerbCount > 0 && objectiveVerbCount < Math.min(items.length, 3),
      message: "Los objetivos especificos deben iniciar con verbos metodologicos y conservar correspondencia OE1..OEn.",
    };
  }

  if (sectionKey === "specific_hypotheses") {
    return {
      failed: items.length > 0 && items.length < 3,
      message: "Las hipotesis o supuestos orientadores deben conservar correspondencia H1..Hn con preguntas y objetivos.",
    };
  }

  return {
    failed: false,
    message: "",
  };
}

function languageSignalCounts(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const spanishMatches =
    normalized.match(
      /\b(el|la|los|las|para|como|una|un|del|que|esta|este|investigacion|objetivo|problema|metodologia|estudiantes|propuesta|evidencia|cronograma|presupuesto|fuente|referencias)\b/g,
    ) ?? [];
  const englishMatches =
    normalized.match(
      /\b(the|and|for|with|this|that|research|objective|problem|methodology|students|proposal|evidence|schedule|budget|source|references|assessment|feedback)\b/g,
    ) ?? [];

  return {
    spanish: spanishMatches.length,
    english: englishMatches.length,
  };
}

function detectLanguageFailure(input: {
  content: string;
  targetLanguage?: string | null;
  sectionKey: string;
}) {
  if (input.sectionKey === "references") {
    return false;
  }

  const targetLanguage = normalizeLanguageCode(input.targetLanguage) ?? "es";
  const counts = languageSignalCounts(input.content);

  if (targetLanguage === "en") {
    return counts.spanish >= 8 && counts.spanish > counts.english * 1.35;
  }

  return (
    counts.english >= 8 &&
    counts.english > counts.spanish * 1.35
  );
}

export function validateDraftAgainstPlan(input: {
  content: string;
  planItem: ExtendedPlanItem;
  usedAssetKeys: string[];
  blockedClaims: string[];
  executionProfile?: SectionExecutionProfile;
  usedReferenceIds?: string[];
  sourceTitles?: string[];
  targetLanguage?: string | null;
}) {
  const wordCount = countWords(input.content);
  const failures: string[] = [];
  const retryOn = new Set(input.planItem.retry_policy?.retry_on ?? []);
  const duplicateLines = countDuplicateLines(input.content);
  const claimsGuardFailed =
    /cumple (la )?(normativa|regulacion)|es viable|viabilidad demostrada|es rentable|rentabilidad demostrada|demuestra que/i.test(
      input.content,
    ) && input.blockedClaims.length > 0;
  const targetLanguage = normalizeLanguageCode(input.targetLanguage) ?? "es";
  const languageFailed = detectLanguageFailure({
    content: input.content,
    targetLanguage,
    sectionKey: input.planItem.section_key,
  });
  const editorialInspection = inspectAcademicEditorialPolicy({
    section_key: input.planItem.section_key,
    section_title: input.planItem.title,
    content: input.content,
    word_budget:
      input.planItem.target_word_budget ?? input.planItem.max_words ?? null,
  });
  const keywordsFailed =
    input.planItem.section_key === "keywords" &&
    (editorialInspection.keywords_not_one_line ||
      editorialInspection.keywords_item_count_invalid);
  const referencesFailed =
    input.planItem.section_key === "references" &&
    (!/^[-*]\s/m.test(input.content) ||
      duplicateLines.duplicates > 0 ||
      (input.usedReferenceIds?.length ?? 0) === 0);
  const scheduleFailed =
    input.planItem.section_key === "schedule" &&
    (!/^[-*]\s/m.test(input.content) || wordCount > 220 || languageFailed);
  const duplicateDensityFailed =
    duplicateLines.total >= 4 &&
    duplicateLines.duplicates / duplicateLines.total > 0.35;
  const outputInspection = inspectSectionOutput({
    content: input.content,
    sectionKey: input.planItem.section_key,
    sourceTitles: input.sourceTitles,
  });
  const formatContaminationFailed =
    outputInspection.has_markdown_heading ||
    outputInspection.has_markdown_emphasis ||
    outputInspection.has_double_period;
  const citationDeferredFailed =
    input.planItem.section_key !== "references" &&
    (outputInspection.has_visible_reference_marker ||
      outputInspection.source_title_mentions.length > 0);
  const researchLogicShape = inspectResearchLogicShape(
    input.planItem.section_key,
    input.content,
  );

  if (
    retryOn.has("below_min_words") &&
    input.planItem.min_words &&
    wordCount < input.planItem.min_words
  ) {
    failures.push(
      `Debes superar el minimo de ${input.planItem.min_words} palabras.`,
    );
  }

  if (
    retryOn.has("above_max_words") &&
    input.planItem.max_words &&
    wordCount > input.planItem.max_words
  ) {
    failures.push(
      `Debes reducir la seccion a un maximo de ${input.planItem.max_words} palabras.`,
    );
  }

  if (
    retryOn.has("missing_critical_assets") &&
    (input.planItem.critical_asset_keys?.length ?? 0) > 0 &&
    input.usedAssetKeys.length === 0
  ) {
    failures.push(
      "Debes integrar o mencionar explicitamente al menos un asset critico.",
    );
  }

  if (
    retryOn.has("missing_required_structure") &&
    input.planItem.generation_strategy === "llm_structured" &&
    !/[-*]\s|:|\|/m.test(input.content)
  ) {
    failures.push(
      "Debes devolver una estructura mas visible y util para una seccion estructurada.",
    );
  }

  if (
    retryOn.has("low_specificity") &&
    /version preliminar|por definir|por precisar|requiere revision/i.test(
      input.content,
    )
  ) {
    failures.push("Debes aumentar especificidad y reducir placeholders o vaguedad.");
  }

  if (retryOn.has("overclaiming") && claimsGuardFailed) {
    failures.push(
      "Debes reducir sobreafirmaciones y mantener el alcance como proyecto o evaluacion preliminar.",
    );
  }

  if (
    retryOn.has("weak_alignment") &&
    input.planItem.depends_on_keys.length > 0 &&
    wordCount < 40
  ) {
    failures.push(
      "La seccion quedo demasiado corta para reflejar sus dependencias y contexto.",
    );
  }

  if (languageFailed) {
    failures.push(
      targetLanguage === "en"
        ? "You must rewrite the section primarily in English and avoid Spanish narrative blocks."
        : "Debes responder principalmente en espanol y evitar bloques innecesarios en ingles.",
    );
  }

  if (keywordsFailed) {
    failures.push(
      "Debes devolver 4 a 7 palabras clave en una sola linea separada por punto y coma.",
    );
  }

  if (
    editorialInspection.opening_repeats_heading ||
    editorialInspection.generic_opening_phrase
  ) {
    failures.push(
      "Debes abrir con una afirmacion sustantiva, sin repetir el titulo ni usar aperturas genericas.",
    );
  }

  if (editorialInspection.duplicated_objective_list) {
    failures.push(
      "Debes evitar duplicar listas de objetivos, preguntas o hipotesis dentro de la misma seccion.",
    );
  }

  if (
    editorialInspection.exceeds_word_budget &&
    input.planItem.content_kind !== "table"
  ) {
    failures.push(
      `Debes respetar el presupuesto editorial de ${input.planItem.target_word_budget ?? input.planItem.max_words} palabras.`,
    );
  }

  if (editorialInspection.repeated_opening_phrase_count >= 3) {
    failures.push(
      "Debes variar aperturas de parrafo y reducir frases repetidas al inicio.",
    );
  }

  if (referencesFailed) {
    failures.push(
      "Debes devolver referencias visibles, sin duplicados y con soporte trazable.",
    );
  }

  if (scheduleFailed) {
    failures.push(
      targetLanguage === "en"
        ? "You must return a short, visible schedule primarily in English."
        : "Debes devolver un cronograma breve, visible y principalmente en espanol.",
    );
  }

  if (duplicateDensityFailed) {
    failures.push(
      "Debes reducir repeticiones textuales y evitar lineas practicamente duplicadas.",
    );
  }

  if (formatContaminationFailed) {
    failures.push(
      "Debes devolver texto limpio para DOCX: sin encabezados Markdown, sin asteriscos de enfasis y sin puntuacion duplicada.",
    );
  }

  if (citationDeferredFailed) {
    failures.push(
      "Debes diferir las citas al sistema: no incluyas titulos de fuentes, autores/anios visibles ni metadatos dentro del contenido.",
    );
  }

  if (researchLogicShape.failed) {
    failures.push(researchLogicShape.message);
  }

  const qualityChecks = {
    min_words_pass: !(
      input.planItem.min_words && wordCount < input.planItem.min_words
    ),
    max_words_pass: !(
      input.planItem.max_words && wordCount > input.planItem.max_words
    ),
    required_structure_pass:
      input.planItem.generation_strategy !== "llm_structured" ||
      /[-*]\s|:|\|/m.test(input.content),
    critical_assets_pass:
      (input.planItem.critical_asset_keys?.length ?? 0) === 0 ||
      input.usedAssetKeys.length > 0,
    claims_guard_pass: !claimsGuardFailed,
    language_pass: !languageFailed,
    format_contamination_pass: !formatContaminationFailed,
    citation_deferred_pass: !citationDeferredFailed,
    punctuation_pass: !outputInspection.has_double_period,
    research_logic_shape_pass: !researchLogicShape.failed,
    section_opening_pass:
      !editorialInspection.opening_repeats_heading &&
      !editorialInspection.generic_opening_phrase,
    objective_repetition_pass:
      !editorialInspection.duplicated_objective_list,
    keywords_one_line_pass:
      input.planItem.section_key !== "keywords" || !keywordsFailed,
    editorial_word_budget_pass: !editorialInspection.exceeds_word_budget,
    opening_phrase_diversity_pass:
      editorialInspection.repeated_opening_phrase_count < 3,
  };

  return {
    wordCount,
    failures,
    qualityChecks,
    passed: failures.length === 0,
  };
}

export function buildRetryPrompt(input: {
  originalPrompt: string;
  previousContent: string;
  failures: string[];
  planItem: ExtendedPlanItem;
  executionProfile?: SectionExecutionProfile;
  targetLanguage?: string | null;
}) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage) ?? "es";
  return [
    input.originalPrompt,
    "",
    "Tu respuesta anterior no cumplio los parametros minimos.",
    "Debes reescribir la seccion completa corrigiendo estos puntos:",
    ...input.failures.map((failure) => `- ${failure}`),
    "",
    "Respuesta previa a corregir:",
    input.previousContent,
    "",
    `Recuerda respetar min_words=${input.planItem.min_words ?? "NO_ESPECIFICADO"} y max_words=${input.planItem.max_words ?? "NO_ESPECIFICADO"}.`,
    input.executionProfile
      ? `Mantente dentro del perfil ${input.executionProfile.execution_mode} con budget ${input.executionProfile.prompt_budget}.`
      : null,
    targetLanguage === "en"
      ? "OUTPUT LANGUAGE LOCK: rewrite the final section entirely in English. Do not keep Spanish narrative text."
      : "BLOQUEO DE IDIOMA: reescribe la seccion final enteramente en espanol. No conserves narrativa en ingles.",
    "No insertes citas visibles, titulos de fuentes, autores/anios entre parentesis, reference_id, source_id, evidence_id ni Markdown.",
    "Devuelve solo la nueva version final de la seccion.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
