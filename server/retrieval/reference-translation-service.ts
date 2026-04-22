import { Prisma } from "@prisma/client";

import referenceTranslationBatchSchemaJson from "@/ai/schemas/reference-translation-batch.schema.json";
import { APP_DEFAULT_LANGUAGE, normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";

import { generateStructuredObjectWithTextFallback } from "./retrieval-llm-json";

type ReferenceRecordLike = {
  id: string;
  title: string;
  abstract: string | null;
  rawOpenAlexJson: Prisma.JsonValue | null;
};

type CachedReferenceTranslation = {
  sourceLanguage: string | null;
  translatedTitle: string | null;
  translatedAbstract: string | null;
};

type TranslationBatchResponse = {
  translations: Array<{
    reference_id: string;
    source_language: string;
    translated_title: string | null;
    translated_abstract: string | null;
  }>;
};

type TranslationTarget = {
  referenceId: string;
  title: string;
  abstract: string | null;
  sourceLanguage: string;
};

const LANGUAGE_STOPWORDS = {
  es: [
    "de",
    "la",
    "el",
    "los",
    "las",
    "para",
    "con",
    "sobre",
    "estudio",
    "analisis",
    "investigacion",
    "metodologia",
  ],
  en: [
    "the",
    "and",
    "of",
    "for",
    "with",
    "study",
    "analysis",
    "research",
    "method",
    "among",
    "using",
    "based",
  ],
  pt: [
    "de",
    "da",
    "do",
    "para",
    "com",
    "estudo",
    "analise",
    "pesquisa",
    "metodologia",
    "entre",
  ],
  fr: [
    "de",
    "la",
    "le",
    "les",
    "pour",
    "avec",
    "etude",
    "analyse",
    "recherche",
    "methode",
  ],
} as const;

function isRecord(value: Prisma.JsonValue | null | undefined): value is Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLanguageFromRawOpenAlex(rawOpenAlexJson: Prisma.JsonValue | null) {
  if (!isRecord(rawOpenAlexJson)) {
    return null;
  }

  const rawLanguage = rawOpenAlexJson.language;
  return typeof rawLanguage === "string" ? normalizeLanguageCode(rawLanguage) : null;
}

function normalizeTextForLanguageDetection(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguageHeuristically(value: string | null | undefined) {
  const normalized = normalizeTextForLanguageDetection(value);

  if (!normalized || normalized.length < 24) {
    return null;
  }

  const scores = Object.entries(LANGUAGE_STOPWORDS).map(([language, stopwords]) => ({
    language,
    score: stopwords.reduce(
      (total, term) => total + (normalized.includes(` ${term} `) ? 1 : 0),
      0,
    ),
  }));
  const winner = scores.sort((left, right) => right.score - left.score)[0];

  return winner && winner.score >= 2 ? winner.language : null;
}

export function getCachedTranslation(
  rawOpenAlexJson: Prisma.JsonValue | null,
  targetLanguage: string,
) {
  if (!isRecord(rawOpenAlexJson)) {
    return null;
  }

  const cacheRoot = rawOpenAlexJson.imx_translation_cache;

  if (!isRecord(cacheRoot)) {
    return null;
  }

  const cacheEntry = cacheRoot[targetLanguage];

  if (!isRecord(cacheEntry)) {
    return null;
  }

  return {
    sourceLanguage:
      typeof cacheEntry.sourceLanguage === "string"
        ? normalizeLanguageCode(cacheEntry.sourceLanguage)
        : null,
    translatedTitle:
      typeof cacheEntry.translatedTitle === "string" ? cacheEntry.translatedTitle : null,
    translatedAbstract:
      typeof cacheEntry.translatedAbstract === "string"
        ? cacheEntry.translatedAbstract
        : null,
  } satisfies CachedReferenceTranslation;
}

function buildUpdatedRawOpenAlexJson(input: {
  rawOpenAlexJson: Prisma.JsonValue | null;
  targetLanguage: string;
  translation: CachedReferenceTranslation;
}) {
  const currentRoot = isRecord(input.rawOpenAlexJson)
    ? { ...input.rawOpenAlexJson }
    : ({} as Record<string, Prisma.JsonValue>);
  const currentCache = isRecord(currentRoot.imx_translation_cache)
    ? { ...currentRoot.imx_translation_cache }
    : {};

  currentCache[input.targetLanguage] = {
    sourceLanguage: input.translation.sourceLanguage,
    translatedTitle: input.translation.translatedTitle,
    translatedAbstract: input.translation.translatedAbstract,
    translatedAt: new Date().toISOString(),
  } satisfies Prisma.JsonObject;

  currentRoot.imx_translation_cache = currentCache;

  return currentRoot as Prisma.InputJsonValue;
}

function buildTranslationPrompt(input: {
  targetLanguage: string;
  items: TranslationTarget[];
}) {
  const referencesBlock = input.items
    .map((item) =>
      [
        `Referencia ${item.referenceId}:`,
        `reference_id: ${item.referenceId}`,
        `source_language: ${item.sourceLanguage}`,
        `title: ${item.title}`,
        `abstract: ${item.abstract ?? "NO_DISPONIBLE"}`,
      ].join("\n"),
    )
    .join("\n\n");

  return `
Eres Ingeniometrix y tu tarea es traducir metadatos bibliograficos al idioma del usuario.

Reglas:
- traduce al idioma objetivo ${input.targetLanguage}
- conserva el sentido academico
- no inventes informacion
- no resumas
- si el abstract no existe, devuelve null
- si el titulo ya esta practicamente en el idioma objetivo, puedes devolverlo con cambios minimos
- devuelve una traduccion natural y util para interfaz de usuario

Referencias:
${referencesBlock}
`.trim();
}

export function resolveReferenceSourceLanguage(reference: ReferenceRecordLike) {
  return (
    getLanguageFromRawOpenAlex(reference.rawOpenAlexJson) ??
    detectLanguageHeuristically(`${reference.title} ${reference.abstract ?? ""}`)
  );
}

export function resolveReferenceTranslationForLanguage(input: {
  reference: ReferenceRecordLike;
  targetLanguage: string;
}) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage) ?? APP_DEFAULT_LANGUAGE;
  const sourceLanguage = resolveReferenceSourceLanguage(input.reference);
  const cachedTranslation = getCachedTranslation(
    input.reference.rawOpenAlexJson,
    targetLanguage,
  );

  return {
    sourceLanguage,
    targetLanguage,
    cachedTranslation,
    needsTranslation:
      Boolean(sourceLanguage) &&
      sourceLanguage !== targetLanguage &&
      Boolean(input.reference.title || input.reference.abstract),
  };
}

