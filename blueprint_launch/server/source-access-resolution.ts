import { getConfiguredLlmProvider } from "@/llm";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";
import { buildBrowserLikeFetchHeaders } from "@/server/retrieval/reference-access";

import type {
  BlueprintLaunchLlmPromptRecord,
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessCandidateSummary,
  BlueprintLaunchSourceAccessAttempt,
  BlueprintLaunchSourceAccessKind,
  BlueprintLaunchSourceAccessResolutionItem,
  BlueprintLaunchSourceAccessResolutionResult,
  BlueprintLaunchSourceAccessStatus,
} from "./local-playground-store";
import type { BlueprintLaunchProjectGlobalContext } from "./step1-intake-context";
import {
  type BlueprintLaunchAccessCandidate,
  deriveAccessCandidatesFromContext,
  extractAccessCandidatesFromHtml,
  isLikelyDownloadWrapper,
  isLikelyRichMetadataPage,
} from "./source-access-patterns";

const FETCH_TIMEOUT_MS = 20_000;
const MAX_HTML_CHARS = 120_000;
const MAX_LLM_TEXT_CHARS = 4_500;
const MAX_CANDIDATE_LINKS = 8;
const MAX_CANDIDATE_FOLLOW_DEPTH = 2;
const DSPACE_MAX_BUNDLES = 8;
const DSPACE_MAX_BITSTREAMS_PER_BUNDLE = 12;
const FIGSHARE_MAX_FILES = 16;
const DSPACE_ITEM_UUID_REGEX =
  /\/items\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

type FetchInspection = {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  contentType: string | null;
  html: string | null;
  text: string | null;
  htmlLang: string | null;
  links: BlueprintLaunchAccessCandidate[];
  warnings: string[];
};

type AccessLlmAssessment = {
  content_status: BlueprintLaunchSourceAccessStatus;
  content_kind: BlueprintLaunchSourceAccessKind;
  language_detected: string | null;
  should_follow_candidate_url: string | null;
  rationale: string;
};

type ResolveSourceAccessOutcome = {
  item: BlueprintLaunchSourceAccessResolutionItem;
  llmPrompts: BlueprintLaunchLlmPromptRecord[];
};

const accessAssessmentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "content_status",
    "content_kind",
    "language_detected",
    "should_follow_candidate_url",
    "rationale",
  ],
  properties: {
    content_status: {
      type: "string",
      enum: ["complete_public", "partial_public", "metadata_only", "unresolved"],
    },
    content_kind: {
      type: "string",
      enum: [
        "pdf",
        "web_fulltext",
        "repository_fulltext",
        "html_article",
        "landing_only",
        "abstract_only",
        "unknown",
      ],
    },
    language_detected: {
      anyOf: [{ type: "string", minLength: 2, maxLength: 32 }, { type: "null" }],
    },
    should_follow_candidate_url: {
      anyOf: [{ type: "string", minLength: 8, maxLength: 500 }, { type: "null" }],
    },
    rationale: { type: "string", minLength: 8, maxLength: 320 },
  },
} satisfies Record<string, unknown>;

const ACCESS_ASSESSMENT_SCHEMA_NAME = "blueprint_launch_source_access_assessment";
const ACCESS_ASSESSMENT_TRACKING_LABEL = `structured:${ACCESS_ASSESSMENT_SCHEMA_NAME}`;
const ACCESS_ASSESSMENT_MODEL = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
    },
  };
}

function pushAttempt(
  attempts: BlueprintLaunchSourceAccessAttempt[],
  step: string,
  url: string | null,
  outcome: BlueprintLaunchSourceAccessAttempt["outcome"],
  detail: string,
) {
  attempts.push({ step, url, outcome, detail });
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return cleanText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"'),
  );
}

