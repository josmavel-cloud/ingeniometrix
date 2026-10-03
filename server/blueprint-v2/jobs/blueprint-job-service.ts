import { recoverScientificContinuationForUser } from "@/server/mvp/scientific-continuation-recovery";
import { readScientificContinuation } from "@/server/mvp/scientific-continuation";
import { webDiscoveryPolicyCostBound } from "@/server/retrieval/astra-web-cost-policy";
import { DESIGN_MINI_RESEARCH_POLICY } from "@/server/mvp/design-mini-research";
import { designSupportRemainingForecast } from "@/server/mvp/whole-job-cost-forecast";
import { SCIENTIFIC_DESIGN_AUTONOMOUS_PATCH_PROMPT } from "@/server/mvp/prompts/scientific-design-autonomous-patch.v1";
import { SCIENTIFIC_DESIGN_AUTONOMOUS_TARGETED_CRITIC_PROMPT } from "@/server/mvp/prompts/scientific-design-autonomous-targeted-critic.v1";
import { scientificFindingFields } from "@/server/mvp/design-support-gap";
import { sourceSufficiencyStatus } from "@/server/retrieval/source-sufficiency-status";
import { randomUUID } from "node:crypto";
import { activeQaCampaign, qaJobPolicy, allowsNewQaAcceptance, assertQaCommitment, QA_COST_POLICY_VERSION } from "@/server/mvp/qa-acceptance-policy";
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
import { closeJobCostControl, currentJobExecution, fingerprint, stageCheckpoint, withJobExecution } from "@/server/mvp/job-execution-context";
import { reserveCommercialJob } from "@/server/commercial/ledger";
import { activeInternalGenerationCapability, INTERNAL_GENERATION_POLICY, reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { classifyFailure, publicFailureMessage, INTERNAL_PILOT_COST_POLICY_VERSION } from "@/server/mvp/execution-policy";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT } from "@/server/mvp/prompts/step5-source-evidence-extraction.v3";
import { STEP5_ASSET_VISUAL_LOCALIZATION_PROMPT } from "@/server/mvp/prompts/step5-asset-visual-localization.v1";
import { STEP5_EQUATION_LATEX_OCR_PROMPT } from "@/server/mvp/prompts/step5-equation-latex-ocr.v1";
import { SCIENTIFIC_DECISION_STAGE, recommendDesignForJob, resolveAutonomousDesignForJob, type ScientificDecisionBundle } from "@/server/mvp/scientific-decision-service";
import { appendGenerationInput, currentGenerationInput, frozenProject, readGenerationInput, researchProjectFingerprint, withGenerationInput } from "@/server/projects/generation-input-snapshot";
import { confirmedScientificDefinitionMatches } from "@/lib/conversational-intake";
import { assertExpectedGenerationContext, generationContextForUser, type GenerationContext } from "@/server/projects/generation-context-service";
import { prepareSelectedSources } from "@/server/projects/source-preparation-service";
import { confirmEvidenceSet } from "@/server/projects/evidence-set-service";
import { ensureReferenceTranslationsForLanguage } from "@/server/retrieval/reference-translation-service";

const ACTIVE_STATUSES = [
  BlueprintJobStatus.QUEUED,
  BlueprintJobStatus.RUNNING,
  BlueprintJobStatus.WAITING_NEXT_STAGE,
] as const;
const INCOMPLETE_STATUSES = [...ACTIVE_STATUSES, BlueprintJobStatus.WAITING_USER_DECISION];
const STALE_LOCK_MS = Math.max(60_000, Number(process.env.BLUEPRINT_STALE_LOCK_MS ?? 10 * 60 * 1000));
const DEFAULT_MAX_ATTEMPTS = Math.min(3, Math.max(1, Number(process.env.BLUEPRINT_MAX_ATTEMPTS ?? 3) || 3));
const HEARTBEAT_MS = Math.max(5_000, Number(process.env.BLUEPRINT_HEARTBEAT_MS ?? 30_000));
// The v1 schema was rejected by Responses before a response ID existed. This
// exact historical rejection can be resumed under a new versioned contract;
// its unknown usage reservation remains committed. No other uncertain create
// is eligible for an automatic second provider dispatch.
const LEGACY_PATCH_SCHEMA_REJECTION = /^400 Invalid schema for response_format 'autonomous_design_patch_v1': In context=\(\), 'required' is required to be supplied and to be an array including every key in properties\. Missing 'samplingSelection'\.$/;

type Step5Result = Awaited<ReturnType<typeof runMvpEvidenceMaterialization>>;
type Step6Result = Awaited<ReturnType<typeof runMvpStep6BlueprintDocx>>;

export type ReleaseJobExecutor = {
  materialize(input: { userId: string; projectId: string; runId: string }): Promise<Step5Result>;
  generate(input: { userId: string; projectId: string; runId: string }): Promise<Step6Result>;
  recommend?(input: { jobId: string; userId: string; projectId: string; runId: string; stepRunId: string }): Promise<ScientificDecisionBundle>;
  resolve?(input: { jobId: string; userId: string; projectId: string; runId: string }): Promise<unknown>;
};

const productionExecutor: ReleaseJobExecutor = {
  materialize: runMvpEvidenceMaterialization,
  generate: runMvpStep6BlueprintDocx,
  recommend: recommendDesignForJob,
  resolve: resolveAutonomousDesignForJob,
};

type StoredStep6 = Pick<
  Step6Result,
  "status" | "blueprint_version_id" | "docx_path" | "pdf_path" | "artifact_dir" | "artifact_manifest_path"
>;

type JobData = {
  runId: string;
  expectedContext?: GenerationContext;
  operationId?: string;
  inputFingerprint?: string;
  inputSnapshotId?: string;
  recoveryMode?: "PRESENTATION_ONLY";
  step5?: { status: string; stepRunId: string; artifactManifestPath: string };
  step6?: StoredStep6;
};

const PRESENTATION_RECOVERY_CHECKPOINTS = [
  "checkpoint:EVIDENCE",
  "checkpoint:SECTION_DRAFTS:evidence_synthesis",
  "checkpoint:SECTION_DRAFTS:problem_definition",
  "checkpoint:SECTION_DRAFTS:research_questions",
  "checkpoint:SECTION_DRAFTS:objectives_and_optional_hypotheses",
  "checkpoint:SECTION_DRAFTS:conceptual_framework",
  "checkpoint:RESEARCH_DESIGN",
  "checkpoint:SECTION_DRAFTS:methodology",
  "checkpoint:SECTION_DRAFTS:contribution_and_feasibility",
  "checkpoint:SECTION_DRAFTS:scope_limitations_and_pending_decisions",
  "checkpoint:CONSISTENCY_MATRIX",
  "checkpoint:SCIENTIFIC_REVIEW",
  "checkpoint:SECTION_DRAFTS:final_title",
  "checkpoint:SECTION_DRAFTS:executive_summary",
  "checkpoint:VISUALS",
  "checkpoint:DOCX",
  "checkpoint:PDF",
  "checkpoint:FINAL_EXPORT",
] as const;

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
    preparing_sources: ["Preparando tus fuentes y organizando la evidencia", "Preparing sources"],
    materializing_evidence: ["Inspeccionando y materializando evidencia", "Inspecting and materializing evidence"],
    generating_plan: ["Generando el plan cientifico", "Generating the scientific plan"],
    scientific_design: ["Evaluando alternativas de investigación", "Evaluating research alternatives"],
    resolving_design: ["Diseñando la investigación", "Resolving research design"],
    awaiting_design_approval: ["Preparando la continuación del plan", "Preparing plan continuation"],
    persisting_artifacts: ["Guardando entregables privados", "Persisting private deliverables"],
    completed: ["Plan listo", "Plan ready"],
    failed: ["La generacion requiere revision", "Generation requires review"],
  };
  return stage ? labels[stage]?.[english ? 1 : 0] ?? stage : null;
}

