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

type TopicSuggestionVariantKind =
  | "USER_SEED"
  | "CATALOG"
  | "TECHNICAL_REWRITE"
  | "VARIANT";

type TopicSuggestionSuggestedIntake = {
  researchLine?: string | null;
  problemContext?: string | null;
  targetPopulation?: string | null;
  preferredMethodology?: string | null;
  availableData?: string | null;
  academicConstraints?: string | null;
  advisorNotes?: string | null;
};

type TopicSuggestionMetadata = {
  topicOriginType?: string;
  generatedFrom?: string;
  variantKind?: TopicSuggestionVariantKind;
  score?: number;
  reasons?: string[];
  careerId?: string;
  suggestedIntake?: TopicSuggestionSuggestedIntake;
};

type TopicSuggestionViewModel = {
  id: string;
  sourceType: TopicSuggestionSourceType;
  title: string;
  researchLine: string | null;
  rationale: string | null;
  selected: boolean;
  primaryConcept: {
    prefLabel: string;
  } | null;
  variantKind: TopicSuggestionVariantKind;
  suggestedIntake: TopicSuggestionSuggestedIntake;
};

function asObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseTopicSuggestionMetadata(value: Prisma.JsonValue | null | undefined) {
  const record = asObjectRecord(value);

  if (!record) {
    return {
      variantKind: "VARIANT",
      suggestedIntake: {},
    } satisfies TopicSuggestionMetadata;
  }

  const suggestedIntakeRecord = asObjectRecord(record.suggestedIntake);

  return {
    topicOriginType: normalizeOptionalText(record.topicOriginType) ?? undefined,
    generatedFrom: normalizeOptionalText(record.generatedFrom) ?? undefined,
    variantKind:
      (normalizeOptionalText(record.variantKind) as TopicSuggestionVariantKind | null) ??
      undefined,
    score: typeof record.score === "number" ? record.score : undefined,
    reasons: Array.isArray(record.reasons)
      ? record.reasons.filter((item): item is string => typeof item === "string")
      : undefined,
    careerId: normalizeOptionalText(record.careerId) ?? undefined,
    suggestedIntake: suggestedIntakeRecord
      ? {
          researchLine: normalizeOptionalText(suggestedIntakeRecord.researchLine),
          problemContext: normalizeOptionalText(suggestedIntakeRecord.problemContext),
          targetPopulation: normalizeOptionalText(suggestedIntakeRecord.targetPopulation),
          preferredMethodology: normalizeOptionalText(
            suggestedIntakeRecord.preferredMethodology,
          ),
          availableData: normalizeOptionalText(suggestedIntakeRecord.availableData),
          academicConstraints: normalizeOptionalText(
            suggestedIntakeRecord.academicConstraints,
          ),
          advisorNotes: normalizeOptionalText(suggestedIntakeRecord.advisorNotes),
        }
      : {},
  } satisfies TopicSuggestionMetadata;
}

function toTopicSuggestionViewModel(
  suggestion: TopicProjectRecord["topicSuggestions"][number],
): TopicSuggestionViewModel {
  const metadata = parseTopicSuggestionMetadata(suggestion.metadataJson);

  return {
    id: suggestion.id,
    sourceType: suggestion.sourceType,
    title: suggestion.title,
    researchLine: suggestion.researchLine,
    rationale: suggestion.rationale,
    selected: suggestion.selected,
    primaryConcept: suggestion.primaryConcept
      ? { prefLabel: suggestion.primaryConcept.prefLabel }
      : null,
    variantKind:
      metadata.variantKind ??
      (suggestion.sourceType === TopicSuggestionSourceType.USER_SEED
        ? "USER_SEED"
        : suggestion.sourceType === TopicSuggestionSourceType.CATALOG
          ? "CATALOG"
          : "VARIANT"),
    suggestedIntake: metadata.suggestedIntake ?? {},
  };
}

