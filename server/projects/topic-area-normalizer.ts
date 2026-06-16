import topicAreaNormalizationSchema from "@/ai/schemas/topic-area-normalization.schema.json";
import { getConfiguredLlmProvider } from "@/llm";
import { PROJECT_CAREERS } from "@/lib/project-presets";

type TopicAreaNormalizationResult = {
  normalizedLabel: string;
  canonicalAreaId: string | null;
  canonicalAreaLabel: string | null;
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export async function normalizeTopicAreaSemantically(rawLabel: string) {
  const provider = getConfiguredLlmProvider();
  const catalogEntries = PROJECT_CAREERS.map(
    (career) => `- ${career.id}: ${career.label}`,
  ).join("\n");

  return provider.generateStructuredObject<TopicAreaNormalizationResult>({
    model: process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini",
    prompt: `
Actua como un clasificador semantico rapido para areas o carreras de investigacion en Peru.

Objetivo:
- corregir o normalizar el texto ingresado por el usuario
- asignarlo a una carrera del catalogo si existe cercania semantica suficiente
- si no existe una carrera claramente equivalente, conserva una etiqueta limpia y deja el canonico en null

Reglas:
- no inventes ids fuera del catalogo
- no fuerces una carrera si la relacion no es razonable
- corrige errores obvios de redaccion, tildes o formulacion
- responde solo con el esquema solicitado

Texto del usuario:
- ${rawLabel}

Catalogo disponible:
${catalogEntries}
    `.trim(),
    schemaName: "topic_area_normalization",
    schema: topicAreaNormalizationSchema as Record<string, unknown>,
  });
}
