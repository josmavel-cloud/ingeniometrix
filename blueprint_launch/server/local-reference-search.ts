import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import { normalizeTitle } from "@/lib/text";
import type { IntakeInput } from "@/server/projects/project-validation";
import {
  extractAccessSignals,
  verifyPdfAccess,
} from "@/server/retrieval/reference-access";
import { searchCrossrefWorks } from "@/server/retrieval/crossref-client";
import { searchOpenAlexWorks } from "@/server/retrieval/openalex-client";
import type {
  BlueprintLaunchReferenceListItem,
  BlueprintLaunchReferenceScoreBreakdown,
  BlueprintLaunchSearchMetadata,
  BlueprintLaunchSearchSnapshot,
} from "@/blueprint_launch/server/local-playground-store";
import { buildBlueprintLaunchSearchMetadata } from "@/blueprint_launch/server/reference-search-lab";

type SearchCandidate = {
  sourceId: string;
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
  pdfUrl: string | null;
  matchedQuery: string;
  matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
};

function getRecencyBand(year: number | null) {
  const currentYear = new Date().getFullYear();

  if (year && year >= currentYear - 3) {
    return { label: "2023-2026", bonus: 6 };
  }

  if (year && year >= currentYear - 6) {
    return { label: "2020-2022", bonus: 3 };
  }

  if (year && year >= currentYear - 9) {
    return { label: "2017-2019", bonus: 1 };
  }

  return { label: "2016 o anterior", bonus: 0 };
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
  keywordGroups: BlueprintLaunchSearchMetadata["keywordGroups"];
  citationCount: number;
  year: number | null;
  hasPdfUrl: boolean;
}): { score: number; breakdown: BlueprintLaunchReferenceScoreBreakdown } {
  const normalizedText = normalizeTitle([input.title, input.abstract].filter(Boolean).join(" "));
  const necessaryMatches = findMatchedLabels(normalizedText, input.keywordGroups.necessary);
  const complementaryMatches = findMatchedLabels(
    normalizedText,
    input.keywordGroups.complementary,
  );
  const optionalMatches = findMatchedLabels(normalizedText, input.keywordGroups.optional);
  const recency = getRecencyBand(input.year);
  const citationBonus = Math.min(input.citationCount / 80, 3);
  const abstractBonus = input.abstract?.trim() ? 2.5 : 0;
  const accessBonus = input.hasPdfUrl ? 1.5 : 0;

  let scoreLabel: BlueprintLaunchReferenceScoreBreakdown["label"] = "BAJO";
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
    },
  };
}

