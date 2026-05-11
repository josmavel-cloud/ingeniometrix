import { readLlmUsageRegistry, type LlmUsageTotals } from "@/server/llm-usage-registry";

export type MvpApiUsageSnapshot = {
  capturedAt: string;
  cumulative: LlmUsageTotals;
};

function emptyTotals(): LlmUsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    costCad: 0,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function diffApiUsageTotals(after: LlmUsageTotals, before: LlmUsageTotals): LlmUsageTotals {
  return {
    calls: Math.max(0, after.calls - before.calls),
    inputTokens: Math.max(0, after.inputTokens - before.inputTokens),
    cachedInputTokens: Math.max(0, after.cachedInputTokens - before.cachedInputTokens),
    outputTokens: Math.max(0, after.outputTokens - before.outputTokens),
    totalTokens: Math.max(0, after.totalTokens - before.totalTokens),
    costUsd: roundMoney(Math.max(0, after.costUsd - before.costUsd)),
    costCad: roundMoney(Math.max(0, after.costCad - before.costCad)),
  };
}

export async function captureMvpApiUsageSnapshot(): Promise<MvpApiUsageSnapshot> {
  const registry = await readLlmUsageRegistry();
  return {
    capturedAt: new Date().toISOString(),
    cumulative: { ...registry.cumulative },
  };
}

export async function buildMvpApiUsageReport(input?: {
  before?: MvpApiUsageSnapshot | null;
  label?: string;
}) {
  const registry = await readLlmUsageRegistry();
  const after: MvpApiUsageSnapshot = {
    capturedAt: new Date().toISOString(),
    cumulative: { ...registry.cumulative },
  };
  const delta = input?.before
    ? diffApiUsageTotals(after.cumulative, input.before.cumulative)
    : emptyTotals();

  return {
    artifact_type: "mvp_api_usage_report",
    artifact_version: "v1",
    label: input?.label ?? null,
    generated_at: new Date().toISOString(),
    before: input?.before ?? null,
    after,
    delta,
    cumulative: registry.cumulative,
    today: registry.byDate[new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())] ?? null,
    pricing: {
      version: registry.pricingVersion,
      source_url: registry.pricingSourceUrl,
      fx_usd_to_cad: registry.fxRateUsdToCad,
      fx_source_url: registry.fxSourceUrl,
      fx_published_date: registry.fxPublishedDate,
    },
    recent_calls: registry.recentCalls.slice(0, 20),
  };
}
