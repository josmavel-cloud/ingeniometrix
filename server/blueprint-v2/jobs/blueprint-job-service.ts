import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BlueprintJobStageStatus,
  BlueprintJobStatus,
  GeneratedArtifactKind,
  MvpStepRunStatus,
  Prisma,
  ProjectStatus,
  type BlueprintJob,
} from "@prisma/client";

import { normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import { upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";
import { runMvpEvidenceMaterialization } from "@/server/mvp/evidence-materialization-service";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";
import { currentJobExecution, fingerprint, stageCheckpoint, withJobExecution } from "@/server/mvp/job-execution-context";
import { classifyFailure, publicFailureMessage } from "@/server/mvp/execution-policy";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT } from "@/server/mvp/prompts/step5-source-evidence-extraction.v3";
import { STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT } from "@/server/mvp/prompts/step5-asset-visual-localization.v1";
import { STEP5_EQUATION_LATEX_OCR_PROMPT } from "@/server/mvp/prompts/step5-equation-latex-ocr.v1";

const ACTIVE_STATUSES = [
  BlueprintJobStatus.QUEUED,
  BlueprintJobStatus.RUNNING,
  BlueprintJobStatus.WAITING_NEXT_STAGE,
] as const;
const STALE_LOCK_MS = Math.max(60_000, Number(process.env.BLUEPRINT_STALE_LOCK_MS ?? 10 * 60 * 1000));
const DEFAULT_MAX_ATTEMPTS = Math.min(3, Math.max(1, Number(process.env.BLUEPRINT_MAX_ATTEMPTS ?? 3) || 3));
const HEARTBEAT_MS = Math.max(5_000, Number(process.env.BLUEPRINT_HEARTBEAT_MS ?? 30_000));

type Step5Result = Awaited<ReturnType<typeof runMvpEvidenceMaterialization>>;
type Step6Result = Awaited<ReturnType<typeof runMvpStep6BlueprintDocx>>;

export type ReleaseJobExecutor = {
  materialize(input: { userId: string; projectId: string; runId: string }): Promise<Step5Result>;
  generate(input: { userId: string; projectId: string; runId: string }): Promise<Step6Result>;
};

const productionExecutor: ReleaseJobExecutor = {
  materialize: runMvpEvidenceMaterialization,
  generate: runMvpStep6BlueprintDocx,
};

type StoredStep6 = Pick<
  Step6Result,
  "status" | "blueprint_version_id" | "docx_path" | "pdf_path" | "artifact_dir" | "artifact_manifest_path"
>;

type JobData = {
  runId: string;
  inputFingerprint?: string;
  step5?: { status: string; stepRunId: string; artifactManifestPath: string };
  step6?: StoredStep6;
};

export type BlueprintJobSummary = {
  id: string;
  projectId: string;
  status: BlueprintJobStatus;
  currentStage: string | null;
  progress: number;
  language: string;
  runnerKind: string;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
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

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

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
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function readJobData(job: Pick<BlueprintJob, "stageDataJson">): JobData {
  const value = job.stageDataJson;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El job no conserva estado recuperable.");
  }
  return value as unknown as JobData;
}

function executionMetadata(job: BlueprintJob, stage: string, outcome: string, failure?: unknown) {
  const previous = job.metadataJson as { executions?: unknown[] } | null;
  return toJson({ ...previous, executions: [...(previous?.executions ?? []), { stage, outcome, startedAt: job.startedAt?.toISOString(), finishedAt: new Date().toISOString(), durationMs: job.startedAt && !outcome.includes("UNKNOWN") ? Date.now() - job.startedAt.getTime() : null, cumulativeFailuresBefore: job.attempts, failure }] });
}

function stageLabel(stage: string | null, language: string) {
  const english = normalizeLanguageCode(language) === "en";
  const labels: Record<string, [string, string]> = {
    materializing_evidence: ["Inspeccionando y materializando evidencia", "Inspecting and materializing evidence"],
    generating_plan: ["Generando el plan cientifico", "Generating the scientific plan"],
    persisting_artifacts: ["Guardando entregables privados", "Persisting private deliverables"],
    completed: ["Plan listo", "Plan ready"],
    failed: ["La generacion requiere revision", "Generation requires review"],
  };
  return stage ? labels[stage]?.[english ? 1 : 0] ?? stage : null;
}

async function loadOwnedProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      intake: true,
      projectReferences: { where: { selected: true }, include: { reference: true }, orderBy: { id: "asc" } },
    },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  if (!project.intake) throw new Error("Completa el intake antes de generar el plan.");
  if (project.projectReferences.length === 0) throw new Error("Selecciona al menos una fuente antes de generar el plan.");
  return project;
}

