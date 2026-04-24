import { prisma } from "@/lib/prisma";
import { PROJECT_CAREERS } from "@/lib/project-presets";
import { getTopicAreaLabel, normalizeSearchText } from "@/lib/topic-suggestion-scoring";
import { normalizeTopicAreaSemantically } from "@/server/projects/topic-area-normalizer";

type TopicAreaSuggestion = {
  label: string;
  canonicalAreaId: string | null;
  canonicalAreaLabel: string | null;
  source: "catalog" | "custom";
};

type ResolveTopicAreaInput = {
  topicAreaId?: string | null;
  topicAreaLabel?: string | null;
};

type TopicAreaMatchConfidence = "high" | "medium" | "low";

function getCatalogCareerById(careerId: string | null | undefined) {
  if (!careerId) {
    return null;
  }

  return PROJECT_CAREERS.find((career) => career.id === careerId) ?? null;
}

function findBestCareerMatch(label: string | null | undefined) {
  const normalizedLabel = normalizeSearchText(label ?? "");

  if (!normalizedLabel) {
    return null;
  }

  const exactMatch =
    PROJECT_CAREERS.find(
      (career) => normalizeSearchText(career.label) === normalizedLabel,
    ) ?? null;

  if (exactMatch) {
    return exactMatch;
  }

  const inputTokens = normalizedLabel.split(" ").filter((token) => token.length >= 3);

  let bestMatch: (typeof PROJECT_CAREERS)[number] | null = null;
  let bestScore = 0;

  for (const career of PROJECT_CAREERS) {
    const normalizedCareerLabel = normalizeSearchText(career.label);

    if (normalizedCareerLabel.includes(normalizedLabel) || normalizedLabel.includes(normalizedCareerLabel)) {
      return career;
    }

    const score = inputTokens.reduce((total, token) => {
      return total + (normalizedCareerLabel.includes(token) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestMatch = career;
      bestScore = score;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

function evaluateCareerMatch(label: string | null | undefined) {
  const normalizedLabel = normalizeSearchText(label ?? "");

  if (!normalizedLabel) {
    return {
      career: null,
      confidence: "low" as TopicAreaMatchConfidence,
    };
  }

  const exactMatch =
    PROJECT_CAREERS.find(
      (career) => normalizeSearchText(career.label) === normalizedLabel,
    ) ?? null;

  if (exactMatch) {
    return {
      career: exactMatch,
      confidence: "high" as TopicAreaMatchConfidence,
    };
  }

  const partialMatch = findBestCareerMatch(label);

  if (!partialMatch) {
    return {
      career: null,
      confidence: "low" as TopicAreaMatchConfidence,
    };
  }

  const normalizedCareerLabel = normalizeSearchText(partialMatch.label);

  if (
    normalizedCareerLabel.includes(normalizedLabel) ||
    normalizedLabel.includes(normalizedCareerLabel)
  ) {
    return {
      career: partialMatch,
      confidence: "medium" as TopicAreaMatchConfidence,
    };
  }

  return {
    career: partialMatch,
    confidence: "low" as TopicAreaMatchConfidence,
  };
}

function toTopicAreaSuggestion(input: {
  label: string;
  canonicalAreaId?: string | null;
  canonicalAreaLabel?: string | null;
  source: "catalog" | "custom";
}) {
  return {
    label: input.label,
    canonicalAreaId: input.canonicalAreaId ?? null,
    canonicalAreaLabel: input.canonicalAreaLabel ?? null,
    source: input.source,
  } satisfies TopicAreaSuggestion;
}

async function persistTopicAreaEntry(input: {
  displayLabel: string;
  catalogCareer?: (typeof PROJECT_CAREERS)[number] | null;
}) {
  const normalizedLabel = normalizeSearchText(input.displayLabel);

  await prisma.topicAreaCatalogEntry.upsert({
    where: {
      normalizedLabel,
    },
    update: {
      displayLabel: input.displayLabel,
      canonicalAreaId: input.catalogCareer?.id ?? null,
      canonicalAreaLabel: input.catalogCareer?.label ?? null,
      usageCount: {
        increment: 1,
      },
    },
    create: {
      normalizedLabel,
      displayLabel: input.displayLabel,
      canonicalAreaId: input.catalogCareer?.id ?? null,
      canonicalAreaLabel: input.catalogCareer?.label ?? null,
      usageCount: 1,
    },
  });

  return {
    topicAreaId: input.catalogCareer?.id ?? null,
    topicAreaLabel: input.catalogCareer?.label ?? input.displayLabel,
  };
}

export async function listTopicAreaSuggestions(query?: string) {
  const normalizedQuery = normalizeSearchText(query ?? "");
  const catalogSuggestions = PROJECT_CAREERS.filter((career) => {
    if (!normalizedQuery) {
      return true;
    }

    return normalizeSearchText(career.label).includes(normalizedQuery);
  }).map((career) =>
    toTopicAreaSuggestion({
      label: career.label,
      canonicalAreaId: career.id,
      canonicalAreaLabel: career.label,
      source: "catalog",
    }),
  );

  const customEntries = await prisma.topicAreaCatalogEntry.findMany({
    where: normalizedQuery
      ? {
          OR: [
            {
              normalizedLabel: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
            {
              displayLabel: {
                contains: query?.trim() ?? "",
                mode: "insensitive",
              },
            },
            {
              canonicalAreaLabel: {
                contains: query?.trim() ?? "",
                mode: "insensitive",
              },
            },
          ],
        }
      : undefined,
    orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    take: 8,
  });

  const merged = new Map<string, TopicAreaSuggestion>();

  for (const suggestion of catalogSuggestions) {
    merged.set(normalizeSearchText(suggestion.label), suggestion);
  }

  for (const entry of customEntries) {
    const label = entry.canonicalAreaLabel ?? entry.displayLabel;
    const key = normalizeSearchText(label);

    if (!merged.has(key)) {
      merged.set(
        key,
        toTopicAreaSuggestion({
          label,
          canonicalAreaId: entry.canonicalAreaId,
          canonicalAreaLabel: entry.canonicalAreaLabel,
          source: "custom",
        }),
      );
    }
  }

  return Array.from(merged.values()).slice(0, 10);
}

export async function normalizeTopicAreaInRealTime(rawLabel: string) {
  const trimmedLabel = rawLabel.trim();

  if (!trimmedLabel) {
    return null;
  }

  const heuristicMatch = evaluateCareerMatch(trimmedLabel);

  if (heuristicMatch.confidence !== "low") {
    const persisted = await persistTopicAreaEntry({
      displayLabel: heuristicMatch.career?.label ?? trimmedLabel,
      catalogCareer: heuristicMatch.career,
    });

    return {
      label: persisted.topicAreaLabel,
      canonicalAreaId: persisted.topicAreaId,
      canonicalAreaLabel: persisted.topicAreaLabel,
      source: heuristicMatch.career ? "catalog" : "custom",
      confidence: heuristicMatch.confidence,
    } satisfies TopicAreaSuggestion & { confidence: TopicAreaMatchConfidence };
  }

  try {
    const normalized = await normalizeTopicAreaSemantically(trimmedLabel);
    const catalogCareer =
      getCatalogCareerById(normalized.canonicalAreaId) ??
      findBestCareerMatch(normalized.canonicalAreaLabel ?? normalized.normalizedLabel);
    const displayLabel = catalogCareer?.label ?? normalized.normalizedLabel;
    const persisted = await persistTopicAreaEntry({
      displayLabel,
      catalogCareer,
    });

    return {
      label: persisted.topicAreaLabel,
      canonicalAreaId: persisted.topicAreaId,
      canonicalAreaLabel: persisted.topicAreaLabel,
      source: catalogCareer ? "catalog" : "custom",
      confidence: normalized.confidence,
    } satisfies TopicAreaSuggestion & { confidence: TopicAreaMatchConfidence };
  } catch {
    const persisted = await persistTopicAreaEntry({
      displayLabel: trimmedLabel,
      catalogCareer: null,
    });

    return {
      label: persisted.topicAreaLabel,
      canonicalAreaId: persisted.topicAreaId,
      canonicalAreaLabel: persisted.topicAreaLabel,
      source: "custom",
      confidence: "low",
    } satisfies TopicAreaSuggestion & { confidence: TopicAreaMatchConfidence };
  }
}

export async function resolveAndRecordTopicArea(input: ResolveTopicAreaInput) {
  const fallbackLabel = input.topicAreaLabel?.trim() || getTopicAreaLabel(input.topicAreaId);

  if (!fallbackLabel) {
    return {
      topicAreaId: null,
      topicAreaLabel: null,
    };
  }

  const catalogCareer =
    getCatalogCareerById(input.topicAreaId) ?? findBestCareerMatch(fallbackLabel);

  return persistTopicAreaEntry({
    displayLabel: fallbackLabel,
    catalogCareer,
  });
}
