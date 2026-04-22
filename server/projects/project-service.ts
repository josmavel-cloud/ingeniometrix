import { prisma } from "@/lib/prisma";

import {
  type CreateProjectInput,
  type IntakeInput,
  resolveProjectStatusFromIntake,
} from "./project-validation";

export async function createProjectForUser(userId: string, input: CreateProjectInput) {
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
      topicSeedText: input.customIdeaText ?? input.title,
      topicAreaId: input.topicAreaId,
      topicAreaLabel: input.topicAreaLabel,
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
