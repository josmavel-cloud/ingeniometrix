import { TOPIC_SUGGESTION_GENERATOR_1_PROMPT } from "@/server/mvp/prompts/topic-suggestion-generator.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import topicSuggestionSchema from "@/ai/schemas/topic-suggestion.schema.json";
import { getConfiguredLlmProvider } from "@/llm";

type TopicSuggestionGeneratorInput = {
  university: string;
  universityContext: string;
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
    prompt: renderVersionedPrompt(TOPIC_SUGGESTION_GENERATOR_1_PROMPT, { var_0: (input.university), var_1: (input.universityContext), var_2: (input.degreeLevel), var_3: (input.program), var_4: (input.areaLabel ?? "No especificada"), var_5: (input.seedText), var_6: (taxonomyHints) }).trim(),
    schemaName: "topic_suggestion_batch",
    trackingAttribution: { promptVersion: TOPIC_SUGGESTION_GENERATOR_1_PROMPT.version },
    schema: topicSuggestionSchema as Record<string, unknown>,
  });

  return response.suggestions.slice(0, 3);
}
