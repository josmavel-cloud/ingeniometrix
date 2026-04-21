const CROSSREF_BASE_URL = "https://api.crossref.org";

export type CrossrefMessage = {
  DOI?: string;
  title?: string[];
  abstract?: string;
  "is-referenced-by-count"?: number;
  issued?: {
    "date-parts"?: number[][] | undefined;
  };
  publisher?: string;
  author?: Array<{
    given?: string;
    family?: string;
  }>;
  URL?: string;
  type?: string;
};

type CrossrefResponse = {
  message: CrossrefMessage;
};

type CrossrefSearchResponse = {
  message?: {
    items?: CrossrefMessage[];
  };
};

function buildCrossrefHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const mailto = process.env.CROSSREF_MAILTO?.trim();
  if (mailto) {
    headers["User-Agent"] = `Ingeniometrix/0.1 (${mailto})`;
  }

  return headers;
}

export async function fetchCrossrefWorkByDoi(doi: string) {
  const encodedDoi = encodeURIComponent(doi);
  const response = await fetch(`${CROSSREF_BASE_URL}/works/${encodedDoi}`, {
    headers: buildCrossrefHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as CrossrefResponse;
  return payload.message;
}

function buildCrossrefSearchUrl(query: string) {
  const url = new URL("/works", CROSSREF_BASE_URL);
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", "25");

  return url;
}

function stripAbstractTags(value: string | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

export async function searchCrossrefWorks(query: string) {
  const response = await fetch(buildCrossrefSearchUrl(query), {
    headers: buildCrossrefHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Crossref no respondio correctamente.");
  }

  const payload = (await response.json()) as CrossrefSearchResponse;
  const items = payload.message?.items ?? [];

  return items.map((item) => ({
    openAlexId: null,
    doi: item.DOI ?? null,
    title: resolveCrossrefTitle(item),
    authors: (item.author ?? [])
      .map((author) => [author.given, author.family].filter(Boolean).join(" ").trim())
      .filter((author) => author.length > 0),
    abstract: stripAbstractTags(item.abstract),
    venue: item.publisher ?? null,
    year: item.issued?.["date-parts"]?.[0]?.[0] ?? null,
    workType: item.type ?? null,
    landingPageUrl: item.URL ?? null,
    citationCount: item["is-referenced-by-count"] ?? 0,
    rawOpenAlexJson: null,
    rawCrossrefJson: item,
  }));
}

export function resolveCrossrefTitle(message: CrossrefMessage | null) {
  if (!message?.title?.length) {
    return null;
  }

  const firstNonEmptyTitle = message.title.find(
    (title) => typeof title === "string" && title.trim().length > 0,
  );

  return firstNonEmptyTitle?.trim() || null;
}
