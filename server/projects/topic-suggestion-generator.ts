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
    prompt: `
Eres Ingeniometrix. Genera sugerencias de temas de tesis en espanol para contexto universitario en Peru.

Reglas:
- no generes una tesis completa
- no inventes resultados
- devuelve solo ideas de tema defendibles y acotadas
- deben sonar viables para revision academica
- prioriza cercania a la idea original, no creatividad vacia
- la primera sugerencia debe ser una version tecnica y mejor redactada de la idea original
- las otras sugerencias pueden variar el enfoque, pero deben seguir alineadas con la semilla
- si faltan datos concretos, propone formulaciones prudentes y editables
- llena tambien una base sugerida de intake para problema, poblacion, metodologia y contexto
- no uses placeholders como "por definir", "pendiente" o "no disponible"

Contexto del proyecto:
- universidad: ${input.university}
- nivel: ${input.degreeLevel}
- programa: ${input.program}
- area: ${input.areaLabel ?? "No especificada"}
- idea semilla del usuario: ${input.seedText}
- hints taxonomicos: ${taxonomyHints}

Genera entre 3 y 4 sugerencias.
Cada variante debe incluir:
- title
- researchLine
- rationale
- variantKind
- problemContext
- targetPopulation
- preferredMethodology
- availableData
- academicConstraints
- advisorNotes

variantKind:
- usa TECHNICAL_REWRITE solo en la primera sugerencia, que debe ser la mas cercana a la semilla
- usa VARIANT en las demas
    `.trim(),
    schemaName: "topic_suggestion_batch",
    schema: topicSuggestionSchema as Record<string, unknown>,
  });

  return response.suggestions;
}
