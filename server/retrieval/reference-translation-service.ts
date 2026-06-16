import { Prisma } from "@prisma/client";

import referenceLanguageDetectionBatchSchemaJson from "@/ai/schemas/reference-language-detection-batch.schema.json";
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

type CachedLanguageDetection = {
  detectedLanguage: string | null;
  confidence: string | null;
};

type LanguageDetectionBatchResponse = {
  detections: Array<{
    reference_id: string;
    detected_language: string;
    confidence: string;
    rationale?: string | null;
  }>;
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

function normalizeDetectedLanguageValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized || normalized === "other") {
    return null;
  }

  return normalizeLanguageCode(normalized);
}

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

function getCachedDetectedLanguage(rawOpenAlexJson: Prisma.JsonValue | null) {
  if (!isRecord(rawOpenAlexJson)) {
    return null;
  }

  const cacheEntry = rawOpenAlexJson.imx_language_detection;

  if (!isRecord(cacheEntry)) {
    return null;
  }

  return {
    detectedLanguage:
      typeof cacheEntry.detectedLanguage === "string"
        ? normalizeDetectedLanguageValue(cacheEntry.detectedLanguage)
        : typeof cacheEntry.detected_language === "string"
          ? normalizeDetectedLanguageValue(cacheEntry.detected_language)
          : null,
    confidence:
      typeof cacheEntry.confidence === "string" ? cacheEntry.confidence.trim().toLowerCase() : null,
  } satisfies CachedLanguageDetection;
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

function buildRawOpenAlexJsonWithLanguageDetection(input: {
  rawOpenAlexJson: Prisma.JsonValue | null;
  detectedLanguage: string | null;
  confidence: string | null;
  rationale?: string | null;
}) {
  const currentRoot = isRecord(input.rawOpenAlexJson)
    ? { ...input.rawOpenAlexJson }
    : ({} as Record<string, Prisma.JsonValue>);

  currentRoot.imx_language_detection = {
    detectedLanguage: input.detectedLanguage,
    confidence: input.confidence,
    rationale: input.rationale ?? null,
    detectedAt: new Date().toISOString(),
  } satisfies Prisma.JsonObject;

  return currentRoot as Prisma.InputJsonValue;
}

function buildLanguageDetectionPrompt(input: {
  items: Array<{
    referenceId: string;
    title: string;
    abstract: string | null;
  }>;
}) {
  const referencesBlock = input.items
    .map((item) =>
      [
        `Referencia ${item.referenceId}:`,
        `reference_id: ${item.referenceId}`,
        `title: ${item.title}`,
        `abstract: ${item.abstract ?? "NO_DISPONIBLE"}`,
      ].join("\n"),
    )
    .join("\n\n");

  return `
Eres Ingeniometrix y tu tarea es detectar el idioma principal de referencias academicas.

Reglas:
- decide el idioma principal del titulo y abstract juntos
- si el contenido esta principalmente en espanol responde es
- si esta principalmente en ingles responde en
- usa pt, fr, de o it cuando aplique claramente
- usa other solo si el idioma no puede mapearse con confianza razonable
- no traduzcas
- no inventes contenido
- confidence debe reflejar cuan claro es el idioma desde el texto

Referencias:
${referencesBlock}
`.trim();
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
    getCachedDetectedLanguage(reference.rawOpenAlexJson)?.detectedLanguage ??
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
  const sourceLanguages = new Map<string, string | null>();
  const output = new Map<string, CachedReferenceTranslation>();
  const pending: TranslationTarget[] = [];
  const pendingLanguageDetection: Array<{
    referenceId: string;
    title: string;
    abstract: string | null;
  }> = [];

  for (const reference of input.references) {
    const sourceLanguage = resolveReferenceSourceLanguage(reference);
    sourceLanguages.set(reference.id, sourceLanguage);

    if (!sourceLanguage && (reference.title.trim().length > 0 || reference.abstract?.trim())) {
      pendingLanguageDetection.push({
        referenceId: reference.id,
        title: reference.title,
        abstract: reference.abstract,
      });
    }
  }

  if (pendingLanguageDetection.length > 0) {
    try {
      const provider = getConfiguredLlmProvider();
      const detectionBatch =
        await generateStructuredObjectWithTextFallback<LanguageDetectionBatchResponse>({
          provider,
          prompt: buildLanguageDetectionPrompt({
            items: pendingLanguageDetection,
          }),
          schemaName: "reference_language_detection_batch",
          schema: referenceLanguageDetectionBatchSchemaJson as Record<string, unknown>,
        });
      const referencesById = new Map(input.references.map((reference) => [reference.id, reference]));

      await Promise.all(
        detectionBatch.detections.map(async (item) => {
          const reference = referencesById.get(item.reference_id);

          if (!reference) {
            return;
          }

          const detectedLanguage = normalizeDetectedLanguageValue(item.detected_language);
          sourceLanguages.set(reference.id, detectedLanguage);

          await prisma.reference.update({
            where: { id: reference.id },
            data: {
              rawOpenAlexJson: buildRawOpenAlexJsonWithLanguageDetection({
                rawOpenAlexJson: reference.rawOpenAlexJson,
                detectedLanguage,
                confidence: item.confidence?.trim().toLowerCase() ?? null,
                rationale: item.rationale ?? null,
              }),
            },
          });
        }),
      );
    } catch {
      // Keep heuristic or null resolution when AI language detection is unavailable.
    }
  }

  for (const reference of input.references) {
    const sourceLanguage = sourceLanguages.get(reference.id) ?? null;
    const resolved = resolveReferenceTranslationForLanguage({
      reference,
      targetLanguage,
    });
    const cachedTranslation = resolved.cachedTranslation;

    if (!sourceLanguage || sourceLanguage === targetLanguage) {
      continue;
    }

    if (cachedTranslation) {
      output.set(reference.id, cachedTranslation);
      continue;
    }

    pending.push({
      referenceId: reference.id,
      title: reference.title,
      abstract: reference.abstract,
      sourceLanguage,
    });
  }

  if (pending.length === 0) {
    return {
      translations: output,
      sourceLanguages,
    };
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
    return {
      translations: output,
      sourceLanguages,
    };
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

  return {
    translations: output,
    sourceLanguages,
  };
}