export async function ensureReferenceTranslationsForLanguage(input: {
  references: ReferenceRecordLike[];
  targetLanguage: string;
}) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage) ?? APP_DEFAULT_LANGUAGE;
  const output = new Map<string, CachedReferenceTranslation>();
  const pending: TranslationTarget[] = [];

  for (const reference of input.references) {
    const resolved = resolveReferenceTranslationForLanguage({
      reference,
      targetLanguage,
    });

    if (!resolved.needsTranslation) {
      continue;
    }

    if (resolved.cachedTranslation) {
      output.set(reference.id, resolved.cachedTranslation);
      continue;
    }

    if (!resolved.sourceLanguage) {
      continue;
    }

    pending.push({
      referenceId: reference.id,
      title: reference.title,
      abstract: reference.abstract,
      sourceLanguage: resolved.sourceLanguage,
    });
  }

  if (pending.length === 0) {
    return output;
  }

  let batch: TranslationBatchResponse;

  try {
    const provider = getConfiguredLlmProvider();
    batch = await generateStructuredObjectWithTextFallback<TranslationBatchResponse>({
      provider,
      prompt: buildTranslationPrompt({
        targetLanguage,
        items: pending,
      }),
      schemaName: "reference_translation_batch",
      schema: referenceTranslationBatchSchemaJson as Record<string, unknown>,
    });
  } catch {
    return output;
  }

  const referencesById = new Map(input.references.map((reference) => [reference.id, reference]));

  await Promise.all(
    batch.translations.map(async (item) => {
      const reference = referencesById.get(item.reference_id);

      if (!reference) {
        return;
      }

      const translation = {
        sourceLanguage: normalizeLanguageCode(item.source_language),
        translatedTitle: item.translated_title?.trim() || null,
        translatedAbstract: item.translated_abstract?.trim() || null,
      } satisfies CachedReferenceTranslation;

      output.set(reference.id, translation);

      await prisma.reference.update({
        where: { id: reference.id },
        data: {
          rawOpenAlexJson: buildUpdatedRawOpenAlexJson({
            rawOpenAlexJson: reference.rawOpenAlexJson,
            targetLanguage,
            translation,
          }),
        },
      });
    }),
  );

  return output;
}
