const OPENALEX_BASE_URL = "https://api.openalex.org";

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

function buildAbstract(invertedIndex?: Record<string, number[]>) {
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

function buildOpenAlexUrl(query: string, options?: OpenAlexSearchOptions) {
  const url = new URL("/works", OPENALEX_BASE_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(options?.perPage ?? 35));
  url.searchParams.set("filter", (options?.filters ?? DEFAULT_FILTERS).join(","));
  url.searchParams.set("sort", options?.sort ?? "relevance_score:desc,cited_by_count:desc");
  url.searchParams.set("select", (options?.select ?? DEFAULT_SELECT_FIELDS).join(","));

  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  return url;
}

export async function searchOpenAlexWorks(query: string, options?: OpenAlexSearchOptions) {
  const response = await fetch(buildOpenAlexUrl(query, options), {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("OpenAlex no respondio correctamente.");
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
    abstract: buildAbstract(work.abstract_inverted_index),
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
