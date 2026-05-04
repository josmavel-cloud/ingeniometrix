import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const repoRoot = process.cwd();
const envPath = path.join(repoRoot, ".env");

const STOPWORDS = new Set([
  "a",
  "al",
  "an",
  "and",
  "as",
  "at",
  "de",
  "del",
  "do",
  "e",
  "el",
  "en",
  "for",
  "from",
  "in",
  "la",
  "las",
  "los",
  "of",
  "on",
  "or",
  "para",
  "por",
  "the",
  "to",
  "un",
  "una",
  "y",
]);

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

function normalizeKeyword(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addKeyword(bucket, { keywordText, source, score, evidenceJson }) {
  const cleanText = keywordText?.trim();
  if (!cleanText) {
    return;
  }

  const normalizedKeyword = normalizeKeyword(cleanText);
  if (!normalizedKeyword || normalizedKeyword.length < 3) {
    return;
  }

  const existing = bucket.get(normalizedKeyword);
  if (!existing || (score ?? 0) > (existing.score ?? 0)) {
    bucket.set(normalizedKeyword, {
      keywordText: cleanText,
      normalizedKeyword,
      source,
      score,
      evidenceJson,
    });
  }
}

function extractTitlePhrases(title) {
  const normalizedTitle = title
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalizedTitle
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !STOPWORDS.has(normalizeKeyword(token)));

  const phrases = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    phrases.add(tokens[index]);

    if (index + 1 < tokens.length) {
      phrases.add(`${tokens[index]} ${tokens[index + 1]}`);
    }
  }

  return Array.from(phrases).slice(0, 6);
}

function collectProviderKeywords(reference) {
  const bucket = new Map();
  const openAlex = reference.rawOpenAlexJson;

  if (openAlex && typeof openAlex === "object") {
    const keywords = Array.isArray(openAlex.keywords) ? openAlex.keywords : [];
    const topics = Array.isArray(openAlex.topics) ? openAlex.topics : [];
    const primaryTopic =
      openAlex.primary_topic && typeof openAlex.primary_topic === "object"
        ? openAlex.primary_topic
        : null;

    for (const keyword of keywords.slice(0, 8)) {
      addKeyword(bucket, {
        keywordText: typeof keyword.display_name === "string" ? keyword.display_name : "",
        source: "PROVIDER",
        score: typeof keyword.score === "number" ? keyword.score : 0.5,
        evidenceJson: {
          provider: "OpenAlex",
          sourceType: "keyword",
          openAlexKeywordId: keyword.id ?? null,
        },
      });
    }

    if (primaryTopic?.display_name) {
      addKeyword(bucket, {
        keywordText: primaryTopic.display_name,
        source: "PROVIDER",
        score: typeof primaryTopic.score === "number" ? primaryTopic.score : 0.8,
        evidenceJson: {
          provider: "OpenAlex",
          sourceType: "primary_topic",
          openAlexTopicId: primaryTopic.id ?? null,
          field: primaryTopic.field?.display_name ?? null,
          subfield: primaryTopic.subfield?.display_name ?? null,
        },
      });
    }

    for (const topic of topics.slice(0, 3)) {
      addKeyword(bucket, {
        keywordText: typeof topic.display_name === "string" ? topic.display_name : "",
        source: "PROVIDER",
        score: typeof topic.score === "number" ? topic.score : 0.7,
        evidenceJson: {
          provider: "OpenAlex",
          sourceType: "topic",
          openAlexTopicId: topic.id ?? null,
          field: topic.field?.display_name ?? null,
          subfield: topic.subfield?.display_name ?? null,
        },
      });
    }
  }

  const titlePhrases = extractTitlePhrases(reference.title);
  for (const [index, phrase] of titlePhrases.entries()) {
    addKeyword(bucket, {
      keywordText: phrase,
      source: "SYSTEM",
      score: Math.max(0.25, 0.55 - index * 0.05),
      evidenceJson: {
        sourceType: "title_phrase",
        title: reference.title,
      },
    });
  }

  return Array.from(bucket.values()).slice(0, 12);
}

async function main() {
  await loadLocalEnv();

  const references = await prisma.reference.findMany({
    select: {
      id: true,
      title: true,
      rawOpenAlexJson: true,
    },
  });

  await prisma.referenceKeyword.deleteMany({});

  let inserted = 0;
  let withProviderKeywords = 0;
  let withSystemFallback = 0;

  try {
    for (const reference of references) {
      const keywords = collectProviderKeywords(reference);
      const hasProviderKeyword = keywords.some((keyword) => keyword.source === "PROVIDER");
      const hasSystemKeyword = keywords.some((keyword) => keyword.source === "SYSTEM");

      if (hasProviderKeyword) {
        withProviderKeywords += 1;
      }

      if (!hasProviderKeyword && hasSystemKeyword) {
        withSystemFallback += 1;
      }

      for (const keyword of keywords) {
        await prisma.referenceKeyword.create({
          data: {
            referenceId: reference.id,
            keywordText: keyword.keywordText,
            normalizedKeyword: keyword.normalizedKeyword,
            conceptId: null,
            source: keyword.source,
            score: keyword.score ?? null,
            isValidated: false,
            evidenceJson: keyword.evidenceJson,
          },
        });
        inserted += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("Resumen de backfill de keywords:");
  console.log(`- referencias procesadas: ${references.length}`);
  console.log(`- keywords insertadas: ${inserted}`);
  console.log(`- referencias con keywords de proveedor: ${withProviderKeywords}`);
  console.log(`- referencias con fallback de sistema: ${withSystemFallback}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