function buildUserSeedMetadata(input: {
  project: TopicProjectRecord;
  areaLabel: string | null;
  seedText: string;
}) {
  return {
    topicOriginType: input.project.topicOriginType,
    variantKind: "USER_SEED",
    suggestedIntake: {
      researchLine: input.project.intake?.researchLine ?? input.areaLabel,
      problemContext: input.project.intake?.problemContext ?? null,
      targetPopulation: input.project.intake?.targetPopulation ?? null,
      preferredMethodology: input.project.intake?.preferredMethodology ?? null,
      availableData: input.project.intake?.availableData ?? null,
      academicConstraints: input.project.intake?.academicConstraints ?? null,
      advisorNotes:
        input.project.intake?.advisorNotes ??
        "Puedes mantener esta idea original o elegir una version mas tecnica antes del intake.",
    },
  } satisfies TopicSuggestionMetadata;
}

function buildCatalogSuggestedIntake(
  preset: ReturnType<typeof buildProjectPresetSuggestionEntries>[number]["preset"],
) {
  const baseIntake = preset.intakePresets[0] ?? null;

  return {
    researchLine: preset.researchLine,
    problemContext: baseIntake?.problemContext ?? null,
    targetPopulation: baseIntake?.targetPopulation ?? null,
    preferredMethodology: baseIntake?.preferredMethodology ?? null,
    availableData: baseIntake?.availableData ?? null,
    academicConstraints: baseIntake?.academicConstraints ?? null,
    advisorNotes: baseIntake?.advisorNotes ?? null,
  } satisfies TopicSuggestionSuggestedIntake;
}

function buildGeneratedSuggestionMetadata(suggestion: {
  variantKind: "TECHNICAL_REWRITE" | "VARIANT";
  researchLine: string;
  problemContext: string;
  targetPopulation: string;
  preferredMethodology: string;
  availableData: string;
  academicConstraints: string;
  advisorNotes: string;
}) {
  return {
    variantKind: suggestion.variantKind,
    suggestedIntake: {
      researchLine: suggestion.researchLine,
      problemContext: suggestion.problemContext,
      targetPopulation: suggestion.targetPopulation,
      preferredMethodology: suggestion.preferredMethodology,
      availableData: suggestion.availableData,
      academicConstraints: suggestion.academicConstraints,
      advisorNotes: suggestion.advisorNotes,
    },
  } satisfies TopicSuggestionMetadata;
}

function mergeSuggestedIntake(
  primary: TopicSuggestionSuggestedIntake,
  fallback: TopicSuggestionSuggestedIntake,
) {
  return {
    researchLine: primary.researchLine ?? fallback.researchLine ?? null,
    problemContext: primary.problemContext ?? fallback.problemContext ?? null,
    targetPopulation: primary.targetPopulation ?? fallback.targetPopulation ?? null,
    preferredMethodology:
      primary.preferredMethodology ?? fallback.preferredMethodology ?? null,
    availableData: primary.availableData ?? fallback.availableData ?? null,
    academicConstraints:
      primary.academicConstraints ?? fallback.academicConstraints ?? null,
    advisorNotes: primary.advisorNotes ?? fallback.advisorNotes ?? null,
  } satisfies TopicSuggestionSuggestedIntake;
}

function buildAiAssistedUserSeedMetadata(input: {
  project: TopicProjectRecord;
  areaLabel: string | null;
  seedText: string;
  suggestion: {
    researchLine: string;
    problemContext: string;
    targetPopulation: string;
    preferredMethodology: string;
    availableData: string;
    academicConstraints: string;
    advisorNotes: string;
  };
}) {
  const baseMetadata = buildUserSeedMetadata({
    project: input.project,
    areaLabel: input.areaLabel,
    seedText: input.seedText,
  });

  return {
    ...baseMetadata,
    generatedFrom: "llm_assisted_seed",
    suggestedIntake: mergeSuggestedIntake(baseMetadata.suggestedIntake ?? {}, {
      researchLine: input.suggestion.researchLine,
      problemContext: input.suggestion.problemContext,
      targetPopulation: input.suggestion.targetPopulation,
      preferredMethodology: input.suggestion.preferredMethodology,
      availableData: input.suggestion.availableData,
      academicConstraints: input.suggestion.academicConstraints,
      advisorNotes: input.suggestion.advisorNotes,
    }),
  } satisfies TopicSuggestionMetadata;
}

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

  return project.topicSuggestions.map(toTopicSuggestionViewModel);
}

