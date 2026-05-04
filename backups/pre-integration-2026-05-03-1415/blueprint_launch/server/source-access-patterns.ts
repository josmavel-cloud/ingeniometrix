export type BlueprintLaunchAccessCandidate = {
  url: string;
  label: string;
  score: number;
  origin: "meta" | "anchor" | "regex" | "derived";
};

const SEMANTIC_FILE_TERMS = [
  "pdf",
  "download",
  "full text",
  "fulltext",
  "texto completo",
  "thesis",
  "tesis",
  "dissertation",
  "manuscript",
  "accepted version",
  "author accepted manuscript",
  "version of record",
  "open access",
  "view file",
  "open file",
  "bitstream",
  "files",
];

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

function scoreCandidate(label: string, url: string, origin: BlueprintLaunchAccessCandidate["origin"]) {
  const haystack = `${label} ${url}`.toLowerCase();
  let score = origin === "derived" ? 7 : origin === "meta" ? 8 : origin === "regex" ? 6 : 5;

  for (const term of SEMANTIC_FILE_TERMS) {
    if (haystack.includes(term)) {
      score += 2;
    }
  }

  if (/\/bitstreams\/[^/]+\/download/i.test(url)) {
    score += 6;
  }
  if (/\/server\/api\/core\/bitstreams\/[^/]+\/content/i.test(url)) {
    score += 12;
  }
  if (/\.pdf($|\?)/i.test(url) || /\/pdf(\?|$)/i.test(url)) {
    score += 8;
  }
  if (/citation_pdf_url/i.test(label)) {
    score += 5;
  }
  if (/derived_dspace_content/i.test(label)) {
    score += 20;
  }
  if (/\bthesis\b|\btesis\b|\bdissertation\b/i.test(haystack)) {
    score += 6;
  }
  if (/\baccepted version\b|\bversion of record\b|\bmanuscript\b/i.test(haystack)) {
    score += 4;
  }
  if (/\babout\b|\bcopyright\b|\bhelp\b/i.test(haystack)) {
    score -= 10;
  }

  return score;
}

function pushCandidate(
  candidates: Map<string, BlueprintLaunchAccessCandidate>,
  url: string,
  label: string,
  origin: BlueprintLaunchAccessCandidate["origin"],
) {
  if (/%7b|%7d|\{|\}/i.test(url)) {
    return;
  }

  const score = scoreCandidate(label, url, origin);

  if (score <= 0) {
    return;
  }

  const existing = candidates.get(url);

  if (!existing || score > existing.score) {
    candidates.set(url, { url, label, score, origin });
  }
}

function extractMetaContent(html: string, metaName: string) {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${metaName}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(pattern);

  return match?.[1] ? cleanText(match[1]) : null;
}

function resolveCandidateUrl(rawUrl: string, baseUrl: string) {
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractAccessCandidatesFromHtml(html: string, baseUrl: string) {
  const candidates = new Map<string, BlueprintLaunchAccessCandidate>();
  const pdfMeta = extractMetaContent(html, "citation_pdf_url");

  if (pdfMeta) {
    const resolved = resolveCandidateUrl(pdfMeta, baseUrl);
    if (resolved) {
      pushCandidate(candidates, resolved, "citation_pdf_url", "meta");
    }
  }

  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;

  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const href = anchorMatch[1]?.trim();
    const label = stripHtml(anchorMatch[2] ?? "");

    if (!href || href.startsWith("#")) {
      continue;
    }

    const resolved = resolveCandidateUrl(href, baseUrl);
    if (!resolved) {
      continue;
    }

    const labelHaystack = `${label} ${resolved}`.toLowerCase();
    if (
      SEMANTIC_FILE_TERMS.some((term) => labelHaystack.includes(term)) ||
      /\/bitstreams\/[^/]+\/download/i.test(resolved) ||
      /\/pdf(\?|$)/i.test(resolved) ||
      /\.pdf($|\?)/i.test(resolved)
    ) {
      pushCandidate(candidates, resolved, label || "anchor", "anchor");
    }
  }

  const regexes = [
    /https?:\/\/[^"'\\s<>]+\/bitstreams\/[^"'\\s<>]+\/download/gi,
    /https?:\/\/[^"'\\s<>]+\/server\/api\/core\/bitstreams\/[^"'\\s<>]+\/content/gi,
    /https?:\/\/[^"'\\s<>]+\/pdf(?:\?[^"'\\s<>]+)?/gi,
    /\/bitstreams\/[^"'\\s<>]+\/download/gi,
    /\/server\/api\/core\/bitstreams\/[^"'\\s<>]+\/content/gi,
  ];

  for (const regex of regexes) {
    const matches = html.match(regex) ?? [];

    for (const match of matches) {
      const resolved = resolveCandidateUrl(match, baseUrl);
      if (resolved) {
        pushCandidate(candidates, resolved, "regex_detected", "regex");
      }
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

export function deriveAccessCandidatesFromContext(input: {
  currentUrl: string;
  finalUrl: string | null;
  html: string | null;
}) {
  const candidates = new Map<string, BlueprintLaunchAccessCandidate>();
  const urls = [input.currentUrl, input.finalUrl].filter((value): value is string => Boolean(value));

  for (const url of urls) {
    const dspaceBitstreamMatch = url.match(/\/bitstreams\/([^/?#]+)\/download/i);
    if (dspaceBitstreamMatch) {
      const base = new URL(url);
      const derived = `${base.origin}/server/api/core/bitstreams/${dspaceBitstreamMatch[1]}/content`;
      pushCandidate(candidates, derived, "derived_dspace_content", "derived");
    }
  }

  if (input.html) {
    const finalUrl = input.finalUrl ?? input.currentUrl;
    for (const candidate of extractAccessCandidatesFromHtml(input.html, finalUrl)) {
      pushCandidate(candidates, candidate.url, candidate.label, "derived");
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score);
}

export function isLikelyDownloadWrapper(input: {
  text: string | null;
  html: string | null;
  url: string | null;
}) {
  const text = input.text?.toLowerCase() ?? "";
  const html = input.html?.toLowerCase() ?? "";
  const url = input.url?.toLowerCase() ?? "";

  return (
    text.includes("now downloading") ||
    text.includes("download will begin shortly") ||
    text.includes("please wait while your download") ||
    (html.includes("dspace") && text.includes("log in")) ||
    (/\/bitstreams\/[^/]+\/download/i.test(url) &&
      !/\.pdf($|\?)/i.test(url) &&
      text.length < 1200)
  );
}

export function isLikelyRichMetadataPage(input: {
  text: string | null;
  html: string | null;
  url: string | null;
}) {
  const text = input.text?.toLowerCase() ?? "";
  const html = input.html?.toLowerCase() ?? "";
  const url = input.url?.toLowerCase() ?? "";

  if (isLikelyDownloadWrapper(input)) {
    return false;
  }

  const metadataHits = [
    "abstract",
    "keywords",
    "rights",
    "deposited on",
    "issued on",
    "files",
    "repository",
    "recommended citation",
  ].filter((token) => text.includes(token) || html.includes(token)).length;

  const fullTextHits = [
    "introduction",
    "methodology",
    "methods",
    "results",
    "discussion",
    "conclusion",
    "references",
  ].filter((token) => text.includes(token)).length;

  return (
    (url.includes("/items/") || url.includes("/handle/") || url.includes("/record/")) &&
    metadataHits >= 3 &&
    fullTextHits < 3
  );
}
