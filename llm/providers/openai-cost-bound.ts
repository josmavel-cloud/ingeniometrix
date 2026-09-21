// Official standard pricing / image sizing checked 2026-09-21:
// https://developers.openai.com/api/docs/guides/images-vision
// https://developers.openai.com/api/docs/models/gpt-5.4
// https://developers.openai.com/api/docs/models/gpt-5.4-mini
export function responseCostBound(params: { model?: string | null; max_output_tokens?: number | null; [key: string]: unknown }) {
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
  const inputTokens = Buffer.byteLength(serialized) + 2048 + imageTokens;
  const longContext = (params.model === "gpt-5.4" || newReasoning) && inputTokens > 272000;
  // No cache discount assumed before dispatch. Reserve the documented cache-write
  // premium for the new models; output bound includes billed reasoning tokens.
  const cacheWriteFactor = newReasoning ? 1.25 : 1;
  const maximumUsd = (inputTokens * rates[0] * cacheWriteFactor * (longContext ? 2 : 1) + params.max_output_tokens * rates[1] * (longContext ? 1.5 : 1)) / 1e6;
  return { maximumUsd, rates, inputTokens, imageTokens, cacheWriteFactor };
}
