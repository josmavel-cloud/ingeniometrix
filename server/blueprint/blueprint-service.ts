import { ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import researchBlueprintCoreSchema from "@/ai/schemas/research-blueprint-core.schema.json";
import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import { normalizeTitle } from "@/lib/text";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";

import { buildBlueprintPrompt } from "./blueprint-prompt";
import {
  BlueprintGenerationError,
} from "./blueprint-errors";
import { generateBlueprintAntecedentSynthesis } from "./blueprint-antecedent-synthesis";
import { generateBlueprintContextCompletion } from "./blueprint-context-completion";
import { generateStructuredObjectWithTextFallback } from "./blueprint-llm-json";
import {
  normalizeBlueprintDraft,
  type ResearchBlueprintCoreDraft,
} from "./blueprint-normalization";
import { buildBlueprintReadinessSnapshot } from "./blueprint-readiness";
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
  BlueprintAntecedentSynthesis,
  BlueprintContextCompletion,
  BlueprintCitationPlanSection,
  BlueprintReadinessSnapshot,
  BlueprintReferenceSnapshot,
} from "./blueprint-types";

const BLUEPRINT_PROMPT_VERSION = "ingeniometrix-blueprint-v3";

async function logBlueprintStage(input: {
  userId: string;
  projectId: string;
  stageKey: string;
  label: string;
  progress: number;
}) {
  await logAuditEvent({
    eventType: "BLUEPRINT_STAGE_UPDATED",
    actorType: "SYSTEM",
    provider: Provider.OPENAI,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: {
      stageKey: input.stageKey,
      label: input.label,
      progress: input.progress,
    },
  });
}

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

  const derivedReferences = orderedIds
    .map((referenceId) => selectedReferencesById.get(referenceId))
    .filter((reference): reference is BlueprintReferenceSnapshot => Boolean(reference));

  if (derivedReferences.length > 0) {
    return derivedReferences;
  }

  return input.selectedReferences.slice(0, Math.min(3, input.selectedReferences.length));
}

function resolveReferencesUsedFromModel(input: {
  candidateReferences: BlueprintReferenceSnapshot[];
  selectedReferences: BlueprintReferenceSnapshot[];
}) {
  const selectedById = new Map(
    input.selectedReferences.map((reference) => [reference.reference_id, reference]),
  );
  const selectedByDoi = new Map(
    input.selectedReferences
      .filter((reference) => reference.doi?.trim())
      .map((reference) => [reference.doi!.trim().toLowerCase(), reference]),
  );
  const selectedByTitle = new Map(
    input.selectedReferences.map((reference) => [normalizeTitle(reference.title), reference]),
  );
  const resolved = new Map<string, BlueprintReferenceSnapshot>();

  for (const candidate of input.candidateReferences) {
    const candidateId = candidate.reference_id?.trim() ?? "";
    const candidateDoi = candidate.doi?.trim().toLowerCase() ?? "";
    const candidateTitle = normalizeTitle(candidate.title);
    const matchedReference =
      (candidateId ? selectedById.get(candidateId) : undefined) ??
      (candidateDoi ? selectedByDoi.get(candidateDoi) : undefined) ??
      (candidateTitle ? selectedByTitle.get(candidateTitle) : undefined);

    if (!matchedReference) {
      continue;
    }

    resolved.set(matchedReference.reference_id, matchedReference);
  }

  return Array.from(resolved.values());
}

