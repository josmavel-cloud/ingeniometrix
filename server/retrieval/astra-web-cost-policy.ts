export const ASTRA_WEB_COST_POLICY_VERSION = "astra-web-cost-policy.v1";
export const ASTRA_WEB_COST_POLICY = {
  version: ASTRA_WEB_COST_POLICY_VERSION,
  model: "gpt-6-astra", processingTier: "standard", reasoningEffort: "low",
  inputUsdPerMillion: 10, outputUsdPerMillion: 50, webSearchUsdPerCall: 0.01,
  cacheWriteFactor: 1.25, modelInputTokenBound: 20_000,
  // Official Responses web-search context window; count it as billed input.
  searchContextTokenBound: 128_000,
  operationReservationCeilingUsd: 2.50,
  reviewedAt: "2026-09-28",
  pricingSource: "https://developers.openai.com/api/docs/pricing",
  searchContextSource: "https://developers.openai.com/api/docs/guides/tools-web-search",
} as const;

export function webDiscoveryCostBound(input: { requestBytes: number; maxOutputTokens: number; maxToolCalls: number },
  policy: typeof ASTRA_WEB_COST_POLICY | null = ASTRA_WEB_COST_POLICY) {
  if (!policy || !Number.isSafeInteger(input.requestBytes) || input.requestBytes <= 0 ||
      !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0 ||
      !Number.isSafeInteger(input.maxToolCalls) || input.maxToolCalls <= 0 ||
      Object.values({ input: policy.inputUsdPerMillion, output: policy.outputUsdPerMillion,
        tool: policy.webSearchUsdPerCall, search: policy.searchContextTokenBound }).some(v => !Number.isFinite(v) || v <= 0)) return null;
  // UTF-8 bytes plus allowance upper-bounds locally serialized text/schema tokens.
  if (input.requestBytes + 2048 > policy.modelInputTokenBound) return null;
  const maximumUsd = ((policy.modelInputTokenBound + policy.searchContextTokenBound) * policy.inputUsdPerMillion *
    policy.cacheWriteFactor + input.maxOutputTokens * policy.outputUsdPerMillion) / 1_000_000 +
    input.maxToolCalls * policy.webSearchUsdPerCall;
  if (!Number.isFinite(maximumUsd) || maximumUsd > policy.operationReservationCeilingUsd) return null;
  return { maximumUsd, version: policy.version, modelInputTokenBound: policy.modelInputTokenBound,
    searchContextTokenBound: policy.searchContextTokenBound };
}

export function webDiscoveryActualCost(usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }, toolCalls: number) {
  const p = ASTRA_WEB_COST_POLICY;
  if (![usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, toolCalls].every(n => Number.isSafeInteger(n) && n >= 0) ||
      usage.cachedInputTokens > usage.inputTokens) return null;
  const totalInput = usage.inputTokens;
  // No cache discount assumed; this is conservative when the provider caches input.
  const longContext = totalInput > 272_000;
  return (totalInput * p.inputUsdPerMillion * p.cacheWriteFactor * (longContext ? 2 : 1) +
    usage.outputTokens * p.outputUsdPerMillion * (longContext ? 1.5 : 1)) / 1_000_000 + toolCalls * p.webSearchUsdPerCall;
}