function projectFingerprint(project: Awaited<ReturnType<typeof loadOwnedProject>>) {
  return fingerprint({ intake: project.intake, references: project.projectReferences.map((item) => ({ id: item.id, referenceId: item.referenceId, order: item.selectedOrder })) });
}

async function upsertStage(input: {
  jobId: string;
  stageKey: string;
  status: BlueprintJobStageStatus;
  progress: number;
  output?: unknown;
  error?: unknown;
}) {
  const now = new Date();
  await prisma.blueprintJobStage.upsert({
    where: { jobId_stageKey: { jobId: input.jobId, stageKey: input.stageKey } },
    create: {
      jobId: input.jobId,
      stageKey: input.stageKey,
      status: input.status,
      progress: input.progress,
      startedAt: input.status === BlueprintJobStageStatus.RUNNING ? now : undefined,
      completedAt: input.status === BlueprintJobStageStatus.COMPLETED || input.status === BlueprintJobStageStatus.FAILED ? now : undefined,
      outputJson: input.output === undefined ? undefined : toJson(input.output),
      errorJson: input.error === undefined ? undefined : toJson(input.error),
    },
    update: {
      status: input.status,
      progress: input.progress,
      startedAt: input.status === BlueprintJobStageStatus.RUNNING ? now : undefined,
      completedAt: input.status === BlueprintJobStageStatus.COMPLETED || input.status === BlueprintJobStageStatus.FAILED ? now : undefined,
      outputJson: input.output === undefined ? undefined : toJson(input.output),
      errorJson: input.error === undefined ? undefined : toJson(input.error),
    },
  });
}

async function recoverStepOutput(projectId: string, runId: string, stepKey: string) {
  const row = await prisma.mvpStepRun.findFirst({
    where: {
      projectId,
      stepKey,
      status: { in: [MvpStepRunStatus.COMPLETED, MvpStepRunStatus.PARTIALLY_COMPLETED] },
      artifactDir: { contains: runId },
    },
    orderBy: { finishedAt: "desc" },
    select: { outputSnapshotJson: true },
  });
  return row?.outputSnapshotJson as Record<string, unknown> | null | undefined;
}

