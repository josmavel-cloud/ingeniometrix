import { prisma } from "@/lib/prisma";
import { PROJECT_CAREERS } from "@/lib/project-presets";
import { getTopicAreaLabel, normalizeSearchText } from "@/lib/topic-suggestion-scoring";

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
  const normalizedLabel = normalizeSearchText(fallbackLabel);

  await prisma.topicAreaCatalogEntry.upsert({
    where: {
      normalizedLabel,
    },
    update: {
      displayLabel: fallbackLabel,
      canonicalAreaId: catalogCareer?.id ?? null,
      canonicalAreaLabel: catalogCareer?.label ?? null,
      usageCount: {
        increment: 1,
      },
    },
    create: {
      normalizedLabel,
      displayLabel: fallbackLabel,
      canonicalAreaId: catalogCareer?.id ?? null,
      canonicalAreaLabel: catalogCareer?.label ?? null,
      usageCount: 1,
    },
  });

  return {
    topicAreaId: catalogCareer?.id ?? null,
    topicAreaLabel: catalogCareer?.label ?? fallbackLabel,
  };
}
