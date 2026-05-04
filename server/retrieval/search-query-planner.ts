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

function pickOptionalSearchContext(value: string | null | undefined, maxTerms: number) {
  const terms = extractSearchTerms(value, {
    maxTerms,
    minLength: 4,
  });

  return terms.length > 0 ? terms.join(" ") : null;
}

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
  const problemFrame = pickOptionalSearchContext(input.problemContext, 6);
  const populationScope = pickOptionalSearchContext(input.targetPopulation, 5);
  const methodScope = pickOptionalSearchContext(input.preferredMethodology, 5);
  const researchScope = pickOptionalSearchContext(input.researchLine, 5);
  const normalizedTopic = buildSearchQuery([
    input.topic,
    input.preferredMethodology,
  ]);
  const fallbackQueries = buildSearchQueryAttempts({
    topic: input.topic,
    problemContext: [problemFrame, populationScope, methodScope].filter(Boolean).join(" "),
  });
  const technicalTerms = uniqueNormalized([
    ...extractSearchTerms(input.topic, { maxTerms: 8, minLength: 4 }),
    ...extractSearchTerms(input.preferredMethodology, { maxTerms: 4, minLength: 4 }),
    ...extractSearchTerms(input.researchLine, { maxTerms: 4, minLength: 4 }),
  ]);

  return {
    normalized_topic: normalizedTopic || input.topic,
    intent_summary:
      buildSearchQuery([input.topic, problemFrame, populationScope]) ||
      input.topic,
    search_queries: uniqueNormalized([
      ...fallbackQueries,
      buildSearchQuery([technicalTerms.slice(0, 6).join(" ")]),
      buildSearchQuery([technicalTerms.slice(0, 4).join(" "), methodScope]),
      buildSearchQuery([technicalTerms.slice(0, 4).join(" "), researchScope]),
    ]).slice(0, 4),
    cross_language_queries: uniqueNormalized([
      buildSearchQuery([input.topic]),
      buildSearchQuery([input.topic, input.targetPopulation]),
    ]).slice(0, 2),
    focus_terms: uniqueNormalized([
      ...extractSearchTerms(input.topic, { maxTerms: 6, minLength: 4 }),
      ...extractSearchTerms(input.preferredMethodology, { maxTerms: 3, minLength: 4 }),
      ...extractSearchTerms(input.researchLine, { maxTerms: 3, minLength: 4 }),
      ...extractSearchTerms(input.problemContext, { maxTerms: 3, minLength: 4 }),
      ...extractSearchTerms(input.targetPopulation, { maxTerms: 3, minLength: 4 }),
    ]).slice(0, 10),
  };
}

function buildPrompt(input: BuildReferenceSearchPlanInput) {
  const problemFrame = pickOptionalSearchContext(input.problemContext, 10) ?? "UNSPECIFIED";
  const populationScope =
    pickOptionalSearchContext(input.targetPopulation, 8) ?? "UNSPECIFIED";
  const methodScope =
    pickOptionalSearchContext(input.preferredMethodology, 8) ?? "UNSPECIFIED";
  const researchScope =
    pickOptionalSearchContext(input.researchLine, 8) ?? "UNSPECIFIED";

  return `
You are a senior academic literature retrieval specialist for master's thesis planning.
Your task is to convert a student's structured intake into high-quality OpenAlex search queries.

Search environment:
- OpenAlex retrieval works better with English-first academic terminology
- the student's original intake may be written in Spanish
- preserve the technical meaning, but produce retrieval outputs optimized for English-language titles and abstracts
- current project language is ${input.activeLanguage || APP_DEFAULT_LANGUAGE}, but search outputs should be English-first unless the topic is inherently local-language specific

Primary goal:
- maximize retrieval of recent, technically useful academic sources for a traceable blueprint

Important rules:
- do not invent facts, methods, populations, or results
- do not turn the intake into a thesis proposal
- do not use marketing wording or educational coaching language
- use terminology commonly found in journal articles, review papers, and engineering research
- prioritize short, high-signal query strings likely to match titles and abstracts
- keep the core topic dominant
- use problem context only if it improves precision
- use target population only if it materially improves precision
- avoid unnecessary institutional or program wording
- preserve domain-specific technical terms if the user already provided them
- prefer queries that can retrieve at least several papers with abstracts, methods, or technical findings
- prefer recent literature when that does not distort the topic

Input intake:
- topic_es: ${input.topic}
- problem_context_es: ${input.problemContext ?? "UNSPECIFIED"}
- target_population_es: ${input.targetPopulation ?? "UNSPECIFIED"}
- preferred_methodology_es: ${input.preferredMethodology ?? "UNSPECIFIED"}
- research_line_es: ${input.researchLine ?? "UNSPECIFIED"}

Compressed retrieval hints:
- problem_frame_hint: ${problemFrame}
- population_scope_hint: ${populationScope}
- method_scope_hint: ${methodScope}
- research_scope_hint: ${researchScope}

Return a JSON object with:
- normalized_topic: concise academic retrieval topic in English
- intent_summary: one-sentence English summary of what literature should be retrieved
- search_queries: 2 to 4 short English-first OpenAlex queries with different retrieval angles
- cross_language_queries: up to 3 optional backup queries in Spanish or mixed language only if they may improve recall
- focus_terms: 5 to 10 high-value English technical terms for local reranking
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