function safeJobFailure(error: unknown, category: string) {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
  if (code === "SOURCE_SELECTION_CONFLICT" || code === "SOURCE_SELECTION_CHANGED_DURING_PREPARATION" || code === "EVIDENCE_PREPARATION_CHANGED")
    return "Las fuentes cambiaron mientras se preparaba el plan. Revisa tu selección antes de continuar.";
  if (code === "DEFINITION_REVISION_CONFLICT")
    return "La definición cambió. Revisa y confirma la versión actual antes de continuar.";
  if (code === "EVIDENCE_SET_BLOCKED") return "La evidencia seleccionada no permite continuar. Revisa las limitaciones de tus fuentes.";
  return publicFailureMessage(category as Parameters<typeof publicFailureMessage>[0]);
}

async function loadOwnedProject(userId: string, projectId: string) {
  const project = frozenProject(await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      intake: true,
      projectReferences: { where: { selected: true }, include: { reference: true }, orderBy: { id: "asc" } },
    },
  }));
  if (!project) throw new Error("Proyecto no encontrado.");
  if (!project.intake) throw new Error("Completa el intake antes de generar el plan.");
  if (project.projectReferences.length === 0) throw new Error("Selecciona al menos una fuente antes de generar el plan.");
  return project;
}

function projectFingerprint(project: Awaited<ReturnType<typeof loadOwnedProject>>) {
  if (currentGenerationInput()) return researchProjectFingerprint(project);
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

export async function enqueueBlueprintJobForUser(userId: string, projectId: string, options?: { languageOverride?: string | null; scientificProfile?: "rc4"; confirmedDraftRevision?: number; expectedContext?: GenerationContext; operationId?: string }) {
  const project = await loadOwnedProject(userId, projectId);
  if (options?.scientificProfile === "rc4" && options.confirmedDraftRevision === undefined &&
      (!options.expectedContext || !options.operationId)) throw new Error("GENERATION_CONTRACT_INCOMPLETE");
  if (options?.expectedContext && (await sourceSufficiencyStatus(userId, projectId)).readiness === "BLOCKED") {
    throw new Error("EVIDENCE_SET_BLOCKED:MINIMUM_USABLE_SOURCE_COVERAGE_NOT_MET");
  }
  const inputFingerprint = options?.scientificProfile === "rc4" ? researchProjectFingerprint(project) : projectFingerprint(project);
  const jobId = randomUUID();
  const language = normalizeLanguageCode(options?.languageOverride) ?? normalizeLanguageCode(project.language) ?? "es";
  const job = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    const actualContext = options?.expectedContext ? await generationContextForUser(userId, projectId, tx) : null;
    if (options?.expectedContext && actualContext) assertExpectedGenerationContext(options.expectedContext, actualContext);
    if (options?.expectedContext && actualContext && options.expectedContext.evidenceSetId !== actualContext.evidenceSetId)
      throw new Error("EVIDENCE_SET_CHANGED");
    if (options?.operationId) {
      const priorJobs = await tx.blueprintJob.findMany({ where: { userId, projectId }, orderBy: { createdAt: "desc" }, take: 30 });
      const replay = priorJobs.find(row => readJobData(row).operationId === options.operationId);
      if (replay) {
        if (!options.expectedContext || !readJobData(replay).expectedContext) throw new Error("GENERATION_CONTRACT_INCOMPLETE");
        assertExpectedGenerationContext(readJobData(replay).expectedContext!, options.expectedContext);
        return replay;
      }
    }
    const draft = await tx.projectDraft.findUnique({ where: { projectId } });
    const rawDefinition = (draft?.contentJson as Record<string, unknown> | undefined)?.researchDefinition;
    if (rawDefinition) {
      const intake = await tx.intake.findUnique({ where: { projectId } });
      const confirmed = intake?.confirmedDefinitionJson as { revision?: number; definitionHash?: string } | null;
      if (!confirmedScientificDefinitionMatches(rawDefinition, confirmed)) {
        throw new Error("DRAFT_CONFIRMATION_REQUIRED: confirma la definición científica antes de generar.");
      }
    } else if (draft && draft.confirmedRevision !== draft.revision) {
      throw new Error("DRAFT_CONFIRMATION_REQUIRED: confirma el borrador guardado antes de generar.");
    }
    if (options?.confirmedDraftRevision !== undefined && options.confirmedDraftRevision !== (draft?.revision ?? 0)) throw new Error("DRAFT_REVISION_CONFLICT");
    const concurrent = await tx.blueprintJob.findFirst({ where: { userId, projectId, status: { in: INCOMPLETE_STATUSES } }, orderBy: { createdAt: "desc" } });
    if (concurrent) {
      if (options?.expectedContext && readJobData(concurrent).expectedContext)
        assertExpectedGenerationContext(options.expectedContext, readJobData(concurrent).expectedContext!);
      return concurrent;
    }
    const previous = await tx.blueprintJob.findFirst({ where: { userId, projectId, status: "FAILED" }, orderBy: { createdAt: "desc" } });
    const internalCapability = await activeInternalGenerationCapability(userId, tx);
    const qaCampaign = internalCapability ? await activeQaCampaign(tx, userId) : null;
    // A trusted, finite QA grant can authorize a NEW acceptance after a terminal
    // job. It never resets that job, copies scientific checkpoints, or releases
    // its unknown usage. Ordinary client retries retain the existing guard.
    const newQaAcceptance = previous && allowsNewQaAcceptance(qaCampaign,
      (previous.metadataJson as { qaCampaignId?: string } | null)?.qaCampaignId,
      Boolean(options?.operationId && options.expectedContext));
    if (previous && (!readJobData(previous).inputFingerprint || readJobData(previous).inputFingerprint === inputFingerprint) && !newQaAcceptance)
      throw new Error("El intento anterior requiere revisión; no se puede repetir un trabajo cobrado.");
    if (qaCampaign) {
      await tx.$queryRaw`SELECT id FROM "QaAcceptanceCampaign" WHERE id = ${qaCampaign.id} FOR UPDATE`;
      const jobs = await tx.blueprintJob.count({ where: { userId, metadataJson: { path: ["qaCampaignId"], equals: qaCampaign.id } } });
      if (jobs >= qaCampaign.maxJobs) throw new Error("QA_ACCEPTANCE_JOB_LIMIT_REACHED");
      await assertQaCommitment(tx, userId, qaCampaign.jobCapMicros / 1e6);
    }
    await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.BLUEPRINT_GENERATING } });
    const created = await tx.blueprintJob.create({
      data: {
        id: jobId,
        userId,
        projectId,
        status: BlueprintJobStatus.QUEUED,
        currentStage: options?.expectedContext ? "preparing_sources" : "materializing_evidence",
        progress: 5,
        language,
        runnerKind: "database-worker",
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        stageDataJson: toJson({ runId: `secure-pilot-${jobId}`, inputFingerprint,
          expectedContext: options?.expectedContext, operationId: options?.operationId } satisfies JobData),
        metadataJson: toJson({ engine: "canonical-mvp-step5-step6", privateArtifacts: true, executionPolicy: "b4.v1",
          ...(internalCapability ? { costPolicyVersion: INTERNAL_PILOT_COST_POLICY_VERSION } : {}),
          ...(qaCampaign ? { costPolicyVersion: QA_COST_POLICY_VERSION, qaCampaignId: qaCampaign.id } : {}),
          ...(newQaAcceptance ? { qaNewAcceptance: { previousJobId: previous!.id,
            campaignId: qaCampaign!.id, priorUsageRetained: true } } : {}),
          commercialPolicy: internalCapability ? INTERNAL_GENERATION_POLICY : "commercial-v1",
          scientificProfile: options?.scientificProfile ?? "rc3", operationId: options?.operationId }),
      },
    });
    if (newQaAcceptance) await tx.auditLog.create({ data: { userId, projectId,
      eventType: "QA_NEW_ACCEPTANCE_AUTHORIZED", actorType: "SYSTEM", payloadJson: toJson({
        jobId, previousJobId: previous!.id, campaignId: qaCampaign!.id, authority: qaCampaign!.issuedBy,
        operationId: options!.operationId, priorUsageRetained: true, priorCheckpointsCopied: false }) } });
    if (options?.scientificProfile === "rc4" && !options.expectedContext) {
      const frozen = await appendGenerationInput(tx, { jobId, projectId, userId, revision: 1 });
      await tx.blueprintJob.update({ where: { id: jobId }, data: { stageDataJson: toJson({ runId: `secure-pilot-${jobId}`, inputFingerprint: researchProjectFingerprint(frozen.project), inputSnapshotId: frozen.snapshot.id }) } });
    }
    if (internalCapability) await reserveInternalGenerationJob(tx, jobId);
    else await reserveCommercialJob(tx, jobId);
    return created;
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
    await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "FAILED", completedAt: now, lockedAt: null, errorMessage: "Job anterior a B4: reconciliar costes antes de autorizar recuperacion.", errorJson: { category: "USER_ACTION_REQUIRED", retryable: false } } });
    await closeJobCostControl(tx, jobId, "FAILED");
    return null;
  }
  const attempts = current.attempts + (current.status === BlueprintJobStatus.RUNNING ? 1 : 0);
  if (attempts >= current.maxAttempts) {
    await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "FAILED", attempts, lockedAt: null, completedAt: now, errorMessage: "Recuperaciones agotadas; se requiere revision.", errorJson: { category: "USER_ACTION_REQUIRED", retryable: false } } });
    await closeJobCostControl(tx, jobId, "FAILED");
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
  return withJobExecution({ jobId, startedAt: job.startedAt!, stage, recoveryAttempt: job.attempts, checkpointOnly: data.recoveryMode === "PRESENTATION_ONLY", allowedCheckpointWork: data.recoveryMode === "PRESENTATION_ONLY" ? ["FINAL_EXPORT", "DOCX", "PDF"] : undefined }, async () => {
  await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.RUNNING, progress: job.progress });

  try {
    // Inherited science is a verified reference, never a copied provider call or reset attempt.
    await readScientificContinuation(jobId);
    const frozenInput = await readGenerationInput(jobId, data.inputSnapshotId);
    return await withGenerationInput(frozenInput, async () => {
    if (stage !== "preparing_sources" && data.inputFingerprint !== projectFingerprint(await loadOwnedProject(job.userId, job.projectId))) throw new Error("INPUT_CHANGED: intake o seleccion incompatible con el job autorizado.");
    if (stage === "preparing_sources") {
      if (!data.expectedContext || !data.operationId) throw new Error("GENERATION_CONTRACT_INCOMPLETE");
      assertExpectedGenerationContext(data.expectedContext, await generationContextForUser(job.userId, job.projectId));
      await withJobHeartbeat(jobId, () => prepareSelectedSources(job.userId, job.projectId));
      assertExpectedGenerationContext(data.expectedContext, await generationContextForUser(job.userId, job.projectId));
      // Display translations are derived. A provider failure must never block evidence.
      const selectedForDisplay = await prisma.projectReference.findMany({ where: { projectId: job.projectId, selected: true },
        select: { reference: { select: { id: true, title: true, abstract: true, rawOpenAlexJson: true } } } });
      await withJobHeartbeat(jobId, () => ensureReferenceTranslationsForLanguage({
        references: selectedForDisplay.map(row => row.reference), targetLanguage: "es",
      }).then(() => undefined)).catch(() => undefined);
      const evidence = await confirmEvidenceSet(job.userId, job.projectId, data.operationId);
      const after = await generationContextForUser(job.userId, job.projectId);
      assertExpectedGenerationContext(data.expectedContext, after);
      if (after.evidenceSetId !== evidence.id) throw new Error("EVIDENCE_SET_CHANGED");
      const snapshot = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${job.projectId} FOR UPDATE`;
        assertExpectedGenerationContext(data.expectedContext!, await generationContextForUser(job.userId, job.projectId, tx));
        const prior = await tx.generationInputSnapshot.findUnique({ where: { jobId_revision: { jobId, revision: 1 } } });
        return prior ?? (await appendGenerationInput(tx, { jobId, projectId: job.projectId, userId: job.userId, revision: 1 })).snapshot;
      });
      data.inputSnapshotId = snapshot.id;
      const frozen = await readGenerationInput(jobId, snapshot.id);
      if (!frozen) throw new Error("GENERATION_SNAPSHOT_MISSING");
      data.inputFingerprint = researchProjectFingerprint(frozen.project);
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 10,
        output: { evidenceSetId: evidence.id, readiness: evidence.readiness } });
      const updated = await prisma.blueprintJob.update({ where: { id: jobId, startedAt: job.startedAt },
        data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "materializing_evidence", progress: 10,
          nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), stageDataJson: toJson(data),
          errorMessage: null, errorJson: Prisma.DbNull, metadataJson: executionMetadata(job, stage, "COMPLETED") } });
      return { job: toJobSummary(updated), shouldContinue: true, state: "continued" as const };
    }
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
        data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: (job.metadataJson as { scientificProfile?: string } | null)?.scientificProfile === "rc4" ? "scientific_design" : "generating_plan", progress: 45, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), stageDataJson: toJson(data), errorMessage: null, errorJson: Prisma.DbNull, metadataJson: executionMetadata(job, stage, "COMPLETED") },
      });
      return { job: toJobSummary(updated), shouldContinue: true, state: "continued" as const };
    }

    if (stage === "scientific_design") {
      if (!data.step5 || !executor.recommend) throw new Error("SCIENTIFIC_DESIGN_EXECUTOR_REQUIRED");
      await withJobHeartbeat(jobId, () => executor.recommend!({ jobId, userId: job.userId, projectId: job.projectId, runId: data.runId, stepRunId: data.step5!.stepRunId }));
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 50 });
      const updated = await prisma.blueprintJob.update({ where: { id: jobId, startedAt: job.startedAt }, data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "resolving_design", progress: 50, lockedAt: null, nextAttemptAt: null, metadataJson: executionMetadata(job, stage, "COMPLETED") } });
      return { job: toJobSummary(updated), shouldContinue: true, state: "continued" as const };
    }

    if (stage === "resolving_design") {
      if (!executor.resolve) throw new Error("AUTONOMOUS_DESIGN_EXECUTOR_REQUIRED");
      await withJobHeartbeat(jobId, () => executor.resolve!({ jobId, userId: job.userId, projectId: job.projectId, runId: data.runId }));
      await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.COMPLETED, progress: 60 });
      const updated = await prisma.blueprintJob.update({ where: { id: jobId, startedAt: job.startedAt }, data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "generating_plan", progress: 60, lockedAt: null, nextAttemptAt: null, metadataJson: executionMetadata(job, stage, "COMPLETED") } });
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
      const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.blueprintJob.update({
        where: { id: jobId, startedAt: job.startedAt },
        data: { status: BlueprintJobStatus.COMPLETED, currentStage: "completed", progress: 100, nextAttemptAt: null, lockedAt: null, lastHeartbeatAt: new Date(), completedAt: new Date(), errorMessage: null, errorJson: Prisma.DbNull, stageDataJson: toJson(data), metadataJson: executionMetadata(job, stage, "COMPLETED") },
      });
      await closeJobCostControl(tx, jobId, "COMPLETED");
      return updated;
      });
      return { job: toJobSummary(updated), shouldContinue: false, state: "completed" as const };
    }

    throw new Error(`Etapa no reconocida: ${stage}`);
    });
  } catch (error) {
    const lease = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: jobId } });
    if (lease.startedAt?.getTime() !== job.startedAt?.getTime() || lease.status !== "RUNNING") return { job: toJobSummary(lease), shouldContinue: false, state: "locked_or_finished" as const };
    if (error instanceof Error && error.name === "ProviderResponsePendingError") {
      const updated = await prisma.blueprintJob.update({ where: { id: jobId, startedAt: job.startedAt }, data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: stage, nextAttemptAt: new Date(Date.now() + 15_000), lockedAt: null, lastHeartbeatAt: new Date(), errorMessage: null, errorJson: toJson({ message: error.message, category: "PROVIDER_RESPONSE_PENDING", retryable: false }), metadataJson: executionMetadata(job, stage, "PROVIDER_RESPONSE_PENDING") } });
      return { job: toJobSummary(updated), shouldContinue: false, state: "provider_response_pending" as const };
    }
    const attempts = job.attempts + 1;
    const failure = classifyFailure(error);
    const retryable = failure.autoRetry && attempts < job.maxAttempts;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = stage === "preparing_sources" ? (/^[A-Z][A-Z0-9_]*(?::|$)/.test(rawMessage)
      ? rawMessage.split(":", 1)[0] : "SOURCE_PREPARATION_FAILED") : rawMessage;
    const retryDelayMs = Math.min(5 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempts - 1));
    await upsertStage({ jobId, stageKey: stage, status: BlueprintJobStageStatus.FAILED, progress: job.progress, error: { message, attempt: attempts } });
    if (!retryable) {
      await prisma.project.update({ where: { id: job.projectId }, data: { status: ProjectStatus.SOURCES_SELECTED } });
    }
    const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.blueprintJob.update({
      where: { id: jobId, startedAt: job.startedAt },
      data: {
        status: retryable ? BlueprintJobStatus.QUEUED : BlueprintJobStatus.FAILED,
        currentStage: stage,
        attempts,
        nextAttemptAt: retryable ? new Date(Date.now() + retryDelayMs) : null,
        lockedAt: null,
        lastHeartbeatAt: new Date(),
        completedAt: retryable ? null : new Date(),
        errorMessage: safeJobFailure(error, failure.category),
        errorJson: toJson({ message, attempt: attempts, retryable, category: failure.category }),
        metadataJson: executionMetadata(job, stage, "FAILED", { message, category: failure.category, retryable }),
        stageDataJson: toJson(data),
      },
    });
    if (!retryable) await closeJobCostControl(tx, jobId, "FAILED");
    return updated;
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
  if (job.status === BlueprintJobStatus.FAILED && (job.metadataJson as { scientificContinuation?: unknown } | null)?.scientificContinuation) {
    const recovered = await recoverScientificContinuationForUser(userId, projectId, job.id);
    return { job: toJobSummary(recovered.job), shouldContinue: true, state: recovered.reused ? "already_scheduled" as const : "continuation_recovery_scheduled" as const };
  }
  if (job.status === BlueprintJobStatus.WAITING_USER_DECISION && (job.metadataJson as { scientificProfile?: string } | null)?.scientificProfile === "rc4") return authorizeAutonomousDesignRecoveryForUser(userId, projectId, job.id);
  if (job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
    (/^AUTONOMOUS_PATCH_CONTEXT_TOO_LARGE:/.test((job.errorJson as { message?: string } | null)?.message ?? "") ||
      /^COST_LIMIT_REACHED: el trabajo restante completo/.test((job.errorJson as { message?: string } | null)?.message ?? "") ||
      /^AUTONOMOUS_CRITIC_CONTEXT_TOO_LARGE:/.test((job.errorJson as { message?: string } | null)?.message ?? "") ||
      /^DESIGN_SUPPORT_UNAVAILABLE:/.test((job.errorJson as { message?: string } | null)?.message ?? "") ||
      /^AUTONOMOUS_DESIGN_UNRESOLVED:/.test((job.errorJson as { message?: string } | null)?.message ?? "") ||
      LEGACY_PATCH_SCHEMA_REJECTION.test((job.errorJson as { message?: string } | null)?.message ?? "") ||
      (job.errorJson as { message?: string } | null)?.message === "AUTONOMOUS_PATCH_BLOCKING_FINDING_UNRESOLVED"))
    return authorizeAutonomousDesignRecoveryForUser(userId, projectId, job.id);
  if (job.status === BlueprintJobStatus.FAILED && (job.errorJson as { category?: string } | null)?.category === "PRESENTATION") return authorizePresentationRecoveryForUser(userId, projectId, job.id);
  // Active jobs already belong to the worker. Resume must not steal a lease, erase
  // backoff, or resurrect a failed/exhausted job. Repeated calls are observational.
  const retryable = job.attempts < job.maxAttempts && ACTIVE_STATUSES.some((status) => status === job.status);
  return { job: toJobSummary(job), shouldContinue: retryable, state: retryable ? "already_scheduled" as const : "not_retryable" as const };
}

export async function authorizeAutonomousDesignRecoveryForUser(userId: string, projectId: string, jobId: string) {
  const candidate = await prisma.blueprintJob.findFirstOrThrow({ where: { id: jobId, userId, projectId } });
  const data = readJobData(candidate);
  if (!data.inputSnapshotId || !data.inputFingerprint || !data.expectedContext || !data.step5?.stepRunId) throw new Error("AUTONOMOUS_RECOVERY_INPUT_MISSING");
  const frozen = await readGenerationInput(jobId, data.inputSnapshotId);
  if (!frozen?.evidenceSet?.id) throw new Error("AUTONOMOUS_RECOVERY_EVIDENCE_MISSING");
  const expectedContext = data.expectedContext;
  const evidenceSetId = frozen.evidenceSet.id;
  const stepRunId = data.step5.stepRunId;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${jobId} FOR UPDATE`;
    const job = await tx.blueprintJob.findFirstOrThrow({ where: { id: jobId, userId, projectId } });
    if (ACTIVE_STATUSES.some((status) => status === job.status)) return { job: toJobSummary(job), shouldContinue: true, state: "already_scheduled" as const };
    const priorError = (job.errorJson as { message?: string } | null)?.message ?? "";
    const rejectedLegacySchema = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      LEGACY_PATCH_SCHEMA_REJECTION.test(priorError);
    const unresolvedPriorPatch = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      priorError === "AUTONOMOUS_PATCH_BLOCKING_FINDING_UNRESOLVED";
    const acquisitionRecovery = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      /^DESIGN_SUPPORT_UNAVAILABLE:/.test(priorError);
    const contextSizeRecovery = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      /^AUTONOMOUS_CRITIC_CONTEXT_TOO_LARGE:/.test(priorError);
    const digestRecovery = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      /^AUTONOMOUS_PATCH_CONTEXT_TOO_LARGE:/.test(priorError);
    const forecastRecovery = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      /^COST_LIMIT_REACHED: el trabajo restante completo/.test(priorError);
    const failedResolution = job.status === BlueprintJobStatus.FAILED && job.currentStage === "resolving_design" &&
      (/^AUTONOMOUS_DESIGN_UNRESOLVED:/.test(priorError) || rejectedLegacySchema || unresolvedPriorPatch || acquisitionRecovery || contextSizeRecovery || forecastRecovery || digestRecovery);
    const priorMetadata = job.metadataJson as Record<string, unknown> | null;
    // One bounded continuation for a completed independent evidence rejection.
    // It reuses both prior pairs, and may consume only the still-unused second
    // support operation. No uncertain call or exhausted support loop is reopened.
    const lateEvidenceReview = failedResolution && /^AUTONOMOUS_DESIGN_UNRESOLVED:/.test(priorError)
      ? await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId,
        stageKey: "checkpoint:AUTONOMOUS_DESIGN_TARGETED_CRITIC_EVIDENCE_2" } } }) : null;
    const lateEvidenceSaved = lateEvidenceReview?.outputJson as { value?: { evidenceSupported?: boolean; intentPreserved?: boolean; methodCoherent?: boolean }; outputHash?: string } | null;
    const coverageReview = failedResolution && priorMetadata?.scientificLateEvidenceRecovery
      ? await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId,
        stageKey: "checkpoint:AUTONOMOUS_DESIGN_TARGETED_CRITIC_EVIDENCE_3" } } }) : null;
    const coverageSaved = coverageReview?.outputJson as { value?: { evidenceSupported?: boolean; intentPreserved?: boolean; methodCoherent?: boolean }; outputHash?: string } | null;
    const coverageRecovery = coverageReview?.status === "COMPLETED" && coverageSaved?.value?.evidenceSupported === false &&
      coverageSaved.value.intentPreserved === true && coverageSaved.value.methodCoherent === true && fingerprint(coverageSaved.value) === coverageSaved.outputHash;
    if (coverageRecovery) {
      if (priorMetadata?.scientificCoverageRecovery || job.attempts > job.maxAttempts)
        throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
      const acquired = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId,
        stageKey: "checkpoint:DESIGN_SUPPORT_OBSERVED_ALTERNATES_V1" } } });
      const saved = acquired?.outputJson as { value?: unknown[]; outputHash?: string } | null;
      if (acquired?.status !== "COMPLETED" || !saved?.value?.length || fingerprint(saved.value) !== saved.outputHash)
        throw new Error("AUTONOMOUS_RECOVERY_SUPPORT_CHECKPOINT_INVALID");
      if (await tx.blueprintJobStage.count({ where: { jobId, stageKey: "checkpoint:DESIGN_SUPPORT_PROCEDURAL_COVERAGE_V2" } }))
        throw new Error("AUTONOMOUS_RECOVERY_COVERAGE_ALREADY_STARTED");
    }
    const lateEvidenceRecovery = !coverageRecovery && lateEvidenceReview?.status === "COMPLETED" &&
      lateEvidenceSaved?.value?.evidenceSupported === false && lateEvidenceSaved.value.intentPreserved === true &&
      lateEvidenceSaved.value.methodCoherent === true && fingerprint(lateEvidenceSaved.value) === lateEvidenceSaved.outputHash;
    if (lateEvidenceRecovery) {
      if (priorMetadata?.scientificLateEvidenceRecovery || job.attempts > job.maxAttempts)
        throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
      if (await tx.blueprintJobStage.count({ where: { jobId, OR: [
        { stageKey: { startsWith: "checkpoint:DESIGN_MINI_RESEARCH_V2_ACQUISITION3_2" } },
        { stageKey: { startsWith: "checkpoint:AUTONOMOUS_DESIGN_PATCH_EVIDENCE_3" } }
      ] } })) throw new Error("AUTONOMOUS_RECOVERY_SUPPORT_LOOP_EXHAUSTED");
    }
    const modernPatchStage = unresolvedPriorPatch ? await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: {
      jobId, stageKey: "checkpoint:AUTONOMOUS_DESIGN_PATCH_EVIDENCE_1" } } }) : null;
    const compoundFindingRecovery = unresolvedPriorPatch && modernPatchStage?.status === "COMPLETED";
    if (compoundFindingRecovery) {
      if (priorMetadata?.scientificFindingRecovery || job.attempts >= job.maxAttempts)
        throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
      const savedPatch = modernPatchStage.outputJson as { value?: unknown; outputHash?: string } | null;
      if (!savedPatch?.value || fingerprint(savedPatch.value) !== savedPatch.outputHash)
        throw new Error("AUTONOMOUS_RECOVERY_PATCH_CHECKPOINT_INVALID");
      const savedDecision = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: SCIENTIFIC_DECISION_STAGE } } });
      const saved = savedDecision?.outputJson as unknown as { value?: ScientificDecisionBundle; outputHash?: string } | null;
      if (!saved?.value || fingerprint(saved.value) !== saved.outputHash ||
        !saved.value.critique.assessments.some(assessment => assessment.critical_findings.some(finding =>
          scientificFindingFields(finding.affected_field).length > 1)))
        throw new Error("AUTONOMOUS_RECOVERY_COMPOUND_FINDING_MISSING");
    }
    const legacyUnresolvedPatch = unresolvedPriorPatch && !compoundFindingRecovery;
    const deniedSupportStage = failedResolution && /^AUTONOMOUS_DESIGN_UNRESOLVED:/.test(priorError)
      ? await tx.blueprintJobStage.findFirst({ where: { jobId, status: "FAILED",
        stageKey: { startsWith: "checkpoint:DESIGN_MINI_RESEARCH_" }, errorJson: { path: ["message"], equals: "PRE_JOB_COST_LIMIT" } } }) : null;
    const linkedQaBudgetRecovery = Boolean(deniedSupportStage && await qaJobPolicy(tx, jobId));
    const accessReviewRecovery = legacyUnresolvedPatch && Boolean(priorMetadata?.scientificPatchRecovery) &&
      !priorMetadata?.scientificAccessReviewRecovery && job.maxAttempts === 4 && job.attempts === 4;
    if (!failedResolution && (job.status !== BlueprintJobStatus.WAITING_USER_DECISION || job.currentStage !== "awaiting_design_approval")) throw new Error("AUTONOMOUS_RECOVERY_NOT_ELIGIBLE");
    if (failedResolution) {
      if (digestRecovery) {
        if (priorMetadata?.scientificDigestRecovery || job.attempts > job.maxAttempts)
          throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
        const support = await tx.blueprintJobStage.findFirst({ where: { jobId,
          stageKey: { startsWith: "checkpoint:DESIGN_MINI_RESEARCH_" }, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
        const savedSupport = support?.outputJson as { value?: { support?: unknown[] }; outputHash?: string } | null;
        if (!savedSupport?.value?.support?.length || fingerprint(savedSupport.value) !== savedSupport.outputHash)
          throw new Error("AUTONOMOUS_RECOVERY_SUPPORT_CHECKPOINT_INVALID");
        // The old byte guard ran before the second patch. No new continuation
        // may duplicate a dispatched/uncertain second patch.
        if (await tx.blueprintJobStage.count({ where: { jobId,
          stageKey: { startsWith: "checkpoint:AUTONOMOUS_DESIGN_PATCH_EVIDENCE_2" } } }))
          throw new Error("AUTONOMOUS_RECOVERY_PATCH_ALREADY_STARTED");
      }
      if (linkedQaBudgetRecovery) {
        if (priorMetadata?.scientificLinkedQaRecovery || job.attempts > job.maxAttempts || job.maxAttempts > 4)
          throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
        const noDispatch = await tx.paidOperation.findFirst({ where: { userId, projectId, purpose: "DESIGN_SUPPORT_MINI_RESEARCH",
          status: "FAILED", committedMicros: 0, calls: { none: {} }, createdAt: { gte: job.createdAt } } });
        if (!noDispatch) throw new Error("AUTONOMOUS_RECOVERY_NO_DISPATCH_PROOF_MISSING");
      }
      if (forecastRecovery) {
        if (priorMetadata?.scientificForecastRecovery || job.attempts > job.maxAttempts || job.maxAttempts > 3)
          throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
        const review = await tx.blueprintJobStage.findFirst({ where: { jobId,
          stageKey: { startsWith: "checkpoint:AUTONOMOUS_DESIGN_TARGETED_CRITIC_EVIDENCE_" }, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
        const savedReview = review?.outputJson as { value?: { evidenceSupported?: boolean }; outputHash?: string } | null;
        if (savedReview?.value?.evidenceSupported !== false || fingerprint(savedReview.value) !== savedReview.outputHash)
          throw new Error("AUTONOMOUS_RECOVERY_EVIDENCE_REVIEW_MISSING");
        // This correction fixes a pre-dispatch forecast, never a failed paid web call.
        if (await tx.blueprintJobStage.count({ where: { jobId, stageKey: { startsWith: "checkpoint:DESIGN_MINI_RESEARCH_" } } }))
          throw new Error("AUTONOMOUS_RECOVERY_DISCOVERY_ALREADY_STARTED");
      }
      if (contextSizeRecovery) {
        if (priorMetadata?.scientificContextRecovery) throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
        const patch = await tx.blueprintJobStage.findFirst({ where: { jobId,
          stageKey: { startsWith: "checkpoint:AUTONOMOUS_DESIGN_PATCH_EVIDENCE_" }, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
        const saved = patch?.outputJson as { value?: unknown; outputHash?: string } | null;
        if (!saved?.value || fingerprint(saved.value) !== saved.outputHash)
          throw new Error("AUTONOMOUS_RECOVERY_PATCH_CHECKPOINT_INVALID");
      }
      if (acquisitionRecovery) {
        if (priorMetadata?.scientificAcquisitionRecovery) throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
        const acquisition = await tx.blueprintJobStage.findFirst({ where: { jobId, stageKey: { startsWith: "checkpoint:DESIGN_SUPPORT_DOCUMENT_" }, status: "COMPLETED" }, select: { outputJson: true } });
        if ((acquisition?.outputJson as { value?: { reason?: string } } | null)?.value?.reason !== "DOCUMENT_ACQUISITION_FAILED")
          throw new Error("AUTONOMOUS_RECOVERY_ACQUISITION_CHECKPOINT_MISSING");
      }
      if (legacyUnresolvedPatch) {
        // First recover the corrected v3 patch; then, if v3 itself completed
        // but could not classify future access, reuse that exact completed
        // patch for one independent v2 targeted review. Neither path repeats
        // selector, first critic, or a completed patch response.
        if (!accessReviewRecovery && (priorMetadata?.scientificPatchRecovery || job.maxAttempts !== 3 || job.attempts !== 3))
          throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
        const patchStage = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "checkpoint:AUTONOMOUS_DESIGN_PATCH_1" } } });
        if (patchStage?.status !== BlueprintJobStageStatus.COMPLETED || !patchStage.outputJson)
          throw new Error("AUTONOMOUS_RECOVERY_PATCH_CHECKPOINT_MISSING");
      } else if (!forecastRecovery && !linkedQaBudgetRecovery && !digestRecovery && !lateEvidenceRecovery && !coverageRecovery && job.attempts >= job.maxAttempts) throw new Error("AUTONOMOUS_RECOVERY_ATTEMPTS_EXHAUSTED");
      const cost = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
      const entries = (cost?.outputJson as { entries?: Array<{ stage: string; estimate: number | null; status: string }> } | null)?.entries;
      if (!entries) throw new Error("AUTONOMOUS_RECOVERY_USAGE_RECONCILIATION_REQUIRED");
      const unknownEntries = entries.filter(entry => entry.estimate === null || entry.status !== "completed");
      if (rejectedLegacySchema || legacyUnresolvedPatch) {
        if (unknownEntries.length !== 1 || unknownEntries[0].stage !== "AUTONOMOUS_DESIGN_PATCH_1" ||
          unknownEntries[0].status !== "failed_unknown_usage" || unknownEntries[0].estimate !== null)
          throw new Error("AUTONOMOUS_RECOVERY_LEGACY_RESERVATION_MISMATCH");
      } else if (unknownEntries.length) throw new Error("AUTONOMOUS_RECOVERY_USAGE_RECONCILIATION_REQUIRED");
      if (forecastRecovery || linkedQaBudgetRecovery) {
        const record = cost?.outputJson as { policy?: { hard: number; mandatoryReserve: number } } | null;
        const decisionRow = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: SCIENTIFIC_DECISION_STAGE } } });
        const saved = decisionRow?.outputJson as unknown as { value?: ScientificDecisionBundle; outputHash?: string } | null;
        if (!saved?.value || fingerprint(saved.value) !== saved.outputHash || !saved.value.decision.recommended_id || !record?.policy)
          throw new Error("AUTONOMOUS_RECOVERY_FORECAST_INPUT_MISSING");
        const bound = webDiscoveryPolicyCostBound(DESIGN_MINI_RESEARCH_POLICY);
        const required = designSupportRemainingForecast(saved.value, saved.value.decision.recommended_id,
          SCIENTIFIC_DESIGN_AUTONOMOUS_PATCH_PROMPT, SCIENTIFIC_DESIGN_AUTONOMOUS_TARGETED_CRITIC_PROMPT);
        const known = entries.reduce((sum, entry) => sum + (entry.estimate ?? 0), 0);
        if (!bound || known + bound.maximumUsd + required + record.policy.mandatoryReserve > record.policy.hard)
          throw new Error("AUTONOMOUS_RECOVERY_BUDGET_STILL_UNAVAILABLE");
      }
      const responses = await tx.blueprintJobStage.findMany({ where: { jobId, stageKey: { startsWith: "provider:background:" } }, select: { outputJson: true } });
      const responseRecords = responses.map(row => row.outputJson as { status?: string; error?: string; responseId?: string | null; providerStatus?: string | null; correlation?: { stage?: string; promptVersion?: string } } | null);
      if (legacyUnresolvedPatch && !responseRecords.some(row => row?.status === "COMPLETED" && row.correlation?.stage === "autonomous_design_patch" &&
        row.correlation.promptVersion === "ingeniometrix-scientific-design-autonomous-patch-v2" && row.responseId))
        throw new Error("AUTONOMOUS_RECOVERY_PRIOR_PATCH_RESPONSE_MISSING");
      if (compoundFindingRecovery && !responseRecords.some(row => row?.status === "COMPLETED" &&
        row.correlation?.stage === "autonomous_design_patch" && row.responseId))
        throw new Error("AUTONOMOUS_RECOVERY_CURRENT_PATCH_RESPONSE_MISSING");
      if (accessReviewRecovery && !responseRecords.some(row => row?.status === "COMPLETED" && row.correlation?.stage === "autonomous_design_patch" &&
        row.correlation.promptVersion === "ingeniometrix-scientific-design-autonomous-patch-v3" && row.responseId))
        throw new Error("AUTONOMOUS_RECOVERY_CURRENT_PATCH_RESPONSE_MISSING");
      const incomplete = responseRecords
        .filter(row => row?.status !== "COMPLETED");
      if (rejectedLegacySchema || legacyUnresolvedPatch) {
        if (incomplete.length !== 1 || incomplete[0]?.status !== "CREATE_UNCERTAIN" ||
          !LEGACY_PATCH_SCHEMA_REJECTION.test(incomplete[0]?.error ?? "") ||
          (rejectedLegacySchema && incomplete[0]?.error !== priorError) ||
          incomplete[0]?.responseId || incomplete[0]?.providerStatus)
          throw new Error("AUTONOMOUS_RECOVERY_PROVIDER_RESPONSE_PENDING");
      } else if (incomplete.length) throw new Error("AUTONOMOUS_RECOVERY_PROVIDER_RESPONSE_PENDING");
    }
    const competing = await tx.blueprintJob.count({ where: { projectId, id: { not: jobId }, status: { in: [...INCOMPLETE_STATUSES] } } });
    if (competing) throw new Error("AUTONOMOUS_RECOVERY_COMPETING_JOB");
    const scientific = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: SCIENTIFIC_DECISION_STAGE } } });
    if (scientific?.status !== BlueprintJobStageStatus.COMPLETED || !(scientific.outputJson as { value?: { decisionFingerprint?: string } } | null)?.value?.decisionFingerprint) throw new Error("AUTONOMOUS_RECOVERY_DESIGN_MISSING");
    const owned = await tx.project.findFirstOrThrow({ where: { id: projectId, userId }, include: { intake: true, projectReferences: { where: { selected: true }, include: { reference: true }, orderBy: { id: "asc" } } } });
    if (researchProjectFingerprint(owned) !== data.inputFingerprint) throw new Error("INPUT_CHANGED: definición o selección posterior al inicio del plan.");
    const currentContext = await generationContextForUser(userId, projectId, tx);
    assertExpectedGenerationContext(expectedContext, currentContext);
    if (currentContext.evidenceSetId !== evidenceSetId) throw new Error("EVIDENCE_SET_CHANGED");
    const ledger = await tx.projectEvidenceLedger.findFirst({ where: { projectId, stepRunId }, select: { id: true } });
    if (!ledger) throw new Error("AUTONOMOUS_RECOVERY_EVIDENCE_LEDGER_MISSING");
    const commercialPolicy = (job.metadataJson as { commercialPolicy?: string } | null)?.commercialPolicy;
    if (commercialPolicy === INTERNAL_GENERATION_POLICY) await reserveInternalGenerationJob(tx, jobId);
    else if (commercialPolicy === "commercial-v1") await reserveCommercialJob(tx, jobId);
    else throw new Error("AUTONOMOUS_RECOVERY_COMMERCIAL_POLICY_UNKNOWN");
    const updated = await tx.blueprintJob.update({ where: { id: jobId }, data: { status: BlueprintJobStatus.WAITING_NEXT_STAGE, currentStage: "resolving_design", progress: 50, lockedAt: null, nextAttemptAt: null,
      maxAttempts: (forecastRecovery || linkedQaBudgetRecovery || digestRecovery || lateEvidenceRecovery || coverageRecovery) && job.attempts === job.maxAttempts ? job.maxAttempts + 1 : accessReviewRecovery ? 5 : legacyUnresolvedPatch ? 4 : job.maxAttempts,
      completedAt: null, errorMessage: null, errorJson: Prisma.DbNull,
      metadataJson: toJson({ ...(job.metadataJson as Record<string, unknown> | null),
        ...(coverageRecovery ? { scientificCoverageRecovery: { version: "procedural-section-coverage.v2", authorizedAt: new Date().toISOString(),
          priorFailure: priorError, reviewHash: coverageSaved!.outputHash, previousAttempts: job.attempts,
          previousMaxAttempts: job.maxAttempts, noNewDiscovery: true, existingDocumentHashPreserved: true } } : {}),
        ...(lateEvidenceRecovery ? { scientificLateEvidenceRecovery: { version: "late-evidence-recovery.v1",
          authorizedAt: new Date().toISOString(), priorFailure: priorError, reviewCheckpoint: lateEvidenceReview!.stageKey,
          reviewHash: lateEvidenceSaved!.outputHash, previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts,
          completedPairsReused: true, maxAdditionalSupportOperations: 1 } } : {}),
        ...(digestRecovery ? { scientificDigestRecovery: { version: "DesignSupportDigest.v1", authorizedAt: new Date().toISOString(),
          priorFailure: priorError, previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts,
          existingSupportPreserved: true, previousCallsNotRepeated: true } } : {}),
        ...(linkedQaBudgetRecovery ? { scientificLinkedQaRecovery: { version: "qa-linked-budget.v1", authorizedAt: new Date().toISOString(),
          priorFailure: priorError, deniedStageId: deniedSupportStage!.id, previousAttempts: job.attempts,
          previousMaxAttempts: job.maxAttempts, previousCallsNotRepeated: true } } : {}),
        ...(forecastRecovery ? { scientificForecastRecovery: { version: "design-support-forecast.v2", authorizedAt: new Date().toISOString(),
          priorFailure: priorError, previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts, priorCriticPreserved: true } } : {}),
        ...(contextSizeRecovery ? { scientificContextRecovery: { version: "targeted-critic-context.v2", authorizedAt: new Date().toISOString(),
          priorFailure: priorError, completedPatchPreserved: true } } : {}),
        ...(compoundFindingRecovery ? { scientificFindingRecovery: { version: "scientific-finding-fields.v1", authorizedAt: new Date().toISOString(),
          priorFailure: priorError, priorPatchCheckpoint: modernPatchStage!.stageKey, priorAttempts: job.attempts,
          completedSciencePreserved: true } } : {}),
        ...(acquisitionRecovery ? { scientificAcquisitionRecovery: { authorizedAt: new Date().toISOString(), version: "pinned-dns-all.v2", priorFailure: priorError, paidDiscoveryReused: true } } : {}),
        ...(legacyUnresolvedPatch && !accessReviewRecovery ? { scientificPatchRecovery: { authorizedAt: new Date().toISOString(), fromPromptVersion: "ingeniometrix-scientific-design-autonomous-patch-v2", toPromptVersion: "ingeniometrix-scientific-design-autonomous-patch-v3", priorPatchRejectedBy: priorError } } : {}),
        ...(accessReviewRecovery ? { scientificAccessReviewRecovery: { authorizedAt: new Date().toISOString(), reusedPatchVersion: "ingeniometrix-scientific-design-autonomous-patch-v3", targetedCriticVersion: "ingeniometrix-scientific-design-autonomous-targeted-critic-v2" } } : {}),
        autonomousRecovery: { recoveredAt: new Date().toISOString(), from: coverageRecovery ? "persisted_document_procedural_coverage" : lateEvidenceRecovery ? "remaining_methodological_gap" : digestRecovery ? "verified_support_digest" : linkedQaBudgetRecovery ? "qa_nested_funding_contract" : forecastRecovery ? "configured_discovery_bound" : contextSizeRecovery ? "deduplicated_critic_context" : compoundFindingRecovery ? "compound_finding_contract" : accessReviewRecovery ? "completed_patch_targeted_review" : unresolvedPriorPatch ? "scientifically_unresolved_patch" : rejectedLegacySchema ? "rejected_legacy_patch_schema" : failedResolution ? "failed_resolution" : "awaiting_design_approval", decisionCheckpoint: SCIENTIFIC_DECISION_STAGE, preservedInputSnapshotId: data.inputSnapshotId, unknownUsageReservationPreserved: rejectedLegacySchema || legacyUnresolvedPatch } }) } });
    await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.BLUEPRINT_GENERATING } });
    await tx.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "AUTONOMOUS_DESIGN_RECOVERY_SCHEDULED",
      payloadJson: toJson({ jobId, priorStatus: job.status, previousAttempts: job.attempts,
        allPriorUsageKnown: failedResolution && !rejectedLegacySchema && !legacyUnresolvedPatch,
        rejectedBeforeResponse: rejectedLegacySchema, scientificPatchRecovery: legacyUnresolvedPatch && !accessReviewRecovery,
        coverageRecovery, lateEvidenceRecovery, digestRecovery, linkedQaBudgetRecovery, forecastRecovery, contextSizeRecovery, compoundFindingRecovery, completedPatchTargetedReview: accessReviewRecovery,
        unknownUsageReservationPreserved: rejectedLegacySchema || legacyUnresolvedPatch }) } });
    return { job: toJobSummary(updated), shouldContinue: true, state: "autonomous_recovery_scheduled" as const };
  });
}

