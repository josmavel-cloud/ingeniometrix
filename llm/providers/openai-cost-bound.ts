// Official standard pricing / image sizing checked 2026-09-21:
// https://developers.openai.com/api/docs/guides/images-vision
// https://developers.openai.com/api/docs/models/gpt-5.4
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
export type InputTokenCountProvenance = "EXACT_PROVIDER_COUNT" | "LOCAL_ESTIMATE" | "LEGACY_CONSERVATIVE_BOUND";
export function responseCostBound(params: { model?: string | null; max_output_tokens?: number | null; [key: string]: unknown }, exactInputTokens?: number) {
  // RC4 text-only selector/critic. Official model pages checked 2026-09-21.
  const newReasoning = params.model === "gpt-6-astra" || params.model === "gpt-5.6-sol";
  const rates = params.model === "gpt-6-astra" ? [10, 50] : params.model === "gpt-5.6-sol" ? [4, 20] : params.model === "gpt-5.4" ? [2.5, 15] : params.model === "gpt-5.4-mini" ? [0.75, 4.5] : params.model === "gpt-5.4-nano" ? [0.2, 1.25] : null;
  if (!rates || !params.max_output_tokens) return null;
  let imageTokens = 0, unsupportedImage = false;
  const serialized = JSON.stringify(params, (_key, value) => {
    if (value && typeof value === "object" && value.type === "input_image") {
      if (value.detail !== "high") unsupportedImage = true;
      // High: <=2500 patches *1.2; one extra token covers documented rounding.
      imageTokens += 3001;
      return { type: "input_image", detail: value.detail, image_url: "[image accounted separately]" };
    }
    return value;
  });
  if (unsupportedImage || newReasoning && imageTokens > 0) return null;
  const exact = Number.isSafeInteger(exactInputTokens) && exactInputTokens! >= 0;
  const inputTokens = exact ? exactInputTokens! : Buffer.byteLength(serialized) + 2048 + imageTokens;
  const longContext = (params.model === "gpt-5.4" || newReasoning) && inputTokens > 272000;
  // No cache discount assumed before dispatch. Reserve the documented cache-write
  // premium for the new models; output bound includes billed reasoning tokens.
  const cacheWriteFactor = newReasoning ? 1.25 : 1;
  const maximumUsd = (inputTokens * rates[0] * cacheWriteFactor * (longContext ? 2 : 1) + params.max_output_tokens * rates[1] * (longContext ? 1.5 : 1)) / 1e6;
  return { maximumUsd, rates, inputTokens, imageTokens, cacheWriteFactor,
    tokenCountProvenance: exact ? "EXACT_PROVIDER_COUNT" as const : "LEGACY_CONSERVATIVE_BOUND" as const };
}

export function estimateResponseUsageCost(requestedModel: string, usage: {
  input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } | null;
}) {
  const bound = responseCostBound({ model: requestedModel, max_output_tokens: 1 });
  if (!bound?.rates || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens) ||
    usage.input_tokens < 0 || usage.output_tokens < 0) throw new Error("PROVIDER_USAGE_INVALID");
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  if (!Number.isSafeInteger(cached) || cached < 0 || cached > usage.input_tokens) throw new Error("PROVIDER_USAGE_INVALID");
  const longContext = ["gpt-5.4", "gpt-6-astra", "gpt-5.6-sol"].includes(requestedModel) && usage.input_tokens > 272000;
  return (((usage.input_tokens - cached) * (bound.cacheWriteFactor ?? 1) + cached / 10) * bound.rates[0] * (longContext ? 2 : 1) +
    usage.output_tokens * bound.rates[1] * (longContext ? 1.5 : 1)) / 1e6;
}