export async function ensureTopicSuggestionsForUser(userId: string, projectId: string) {
  const project = await getProjectTopicRecord(userId, projectId);

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const seedText = getTopicSeedText(project);
  const areaLabel = project.topicAreaLabel ?? getTopicAreaLabel(project.topicAreaId);
  const existingMetadata = project.topicSuggestions.map((suggestion) =>
    parseTopicSuggestionMetadata(suggestion.metadataJson),
  );
  const hasUserSeed = project.topicSuggestions.some(
    (suggestion) => suggestion.sourceType === TopicSuggestionSourceType.USER_SEED,
  );
  const hasTechnicalRewrite = existingMetadata.some(
    (metadata) => metadata.variantKind === "TECHNICAL_REWRITE",
  );

  if (!hasUserSeed) {
    await upsertSuggestion({
      projectId: project.id,
      sourceType: TopicSuggestionSourceType.USER_SEED,
      seedText,
      title: seedText,
      researchLine: project.intake?.researchLine ?? areaLabel,
      rationale: "Idea original registrada al crear el proyecto.",
      metadataJson: buildUserSeedMetadata({
        project,
        areaLabel,
        seedText,
      }) as unknown as Prisma.InputJsonValue,
      areaLabel,
    });
  }

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
        variantKind: "CATALOG",
        score: entry.score,
        reasons: entry.reasons,
        careerId: entry.preset.careerId,
        suggestedIntake: buildCatalogSuggestedIntake(entry.preset),
      },
      areaLabel,
    });
  }

  const strongCatalogCount = catalogSuggestions.filter((entry) => entry.score >= 7).length;
  const shouldGenerateAiSuggestions =
    project.topicOriginType !== TopicOriginType.CATALOG || strongCatalogCount < 2;

  if (shouldGenerateAiSuggestions && !hasTechnicalRewrite) {
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
        if (suggestion.variantKind === "TECHNICAL_REWRITE") {
          await upsertSuggestion({
            projectId: project.id,
            sourceType: TopicSuggestionSourceType.USER_SEED,
            seedText,
            title: seedText,
            researchLine:
              project.intake?.researchLine ?? suggestion.researchLine ?? areaLabel,
            rationale: "Idea original registrada al crear el proyecto.",
            metadataJson: buildAiAssistedUserSeedMetadata({
              project,
              areaLabel,
              seedText,
              suggestion,
            }) as unknown as Prisma.InputJsonValue,
            areaLabel,
          });
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
            ...buildGeneratedSuggestionMetadata(suggestion),
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

  return refreshedProject.topicSuggestions.map(toTopicSuggestionViewModel);
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
    if (suggestion.variantKind === "TECHNICAL_REWRITE") {
      await upsertSuggestion({
        projectId: project.id,
        sourceType: TopicSuggestionSourceType.USER_SEED,
        seedText,
        title: seedText,
        researchLine: project.intake?.researchLine ?? suggestion.researchLine ?? areaLabel,
        rationale: "Idea original registrada al crear el proyecto.",
        metadataJson: buildAiAssistedUserSeedMetadata({
          project,
          areaLabel,
          seedText,
          suggestion,
        }) as unknown as Prisma.InputJsonValue,
        areaLabel,
      });
    }

    await upsertSuggestion({
      projectId: project.id,
      sourceType: TopicSuggestionSourceType.AI_GENERATED,
      seedText,
      title: suggestion.title,
      researchLine: suggestion.researchLine,
      rationale: suggestion.rationale,
      metadataJson: {
        generatedFrom: "llm_refresh",
        ...buildGeneratedSuggestionMetadata(suggestion),
      },
      areaLabel,
    });
  }

  const refreshedProject = await getProjectTopicRecord(userId, projectId);

  if (!refreshedProject) {
    throw new Error("Proyecto no encontrado.");
  }

  return refreshedProject.topicSuggestions.map(toTopicSuggestionViewModel);
}

