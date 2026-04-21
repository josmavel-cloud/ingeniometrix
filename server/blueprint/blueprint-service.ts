import { ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import researchBlueprintSchema from "@/ai/schemas/research-blueprint.schema.json";
import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";

import { buildBlueprintPrompt } from "./blueprint-prompt";
import {
  buildCoherenceReport,
  validateBlueprintTraceability,
} from "./blueprint-validation";

const BLUEPRINT_PROMPT_VERSION = "ingeniometrix-blueprint-v1";

export async function generateBlueprintVersion(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      intake: true,
      projectReferences: {
        where: {
          selected: true,
        },
        orderBy: {
          selectedOrder: "asc",
        },
        include: {
          reference: true,
        },
      },
      blueprintVersions: {
        orderBy: {
          versionNumber: "desc",
        },
        take: 1,
      },
    },
  });

  if (!project || !project.intake) {
    throw new Error("El proyecto no existe o aun no tiene intake.");
  }

  if (
    project.projectReferences.length < MIN_SELECTED_REFERENCES ||
    project.projectReferences.length > MAX_SELECTED_REFERENCES
  ) {
    throw new Error(
      `Debes seleccionar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes antes de generar el blueprint.`,
    );
  }

  const provider = getConfiguredLlmProvider();
  const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
  const prompt = buildBlueprintPrompt({
    project,
    intake: project.intake,
    selectedReferences: project.projectReferences,
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status: ProjectStatus.BLUEPRINT_GENERATING,
    },
  });

  try {
    const blueprint = await provider.generateStructuredObject<Record<string, unknown>>({
      prompt,
      schemaName: "research_blueprint",
      schema: researchBlueprintSchema as Record<string, unknown>,
    });

    validateBlueprintTraceability(
      blueprint as never,
      project.projectReferences.map((item) => ({
        id: item.reference.id,
        title: item.reference.title,
        doi: item.reference.doi,
      })),
    );

    const coherenceReport = buildCoherenceReport(
      blueprint as never,
      project.intake,
      project.projectReferences.map((item) => ({
        id: item.reference.id,
      })),
    );

    const createdVersion = await prisma.blueprintVersion.create({
      data: {
        projectId: project.id,
        versionNumber,
        model: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
        promptVersion: BLUEPRINT_PROMPT_VERSION,
        intakeSnapshotJson: {
          topic: project.intake.topic,
          problemContext: project.intake.problemContext,
          researchLine: project.intake.researchLine,
          academicConstraints: project.intake.academicConstraints,
          targetPopulation: project.intake.targetPopulation,
          availableData: project.intake.availableData,
          preferredMethodology: project.intake.preferredMethodology,
          advisorNotes: project.intake.advisorNotes,
          searchQuery: project.intake.searchQuery,
        },
        selectedReferencesSnapshotJson: project.projectReferences.map((item) => ({
          project_reference_id: item.id,
          selected_order: item.selectedOrder,
          reference_id: item.reference.id,
          title: item.reference.title,
          doi: item.reference.doi,
          authors: item.reference.authorsJson,
          year: item.reference.year,
          venue: item.reference.venue,
          abstract: item.reference.abstract,
        })),
        blueprintJson: blueprint as Prisma.InputJsonValue,
        coherenceReportJson: coherenceReport as Prisma.InputJsonValue,
        exportStatus: ExportStatus.PENDING,
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.BLUEPRINT_READY,
      },
    });

    await logAuditEvent({
      eventType: "BLUEPRINT_GENERATED",
      actorType: "SYSTEM",
      provider: Provider.OPENAI,
      userId,
      projectId: project.id,
      payloadJson: {
        versionNumber,
        promptVersion: BLUEPRINT_PROMPT_VERSION,
        model: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
      },
    });

    return createdVersion;
  } catch (error) {
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.SOURCES_SELECTED,
      },
    });

    throw error;
  }
}

export async function listBlueprintVersionsForUser(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  return prisma.blueprintVersion.findMany({
    where: {
      projectId,
    },
    orderBy: {
      versionNumber: "desc",
    },
  });
}

export async function getBlueprintVersionForUser(
  userId: string,
  projectId: string,
  versionId: string,
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

  const version = await prisma.blueprintVersion.findFirst({
    where: {
      id: versionId,
      projectId,
    },
  });

  if (!version) {
    throw new Error("Version de blueprint no encontrada.");
  }

  return version;
}

export async function getLatestBlueprintVersionForUser(userId: string, projectId: string) {
  const versions = await listBlueprintVersionsForUser(userId, projectId);
  return versions[0] ?? null;
}
