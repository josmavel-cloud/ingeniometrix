import { setTimeout as delay } from "node:timers/promises";

const OPENALEX_BASE_URL = "https://api.openalex.org";
const COMPLEX_QUERY_MIN_INTERVAL_MS = 1_100;
let lastComplexQueryAt = 0;

export type OpenAlexSearchOptions = {
  perPage?: number;
  filters?: string[];
  sort?: string;
  select?: string[];
};

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
  let response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status === 429) {
    const retryAfterSeconds = Number.parseFloat(response.headers.get("retry-after") ?? "");
    if (retryAfterSeconds > 10) throw new Error(`OpenAlex HTTP 429: Retry-After ${retryAfterSeconds}s excede la espera interactiva; usar otro proveedor soportado o reintentar despues.`);
    await delay(Number.isFinite(retryAfterSeconds)
      ? Math.max(COMPLEX_QUERY_MIN_INTERVAL_MS, retryAfterSeconds * 1_000)
      : COMPLEX_QUERY_MIN_INTERVAL_MS);
    lastComplexQueryAt = Date.now();
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    });
  }

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 320);
    throw new Error(
      `OpenAlex no respondio correctamente (HTTP ${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

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
