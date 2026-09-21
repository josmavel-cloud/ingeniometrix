import { RETRIEVAL_LLM_JSON_1_PROMPT } from "@/server/mvp/prompts/retrieval-llm-json.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import type { LlmProvider } from "@/llm/provider";
import type { LlmUsageAttribution } from "@/server/llm-usage-registry";

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Razon no identificada.";
}

function buildJsonOnlyPrompt(prompt: string) {
  return renderVersionedPrompt(RETRIEVAL_LLM_JSON_1_PROMPT, { var_0: (prompt) }).trim();
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch =
    trimmed.match(/```json\s*([\s\S]*?)```/i) ??
    trimmed.match(/```\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("No se encontro un objeto JSON valido en la respuesta del modelo.");
}

export async function generateStructuredObjectWithTextFallback<T>(params: {
  provider: LlmProvider;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
  maxOutputTokens?: number;
  trackingAttribution?: LlmUsageAttribution;
}) {
  try {
    return await params.provider.generateStructuredObject<T>({
      prompt: params.prompt,
      schemaName: params.schemaName,
      schema: params.schema,
      model: params.model,
      maxOutputTokens: params.maxOutputTokens,
      trackingLabel: `structured:${params.schemaName}`,
      trackingAttribution: params.trackingAttribution,
    });
  } catch (structuredError) {
    const structuredReason = describeError(structuredError);

    try {
      const textResponse = await params.provider.generateText({
        prompt: buildJsonOnlyPrompt(params.prompt),
        model: params.model,
        maxOutputTokens: params.maxOutputTokens,
        trackingLabel: `text_fallback:${params.schemaName}`,
        trackingAttribution: { ...params.trackingAttribution, promptVersion: `${params.trackingAttribution?.promptVersion ?? params.schemaName}+${RETRIEVAL_LLM_JSON_1_PROMPT.version}` },
      });

      return JSON.parse(extractJsonObject(textResponse)) as T;
    } catch (textFallbackError) {
      throw new Error(
        `Fallo structured output: ${structuredReason}. Fallo fallback JSON: ${describeError(textFallbackError)}.`,
      );
    }
  }
}
