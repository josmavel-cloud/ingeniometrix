import { TopicSuggestionSourceType } from "@prisma/client";

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

  return prisma.project.create({
    data: {
      userId,
      catalogTopicId: input.catalogTopicId,
      title: input.title,
      degreeLevel: input.degreeLevel,
      university: input.university,
      program: input.program,
      templateKey: input.templateKey,
      topicOriginType: input.topicOriginType,
      topicSeedText: seedText,
      topicAreaId: resolvedArea.topicAreaId,
      topicAreaLabel: resolvedArea.topicAreaLabel,
      topicSuggestions: {
        create: {
          sourceType: TopicSuggestionSourceType.USER_SEED,
          seedText,
          title: seedText,
          researchLine: resolvedArea.topicAreaLabel ?? null,
          rationale: "Idea original registrada al crear el proyecto.",
          metadataJson: {
            topicOriginType: input.topicOriginType,
            variantKind: "USER_SEED",
            suggestedIntake: {
              researchLine: resolvedArea.topicAreaLabel ?? null,
              advisorNotes:
                "Puedes mantener esta idea original o elegir una version mas tecnica antes del intake.",
            },
          },
        },
      },
    },
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