async function withJobHeartbeat<T>(jobId: string, operation: () => Promise<T>) {
  const startedAt = currentJobExecution()?.startedAt;
  const heartbeat = setInterval(() => {
    void prisma.blueprintJob.updateMany({
      where: { id: jobId, status: BlueprintJobStatus.RUNNING, startedAt },
      data: { lockedAt: new Date(), lastHeartbeatAt: new Date() },
    }).catch((error) => {
      console.error("Unable to update blueprint job heartbeat.", { jobId, error });
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();
  try {
    return await operation();
  } finally {
    clearInterval(heartbeat);
  }
}

async function storeFileArtifact(input: {
  job: BlueprintJob;
  versionId: string;
  kind: GeneratedArtifactKind;
  fileName: string;
  mimeType: string;
  filePath: string;
}) {
  await upsertGeneratedArtifact({
    userId: input.job.userId,
    projectId: input.job.projectId,
    blueprintVersionId: input.versionId,
    jobId: input.job.id,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    content: await readFile(input.filePath),
    metadataJson: { source: "canonical-mvp-step6", private: true },
  });
}

async function persistCanonicalArtifacts(job: BlueprintJob, step6: StoredStep6) {
  const versionId = step6.blueprint_version_id;
  const artifactDir = step6.artifact_dir;
  if (!step6.pdf_path) throw new Error("Step 6 termino sin PDF canonico.");
  const files = [
    [GeneratedArtifactKind.BLUEPRINT_DOCX, "final-thesis-plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", step6.docx_path],
    [GeneratedArtifactKind.BLUEPRINT_PDF, "final-thesis-plan.pdf", "application/pdf", step6.pdf_path],
    [GeneratedArtifactKind.BIBTEX, "bibliography.bib", "application/x-bibtex; charset=utf-8", path.join(artifactDir, "bibliography.bib")],
    [GeneratedArtifactKind.RIS, "bibliography.ris", "application/x-research-info-systems; charset=utf-8", path.join(artifactDir, "bibliography.ris")],
    [GeneratedArtifactKind.EVIDENCE_LOG, "evidence-log.json", "application/json; charset=utf-8", path.join(artifactDir, "evidence-log.json")],
  ] as const;

  for (const [kind, fileName, mimeType, filePath] of files) {
    await storeFileArtifact({ job, versionId, kind, fileName, mimeType, filePath });
  }
}

export async function enqueueBlueprintJobForUser(userId: string, projectId: string, options?: { languageOverride?: string | null }) {
  const project = await loadOwnedProject(userId, projectId);
  const existing = await prisma.blueprintJob.findFirst({
    where: { userId, projectId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return toJobSummary(existing);
  const inputFingerprint = projectFingerprint(project);
  const previous = await prisma.blueprintJob.findFirst({ where: { userId, projectId, status: "FAILED" }, orderBy: { createdAt: "desc" } });
  if (previous && (!readJobData(previous).inputFingerprint || readJobData(previous).inputFingerprint === inputFingerprint)) throw new Error("El intento anterior requiere revision; crear otro job no puede restablecer sus limites.");

  const jobId = randomUUID();
  const language = normalizeLanguageCode(options?.languageOverride) ?? normalizeLanguageCode(project.language) ?? "es";
  const job = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    const concurrent = await tx.blueprintJob.findFirst({ where: { userId, projectId, status: { in: [...ACTIVE_STATUSES] } }, orderBy: { createdAt: "desc" } });
    if (concurrent) return concurrent;
    await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.BLUEPRINT_GENERATING } });
    return tx.blueprintJob.create({
      data: {
        id: jobId,
        userId,
        projectId,
        status: BlueprintJobStatus.QUEUED,
        currentStage: "materializing_evidence",
        progress: 5,
        language,
        runnerKind: "database-worker",
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        stageDataJson: toJson({ runId: `secure-pilot-${jobId}`, inputFingerprint } satisfies JobData),
        metadataJson: toJson({ engine: "canonical-mvp-step5-step6", privateArtifacts: true, executionPolicy: "b4.v1" }),
      },
    });
  });
  return toJobSummary(job);
}

async function claimJob(jobId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  return prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${jobId} FOR UPDATE`;
  const current = await tx.blueprintJob.findUnique({ where: { id: jobId } });
  if (!current || !ACTIVE_STATUSES.some((s) => s === current.status) || current.nextAttemptAt && current.nextAttemptAt > now || current.lockedAt && current.lockedAt >= staleBefore) return null;
  if ((current.metadataJson as { executionPolicy?: string } | null)?.executionPolicy !== "b4.v1") {
    await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "FAILED", lockedAt: null, errorMessage: "Job anterior a B4: reconciliar costes antes de autorizar recuperacion.", errorJson: { category: "USER_ACTION_REQUIRED", retryable: false } } });
    return null;
  }
  const attempts = current.attempts + (current.status === BlueprintJobStatus.RUNNING ? 1 : 0);
  if (attempts >= current.maxAttempts) {
    await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "FAILED", attempts, lockedAt: null, completedAt: now, errorMessage: "Recuperaciones agotadas; se requiere revision.", errorJson: { category: "USER_ACTION_REQUIRED", retryable: false } } });
    await tx.project.update({ where: { id: current.projectId }, data: { status: "SOURCES_SELECTED" } });
    return null;
  }
  const result = await tx.blueprintJob.updateMany({
    where: {
      id: jobId,
      status: { in: [...ACTIVE_STATUSES] },
      attempts: { lt: current.maxAttempts },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
      ],
    },
    data: { status: BlueprintJobStatus.RUNNING, attempts, lockedAt: now, lastHeartbeatAt: now, startedAt: now, errorMessage: null, ...(current.status === "RUNNING" ? { metadataJson: executionMetadata(current, current.currentStage ?? "unknown", "INTERRUPTED_DURATION_UNKNOWN", { staleLease: true }) } : {}) },
  });
  if (result.count === 0) return null;
  return tx.blueprintJob.findUnique({ where: { id: jobId } });
  });
}

export async function runNextBlueprintJobStage(jobId: string, executor: ReleaseJobExecutor = productionExecutor) {
  const job = await claimJob(jobId);
  if (!job) {
    const current = await prisma.blueprintJob.findUnique({ where: { id: jobId } });
    return { job: current ? toJobSummary(current) : null, shouldContinue: false, state: "locked_or_finished" as const };
  }

  const stage = job.currentStage ?? "materializing_evidence";
  const data = readJobData(job);
  return withJobExecution({ jobId, startedAt: job.startedAt!, stage, recoveryAttempt: job.attempts }, async () => {
  await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.RUNNING, progress: job.progress });

  try {
    if (data.inputFingerprint !== projectFingerprint(await loadOwnedProject(job.userId, job.projectId))) throw new Error("INPUT_CHANGED: intake o seleccion incompatible con el job autorizado.");
    if (stage === "materializing_evidence") {
      const owned = await loadOwnedProject(job.userId, job.projectId);
      const sourceFingerprint = fingerprint({ intake: owned.intake, selected: owned.projectReferences.map((ref) => ref.id).sort() });
      const evidencePolicy = { prompts: [STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT, STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT, STEP5_EQUATION_LATEX_OCR_PROMPT], extractionModel: process.env.IMX_STEP5_EXTRACTION_MODEL ?? process.env.LLM_FAST_MODEL ?? process.env.LLM_DEFAULT_MODEL ?? "gpt-5.4-mini", visionModel: process.env.IMX_STEP5_VISION_MODEL ?? process.env.LLM_FAST_MODEL ?? process.env.LLM_DEFAULT_MODEL ?? "gpt-5.4-mini", disableVision: process.env.IMX_STEP5_DISABLE_VISUAL_LOCALIZATION ?? "0" };
      const result = await withJobHeartbeat(jobId, () => stageCheckpoint("EVIDENCE", { projectId: job.projectId, runId: data.runId, sourceFingerprint, evidencePolicy }, () => executor.materialize({ userId: job.userId, projectId: job.projectId, runId: data.runId })));
      data.step5 = {
        status: String(result.status),
        stepRunId: String(result.step_run_id),
        artifactManifestPath: String(result.artifact_manifest_path),
      };
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 45, output: data.step5 });
      const updated = await prisma.blueprintJob.update({
        where: { id: jobId, startedAt: job.startedAt },
        data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "generating_plan", progress: 45, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), stageDataJson: toJson(data), errorMessage: null, errorJson: Prisma.DbNull, metadataJson: executionMetadata(job, stage, "COMPLETED") },
      });
      return { job: toJobSummary(updated), shouldContinue: true, state: "continued" as const };
    }

    if (stage === "generating_plan") {
      const recovered = await recoverStepOutput(job.projectId, data.runId, "step_6_blueprint_docx") as Partial<Step6Result> | null | undefined;
      const result = recovered?.blueprint_version_id
        ? recovered as Step6Result
        : await withJobHeartbeat(jobId, () => executor.generate({ userId: job.userId, projectId: job.projectId, runId: data.runId }));
      data.step6 = {
        status: result.status,
        blueprint_version_id: result.blueprint_version_id,
        docx_path: result.docx_path,
        pdf_path: result.pdf_path,
        artifact_dir: result.artifact_dir,
        artifact_manifest_path: result.artifact_manifest_path,
      };
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 90, output: data.step6 });
      const updated = await prisma.blueprintJob.update({
        where: { id: jobId, startedAt: job.startedAt },
        data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "persisting_artifacts", progress: 90, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), stageDataJson: toJson(data), errorMessage: null, errorJson: Prisma.DbNull, metadataJson: executionMetadata(job, stage, "COMPLETED") },
      });
      return { job: toJobSummary(updated), shouldContinue: true, state: "continued" as const };
    }

    if (stage === "persisting_artifacts") {
      if (!data.step6) throw new Error("El job no conserva el resultado canonico de Step 6.");
      await withJobHeartbeat(jobId, () => persistCanonicalArtifacts(job, data.step6!));
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 100, output: { blueprintVersionId: data.step6.blueprint_version_id } });
      const updated = await prisma.blueprintJob.update({
        where: { id: jobId, startedAt: job.startedAt },
        data: { status: BlueprintJobStatus.COMPLETED, currentStage: "completed", progress: 100, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), completedAt: new Date(), errorMessage: null, errorJson: Prisma.DbNull, stageDataJson: toJson(data), metadataJson: executionMetadata(job, stage, "COMPLETED") },
      });
      return { job: toJobSummary(updated), shouldContinue: false, state: "completed" as const };
    }

    throw new Error(`Etapa no reconocida: ${stage}`);
  } catch (error) {
    const lease = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: jobId } });
    if (lease.startedAt?.getTime() !== job.startedAt?.getTime() || lease.status !== "RUNNING") return { job: toJobSummary(lease), shouldContinue: false, state: "locked_or_finished" as const };
    const attempts = job.attempts + 1;
    const failure = classifyFailure(error);
    const retryable = failure.autoRetry && attempts < job.maxAttempts;
    const message = error instanceof Error ? error.message : String(error);
    const retryDelayMs = Math.min(5 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
    await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.FAILED, progress: job.progress, error: { message, attempt: attempts } });
    if (!retryable) {
      await prisma.project.update({ where: { id: job.projectId }, data: { status: ProjectStatus.SOURCES_SELECTED } });
    }
    const updated = await prisma.blueprintJob.update({
      where: { id: jobId, startedAt: job.startedAt },
      data: {
        status: retryable ? BlueprintJobStatus.QUEUED : BlueprintJobStatus.FAILED,
        currentStage: stage,
        attempts,
        nextAttemptAt: retryable ? new Date(Date.now() + retryDelayMs) : null,
        lockedAt: null,
        lastHeartbeatAt: new Date(),
        completedAt: retryable ? null : new Date(),
        errorMessage: publicFailureMessage(failure.category),
        errorJson: toJson({ message, attempt: attempts, retryable, category: failure.category }),
        metadataJson: executionMetadata(job, stage, "FAILED", { message, category: failure.category, retryable }),
        stageDataJson: toJson(data),
      },
    });
    return { job: toJobSummary(updated), shouldContinue: retryable, state: retryable ? "retry_scheduled" as const : "failed" as const };
  }
  });
}

export async function runBlueprintJobDrain(jobId: string, options?: { maxStages?: number; timeBudgetMs?: number }, executor: ReleaseJobExecutor = productionExecutor) {
  const startedAt = Date.now();
  const maxStages = Math.max(1, options?.maxStages ?? 3);
  const timeBudgetMs = Math.max(1_000, options?.timeBudgetMs ?? 15 * 60 * 1000);
  const results: Awaited<ReturnType<typeof runNextBlueprintJobStage>>[] = [];
  for (let index = 0; index < maxStages && Date.now() - startedAt < timeBudgetMs; index += 1) {
    const result = await runNextBlueprintJobStage(jobId, executor);
    results.push(result);
    if (!result.shouldContinue || result.state === "retry_scheduled") break;
  }
  const finalResult = results.at(-1) ?? null;
  return { job: finalResult?.job ?? null, shouldContinue: Boolean(finalResult?.shouldContinue), stagesRun: results.length, elapsedMs: Date.now() - startedAt, finalResult, results };
}

export async function claimAndRunNextBlueprintJob(executor: ReleaseJobExecutor = productionExecutor) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const candidate = await prisma.blueprintJob.findFirst({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
      ],
    },
    orderBy: [{ createdAt: "asc" }],
  });
  return candidate ? runNextBlueprintJobStage(candidate.id, executor) : null;
}

export async function resumeLatestBlueprintJobForUser(userId: string, projectId: string) {
  const job = await prisma.blueprintJob.findFirst({ where: { userId, projectId }, orderBy: { createdAt: "desc" } });
  if (!job) throw new Error("No hay un job para reanudar.");
  if (job.status === BlueprintJobStatus.COMPLETED) return { job: toJobSummary(job), shouldContinue: false, state: "completed" as const };
  // Active jobs already belong to the worker. Resume must not steal a lease, erase
  // backoff, or resurrect a failed/exhausted job. Repeated calls are observational.
  const retryable = job.attempts < job.maxAttempts && ACTIVE_STATUSES.some((status) => status === job.status);
  return { job: toJobSummary(job), shouldContinue: retryable, state: retryable ? "already_scheduled" as const : "not_retryable" as const };
}

export async function resumeLatestBlueprintJobDrainForUser(userId: string, projectId: string) {
  return resumeLatestBlueprintJobForUser(userId, projectId);
}

export async function getBlueprintProgressForUserV2(userId: string, projectId: string): Promise<BlueprintProgressSummary> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { status: true } });
  if (!project) throw new Error("Proyecto no encontrado.");
  const job = await prisma.blueprintJob.findFirst({ where: { userId, projectId }, orderBy: { createdAt: "desc" } });
  if (!job) return { projectStatus: project.status, jobId: null, jobStatus: null, stageKey: null, label: null, progress: null, updatedAt: null, errorMessage: null, shouldNudge: false };
  return {
    projectStatus: project.status,
    jobId: job.id,
    jobStatus: job.status,
    stageKey: job.currentStage,
    label: stageLabel(job.currentStage, job.language),
    progress: job.progress,
    updatedAt: job.updatedAt.toISOString(),
    errorMessage: job.errorMessage,
    shouldNudge: false,
  };
}
