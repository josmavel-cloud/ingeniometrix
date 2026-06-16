import { TopicSelectionStatus, TopicSuggestionSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  type CreateProjectInput,
  type IntakeInput,
  resolveProjectStatusFromIntake,
} from "./project-validation";
import { resolveAndRecordTopicArea } from "./topic-area-service";

export async function createProjectForUser(userId: string, input: CreateProjectInput) {
  const seedText = input.customIdeaText ?? input.title;
  const resolvedArea = await resolveAndRecordTopicArea({
    topicAreaId: input.topicAreaId,
    topicAreaLabel: input.topicAreaLabel,
  });
  const advisorNotes =
    "Tema inicial seleccionado al crear el proyecto. Completa problema, poblacion y restricciones antes de buscar fuentes.";

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        userId,
        catalogTopicId: input.catalogTopicId,
        title: input.title,
        degreeLevel: input.degreeLevel,
        university: input.university,
        program: input.program,
        language: input.language,
        templateKey: input.templateKey,
        topicOriginType: input.topicOriginType,
        topicSeedText: seedText,
        topicAreaId: resolvedArea.topicAreaId,
        topicAreaLabel: resolvedArea.topicAreaLabel,
      },
    });

    const suggestion = await tx.projectTopicSuggestion.create({
      data: {
        projectId: project.id,
        sourceType: TopicSuggestionSourceType.USER_SEED,
        seedText,
        title: input.title,
        researchLine: resolvedArea.topicAreaLabel ?? null,
        rationale: "Idea inicial registrada al crear el proyecto.",
        selected: true,
        metadataJson: {
          topicOriginType: input.topicOriginType,
          variantKind: "USER_SEED",
          suggestedIntake: {
            topic: input.title,
            researchLine: resolvedArea.topicAreaLabel ?? null,
            advisorNotes,
          },
        },
      },
    });

    return tx.project.update({
      where: { id: project.id },
      data: {
        selectedTopicSuggestionId: suggestion.id,
        topicSelectionStatus: TopicSelectionStatus.SELECTED,
        intake: {
          create: {
            topic: input.title,
            researchLine: resolvedArea.topicAreaLabel ?? null,
            advisorNotes,
          },
        },
      },
    });
  });
}

export async function listProjectsForUser(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      intake: true,
    },
  });
}

export async function getProjectForUser(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      intake: true,
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

export async function saveIntakeForProject(
  userId: string,
  projectId: string,
  input: IntakeInput,
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

  const status = resolveProjectStatusFromIntake(input);

  return prisma.project.update({
    where: { id: project.id },
    data: {
      status,
      intake: {
        upsert: {
          create: {
            topic: input.topic,
            problemContext: input.problemContext,
            researchLine: input.researchLine,
            academicConstraints: input.academicConstraints,
            targetPopulation: input.targetPopulation,
            availableData: input.availableData,
            preferredMethodology: input.preferredMethodology,
            advisorNotes: input.advisorNotes,
          },
          update: {
            topic: input.topic,
            problemContext: input.problemContext,
            researchLine: input.researchLine,
            academicConstraints: input.academicConstraints,
            targetPopulation: input.targetPopulation,
            availableData: input.availableData,
            preferredMethodology: input.preferredMethodology,
            advisorNotes: input.advisorNotes,
          },
        },
      },
    },
    include: {
      intake: true,
    },
  });
}
