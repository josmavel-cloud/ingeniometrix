import fs from "node:fs/promises";
import path from "node:path";

import {
  buildArtifactTimestamp,
  ensureArtifactDir,
} from "./lib/artifact-paths.mjs";

const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");

const DEFAULT_INPUT = {
  topic: "Exploring student adoption of ChatGPT",
  problemContext: "higher education",
  program: "maestria",
  doi: "",
};

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function loadLocalEnv() {
  try {
    const envFile = await fs.readFile(envPath, "utf8");

    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function parseArgs(argv) {
  const parsed = { ...DEFAULT_INPUT };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    if (!(key in parsed)) {
      continue;
    }

    if (typeof next === "string" && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function buildDebugQuery(input) {
  return normalizeWhitespace([input.topic, input.problemContext].join(" "));
}

function buildOpenAlexUrl(query) {
  const url = new URL("/works", "https://api.openalex.org");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "5");

  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  if (apiKey) {
    url.searchParams.set("api_key", apiKey);
  }

  return url;
}

async function fetchOpenAlex(query) {
  const url = buildOpenAlexUrl(query);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const body = await response.text();
  let json = null;

  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`OpenAlex fallo con ${response.status}: ${body}`);
  }

  return {
    requestUrl: url.toString(),
    status: response.status,
    json,
  };
}

function buildCrossrefHeaders() {
  const headers = {
    Accept: "application/json",
  };

  const mailto = process.env.CROSSREF_MAILTO?.trim();
  if (mailto) {
    headers["User-Agent"] = `Ingeniometrix/0.1 (${mailto})`;
  }

  return headers;
}

async function fetchCrossref(doi) {
  const encodedDoi = encodeURIComponent(doi);
  const requestUrl = `https://api.crossref.org/works/${encodedDoi}`;

  const response = await fetch(requestUrl, {
    headers: buildCrossrefHeaders(),
    cache: "no-store",
  });

  const body = await response.text();
  let json = null;

  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`Crossref fallo con ${response.status}: ${body}`);
  }

  return {
    requestUrl,
    status: response.status,
    json,
  };
}

async function fetchCrossrefSearch(query) {
  const url = new URL("/works", "https://api.crossref.org");
  url.searchParams.set("query.bibliographic", query);
  url.searchParams.set("rows", "5");

  const response = await fetch(url, {
    headers: buildCrossrefHeaders(),
    cache: "no-store",
  });

  const body = await response.text();
  let json = null;

  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`Crossref fallo con ${response.status}: ${body}`);
  }

  return {
    requestUrl: url.toString(),
    status: response.status,
    json,
  };
}

function stripDoiUrl(value) {
  if (!value) {
    return null;
  }

  return value.replace(/^https?:\/\/doi\.org\//i, "").trim();
}

function summarizeOpenAlexResult(work) {
  return {
    id: work?.id ?? null,
    doi: stripDoiUrl(work?.doi ?? null),
    title: work?.display_name ?? null,
    year: work?.publication_year ?? null,
    type: work?.type ?? null,
    citedByCount: work?.cited_by_count ?? null,
    authors: (work?.authorships ?? [])
      .map((authorship) => authorship?.author?.display_name ?? null)
      .filter(Boolean),
    source: work?.primary_location?.source?.display_name ?? null,
    landingPageUrl: work?.primary_location?.landing_page_url ?? null,
  };
}

function summarizeCrossrefMessage(message) {
  return {
    DOI: message?.DOI ?? null,
    title: message?.title?.[0] ?? null,
    publisher: message?.publisher ?? null,
    type: message?.type ?? null,
    issued: message?.issued?.["date-parts"]?.[0] ?? null,
    authorCount: Array.isArray(message?.author) ? message.author.length : 0,
    URL: message?.URL ?? null,
  };
}

function printSection(title, payload) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

async function writeArtifact(payload) {
  const artifactsDir = await ensureArtifactDir("debug", "providers");
  const timestamp = buildArtifactTimestamp();
  const targetPath = path.join(artifactsDir, `providers-debug-${timestamp}.json`);
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2));
  return targetPath;
}

async function main() {
  await loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const query = buildDebugQuery(args);

  const openAlex = await fetchOpenAlex(query);
  const openAlexResults = Array.isArray(openAlex.json?.results) ? openAlex.json.results : [];
  const crossrefSearch = await fetchCrossrefSearch(query);
  const crossrefItems = Array.isArray(crossrefSearch.json?.message?.items)
    ? crossrefSearch.json.message.items
    : [];

  const firstOpenAlexWithDoi = openAlexResults.find((work) => stripDoiUrl(work?.doi));
  const firstCrossrefWithDoi = crossrefItems.find((item) => stripDoiUrl(item?.DOI));
  const resolvedDoi =
    stripDoiUrl(args.doi) ??
    stripDoiUrl(firstOpenAlexWithDoi?.doi) ??
    stripDoiUrl(firstCrossrefWithDoi?.DOI);

  let crossrefDetail = null;
  if (resolvedDoi) {
    crossrefDetail = await fetchCrossref(resolvedDoi);
  }

  const artifactPayload = {
    generatedAt: new Date().toISOString(),
    input: {
      ...args,
      query,
      doi: resolvedDoi,
    },
    openAlex: {
      requestUrl: openAlex.requestUrl,
      status: openAlex.status,
      resultCount: openAlexResults.length,
      topResults: openAlexResults.slice(0, 3).map(summarizeOpenAlexResult),
      raw: openAlex.json,
    },
    crossrefSearch: {
      requestUrl: crossrefSearch.requestUrl,
      status: crossrefSearch.status,
      resultCount: crossrefItems.length,
      topResults: crossrefItems.slice(0, 3).map(summarizeCrossrefMessage),
      raw: crossrefSearch.json,
    },
    crossrefDetail: crossrefDetail
      ? {
          requestUrl: crossrefDetail.requestUrl,
          status: crossrefDetail.status,
          summary: summarizeCrossrefMessage(crossrefDetail.json?.message),
          raw: crossrefDetail.json,
        }
      : {
          skipped: true,
          reason: "No se encontro DOI para consultar Crossref.",
        },
  };

  const artifactPath = await writeArtifact(artifactPayload);

  printSection("Debug Input", artifactPayload.input);
  printSection("OpenAlex Summary", {
    requestUrl: artifactPayload.openAlex.requestUrl,
    status: artifactPayload.openAlex.status,
    resultCount: artifactPayload.openAlex.resultCount,
    topResults: artifactPayload.openAlex.topResults,
  });
  printSection("Crossref Search Summary", {
    requestUrl: artifactPayload.crossrefSearch.requestUrl,
    status: artifactPayload.crossrefSearch.status,
    resultCount: artifactPayload.crossrefSearch.resultCount,
    topResults: artifactPayload.crossrefSearch.topResults,
  });
  printSection(
    "Crossref Detail Summary",
    artifactPayload.crossrefDetail.skipped
      ? artifactPayload.crossrefDetail
      : {
          requestUrl: artifactPayload.crossrefDetail.requestUrl,
          status: artifactPayload.crossrefDetail.status,
          summary: artifactPayload.crossrefDetail.summary,
        },
  );

  console.log(`\nArtefacto guardado en: ${artifactPath}`);
}

main().catch((error) => {
  console.error("\nFallo el debug de proveedores.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
