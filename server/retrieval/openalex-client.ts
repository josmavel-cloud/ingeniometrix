const OPENALEX_BASE_URL = "https://api.openalex.org";

export type OpenAlexWork = {
  id: string;
  doi: string | null;
  display_name: string | null;
  publication_year: number | null;
  type: string | null;
  cited_by_count: number | null;
  authorships?: Array<{
    author?: {
      display_name?: string;
    };
  }>;
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    landing_page_url?: string | null;
    source?: {
      display_name?: string | null;
    } | null;
  } | null;
};

type OpenAlexResponse = {
  results: OpenAlexWork[];
};

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

function buildOpenAlexUrl(query: string) {
  const url = new URL("/works", OPENALEX_BASE_URL);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "25");

  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  return url;
}

export async function searchOpenAlexWorks(query: string) {
  const response = await fetch(buildOpenAlexUrl(query), {
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
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name?.trim())
      .filter((author): author is string => Boolean(author)),
    abstract: buildAbstract(work.abstract_inverted_index),
    venue: work.primary_location?.source?.display_name ?? null,
    year: work.publication_year,
    workType: work.type,
    landingPageUrl: work.primary_location?.landing_page_url ?? null,
    citationCount: work.cited_by_count ?? 0,
    rawOpenAlexJson: work,
  }));
}
