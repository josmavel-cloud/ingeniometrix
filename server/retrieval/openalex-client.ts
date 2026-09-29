import { setTimeout as delay } from "node:timers/promises";

const OPENALEX_BASE_URL = "https://api.openalex.org";
const COMPLEX_QUERY_MIN_INTERVAL_MS = 1_100;
let lastComplexQueryAt = 0;

export type OpenAlexSearchOptions = {
  perPage?: number;
  page?: number;
  filters?: string[];
  sort?: string;
  select?: string[];
  retryRateLimit?: boolean;
};

export type OpenAlexFailureCode =
  | "OPENALEX_AUTH_ERROR"
  | "OPENALEX_DAILY_BUDGET_EXHAUSTED"
  | "OPENALEX_RATE_LIMIT_BURST"
  | "OPENALEX_TIMEOUT"
  | "OPENALEX_PROVIDER_ERROR";

export type OpenAlexRateLimit = { limit: number | null; remaining: number | null; resetSeconds: number | null };

export class OpenAlexRequestError extends Error {
  constructor(readonly code: OpenAlexFailureCode, readonly httpStatus: number | null,
    readonly rateLimit: OpenAlexRateLimit) {
    super(code);
    this.name = "OpenAlexRequestError";
  }
}

const positiveNumber = (value: string | null) => {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export function openAlexRateLimitFromHeaders(headers: Headers): OpenAlexRateLimit {
  return {
    limit: positiveNumber(headers.get("x-ratelimit-limit")),
    remaining: positiveNumber(headers.get("x-ratelimit-remaining")),
    resetSeconds: positiveNumber(headers.get("retry-after") ?? headers.get("x-ratelimit-reset")),
  };
}

export function classifyOpenAlexFailure(status: number, headers: Headers): OpenAlexRequestError {
  const rateLimit = openAlexRateLimitFromHeaders(headers);
  const code: OpenAlexFailureCode = status === 401 || status === 403 ? "OPENALEX_AUTH_ERROR"
    : status === 429 && rateLimit.remaining === 0 && (rateLimit.resetSeconds ?? 0) >= 3600 ? "OPENALEX_DAILY_BUDGET_EXHAUSTED"
    : status === 429 ? "OPENALEX_RATE_LIMIT_BURST" : "OPENALEX_PROVIDER_ERROR";
  return new OpenAlexRequestError(code, status, rateLimit);
}

export function openAlexCapability() {
  return process.env.OPENALEX_API_KEY?.trim() ? "CONFIGURED" as const : "MISSING" as const;
}

export type OpenAlexWork = {
  id: string;
  doi: string | null;
  display_name: string | null;
  language?: string | null;
  publication_year: number | null;
  type: string | null;
  cited_by_count: number | null;
  relevance_score?: number | null;
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
    source?: {
      display_name?: string | null;
    } | null;
  } | null;
  best_oa_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
  } | null;
  open_access?: {
    is_oa?: boolean | null;
    oa_url?: string | null;
  } | null;
  primary_topic?: unknown;
  topics?: unknown[];
  keywords?: unknown[];
  concepts?: unknown[];
  referenced_works?: string[];
  referenced_works_count?: number | null;
  related_works?: string[];
  locations?: unknown[];
  locations_count?: number | null;
  has_fulltext?: boolean | null;
  fulltext_origin?: string | null;
  is_retracted?: boolean | null;
  is_paratext?: boolean | null;
};

type OpenAlexResponse = {
  results: OpenAlexWork[];
};

const DEFAULT_SELECT_FIELDS = [
  "id",
  "doi",
  "display_name",
  "language",
  "publication_year",
  "type",
  "cited_by_count",
  "relevance_score",
  "authorships",
  "abstract_inverted_index",
  "primary_location",
  "best_oa_location",
  "open_access",
  "primary_topic",
  "topics",
  "keywords",
  "concepts",
  "referenced_works",
  "referenced_works_count",
  "related_works",
  "locations",
  "locations_count",
  "has_fulltext",
  "fulltext_origin",
  "is_retracted",
  "is_paratext",
];

