import { TOPIC_AREA_NORMALIZER_1_PROMPT } from "@/server/mvp/prompts/topic-area-normalizer.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
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
    prompt: renderVersionedPrompt(TOPIC_AREA_NORMALIZER_1_PROMPT, { var_0: (rawLabel), var_1: (catalogEntries) }).trim(),
    schemaName: "topic_area_normalization",
    trackingAttribution: { promptVersion: TOPIC_AREA_NORMALIZER_1_PROMPT.version },
    schema: topicAreaNormalizationSchema as Record<string, unknown>,
  });
}
