import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type LlmUsageStage =
  | "intake"
  | "source_discovery"
  | "source_translation"
  | "source_inspection"
  | "evidence_materialization"
  | "blueprint_generation"
  | "section_generation"
  | "docx_generation"
  | "repair"
  | "qa"
  | "other";

export type LlmUsageAttribution = {
  draftId?: string | null;
  requestId?: string | null;
  revision?: string | null;
  projectId?: string | null;
  runId?: string | null;
  stage?: LlmUsageStage | string | null;
  userId?: string | null;
  source?: string | null;
  promptVersion?: string | null;
  promptHash?: string | null;
  schemaName?: string | null;
  cacheKey?: string | null;
  sourceId?: string | null;
  assetId?: string | null;
};

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
  attribution?: LlmUsageAttribution;
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

export type LlmUsageProjectTotals = {
  totals: LlmUsageTotals;
  byRun: Record<string, LlmUsageTotals>;
  byStage: Record<string, LlmUsageTotals>;
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
  byProject: Record<string, LlmUsageProjectTotals>;
  recentCalls: LlmUsageCallRecord[];
};

const REGISTRY_DIR = path.join(process.cwd(), "artifacts-local", "llm-usage");
const REGISTRY_FILE = path.join(REGISTRY_DIR, "registry.json");
const PRICING_VERSION = "openai-api-pricing-2026-09-21-rc4-text";
const PRICING_SOURCE_URL = "https://openai.com/api/pricing/";
const FX_SOURCE_URL = "https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates-/";
const FX_PUBLISHED_DATE = "2026-04-29";
const FX_RATE_USD_TO_CAD = 1.3682;
const MAX_RECENT_CALLS = 500;

const usageContext = new AsyncLocalStorage<LlmUsageAttribution>();