const DEFAULT_FILTERS = [
  "is_retracted:false",
  "is_paratext:false",
  "has_abstract:true",
  "type:article|review|book-chapter",
];

export const OPENALEX_QUALITY_FILTERS = [
  ...DEFAULT_FILTERS,
  "has_doi:true",
  "cited_by_count:>5",
];

export function buildOpenAlexAbstract(invertedIndex?: Record<string, number[]>) {
  if (!invertedIndex) {
    return null;
  }

  const orderedEntries = Object.entries(invertedIndex).flatMap(([word, positions]) =>
    positions.map((position) => ({ position, word })),
  );

  return orderedEntries
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.word)
    .join(" ");
}

function buildOpenAlexHeaders() {
  return { Accept: "application/json" };
}

function appendOpenAlexAuth(url: URL) {
  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }
  const mailto = process.env.OPENALEX_MAILTO?.trim() || process.env.CROSSREF_MAILTO?.trim();
  if (mailto) {
    url.searchParams.set("mailto", mailto);
  }
}

function buildOpenAlexUrl(query: string, options?: OpenAlexSearchOptions) {
  const url = new URL("/works", OPENALEX_BASE_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(options?.perPage ?? 35));
  if (options?.page && options.page > 1) url.searchParams.set("page", String(options.page));
  url.searchParams.set("filter", (options?.filters ?? DEFAULT_FILTERS).join(","));
  url.searchParams.set("sort", options?.sort ?? "relevance_score:desc,cited_by_count:desc");
  url.searchParams.set("select", (options?.select ?? DEFAULT_SELECT_FIELDS).join(","));

  appendOpenAlexAuth(url);

  return url;
}

function isComplexBooleanQuery(query: string) {
  return (query.match(/\b(?:AND|OR|NOT)\b/g) ?? []).length > 5;
}

async function respectOpenAlexComplexQueryLimit(query: string) {
  if (process.env.OPENALEX_API_KEY?.trim() || !isComplexBooleanQuery(query)) return;
  const remainingMs = COMPLEX_QUERY_MIN_INTERVAL_MS - (Date.now() - lastComplexQueryAt);
  if (remainingMs > 0) await delay(remainingMs);
  lastComplexQueryAt = Date.now();
}

