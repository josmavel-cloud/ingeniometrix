import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type PricingRecord = {
  inputUsdPer1M: number;
  cachedInputUsdPer1M: number;
  outputUsdPer1M: number;
};

export type LlmUsageCallRecord = {
  recordedAt: string;
  date: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costCad: number;
};

export type LlmUsageTotals = {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costCad: number;
};

export type LlmUsageRegistry = {
  startedAt: string;
  startedDate: string;
  baselineHistorical: {
    active: boolean;
    startDate: string | null;
    endDate: string | null;
    costCad: number;
    costUsd: number;
    totalTokens: number | null;
    notes: string | null;
    importedAt: string | null;
  };
  pricingVersion: string;
  pricingSourceUrl: string;
  fxRateUsdToCad: number;
  fxPublishedDate: string;
  fxSourceUrl: string;
  cumulative: LlmUsageTotals;
  byDate: Record<string, LlmUsageTotals>;
  recentCalls: LlmUsageCallRecord[];
};

const REGISTRY_DIR = path.join(process.cwd(), "artifacts-local", "llm-usage");
const REGISTRY_FILE = path.join(REGISTRY_DIR, "registry.json");
const PRICING_VERSION = "openai-api-pricing-2026-04-30";
const PRICING_SOURCE_URL = "https://openai.com/api/pricing/";
const FX_SOURCE_URL = "https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates-/";
const FX_PUBLISHED_DATE = "2026-04-29";
const FX_RATE_USD_TO_CAD = 1.3682;
const MAX_RECENT_CALLS = 100;

const MODEL_PRICING: Record<string, PricingRecord> = {
  "gpt-5.5": { inputUsdPer1M: 5, cachedInputUsdPer1M: 0.5, outputUsdPer1M: 30 },
  "gpt-5.4": { inputUsdPer1M: 2.5, cachedInputUsdPer1M: 0.25, outputUsdPer1M: 15 },
  "gpt-5.4-mini": { inputUsdPer1M: 0.75, cachedInputUsdPer1M: 0.075, outputUsdPer1M: 4.5 },
  "gpt-5.4 mini": { inputUsdPer1M: 0.75, cachedInputUsdPer1M: 0.075, outputUsdPer1M: 4.5 },
  "gpt-5.4-nano": { inputUsdPer1M: 0.2, cachedInputUsdPer1M: 0.02, outputUsdPer1M: 1.25 },
  "gpt-5.4 nano": { inputUsdPer1M: 0.2, cachedInputUsdPer1M: 0.02, outputUsdPer1M: 1.25 },
};