export async function searchBlueprintLaunchReferences(input: {
  intake: IntakeInput;
  knowledgeAreaLabel: string | null;
  desiredTotal?: number;
  searchMetadataOverride?: BlueprintLaunchSearchMetadata;
}): Promise<BlueprintLaunchSearchSnapshot> {
  const desiredTotal = Math.min(
    Math.max(input.desiredTotal ?? REFERENCE_BATCH_SIZE, MIN_SELECTED_REFERENCES),
    MAX_SELECTED_REFERENCES,
  );
  const aggregationTarget = Math.max(desiredTotal + 10, 16);
  const intake = input.intake;

  const searchMetadata =
    input.searchMetadataOverride ??
    (await buildBlueprintLaunchSearchMetadata({
      intake,
      knowledgeAreaLabel: input.knowledgeAreaLabel,
    }));
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
    throw new Error("No hay suficiente informacion para buscar fuentes.");
  }

  const aggregatedResults = new Map<string, SearchCandidate>();

  function buildDedupKey(result: SearchCandidate) {
    return result.doi
      ? `doi:${result.doi.toLowerCase()}`
      : `title:${normalizeTitle(result.title)}:${result.year ?? "na"}`;
  }

  for (const queryStage of queryStages) {
    for (const attemptQuery of queryStage.queries) {
      attemptedQueries.push(attemptQuery);
      const attemptResults = await searchOpenAlexWorks(attemptQuery);

      for (const result of attemptResults) {
        const candidate: SearchCandidate = {
          sourceId: result.openAlexId ?? `${attemptQuery}-${result.title ?? "untitled"}`,
          doi: result.doi,
          title: result.title,
          normalizedTitle: result.normalizedTitle,
          language: result.language ?? null,
          authors: result.authors,
          abstract: result.abstract,
          venue: result.venue,
          year: result.year,
          workType: result.workType,
        landingPageUrl: result.landingPageUrl,
        citationCount: result.citationCount,
        pdfUrl: extractAccessSignals({
          rawOpenAlexJson: result.rawOpenAlexJson,
          landingPageUrl: result.landingPageUrl,
          doi: result.doi,
        }).pdfUrl,
        matchedQuery: attemptQuery,
        matchedQueryStage: queryStage.stage,
      };
        const dedupKey = buildDedupKey(candidate);

        if (!aggregatedResults.has(dedupKey)) {
          aggregatedResults.set(dedupKey, candidate);
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

  if (aggregatedResults.size < desiredTotal) {
    for (const queryStage of [...queryStages].reverse()) {
      for (const attemptQuery of [...queryStage.queries].reverse()) {
        const crossrefResults = await searchCrossrefWorks(attemptQuery);

        for (const result of crossrefResults) {
          const candidate: SearchCandidate = {
            sourceId: result.doi ?? `${attemptQuery}-${result.title ?? "untitled"}`,
            doi: result.doi,
            title: result.title,
            normalizedTitle: result.title,
            language: null,
            authors: result.authors,
            abstract: result.abstract,
            venue: result.venue,
            year: result.year,
            workType: result.workType,
            landingPageUrl: result.landingPageUrl,
            citationCount: result.citationCount,
            pdfUrl: null,
            matchedQuery: attemptQuery,
            matchedQueryStage: queryStage.stage,
          };
          const dedupKey = buildDedupKey(candidate);

          if (!aggregatedResults.has(dedupKey)) {
            aggregatedResults.set(dedupKey, candidate);
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

  const rankedResults = Array.from(aggregatedResults.values())
    .filter((result) => Boolean(result.title?.trim()))
    .map((result) => ({
      result,
      title: result.title?.trim() ?? "Sin titulo",
      relevance: buildRelevanceScore({
        title: result.title?.trim() ?? "Sin titulo",
        abstract: result.abstract,
        matchedQuery: result.matchedQuery,
        matchedQueryStage: result.matchedQueryStage,
        keywordGroups: searchMetadata.keywordGroups,
        citationCount: result.citationCount,
        year: result.year,
        hasPdfUrl: Boolean(result.pdfUrl),
      }),
    }))
    .sort((left, right) => right.relevance.score - left.relevance.score)
    .slice(0, desiredTotal);

  const references: BlueprintLaunchReferenceListItem[] = await Promise.all(
    rankedResults.map(async ({ result, title, relevance }, index) => {
      const pdfAccessible = await verifyPdfAccess(result.pdfUrl);

      return {
        id: `local-${index + 1}-${normalizeTitle(title).slice(0, 32)}`,
        selected: false,
        selectedOrder: null,
        relevanceScore: relevance.score,
        scoreBreakdown: relevance.breakdown,
        reference: {
          id: result.sourceId,
          title,
          translatedTitle: null,
          doi: result.doi,
          year: result.year,
          venue: result.venue,
          abstract: result.abstract,
          translatedAbstract: null,
          landingPageUrl: result.landingPageUrl,
          authorsJson: result.authors,
          sourceLanguage: result.language ?? null,
          displayLanguage: "es",
          hasAutoTranslation: false,
          pdfUrl: result.pdfUrl,
          pdfAccessible,
        },
      };
    }),
  );

  return {
    savedAt: new Date().toISOString(),
    searchQuery,
    attemptedQueries,
    totalResults: references.length,
    metadata: searchMetadata,
    references,
  };
}
