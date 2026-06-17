import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BlueprintJobStageStatus,
  BlueprintJobStatus,
  ExportStatus,
  GeneratedArtifactKind,
  Prisma,
  ProjectStatus,
  Provider,
  type BlueprintJob,
} from "@prisma/client";

import { normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import { getConfiguredLlmProvider } from "@/llm";
import { upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";
import { logAuditEvent } from "@/server/audit/audit-service";
import { loadBlueprintTemplateContext } from "@/server/blueprint/blueprint-engine";
import { BlueprintGenerationError } from "@/server/blueprint/blueprint-errors";
import { buildLegacyBlueprintFromMaster } from "@/server/blueprint-v2/compose/blueprint-composition-engine";
import { deriveUniversityBlueprint } from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";
import { buildEvidenceLedger } from "@/server/blueprint-v2/evidence/evidence-ledger-engine";
import { runEvidenceExtractionEngine } from "@/server/blueprint-v2/evidence/evidence-extraction-engine";
import { runPdfAvailabilityAndDownloadEngine } from "@/server/blueprint-v2/evidence/pdf-availability-and-download-engine";
import {
  completeBlueprintRunManifest,
  createBlueprintRunManifest,
  pushBlueprintRunStage,
} from "@/server/blueprint-v2/orchestrator/blueprint-run-manager";
import { buildAssumptionInputs } from "@/server/blueprint-v2/orchestrator/master-blueprint-engine";
import { planMasterTemplateSectionPrompts } from "@/server/blueprint-v2/prompts/section-prompt-planner";
import {
  buildConsistencyMatrixArtifactFromSections,
  buildConsistencyMatrixArtifactFromSectionsWithLlm,
  type ConsistencyMatrixArtifact,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import { generateSectionDraftsForKeys } from "@/server/blueprint-v2/sections/section-generation-engine";
import { runEvidenceAcquisitionEngine } from "@/server/blueprint-v2/source/evidence-acquisition-engine";
import { runSourceIntakeGate } from "@/server/blueprint-v2/source/source-intake-gate";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type {
  AssumptionInput,
  BlueprintRunManifest,
  BlueprintRunStageKey,
  ConsistencyMatrixRow,
  DocumentProvenanceReport,
  EvidenceAcquisitionResult,
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterBlueprintPackage,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  MasterTemplateRuntime,
  PdfDownloadResult,
  SectionPromptPlan,
  SourceIntakeGateResult,
  UniversityBlueprintPackage,
} from "@/server/blueprint-v2/types";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import { validateMasterBlueprintPackage } from "@/server/blueprint-v2/validation/blueprint-validation-engine";

const BLUEPRINT_PROMPT_VERSION = "master-blueprint-engine-v1";
const ACTIVE_JOB_STATUSES = [
  BlueprintJobStatus.QUEUED,
  BlueprintJobStatus.RUNNING,
  BlueprintJobStatus.WAITING_NEXT_STAGE,
] as const;
const STALE_LOCK_MS = 8 * 60 * 1000;
const SECTION_BATCH_SIZE = Math.max(
  1,
  Number(process.env.BLUEPRINT_SECTION_BATCH_SIZE ?? "2") || 2,
);
const DEFAULT_DRAIN_MAX_STAGES = Math.max(
  1,
  Number(process.env.BLUEPRINT_DRAIN_MAX_STAGES ?? "3") || 3,
);
const DEFAULT_DRAIN_TIME_BUDGET_MS = Math.max(
  30_000,
  Number(process.env.BLUEPRINT_DRAIN_TIME_BUDGET_MS ?? "210000") || 210_000,
);

type EvidenceExtractionResult = Awaited<ReturnType<typeof runEvidenceExtractionEngine>>;
type CoherenceReport = Awaited<
  ReturnType<typeof validateMasterBlueprintPackage>
>["coherenceReport"];

type BlueprintJobData = {
  manifest: BlueprintRunManifest;
  versionNumber: number;
  sourceGate?: SourceIntakeGateResult;
  assumptions?: AssumptionInput[];
  acquisition?: EvidenceAcquisitionResult;
  pdfDownloads?: PdfDownloadResult;
  extraction?: EvidenceExtractionResult;
  evidenceLedger?: EvidenceLedger;
  masterTemplate?: MasterTemplateRuntime;
  promptPlan?: SectionPromptPlan;
  sectionKeys?: string[];
  sectionCursor?: number;
  drafts?: MasterSectionDraft[];
  consistencyMatrix?: ConsistencyMatrixRow[];
  consistencyMatrixArtifact?: ConsistencyMatrixArtifact;
  provenanceReport?: DocumentProvenanceReport;
  validationReport?: MasterBlueprintValidationReport;
  coherenceReport?: CoherenceReport;
  legacyBlueprint?: Record<string, unknown>;
  universityBlueprint?: UniversityBlueprintPackage;
};

function isActiveBlueprintJobStatus(status: BlueprintJobStatus) {
  return ACTIVE_JOB_STATUSES.some((activeStatus) => activeStatus === status);
}

export type BlueprintJobSummary = {
  id: string;
  projectId: string;
  status: BlueprintJobStatus;
  currentStage: string | null;
  progress: number;
  language: string;
  runnerKind: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type BlueprintProgressSummary = {
  projectStatus: ProjectStatus;
  jobId: string | null;
  jobStatus: BlueprintJobStatus | null;
  stageKey: string | null;
  label: string | null;
  progress: number | null;
  updatedAt: string | null;
  errorMessage: string | null;
  shouldNudge: boolean;
};

function toJobSummary(job: BlueprintJob): BlueprintJobSummary {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    currentStage: job.currentStage,
    progress: job.progress,
    language: job.language,
    runnerKind: job.runnerKind,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function asJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readJobData(job: Pick<BlueprintJob, "stageDataJson">): BlueprintJobData {
  if (
    job.stageDataJson &&
    typeof job.stageDataJson === "object" &&
    !Array.isArray(job.stageDataJson)
  ) {
    return job.stageDataJson as unknown as BlueprintJobData;
  }

  throw new Error("El job no tiene estado interno suficiente para continuar.");
}

function getNextResetStatus(project: MasterBlueprintEngineProject) {
  return project.projectReferences.length > 0
    ? ProjectStatus.SOURCES_SELECTED
    : ProjectStatus.INTAKE_READY;
}

function getStageLabel(input: {
  language: string;
  stageKey: string;
  progressDetail?: string;
}) {
  const english = input.language === "en";
  const labels: Record<string, { es: string; en: string }> = {
    preparing: {
      es: "Preparando MasterBlueprintEngine",
      en: "Preparing MasterBlueprintEngine",
    },
    gating_sources: {
      es: "Validando intake y fuentes base",
      en: "Validating intake and base sources",
    },
    acquiring_evidence: {
      es: "Complementando evidencia bibliografica",
      en: "Complementing bibliographic evidence",
    },
    downloading_pdfs: {
      es: "Descargando PDFs publicos",
      en: "Downloading public PDFs",
    },
    extracting_evidence: {
      es: "Extrayendo evidencia estructurada",
      en: "Extracting structured evidence",
    },
    planning_sections: {
      es: "Cargando MasterTemplate y planificando prompts",
      en: "Loading MasterTemplate and planning prompts",
    },
    generating_sections: {
      es: "Generando secciones del MasterTemplate",
      en: "Generating MasterTemplate sections",
    },
    building_matrix: {
      es: "Construyendo matriz de consistencia",
      en: "Building consistency matrix",
    },
    composing_blueprint: {
      es: "Componiendo blueprint maestro",
      en: "Composing master blueprint",
    },
    validating_blueprint: {
      es: "Validando trazabilidad y coherencia",
      en: "Validating traceability and coherence",
    },
    deriving_university_blueprint: {
      es: "Derivando blueprint universitario",
      en: "Deriving university blueprint",
    },
    persisting: {
      es: "Persistiendo version de blueprint",
      en: "Persisting blueprint version",
    },
    completed: {
      es: "Blueprint listo",
      en: "Blueprint ready",
    },
    failed: {
      es: "El run encontro un bloqueo",
      en: "The run hit a blocking issue",
    },
  };
  const label = labels[input.stageKey]?.[english ? "en" : "es"] ?? input.stageKey;

  return input.progressDetail ? `${label} (${input.progressDetail})` : label;
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildSectionKeys(promptPlan: SectionPromptPlan) {
  return promptPlan.generation_plan
    .map((planItem) =>
      planItem.section_key === "consistency_matrix"
        ? null
        : planItem.section_key,
    )
    .filter((sectionKey): sectionKey is string => Boolean(sectionKey));
}

function buildConsistencyMatrixDraft(input: {
  language: string;
  drafts: MasterSectionDraft[];
  consistencyMatrixArtifact: ConsistencyMatrixArtifact;
}) {
  const matrixIsEnglish = input.language === "en";
  const matrixLabels = matrixIsEnglish
    ? {
        title: "Consistency matrix",
        question: "Question",
        objective: "Objective",
        hypothesis: "Hypothesis",
        method: "Method",
        technique: "Technique",
        missing: "To be specified",
        prompt:
          "Generated at the end of the run from the already consolidated objectives, questions, methodology, variables/categories, and techniques.",
      }
    : {
        title: "Matriz de consistencia",
        question: "Interrogante",
        objective: "Objetivo",
        hypothesis: "Hipotesis",
        method: "Metodo",
        technique: "Tecnica",
        missing: "Por precisar",
        prompt:
          "Generada al final del run a partir de objetivos, preguntas, metodologia, variables/categorias y tecnicas ya consolidadas.",
      };

  return {
    section_key: "consistency_matrix",
    title: matrixLabels.title,
    phase: "matrix",
    content: input.consistencyMatrixArtifact.specific_rows
      .map(
        (row) =>
          `${row.row_id ?? `OE${row.index}`}. ${matrixLabels.question}: ${
            row.interrogante_especifica ?? matrixLabels.missing
          } | ${matrixLabels.objective}: ${
            row.objetivo_especifico ?? matrixLabels.missing
          } | ${matrixLabels.hypothesis}: ${
            row.hipotesis_especifica ?? matrixLabels.missing
          } | ${matrixLabels.method}: ${
            row.metodo_vinculado ?? matrixLabels.missing
          } | ${matrixLabels.technique}: ${row.tecnica ?? matrixLabels.missing}`,
      )
      .join("\n"),
    content_kind: "table",
    support_level: "reference_supported",
    supported_source_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_source_ids)),
    ),
    supported_pdf_source_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_pdf_source_ids)),
    ),
    supported_web_source_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_web_source_ids)),
    ),
    supported_assumption_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_assumption_ids)),
    ),
    evidence_snippet_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.evidence_snippet_ids)),
    ),
    warnings: input.consistencyMatrixArtifact.validation.warnings,
    prompt: matrixLabels.prompt,
  } satisfies MasterSectionDraft;
}