export async function selectTopicSuggestionForUser(params: {
  userId: string;
  projectId: string;
  suggestionId: string;
  edits?: TopicSuggestionSuggestedIntake;
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

  const suggestionMetadata = parseTopicSuggestionMetadata(suggestion.metadataJson);
  const editedIntake = {
    researchLine:
      normalizeOptionalText(params.edits?.researchLine) ??
      suggestionMetadata.suggestedIntake?.researchLine ??
      suggestion.researchLine,
    problemContext:
      normalizeOptionalText(params.edits?.problemContext) ??
      suggestionMetadata.suggestedIntake?.problemContext ??
      null,
    targetPopulation:
      normalizeOptionalText(params.edits?.targetPopulation) ??
      suggestionMetadata.suggestedIntake?.targetPopulation ??
      null,
    preferredMethodology:
      normalizeOptionalText(params.edits?.preferredMethodology) ??
      suggestionMetadata.suggestedIntake?.preferredMethodology ??
      null,
    availableData:
      normalizeOptionalText(params.edits?.availableData) ??
      suggestionMetadata.suggestedIntake?.availableData ??
      null,
    academicConstraints:
      normalizeOptionalText(params.edits?.academicConstraints) ??
      suggestionMetadata.suggestedIntake?.academicConstraints ??
      null,
    advisorNotes:
      normalizeOptionalText(params.edits?.advisorNotes) ??
      suggestionMetadata.suggestedIntake?.advisorNotes ??
      null,
  } satisfies TopicSuggestionSuggestedIntake;

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
        researchLine: editedIntake.researchLine ?? suggestion.researchLine,
        metadataJson: {
          ...(asObjectRecord(suggestion.metadataJson) ?? {}),
          suggestedIntake: editedIntake,
          variantKind:
            suggestionMetadata.variantKind ??
            (suggestion.sourceType === TopicSuggestionSourceType.AI_GENERATED
              ? "VARIANT"
              : suggestion.sourceType === TopicSuggestionSourceType.CATALOG
                ? "CATALOG"
                : "USER_SEED"),
        },
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
              researchLine: editedIntake.researchLine,
              problemContext: editedIntake.problemContext,
              targetPopulation: editedIntake.targetPopulation,
              preferredMethodology: editedIntake.preferredMethodology,
              availableData: editedIntake.availableData,
              academicConstraints: editedIntake.academicConstraints,
              advisorNotes: editedIntake.advisorNotes,
            },
            update: {
              topic: suggestion.title,
              researchLine: editedIntake.researchLine ?? undefined,
              problemContext:
                project.intake?.problemContext?.trim().length
                  ? project.intake.problemContext
                  : editedIntake.problemContext ?? undefined,
              targetPopulation:
                project.intake?.targetPopulation?.trim().length
                  ? project.intake.targetPopulation
                  : editedIntake.targetPopulation ?? undefined,
              preferredMethodology:
                project.intake?.preferredMethodology?.trim().length
                  ? project.intake.preferredMethodology
                  : editedIntake.preferredMethodology ?? undefined,
              availableData:
                project.intake?.availableData?.trim().length
                  ? project.intake.availableData
                  : editedIntake.availableData ?? undefined,
              academicConstraints:
                project.intake?.academicConstraints?.trim().length
                  ? project.intake.academicConstraints
                  : editedIntake.academicConstraints ?? undefined,
              advisorNotes:
                project.intake?.advisorNotes?.trim().length
                  ? project.intake.advisorNotes
                  : editedIntake.advisorNotes ?? undefined,
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

export type { TopicSuggestionSuggestedIntake, TopicSuggestionViewModel };
