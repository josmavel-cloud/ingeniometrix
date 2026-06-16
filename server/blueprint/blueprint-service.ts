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
  BlueprintReferenceSnapshot,
} from "./blueprint-types";

const BLUEPRINT_PROMPT_VERSION = "ingeniometrix-blueprint-v3";
const DEFAULT_BLUEPRINT_AUX_TIMEOUT_MS = 6_000;
const DEFAULT_BLUEPRINT_DRAFT_TIMEOUT_MS = 12_000;

function getConfiguredTimeoutMs(envName: string, fallback: number) {
  const value = Number(process.env[envName]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} excedio ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function isEnglishProject(project: Pick<{ language: string | null }, "language">) {
  return project.language?.trim().toLowerCase().startsWith("en") ?? false;
}

function buildFallbackBlueprintDraft(input: {
  project: {
    title: string;
    templateKey: string;
    degreeLevel: ResearchBlueprintCoreDraft["degree_level"];
    university: string;
    program: string;
    language: string | null;
    projectReferences: Array<{
      selectedOrder: number | null;
      reference: {
        id: string;
        title: string;
        doi: string | null;
      };
    }>;
  };
  intake: {
    topic: string;
    problemContext: string | null;
    researchLine: string | null;
    academicConstraints: string | null;
    targetPopulation: string | null;
    availableData: string | null;
    preferredMethodology: string | null;
  };
}): ResearchBlueprintCoreDraft {
  const english = isEnglishProject(input.project);
  const topic = input.intake.topic;
  const problemContext =
    input.intake.problemContext ??
    (english
      ? "The problem requires further delimitation with the advisor."
      : "El problema requiere mayor delimitacion con el asesor.");
  const population =
    input.intake.targetPopulation ??
    (english
      ? "Population or unit of analysis to validate."
      : "Poblacion o unidad de analisis por validar.");
  const methodology =
    input.intake.preferredMethodology ??
    (english
      ? "Initial methodological approach to refine."
      : "Enfoque metodologico inicial por afinar.");

  return {
    project_title: input.project.title,
    template_key: input.project.templateKey,
    degree_level: input.project.degreeLevel,
    university: input.project.university,
    program: input.project.program,
    research_line:
      input.intake.researchLine ??
      (english
        ? "Research line to confirm with the institution."
        : "Linea de investigacion por confirmar con la institucion."),
    problem_statement: problemContext,
    problem_delimitation: [problemContext, population, input.intake.academicConstraints]
      .filter(Boolean)
      .join(" "),
    justification: english
      ? "This initial blueprint organizes the intake and selected traceable sources into a reviewable academic plan."
      : "Este blueprint inicial organiza el intake y las fuentes trazables seleccionadas en un plan academico revisable.",
    general_objective: english
      ? `Develop a traceable initial research plan for ${topic}.`
      : `Desarrollar un plan inicial de investigacion trazable sobre ${topic}.`,
    specific_objectives: english
      ? [
          `Delimit the problem and population related to ${topic}.`,
          "Identify methodological decisions that need advisor validation.",
          "Align the selected sources with objectives, questions, and assumptions.",
        ]
      : [
          `Delimitar el problema y la poblacion vinculados con ${topic}.`,
          "Identificar decisiones metodologicas que requieren validacion del asesor.",
          "Alinear las fuentes seleccionadas con objetivos, preguntas y supuestos.",
        ],
    research_questions: english
      ? [
          `How should the problem and population related to ${topic} be delimited?`,
          "Which methodological decisions require advisor validation?",
          "How do the selected sources support the initial objectives and assumptions?",
        ]
      : [
          `Como debe delimitarse el problema y la poblacion vinculados con ${topic}?`,
          "Que decisiones metodologicas requieren validacion del asesor?",
          "Como sostienen las fuentes seleccionadas los objetivos y supuestos iniciales?",
        ],
    proposed_methodology: methodology,
    population_and_sample: population,
    analysis_plan:
      input.intake.availableData ??
      (english
        ? "Analysis plan to refine once the available data and method are confirmed."
        : "Plan de analisis por afinar cuando se confirmen datos disponibles y metodo."),
    assumptions: english
      ? [
          "This fallback blueprint was generated because the LLM step did not finish within the configured timeout.",
          "No empirical results are asserted; selected sources are used only as traceable support for planning.",
          "Advisor review is required before treating the scope, method, or population as final.",
        ]
      : [
          "Este blueprint fallback se genero porque el paso LLM no termino dentro del timeout configurado.",
          "No se afirman resultados empiricos; las fuentes seleccionadas solo se usan como soporte trazable para planificacion.",
          "Se requiere revision del asesor antes de tratar alcance, metodo o poblacion como definitivos.",
        ],
    references_used: input.project.projectReferences.map((item) => ({
      reference_id: item.reference.id,
      title: item.reference.title,
      doi: item.reference.doi,
    })),
    limitations: english
      ? [
          "The output is a stable MVP fallback and should be refined with a full LLM pass when available.",
        ]
      : [
          "La salida es un fallback estable de MVP y debe refinarse con una corrida LLM completa cuando este disponible.",
        ],
  };
}

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
    const auxiliaryTimeoutMs = getConfiguredTimeoutMs(
      "BLUEPRINT_AUX_TIMEOUT_MS",
      DEFAULT_BLUEPRINT_AUX_TIMEOUT_MS,
    );
    const draftTimeoutMs = getConfiguredTimeoutMs(
      "BLUEPRINT_DRAFT_TIMEOUT_MS",
      DEFAULT_BLUEPRINT_DRAFT_TIMEOUT_MS,
    );

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
      antecedentSynthesis = await withTimeout(
        generateBlueprintAntecedentSynthesis({
          provider,
          project,
          intake,
          selectedReferences: project.projectReferences,
          referenceInsights,
        }),
        auxiliaryTimeoutMs,
        "Sintesis de antecedentes",
      );
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
      return withTimeout(
        generateBlueprintContextCompletion({
          provider,
          project,
          intake,
          referenceInsights,
          readinessSnapshot,
        }),
        auxiliaryTimeoutMs,
        "Completado de contexto",
      );
    };

    let assistedContext: BlueprintContextCompletion | null =
      readinessSnapshot.readiness_status === "assisted"
        ? await generateAssistedContextIfNeeded().catch(() => null)
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
      rawBlueprint = await withTimeout(
        generateBlueprintDraftAttempt({
          provider,
          prompt: buildAttemptPrompt(assistedContext),
        }),
        draftTimeoutMs,
        "Redaccion del blueprint",
      );
    } catch {
      if (!assistedContext) {
        assistedContext = await generateAssistedContextIfNeeded().catch(() => null);

        try {
          rawBlueprint = await withTimeout(
            generateBlueprintDraftAttempt({
              provider,
              prompt: buildAttemptPrompt(assistedContext),
            }),
            draftTimeoutMs,
            "Redaccion del blueprint con contexto asistido",
          );
        } catch {
          rawBlueprint = buildFallbackBlueprintDraft({
            project,
            intake,
          });
        }
      } else {
        rawBlueprint = buildFallbackBlueprintDraft({
          project,
          intake,
        });
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
          language: project.language,
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
