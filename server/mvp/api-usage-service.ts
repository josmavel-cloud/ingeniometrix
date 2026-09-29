import {
  filterLlmUsageCalls,
  readLlmUsageRegistry,
  sumLlmUsageCalls,
  type LlmUsageCallRecord,
  type LlmUsageTotals,
} from "@/server/llm-usage-registry";

export type MvpApiUsageSnapshot = {
  capturedAt: string;
  cumulative: LlmUsageTotals;
};

export type MvpApiUsageReportFilter = {
  projectId?: string | null;
  runId?: string | null;
  stage?: string | null;
  since?: string | null;
  until?: string | null;
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

function dateToronto() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function callsByStage(calls: LlmUsageCallRecord[]) {
  return calls.reduce<Record<string, LlmUsageTotals>>((accumulator, call) => {
    const stage = call.attribution?.stage ?? "unattributed";
    accumulator[stage] = accumulator[stage] ?? emptyTotals();
    const totals = sumLlmUsageCalls([call]);
    accumulator[stage] = {
      calls: accumulator[stage].calls + totals.calls,
      inputTokens: accumulator[stage].inputTokens + totals.inputTokens,
      cachedInputTokens: accumulator[stage].cachedInputTokens + totals.cachedInputTokens,
      outputTokens: accumulator[stage].outputTokens + totals.outputTokens,
      totalTokens: accumulator[stage].totalTokens + totals.totalTokens,
      costUsd: roundMoney(accumulator[stage].costUsd + totals.costUsd),
      costCad: roundMoney(accumulator[stage].costCad + totals.costCad),
    };
    return accumulator;
  }, {});
}

export async function buildMvpApiUsageReport(input?: {
  before?: MvpApiUsageSnapshot | null;
  label?: string;
  filter?: MvpApiUsageReportFilter;
}) {
  const registry = await readLlmUsageRegistry();
  const after: MvpApiUsageSnapshot = {
    capturedAt: new Date().toISOString(),
    cumulative: { ...registry.cumulative },
  };
  const globalDelta = input?.before
    ? diffApiUsageTotals(after.cumulative, input.before.cumulative)
    : emptyTotals();
  const filteredCalls = input?.filter
    ? filterLlmUsageCalls({ calls: registry.recentCalls, ...input.filter })
    : [];
  const filteredTotals = input?.filter ? sumLlmUsageCalls(filteredCalls) : null;
  const projectTotals = input?.filter?.projectId
    ? registry.byProject[input.filter.projectId] ?? null
    : null;

  return {
    artifact_type: "mvp_api_usage_report",
    artifact_version: "v2",
    label: input?.label ?? null,
    generated_at: new Date().toISOString(),
    filter: input?.filter ?? null,
    before: input?.before ?? null,
    after,
    delta: globalDelta,
    filtered_delta: filteredTotals,
    filtered_by_stage: input?.filter ? callsByStage(filteredCalls) : null,
    project_totals: projectTotals,
    cumulative: registry.cumulative,
    today: registry.byDate[dateToronto()] ?? null,
    pricing: {
      version: registry.pricingVersion,
      source_url: registry.pricingSourceUrl,
      fx_usd_to_cad: registry.fxRateUsdToCad,
      fx_source_url: registry.fxSourceUrl,
      fx_published_date: registry.fxPublishedDate,
    },
    recent_calls: (input?.filter ? filteredCalls : registry.recentCalls).slice(0, 50),
  };
}
