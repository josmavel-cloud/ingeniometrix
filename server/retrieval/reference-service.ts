import { Prisma, ProjectStatus, Provider } from "@prisma/client";

import { resolveLanguageContext } from "@/lib/language";
import {
  buildSearchQuery,
  extractSearchTerms,
  normalizeTitle,
} from "@/lib/text";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";

import {
  type CrossrefMessage,
  fetchCrossrefWorkByDoi,
  resolveCrossrefTitle,
  searchCrossrefWorks,
} from "./crossref-client";
import {
  ensureReferenceTranslationsForLanguage,
  getCachedTranslation,
  resolveReferenceSourceLanguage,
} from "./reference-translation-service";
import { buildReferenceSearchPlan } from "./search-query-planner";
import { searchOpenAlexWorks } from "./openalex-client";

type SearchProjectReferencesResult = {
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  createdCount: number;
  updatedCount: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
};

type SearchCandidate = {
  sourceProvider: Provider;
  matchedQuery: string;
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

function buildRelevanceScore(input: {
  title: string;
  abstract: string | null;
  intentSummary: string;
  matchedQuery: string;
  focusTerms: string[];
  topic: string;
  problemContext: string | null;
  targetPopulation: string | null;
  citationCount: number;
  year: number | null;
}) {
  const normalizedTitleText = normalizeTitle(input.title);
  const normalizedAbstractText = normalizeTitle(input.abstract);
  const titleTerms = extractSearchTerms(input.title, { maxTerms: 12, minLength: 3 });
  const titleTermSet = new Set(titleTerms);
  const titleHitCount = input.focusTerms.reduce(
    (total, term) => total + (titleTermSet.has(term) ? 1 : 0),
    0,
  );
  const abstractHitCount = input.focusTerms.reduce(
    (total, term) => total + (normalizedAbstractText.includes(term) ? 1 : 0),
    0,
  );
  const topicTerms = extractSearchTerms(input.topic, { maxTerms: 6, minLength: 4 });
  const topicHitCount = topicTerms.reduce(
    (total, term) =>
      total +
      (normalizedTitleText.includes(term) || normalizedAbstractText.includes(term) ? 1 : 0),
    0,
  );
  const problemTerms = extractSearchTerms(input.problemContext ?? "", {
    maxTerms: 5,
    minLength: 4,
  });
  const problemHitCount = problemTerms.reduce(
    (total, term) =>
      total +
      (normalizedTitleText.includes(term) || normalizedAbstractText.includes(term) ? 1 : 0),
    0,
  );
  const populationTerms = extractSearchTerms(input.targetPopulation ?? "", {
    maxTerms: 4,
    minLength: 4,
  });
  const populationHitCount = populationTerms.reduce(
    (total, term) =>
      total +
      (normalizedTitleText.includes(term) || normalizedAbstractText.includes(term) ? 1 : 0),
    0,
  );
  const matchedQueryTerms = extractSearchTerms(input.matchedQuery, {
    maxTerms: 8,
    minLength: 3,
  });
  const matchedQueryHitCount = matchedQueryTerms.reduce(
    (total, term) =>
      total +
      (normalizedTitleText.includes(term) || normalizedAbstractText.includes(term) ? 1 : 0),
    0,
  );
  const intentTerms = extractSearchTerms(input.intentSummary, {
    maxTerms: 8,
    minLength: 3,
  });
  const intentHitCount = intentTerms.reduce(
    (total, term) =>
      total +
      (normalizedTitleText.includes(term) || normalizedAbstractText.includes(term) ? 1 : 0),
    0,
  );
  const yearBonus =
    input.year && input.year >= new Date().getFullYear() - 5 ? 1 : 0;
  const citationBonus = Math.min(input.citationCount / 50, 2);

  return (
    titleHitCount * 2.5 +
    abstractHitCount * 1.4 +
    topicHitCount * 1.8 +
    problemHitCount * 1.3 +
    populationHitCount * 1.2 +
    matchedQueryHitCount +
    intentHitCount * 1.1 +
    yearBonus +
    citationBonus
  );
}

export async function searchProjectReferences(
  userId: string,
  projectId: string,
  options?: {
    desiredTotal?: number;
  },
): Promise<SearchProjectReferencesResult> {
  const desiredTotal = Math.min(
    Math.max(options?.desiredTotal ?? REFERENCE_BATCH_SIZE, MIN_SELECTED_REFERENCES),
    MAX_SELECTED_REFERENCES,
  );
  const aggregationTarget = Math.min(desiredTotal + 2, MAX_SELECTED_REFERENCES + 2);
  const [project, user] = await Promise.all([
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
  ]);

  if (!project || !project.intake) {
    throw new Error("El proyecto no existe o aun no tiene intake.");
  }

  const languageContext = resolveLanguageContext({
    userLocale: user?.locale,
    projectLanguage: project.language,
  });
  const searchPlan = await buildReferenceSearchPlan({
    activeLanguage: languageContext.activeLanguage,
    topic: project.intake.topic,
    problemContext: project.intake.problemContext,
    targetPopulation: project.intake.targetPopulation,
    preferredMethodology: project.intake.preferredMethodology,
    program: project.program,
    researchLine: project.intake.researchLine,
  });
  const searchQuery = searchPlan.normalizedTopic || buildSearchQuery([
    project.intake.topic,
    project.intake.problemContext,
    project.program,
  ]);
  const searchAttempts = searchPlan.searchQueries;

  if (!searchQuery || searchAttempts.length === 0) {
    throw new Error("No hay suficiente informacion para buscar fuentes.");
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

  const aggregatedResults = new Map<
    string,
    SearchCandidate
  >();
  const attemptSummaries: Array<{ query: string; resultCount: number }> = [];
  const providerBreakdown = {
    openAlex: 0,
    crossref: 0,
  };

  function buildDedupKey(result: SearchCandidate) {
    return result.doi
      ? `doi:${result.doi.toLowerCase()}`
      : `title:${normalizeTitle(result.title)}:${result.year ?? "na"}`;
  }

  for (const attemptQuery of searchAttempts) {
    const attemptResults = await searchOpenAlexWorks(attemptQuery);
    attemptSummaries.push({
      query: attemptQuery,
      resultCount: attemptResults.length,
    });

    for (const result of attemptResults) {
      const candidate: SearchCandidate = {
        ...result,
        matchedQuery: attemptQuery,
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
  }

  if (aggregatedResults.size < desiredTotal) {
    const crossrefAttempts = [...searchAttempts].reverse();

    for (const attemptQuery of crossrefAttempts) {
      const crossrefResults = await searchCrossrefWorks(attemptQuery);

      for (const result of crossrefResults) {
        const candidate: SearchCandidate = {
          ...result,
          matchedQuery: attemptQuery,
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
  }

  const openAlexResults = Array.from(aggregatedResults.values()).slice(0, desiredTotal);

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const result of openAlexResults) {
    let crossrefMetadata: CrossrefMessage | null = result.rawCrossrefJson ?? null;

    if (!crossrefMetadata && result.doi) {
      try {
        crossrefMetadata = await fetchCrossrefWorkByDoi(result.doi);
      } catch {
        crossrefMetadata = null;
      }
    }

    const resolvedTitle =
      result.title?.trim() || resolveCrossrefTitle(crossrefMetadata);
    const normalizedTitle = normalizeTitle(resolvedTitle);

    if (!resolvedTitle || !normalizedTitle) {
      skippedCount += 1;
      continue;
    }

    const lookupKeys: Array<{ doi: string } | { openAlexId: string }> = [];

    if (result.doi) {
      lookupKeys.push({ doi: result.doi });
    }

    if (result.openAlexId) {
      lookupKeys.push({ openAlexId: result.openAlexId });
    }

    const existingReference = await prisma.reference.findFirst({
      where: lookupKeys.length > 1
        ? {
            OR: lookupKeys,
          }
        : lookupKeys.length === 1
          ? lookupKeys[0]
        : {
            normalizedTitle,
            year: result.year ?? undefined,
          },
    });

    const reference = existingReference
      ? await prisma.reference.update({
          where: { id: existingReference.id },
          data: {
            doi: result.doi ?? existingReference.doi,
            openAlexId: result.openAlexId,
            crossrefId: crossrefMetadata?.DOI ?? existingReference.crossrefId,
            title: resolvedTitle,
            normalizedTitle,
            authorsJson:
              crossrefMetadata?.author?.map((author) =>
                [author.given, author.family].filter(Boolean).join(" "),
              ) ?? result.authors,
            abstract: crossrefMetadata?.abstract ?? result.abstract,
            venue: crossrefMetadata?.publisher ?? result.venue,
            year:
              crossrefMetadata?.issued?.["date-parts"]?.[0]?.[0] ??
              result.year ??
              existingReference.year,
            workType: crossrefMetadata?.type ?? result.workType,
            landingPageUrl: crossrefMetadata?.URL ?? result.landingPageUrl,
            citationCount: result.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson: (crossrefMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        })
      : await prisma.reference.create({
          data: {
            doi: result.doi,
            openAlexId: result.openAlexId,
            crossrefId: crossrefMetadata?.DOI ?? null,
            title: resolvedTitle,
            normalizedTitle,
            authorsJson:
              crossrefMetadata?.author?.map((author) =>
                [author.given, author.family].filter(Boolean).join(" "),
              ) ?? result.authors,
            abstract: crossrefMetadata?.abstract ?? result.abstract,
            venue: crossrefMetadata?.publisher ?? result.venue,
            year:
              crossrefMetadata?.issued?.["date-parts"]?.[0]?.[0] ?? result.year,
            workType: crossrefMetadata?.type ?? result.workType,
            landingPageUrl: crossrefMetadata?.URL ?? result.landingPageUrl,
            citationCount: result.citationCount,
            rawOpenAlexJson: (result.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            rawCrossrefJson: (crossrefMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
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
        relevanceScore: buildRelevanceScore({
          title: reference.title,
          abstract: reference.abstract,
          intentSummary: searchPlan.intentSummary,
          matchedQuery: result.matchedQuery,
          focusTerms: searchPlan.focusTerms,
          topic: project.intake.topic,
          problemContext: project.intake.problemContext,
          targetPopulation: project.intake.targetPopulation,
          citationCount: reference.citationCount ?? 0,
          year: reference.year,
        }),
      },
      create: {
        projectId: project.id,
        referenceId: reference.id,
        sourceProvider: result.sourceProvider,
        relevanceScore: buildRelevanceScore({
          title: reference.title,
          abstract: reference.abstract,
          intentSummary: searchPlan.intentSummary,
          matchedQuery: result.matchedQuery,
          focusTerms: searchPlan.focusTerms,
          topic: project.intake.topic,
          problemContext: project.intake.problemContext,
          targetPopulation: project.intake.targetPopulation,
          citationCount: reference.citationCount ?? 0,
          year: reference.year,
        }),
      },
    });
  }

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

  await logAuditEvent({
    eventType: "SEARCH_COMPLETED",
    actorType: "SYSTEM",
    provider: Provider.OPENALEX,
    userId,
    projectId: project.id,
    payloadJson: {
      searchQuery,
      searchIntent: searchPlan.intentSummary,
      languageContext,
      attemptedQueries: searchAttempts,
      attempts: attemptSummaries,
      resultCount: openAlexResults.length,
      createdCount,
      updatedCount,
      skippedCount,
      providerBreakdown,
    },
  });

  return {
    searchQuery,
    attemptedQueries: searchAttempts,
    totalResults: openAlexResults.length,
    createdCount,
    updatedCount,
    providerBreakdown,
  };
}

export async function listProjectReferences(userId: string, projectId: string) {
  const [project, user, references] = await Promise.all([
    prisma.project.findFirst({
      where: {
        id: projectId,
        userId,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    }),
    prisma.projectReference.findMany({
      where: { projectId },
      orderBy: [{ relevanceScore: "desc" }, { createdAt: "desc" }],
      take: MAX_SELECTED_REFERENCES,
      include: {
        reference: true,
      },
    }),
  ]);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const languageContext = resolveLanguageContext({
    userLocale: user?.locale,
    projectLanguage: project.language,
  });
  const translations = await ensureReferenceTranslationsForLanguage({
    references: references.map((item) => ({
      id: item.reference.id,
      title: item.reference.title,
      abstract: item.reference.abstract,
      rawOpenAlexJson: item.reference.rawOpenAlexJson,
    })),
    targetLanguage: languageContext.activeLanguage,
  });

  return references.map((item) => {
    const sourceLanguage = resolveReferenceSourceLanguage({
      id: item.reference.id,
      title: item.reference.title,
      abstract: item.reference.abstract,
      rawOpenAlexJson: item.reference.rawOpenAlexJson,
    });
    const cachedTranslation =
      translations.get(item.reference.id) ??
      getCachedTranslation(item.reference.rawOpenAlexJson, languageContext.activeLanguage);

    return {
      ...item,
      reference: {
        ...item.reference,
        sourceLanguage,
        displayLanguage: languageContext.activeLanguage,
        translatedTitle: cachedTranslation?.translatedTitle ?? null,
        translatedAbstract: cachedTranslation?.translatedAbstract ?? null,
        hasAutoTranslation: Boolean(
          cachedTranslation?.translatedTitle || cachedTranslation?.translatedAbstract,
        ),
      },
    };
  });
}

export async function updateSelectedProjectReferences(
  userId: string,
  projectId: string,
  selectedReferenceIds: string[],
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectReference.updateMany({
      where: { projectId },
      data: {
        selected: false,
        selectedOrder: null,
      },
    });

    for (const [index, referenceId] of selectedReferenceIds.entries()) {
      await tx.projectReference.updateMany({
        where: {
          projectId,
          referenceId,
        },
        data: {
          selected: true,
          selectedOrder: index + 1,
        },
      });
    }

    await tx.project.update({
      where: { id: projectId },
      data: {
        status:
          selectedReferenceIds.length >= MIN_SELECTED_REFERENCES &&
          selectedReferenceIds.length <= MAX_SELECTED_REFERENCES
            ? ProjectStatus.SOURCES_SELECTED
            : ProjectStatus.SOURCES_REVIEW,
      },
    });
  });

  await logAuditEvent({
    eventType: "REFERENCES_SELECTED",
    actorType: "USER",
    provider: Provider.SYSTEM,
    userId,
    projectId,
    payloadJson: {
      selectedReferenceIds,
      selectedCount: selectedReferenceIds.length,
    },
  });
}
