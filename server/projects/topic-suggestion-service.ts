import {
  ClassificationSource,
  Prisma,
  TopicOriginType,
  TopicSelectionStatus,
  TopicSuggestionSourceType,
} from "@prisma/client";

import { getPresetDegreeLevelForProject } from "@/lib/degree-levels";
import { prisma } from "@/lib/prisma";
import {
  buildProjectPresetSuggestionEntries,
  getInterestTokens,
  getTopicAreaLabel,
  normalizeSearchText,
} from "@/lib/topic-suggestion-scoring";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";

import { generateTopicSuggestionsInRealTime } from "./topic-suggestion-generator";

type TopicProjectRecord = Prisma.ProjectGetPayload<{
  include: {
    intake: true;
    selectedTopicSuggestion: true;
    topicSuggestions: {
      include: {
        primaryConcept: true;
      };
      orderBy: {
        createdAt: "asc";
      };
    };
  };
}>;

function getTopicSeedText(project: TopicProjectRecord) {
  return project.topicSeedText?.trim() || project.title.trim();
}

async function findPrimaryTaxonomyConcept(params: {
  title: string;
  researchLine?: string | null;
  areaLabel?: string | null;
}) {
  const searchTerms = Array.from(
    new Set(
      [
        ...getInterestTokens(params.title),
        ...getInterestTokens(params.researchLine ?? ""),
        ...getInterestTokens(params.areaLabel ?? ""),
      ].slice(0, 6),
    ),
  );

  if (searchTerms.length === 0) {
    return null;
  }

  for (const term of searchTerms) {
    const concept = await prisma.taxonomyConcept.findFirst({
      where: {
        OR: [
          {
            prefLabel: {
              contains: term,
              mode: "insensitive",
            },
          },
          {
            conceptCode: {
              contains: term,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (concept) {
      return concept;
    }
  }

  return null;
}

async function loadTaxonomyHints(seedText: string, areaLabel: string | null) {
  const terms = getInterestTokens(`${seedText} ${areaLabel ?? ""}`).slice(0, 4);

  if (terms.length === 0) {
    return [];
  }

  const concepts = await prisma.taxonomyConcept.findMany({
    where: {
      OR: terms.map((term) => ({
        prefLabel: {
          contains: term,
          mode: "insensitive" as const,
        },
      })),
    },
    select: {
      prefLabel: true,
    },
    take: 5,
  });

  return concepts.map((concept) => concept.prefLabel);
}

async function upsertSuggestion(params: {
  projectId: string;
  sourceType: TopicSuggestionSourceType;
  catalogTopicId?: string | null;
  seedText?: string | null;
  title: string;
  researchLine?: string | null;
  rationale?: string | null;
  metadataJson?: Prisma.InputJsonValue;
  areaLabel?: string | null;
}) {
  const primaryConcept = await findPrimaryTaxonomyConcept({
    title: params.title,
    researchLine: params.researchLine,
    areaLabel: params.areaLabel,
  });

  return prisma.projectTopicSuggestion.upsert({
    where: {
      projectId_sourceType_title: {
        projectId: params.projectId,
        sourceType: params.sourceType,
        title: params.title,
      },
    },
    update: {
      catalogTopicId: params.catalogTopicId ?? null,
      seedText: params.seedText ?? null,
      researchLine: params.researchLine ?? null,
      rationale: params.rationale ?? null,
      metadataJson: params.metadataJson ?? Prisma.JsonNull,
      primaryConceptId: primaryConcept?.id ?? null,
    },
    create: {
      projectId: params.projectId,
      sourceType: params.sourceType,
      catalogTopicId: params.catalogTopicId ?? null,
      seedText: params.seedText ?? null,
      title: params.title,
      researchLine: params.researchLine ?? null,
      rationale: params.rationale ?? null,
      metadataJson: params.metadataJson ?? Prisma.JsonNull,
      primaryConceptId: primaryConcept?.id ?? null,
    },
    include: {
      primaryConcept: true,
    },
  });
}

async function getProjectTopicRecord(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      intake: true,
      selectedTopicSuggestion: true,
      topicSuggestions: {
        include: {
          primaryConcept: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function listTopicSuggestionsForUser(userId: string, projectId: string) {
  const project = await getProjectTopicRecord(userId, projectId);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  return project.topicSuggestions;
}

export async function ensureTopicSuggestionsForUser(userId: string, projectId: string) {
  const project = await getProjectTopicRecord(userId, projectId);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  if (project.topicSuggestions.length > 0) {
    return project.topicSuggestions;
  }

  const seedText = getTopicSeedText(project);
  const areaLabel = project.topicAreaLabel ?? getTopicAreaLabel(project.topicAreaId);

  await upsertSuggestion({
    projectId: project.id,
    sourceType: TopicSuggestionSourceType.USER_SEED,
    seedText,
    title: seedText,
    researchLine: project.intake?.researchLine ?? areaLabel,
    rationale: "Idea original registrada al crear el proyecto.",
    metadataJson: {
      topicOriginType: project.topicOriginType,
    },
    areaLabel,
  });

  const catalogSuggestions = buildProjectPresetSuggestionEntries({
    areaId: project.topicAreaId,
    degreeLevel: getPresetDegreeLevelForProject(project.degreeLevel),
    university: project.university,
    templateKey: project.templateKey,
    interestText: seedText,
    limit: 4,
  });

  for (const entry of catalogSuggestions) {
    await upsertSuggestion({
      projectId: project.id,
      sourceType: TopicSuggestionSourceType.CATALOG,
      catalogTopicId: entry.preset.id,
      seedText,
      title: entry.preset.title,
      researchLine: entry.preset.researchLine,
      rationale: entry.reasons.join(" "),
      metadataJson: {
        score: entry.score,
        reasons: entry.reasons,
        careerId: entry.preset.careerId,
      },
      areaLabel,
    });
  }

  const strongCatalogCount = catalogSuggestions.filter((entry) => entry.score >= 7).length;

  if (strongCatalogCount < 2) {
    try {
      const taxonomyHints = await loadTaxonomyHints(seedText, areaLabel);

      const generatedSuggestions = await generateTopicSuggestionsInRealTime({
        university: getUniversityDisplayNameByCode(project.university),
        degreeLevel: project.degreeLevel,
        program: project.program,
        areaLabel,
        seedText,
        taxonomyHints,
      });

      for (const suggestion of generatedSuggestions) {
        if (normalizeSearchText(suggestion.title) === normalizeSearchText(seedText)) {
          continue;
        }

        await upsertSuggestion({
          projectId: project.id,
          sourceType: TopicSuggestionSourceType.AI_GENERATED,
          seedText,
          title: suggestion.title,
          researchLine: suggestion.researchLine,
          rationale: suggestion.rationale,
          metadataJson: {
            generatedFrom: "llm",
          },
          areaLabel,
        });
      }
    } catch {
      // Si el fallback IA falla, mantenemos el flujo con seed + catalogo.
    }
  }

  const refreshedProject = await getProjectTopicRecord(userId, projectId);

  if (!refreshedProject) {
    throw new Error("Proyecto no encontrado.");
  }

  return refreshedProject.topicSuggestions;
}

export async function regenerateTopicSuggestionsForUser(userId: string, projectId: string) {
  const project = await getProjectTopicRecord(userId, projectId);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const seedText = getTopicSeedText(project);
  const areaLabel = project.topicAreaLabel ?? getTopicAreaLabel(project.topicAreaId);
  const taxonomyHints = await loadTaxonomyHints(seedText, areaLabel);

  const generatedSuggestions = await generateTopicSuggestionsInRealTime({
    university: getUniversityDisplayNameByCode(project.university),
    degreeLevel: project.degreeLevel,
    program: project.program,
    areaLabel,
    seedText,
    taxonomyHints,
  });

  for (const suggestion of generatedSuggestions) {
    await upsertSuggestion({
      projectId: project.id,
      sourceType: TopicSuggestionSourceType.AI_GENERATED,
      seedText,
      title: suggestion.title,
      researchLine: suggestion.researchLine,
      rationale: suggestion.rationale,
      metadataJson: {
        generatedFrom: "llm_refresh",
      },
      areaLabel,
    });
  }

  const refreshedProject = await getProjectTopicRecord(userId, projectId);

  if (!refreshedProject) {
    throw new Error("Proyecto no encontrado.");
  }

  return refreshedProject.topicSuggestions;
}

export async function selectTopicSuggestionForUser(params: {
  userId: string;
  projectId: string;
  suggestionId: string;
}) {
  const project = await getProjectTopicRecord(params.userId, params.projectId);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const suggestion = project.topicSuggestions.find(
    (item) => item.id === params.suggestionId,
  );

  if (!suggestion) {
    throw new Error("Sugerencia de tema no encontrada.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectTopicSuggestion.updateMany({
      where: {
        projectId: project.id,
      },
      data: {
        selected: false,
      },
    });

    await tx.projectTopicSuggestion.update({
      where: {
        id: suggestion.id,
      },
      data: {
        selected: true,
      },
    });

    await tx.project.update({
      where: {
        id: project.id,
      },
      data: {
        title: suggestion.title,
        catalogTopicId: suggestion.catalogTopicId,
        selectedTopicSuggestionId: suggestion.id,
        topicSelectionStatus: TopicSelectionStatus.SELECTED,
        topicOriginType:
          project.topicOriginType === TopicOriginType.CUSTOM &&
          suggestion.sourceType !== TopicSuggestionSourceType.USER_SEED
            ? TopicOriginType.HYBRID
            : project.topicOriginType,
        intake: {
          upsert: {
            create: {
              topic: suggestion.title,
              researchLine: suggestion.researchLine,
            },
            update: {
              topic: suggestion.title,
              researchLine: suggestion.researchLine ?? undefined,
            },
          },
        },
      },
    });

    if (suggestion.primaryConceptId) {
      await tx.projectKnowledgeField.updateMany({
        where: {
          projectId: project.id,
        },
        data: {
          isPrimary: false,
        },
      });

      await tx.projectKnowledgeField.upsert({
        where: {
          projectId_conceptId: {
            projectId: project.id,
            conceptId: suggestion.primaryConceptId,
          },
        },
        update: {
          isPrimary: true,
          source: ClassificationSource.SYSTEM,
          confidence: 0.68,
          evidenceJson: {
            source: "topic_selection",
            suggestionId: suggestion.id,
          },
        },
        create: {
          projectId: project.id,
          conceptId: suggestion.primaryConceptId,
          isPrimary: true,
          source: ClassificationSource.SYSTEM,
          confidence: 0.68,
          evidenceJson: {
            source: "topic_selection",
            suggestionId: suggestion.id,
          },
        },
      });
    }
  });

  const refreshedProject = await getProjectTopicRecord(params.userId, params.projectId);

  if (!refreshedProject) {
    throw new Error("Proyecto no encontrado.");
  }

  return refreshedProject;
}

export async function getTopicProjectForUser(userId: string, projectId: string) {
  const project = await getProjectTopicRecord(userId, projectId);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  return project;
}
