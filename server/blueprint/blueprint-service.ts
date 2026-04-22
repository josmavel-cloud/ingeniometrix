import { ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import researchBlueprintCoreSchema from "@/ai/schemas/research-blueprint-core.schema.json";
import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";

import { buildBlueprintPrompt } from "./blueprint-prompt";
import {
  BlueprintGenerationError,
} from "./blueprint-errors";
import {
  normalizeBlueprintDraft,
  type ResearchBlueprintCoreDraft,
} from "./blueprint-normalization";
import {
  buildCoherenceReport,
  validateBlueprintCitationPlan,
  validateBlueprintTraceability,
} from "./blueprint-validation";
import {
  buildCitationPlan,
  buildEnrichedBlueprintRecord,
  buildReferenceInsights,
  loadBlueprintTemplateContext,
} from "./blueprint-engine";
import type {
  BlueprintCitationPlanSection,
  BlueprintReferenceSnapshot,
} from "./blueprint-types";

const BLUEPRINT_PROMPT_VERSION = "ingeniometrix-blueprint-v2";

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Razon no identificada.";
}

function isTraceabilityErrorMessage(message: string) {
  return (
    message.includes("referencias no seleccionadas") ||
    message.includes("no incluyo referencias trazables")
  );
}

function isCitationPlanErrorMessage(message: string) {
  return message.includes("citation plan usa referencias no seleccionadas");
}

function buildBlueprintTextFallbackPrompt(prompt: string) {
  return `${prompt}

Responde exclusivamente con un objeto JSON valido.
- no uses markdown
- no uses bloques de codigo
- no agregues texto antes ni despues del JSON
- si un campo no puede completarse con precision, devuelve una formulacion prudente o un arreglo vacio segun corresponda
`.trim();
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("No se encontro un objeto JSON valido en la respuesta del modelo.");
}

async function generateBlueprintDraftWithFallback(params: {
  provider: ReturnType<typeof getConfiguredLlmProvider>;
  prompt: string;
}) {
  try {
    return await params.provider.generateStructuredObject<ResearchBlueprintCoreDraft>({
      prompt: params.prompt,
      schemaName: "research_blueprint_core",
      schema: researchBlueprintCoreSchema as Record<string, unknown>,
    });
  } catch (structuredError) {
    const structuredReason = describeError(structuredError);

    try {
      const textResponse = await params.provider.generateText({
        prompt: buildBlueprintTextFallbackPrompt(params.prompt),
      });

      return JSON.parse(extractJsonObject(textResponse)) as ResearchBlueprintCoreDraft;
    } catch (textFallbackError) {
      throw new Error(
        `Fallo structured output: ${structuredReason}. Fallo fallback JSON: ${describeError(textFallbackError)}.`,
      );
    }
  }
}

function deriveReferencesUsedFromCitationPlan(input: {
  citationPlan: BlueprintCitationPlanSection[];
  selectedReferences: BlueprintReferenceSnapshot[];
}) {
  const selectedReferencesById = new Map(
    input.selectedReferences.map((reference) => [reference.reference_id, reference]),
  );
  const orderedIds = Array.from(
    new Set(
      input.citationPlan.flatMap((section) => section.supported_reference_ids),
    ),
  );

  return orderedIds
    .map((referenceId) => selectedReferencesById.get(referenceId))
    .filter((reference): reference is BlueprintReferenceSnapshot => Boolean(reference));
}

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
    throw new BlueprintGenerationError({
      code: "INTAKE_INCOMPLETE",
      message: "El proyecto aun no tiene una base de intake suficiente para generar blueprint.",
      nextAction: "Completa tema, problema y poblacion antes de volver a intentar.",
    });
  }

  if (
    project.projectReferences.length < MIN_SELECTED_REFERENCES ||
    project.projectReferences.length > MAX_SELECTED_REFERENCES
  ) {
    throw new BlueprintGenerationError({
      code: "REFERENCES_OUT_OF_RANGE",
      message: `Debes seleccionar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes antes de generar el blueprint.`,
      nextAction:
        "Ajusta tu set de fuentes seleccionadas para que el blueprint tenga soporte suficiente sin volverse pesado.",
    });
  }

  const provider = getConfiguredLlmProvider();
  const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
  const templateContext = await loadBlueprintTemplateContext(project);
  const referenceInsights = buildReferenceInsights(project.projectReferences);
  const prompt = buildBlueprintPrompt({
    project,
    intake: project.intake,
    selectedReferences: project.projectReferences,
    referenceInsights,
    templateContext,
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status: ProjectStatus.BLUEPRINT_GENERATING,
    },
  });

  try {
    const rawBlueprint = await generateBlueprintDraftWithFallback({
      provider,
      prompt,
    });
    const selectedReferenceSnapshots = project.projectReferences.map((item) => ({
      reference_id: item.reference.id,
      title: item.reference.title,
      doi: item.reference.doi,
    }));
    const normalizedBlueprint = normalizeBlueprintDraft({
      draft: rawBlueprint,
      project,
      intake: project.intake,
    });
    const citationPlan = buildCitationPlan({
      blueprint: normalizedBlueprint,
      intake: project.intake,
      referenceInsights,
    });
    const referencesUsed =
      normalizedBlueprint.references_used.length > 0
        ? normalizedBlueprint.references_used
        : deriveReferencesUsedFromCitationPlan({
            citationPlan,
            selectedReferences: selectedReferenceSnapshots,
          });
    const finalizedBlueprint = {
      ...normalizedBlueprint,
      references_used: referencesUsed,
    };
    const blueprint = buildEnrichedBlueprintRecord({
      blueprint: finalizedBlueprint,
      templateContext,
      referenceInsights,
      citationPlan,
    });

    validateBlueprintTraceability(
      blueprint,
      project.projectReferences.map((item) => ({
        id: item.reference.id,
        title: item.reference.title,
        doi: item.reference.doi,
      })),
    );
    validateBlueprintCitationPlan(
      blueprint,
      project.projectReferences.map((item) => ({
        id: item.reference.id,
      })),
    );

    const coherenceReport = buildCoherenceReport(
      blueprint,
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

    if (error instanceof BlueprintGenerationError) {
      throw error;
    }

    if (error instanceof Error) {
      console.error("[blueprint] generation failed", {
        projectId: project.id,
        userId,
        reason: error.message,
      });

      if (isTraceabilityErrorMessage(error.message)) {
        throw new BlueprintGenerationError({
          code: "TRACEABILITY_FAILED",
          message: error.message,
          nextAction:
            "Revisa si las fuentes elegidas realmente sostienen el problema, metodo y objetivos antes de regenerar.",
        });
      }

      if (isCitationPlanErrorMessage(error.message)) {
        throw new BlueprintGenerationError({
          code: "CITATION_PLAN_INVALID",
          message: error.message,
          nextAction:
            "Ajusta la seleccion de fuentes o el intake para que el soporte bibliografico quede mas alineado.",
        });
      }
    }

    throw new BlueprintGenerationError({
      code: "MODEL_OUTPUT_INVALID",
      message:
        "No pudimos convertir este intento en un blueprint valido con el modelo actual.",
      nextAction:
        "Prueba otra vez. Si se repite, ajusta el intake para que problema, poblacion y metodologia queden mas concretos, o cambia una o dos fuentes semilla por referencias mas alineadas.",
    });
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