export async function authorizePresentationRecoveryForUser(userId: string, projectId: string, jobId: string) {
  await loadOwnedProject(userId, projectId);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${jobId} FOR UPDATE`;
    const job = await tx.blueprintJob.findFirst({ where: { id: jobId, userId, projectId } });
    if (!job) throw new Error("Job no encontrado.");
    const data = readJobData(job);
    if (job.status === BlueprintJobStatus.COMPLETED) return { job: toJobSummary(job), shouldContinue: false, state: "completed" as const };
    if (ACTIVE_STATUSES.some((status) => status === job.status) && data.recoveryMode === "PRESENTATION_ONLY") return { job: toJobSummary(job), shouldContinue: true, state: "already_scheduled" as const };
    const failure = job.errorJson as { category?: string; message?: string } | null;
    if (job.status !== BlueprintJobStatus.FAILED || failure?.category !== "PRESENTATION") throw new Error("El job no es elegible para recuperacion exclusiva de presentacion.");
    if (job.attempts >= job.maxAttempts) throw new Error("Recuperaciones agotadas; se requiere revision.");
    const checkpoints = await tx.blueprintJobStage.findMany({ where: { jobId, stageKey: { in: [...PRESENTATION_RECOVERY_CHECKPOINTS] }, status: BlueprintJobStageStatus.COMPLETED }, select: { stageKey: true, outputJson: true } });
    const valid = new Set(checkpoints.filter((row) => row.outputJson !== null).map((row) => row.stageKey));
    const missing = PRESENTATION_RECOVERY_CHECKPOINTS.filter((stageKey) => !valid.has(stageKey));
    if (missing.length) throw new Error(`CHECKPOINT_ONLY_MISSING_OR_INCOMPATIBLE: ${missing.join(",")}`);
    const nextData: JobData = { ...data, recoveryMode: "PRESENTATION_ONLY" };
    if ((job.metadataJson as { commercialPolicy?: string } | null)?.commercialPolicy === "commercial-v1") await reserveCommercialJob(tx, jobId);
    else if ((job.metadataJson as { commercialPolicy?: string } | null)?.commercialPolicy === INTERNAL_GENERATION_POLICY)
      await reserveInternalGenerationJob(tx, jobId);
    const previousMetadata = job.metadataJson as Record<string, unknown> | null;
    const recoveryHistory = Array.isArray(previousMetadata?.presentationRecovery) ? previousMetadata.presentationRecovery : [];
    const updated = await tx.blueprintJob.update({
      where: { id: job.id },
      data: {
        status: BlueprintJobStatus.QUEUED,
        currentStage: "generating_plan",
        progress: 45,
        nextAttemptAt: null,
        lockedAt: null,
        completedAt: null,
        errorMessage: null,
        errorJson: Prisma.DbNull,
        stageDataJson: toJson(nextData),
        metadataJson: toJson({ ...previousMetadata, presentationRecovery: [...recoveryHistory, { authorizedAt: new Date().toISOString(), previousFailure: failure, mode: "PRESENTATION_ONLY", paidCallsAllowed: false }] }),
      },
    });
    await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.BLUEPRINT_GENERATING } });
    return { job: toJobSummary(updated), shouldContinue: true, state: "presentation_recovery_scheduled" as const };
  });
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
