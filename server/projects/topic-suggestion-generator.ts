import { TOPIC_SUGGESTION_GENERATOR_2_PROMPT } from "@/server/mvp/prompts/topic-suggestion-generator.v2";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import topicSuggestionSchema from "@/ai/schemas/topic-suggestion.schema.json";
import { getConfiguredLlmProvider } from "@/llm";

type TopicSuggestionGeneratorInput = {
  country: string;
  degreeLevel: string;
  program: string;
  areaLabel: string | null;
  seedText: string;
  taxonomyHints: string[];
};

type GeneratedTopicSuggestion = {
  title: string;
  researchLine: string;
  rationale: string;
  variantKind: "TECHNICAL_REWRITE" | "VARIANT";
  problemContext: string;
  targetPopulation: string;
  preferredMethodology: string;
  availableData: string;
  academicConstraints: string;
  advisorNotes: string;
};

type TopicSuggestionBatch = {
  suggestions: GeneratedTopicSuggestion[];
};

export async function generateTopicSuggestionsInRealTime(
  input: TopicSuggestionGeneratorInput,
) {
  const provider = getConfiguredLlmProvider();
  const taxonomyHints =
    input.taxonomyHints.length > 0
      ? input.taxonomyHints.join(", ")
      : "Sin hints taxonomicos claros";

  const response = await provider.generateStructuredObject<TopicSuggestionBatch>({
    model: process.env.IMX_IDEA_MODEL?.trim() || process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
    maxOutputTokens: 3200,
    prompt: renderVersionedPrompt(TOPIC_SUGGESTION_GENERATOR_2_PROMPT, {
      var_0: input.degreeLevel,
      var_1: input.country,
      var_2: input.program,
      var_3: input.areaLabel ?? "No especificada",
      var_4: input.seedText,
      var_5: taxonomyHints,
    }).trim(),
    schemaName: "topic_suggestion_batch",
    trackingAttribution: { promptVersion: TOPIC_SUGGESTION_GENERATOR_2_PROMPT.version },
    schema: topicSuggestionSchema as Record<string, unknown>,
  });

  return response.suggestions.slice(0, 3);
}
