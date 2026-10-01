import { REFERENCE_TRANSLATION_SERVICE_1_PROMPT, REFERENCE_TRANSLATION_SERVICE_2_PROMPT } from "@/server/mvp/prompts/reference-translation-service.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import { Prisma } from "@prisma/client";

import referenceLanguageDetectionBatchSchemaJson from "@/ai/schemas/reference-language-detection-batch.schema.json";
import referenceTranslationBatchSchemaJson from "@/ai/schemas/reference-translation-batch.schema.json";
import { APP_DEFAULT_LANGUAGE, normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { referenceDisplayText, REFERENCE_DISPLAY_TEXT_VERSION } from "@/lib/reference-display-text";
import { getConfiguredLlmProvider } from "@/llm";

import { generateStructuredObjectWithTextFallback } from "./retrieval-llm-json";

type ReferenceRecordLike = {
  id: string;
  title: string;
  abstract: string | null;
  rawOpenAlexJson: Prisma.JsonValue | null;
  rawCrossrefJson?: Prisma.JsonValue | null;
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

export const DISPLAY_TRANSLATION_POLICY = `reference-display.es.v2:${REFERENCE_DISPLAY_TEXT_VERSION}`;
export function referenceDisplayContentHash(reference: Pick<ReferenceRecordLike, "title" | "abstract">) {
  return fingerprint([reference.title, reference.abstract]);
}

export async function readReferenceDisplayTranslations(references: ReferenceRecordLike[], targetLanguage: string) {
  const rows = await prisma.referenceDisplayTranslation.findMany({ where: {
    referenceId: { in: references.map(item => item.id) }, targetLanguage,
    policyVersion: DISPLAY_TRANSLATION_POLICY,
  } });
  const byKey = new Map(rows.map(row => [`${row.referenceId}:${row.contentHash}`, row]));
  return new Map(references.flatMap(reference => {
    const row = byKey.get(`${reference.id}:${referenceDisplayContentHash(reference)}`);
    return row ? [[reference.id, { sourceLanguage: row.sourceLanguage,
      translatedTitle: row.displayTitle, translatedAbstract: reference.abstract ? row.displayAbstract : null }]] as const : [];
  }));
}

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

  return renderVersionedPrompt(REFERENCE_TRANSLATION_SERVICE_1_PROMPT, { var_0: (referencesBlock) }).trim();
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

  return renderVersionedPrompt(REFERENCE_TRANSLATION_SERVICE_2_PROMPT, { var_0: (input.targetLanguage), var_1: (referencesBlock) }).trim();
}

export function resolveReferenceSourceLanguage(reference: ReferenceRecordLike) {
  const crossrefLanguage = isRecord(reference.rawCrossrefJson) &&
    typeof reference.rawCrossrefJson.language === "string"
      ? normalizeLanguageCode(reference.rawCrossrefJson.language) : null;
  return (
    getLanguageFromRawOpenAlex(reference.rawOpenAlexJson) ??
    crossrefLanguage ??
    getCachedDetectedLanguage(reference.rawOpenAlexJson)?.detectedLanguage ??
    detectLanguageHeuristically(`${referenceDisplayText(reference.title) ?? reference.title} ${referenceDisplayText(reference.abstract) ?? ""}`)
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
  strict?: boolean;
}) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage) ?? APP_DEFAULT_LANGUAGE;
  const sourceLanguages = new Map<string, string | null>();
  const output = await readReferenceDisplayTranslations(input.references, targetLanguage);
  const pending: TranslationTarget[] = [];

  for (const reference of input.references) {
    const sourceLanguage = output.get(reference.id)?.sourceLanguage ?? resolveReferenceSourceLanguage(reference);
    sourceLanguages.set(reference.id, sourceLanguage);
  }

  const unknown = input.references.filter(reference => !sourceLanguages.get(reference.id));
  if (unknown.length) {
    try {
      const detection = await generateStructuredObjectWithTextFallback<LanguageDetectionBatchResponse>({
        provider: getConfiguredLlmProvider(),
        prompt: buildLanguageDetectionPrompt({ items: unknown.map(reference => ({ referenceId: reference.id,
          title: referenceDisplayText(reference.title) ?? reference.title,
          abstract: referenceDisplayText(reference.abstract) })) }),
        schemaName: "reference_language_detection_batch",
        schema: referenceLanguageDetectionBatchSchemaJson as Record<string, unknown>,
        trackingAttribution: { stage: "source_language_detection", promptVersion: REFERENCE_TRANSLATION_SERVICE_1_PROMPT.version },
      });
      for (const reference of unknown) {
        const item = detection.detections.find(candidate => candidate.reference_id === reference.id);
        const language = normalizeDetectedLanguageValue(item?.detected_language);
        if (!language) {
          if (input.strict) throw new Error("REFERENCE_LANGUAGE_UNDETERMINED");
          continue;
        }
        sourceLanguages.set(reference.id, language);
        if (language === targetLanguage) {
          await prisma.referenceDisplayTranslation.upsert({ where: { referenceId_contentHash_targetLanguage_policyVersion: {
            referenceId: reference.id, contentHash: referenceDisplayContentHash(reference), targetLanguage,
            policyVersion: DISPLAY_TRANSLATION_POLICY } },
            create: { referenceId: reference.id, contentHash: referenceDisplayContentHash(reference), targetLanguage,
              policyVersion: DISPLAY_TRANSLATION_POLICY, sourceLanguage: language, displayTitle: null, displayAbstract: null,
              provider: "configured-llm", model: process.env.LLM_DEFAULT_MODEL ?? null,
              promptVersion: REFERENCE_TRANSLATION_SERVICE_1_PROMPT.version, provenance: "LLM_LANGUAGE_DETECTION" },
            update: {} });
        }
      }
    } catch (error) {
      if (input.strict) throw error;
    }
  }

  for (const reference of input.references) {
    const sourceLanguage = sourceLanguages.get(reference.id) ?? null;
    const cachedTranslation = output.get(reference.id);

    if (!sourceLanguage || sourceLanguage === targetLanguage) {
      continue;
    }

    if (cachedTranslation?.translatedTitle && (!reference.abstract || cachedTranslation.translatedAbstract)) {
      output.set(reference.id, cachedTranslation);
      continue;
    }

    pending.push({
      referenceId: reference.id,
      title: referenceDisplayText(reference.title) ?? reference.title,
      abstract: referenceDisplayText(reference.abstract),
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
      trackingAttribution: { stage: "source_translation", promptVersion: REFERENCE_TRANSLATION_SERVICE_2_PROMPT.version },
    });
  } catch (error) {
    if (input.strict) throw error;
    return {
      translations: output,
      sourceLanguages,
    };
  }

  const referencesById = new Map(input.references.map((reference) => [reference.id, reference]));
  if (input.strict && pending.some(item => !batch.translations.some(value => value.reference_id === item.referenceId &&
    value.translated_title?.trim() && (!item.abstract || value.translated_abstract?.trim()))))
    throw new Error("REFERENCE_TRANSLATION_INCOMPLETE");

  await Promise.all(
    batch.translations.map(async (item) => {
      const reference = referencesById.get(item.reference_id);

      if (!reference) {
        return;
      }

      const translation = {
        sourceLanguage: normalizeLanguageCode(item.source_language),
        translatedTitle: item.translated_title?.trim() || null,
        translatedAbstract: reference.abstract ? item.translated_abstract?.trim() || null : null,
      } satisfies CachedReferenceTranslation;

      output.set(reference.id, translation);

      await prisma.referenceDisplayTranslation.upsert({ where: { referenceId_contentHash_targetLanguage_policyVersion: {
        referenceId: reference.id, contentHash: referenceDisplayContentHash(reference), targetLanguage,
        policyVersion: DISPLAY_TRANSLATION_POLICY } },
        create: { referenceId: reference.id, contentHash: referenceDisplayContentHash(reference), targetLanguage,
          policyVersion: DISPLAY_TRANSLATION_POLICY, sourceLanguage: translation.sourceLanguage,
          displayTitle: translation.translatedTitle, displayAbstract: translation.translatedAbstract,
          provider: "configured-llm", model: process.env.LLM_DEFAULT_MODEL ?? null,
          promptVersion: REFERENCE_TRANSLATION_SERVICE_2_PROMPT.version, provenance: "LLM_BATCH" },
        update: {} });
    }),
  );

  return {
    translations: output,
    sourceLanguages,
  };
}