async function generateBlueprintDraftAttempt(params: {
  provider: ReturnType<typeof getConfiguredLlmProvider>;
  prompt: string;
}) {
  return generateStructuredObjectWithTextFallback<ResearchBlueprintCoreDraft>({
    provider: params.provider,
    prompt: params.prompt,
    schemaName: "research_blueprint_core",
    schema: researchBlueprintCoreSchema as Record<string, unknown>,
  });
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

  const intake = project.intake;

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
  const readinessSnapshot = buildBlueprintReadinessSnapshot({
    intake,
    referenceInsights,
  });

  await prisma.project.update({
    where: { id: project.id },
    data: {
      status: ProjectStatus.BLUEPRINT_GENERATING,
    },
  });

  try {
    await logBlueprintStage({
      userId,
      projectId: project.id,
      stageKey: "preparing_context",
      label: "Preparando contexto",
      progress: 12,
    });

    let antecedentSynthesis: BlueprintAntecedentSynthesis | null = null;

    try {
      await logBlueprintStage({
        userId,
        projectId: project.id,
        stageKey: "synthesizing_antecedents",
        label: "Sintetizando antecedentes",
        progress: 28,
      });
      antecedentSynthesis = await generateBlueprintAntecedentSynthesis({
        provider,
        project,
        intake,
        selectedReferences: project.projectReferences,
        referenceInsights,
      });
    } catch {
      antecedentSynthesis = null;
    }

    const buildAttemptPrompt = (assistedContext: BlueprintContextCompletion | null) =>
      buildBlueprintPrompt({
        project,
        intake,
        selectedReferences: project.projectReferences,
        referenceInsights,
        templateContext,
        antecedentSynthesis,
        assistedContext,
        readinessSnapshot,
      });

    const generateAssistedContextIfNeeded = async () => {
      await logBlueprintStage({
        userId,
        projectId: project.id,
        stageKey: "stabilizing_context",
        label: "Completando vacios del intake",
        progress: 42,
      });
      return generateBlueprintContextCompletion({
        provider,
        project,
        intake,
        referenceInsights,
        readinessSnapshot,
      });
    };

    let assistedContext: BlueprintContextCompletion | null =
      readinessSnapshot.readiness_status === "assisted"
        ? await generateAssistedContextIfNeeded()
        : null;
    let rawBlueprint: ResearchBlueprintCoreDraft;

    try {
      await logBlueprintStage({
        userId,
        projectId: project.id,
        stageKey: "drafting_blueprint",
        label: "Redactando blueprint",
        progress: 64,
      });
      rawBlueprint = await generateBlueprintDraftAttempt({
        provider,
        prompt: buildAttemptPrompt(assistedContext),
      });
    } catch (firstAttemptError) {
      if (!assistedContext) {
        assistedContext = await generateAssistedContextIfNeeded();
        rawBlueprint = await generateBlueprintDraftAttempt({
          provider,
          prompt: buildAttemptPrompt(assistedContext),
        });
      } else {
        throw firstAttemptError;
      }
    }

    const selectedReferenceSnapshots = project.projectReferences.map((item) => ({
      reference_id: item.reference.id,
      title: item.reference.title,
      doi: item.reference.doi,
    }));
    const normalizedBlueprint = normalizeBlueprintDraft({
      draft: rawBlueprint,
      project,
      intake,
      assistedContext,
    });
    await logBlueprintStage({
      userId,
      projectId: project.id,
      stageKey: "validating_traceability",
      label: "Validando trazabilidad y coherencia",
      progress: 82,
    });
    const citationPlan = buildCitationPlan({
      blueprint: normalizedBlueprint,
      intake,
      referenceInsights,
    });
    const resolvedReferencesFromModel = resolveReferencesUsedFromModel({
      candidateReferences: normalizedBlueprint.references_used,
      selectedReferences: selectedReferenceSnapshots,
    });
    const referencesUsed =
      resolvedReferencesFromModel.length > 0
        ? resolvedReferencesFromModel
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
      templateContext: {
        ...templateContext,
        guidance_notes: [
          ...templateContext.guidance_notes,
          ...readinessSnapshot.warnings,
          ...(assistedContext
            ? [
                "Se activo contexto asistido para completar vacios del intake y mejorar la estabilidad del motor.",
              ]
            : []),
        ],
      },
      referenceInsights,
      citationPlan,
      contextCompletion: assistedContext,
      readinessSnapshot,
      antecedentSynthesis,
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
      intake,
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
          topic: intake.topic,
          problemContext: intake.problemContext,
          researchLine: intake.researchLine,
          academicConstraints: intake.academicConstraints,
          targetPopulation: intake.targetPopulation,
          availableData: intake.availableData,
          preferredMethodology: intake.preferredMethodology,
          advisorNotes: intake.advisorNotes,
          searchQuery: intake.searchQuery,
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

    await logBlueprintStage({
      userId,
      projectId: project.id,
      stageKey: "completed",
      label: "Blueprint listo",
      progress: 100,
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
    await logBlueprintStage({
      userId,
      projectId: project.id,
      stageKey: "failed",
      label: "La generacion encontro un bloqueo",
      progress: 100,
    }).catch(() => undefined);

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

export async function getBlueprintProgressForUser(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  const latestProgressLog = await prisma.auditLog.findFirst({
    where: {
      projectId,
      eventType: "BLUEPRINT_STAGE_UPDATED",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const payload =
    latestProgressLog?.payloadJson &&
    typeof latestProgressLog.payloadJson === "object" &&
    !Array.isArray(latestProgressLog.payloadJson)
      ? (latestProgressLog.payloadJson as Record<string, unknown>)
      : null;

  return {
    projectStatus: project.status,
    stageKey: typeof payload?.stageKey === "string" ? payload.stageKey : null,
    label: typeof payload?.label === "string" ? payload.label : null,
    progress:
      typeof payload?.progress === "number" ? Math.max(0, Math.min(100, payload.progress)) : null,
    updatedAt: latestProgressLog?.createdAt.toISOString() ?? null,
  };
}
