import type { LlmProvider } from "@/llm/provider";
import type { LlmUsageAttribution } from "@/server/llm-usage-registry";

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Razon no identificada.";
}

function buildJsonOnlyPrompt(prompt: string) {
  return `${prompt}

Responde exclusivamente con un objeto JSON valido.
- no uses markdown
- no uses bloques de codigo
- no agregues texto antes ni despues del JSON
- si un campo no puede completarse con precision, devuelve null, un arreglo vacio o una formulacion prudente
`.trim();
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
        trackingAttribution: params.trackingAttribution,
      });

      return JSON.parse(extractJsonObject(textResponse)) as T;
    } catch (textFallbackError) {
      throw new Error(
        `Fallo structured output: ${structuredReason}. Fallo fallback JSON: ${describeError(textFallbackError)}.`,
      );
    }
  }
}
