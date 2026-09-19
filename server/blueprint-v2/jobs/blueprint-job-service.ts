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

const ACTIVE_STATUSES = [
  BlueprintJobStatus.QUEUED,
  BlueprintJobStatus.RUNNING,
  BlueprintJobStatus.WAITING_NEXT_STAGE,
] as const;
const STALE_LOCK_MS = Math.max(60_000, Number(process.env.BLUEPRINT_STALE_LOCK_MS ?? 10 * 60 * 1000));
const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.BLUEPRINT_MAX_ATTEMPTS ?? 3));
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
      projectReferences: { where: { selected: true }, select: { id: true } },
    },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  if (!project.intake) throw new Error("Completa el intake antes de generar el plan.");
  if (project.projectReferences.length === 0) throw new Error("Selecciona al menos una fuente antes de generar el plan.");
  return project;
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
  const heartbeat = setInterval(() => {
    void prisma.blueprintJob.updateMany({
      where: { id: jobId, status: BlueprintJobStatus.RUNNING },
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

  const jobId = randomUUID();
  const language = normalizeLanguageCode(options?.languageOverride) ?? normalizeLanguageCode(project.language) ?? "es";
  const job = await prisma.$transaction(async (tx) => {
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
        stageDataJson: toJson({ runId: `secure-pilot-${jobId}` } satisfies JobData),
        metadataJson: toJson({ engine: "canonical-mvp-step5-step6", privateArtifacts: true }),
      },
    });
  });
  return toJobSummary(job);
}

async function claimJob(jobId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const result = await prisma.blueprintJob.updateMany({
    where: {
      id: jobId,
      status: { in: [...ACTIVE_STATUSES] },
      attempts: { lt: DEFAULT_MAX_ATTEMPTS },
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
      ],
    },
    data: { status: BlueprintJobStatus.RUNNING, lockedAt: now, lastHeartbeatAt: now, startedAt: now },
  });
  if (result.count === 0) return null;
  return prisma.blueprintJob.findUnique({ where: { id: jobId } });
}

export async function runNextBlueprintJobStage(jobId: string, executor: ReleaseJobExecutor = productionExecutor) {
  const job = await claimJob(jobId);
  if (!job) {
    const current = await prisma.blueprintJob.findUnique({ where: { id: jobId } });
    return { job: current ? toJobSummary(current) : null, shouldContinue: false, state: "locked_or_finished" as const };
  }

  const stage = job.currentStage ?? "materializing_evidence";
  const data = readJobData(job);
  await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.RUNNING, progress: job.progress });

  try {
    if (stage === "materializing_evidence") {
      const recovered = await recoverStepOutput(job.projectId, data.runId, "step_5_evidence_materialization");
      const result = recovered ?? await withJobHeartbeat(jobId, () => executor.materialize({ userId: job.userId, projectId: job.projectId, runId: data.runId }));
      data.step5 = {
        status: String(result.status),
        stepRunId: String(result.step_run_id),
        artifactManifestPath: String(result.artifact_manifest_path),
      };
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 45, output: data.step5 });
      const updated = await prisma.blueprintJob.update({
        where: { id: jobId },
        data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "generating_plan", progress: 45, attempts: 0, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), stageDataJson: toJson(data) },
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
        where: { id: jobId },
        data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "persisting_artifacts", progress: 90, attempts: 0, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), stageDataJson: toJson(data) },
      });
      return { job: toJobSummary(updated), shouldContinue: true, state: "continued" as const };
    }

    if (stage === "persisting_artifacts") {
      if (!data.step6) throw new Error("El job no conserva el resultado canonico de Step 6.");
      await withJobHeartbeat(jobId, () => persistCanonicalArtifacts(job, data.step6!));
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 100, output: { blueprintVersionId: data.step6.blueprint_version_id } });
      const updated = await prisma.blueprintJob.update({
        where: { id: jobId },
        data: { status: BlueprintJobStatus.COMPLETED, currentStage: "completed", progress: 100, attempts: 0, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), completedAt: new Date(), errorMessage: null, stageDataJson: toJson(data) },
      });
      return { job: toJobSummary(updated), shouldContinue: false, state: "completed" as const };
    }

    throw new Error(`Etapa no reconocida: ${stage}`);
  } catch (error) {
    const attempts = job.attempts + 1;
    const retryable = attempts < job.maxAttempts;
    const message = error instanceof Error ? error.message : String(error);
    const retryDelayMs = Math.min(5 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
    await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.FAILED, progress: job.progress, error: { message, attempt: attempts } });
    if (!retryable) {
      await prisma.project.update({ where: { id: job.projectId }, data: { status: ProjectStatus.SOURCES_SELECTED } });
    }
    const updated = await prisma.blueprintJob.update({
      where: { id: jobId },
      data: {
        status: retryable ? BlueprintJobStatus.QUEUED : BlueprintJobStatus.FAILED,
        currentStage: stage,
        attempts,
        nextAttemptAt: retryable ? new Date(Date.now() + retryDelayMs) : null,
        lockedAt: null,
        lastHeartbeatAt: new Date(),
        completedAt: retryable ? null : new Date(),
        errorMessage: message,
        errorJson: toJson({ message, attempt: attempts, retryable }),
        stageDataJson: toJson(data),
      },
    });
    return { job: toJobSummary(updated), shouldContinue: retryable, state: retryable ? "retry_scheduled" as const : "failed" as const };
  }
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
      attempts: { lt: DEFAULT_MAX_ATTEMPTS },
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
  const updated = await prisma.blueprintJob.update({
    where: { id: job.id },
    data: { status: BlueprintJobStatus.QUEUED, attempts: 0, nextAttemptAt: null, lockedAt: null, completedAt: null, errorMessage: null },
  });
  return { job: toJobSummary(updated), shouldContinue: true, state: "queued" as const };
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
