import topicSuggestionSchema from "@/ai/schemas/topic-suggestion.schema.json";
import { getConfiguredLlmProvider } from "@/llm";

type TopicSuggestionGeneratorInput = {
  university: string;
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
    prompt: `
Eres Ingeniometrix. Genera sugerencias de temas de tesis en espanol para maestria o posgrado en Peru.

Reglas:
- no generes una tesis completa
- no inventes resultados
- devuelve solo ideas de tema defendibles y acotadas
- deben sonar viables para revision academica
- evita repetir literalmente la semilla del usuario
- prioriza cercania a la idea original, no creatividad vacia

Contexto del proyecto:
- universidad: ${input.university}
- nivel: ${input.degreeLevel}
- programa: ${input.program}
- area: ${input.areaLabel ?? "No especificada"}
- idea semilla del usuario: ${input.seedText}
- hints taxonomicos: ${taxonomyHints}

Genera entre 3 y 4 variantes.
Cada variante debe incluir:
- title
- researchLine
- rationale
    `.trim(),
    schemaName: "topic_suggestion_batch",
    schema: topicSuggestionSchema as Record<string, unknown>,
  });

  return response.suggestions;
}