export async function fetchOpenAlexWork(openAlexIdOrUrl: string) {
  const id = openAlexIdOrUrl.replace(/^https?:\/\/openalex\.org\//, "");
  const url = new URL(`/works/${encodeURIComponent(id)}`, OPENALEX_BASE_URL);
  appendOpenAlexAuth(url);
  const response = await fetch(url, {
    headers: buildOpenAlexHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as OpenAlexWork;
}

export async function fetchOpenAlexWorksCiting(openAlexIdOrUrl: string, options?: { perPage?: number }) {
  const normalizedId = openAlexIdOrUrl.startsWith("http")
    ? openAlexIdOrUrl
    : `https://openalex.org/${openAlexIdOrUrl}`;
  const url = new URL("/works", OPENALEX_BASE_URL);
  url.searchParams.set("filter", `cites:${normalizedId},is_retracted:false,is_paratext:false`);
  url.searchParams.set("per-page", String(options?.perPage ?? 8));
  url.searchParams.set("sort", "cited_by_count:desc,publication_year:desc");
  url.searchParams.set("select", DEFAULT_SELECT_FIELDS.join(","));
  appendOpenAlexAuth(url);
  const response = await fetch(url, {
    headers: buildOpenAlexHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as OpenAlexResponse;
  return payload.results;
}

export async function searchOpenAlexWorks(query: string, options?: OpenAlexSearchOptions) {
  const url = buildOpenAlexUrl(query, options);
  await respectOpenAlexComplexQueryLimit(query);
  let response: Response | undefined;
  for (let attempt = 0; attempt <= (options?.retryRateLimit === false ? 0 : 2); attempt++) {
    try {
      response = await fetch(url, { headers: buildOpenAlexHeaders(), cache: "no-store", signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw new OpenAlexRequestError(error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "OPENALEX_TIMEOUT" : "OPENALEX_PROVIDER_ERROR", null, { limit: null, remaining: null, resetSeconds: null });
    }
    if (response.ok) break;
    const failure = classifyOpenAlexFailure(response.status, response.headers);
    if (failure.code !== "OPENALEX_RATE_LIMIT_BURST" || attempt >= 2 || options?.retryRateLimit === false ||
        (failure.rateLimit.resetSeconds ?? 0) > 10) throw failure;
    await delay(Math.max(COMPLEX_QUERY_MIN_INTERVAL_MS * 2 ** attempt, (failure.rateLimit.resetSeconds ?? 0) * 1_000));
  }
  if (!response?.ok) throw new OpenAlexRequestError("OPENALEX_PROVIDER_ERROR", null, { limit: null, remaining: null, resetSeconds: null });

  const payload = (await response.json()) as OpenAlexResponse;

  return payload.results.map((work) => ({
    openAlexId: work.id,
    doi: work.doi?.replace("https://doi.org/", "") ?? null,
    title: work.display_name?.trim() || null,
    normalizedTitle: work.display_name?.trim() || null,
    language: work.language?.trim() || null,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name?.trim())
      .filter((author): author is string => Boolean(author)),
    abstract: buildOpenAlexAbstract(work.abstract_inverted_index),
    venue: work.primary_location?.source?.display_name ?? null,
    year: work.publication_year,
    workType: work.type,
    landingPageUrl:
      work.best_oa_location?.landing_page_url ??
      work.open_access?.oa_url ??
      work.primary_location?.landing_page_url ??
      null,
    citationCount: work.cited_by_count ?? 0,
    rawOpenAlexJson: work,
  }));
}

// Backend-only capability probe. Never returns or logs the credential or URL.
export async function getOpenAlexRateLimitStatus(): Promise<OpenAlexRateLimit> {
  if (openAlexCapability() === "MISSING") throw new Error("OPENALEX_API_KEY_MISSING");
  const url = new URL("/rate-limit", OPENALEX_BASE_URL);
  appendOpenAlexAuth(url);
  let response: Response;
  try {
    response = await fetch(url, { headers: buildOpenAlexHeaders(), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new OpenAlexRequestError(error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "OPENALEX_TIMEOUT" : "OPENALEX_PROVIDER_ERROR", null, { limit: null, remaining: null, resetSeconds: null });
  }
  if (!response.ok) throw classifyOpenAlexFailure(response.status, response.headers);
  const body = await response.json() as Record<string, unknown>;
  const nested = body.rate_limit && typeof body.rate_limit === "object" && !Array.isArray(body.rate_limit)
    ? body.rate_limit as Record<string, unknown> : {};
  const numeric = (value: unknown) => {
    const parsed = typeof value === "number" || typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)
      ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const reset = body.reset_seconds ?? body.reset_in_seconds ?? body.reset ?? body.daily_reset ?? nested.reset;
  const resetSeconds = numeric(reset) ?? (typeof reset === "string" && Number.isFinite(Date.parse(reset))
    ? Math.max(0, Math.ceil((Date.parse(reset) - Date.now()) / 1000)) : null);
  const headers = openAlexRateLimitFromHeaders(response.headers);
  return {
    limit: numeric(body.daily_limit ?? body.limit ?? body.rate_limit ?? nested.limit) ?? headers.limit,
    remaining: numeric(body.daily_remaining ?? body.rate_limit_remaining ?? body.remaining ?? nested.remaining) ?? headers.remaining,
    resetSeconds: resetSeconds ?? headers.resetSeconds,
  };
}
