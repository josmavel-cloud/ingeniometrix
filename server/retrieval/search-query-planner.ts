import { SEARCH_QUERY_PLANNER_1_PROMPT } from "@/server/mvp/prompts/search-query-planner.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
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

  return renderVersionedPrompt(SEARCH_QUERY_PLANNER_1_PROMPT, { var_0: (input.activeLanguage || APP_DEFAULT_LANGUAGE), var_1: (input.topic), var_2: (input.problemContext ?? "UNSPECIFIED"), var_3: (input.targetPopulation ?? "UNSPECIFIED"), var_4: (input.preferredMethodology ?? "UNSPECIFIED"), var_5: (input.researchLine ?? "UNSPECIFIED"), var_6: (problemFrame), var_7: (populationScope), var_8: (methodScope), var_9: (researchScope) }).trim();
}

export async function buildReferenceSearchPlan(input: BuildReferenceSearchPlanInput) {
  const fallbackPlan = buildFallbackPlan(input);

  try {
    const provider = getConfiguredLlmProvider();
    const generatedPlan = await generateStructuredObjectWithTextFallback<ReferenceSearchPlan>({
      provider,
      prompt: buildPrompt(input),
      schemaName: "reference_search_plan",
      trackingAttribution: { promptVersion: SEARCH_QUERY_PLANNER_1_PROMPT.version },
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