function roundMoney(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function getTodayToronto() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

function normalizeRegistry(registry: Partial<LlmUsageRegistry>): LlmUsageRegistry {
  const fallback = buildDefaultRegistry();
  return {
    startedAt: registry.startedAt ?? fallback.startedAt,
    startedDate: registry.startedDate ?? fallback.startedDate,
    baselineHistorical: {
      active: registry.baselineHistorical?.active ?? fallback.baselineHistorical.active,
      startDate: registry.baselineHistorical?.startDate ?? fallback.baselineHistorical.startDate,
      endDate: registry.baselineHistorical?.endDate ?? fallback.baselineHistorical.endDate,
      costCad: registry.baselineHistorical?.costCad ?? fallback.baselineHistorical.costCad,
      costUsd: registry.baselineHistorical?.costUsd ?? fallback.baselineHistorical.costUsd,
      totalTokens:
        registry.baselineHistorical?.totalTokens ?? fallback.baselineHistorical.totalTokens,
      notes: registry.baselineHistorical?.notes ?? fallback.baselineHistorical.notes,
      importedAt: registry.baselineHistorical?.importedAt ?? fallback.baselineHistorical.importedAt,
    },
    pricingVersion: registry.pricingVersion ?? fallback.pricingVersion,
    pricingSourceUrl: registry.pricingSourceUrl ?? fallback.pricingSourceUrl,
    fxRateUsdToCad: registry.fxRateUsdToCad ?? fallback.fxRateUsdToCad,
    fxPublishedDate: registry.fxPublishedDate ?? fallback.fxPublishedDate,
    fxSourceUrl: registry.fxSourceUrl ?? fallback.fxSourceUrl,
    cumulative: {
      ...emptyTotals(),
      ...(registry.cumulative ?? {}),
    },
    byDate: registry.byDate ?? fallback.byDate,
    recentCalls: registry.recentCalls ?? fallback.recentCalls,
  };
}

function buildDefaultRegistry(): LlmUsageRegistry {
  const startedAt = new Date().toISOString();
  const startedDate = getTodayToronto();
  return {
    startedAt,
    startedDate,
    baselineHistorical: {
      active: false,
      startDate: null,
      endDate: null,
      costCad: 0,
      costUsd: 0,
      totalTokens: null,
      notes: null,
      importedAt: null,
    },
    pricingVersion: PRICING_VERSION,
    pricingSourceUrl: PRICING_SOURCE_URL,
    fxRateUsdToCad: FX_RATE_USD_TO_CAD,
    fxPublishedDate: FX_PUBLISHED_DATE,
    fxSourceUrl: FX_SOURCE_URL,
    cumulative: emptyTotals(),
    byDate: {
      [startedDate]: emptyTotals(),
    },
    recentCalls: [],
  };
}

async function ensureDir() {
  await mkdir(REGISTRY_DIR, { recursive: true });
}

export async function readLlmUsageRegistry(): Promise<LlmUsageRegistry> {
  try {
    const raw = await readFile(REGISTRY_FILE, "utf8");
    const registry = normalizeRegistry(JSON.parse(raw) as Partial<LlmUsageRegistry>);
    await ensureDir();
    await writeFile(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    return registry;
  } catch {
    const registry = buildDefaultRegistry();
    await ensureDir();
    await writeFile(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    return registry;
  }
}

async function writeLlmUsageRegistry(registry: LlmUsageRegistry) {
  await ensureDir();
  await writeFile(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}

function resolvePricing(model: string) {
  return MODEL_PRICING[model.trim().toLowerCase()] ?? MODEL_PRICING["gpt-5.4"];
}

function addTotals(target: LlmUsageTotals, delta: LlmUsageTotals) {
  target.calls += delta.calls;
  target.inputTokens += delta.inputTokens;
  target.cachedInputTokens += delta.cachedInputTokens;
  target.outputTokens += delta.outputTokens;
  target.totalTokens += delta.totalTokens;
  target.costUsd = roundMoney(target.costUsd + delta.costUsd);
  target.costCad = roundMoney(target.costCad + delta.costCad);
}

export async function recordLlmUsage(input: {
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}) {
  const registry = await readLlmUsageRegistry();
  const date = getTodayToronto();
  const pricing = resolvePricing(input.model);
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const nonCachedInputTokens = Math.max(0, input.inputTokens - cachedInputTokens);
  const costUsd =
    (nonCachedInputTokens / 1_000_000) * pricing.inputUsdPer1M +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPer1M +
    (input.outputTokens / 1_000_000) * pricing.outputUsdPer1M;
  const costCad = costUsd * registry.fxRateUsdToCad;
  const delta: LlmUsageTotals = {
    calls: 1,
    inputTokens: input.inputTokens,
    cachedInputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.inputTokens + input.outputTokens,
    costUsd: roundMoney(costUsd),
    costCad: roundMoney(costCad),
  };

  if (!registry.byDate[date]) {
    registry.byDate[date] = emptyTotals();
  }

  addTotals(registry.cumulative, delta);
  addTotals(registry.byDate[date], delta);

  const callRecord: LlmUsageCallRecord = {
    recordedAt: new Date().toISOString(),
    date,
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    inputTokens: input.inputTokens,
    cachedInputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.inputTokens + input.outputTokens,
    costUsd: roundMoney(costUsd),
    costCad: roundMoney(costCad),
  };

  registry.recentCalls.unshift(callRecord);
  registry.recentCalls = registry.recentCalls.slice(0, MAX_RECENT_CALLS);

  await writeLlmUsageRegistry(registry);
  return {
    registry,
    callRecord,
  };
}

export async function applyHistoricalBaseline(input: {
  startDate: string;
  endDate: string;
  costCad: number;
  totalTokens?: number | null;
  notes: string;
}) {
  const registry = await readLlmUsageRegistry();
  registry.baselineHistorical = {
    active: true,
    startDate: input.startDate,
    endDate: input.endDate,
    costCad: roundMoney(input.costCad),
    costUsd: roundMoney(input.costCad / registry.fxRateUsdToCad),
    totalTokens: input.totalTokens ?? null,
    notes: input.notes,
    importedAt: new Date().toISOString(),
  };
  await writeLlmUsageRegistry(registry);
  return registry;
}