const MODEL_PRICING: Record<string, PricingRecord> = {
  "gpt-6-astra": { inputUsdPer1M: 10, cachedInputUsdPer1M: 1, outputUsdPer1M: 50 },
  "gpt-5.6-sol": { inputUsdPer1M: 4, cachedInputUsdPer1M: 0.4, outputUsdPer1M: 20 },
  "gpt-5.5": { inputUsdPer1M: 5, cachedInputUsdPer1M: 0.5, outputUsdPer1M: 30 },
  "gpt-5.4": { inputUsdPer1M: 2.5, cachedInputUsdPer1M: 0.25, outputUsdPer1M: 15 },
  "gpt-5.4-mini": { inputUsdPer1M: 0.75, cachedInputUsdPer1M: 0.075, outputUsdPer1M: 4.5 },
  "gpt-5.4 mini": { inputUsdPer1M: 0.75, cachedInputUsdPer1M: 0.075, outputUsdPer1M: 4.5 },
  "gpt-5.4-nano": { inputUsdPer1M: 0.2, cachedInputUsdPer1M: 0.02, outputUsdPer1M: 1.25 },
  "gpt-5.4 nano": { inputUsdPer1M: 0.2, cachedInputUsdPer1M: 0.02, outputUsdPer1M: 1.25 },
  "o4-mini-deep-research": { inputUsdPer1M: 2, cachedInputUsdPer1M: 0.5, outputUsdPer1M: 8 },
  "o3-deep-research": { inputUsdPer1M: 10, cachedInputUsdPer1M: 2.5, outputUsdPer1M: 40 },
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

function normalizeTotals(input?: Partial<LlmUsageTotals>): LlmUsageTotals {
  return { ...emptyTotals(), ...(input ?? {}) };
}

function emptyProjectTotals(): LlmUsageProjectTotals {
  return { totals: emptyTotals(), byRun: {}, byStage: {} };
}

function normalizeProjectTotals(input?: Partial<LlmUsageProjectTotals>): LlmUsageProjectTotals {
  const normalized = emptyProjectTotals();
  normalized.totals = normalizeTotals(input?.totals);
  normalized.byRun = Object.fromEntries(
    Object.entries(input?.byRun ?? {}).map(([key, totals]) => [key, normalizeTotals(totals)]),
  );
  normalized.byStage = Object.fromEntries(
    Object.entries(input?.byStage ?? {}).map(([key, totals]) => [key, normalizeTotals(totals)]),
  );
  return normalized;
}

function cleanAttribution(input?: LlmUsageAttribution | null): LlmUsageAttribution | undefined {
  if (!input) return undefined;
  const cleaned: LlmUsageAttribution = {};
  if (input.draftId) cleaned.draftId = input.draftId;
  if (input.requestId) cleaned.requestId = input.requestId;
  if (input.revision) cleaned.revision = input.revision;
  if (input.projectId) cleaned.projectId = input.projectId;
  if (input.runId) cleaned.runId = input.runId;
  if (input.stage) cleaned.stage = input.stage;
  if (input.userId) cleaned.userId = input.userId;
  if (input.source) cleaned.source = input.source;
  if (input.promptVersion) cleaned.promptVersion = input.promptVersion;
  if (input.promptHash) cleaned.promptHash = input.promptHash;
  if (input.schemaName) cleaned.schemaName = input.schemaName;
  if (input.cacheKey) cleaned.cacheKey = input.cacheKey;
  if (input.sourceId) cleaned.sourceId = input.sourceId;
  if (input.assetId) cleaned.assetId = input.assetId;
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function mergeAttribution(input?: LlmUsageAttribution | null): LlmUsageAttribution | undefined {
  return cleanAttribution({ ...(usageContext.getStore() ?? {}), ...(input ?? {}) });
}

export function getCurrentLlmUsageContext() {
  return cleanAttribution(usageContext.getStore());
}

export async function withLlmUsageContext<T>(context: LlmUsageAttribution, work: () => Promise<T>) {
  const parent = usageContext.getStore() ?? {};
  return usageContext.run({ ...parent, ...context }, work);
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
      totalTokens: registry.baselineHistorical?.totalTokens ?? fallback.baselineHistorical.totalTokens,
      notes: registry.baselineHistorical?.notes ?? fallback.baselineHistorical.notes,
      importedAt: registry.baselineHistorical?.importedAt ?? fallback.baselineHistorical.importedAt,
    },
    pricingVersion: registry.pricingVersion ?? fallback.pricingVersion,
    pricingSourceUrl: registry.pricingSourceUrl ?? fallback.pricingSourceUrl,
    fxRateUsdToCad: registry.fxRateUsdToCad ?? fallback.fxRateUsdToCad,
    fxPublishedDate: registry.fxPublishedDate ?? fallback.fxPublishedDate,
    fxSourceUrl: registry.fxSourceUrl ?? fallback.fxSourceUrl,
    cumulative: normalizeTotals(registry.cumulative),
    byDate: Object.fromEntries(
      Object.entries(registry.byDate ?? fallback.byDate).map(([key, totals]) => [key, normalizeTotals(totals)]),
    ),
    byProject: Object.fromEntries(
      Object.entries(registry.byProject ?? {}).map(([key, totals]) => [key, normalizeProjectTotals(totals)]),
    ),
    recentCalls: (registry.recentCalls ?? fallback.recentCalls).map((call) => ({
      ...call,
      cachedInputTokens: call.cachedInputTokens ?? 0,
      totalTokens: call.totalTokens ?? call.inputTokens + call.outputTokens,
      attribution: cleanAttribution(call.attribution),
    })),
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
    byDate: { [startedDate]: emptyTotals() },
    byProject: {},
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
  const name = model.trim().toLowerCase();
  const key = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length).find((candidate) => name === candidate || name.startsWith(`${candidate}-20`));
  return MODEL_PRICING[key ?? "gpt-5.4"];
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

function ensureProjectTotals(registry: LlmUsageRegistry, projectId: string) {
  registry.byProject[projectId] = normalizeProjectTotals(registry.byProject[projectId]);
  return registry.byProject[projectId];
}

export function sumLlmUsageCalls(calls: LlmUsageCallRecord[]): LlmUsageTotals {
  return calls.reduce((totals, call) => {
    addTotals(totals, {
      calls: 1,
      inputTokens: call.inputTokens,
      cachedInputTokens: call.cachedInputTokens,
      outputTokens: call.outputTokens,
      totalTokens: call.totalTokens,
      costUsd: call.costUsd,
      costCad: call.costCad,
    });
    return totals;
  }, emptyTotals());
}

export function filterLlmUsageCalls(input: {
  calls: LlmUsageCallRecord[];
  projectId?: string | null;
  runId?: string | null;
  stage?: string | null;
  since?: string | null;
  until?: string | null;
}) {
  return input.calls.filter((call) => {
    if (input.projectId && call.attribution?.projectId !== input.projectId) return false;
    if (input.runId && call.attribution?.runId !== input.runId) return false;
    if (input.stage && call.attribution?.stage !== input.stage) return false;
    if (input.since && call.recordedAt < input.since) return false;
    if (input.until && call.recordedAt > input.until) return false;
    return true;
  });
}

export async function recordLlmUsage(input: {
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  attribution?: LlmUsageAttribution | null;
}) {
  const registry = await readLlmUsageRegistry();
  const date = getTodayToronto();
  const pricing = resolvePricing(input.model);
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  const nonCachedInputTokens = Math.max(0, input.inputTokens - cachedInputTokens);
  const rc4Reasoning = /^(gpt-6-astra|gpt-5\.6-sol)(-20|$)/.test(input.model);
  const longContext = (/^gpt-5\.4(-20|$)/.test(input.model) || rc4Reasoning) && input.inputTokens > 272000;
  // Conservative estimate for new-model cache writes, not an invoice amount.
  const costUsd =
    ((nonCachedInputTokens / 1_000_000) * pricing.inputUsdPer1M * (rc4Reasoning ? 1.25 : 1) +
    (cachedInputTokens / 1_000_000) * pricing.cachedInputUsdPer1M) * (longContext ? 2 : 1) +
    (input.outputTokens / 1_000_000) * pricing.outputUsdPer1M * (longContext ? 1.5 : 1);
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
  const attribution = mergeAttribution(input.attribution);

  if (!registry.byDate[date]) registry.byDate[date] = emptyTotals();

  addTotals(registry.cumulative, delta);
  addTotals(registry.byDate[date], delta);

  if (attribution?.projectId) {
    const projectTotals = ensureProjectTotals(registry, attribution.projectId);
    addTotals(projectTotals.totals, delta);
    if (attribution.runId) {
      projectTotals.byRun[attribution.runId] = normalizeTotals(projectTotals.byRun[attribution.runId]);
      addTotals(projectTotals.byRun[attribution.runId], delta);
    }
    if (attribution.stage) {
      projectTotals.byStage[attribution.stage] = normalizeTotals(projectTotals.byStage[attribution.stage]);
      addTotals(projectTotals.byStage[attribution.stage], delta);
    }
  }

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
    attribution,
  };

  registry.recentCalls.unshift(callRecord);
  registry.recentCalls = registry.recentCalls.slice(0, MAX_RECENT_CALLS);

  await writeLlmUsageRegistry(registry);
  return { registry, callRecord };
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