function truncate(value: string | null | undefined, maxLength: number) {
  const text = value?.trim() ?? "";

  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function detectLanguageHeuristic(input: {
  text: string | null;
  htmlLang: string | null;
  sourceLanguage: string | null;
}) {
  const fromSource = input.sourceLanguage?.trim().toLowerCase() ?? "";

  if (fromSource) {
    return fromSource;
  }

  const fromHtml = input.htmlLang?.trim().toLowerCase() ?? "";

  if (fromHtml) {
    return fromHtml.split("-")[0];
  }

  const text = input.text?.toLowerCase() ?? "";

  if (!text) {
    return null;
  }

  const spanishHits = [" el ", " la ", " de ", " y ", " para ", " estudio "].filter((token) =>
    text.includes(token),
  ).length;
  const englishHits = [" the ", " and ", " of ", " for ", " study ", " method "].filter((token) =>
    text.includes(token),
  ).length;
  const portugueseHits = [" de ", " para ", " estudo ", " metodo ", " e "].filter((token) =>
    text.includes(token),
  ).length;

  if (spanishHits > englishHits && spanishHits >= 2) {
    return "es";
  }

  if (englishHits > spanishHits && englishHits >= 2) {
    return "en";
  }

  if (portugueseHits >= 2) {
    return "pt";
  }

  return null;
}

function buildCandidateSummaryEntry(input: {
  url: string;
  label: string;
  score: number;
  origin: BlueprintLaunchSourceAccessCandidateSummary["origin"];
}) {
  return {
    url: input.url,
    label: input.label,
    score: input.score,
    origin: input.origin,
  } satisfies BlueprintLaunchSourceAccessCandidateSummary;
}

function pushCandidateSummary(
  candidates: Map<string, BlueprintLaunchSourceAccessCandidateSummary>,
  candidate: BlueprintLaunchSourceAccessCandidateSummary,
) {
  const existing = candidates.get(candidate.url);

  if (!existing || candidate.score > existing.score) {
    candidates.set(candidate.url, candidate);
  }
}

function isRepositoryUrl(url: string | null) {
  if (!url) {
    return false;
  }

  return /(repository|repositorio|handle\.net|dspace|tesi|thesis|dissertation)/i.test(url);
}

function preserveStablePdfCandidateUrl(input: {
  candidateUrl: string;
  finalUrl: string | null;
}) {
  try {
    const candidateHost = new URL(input.candidateUrl).hostname.toLowerCase();

    if (candidateHost === "ndownloader.figshare.com") {
      return input.candidateUrl;
    }
  } catch {
    return input.finalUrl ?? input.candidateUrl;
  }

  return input.finalUrl ?? input.candidateUrl;
}

function extractHtmlLang(html: string) {
  const match = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return match?.[1] ? cleanText(match[1]) : null;
}

function seemsLikeFullTextPage(text: string | null) {
  const content = text?.toLowerCase() ?? "";

  if (content.length < 2_500) {
    return false;
  }

  const sectionHits = [
    "abstract",
    "introduction",
    "method",
    "methodology",
    "results",
    "discussion",
    "conclusion",
    "references",
  ].filter((token) => content.includes(token)).length;

  return sectionHits >= 3;
}

function buildAssessmentPromptTemplate() {
  return `
Actua como analista de acceso abierto para literatura academica en {{knowledge_area}}. Debes interpretar una pagina ambigua y decidir si ofrece contenido completo util para investigacion.

Objetivo:
- decidir si la pagina inspeccionada expone contenido publico completo suficiente
- distinguir si el acceso es pdf, articulo web completo, repositorio, solo landing o solo metadata
- sugerir solo una candidate URL si parece la mejor ruta para llegar al contenido completo
- detectar el idioma principal del contenido visible

Reglas:
- responde en espanol
- no inventes acceso completo si no hay evidencia visible
- considera "complete_public" solo si hay PDF accesible, articulo completo visible o repositorio con texto completo
- considera "partial_public" si solo hay landing page, abstract o referencias parciales
- no dependas solo de la palabra "pdf"; enlaces como Thesis, Dissertation, Accepted Version, Full Text, View/Open File o bitstream pueden llevar al contenido completo
- si la pagina parece un repositorio con bloque de archivos, prioriza el enlace de archivo mas prometedor sobre la landing
- usa el contexto del proyecto solo para interpretar mejor la utilidad del acceso, no para inventar contenido

Contexto minimo del proyecto:
- area: {{knowledge_area}}
- tema canonico: {{canonical_topic_es}}
- alcance: {{target_scope_es}}

Fuente:
- source_id: {{source_id}}
- title: {{title}}
- doi: {{doi}}
- landing_page: {{landing_page}}
- requested_url: {{requested_url}}
- final_url: {{final_url}}
- status: {{status}}
- content_type: {{content_type}}
- html_lang: {{html_lang}}
- candidate_links: {{candidate_links_json}}
- visible_text_excerpt: {{visible_text_excerpt_json}}
`.trim();
}

function isLikelyJavascriptShell(html: string) {
  const compact = html.toLowerCase();

  return (
    compact.length < 2_500 &&
    (compact.includes("<ds-app") ||
      compact.includes("<app-root") ||
      compact.includes("<div id=\"root\"") ||
      compact.includes("<div id=\"app\""))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getEmbeddedArray(root: unknown, key: string) {
  const rootRecord = asRecord(root);
  const embedded = asRecord(rootRecord?._embedded);
  const values = embedded?.[key];

  return Array.isArray(values) ? values : [];
}

function getLinkHref(root: unknown, key: string) {
  const rootRecord = asRecord(root);
  const links = asRecord(rootRecord?._links);
  const link = asRecord(links?.[key]);

  return asString(link?.href);
}

function getMetadataValue(root: unknown, key: string) {
  const rootRecord = asRecord(root);
  const metadata = asRecord(rootRecord?.metadata);
  const values = metadata?.[key];

  if (!Array.isArray(values)) {
    return null;
  }

  for (const entry of values) {
    const value = asString(asRecord(entry)?.value);

    if (value) {
      return cleanText(value);
    }
  }

  return null;
}

function isLikelyOriginalResearchFile(input: {
  bundleName: string | null;
  filename: string;
  url: string;
}) {
  const bundleName = input.bundleName?.toLowerCase() ?? "";
  const haystack = `${input.filename} ${input.url}`.toLowerCase();

  if (bundleName.includes("license") || bundleName.includes("thumbnail")) {
    return false;
  }

  if (/\.(jpg|jpeg|png|gif|webp|txt|xml|json)($|\?)/i.test(haystack)) {
    return false;
  }

  return (
    bundleName.includes("original") ||
    /\.pdf($|\?)/i.test(haystack) ||
    /\b(thesis|tesis|dissertation|full[- ]?text|accepted version|manuscript)\b/i.test(haystack)
  );
}

function scoreDspaceBitstreamCandidate(input: {
  bundleName: string | null;
  filename: string;
  url: string;
}) {
  const bundleName = input.bundleName?.toLowerCase() ?? "";
  const haystack = `${input.filename} ${input.url}`.toLowerCase();
  let score = 34;

  if (bundleName.includes("original")) {
    score += 28;
  }
  if (/\.pdf($|\?)/i.test(haystack) || /\/content($|\?)/i.test(input.url)) {
    score += 18;
  }
  if (/\b(thesis|tesis|dissertation)\b/i.test(haystack)) {
    score += 10;
  }
  if (bundleName.includes("text")) {
    score -= 12;
  }

  return score;
}

function extractDspaceItemApiUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const apiMatch = parsed.pathname.match(
      /\/server\/api\/core\/items\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i,
    );

    if (apiMatch?.[1]) {
      return `${parsed.origin}/server/api/core/items/${apiMatch[1].toLowerCase()}`;
    }

    const itemMatch = parsed.pathname.match(DSPACE_ITEM_UUID_REGEX);

    if (itemMatch?.[1]) {
      return `${parsed.origin}/server/api/core/items/${itemMatch[1].toLowerCase()}`;
    }
  } catch {
    return null;
  }

  return null;
}

function extractDspaceItemApiUrlsFromContext(input: {
  currentUrl: string;
  finalUrl: string | null;
  html: string | null;
}) {
  const apiUrls = new Set<string>();
  const knownUrls = [input.currentUrl, input.finalUrl].filter((value): value is string =>
    Boolean(value),
  );

  for (const url of knownUrls) {
    const apiUrl = extractDspaceItemApiUrl(url);

    if (apiUrl) {
      apiUrls.add(apiUrl);
    }
  }

  const baseUrl = input.finalUrl ?? input.currentUrl;

  if (input.html) {
    try {
      const origin = new URL(baseUrl).origin;
      const matches = input.html.match(new RegExp(DSPACE_ITEM_UUID_REGEX.source, "gi")) ?? [];

      for (const match of matches) {
        const itemMatch = match.match(DSPACE_ITEM_UUID_REGEX);

        if (itemMatch?.[1]) {
          apiUrls.add(`${origin}/server/api/core/items/${itemMatch[1].toLowerCase()}`);
        }
      }
    } catch {
      return [...apiUrls];
    }
  }

  return [...apiUrls];
}

function extractHandleIdFromUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");

    if (/^hdl\.handle\.net$/i.test(parsed.hostname) && path.includes("/")) {
      return path.replace(/[?#].*$/, "");
    }

    const handleMatch = path.match(/^handle\/([^?#]+)/i);

    if (handleMatch?.[1]?.includes("/")) {
      return handleMatch[1].replace(/\/$/, "");
    }
  } catch {
    return null;
  }

  return null;
}

function extractHandleIdsFromContext(input: {
  currentUrl: string;
  finalUrl: string | null;
}) {
  const handles = new Set<string>();

  for (const url of [input.currentUrl, input.finalUrl]) {
    const handle = extractHandleIdFromUrl(url);

    if (handle) {
      handles.add(handle);
    }
  }

  return [...handles];
}

function encodeHandleForPath(handle: string) {
  return handle
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function resolveHandleTargetUrl(handle: string) {
  const handleJson = await fetchJsonWithTimeout(
    `https://hdl.handle.net/api/handles/${encodeHandleForPath(handle)}`,
  );
  const values = asRecord(handleJson)?.values;

  if (!Array.isArray(values)) {
    return null;
  }

  for (const value of values) {
    const valueRecord = asRecord(value);
    const type = asString(valueRecord?.type);
    const data = asRecord(valueRecord?.data);
    const targetUrl = asString(data?.value);

    if (type?.toUpperCase() === "URL" && targetUrl) {
      return targetUrl;
    }
  }

  return null;
}

function getDiscoverObjects(root: unknown) {
  const embedded = asRecord(asRecord(root)?._embedded);
  const searchResult = asRecord(embedded?.searchResult);
  const searchEmbedded = asRecord(searchResult?._embedded);
  const objects = searchEmbedded?.objects;

  return Array.isArray(objects) ? objects : [];
}

async function discoverDspaceItemApiUrlsByHandle(input: {
  origin: string;
  handle: string;
}) {
  const discovered = new Set<string>();
  const discoverJson = await fetchJsonWithTimeout(
    `${input.origin}/server/api/discover/search/objects?query=${encodeURIComponent(
      `"${input.handle}"`,
    )}`,
  );

  for (const object of getDiscoverObjects(discoverJson).slice(0, 6)) {
    const objectRecord = asRecord(object);
    const embeddedObject = asRecord(asRecord(objectRecord?._embedded)?.indexableObject);
    const embeddedHandle = asString(embeddedObject?.handle);

    if (embeddedHandle && embeddedHandle !== input.handle) {
      continue;
    }

    const href = getLinkHref(object, "indexableObject");
    const uuid = asString(embeddedObject?.uuid) ?? asString(embeddedObject?.id);

    if (href) {
      discovered.add(href);
    } else if (uuid) {
      discovered.add(`${input.origin}/server/api/core/items/${uuid}`);
    }
  }

  return [...discovered];
}

async function expandDspaceItemApiUrls(input: {
  currentUrl: string;
  finalUrl: string | null;
  html: string | null;
}) {
  const itemApiUrls = new Set(extractDspaceItemApiUrlsFromContext(input));
  const handles = extractHandleIdsFromContext(input);
  const knownUrls = [input.currentUrl, input.finalUrl].filter((value): value is string =>
    Boolean(value),
  );

  for (const handle of handles) {
    const handleTargetUrl = await resolveHandleTargetUrl(handle);

    if (handleTargetUrl) {
      const directItemApiUrl = extractDspaceItemApiUrl(handleTargetUrl);

      if (directItemApiUrl) {
        itemApiUrls.add(directItemApiUrl);
      }

      knownUrls.push(handleTargetUrl);
    }

    const origins = new Set<string>();

    for (const url of knownUrls) {
      try {
        const parsed = new URL(url);

        if (!/^hdl\.handle\.net$/i.test(parsed.hostname)) {
          origins.add(parsed.origin);
        }
      } catch {
        // Ignore malformed URLs collected from provider metadata.
      }
    }

    for (const origin of origins) {
      for (const itemApiUrl of await discoverDspaceItemApiUrlsByHandle({ origin, handle })) {
        itemApiUrls.add(itemApiUrl);
      }
    }
  }

  return [...itemApiUrls];
}

async function fetchJsonWithTimeout(url: string) {
  const signal = createTimeoutSignal(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({
        accept: "application/json,*/*;q=0.1",
        referer: url,
      }),
      signal: signal.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    signal.clear();
  }
}

function extractFigshareArticleIdsFromUrl(url: string | null) {
  const ids = new Set<string>();

  if (!url) {
    return ids;
  }

  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname);
    const apiMatch = pathname.match(/\/v2\/articles\/(\d+)(?:[/?#]|$)/i);
    const articleMatch = pathname.match(/\/articles\/[^/]+\/[^/]+\/(\d+)(?:[/?#]|$)/i);
    const doiMatch = pathname.match(/(?:figshare|wgtn)\.(\d{5,})(?:\.v\d+)?(?:[/?#]|$)/i);

    if (apiMatch?.[1]) {
      ids.add(apiMatch[1]);
    }

    if (articleMatch?.[1]) {
      ids.add(articleMatch[1]);
    }

    if (/^doi\.org$/i.test(parsed.hostname) && doiMatch?.[1]) {
      ids.add(doiMatch[1]);
    }
  } catch {
    return ids;
  }

  return ids;
}

function extractFigshareArticleIdsFromHtml(html: string | null) {
  const ids = new Set<string>();

  if (!html) {
    return ids;
  }

  const regexes = [
    /\/articles\/[^"'<>/]+\/[^"'<>/]+\/(\d{5,})(?:\/|\?|"|'|<|>|\s)/gi,
    /api\.figshare\.com\/v2\/articles\/(\d{5,})(?:\/|\?|"|'|<|>|\s)/gi,
    /"article_id"\s*:\s*(\d{5,})/gi,
    /"entity_id"\s*:\s*(\d{5,})/gi,
  ];

  for (const regex of regexes) {
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
      if (match[1]) {
        ids.add(match[1]);
      }
    }
  }

  return ids;
}

function extractFigshareArticleIdsFromContext(input: {
  currentUrl: string;
  finalUrl: string | null;
  html: string | null;
}) {
  const ids = new Set<string>();

  for (const url of [input.currentUrl, input.finalUrl]) {
    for (const id of extractFigshareArticleIdsFromUrl(url)) {
      ids.add(id);
    }
  }

  for (const id of extractFigshareArticleIdsFromHtml(input.html)) {
    ids.add(id);
  }

  return [...ids];
}

function isLikelyFigshareResearchFile(input: {
  filename: string;
  mimetype: string | null;
  url: string;
}) {
  const mimetype = input.mimetype?.toLowerCase() ?? "";
  const haystack = `${input.filename} ${input.url}`.toLowerCase();

  if (/\b(license|copyright|thumbnail|preview|readme)\b/i.test(haystack)) {
    return false;
  }

  return (
    mimetype.includes("pdf") ||
    /\.pdf($|\?)/i.test(haystack) ||
    /\b(thesis|tesis|dissertation|download|full[- ]?text|manuscript|accepted version)\b/i.test(haystack)
  );
}

function scoreFigshareFileCandidate(input: {
  filename: string;
  mimetype: string | null;
  size: number | null;
  url: string;
}) {
  const mimetype = input.mimetype?.toLowerCase() ?? "";
  const haystack = `${input.filename} ${input.url}`.toLowerCase();
  let score = 42;

  if (mimetype.includes("pdf")) {
    score += 24;
  }
  if (/\.pdf($|\?)/i.test(haystack)) {
    score += 18;
  }
  if (/\b(thesis|tesis|dissertation)\b/i.test(haystack)) {
    score += 12;
  }
  if (/\b(download|full[- ]?text|manuscript|accepted version)\b/i.test(haystack)) {
    score += 8;
  }
  if (input.size && input.size > 250_000) {
    score += 4;
  }

  return score;
}

async function deriveFigshareApiCandidates(input: {
  currentUrl: string;
  finalUrl: string | null;
  html: string | null;
}) {
  const candidates = new Map<string, BlueprintLaunchAccessCandidate>();
  const articleIds = extractFigshareArticleIdsFromContext(input);

  for (const articleId of articleIds) {
    const articleJson = await fetchJsonWithTimeout(
      `https://api.figshare.com/v2/articles/${articleId}`,
    );
    const files = asRecord(articleJson)?.files;

    if (!Array.isArray(files)) {
      continue;
    }

    for (const file of files.slice(0, FIGSHARE_MAX_FILES)) {
      const fileRecord = asRecord(file);
      const filename = asString(fileRecord?.name) ?? "figshare_file";
      const mimetype = asString(fileRecord?.mimetype);
      const downloadUrl = asString(fileRecord?.download_url);
      const sizeValue = fileRecord?.size;
      const size = typeof sizeValue === "number" ? sizeValue : null;

      if (!downloadUrl) {
        continue;
      }

      if (!isLikelyFigshareResearchFile({ filename, mimetype, url: downloadUrl })) {
        continue;
      }

      const score = scoreFigshareFileCandidate({
        filename,
        mimetype,
        size,
        url: downloadUrl,
      });
      const existing = candidates.get(downloadUrl);

      if (!existing || score > existing.score) {
        candidates.set(downloadUrl, {
          url: downloadUrl,
          label: `figshare_file:${filename}`,
          score,
          origin: "derived",
        });
      }
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

async function deriveDspaceRestCandidates(input: {
  currentUrl: string;
  finalUrl: string | null;
  html: string | null;
}) {
  const candidates = new Map<string, BlueprintLaunchAccessCandidate>();
  const itemApiUrls = await expandDspaceItemApiUrls(input);

  for (const itemApiUrl of itemApiUrls) {
    const bundlesJson = await fetchJsonWithTimeout(`${itemApiUrl}/bundles`);
    const bundles = getEmbeddedArray(bundlesJson, "bundles").slice(0, DSPACE_MAX_BUNDLES);

    for (const bundle of bundles) {
      const bundleName = asString(asRecord(bundle)?.name);
      const bitstreamsUrl = getLinkHref(bundle, "bitstreams");

      if (!bitstreamsUrl) {
        continue;
      }

      const bitstreamsJson = await fetchJsonWithTimeout(bitstreamsUrl);
      const bitstreams = getEmbeddedArray(bitstreamsJson, "bitstreams").slice(
        0,
        DSPACE_MAX_BITSTREAMS_PER_BUNDLE,
      );

      for (const bitstream of bitstreams) {
        const bitstreamRecord = asRecord(bitstream);
        const filename =
          asString(bitstreamRecord?.name) ??
          getMetadataValue(bitstream, "dc.title") ??
          "dspace_bitstream";
        const contentUrl =
          getLinkHref(bitstream, "content") ??
          (getLinkHref(bitstream, "self") ? `${getLinkHref(bitstream, "self")}/content` : null);

        if (!contentUrl) {
          continue;
        }

        if (!isLikelyOriginalResearchFile({ bundleName, filename, url: contentUrl })) {
          continue;
        }

        const score = scoreDspaceBitstreamCandidate({
          bundleName,
          filename,
          url: contentUrl,
        });
        const existing = candidates.get(contentUrl);

        if (!existing || score > existing.score) {
          candidates.set(contentUrl, {
            url: contentUrl,
            label: `dspace_bundle_${bundleName ?? "unknown"}:${filename}`,
            score,
            origin: "derived",
          });
        }
      }
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

function resolveConfiguredAccessLlmStatus() {
  const providerName = process.env.LLM_PROVIDER?.trim().toLowerCase() ?? "openai";

  if (providerName !== "openai") {
    return {
      ok: false,
      reason: `Evaluacion LLM omitida: proveedor no soportado en Release 0 (${providerName}).`,
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      reason:
        "Evaluacion LLM omitida porque el proveedor local no tiene credenciales cargadas; se continuo con reglas deterministicas.",
    };
  }

  return { ok: true, reason: null };
}

function renderPromptTemplate(
  template: string,
  replacements: Record<string, string>,
) {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

async function inspectUrl(url: string): Promise<FetchInspection> {
  const signal = createTimeoutSignal(FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: buildBrowserLikeFetchHeaders({
        accept: "text/html,application/pdf;q=0.9,*/*;q=0.1",
        referer: url,
      }),
      signal: signal.signal,
    });
    let finalUrl = response.url || url;
    const contentType = response.headers.get("content-type");
    const warnings: string[] = [];

    if (!response.ok) {
      warnings.push(`La URL respondio con estado ${response.status}.`);
    }

    if (contentType?.toLowerCase().includes("pdf")) {
      return {
        requestedUrl: url,
        finalUrl,
        status: response.status,
        contentType,
        html: null,
        text: null,
        htmlLang: null,
        links: [],
        warnings,
      };
    }

    let html = truncate(await response.text(), MAX_HTML_CHARS) ?? "";

    if (isLikelyJavascriptShell(html)) {
      const fallbackSignal = createTimeoutSignal(FETCH_TIMEOUT_MS);

      try {
        const fallbackResponse = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: {
            Accept: "text/html,application/pdf;q=0.9,*/*;q=0.1",
          },
          signal: fallbackSignal.signal,
        });
        const fallbackHtml = truncate(await fallbackResponse.text(), MAX_HTML_CHARS) ?? "";

        if (!isLikelyJavascriptShell(fallbackHtml) && fallbackHtml.length > html.length) {
          html = fallbackHtml;
          finalUrl = fallbackResponse.url || finalUrl;
        }
      } catch {
        warnings.push(
          "No se pudo completar el fallback HTML de una pagina JavaScript; se continuo con la shell inicial.",
        );
      } finally {
        fallbackSignal.clear();
      }
    }

    const text = truncate(stripHtml(html), MAX_HTML_CHARS);
    const htmlLang = extractHtmlLang(html);

    return {
      requestedUrl: url,
      finalUrl,
      status: response.status,
      contentType,
      html,
      text,
      htmlLang,
      links: extractAccessCandidatesFromHtml(html, finalUrl).slice(0, MAX_CANDIDATE_LINKS),
      warnings,
    };
  } finally {
    signal.clear();
  }
}

function buildAssessmentPrompt(input: {
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  sourceId: string;
  title: string;
  doi: string | null;
  landingPageUrl: string | null;
  inspection: FetchInspection;
}) {
  return renderPromptTemplate(buildAssessmentPromptTemplate(), {
    knowledge_area:
      input.projectGlobalContext?.project.knowledgeAreaLabel ?? "disciplina no especificada",
    canonical_topic_es: input.projectGlobalContext?.canonicalTopicEs ?? "null",
    target_scope_es: input.projectGlobalContext?.targetScopeEs ?? "null",
    source_id: input.sourceId,
    title: input.title,
    doi: input.doi ?? "null",
    landing_page: input.landingPageUrl ?? "null",
    requested_url: input.inspection.requestedUrl,
    final_url: input.inspection.finalUrl ?? "null",
    status: String(input.inspection.status ?? "null"),
    content_type: input.inspection.contentType ?? "null",
    html_lang: input.inspection.htmlLang ?? "null",
    candidate_links_json: JSON.stringify(input.inspection.links, null, 2),
    visible_text_excerpt_json: JSON.stringify(truncate(input.inspection.text, MAX_LLM_TEXT_CHARS)),
  });
}

async function assessAccessWithLlm(input: {
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
  sourceId: string;
  title: string;
  doi: string | null;
  landingPageUrl: string | null;
  inspection: FetchInspection;
}) {
  const provider = getConfiguredLlmProvider();

  return generateStructuredObjectWithTextFallback<AccessLlmAssessment>({
    provider,
    prompt: buildAssessmentPrompt(input),
    schemaName: ACCESS_ASSESSMENT_SCHEMA_NAME,
    schema: accessAssessmentSchema,
    model: ACCESS_ASSESSMENT_MODEL,
  });
}

function buildResolvedItem(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  attempts: BlueprintLaunchSourceAccessAttempt[];
  warnings: string[];
  candidateSummary: BlueprintLaunchSourceAccessCandidateSummary[];
  status: BlueprintLaunchSourceAccessStatus;
  kind: BlueprintLaunchSourceAccessKind;
  resolvedContentUrl: string | null;
  finalUrl: string | null;
  resolvedVia: string;
  languageDetected: string | null;
  confidence: number;
}) {
  return {
    sourceId: input.source.reference.id,
    title: input.source.reference.title,
    status: input.status,
    kind: input.kind,
    resolvedContentUrl: input.resolvedContentUrl,
    finalUrl: input.finalUrl,
    resolvedVia: input.resolvedVia,
    languageDetected: input.languageDetected,
    confidence: input.confidence,
    hasCompletePublicContent: input.status === "complete_public",
    candidateSummary: input.candidateSummary,
    attempts: input.attempts,
    warnings: input.warnings,
  } satisfies BlueprintLaunchSourceAccessResolutionItem;
}

async function tryResolveCandidateUrl(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  url: string;
  attempts: BlueprintLaunchSourceAccessAttempt[];
  warnings: string[];
  candidateSummary: Map<string, BlueprintLaunchSourceAccessCandidateSummary>;
  visited: Set<string>;
  depth: number;
  resolvedVia: string;
}): Promise<BlueprintLaunchSourceAccessResolutionItem | null> {
  if (input.depth > MAX_CANDIDATE_FOLLOW_DEPTH || input.visited.has(input.url)) {
    return null;
  }

  input.visited.add(input.url);
  pushAttempt(
    input.attempts,
    input.depth === 0 ? "inspect_candidate" : "inspect_candidate_nested",
    input.url,
    "ok",
    "Se intento resolver un candidato de acceso completo.",
  );

  try {
    const inspection = await inspectUrl(input.url);
    input.warnings.push(...inspection.warnings);
    const languageDetected = detectLanguageHeuristic({
      text: inspection.text ?? input.source.reference.abstract,
      htmlLang: inspection.htmlLang,
      sourceLanguage: input.source.reference.sourceLanguage,
    });

    if (inspection.contentType?.toLowerCase().includes("pdf")) {
      const stablePdfUrl = preserveStablePdfCandidateUrl({
        candidateUrl: input.url,
        finalUrl: inspection.finalUrl,
      });
      pushAttempt(
        input.attempts,
        "candidate_resolved_pdf",
        stablePdfUrl,
        "ok",
        "El candidato resolvio a un PDF publico.",
      );

      return buildResolvedItem({
        source: input.source,
        attempts: input.attempts,
        warnings: input.warnings,
        candidateSummary: [...input.candidateSummary.values()].sort((left, right) => right.score - left.score),
        status: "complete_public",
        kind: "pdf",
        resolvedContentUrl: stablePdfUrl,
        finalUrl: stablePdfUrl,
        resolvedVia: input.resolvedVia,
        languageDetected,
        confidence: Math.max(0.78, 0.93 - input.depth * 0.05),
      });
    }

    const deterministicCandidates = deriveAccessCandidatesFromContext({
      currentUrl: input.url,
      finalUrl: inspection.finalUrl,
      html: inspection.html,
    });
    const dspaceRestCandidates = await deriveDspaceRestCandidates({
      currentUrl: input.url,
      finalUrl: inspection.finalUrl,
      html: inspection.html,
    });
    const figshareApiCandidates = await deriveFigshareApiCandidates({
      currentUrl: input.url,
      finalUrl: inspection.finalUrl,
      html: inspection.html,
    });
    const derivedCandidates = [...figshareApiCandidates, ...dspaceRestCandidates, ...deterministicCandidates]
      .sort((left, right) => right.score - left.score)
      .filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index)
      .slice(0, MAX_CANDIDATE_LINKS);
    const isWrapper = isLikelyDownloadWrapper({
      text: inspection.text,
      html: inspection.html,
      url: inspection.finalUrl ?? input.url,
    });
    const isRichMetadata = isLikelyRichMetadataPage({
      text: inspection.text,
      html: inspection.html,
      url: inspection.finalUrl ?? input.url,
    });

    if (derivedCandidates.length > 0) {
      for (const candidate of derivedCandidates.slice(0, 4)) {
        pushCandidateSummary(
          input.candidateSummary,
          buildCandidateSummaryEntry({
            url: candidate.url,
            label: candidate.label,
            score: candidate.score,
            origin: candidate.origin,
          }),
        );
        pushAttempt(
          input.attempts,
          "derived_candidate",
          candidate.url,
          "candidate",
          `Se derivo un candidato adicional: ${candidate.label}.`,
        );
      }
    }

    if ((isWrapper || isRichMetadata || inspection.links.length > 0) && input.depth < MAX_CANDIDATE_FOLLOW_DEPTH) {
      const retryCandidates = [...derivedCandidates, ...inspection.links]
        .sort((left, right) => right.score - left.score)
        .filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index)
        .slice(0, 4);

      for (const candidate of retryCandidates) {
        const resolved = await tryResolveCandidateUrl({
          source: input.source,
          url: candidate.url,
          attempts: input.attempts,
          warnings: input.warnings,
          candidateSummary: input.candidateSummary,
          visited: input.visited,
          depth: input.depth + 1,
          resolvedVia: candidate.origin === "derived" ? "derived_candidate_follow" : "html_candidate_follow",
        });

        if (resolved) {
          return resolved;
        }
      }
    }

    if (seemsLikeFullTextPage(inspection.text) && !isWrapper && !isRichMetadata) {
      pushAttempt(
        input.attempts,
        "candidate_full_text",
        inspection.finalUrl ?? input.url,
        "ok",
        "El candidato parece contener texto completo visible.",
      );

      return buildResolvedItem({
        source: input.source,
        attempts: input.attempts,
        warnings: input.warnings,
        candidateSummary: [...input.candidateSummary.values()].sort((left, right) => right.score - left.score),
        status: "complete_public",
        kind: isRepositoryUrl(inspection.finalUrl) ? "repository_fulltext" : "web_fulltext",
        resolvedContentUrl: inspection.finalUrl ?? input.url,
        finalUrl: inspection.finalUrl ?? input.url,
        resolvedVia: input.resolvedVia,
        languageDetected,
        confidence: Math.max(0.7, 0.84 - input.depth * 0.05),
      });
    }
  } catch (error) {
    pushAttempt(
      input.attempts,
      "inspect_candidate",
      input.url,
      "error",
      error instanceof Error ? error.message : "No se pudo inspeccionar el candidato.",
    );
  }

  return null;
}

function buildMetadataOnlyResolution(
  source: BlueprintLaunchSelectedSourceBundle["sources"][number],
  attempts: BlueprintLaunchSourceAccessAttempt[],
  warnings: string[],
  candidateSummary: BlueprintLaunchSourceAccessCandidateSummary[],
): BlueprintLaunchSourceAccessResolutionItem {
  const hasAbstract = Boolean(source.reference.abstract?.trim());

  return {
    sourceId: source.reference.id,
    title: source.reference.title,
    status: hasAbstract ? "metadata_only" : "unresolved",
    kind: hasAbstract ? "abstract_only" : "unknown",
    resolvedContentUrl: null,
    finalUrl: source.reference.landingPageUrl ?? null,
    resolvedVia: hasAbstract ? "abstract_metadata_only" : "sin_acceso_publico_resuelto",
    languageDetected: detectLanguageHeuristic({
      text: source.reference.abstract,
      htmlLang: null,
      sourceLanguage: source.reference.sourceLanguage,
    }),
    confidence: hasAbstract ? 0.62 : 0.3,
    hasCompletePublicContent: false,
    candidateSummary,
    attempts,
    warnings,
  };
}

async function resolveSingleSourceAccess(input: {
  source: BlueprintLaunchSelectedSourceBundle["sources"][number];
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
}): Promise<ResolveSourceAccessOutcome> {
  const source = input.source;
  const attempts: BlueprintLaunchSourceAccessAttempt[] = [];
  const warnings: string[] = [];
  const llmPrompts: BlueprintLaunchLlmPromptRecord[] = [];
  const candidateSummary = new Map<string, BlueprintLaunchSourceAccessCandidateSummary>();

  if (source.reference.pdfAccessible && source.reference.pdfUrl) {
    pushCandidateSummary(
      candidateSummary,
      buildCandidateSummaryEntry({
        url: source.reference.pdfUrl,
        label: "openalex_pdf_url",
        score: 100,
        origin: "seed",
      }),
    );
    pushAttempt(
      attempts,
      "pdf_url_seed",
      source.reference.pdfUrl,
      "ok",
      "OpenAlex ya marco un PDF publico verificable.",
    );

    return {
      item: buildResolvedItem({
        source,
        attempts,
        warnings,
        candidateSummary: [...candidateSummary.values()].sort((left, right) => right.score - left.score),
        status: "complete_public",
        kind: "pdf",
        resolvedContentUrl: source.reference.pdfUrl,
        finalUrl: source.reference.pdfUrl,
        resolvedVia: "openalex_pdf_url",
        languageDetected: detectLanguageHeuristic({
          text: source.reference.abstract,
          htmlLang: null,
          sourceLanguage: source.reference.sourceLanguage,
        }),
        confidence: 0.98,
      }),
      llmPrompts,
    };
  }

  const seedUrls = [
    source.reference.pdfUrl,
    source.reference.doi
      ? source.reference.doi.startsWith("http")
        ? source.reference.doi
        : `https://doi.org/${source.reference.doi}`
      : null,
    source.reference.landingPageUrl,
  ].filter((value): value is string => Boolean(value));

  const visited = new Set<string>();
  let bestPartial: BlueprintLaunchSourceAccessResolutionItem | null = null;

  for (const seedUrl of seedUrls) {
    if (visited.has(seedUrl)) {
      continue;
    }
    pushCandidateSummary(
      candidateSummary,
      buildCandidateSummaryEntry({
        url: seedUrl,
        label:
          seedUrl === source.reference.pdfUrl
            ? "seed_pdf_candidate"
            : seedUrl.includes("doi.org/")
              ? "seed_doi"
              : "seed_landing_page",
        score: seedUrl === source.reference.pdfUrl ? 92 : seedUrl.includes("doi.org/") ? 84 : 72,
        origin: "seed",
      }),
    );
    visited.add(seedUrl);
    pushAttempt(attempts, "seed_url", seedUrl, "ok", "Se intento resolver acceso publico.");

    try {
      const inspection = await inspectUrl(seedUrl);
      warnings.push(...inspection.warnings);

      if (inspection.finalUrl && inspection.finalUrl !== seedUrl) {
        pushAttempt(
          attempts,
          "redirect",
          inspection.finalUrl,
          "redirect",
          `La URL redirigio desde ${seedUrl}.`,
        );
      }

      if (inspection.contentType?.toLowerCase().includes("pdf")) {
        const stablePdfUrl = preserveStablePdfCandidateUrl({
          candidateUrl: seedUrl,
          finalUrl: inspection.finalUrl,
        });
        pushAttempt(
          attempts,
          "content_type",
          stablePdfUrl,
          "ok",
          "La respuesta final expone application/pdf.",
        );

        return {
          item: buildResolvedItem({
            source,
            attempts,
            warnings,
            candidateSummary: [...candidateSummary.values()].sort((left, right) => right.score - left.score),
            status: "complete_public",
            kind: "pdf",
            resolvedContentUrl: stablePdfUrl,
            finalUrl: stablePdfUrl,
            resolvedVia:
              seedUrl === source.reference.pdfUrl
                ? "openalex_pdf_candidate"
                : seedUrl.includes("doi.org/")
                  ? "doi_redirect"
                  : "landing_pdf",
            languageDetected: detectLanguageHeuristic({
              text: source.reference.abstract,
              htmlLang: null,
              sourceLanguage: source.reference.sourceLanguage,
            }),
            confidence: 0.95,
          }),
          llmPrompts,
        };
      }

      const text = inspection.text;
      const languageDetected = detectLanguageHeuristic({
        text,
        htmlLang: inspection.htmlLang,
        sourceLanguage: source.reference.sourceLanguage,
      });
      const deterministicCandidates = deriveAccessCandidatesFromContext({
        currentUrl: seedUrl,
        finalUrl: inspection.finalUrl,
        html: inspection.html,
      });
      const dspaceRestCandidates = await deriveDspaceRestCandidates({
        currentUrl: seedUrl,
        finalUrl: inspection.finalUrl,
        html: inspection.html,
      });
      const figshareApiCandidates = await deriveFigshareApiCandidates({
        currentUrl: seedUrl,
        finalUrl: inspection.finalUrl,
        html: inspection.html,
      });
      const allCandidates = [
        ...figshareApiCandidates,
        ...dspaceRestCandidates,
        ...inspection.links,
        ...deterministicCandidates,
      ]
        .sort((left, right) => right.score - left.score)
        .filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index)
        .slice(0, MAX_CANDIDATE_LINKS);

      for (const candidate of allCandidates) {
        pushCandidateSummary(
          candidateSummary,
          buildCandidateSummaryEntry({
            url: candidate.url,
            label: candidate.label,
            score: candidate.score,
            origin: candidate.origin,
          }),
        );
      }

      for (const candidate of allCandidates) {
        pushAttempt(
          attempts,
          "candidate_link",
          candidate.url,
          "candidate",
          `Se detecto enlace potencial: ${candidate.label}.`,
        );
      }

      const strongCandidates = allCandidates.filter(
        (link) => link.score >= 7 || /\.pdf($|\?)/i.test(link.url) || /\/pdf(\?|$)/i.test(link.url),
      );

      for (const strongCandidate of strongCandidates.slice(0, 4)) {
        const resolvedCandidate = await tryResolveCandidateUrl({
          source,
          url: strongCandidate.url,
          attempts,
          warnings,
          candidateSummary,
          visited,
          depth: 0,
          resolvedVia:
            strongCandidate.origin === "derived" ? "derived_candidate_follow" : "html_candidate_follow",
        });

        if (resolvedCandidate) {
          return {
            item: resolvedCandidate,
            llmPrompts,
          };
        }
      }

      let llmAssessment: AccessLlmAssessment | null = null;

      if (inspection.html && inspection.text) {
        const llmStatus = resolveConfiguredAccessLlmStatus();

        if (!llmStatus.ok) {
          pushAttempt(
            attempts,
            "llm_access_assessment",
            inspection.finalUrl ?? seedUrl,
            "skipped",
            llmStatus.reason ?? "Evaluacion LLM omitida por configuracion local.",
          );
        } else {
          try {
            const llmPromptTemplate = buildAssessmentPromptTemplate();
            const llmPromptText = buildAssessmentPrompt({
              projectGlobalContext: input.projectGlobalContext,
              sourceId: source.reference.id,
              title: source.reference.title,
              doi: source.reference.doi,
              landingPageUrl: source.reference.landingPageUrl,
              inspection,
            });
            llmAssessment = await assessAccessWithLlm({
              projectGlobalContext: input.projectGlobalContext,
              sourceId: source.reference.id,
              title: source.reference.title,
              doi: source.reference.doi,
              landingPageUrl: source.reference.landingPageUrl,
              inspection,
            });
            llmPrompts.push({
              label: "Interpretacion de acceso ambiguo",
              schemaName: ACCESS_ASSESSMENT_SCHEMA_NAME,
              model: ACCESS_ASSESSMENT_MODEL,
              trackingLabel: ACCESS_ASSESSMENT_TRACKING_LABEL,
              promptTemplate: llmPromptTemplate,
              promptText: llmPromptText,
              sourceId: source.reference.id,
              sourceTitle: source.reference.title,
            });
            pushAttempt(
              attempts,
              "llm_access_assessment",
              inspection.finalUrl ?? seedUrl,
              "ok",
              llmAssessment.rationale,
            );
          } catch (error) {
            pushAttempt(
              attempts,
              "llm_access_assessment",
              inspection.finalUrl ?? seedUrl,
              "error",
              error instanceof Error ? error.message : "Fallo la evaluacion LLM de acceso.",
            );
          }
        }
      }

      if (llmAssessment?.should_follow_candidate_url) {
        const followCandidate = allCandidates.find(
          (item) => item.url === llmAssessment?.should_follow_candidate_url,
        );

        if (followCandidate) {
          try {
            const resolvedCandidate = await tryResolveCandidateUrl({
              source,
              url: followCandidate.url,
              attempts,
              warnings,
              candidateSummary,
              visited,
              depth: 0,
              resolvedVia: "llm_suggested_candidate",
            });

            if (resolvedCandidate) {
              return {
                item: resolvedCandidate,
                llmPrompts,
              };
            }
          } catch (error) {
            pushAttempt(
              attempts,
              "llm_candidate_follow",
              followCandidate.url,
              "error",
              error instanceof Error ? error.message : "Fallo al seguir el candidato sugerido.",
            );
          }
        }
      }

      const llmPartialStatus = llmAssessment?.content_status;
      const llmKind = llmAssessment?.content_kind ?? "landing_only";
      const partialResolution: BlueprintLaunchSourceAccessResolutionItem = {
        sourceId: source.reference.id,
        title: source.reference.title,
        status:
          llmPartialStatus === "complete_public"
            ? "partial_public"
            : llmPartialStatus ?? "partial_public",
        kind:
          llmKind === "pdf" || llmKind === "web_fulltext" || llmKind === "repository_fulltext"
            ? "landing_only"
            : llmKind,
        resolvedContentUrl: null,
        finalUrl: inspection.finalUrl ?? seedUrl,
        resolvedVia: llmAssessment ? "landing_llm_assessed" : "landing_partial",
        languageDetected: llmAssessment?.language_detected ?? languageDetected,
        confidence: llmAssessment ? 0.58 : 0.46,
        hasCompletePublicContent: false,
        candidateSummary: [...candidateSummary.values()].sort((left, right) => right.score - left.score),
        attempts,
        warnings,
      };

      const isWrapper = isLikelyDownloadWrapper({
        text,
        html: inspection.html,
        url: inspection.finalUrl ?? seedUrl,
      });
      const isRichMetadata = isLikelyRichMetadataPage({
        text,
        html: inspection.html,
        url: inspection.finalUrl ?? seedUrl,
      });

      if (seemsLikeFullTextPage(text) && !isWrapper && !isRichMetadata) {
        pushAttempt(
          attempts,
          "html_full_text",
          inspection.finalUrl,
          "ok",
          "La pagina parece contener texto completo visible tras agotar candidatos de archivo.",
        );

        return {
          item: buildResolvedItem({
            source,
            attempts,
            warnings,
            candidateSummary: [...candidateSummary.values()].sort((left, right) => right.score - left.score),
            status: "complete_public",
            kind: isRepositoryUrl(inspection.finalUrl) ? "repository_fulltext" : "web_fulltext",
            resolvedContentUrl: inspection.finalUrl ?? seedUrl,
            finalUrl: inspection.finalUrl ?? seedUrl,
            resolvedVia: seedUrl.includes("doi.org/") ? "doi_html_fulltext" : "landing_html_fulltext",
            languageDetected,
            confidence: 0.82,
          }),
          llmPrompts,
        };
      }

      if (!bestPartial || partialResolution.confidence > bestPartial.confidence) {
        bestPartial = partialResolution;
      }
    } catch (error) {
      pushAttempt(
        attempts,
        "inspect_url",
        seedUrl,
        "error",
        error instanceof Error ? error.message : "No se pudo inspeccionar la URL.",
      );

      const dspaceFallbackCandidates = await deriveDspaceRestCandidates({
        currentUrl: seedUrl,
        finalUrl: null,
        html: null,
      });
      const figshareFallbackCandidates = await deriveFigshareApiCandidates({
        currentUrl: seedUrl,
        finalUrl: null,
        html: null,
      });
      const fallbackCandidates = [...figshareFallbackCandidates, ...dspaceFallbackCandidates]
        .sort((left, right) => right.score - left.score)
        .filter((candidate, index, array) => array.findIndex((item) => item.url === candidate.url) === index)
        .slice(0, MAX_CANDIDATE_LINKS);

      for (const candidate of fallbackCandidates) {
        pushCandidateSummary(
          candidateSummary,
          buildCandidateSummaryEntry({
            url: candidate.url,
            label: candidate.label,
            score: candidate.score,
            origin: candidate.origin,
          }),
        );
        pushAttempt(
          attempts,
          candidate.label.startsWith("figshare_file:")
            ? "figshare_api_fallback_candidate"
            : "dspace_handle_fallback_candidate",
          candidate.url,
          "candidate",
          `Se recupero candidato por API de repositorio: ${candidate.label}.`,
        );
      }

      for (const candidate of fallbackCandidates.slice(0, 4)) {
        const resolvedCandidate = await tryResolveCandidateUrl({
          source,
          url: candidate.url,
          attempts,
          warnings,
          candidateSummary,
          visited,
          depth: 0,
          resolvedVia: "dspace_handle_fallback",
        });

        if (resolvedCandidate) {
          return {
            item: resolvedCandidate,
            llmPrompts,
          };
        }
      }

      warnings.push(`No se pudo inspeccionar ${seedUrl}.`);
    }
  }

  if (bestPartial) {
    return {
      item: bestPartial,
      llmPrompts,
    };
  }

  return {
    item: buildMetadataOnlyResolution(
      source,
      attempts,
      warnings,
      [...candidateSummary.values()].sort((left, right) => right.score - left.score),
    ),
    llmPrompts,
  };
}

function buildSummary(result: {
  total: number;
  completePublicCount: number;
  partialPublicCount: number;
  metadataOnlyCount: number;
  unresolvedCount: number;
}) {
  return `Se resolvio acceso para ${result.total} fuente(s): ${result.completePublicCount} con contenido publico completo, ${result.partialPublicCount} con acceso parcial, ${result.metadataOnlyCount} solo con metadata/abstract y ${result.unresolvedCount} sin acceso util resuelto.`;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex] as T, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );

  return results;
}

export async function resolveBlueprintLaunchSourceAccess(input: {
  bundle: BlueprintLaunchSelectedSourceBundle;
  projectGlobalContext: BlueprintLaunchProjectGlobalContext | null;
}): Promise<BlueprintLaunchSourceAccessResolutionResult> {
  const resolvedSources = await mapWithConcurrency(input.bundle.sources, 3, (source) =>
    resolveSingleSourceAccess({
      source,
      projectGlobalContext: input.projectGlobalContext,
    }),
  );
  const items: BlueprintLaunchSourceAccessResolutionItem[] = resolvedSources.map(
    (resolved) => resolved.item,
  );
  const llmPrompts: BlueprintLaunchLlmPromptRecord[] = resolvedSources.flatMap(
    (resolved) => resolved.llmPrompts,
  );

  const completePublicCount = items.filter((item) => item.hasCompletePublicContent).length;
  const partialPublicCount = items.filter((item) => item.status === "partial_public").length;
  const metadataOnlyCount = items.filter((item) => item.status === "metadata_only").length;
  const unresolvedCount = items.filter((item) => item.status === "unresolved").length;

  return {
    savedAt: new Date().toISOString(),
    summary: buildSummary({
      total: items.length,
      completePublicCount,
      partialPublicCount,
      metadataOnlyCount,
      unresolvedCount,
    }),
    completePublicCount,
    partialPublicCount,
    metadataOnlyCount,
    unresolvedCount,
    llmPromptCount: llmPrompts.length,
    llmPrompts,
    items,
  };
}
