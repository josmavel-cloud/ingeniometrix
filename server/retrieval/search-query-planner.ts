import referenceSearchPlanSchemaJson from "@/ai/schemas/reference-search-plan.schema.json";
import { APP_DEFAULT_LANGUAGE } from "@/lib/language";
import {
  buildSearchQuery,
  buildSearchQueryAttempts,
  extractSearchTerms,
  normalizeTitle,
} from "@/lib/text";
import { getConfiguredLlmProvider } from "@/llm";

import { generateStructuredObjectWithTextFallback } from "./retrieval-llm-json";

type ReferenceSearchPlan = {
  normalized_topic: string;
  intent_summary: string;
  search_queries: string[];
  cross_language_queries: string[];
  focus_terms: string[];
};

type BuildReferenceSearchPlanInput = {
  activeLanguage: string;
  topic: string;
  problemContext?: string | null;
  targetPopulation?: string | null;
  preferredMethodology?: string | null;
  program?: string | null;
  researchLine?: string | null;
};

function uniqueNormalized(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = normalizeTitle(value);

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function buildFallbackPlan(input: BuildReferenceSearchPlanInput): ReferenceSearchPlan {
  const normalizedTopic = buildSearchQuery([
    input.topic,
    input.targetPopulation,
    input.preferredMethodology,
  ]);
  const fallbackQueries = buildSearchQueryAttempts({
    topic: input.topic,
    problemContext: [input.problemContext, input.targetPopulation].filter(Boolean).join(" "),
    program: input.program,
  });

  return {
    normalized_topic: normalizedTopic || input.topic,
    intent_summary:
      buildSearchQuery([input.topic, input.problemContext, input.targetPopulation]) ||
      input.topic,
    search_queries: fallbackQueries.slice(0, 4),
    cross_language_queries: [],
    focus_terms: extractSearchTerms(
      [
        input.topic,
        input.problemContext,
        input.targetPopulation,
        input.preferredMethodology,
        input.researchLine,
      ]
        .filter(Boolean)
        .join(" "),
      {
        maxTerms: 8,
        minLength: 4,
      },
    ),
  };
}

function buildPrompt(input: BuildReferenceSearchPlanInput) {
  return `
Eres Ingeniometrix y tu tarea es mejorar una busqueda academica para OpenAlex.

Objetivo:
- reformular el tema del usuario como una intencion academica breve y clara
- proponer consultas mas utiles para OpenAlex
- incluir variantes en ingles cuando eso aumente la probabilidad de encontrar literatura relevante
- priorizar antecedentes recientes y tecnicamente utiles para construir un blueprint trazable

Reglas:
- no inventes datos ni resultados
- no conviertas la consulta en una tesis completa
- prioriza palabras que ayuden a encontrar articulos relevantes
- busca antecedentes sobre el tema elegido que aborden problemas actuales del area
- intenta favorecer consultas que traigan al menos 5 antecedentes con abstract, soluciones tecnicas o enfoques metodologicos aprovechables
- prioriza literatura de los ultimos 5 anos cuando eso no distorsione el foco del tema
- evita nombres institucionales salvo que realmente sean parte del objeto de estudio
- usa terminologia academica breve, no frases demasiado largas
- si el usuario ya escribio algo tecnico, preserva ese foco
- el idioma objetivo actual del proyecto es ${input.activeLanguage || APP_DEFAULT_LANGUAGE}

Entrada:
- topic: ${input.topic}
- problem_context: ${input.problemContext ?? "NO_ESPECIFICADO"}
- target_population: ${input.targetPopulation ?? "NO_ESPECIFICADA"}
- preferred_methodology: ${input.preferredMethodology ?? "NO_ESPECIFICADA"}
- research_line: ${input.researchLine ?? "NO_ESPECIFICADA"}
- program: ${input.program ?? "NO_ESPECIFICADO"}

Devuelve:
- normalized_topic: reformulacion academica breve en el idioma del proyecto
- intent_summary: resumen de intencion de busqueda en el idioma del proyecto
- search_queries: 2 a 4 consultas breves y utiles en el idioma del proyecto
- cross_language_queries: hasta 3 consultas utiles en ingles si eso ayuda a OpenAlex
- focus_terms: 5 a 10 terminos clave utiles para reranking local
`.trim();
}

export async function buildReferenceSearchPlan(input: BuildReferenceSearchPlanInput) {
  const fallbackPlan = buildFallbackPlan(input);

  try {
    const provider = getConfiguredLlmProvider();
    const generatedPlan = await generateStructuredObjectWithTextFallback<ReferenceSearchPlan>({
      provider,
      prompt: buildPrompt(input),
      schemaName: "reference_search_plan",
      schema: referenceSearchPlanSchemaJson as Record<string, unknown>,
    });

    return {
      normalizedTopic:
        generatedPlan.normalized_topic?.trim() || fallbackPlan.normalized_topic,
      intentSummary:
        generatedPlan.intent_summary?.trim() || fallbackPlan.intent_summary,
      searchQueries: uniqueNormalized([
        ...generatedPlan.search_queries,
        ...generatedPlan.cross_language_queries,
        ...fallbackPlan.search_queries,
      ]).slice(0, 6),
      focusTerms: uniqueNormalized([
        ...generatedPlan.focus_terms,
        ...fallbackPlan.focus_terms,
      ]).slice(0, 10),
    };
  } catch {
    return {
      normalizedTopic: fallbackPlan.normalized_topic,
      intentSummary: fallbackPlan.intent_summary,
      searchQueries: uniqueNormalized([
        ...fallbackPlan.search_queries,
        ...fallbackPlan.cross_language_queries,
      ]).slice(0, 6),
      focusTerms: fallbackPlan.focus_terms,
    };
  }
}
