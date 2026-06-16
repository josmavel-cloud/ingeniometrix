import { createHash, randomUUID } from "node:crypto";

import { extractSearchTerms, normalizeTitle } from "@/lib/text";

export function buildDeterministicSourceId(input: {
  origin: string;
  doi?: string | null;
  title: string;
  url?: string | null;
}) {
  const hash = createHash("sha1")
    .update(`${input.origin}|${input.doi ?? ""}|${normalizeTitle(input.title)}|${input.url ?? ""}`)
    .digest("hex")
    .slice(0, 16);

  return `${input.origin}:${hash}`;
}

export function uniqueByNormalizedTitle<T extends { title: string }>(values: T[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeTitle(value.title);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function clipText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function buildSourceOverlapScore(input: {
  topicSeed: string;
  intakeContext: string;
  title: string;
  abstract: string | null;
  year: number | null;
  hasPdf: boolean;
}) {
  const focusTerms = extractSearchTerms(`${input.topicSeed} ${input.intakeContext}`, {
    maxTerms: 10,
    minLength: 4,
  });
  const titleTerms = new Set(
    extractSearchTerms(input.title, {
      maxTerms: 10,
      minLength: 4,
    }),
  );
  const abstractTerms = new Set(
    extractSearchTerms(input.abstract, {
      maxTerms: 12,
      minLength: 4,
    }),
  );

  let score = 0;
  for (const term of focusTerms) {
    if (titleTerms.has(term)) {
      score += 3;
    }

    if (abstractTerms.has(term)) {
      score += 2;
    }
  }

  const currentYear = new Date().getFullYear();
  if (input.year && input.year >= currentYear - 5) {
    score += 2;
  }

  if (input.hasPdf) {
    score += 1.5;
  }

  return score;
}

export function makeSnippetId(prefix: string) {
  return `${prefix}:${randomUUID()}`;
}

export function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

export function parseBulletLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

export function normalizePercent(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}
