import { Prisma, ProjectStatus, Provider } from "@prisma/client";

import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import { normalizeLanguageCode, resolveLanguageContext } from "@/lib/language";
import { buildSearchQuery, extractSearchTerms, normalizeTitle } from "@/lib/text";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";
import type { IntakeInput } from "@/server/projects/project-validation";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

import {
  type CrossrefMessage,
  fetchCrossrefWorkByDoi,
  resolveCrossrefTitle,
  searchCrossrefWorks,
} from "./crossref-client";
import { extractAccessSignals, verifyPdfAccess } from "./reference-access";
import { evaluateReferenceQuality } from "./reference-quality";
import { searchOpenAlexWorks } from "./openalex-client";

export type ReferenceKeywordGroup = {
  label: string;
  variants: string[];
};

export type ReferenceSearchV2Metadata = {
  planSource: "llm" | "fallback";
  normalizedTopic: string;
  intentSummary: string;
  providerWarnings?: string[];
  keywordGroups: {
    necessary: ReferenceKeywordGroup[];
    complementary: ReferenceKeywordGroup[];
    optional: ReferenceKeywordGroup[];
  };
  queryPack: {
    necessaryOnly: string[];
    complementaryBoosted: string[];
    optionalBackups: string[];
  };
  focusTerms: string[];
  scoringRules: string[];
};

export type ReferenceScoreBreakdown = {
  label: "ALTO" | "MEDIO" | "BAJO" | "MINIMO";
  necessaryMatches: string[];
  complementaryMatches: string[];
  optionalMatches: string[];
  recencyBand: string;
  recencyBonus: number;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
};

export type ProjectReferenceSearchSnapshot = {
  referenceSearchVersion: "v2";
  savedAt: string;
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
  baseSelectedReferenceIds: string[];
  metadata: ReferenceSearchV2Metadata;
  references: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
    suggestedSelectedOrder: number | null;
    pdfUrl?: string | null;
    pdfAccessible?: boolean;
  }>;
};

export type SearchProjectReferencesV2Result = {
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  createdCount: number;
  updatedCount: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
  searchSnapshot: ProjectReferenceSearchSnapshot;
};

type KeywordGroupSchemaItem = {
  label: string;
  variants: string[];
};

type ReferenceSearchPlanSchema = {
  normalized_topic: string;
  intent_summary: string;
  keyword_groups: {
    necessary: KeywordGroupSchemaItem[];
    complementary: KeywordGroupSchemaItem[];
    optional: KeywordGroupSchemaItem[];
  };
  query_pack: {
    necessary_only: string[];
    complementary_boosted: string[];
    optional_backups: string[];
  };
  focus_terms: string[];
};

type SearchCandidate = {
  sourceProvider: Provider;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
  openAlexId: string | null;
  doi: string | null;
  title: string | null;
  normalizedTitle: string | null;
  language?: string | null;
  authors: string[];
  abstract: string | null;
  venue: string | null;
  year: number | null;
  workType: string | null;
  landingPageUrl: string | null;
  citationCount: number;
  rawOpenAlexJson: unknown | null;
  rawCrossrefJson: CrossrefMessage | null;
};

type RankedCandidate = {
  candidate: SearchCandidate;
  resolvedTitle: string;
  normalizedTitle: string;
  authors: string[];
  abstract: string | null;
  venue: string | null;
  year: number | null;
  workType: string | null;
  landingPageUrl: string | null;
  citationCount: number;
  crossrefMetadata: CrossrefMessage | null;
  score: number;
  scoreBreakdown: ReferenceScoreBreakdown;
  pdfUrl: string | null;
  pdfAccessible: boolean;
};

const referenceSearchPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "normalized_topic",
    "intent_summary",
    "keyword_groups",
    "query_pack",
    "focus_terms",
  ],
  properties: {
    normalized_topic: { type: "string", minLength: 8, maxLength: 220 },
    intent_summary: { type: "string", minLength: 12, maxLength: 320 },
    keyword_groups: {
      type: "object",
      additionalProperties: false,
      required: ["necessary", "complementary", "optional"],
      properties: {
        necessary: { type: "array", minItems: 2, maxItems: 6, items: keywordGroupItemSchema() },
        complementary: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: keywordGroupItemSchema(),
        },
        optional: { type: "array", maxItems: 6, items: keywordGroupItemSchema() },
      },
    },
    query_pack: {
      type: "object",
      additionalProperties: false,
      required: ["necessary_only", "complementary_boosted", "optional_backups"],
      properties: {
        necessary_only: { type: "array", minItems: 1, maxItems: 4, items: queryStringSchema() },
        complementary_boosted: { type: "array", maxItems: 4, items: queryStringSchema() },
        optional_backups: { type: "array", maxItems: 3, items: queryStringSchema() },
      },
    },
    focus_terms: {
      type: "array",
      minItems: 4,
      maxItems: 12,
      items: { type: "string", minLength: 3, maxLength: 60 },
    },
  },
} satisfies Record<string, unknown>;

function keywordGroupItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["label", "variants"],
    properties: {
      label: { type: "string", minLength: 3, maxLength: 60 },
      variants: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", minLength: 3, maxLength: 80 },
      },
    },
  };
}

function queryStringSchema() {
  return { type: "string", minLength: 8, maxLength: 160 };
}

function uniqueNormalized(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const normalized = normalizeTitle(value);

      if (!normalized || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function uniqueVariants(values: string[]) {
  return uniqueNormalized(values).slice(0, 4);
}

function buildKeywordGroup(label: string, variants: string[]): ReferenceKeywordGroup {
  return {
    label,
    variants: uniqueVariants(variants),
  };
}

function pushGroup(target: ReferenceKeywordGroup[], label: string, variants: string[]) {
  const group = buildKeywordGroup(label, variants);

  if (group.variants.length === 0) {
    return;
  }

  const normalizedLabel = normalizeTitle(label);

  if (target.some((item) => normalizeTitle(item.label) === normalizedLabel)) {
    return;
  }

  target.push(group);
}

function buildPhrase(terms: string[], start: number, count: number) {
  const phrase = terms.slice(start, start + count).join(" ").trim();
  return phrase.length >= 6 ? phrase : null;
}

function buildQueryPack(keywordGroups: ReferenceSearchV2Metadata["keywordGroups"]) {
  const necessaryBase = keywordGroups.necessary.map((group) => group.variants[0]).filter(Boolean);
  const necessaryAlternate = keywordGroups.necessary
    .map((group) => group.variants[1] ?? group.variants[0])
    .filter(Boolean);

  const necessaryOnly = uniqueNormalized([
    buildSearchQuery(necessaryBase),
    buildSearchQuery(necessaryAlternate),
    buildSearchQuery([
      necessaryBase[0],
      necessaryBase[1],
      necessaryBase[2],
      keywordGroups.necessary[3]?.variants[1] ?? keywordGroups.necessary[3]?.variants[0] ?? null,
    ]),
  ]).slice(0, 4);

  const complementaryBoosted = uniqueNormalized(
    keywordGroups.complementary.slice(0, 4).map((group) =>
      buildSearchQuery([...necessaryBase, group.variants[0]]),
    ),
  ).slice(0, 4);

  const optionalBackups = uniqueNormalized(
    keywordGroups.optional.slice(0, 3).map((group) =>
      buildSearchQuery([necessaryBase[0], necessaryBase[1], group.variants[0]]),
    ),
  ).slice(0, 3);

  return {
    necessaryOnly,
    complementaryBoosted,
    optionalBackups,
  };
}

function buildFallbackKeywordGroups(intake: IntakeInput): ReferenceSearchV2Metadata["keywordGroups"] {
  const topicTerms = extractSearchTerms(intake.topic, { maxTerms: 14, minLength: 4 });
  const problemTerms = extractSearchTerms(intake.problemContext ?? "", {
    maxTerms: 10,
    minLength: 4,
  });
  const populationTerms = extractSearchTerms(intake.targetPopulation ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const methodTerms = extractSearchTerms(intake.preferredMethodology ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const lineTerms = extractSearchTerms(intake.researchLine ?? "", {
    maxTerms: 8,
    minLength: 4,
  });
  const dataTerms = extractSearchTerms(intake.availableData ?? "", {
    maxTerms: 6,
    minLength: 4,
  });
  const constraintTerms = extractSearchTerms(intake.academicConstraints ?? "", {
    maxTerms: 6,
    minLength: 4,
  });
  const advisorTerms = extractSearchTerms(intake.advisorNotes ?? "", {
    maxTerms: 6,
    minLength: 4,
  });

  const necessary: ReferenceKeywordGroup[] = [];
  const complementary: ReferenceKeywordGroup[] = [];
  const optional: ReferenceKeywordGroup[] = [];

  pushGroup(necessary, "fenomeno principal", [
    buildPhrase(topicTerms, 0, 3) ?? "",
    buildPhrase(topicTerms, 0, 2) ?? "",
    buildPhrase(problemTerms, 0, 3) ?? "",
  ]);
  pushGroup(necessary, "objeto de estudio", [
    buildPhrase(populationTerms, 0, 3) ?? "",
    buildPhrase(topicTerms, 3, 3) ?? "",
  ]);
  pushGroup(necessary, "enfoque tecnico", [
    buildPhrase(lineTerms, 0, 3) ?? "",
    buildPhrase(methodTerms, 0, 3) ?? "",
    buildPhrase(problemTerms, 3, 3) ?? "",
  ]);
  pushGroup(necessary, "variable principal", [
    buildPhrase(problemTerms, 0, 2) ?? "",
    buildPhrase(topicTerms, 6, 3) ?? "",
  ]);

  pushGroup(complementary, "metodo", [
    buildPhrase(methodTerms, 0, 3) ?? "",
    buildPhrase(methodTerms, 3, 3) ?? "",
  ]);
  pushGroup(complementary, "contexto", [
    buildPhrase(populationTerms, 3, 3) ?? "",
    buildPhrase(problemTerms, 5, 3) ?? "",
  ]);
  pushGroup(complementary, "datos o senales", [
    buildPhrase(dataTerms, 0, 3) ?? "",
    buildPhrase(dataTerms, 3, 3) ?? "",
  ]);

  pushGroup(optional, "restricciones", [
    buildPhrase(constraintTerms, 0, 3) ?? "",
  ]);
  pushGroup(optional, "notas del asesor", [
    buildPhrase(advisorTerms, 0, 3) ?? "",
  ]);
  pushGroup(optional, "linea ampliada", [
    buildPhrase(lineTerms, 3, 3) ?? "",
  ]);

  if (necessary.length < 2) {
    pushGroup(necessary, "tema base", [
      buildSearchQuery(topicTerms.slice(0, 4)),
      buildSearchQuery(topicTerms.slice(4, 8)),
    ]);
    pushGroup(necessary, "alcance tecnico", [
      buildSearchQuery(topicTerms.slice(2, 6)),
    ]);
  }

  if (complementary.length === 0) {
    pushGroup(complementary, "precision metodologica", [
      buildSearchQuery(methodTerms.slice(0, 4)),
      buildSearchQuery(problemTerms.slice(0, 4)),
    ]);
  }

  return {
    necessary: necessary.slice(0, 6),
    complementary: complementary.slice(0, 6),
    optional: optional.slice(0, 6),
  };
}

function isEnglishLanguage(language: string | null | undefined) {
  return normalizeLanguageCode(language) === "en";
}

function buildScoringRules(language: string | null | undefined) {
  return isEnglishLanguage(language)
    ? [
        "HIGH: matches necessary and complementary groups.",
        "MEDIUM: matches necessary groups only.",
        "MINIMUM: matches optional groups only.",
        "Within HIGH, recency adds weight: last 3 years +6, last 6 years +3, last 9 years +1.",
      ]
    : [
        "ALTO: coincide con grupos necesarios y complementarios.",
        "MEDIO: coincide solo con grupos necesarios.",
        "MINIMO: coincide solo con grupos opcionales.",
        "Dentro del grupo ALTO, la recencia pesa mas: ultimos 3 anos +6, ultimos 6 anos +3, ultimos 9 anos +1.",
      ];
}

function getSearchErrorMessage(language: string | null | undefined, key: "missing" | "none") {
  if (isEnglishLanguage(language)) {
    return key === "missing"
      ? "There is not enough information to search for sources."
      : "No sources could be recovered from OpenAlex or Crossref in this attempt.";
  }

  return key === "missing"
    ? "No hay suficiente informacion para buscar fuentes."
    : "No se pudieron recuperar fuentes desde OpenAlex ni Crossref en este intento.";
}

function formatProviderWarning(
  provider: "OpenAlex" | "Crossref",
  query: string,
  error: unknown,
  language: string | null | undefined,
) {
  const message = isEnglishLanguage(language)
    ? "provider did not respond correctly"
    : getErrorMessage(error);

  return `${provider} (${query}): ${message}`;
}

function buildFallbackMetadata(
  intake: IntakeInput,
  language: string | null | undefined,
): ReferenceSearchV2Metadata {
  const keywordGroups = buildFallbackKeywordGroups(intake);
  const queryPack = buildQueryPack(keywordGroups);
  const normalizedTopic =
    buildSearchQuery(keywordGroups.necessary.map((group) => group.variants[0]).slice(0, 4)) ||
    intake.topic;
  const intentSummary =
    buildSearchQuery([normalizedTopic, keywordGroups.complementary[0]?.variants[0] ?? null]) ||
    intake.topic;
  const focusTerms = uniqueNormalized([
    ...keywordGroups.necessary.flatMap((group) => group.variants),
    ...keywordGroups.complementary.flatMap((group) => group.variants),
  ]).slice(0, 12);

  return {
    planSource: "fallback",
    normalizedTopic,
    intentSummary,
    keywordGroups,
    queryPack,
    focusTerms,
    scoringRules: buildScoringRules(language),
  };
}

function buildPrompt(intake: IntakeInput, language: string | null | undefined) {
  const selectedLanguage = isEnglishLanguage(language) ? "English" : "Spanish";

  return `
You are a senior academic literature retrieval specialist for master's thesis planning.
Your task is to read a structured intake and produce an English-first retrieval plan for OpenAlex.

Context:
- the user is preparing an academic research project
- OpenAlex retrieval usually works better with concise English academic terminology
- the output must remain tightly aligned to the intake
- do not invent facts, methods, populations, devices, or results
- user interface language selected for human-facing labels: ${selectedLanguage}

Goal:
- identify the highest-value keyword groups from the intake
- classify them into necessary, complementary, and optional groups
- each group must contain variant expressions, but do not use OR operators inside queries
- produce queries that choose one variant per group
- prioritize technically useful, recent sources

Keyword group rules:
- necessary: the core concepts that should dominate the first search pass
- complementary: useful refiners that increase precision and quality
- optional: non-essential terms that can be discarded if they add noise
- labels, normalized_topic, and intent_summary must be in the selected user interface language
- variants must be concise English academic search terms

Query pack rules:
- necessary_only: queries using only the necessary groups
- complementary_boosted: queries that add one complementary group to the necessary core
- optional_backups: a few backup queries that remain safe and focused
- each query must be concise and should not use OR, parentheses, or boolean syntax

Return JSON with this exact structure:
- normalized_topic
- intent_summary
- keyword_groups.necessary
- keyword_groups.complementary
- keyword_groups.optional
- query_pack.necessary_only
- query_pack.complementary_boosted
- query_pack.optional_backups
- focus_terms

Intake:
- topic: ${intake.topic}
- problem_context: ${intake.problemContext}
- target_population: ${intake.targetPopulation}
- preferred_methodology: ${intake.preferredMethodology}
- research_line: ${intake.researchLine}
- available_data: ${intake.availableData}
- academic_constraints: ${intake.academicConstraints}
- advisor_notes: ${intake.advisorNotes}
`.trim();
}

function sanitizeKeywordGroups(
  groups: ReferenceSearchPlanSchema["keyword_groups"],
): ReferenceSearchV2Metadata["keywordGroups"] {
  return {
    necessary: groups.necessary.map((group) => buildKeywordGroup(group.label, group.variants)),
    complementary: groups.complementary.map((group) =>
      buildKeywordGroup(group.label, group.variants),
    ),
    optional: groups.optional.map((group) => buildKeywordGroup(group.label, group.variants)),
  };
}

async function buildReferenceSearchMetadata(
  intake: IntakeInput,
  language: string | null | undefined,
): Promise<ReferenceSearchV2Metadata> {
  const fallbackMetadata = buildFallbackMetadata(intake, language);

  try {
    const provider = getConfiguredLlmProvider();
    const generatedPlan = await generateStructuredObjectWithTextFallback<ReferenceSearchPlanSchema>(
      {
        provider,
        prompt: buildPrompt(intake, language),
        schemaName: "reference_search_v2_plan",
        schema: referenceSearchPlanSchema,
      },
    );

    const keywordGroups = sanitizeKeywordGroups(generatedPlan.keyword_groups);
    const queryPack = {
      necessaryOnly: uniqueNormalized(generatedPlan.query_pack.necessary_only).slice(0, 4),
      complementaryBoosted: uniqueNormalized(
        generatedPlan.query_pack.complementary_boosted,
      ).slice(0, 4),
      optionalBackups: uniqueNormalized(generatedPlan.query_pack.optional_backups).slice(0, 3),
    };

    return {
      planSource: "llm",
      normalizedTopic:
        generatedPlan.normalized_topic?.trim() || fallbackMetadata.normalizedTopic,
      intentSummary:
        generatedPlan.intent_summary?.trim() || fallbackMetadata.intentSummary,
      keywordGroups: {
        necessary:
          keywordGroups.necessary.length > 0
            ? keywordGroups.necessary
            : fallbackMetadata.keywordGroups.necessary,
        complementary:
          keywordGroups.complementary.length > 0
            ? keywordGroups.complementary
            : fallbackMetadata.keywordGroups.complementary,
        optional:
          keywordGroups.optional.length > 0
            ? keywordGroups.optional
            : fallbackMetadata.keywordGroups.optional,
      },
      queryPack: {
        necessaryOnly:
          queryPack.necessaryOnly.length > 0
            ? queryPack.necessaryOnly
            : fallbackMetadata.queryPack.necessaryOnly,
        complementaryBoosted:
          queryPack.complementaryBoosted.length > 0
            ? queryPack.complementaryBoosted
            : fallbackMetadata.queryPack.complementaryBoosted,
        optionalBackups:
          queryPack.optionalBackups.length > 0
            ? queryPack.optionalBackups
            : fallbackMetadata.queryPack.optionalBackups,
      },
      focusTerms: uniqueNormalized([
        ...generatedPlan.focus_terms,
        ...fallbackMetadata.focusTerms,
      ]).slice(0, 12),
      scoringRules: fallbackMetadata.scoringRules,
    };
  } catch {
    return fallbackMetadata;
  }
}

function normalizeIntakeForSearch(intake: {
  topic: string;
  problemContext: string | null;
  researchLine: string | null;
  academicConstraints: string | null;
  targetPopulation: string | null;
  availableData: string | null;
  preferredMethodology: string | null;
  advisorNotes: string | null;
}): IntakeInput {
  return {
    topic: intake.topic,
    problemContext: intake.problemContext ?? undefined,
    researchLine: intake.researchLine ?? undefined,
    academicConstraints: intake.academicConstraints ?? undefined,
    targetPopulation: intake.targetPopulation ?? undefined,
    availableData: intake.availableData ?? undefined,
    preferredMethodology: intake.preferredMethodology ?? undefined,
    advisorNotes: intake.advisorNotes ?? undefined,
  };
}

function getRecencyBand(year: number | null, language: string | null | undefined) {
  const currentYear = new Date().getFullYear();

  if (year && year > currentYear + 1) {
    return {
      label: isEnglishLanguage(language) ? "Future or invalid year" : "Ano futuro o invalido",
      bonus: 0,
    };
  }

  if (year && year >= currentYear - 3) {
    return { label: `${currentYear - 3}-${currentYear}`, bonus: 6 };
  }

  if (year && year >= currentYear - 6) {
    return { label: `${currentYear - 6}-${currentYear - 4}`, bonus: 3 };
  }

  if (year && year >= currentYear - 9) {
    return { label: `${currentYear - 9}-${currentYear - 7}`, bonus: 1 };
  }

  return {
    label: isEnglishLanguage(language)
      ? `${currentYear - 10} or earlier`
      : `${currentYear - 10} o anterior`,
    bonus: 0,
  };
}

function findMatchedLabels(
  text: string,
  groups: Array<{ label: string; variants: string[] }>,
) {
  return groups
    .filter((group) =>
      group.variants.some((variant) => text.includes(normalizeTitle(variant))),
    )
    .map((group) => group.label);
}

function buildRelevanceScore(input: {
  title: string;
  abstract: string | null;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
  keywordGroups: ReferenceSearchV2Metadata["keywordGroups"];
  citationCount: number;
  year: number | null;
  hasPdfUrl: boolean;
  language: string | null | undefined;
}) {
  const normalizedText = normalizeTitle([input.title, input.abstract].filter(Boolean).join(" "));
  const necessaryMatches = findMatchedLabels(normalizedText, input.keywordGroups.necessary);
  const complementaryMatches = findMatchedLabels(
    normalizedText,
    input.keywordGroups.complementary,
  );
  const optionalMatches = findMatchedLabels(normalizedText, input.keywordGroups.optional);
  const recency = getRecencyBand(input.year, input.language);
  const citationBonus = Math.min(input.citationCount / 80, 3);
  const abstractBonus = input.abstract?.trim() ? 2.5 : 0;
  const accessBonus = input.hasPdfUrl ? 1.5 : 0;

  let scoreLabel: ReferenceScoreBreakdown["label"] = "BAJO";
  let baseScore = 14;

  if (necessaryMatches.length > 0 && complementaryMatches.length > 0) {
    scoreLabel = "ALTO";
    baseScore =
      60 +
      necessaryMatches.length * 7 +
      complementaryMatches.length * 9 +
      recency.bonus;
  } else if (necessaryMatches.length > 0) {
    scoreLabel = "MEDIO";
    baseScore = 35 + necessaryMatches.length * 8 + Math.min(recency.bonus, 3);
  } else if (optionalMatches.length > 0 && complementaryMatches.length === 0) {
    scoreLabel = "MINIMO";
    baseScore = 8 + optionalMatches.length * 3;
  } else if (complementaryMatches.length > 0) {
    baseScore = 18 + complementaryMatches.length * 5 + Math.min(recency.bonus, 2);
  }

  const queryStageBonus =
    input.matchedQueryStage === "necessary_only"
      ? 2
      : input.matchedQueryStage === "complementary_boosted"
        ? 3
        : 0.5;

  return {
    score: baseScore + citationBonus + abstractBonus + accessBonus + queryStageBonus,
    breakdown: {
      label: scoreLabel,
      necessaryMatches,
      complementaryMatches,
      optionalMatches,
      recencyBand: recency.label,
      recencyBonus: recency.bonus,
      matchedQuery: input.matchedQuery,
      matchedQueryStage: input.matchedQueryStage,
    } satisfies ReferenceScoreBreakdown,
  };
}

function buildDedupKey(result: SearchCandidate) {
  return result.doi
    ? `doi:${result.doi.toLowerCase()}`
    : `title:${normalizeTitle(result.title)}:${result.year ?? "na"}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido.";
}

function buildSuggestedSelectionOrders(input: {
  baseSelectedReferenceIds: string[];
  previousProjectReferenceIds: Set<string>;
  latestReferenceIds: string[];
}) {
  const preservedSelectedIds = input.baseSelectedReferenceIds.filter((referenceId) =>
    input.latestReferenceIds.includes(referenceId),
  );
  const availableSlots = Math.max(0, MAX_SELECTED_REFERENCES - preservedSelectedIds.length);
  const newReferenceIds = input.latestReferenceIds.filter(
    (referenceId) => !input.previousProjectReferenceIds.has(referenceId),
  );
  const suggestedIds =
    preservedSelectedIds.length === 0
      ? input.latestReferenceIds.slice(0, Math.min(3, availableSlots))
      : newReferenceIds.slice(0, Math.min(3, availableSlots));
  const combinedSelection = Array.from(new Set([...preservedSelectedIds, ...suggestedIds])).slice(
    0,
    MAX_SELECTED_REFERENCES,
  );

  return new Map(
    combinedSelection.map((referenceId, index) => [referenceId, index + 1] as const),
  );
}

export async function searchProjectReferencesV2(
  userId: string,
  projectId: string,
  options?: {
    desiredTotal?: number;
    languageOverride?: string | null;
  },
): Promise<SearchProjectReferencesV2Result> {
  const desiredTotal = Math.min(
    Math.max(options?.desiredTotal ?? REFERENCE_BATCH_SIZE, MIN_SELECTED_REFERENCES),
    MAX_SELECTED_REFERENCES,
  );
  const aggregationTarget = Math.max(desiredTotal + 10, 16);
  const [project, user, existingProjectReferences] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
      include: {
        intake: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    }),
    prisma.projectReference.findMany({
      where: { projectId },
      select: {
        referenceId: true,
        selected: true,
        selectedOrder: true,
      },
      orderBy: [{ selectedOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  if (!project || !project.intake) {
    throw new Error("El proyecto no existe o aun no tiene intake.");
  }

  const baseSelectedReferenceIds = existingProjectReferences
    .filter((item) => item.selected)
    .map((item) => item.referenceId);
  const previousProjectReferenceIds = new Set(
    existingProjectReferences.map((item) => item.referenceId),
  );
  const languageContext = resolveLanguageContext({
    userLocale: user?.locale,
    projectLanguage: project.language,
    languageOverride: options?.languageOverride,
  });
  const searchMetadata = await buildReferenceSearchMetadata(
    normalizeIntakeForSearch(project.intake),
    languageContext.activeLanguage,
  );
  const searchQuery = searchMetadata.normalizedTopic;
  const queryStages = [
    {
      stage: "necessary_only" as const,
      queries: searchMetadata.queryPack.necessaryOnly,
    },
    {
      stage: "complementary_boosted" as const,
      queries: searchMetadata.queryPack.complementaryBoosted,
    },
    {
      stage: "optional_backup" as const,
      queries: searchMetadata.queryPack.optionalBackups,
    },
  ];
  const attemptedQueries: string[] = [];

  if (!searchQuery || queryStages.every((entry) => entry.queries.length === 0)) {
    throw new Error(getSearchErrorMessage(languageContext.activeLanguage, "missing"));
  }

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status: ProjectStatus.SEARCHING,
      intake: {
        update: {
          searchQuery,
        },
      },
    },
  });

  const aggregatedResults = new Map<string, SearchCandidate>();
  const attemptSummaries: Array<{ query: string; resultCount: number }> = [];
  const providerBreakdown = {
    openAlex: 0,
    crossref: 0,
  };
  const providerWarnings: string[] = [];
  let openAlexUnavailable = false;

  for (const queryStage of queryStages) {
    for (const attemptQuery of queryStage.queries) {
      attemptedQueries.push(attemptQuery);
      let attemptResults: Awaited<ReturnType<typeof searchOpenAlexWorks>> = [];

      try {
        attemptResults = await searchOpenAlexWorks(attemptQuery);
      } catch (error) {
        providerWarnings.push(
          formatProviderWarning("OpenAlex", attemptQuery, error, languageContext.activeLanguage),
        );
        openAlexUnavailable = true;
      }

      attemptSummaries.push({
        query: attemptQuery,
        resultCount: attemptResults.length,
      });

      if (attemptResults.length === 0) {
        if (openAlexUnavailable) {
          break;
        }

        continue;
      }

      for (const result of attemptResults) {
        const candidate: SearchCandidate = {
          ...result,
          matchedQuery: attemptQuery,
          matchedQueryStage: queryStage.stage,
          rawCrossrefJson: null,
          sourceProvider: Provider.OPENALEX,
        };
        const dedupKey = buildDedupKey(candidate);

        if (!aggregatedResults.has(dedupKey)) {
          aggregatedResults.set(dedupKey, candidate);
          providerBreakdown.openAlex += 1;
        }
      }

      if (aggregatedResults.size >= aggregationTarget) {
        break;
      }

      if (openAlexUnavailable) {
        break;
      }
    }

    if (aggregatedResults.size >= aggregationTarget || openAlexUnavailable) {
      break;
    }
  }

  if (aggregatedResults.size < desiredTotal) {
    for (const queryStage of [...queryStages].reverse()) {
      for (const attemptQuery of [...queryStage.queries].reverse()) {
        let crossrefResults: Awaited<ReturnType<typeof searchCrossrefWorks>> = [];

        try {
          crossrefResults = await searchCrossrefWorks(attemptQuery);
        } catch (error) {
          providerWarnings.push(
            formatProviderWarning("Crossref", attemptQuery, error, languageContext.activeLanguage),
          );
        }

        if (crossrefResults.length === 0) {
          continue;
        }

        for (const result of crossrefResults) {
          const candidate: SearchCandidate = {
            ...result,
            matchedQuery: attemptQuery,
            matchedQueryStage: queryStage.stage,
            normalizedTitle: result.title,
            sourceProvider: Provider.CROSSREF,
          };
          const dedupKey = buildDedupKey(candidate);

          if (!aggregatedResults.has(dedupKey)) {
            aggregatedResults.set(dedupKey, candidate);
            providerBreakdown.crossref += 1;
          }
        }

        if (aggregatedResults.size >= aggregationTarget) {
          break;
        }
      }

      if (aggregatedResults.size >= aggregationTarget) {
        break;
      }
    }
  }

  if (aggregatedResults.size === 0) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status:
          previousProjectReferenceIds.size > 0
            ? ProjectStatus.SOURCES_REVIEW
            : ProjectStatus.INTAKE_READY,
      },
    });

    throw new Error(
      providerWarnings.length > 0
        ? getSearchErrorMessage(languageContext.activeLanguage, "none")
        : isEnglishLanguage(languageContext.activeLanguage)
          ? "No sources were found for this intake."
          : "No se encontraron fuentes para este intake.",
    );
  }

  const candidatePool = Array.from(aggregatedResults.values()).slice(0, aggregationTarget);
  const rankedCandidates: RankedCandidate[] = [];
  let skippedCount = 0;

  for (const result of candidatePool) {
    let crossrefMetadata: CrossrefMessage | null = result.rawCrossrefJson ?? null;

    if (!crossrefMetadata && result.doi) {
      try {
        crossrefMetadata = await fetchCrossrefWorkByDoi(result.doi);
      } catch {
        crossrefMetadata = null;
      }
    }

    const resolvedTitle = result.title?.trim() || resolveCrossrefTitle(crossrefMetadata);
    const normalizedCandidateTitle = normalizeTitle(resolvedTitle);

    if (!resolvedTitle || !normalizedCandidateTitle) {
      skippedCount += 1;
      continue;
    }

    const resolvedAuthors =
      crossrefMetadata?.author?.map((author) =>
        [author.given, author.family].filter(Boolean).join(" "),
      ) ?? result.authors;
    const resolvedAbstract = crossrefMetadata?.abstract ?? result.abstract;
    const resolvedVenue = crossrefMetadata?.publisher ?? result.venue;
    const resolvedYear =
      crossrefMetadata?.issued?.["date-parts"]?.[0]?.[0] ?? result.year;
    const resolvedWorkType = crossrefMetadata?.type ?? result.workType;
    const resolvedLandingPageUrl = crossrefMetadata?.URL ?? result.landingPageUrl;
    const quality = evaluateReferenceQuality({
      title: resolvedTitle,
      sourceProvider: result.sourceProvider,
      year: resolvedYear,
      authors: resolvedAuthors,
      abstract: resolvedAbstract,
      venue: resolvedVenue,
      doi: result.doi,
      landingPageUrl: resolvedLandingPageUrl,
      citationCount: result.citationCount,
      rawOpenAlexJson: result.rawOpenAlexJson,
      rawCrossrefJson: crossrefMetadata,
    });

    if (!quality.accepted) {
      skippedCount += 1;
      continue;
    }

    const accessSignals = extractAccessSignals({
      rawOpenAlexJson: result.rawOpenAlexJson,
      rawCrossrefJson: crossrefMetadata,
      landingPageUrl: resolvedLandingPageUrl,
      doi: result.doi,
    });
    const pdfAccessible = await verifyPdfAccess(accessSignals.pdfUrl);
    const relevance = buildRelevanceScore({
      title: resolvedTitle,
      abstract: resolvedAbstract,
      matchedQuery: result.matchedQuery,
      matchedQueryStage: result.matchedQueryStage,
      keywordGroups: searchMetadata.keywordGroups,
      citationCount: result.citationCount,
      year: resolvedYear,
      hasPdfUrl: pdfAccessible,
      language: languageContext.activeLanguage,
    });

    rankedCandidates.push({
      candidate: result,
      resolvedTitle,
      normalizedTitle: normalizedCandidateTitle,
      authors: resolvedAuthors,
      abstract: resolvedAbstract,
      venue: resolvedVenue,
      year: resolvedYear,
      workType: resolvedWorkType,
      landingPageUrl: resolvedLandingPageUrl,
      citationCount: result.citationCount,
      crossrefMetadata,
      score: relevance.score,
      scoreBreakdown: relevance.breakdown,
      pdfUrl: pdfAccessible ? accessSignals.pdfUrl : null,
      pdfAccessible,
    });
  }

  if (rankedCandidates.length === 0) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status:
          previousProjectReferenceIds.size > 0
            ? ProjectStatus.SOURCES_REVIEW
            : ProjectStatus.INTAKE_READY,
      },
    });

    throw new Error(
      isEnglishLanguage(languageContext.activeLanguage)
        ? "Recovered candidates did not pass the academic source quality checks."
        : "Los candidatos recuperados no pasaron los controles de calidad academica.",
    );
  }

  const selectedCandidates = rankedCandidates
    .sort((left, right) => right.score - left.score)
    .slice(0, desiredTotal);

  let createdCount = 0;
  let updatedCount = 0;
  const persistedResults: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceScoreBreakdown;
    pdfUrl: string | null;
    pdfAccessible: boolean;
  }> = [];

  for (const ranked of selectedCandidates) {
    const result = ranked.candidate;
    const lookupKeys: Array<{ doi: string } | { openAlexId: string }> = [];

    if (result.doi) {
      lookupKeys.push({ doi: result.doi });
    }

    if (result.openAlexId) {
      lookupKeys.push({ openAlexId: result.openAlexId });
    }

    const existingReference = await prisma.reference.findFirst({
      where:
        lookupKeys.length > 1
          ? { OR: lookupKeys }
          : lookupKeys.length === 1
            ? lookupKeys[0]
            : {
                normalizedTitle: ranked.normalizedTitle,
                year: ranked.year ?? undefined,
              },
    });

    const reference = existingReference
      ? await prisma.reference.update({
          where: { id: existingReference.id },
          data: {
            doi: result.doi ?? existingReference.doi,
            openAlexId: result.openAlexId,
            crossrefId: ranked.crossrefMetadata?.DOI ?? existingReference.crossrefId,
            title: ranked.resolvedTitle,
            normalizedTitle: ranked.normalizedTitle,
            authorsJson: ranked.authors,
            abstract: ranked.abstract,
            venue: ranked.venue,
            year: ranked.year ?? existingReference.year,
            workType: ranked.workType,
            landingPageUrl: ranked.landingPageUrl,
            citationCount: ranked.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson:
              (ranked.crossrefMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        })
      : await prisma.reference.create({
          data: {
            doi: result.doi,
            openAlexId: result.openAlexId,
            crossrefId: ranked.crossrefMetadata?.DOI ?? null,
            title: ranked.resolvedTitle,
            normalizedTitle: ranked.normalizedTitle,
            authorsJson: ranked.authors,
            abstract: ranked.abstract,
            venue: ranked.venue,
            year: ranked.year,
            workType: ranked.workType,
            landingPageUrl: ranked.landingPageUrl,
            citationCount: ranked.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson:
              (ranked.crossrefMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });

    if (existingReference) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    await prisma.projectReference.upsert({
      where: {
        projectId_referenceId: {
          projectId: project.id,
          referenceId: reference.id,
        },
      },
      update: {
        sourceProvider: result.sourceProvider,
        relevanceScore: ranked.score,
      },
      create: {
        projectId: project.id,
        referenceId: reference.id,
        sourceProvider: result.sourceProvider,
        relevanceScore: ranked.score,
      },
    });

    persistedResults.push({
      referenceId: reference.id,
      relevanceScore: ranked.score,
      scoreBreakdown: ranked.scoreBreakdown,
      pdfUrl: ranked.pdfUrl,
      pdfAccessible: ranked.pdfAccessible,
    });
  }

  const suggestedSelectionOrders = buildSuggestedSelectionOrders({
    baseSelectedReferenceIds,
    previousProjectReferenceIds,
    latestReferenceIds: persistedResults.map((item) => item.referenceId),
  });

  const projectReferenceCount = await prisma.projectReference.count({
    where: { projectId: project.id },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status:
        projectReferenceCount > 0
          ? ProjectStatus.SOURCES_REVIEW
          : ProjectStatus.INTAKE_READY,
    },
  });

  const searchSnapshot: ProjectReferenceSearchSnapshot = {
    referenceSearchVersion: "v2",
    savedAt: new Date().toISOString(),
    searchQuery,
    attemptedQueries,
    totalResults: persistedResults.length,
    providerBreakdown,
    baseSelectedReferenceIds,
    metadata: {
      ...searchMetadata,
      providerWarnings: providerWarnings.slice(0, 8),
    },
    references: persistedResults.map((item) => ({
      referenceId: item.referenceId,
      relevanceScore: item.relevanceScore,
      scoreBreakdown: item.scoreBreakdown,
      suggestedSelectedOrder: suggestedSelectionOrders.get(item.referenceId) ?? null,
      pdfUrl: item.pdfUrl,
      pdfAccessible: item.pdfAccessible,
    })),
  };

  await logAuditEvent({
    eventType: "SEARCH_COMPLETED",
    actorType: "SYSTEM",
    provider: Provider.OPENALEX,
    userId,
    projectId: project.id,
    payloadJson: {
      referenceSearchVersion: "v2",
      searchQuery,
      searchIntent: searchMetadata.intentSummary,
      languageContext,
      attemptedQueries,
      attempts: attemptSummaries,
      candidatePoolSize: candidatePool.length,
      resultCount: persistedResults.length,
      createdCount,
      updatedCount,
      skippedCount,
      providerBreakdown,
      providerWarnings: providerWarnings.slice(0, 8),
      searchSnapshot,
    },
  });

  return {
    searchQuery,
    attemptedQueries,
    totalResults: persistedResults.length,
    createdCount,
    updatedCount,
    providerBreakdown,
    searchSnapshot,
  };
}

export async function getLatestProjectReferenceSearchSnapshot(projectId: string) {
  const latestSearchAudit = await prisma.auditLog.findFirst({
    where: {
      projectId,
      eventType: "SEARCH_COMPLETED",
    },
    orderBy: { createdAt: "desc" },
    select: { payloadJson: true },
  });

  const payload = latestSearchAudit?.payloadJson as
    | { searchSnapshot?: ProjectReferenceSearchSnapshot; referenceSearchVersion?: string }
    | null
    | undefined;

  if (payload?.referenceSearchVersion !== "v2") {
    return null;
  }

  return payload.searchSnapshot ?? null;
}