async function writeFatalRunArtifact(input: {
  runId: string;
  projectId: string;
  error: unknown;
}) {
  const artifactDir = path.join(
    process.cwd(),
    "artifacts-local",
    "master-blueprint-engine",
    input.runId,
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "fatal-error.json"),
    `${JSON.stringify(
      {
        projectId: input.projectId,
        runId: input.runId,
        name: input.error instanceof Error ? input.error.name : "UnknownError",
        message: input.error instanceof Error ? input.error.message : String(input.error),
        stack: input.error instanceof Error ? input.error.stack ?? null : null,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function sanitizeArtifactFileName(value: string) {
  const sanitized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return sanitized || "artifact";
}

async function persistDownloadedPdfArtifacts(input: {
  userId: string;
  projectId: string;
  jobId: string;
  pdfDownloads: PdfDownloadResult;
}) {
  for (const record of input.pdfDownloads.records) {
    if (record.status !== "downloaded" || !record.stored_file_path) {
      continue;
    }

    try {
      const content = await readFile(record.stored_file_path);
      const fileName = `${sanitizeArtifactFileName(record.source_id)}.pdf`;

      await upsertGeneratedArtifact({
        userId: input.userId,
        projectId: input.projectId,
        jobId: input.jobId,
        kind: GeneratedArtifactKind.SOURCE_PDF,
        fileName,
        mimeType: "application/pdf",
        content,
        metadataJson: {
          sourceId: record.source_id,
          title: record.title,
          pdfUrl: record.pdf_url,
          resolvedPdfUrl: record.resolved_pdf_url,
          accessStrategy: record.access_strategy,
          httpStatus: record.http_status,
          storedFilePath: record.stored_file_path,
          reportedFileSizeBytes: record.file_size_bytes,
        },
      });
    } catch (error) {
      console.warn("[blueprint-job] could not persist downloaded PDF artifact", {
        jobId: input.jobId,
        sourceId: record.source_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function loadProjectForBlueprint(userId: string, projectId: string) {
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
      message: "El proyecto aun no tiene una base de intake suficiente para generar el blueprint.",
      nextAction: "Completa el intake estructurado antes de volver a intentar.",
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

  return project;
}

async function updateJobStage(input: {
  jobId: string;
  stageKey: string;
  status: BlueprintJobStageStatus;
  progress: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  inputJson?: unknown;
  outputJson?: unknown;
  errorJson?: unknown;
}) {
  const existing = await prisma.blueprintJobStage.findUnique({
    where: {
      jobId_stageKey: {
        jobId: input.jobId,
        stageKey: input.stageKey,
      },
    },
  });
  const completedAt = input.completedAt ?? null;
  const startedAt = input.startedAt ?? existing?.startedAt ?? new Date();

  await prisma.blueprintJobStage.upsert({
    where: {
      jobId_stageKey: {
        jobId: input.jobId,
        stageKey: input.stageKey,
      },
    },
    create: {
      jobId: input.jobId,
      stageKey: input.stageKey,
      status: input.status,
      progress: input.progress,
      startedAt,
      completedAt,
      durationMs:
        completedAt && startedAt
          ? Math.max(0, completedAt.getTime() - startedAt.getTime())
          : null,
      inputJson:
        input.inputJson === undefined ? undefined : asJsonValue(input.inputJson),
      outputJson:
        input.outputJson === undefined ? undefined : asJsonValue(input.outputJson),
      errorJson:
        input.errorJson === undefined ? undefined : asJsonValue(input.errorJson),
    },
    update: {
      status: input.status,
      progress: input.progress,
      startedAt,
      completedAt,
      durationMs:
        completedAt && startedAt
          ? Math.max(0, completedAt.getTime() - startedAt.getTime())
          : undefined,
      inputJson:
        input.inputJson === undefined ? undefined : asJsonValue(input.inputJson),
      outputJson:
        input.outputJson === undefined ? undefined : asJsonValue(input.outputJson),
      errorJson:
        input.errorJson === undefined ? undefined : asJsonValue(input.errorJson),
    },
  });
}

async function persistJobProgress(input: {
  jobId: string;
  data: BlueprintJobData;
  currentStage: string;
  progress: number;
  status?: BlueprintJobStatus;
  errorMessage?: string | null;
}) {
  const now = new Date();

  return prisma.blueprintJob.update({
    where: { id: input.jobId },
    data: {
      status: input.status ?? BlueprintJobStatus.WAITING_NEXT_STAGE,
      currentStage: input.currentStage,
      progress: clampProgress(input.progress),
      lastHeartbeatAt: now,
      lockedAt: null,
      errorMessage: input.errorMessage,
      stageDataJson: asJsonValue(input.data),
    },
  });
}

async function pushJobStage(input: {
  job: BlueprintJob;
  data: BlueprintJobData;
  stageKey: string;
  progress: number;
  progressDetail?: string;
}) {
  const label = getStageLabel({
    language: input.job.language,
    stageKey: input.stageKey,
    progressDetail: input.progressDetail,
  });

  await pushBlueprintRunStage({
    manifest: input.data.manifest,
    stageKey: input.stageKey as BlueprintRunStageKey,
    label,
    progress: clampProgress(input.progress),
  });
  await updateJobStage({
    jobId: input.job.id,
    stageKey: input.stageKey,
    status: BlueprintJobStageStatus.RUNNING,
    progress: clampProgress(input.progress),
  });
}

function buildBlueprintPackage(input: {
  data: BlueprintJobData;
}): MasterBlueprintPackage {
  const required = [
    input.data.sourceGate,
    input.data.acquisition,
    input.data.pdfDownloads,
    input.data.evidenceLedger,
    input.data.masterTemplate,
    input.data.promptPlan,
    input.data.drafts,
    input.data.consistencyMatrix,
    input.data.consistencyMatrixArtifact,
    input.data.provenanceReport,
    input.data.validationReport,
    input.data.legacyBlueprint,
    input.data.universityBlueprint,
  ];

  if (required.some((value) => !value)) {
    throw new Error("El paquete del blueprint esta incompleto y no puede persistirse.");
  }

  return {
    manifest: input.data.manifest,
    source_gate: input.data.sourceGate!,
    acquisition: input.data.acquisition!,
    pdf_downloads: input.data.pdfDownloads!,
    evidence_ledger: input.data.evidenceLedger!,
    master_template: input.data.masterTemplate!,
    section_prompt_plan: input.data.promptPlan!,
    master_section_drafts: input.data.drafts!,
    consistency_matrix: input.data.consistencyMatrix!,
    consistency_matrix_artifact: input.data.consistencyMatrixArtifact!,
    provenance_report: input.data.provenanceReport!,
    validation_report: input.data.validationReport!,
    legacy_blueprint: input.data.legacyBlueprint as MasterBlueprintPackage["legacy_blueprint"],
    university_blueprint: input.data.universityBlueprint!,
  };
}

export async function enqueueBlueprintJobForUser(
  userId: string,
  projectId: string,
  options?: {
    languageOverride?: string | null;
  },
) {
  const project = await loadProjectForBlueprint(userId, projectId);
  const existingJob = await prisma.blueprintJob.findFirst({
    where: {
      projectId,
      userId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  const now = Date.now();

  if (existingJob) {
    const heartbeatAt =
      existingJob.lastHeartbeatAt ?? existingJob.lockedAt ?? existingJob.updatedAt;
    const isStale = now - heartbeatAt.getTime() > STALE_LOCK_MS;

    if (!isStale) {
      return toJobSummary(existingJob);
    }

    await prisma.blueprintJob.update({
      where: { id: existingJob.id },
      data: {
        status: BlueprintJobStatus.FAILED,
        lockedAt: null,
        completedAt: new Date(),
        errorMessage:
          "El job anterior quedo detenido por timeout y fue cerrado para iniciar uno nuevo.",
      },
    });
  }

  const effectiveLanguage =
    normalizeLanguageCode(options?.languageOverride) ??
    normalizeLanguageCode(project.language) ??
    "es";
  const manifest = createBlueprintRunManifest({
    userId,
    projectId: project.id,
    selectedTemplateKey: project.templateKey,
  });
  const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
  const stageData: BlueprintJobData = {
    manifest,
    versionNumber,
    sectionCursor: 0,
    drafts: [],
  };

  const job = await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        status: ProjectStatus.BLUEPRINT_GENERATING,
        language: effectiveLanguage,
      },
    });

    return tx.blueprintJob.create({
      data: {
        projectId: project.id,
        userId,
        status: BlueprintJobStatus.QUEUED,
        currentStage: "preparing",
        progress: 4,
        language: effectiveLanguage,
        runnerKind: process.env.BLUEPRINT_RUNNER_KIND?.trim() || "vercel",
        lastHeartbeatAt: new Date(),
        metadataJson: {
          promptVersion: BLUEPRINT_PROMPT_VERSION,
          deploymentTarget: "vercel",
        },
        stageDataJson: asJsonValue(stageData),
      },
    });
  });

  await logAuditEvent({
    eventType: "BLUEPRINT_JOB_ENQUEUED",
    actorType: "SYSTEM",
    provider: Provider.OPENAI,
    userId,
    projectId: project.id,
    payloadJson: {
      jobId: job.id,
      versionNumber,
      language: effectiveLanguage,
      runnerKind: job.runnerKind,
      runId: manifest.run_id,
    },
  });

  return toJobSummary(job);
}

export async function runNextBlueprintJobStage(jobId: string) {
  const staleLockCutoff = new Date(Date.now() - STALE_LOCK_MS);
  const lockResult = await prisma.blueprintJob.updateMany({
    where: {
      id: jobId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
      OR: [
        { lockedAt: null },
        { lockedAt: { lt: staleLockCutoff } },
        { status: { not: BlueprintJobStatus.RUNNING } },
      ],
    },
    data: {
      status: BlueprintJobStatus.RUNNING,
      lockedAt: new Date(),
      lastHeartbeatAt: new Date(),
      attempts: {
        increment: 1,
      },
      startedAt: new Date(),
    },
  });

  if (lockResult.count === 0) {
    const lockedJob = await prisma.blueprintJob.findUnique({
      where: { id: jobId },
    });

    return {
      job: lockedJob ? toJobSummary(lockedJob) : null,
      shouldContinue: false,
      state: "locked_or_finished" as const,
    };
  }

  const job = await prisma.blueprintJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return {
      job: null,
      shouldContinue: false,
      state: "missing" as const,
    };
  }

  const project = await loadProjectForBlueprint(job.userId, job.projectId);
  if (!project.intake) {
    throw new BlueprintGenerationError({
      code: "INTAKE_INCOMPLETE",
      message: "El proyecto aun no tiene intake suficiente para continuar.",
      nextAction: "Completa el intake estructurado antes de volver a intentar.",
    });
  }
  const readyProject: MasterBlueprintEngineProject = {
    ...project,
    language: normalizeLanguageCode(job.language) ?? "es",
    intake: project.intake,
  };
  const data = readJobData(job);
  const currentStage = job.currentStage ?? "preparing";

  try {
    if (currentStage === "preparing") {
      await pushJobStage({ job, data, stageKey: "preparing", progress: 4 });
      await updateJobStage({
        jobId: job.id,
        stageKey: "preparing",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 4,
        completedAt: new Date(),
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "gating_sources",
        progress: 8,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "gating_sources") {
      await pushJobStage({ job, data, stageKey: "gating_sources", progress: 12 });
      data.sourceGate = runSourceIntakeGate(readyProject);
      data.assumptions = buildAssumptionInputs(readyProject);
      await updateJobStage({
        jobId: job.id,
        stageKey: "gating_sources",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 12,
        completedAt: new Date(),
        outputJson: {
          selectedSourceCount: data.sourceGate.selected_source_count,
          warningCount: data.sourceGate.coverage_warnings.length,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "acquiring_evidence",
        progress: 18,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "acquiring_evidence") {
      if (!data.sourceGate) {
        throw new Error("Falta el resultado de validacion de fuentes.");
      }

      await pushJobStage({ job, data, stageKey: "acquiring_evidence", progress: 24 });
      data.acquisition = await runEvidenceAcquisitionEngine({
        project: readyProject,
        sourceGate: data.sourceGate,
      });
      await updateJobStage({
        jobId: job.id,
        stageKey: "acquiring_evidence",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 24,
        completedAt: new Date(),
        outputJson: {
          sourceCount: data.acquisition.source_registry.length,
          warningCount: data.acquisition.warnings.length,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "downloading_pdfs",
        progress: 30,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "downloading_pdfs") {
      if (!data.acquisition) {
        throw new Error("Falta el registro de fuentes para descargar PDFs.");
      }

      await pushJobStage({ job, data, stageKey: "downloading_pdfs", progress: 34 });
      data.pdfDownloads = await runPdfAvailabilityAndDownloadEngine({
        manifest: data.manifest,
        sourceRegistry: data.acquisition.source_registry,
      });
      await persistDownloadedPdfArtifacts({
        userId: readyProject.userId,
        projectId: readyProject.id,
        jobId: job.id,
        pdfDownloads: data.pdfDownloads,
      });
      await updateJobStage({
        jobId: job.id,
        stageKey: "downloading_pdfs",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 34,
        completedAt: new Date(),
        outputJson: {
          downloadedCount: data.pdfDownloads.records.filter(
            (record) => record.status === "downloaded",
          ).length,
          warningCount: data.pdfDownloads.warnings.length,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "extracting_evidence",
        progress: 40,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "extracting_evidence") {
      if (!data.acquisition || !data.pdfDownloads || !data.assumptions) {
        throw new Error("Faltan insumos para extraer evidencia.");
      }

      await pushJobStage({ job, data, stageKey: "extracting_evidence", progress: 44 });
      data.extraction = await runEvidenceExtractionEngine({
        sourceRegistry: data.acquisition.source_registry,
        pdfDownloads: data.pdfDownloads,
        assumptions: data.assumptions,
      });
      data.evidenceLedger = buildEvidenceLedger({
        sourceRegistry: data.acquisition.source_registry,
        evidencePacks: data.extraction.evidencePacks,
        assumptions: data.assumptions,
        assumptionSnippets: data.extraction.assumptionSnippets,
        warnings: [
          ...data.acquisition.warnings,
          ...data.pdfDownloads.warnings,
          ...data.extraction.warnings,
        ],
      });
      await updateJobStage({
        jobId: job.id,
        stageKey: "extracting_evidence",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 44,
        completedAt: new Date(),
        outputJson: {
          evidencePackCount: data.extraction.evidencePacks.length,
          snippetCount: data.evidenceLedger.snippets.length,
          warningCount: data.evidenceLedger.warnings.length,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "planning_sections",
        progress: 50,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "planning_sections") {
      if (!data.evidenceLedger) {
        throw new Error("Falta el ledger de evidencia para planificar secciones.");
      }

      await pushJobStage({ job, data, stageKey: "planning_sections", progress: 54 });
      data.masterTemplate = await loadMasterTemplateRuntimeV2();
      data.manifest.master_template_version_id = data.masterTemplate.template_version_id;
      data.promptPlan = planMasterTemplateSectionPrompts({
        project: readyProject,
        masterTemplate: data.masterTemplate,
        evidenceLedger: data.evidenceLedger,
      });
      data.sectionKeys = buildSectionKeys(data.promptPlan);
      data.sectionCursor = 0;
      data.drafts = [];
      await updateJobStage({
        jobId: job.id,
        stageKey: "planning_sections",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 54,
        completedAt: new Date(),
        outputJson: {
          sectionCount: data.sectionKeys.length,
          templateVersionId: data.masterTemplate.template_version_id,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "generating_sections",
        progress: 58,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "generating_sections") {
      if (
        !data.masterTemplate ||
        !data.evidenceLedger ||
        !data.promptPlan ||
        !data.sectionKeys
      ) {
        throw new Error("Faltan insumos para generar secciones.");
      }

      const cursor = data.sectionCursor ?? 0;
      const sectionKeys = data.sectionKeys;
      const batchKeys = sectionKeys.slice(cursor, cursor + SECTION_BATCH_SIZE);
      const detail = `${Math.min(cursor + batchKeys.length, sectionKeys.length)}/${sectionKeys.length}`;
      const progress = 58 + (sectionKeys.length > 0 ? (14 * cursor) / sectionKeys.length : 14);

      await pushJobStage({
        job,
        data,
        stageKey: "generating_sections",
        progress,
        progressDetail: detail,
      });

      if (batchKeys.length > 0) {
        const nextDrafts = await generateSectionDraftsForKeys({
          project: readyProject,
          masterTemplate: data.masterTemplate,
          evidenceLedger: data.evidenceLedger,
          promptPlan: data.promptPlan,
          sectionKeys: batchKeys,
          existingDrafts: data.drafts ?? [],
        });
        data.drafts = [...(data.drafts ?? []), ...nextDrafts];
        data.sectionCursor = cursor + batchKeys.length;
      }

      const completed = (data.sectionCursor ?? 0) >= sectionKeys.length;
      const nextProgress = completed
        ? 72
        : 58 + (14 * (data.sectionCursor ?? 0)) / Math.max(1, sectionKeys.length);

      await updateJobStage({
        jobId: job.id,
        stageKey: "generating_sections",
        status: completed
          ? BlueprintJobStageStatus.COMPLETED
          : BlueprintJobStageStatus.QUEUED,
        progress: clampProgress(nextProgress),
        completedAt: completed ? new Date() : null,
        outputJson: {
          completedSections: data.sectionCursor ?? 0,
          totalSections: sectionKeys.length,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: completed ? "building_matrix" : "generating_sections",
        progress: nextProgress,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "building_matrix") {
      if (!data.drafts) {
        throw new Error("Faltan borradores para construir la matriz.");
      }

      await pushJobStage({ job, data, stageKey: "building_matrix", progress: 76 });
      data.consistencyMatrixArtifact =
        await buildConsistencyMatrixArtifactFromSectionsWithLlm({
          drafts: data.drafts,
          provider: getConfiguredLlmProvider(),
          language: readyProject.language,
        }).catch(() =>
          buildConsistencyMatrixArtifactFromSections(data.drafts!, {
            language: readyProject.language,
          }),
        );
      data.consistencyMatrix = data.consistencyMatrixArtifact.legacy_rows;
      data.drafts = [
        ...data.drafts,
        buildConsistencyMatrixDraft({
          language: readyProject.language,
          drafts: data.drafts,
          consistencyMatrixArtifact: data.consistencyMatrixArtifact,
        }),
      ];
      await updateJobStage({
        jobId: job.id,
        stageKey: "building_matrix",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 76,
        completedAt: new Date(),
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "composing_blueprint",
        progress: 80,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "composing_blueprint") {
      if (!data.drafts || !data.evidenceLedger || !data.consistencyMatrix || !data.sourceGate) {
        throw new Error("Faltan insumos para componer el blueprint.");
      }

      await pushJobStage({ job, data, stageKey: "composing_blueprint", progress: 84 });
      const templateContext = await loadBlueprintTemplateContext(readyProject);
      const { legacyBlueprint } = buildLegacyBlueprintFromMaster({
        projectTitle: readyProject.title,
        projectTemplateKey: readyProject.templateKey,
        projectDegreeLevel: readyProject.degreeLevel,
        projectUniversity: readyProject.university,
        projectProgram: readyProject.program,
        researchLine: readyProject.intake.researchLine,
        drafts: data.drafts,
        evidenceLedger: data.evidenceLedger,
        consistencyMatrix: data.consistencyMatrix,
        templateContext,
        sourceGate: data.sourceGate,
      });
      data.legacyBlueprint = legacyBlueprint as Record<string, unknown>;
      data.provenanceReport = buildDocumentProvenanceReport(data.drafts);
      await updateJobStage({
        jobId: job.id,
        stageKey: "composing_blueprint",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 84,
        completedAt: new Date(),
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "validating_blueprint",
        progress: 88,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "validating_blueprint") {
      if (
        !data.masterTemplate ||
        !data.evidenceLedger ||
        !data.drafts ||
        !data.legacyBlueprint ||
        !data.provenanceReport ||
        !data.pdfDownloads
      ) {
        throw new Error("Faltan insumos para validar el blueprint.");
      }

      await pushJobStage({ job, data, stageKey: "validating_blueprint", progress: 90 });
      const { validationReport, coherenceReport } = await validateMasterBlueprintPackage({
        project: readyProject,
        masterTemplate: data.masterTemplate,
        evidenceLedger: data.evidenceLedger,
        drafts: data.drafts,
        legacyBlueprint:
          data.legacyBlueprint as MasterBlueprintPackage["legacy_blueprint"],
        provenanceReport: data.provenanceReport,
        pdfDownloadedCount: data.pdfDownloads.records.filter(
          (record) => record.status === "downloaded",
        ).length,
      });
      data.validationReport = validationReport;
      data.coherenceReport = coherenceReport;
      await updateJobStage({
        jobId: job.id,
        stageKey: "validating_blueprint",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 90,
        completedAt: new Date(),
        outputJson: {
          hardFailures: validationReport.quality_report.hard_failures.length,
          warnings: validationReport.warnings.length,
        },
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "deriving_university_blueprint",
        progress: 94,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "deriving_university_blueprint") {
      if (!data.drafts) {
        throw new Error("Faltan borradores para derivar el blueprint universitario.");
      }

      await pushJobStage({
        job,
        data,
        stageKey: "deriving_university_blueprint",
        progress: 96,
      });
      data.universityBlueprint = await deriveUniversityBlueprint({
        project: readyProject,
        masterDrafts: data.drafts,
      });
      await updateJobStage({
        jobId: job.id,
        stageKey: "deriving_university_blueprint",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 96,
        completedAt: new Date(),
      });
      const updatedJob = await persistJobProgress({
        jobId: job.id,
        data,
        currentStage: "persisting",
        progress: 98,
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: true,
        state: "continued" as const,
      };
    }

    if (currentStage === "persisting") {
      await pushJobStage({ job, data, stageKey: "persisting", progress: 98 });
      const blueprintPackage = buildBlueprintPackage({ data });
      completeBlueprintRunManifest(
        data.manifest,
        blueprintPackage.master_template.template_version_id,
      );

      const blueprintJson = {
        ...blueprintPackage.legacy_blueprint,
        language: readyProject.language,
        master_blueprint_engine: blueprintPackage,
        provenance_report: blueprintPackage.provenance_report,
        university_blueprint: blueprintPackage.university_blueprint,
      };
      const createdVersion = await prisma.blueprintVersion.create({
        data: {
          projectId: readyProject.id,
          versionNumber: data.versionNumber,
          model: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
          promptVersion: BLUEPRINT_PROMPT_VERSION,
          intakeSnapshotJson: {
            language: readyProject.language,
            topic: readyProject.intake.topic,
            problemContext: readyProject.intake.problemContext,
            researchLine: readyProject.intake.researchLine,
            academicConstraints: readyProject.intake.academicConstraints,
            targetPopulation: readyProject.intake.targetPopulation,
            availableData: readyProject.intake.availableData,
            preferredMethodology: readyProject.intake.preferredMethodology,
            advisorNotes: readyProject.intake.advisorNotes,
            searchQuery: readyProject.intake.searchQuery,
          },
          selectedReferencesSnapshotJson:
            blueprintPackage.acquisition.source_registry.map((source) => ({
              project_reference_id:
                readyProject.projectReferences.find(
                  (item) => item.reference.id === source.reference_id,
                )?.id ?? null,
              selected_order: source.selected_order,
              reference_id: source.source_id,
              origin: source.origin,
              reference_origin_id: source.reference_id,
              title: source.title,
              doi: source.doi,
              authors: source.authors,
              year: source.year,
              venue: source.venue,
              abstract: source.abstract,
              landing_page_url: source.landing_page_url,
              pdf_url: source.pdf_url,
              eligible_for_formal_reference: source.eligible_for_formal_reference,
            })),
          blueprintJson: blueprintJson as Prisma.InputJsonValue,
          coherenceReportJson: data.coherenceReport as Prisma.InputJsonValue,
          exportStatus: ExportStatus.PENDING,
        },
      });

      await prisma.project.update({
        where: { id: readyProject.id },
        data: {
          status: ProjectStatus.BLUEPRINT_READY,
        },
      });
      await updateJobStage({
        jobId: job.id,
        stageKey: "persisting",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 98,
        completedAt: new Date(),
        outputJson: {
          blueprintVersionId: createdVersion.id,
          versionNumber: createdVersion.versionNumber,
        },
      });
      await pushJobStage({ job, data, stageKey: "completed", progress: 100 });
      await updateJobStage({
        jobId: job.id,
        stageKey: "completed",
        status: BlueprintJobStageStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
      });
      const updatedJob = await prisma.blueprintJob.update({
        where: { id: job.id },
        data: {
          status: BlueprintJobStatus.COMPLETED,
          currentStage: "completed",
          progress: 100,
          lockedAt: null,
          lastHeartbeatAt: new Date(),
          completedAt: new Date(),
          stageDataJson: asJsonValue(data),
        },
      });

      await logAuditEvent({
        eventType: "BLUEPRINT_GENERATED",
        actorType: "SYSTEM",
        provider: Provider.OPENAI,
        userId: readyProject.userId,
        projectId: readyProject.id,
        payloadJson: {
          jobId: job.id,
          versionNumber: data.versionNumber,
          promptVersion: BLUEPRINT_PROMPT_VERSION,
          language: readyProject.language,
          runId: data.manifest.run_id,
          engineName: data.manifest.engine_name,
          engineVersion: data.manifest.engine_version,
          masterTemplateVersionId: data.manifest.master_template_version_id,
        },
      });

      return {
        job: toJobSummary(updatedJob),
        shouldContinue: false,
        state: "completed" as const,
      };
    }

    throw new Error(`Etapa de blueprint no reconocida: ${currentStage}.`);
  } catch (error) {
    await writeFatalRunArtifact({
      runId: data.manifest.run_id,
      projectId: readyProject.id,
      error,
    }).catch(() => undefined);
    await pushBlueprintRunStage({
      manifest: data.manifest,
      stageKey: "failed",
      label: getStageLabel({
        language: job.language,
        stageKey: "failed",
      }),
      progress: 100,
    }).catch(() => undefined);
    await updateJobStage({
      jobId: job.id,
      stageKey: currentStage,
      status: BlueprintJobStageStatus.FAILED,
      progress: job.progress,
      completedAt: new Date(),
      errorJson: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
      },
    }).catch(() => undefined);
    await prisma.project.update({
      where: { id: readyProject.id },
      data: {
        status: getNextResetStatus(readyProject),
      },
    });
    const updatedJob = await prisma.blueprintJob.update({
      where: { id: job.id },
      data: {
        status: BlueprintJobStatus.FAILED,
        currentStage,
        progress: 100,
        lockedAt: null,
        completedAt: new Date(),
        lastHeartbeatAt: new Date(),
        errorMessage:
          error instanceof Error
            ? error.message
            : "No se pudo completar el MasterBlueprintEngine.",
        errorJson: asJsonValue({
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "UnknownError",
        }),
        stageDataJson: asJsonValue(data),
      },
    });

    return {
      job: toJobSummary(updatedJob),
      shouldContinue: false,
      state: "failed" as const,
    };
  }
}

export type BlueprintJobStageRunResult = Awaited<
  ReturnType<typeof runNextBlueprintJobStage>
>;

export async function runBlueprintJobDrain(
  jobId: string,
  options?: {
    maxStages?: number;
    timeBudgetMs?: number;
  },
) {
  const startedAt = Date.now();
  const maxStages = Math.max(
    1,
    Math.floor(options?.maxStages ?? DEFAULT_DRAIN_MAX_STAGES),
  );
  const timeBudgetMs = Math.max(
    30_000,
    Math.floor(options?.timeBudgetMs ?? DEFAULT_DRAIN_TIME_BUDGET_MS),
  );
  const results: BlueprintJobStageRunResult[] = [];
  let currentJobId = jobId;
  let finalResult: BlueprintJobStageRunResult | null = null;

  for (let stageIndex = 0; stageIndex < maxStages; stageIndex += 1) {
    if (Date.now() - startedAt >= timeBudgetMs) {
      break;
    }

    finalResult = await runNextBlueprintJobStage(currentJobId);
    results.push(finalResult);

    if (!finalResult.shouldContinue || !finalResult.job) {
      break;
    }

    currentJobId = finalResult.job.id;
  }

  return {
    job: finalResult?.job ?? null,
    shouldContinue: Boolean(finalResult?.shouldContinue && finalResult.job),
    stagesRun: results.length,
    elapsedMs: Date.now() - startedAt,
    finalResult,
    results,
  };
}

export async function resumeLatestBlueprintJobForUser(
  userId: string,
  projectId: string,
) {
  const latestJob = await prisma.blueprintJob.findFirst({
    where: {
      userId,
      projectId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!latestJob) {
    throw new Error("No hay un job activo para reanudar en este proyecto.");
  }

  return runNextBlueprintJobStage(latestJob.id);
}

export async function resumeLatestBlueprintJobDrainForUser(
  userId: string,
  projectId: string,
  options?: {
    maxStages?: number;
    timeBudgetMs?: number;
  },
) {
  const latestJob = await prisma.blueprintJob.findFirst({
    where: {
      userId,
      projectId,
      status: {
        in: [...ACTIVE_JOB_STATUSES],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!latestJob) {
    throw new Error("No hay un job activo para reanudar en este proyecto.");
  }

  return runBlueprintJobDrain(latestJob.id, options);
}

export async function getBlueprintProgressForUserV2(
  userId: string,
  projectId: string,
): Promise<BlueprintProgressSummary> {
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

  const latestJob = await prisma.blueprintJob.findFirst({
    where: {
      projectId,
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (latestJob) {
    const isActive = isActiveBlueprintJobStatus(latestJob.status);
    const heartbeatAt =
      latestJob.lastHeartbeatAt ?? latestJob.lockedAt ?? latestJob.updatedAt;
    const idleMs = Date.now() - heartbeatAt.getTime();

    return {
      projectStatus: project.status,
      jobId: latestJob.id,
      jobStatus: latestJob.status,
      stageKey: latestJob.currentStage,
      label: latestJob.currentStage
        ? getStageLabel({
            language: latestJob.language,
            stageKey: latestJob.currentStage,
          })
        : null,
      progress: latestJob.progress,
      updatedAt: latestJob.updatedAt.toISOString(),
      errorMessage: latestJob.errorMessage,
      shouldNudge:
        isActive &&
        latestJob.status !== BlueprintJobStatus.RUNNING &&
        idleMs > 4_000,
    };
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
    jobId: null,
    jobStatus: null,
    stageKey: typeof payload?.stageKey === "string" ? payload.stageKey : null,
    label: typeof payload?.label === "string" ? payload.label : null,
    progress:
      typeof payload?.progress === "number"
        ? clampProgress(payload.progress)
        : null,
    updatedAt: latestProgressLog?.createdAt.toISOString() ?? null,
    errorMessage: null,
    shouldNudge: false,
  };
}
