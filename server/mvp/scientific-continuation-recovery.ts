import { z } from "zod";
import { Prisma, type BlueprintJob } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { assertExpectedGenerationContext, generationContextForUser } from "@/server/projects/generation-context-service";
import { readGenerationInput, researchProjectFingerprint } from "@/server/projects/generation-input-snapshot";
import { fingerprint, type BackgroundProviderResponseRecord } from "./job-execution-context";
import { readScientificContinuation } from "./scientific-continuation";
import { assertQaCommitment, qaJobPolicy } from "./qa-acceptance-policy";
import { methodCoverageAssessmentSchema } from "./method-coverage-contracts";
import { METHOD_COVERAGE_ASSESSMENT_PROMPT } from "./prompts/method-coverage.v1";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const METHOD_CONTRACT_RECOVERY_VERSION = "method-assessment-contract-recovery.v1";
const activeStatuses = ["QUEUED", "RUNNING", "WAITING_NEXT_STAGE"] as const;
type CostEntry = { id: string; status: string; estimate: number | null; usage?: unknown; model?: string; actualModel?: string | null };

/** Only the proved, terminal v1 assessment truncation is eligible. A failed
 * validation, unobserved dispatch, uncertain usage or unchanged contract is not. */
export function validateMethodAssessmentRecovery(input: {
  priorMessage: string; responses: BackgroundProviderResponseRecord[]; entries: CostEntry[];
  targetPromptVersion: string; projectId: string; runId: string;
}) {
  if (input.priorMessage !== "STRUCTURED_OUTPUT_INCOMPLETE: max_output_tokens" ||
    input.targetPromptVersion !== "method-coverage-assessment.v2") throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_NOT_ELIGIBLE");
  if (!input.entries.length || input.entries.some(row => row.status !== "completed" || row.estimate === null || !Number.isFinite(row.estimate) || row.estimate < 0))
    throw new Error("SCIENTIFIC_CONTINUATION_USAGE_UNCERTAIN");
  const unsuccessful = input.responses.filter(row => row.status !== "COMPLETED");
  const response = unsuccessful[0];
  const correlation = response?.correlation as { stage?: string; promptVersion?: string; projectId?: string; runId?: string } | undefined;
  const entry = response?.reservationId ? input.entries.find(row => row.id === response.reservationId) : null;
  if (unsuccessful.length !== 1 || response.status !== "INCOMPLETE" || response.providerStatus !== "incomplete" ||
    response.error !== "max_output_tokens" || !response.responseId || !response.requestFingerprint || !response.usage ||
    correlation?.stage !== "method_coverage" || correlation.promptVersion !== "method-coverage-assessment.v1" ||
    correlation.projectId !== input.projectId || correlation.runId !== input.runId ||
    !entry || !entry.usage || fingerprint(entry.usage) !== fingerprint(response.usage) || entry.actualModel !== response.actualModel)
    throw new Error("SCIENTIFIC_CONTINUATION_RESPONSE_NOT_RECOVERABLE");
  return response;
}

/** Explicit normal resume, same child and same frozen inputs. No call is sent by
 * this function. The worker's versioned checkpoints and request fingerprint own
 * the new contract; completed responses and the incomplete response stay intact. */
export async function recoverScientificContinuationForUser(userId: string, projectId: string, jobId: string) {
  const candidate = await prisma.blueprintJob.findFirst({ where: { id: jobId, userId, projectId } });
  if (!candidate) throw new Error("PROJECT_NOT_FOUND");
  const continuation = await readScientificContinuation(jobId);
  if (!continuation) throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_NOT_ELIGIBLE");
  const data = candidate.stageDataJson as { inputSnapshotId: string; inputFingerprint: string; runId: string; expectedContext: Parameters<typeof assertExpectedGenerationContext>[0] };
  const frozen = await readGenerationInput(jobId, data.inputSnapshotId);
  if (!frozen?.evidenceSet?.id) throw new Error("SCIENTIFIC_CONTINUATION_SNAPSHOT_INVALID");
  const frozenEvidenceSetId = frozen.evidenceSet.id;
  const targetContractFingerprint = fingerprint({ prompt: METHOD_COVERAGE_ASSESSMENT_PROMPT, schema: z.toJSONSchema(methodCoverageAssessmentSchema) });
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${jobId} FOR UPDATE`;
    const job = await tx.blueprintJob.findFirstOrThrow({ where: { id: jobId, userId, projectId } });
    if (!await qaJobPolicy(tx, jobId)) throw new Error("SCIENTIFIC_CONTINUATION_NOT_AUTHORIZED");
    if (activeStatuses.some(status => status === job.status)) return { job, reused: true };
    if (job.status !== "FAILED" || job.currentStage !== "resolving_design" || job.lockedAt || job.attempts >= job.maxAttempts)
      throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_NOT_ELIGIBLE");
    const metadata = job.metadataJson as Record<string, unknown>;
    if (metadata.methodAssessmentContractRecovery) throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_ALREADY_USED");
    const cost = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
    const entries = (cost.outputJson as { entries?: CostEntry[] }).entries ?? [];
    const backgrounds = await tx.blueprintJobStage.findMany({ where: { jobId, stageKey: { startsWith: "provider:background:" } } });
    const response = validateMethodAssessmentRecovery({ priorMessage: (job.errorJson as { message?: string } | null)?.message ?? "",
      responses: backgrounds.map(row => row.outputJson as unknown as BackgroundProviderResponseRecord), entries,
      targetPromptVersion: METHOD_COVERAGE_ASSESSMENT_PROMPT.version, projectId, runId: data.runId });
    const current = await generationContextForUser(userId, projectId, tx);
    assertExpectedGenerationContext(data.expectedContext, current);
    if (current.evidenceSetId !== frozenEvidenceSetId) throw new Error("EVIDENCE_SET_CHANGED");
    const project = await tx.project.findFirstOrThrow({ where: { id: projectId, userId }, include: {
      intake: true, projectReferences: { where: { selected: true }, include: { reference: true }, orderBy: { id: "asc" } } } });
    if (researchProjectFingerprint(project) !== data.inputFingerprint) throw new Error("INPUT_CHANGED");
    if (await tx.blueprintJob.count({ where: { projectId, id: { not: jobId }, status: { in: [...activeStatuses, "WAITING_USER_DECISION"] } } }))
      throw new Error("SCIENTIFIC_CONTINUATION_COMPETING_JOB");
    await assertQaCommitment(tx, userId, 0); // Future dispatch independently reserves complete remaining work.
    await reserveInternalGenerationJob(tx, jobId);
    const recovery = { version: METHOD_CONTRACT_RECOVERY_VERSION, authorizedAt: new Date().toISOString(),
      reason: "STRUCTURED_OUTPUT_CONTRACT_CORRECTED", priorError: job.errorJson,
      priorResponseId: response.responseId, priorRequestFingerprint: response.requestFingerprint,
      priorUsageFingerprint: fingerprint(response.usage), fromPromptVersion: "method-coverage-assessment.v1",
      toPromptVersion: METHOD_COVERAGE_ASSESSMENT_PROMPT.version, targetContractFingerprint,
      previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts,
      frozenInputFingerprint: continuation.contract.frozenInputFingerprint,
      effectiveEvidenceFingerprint: continuation.contract.effectiveEvidenceFingerprint,
      incompleteResponsePreserved: true, priorCostPreserved: true, parentUnchanged: true };
    const updated: BlueprintJob = await tx.blueprintJob.update({ where: { id: jobId }, data: {
      status: "WAITING_NEXT_STAGE", nextAttemptAt: null, completedAt: null, lockedAt: null,
      errorMessage: null, errorJson: Prisma.DbNull,
      metadataJson: json({ ...metadata, methodAssessmentContractRecovery: recovery }),
    } });
    await tx.project.update({ where: { id: projectId }, data: { status: "BLUEPRINT_GENERATING" } });
    await tx.auditLog.create({ data: { userId, projectId, actorType: "USER", eventType: "SCIENTIFIC_CONTINUATION_CONTRACT_RECOVERY_AUTHORIZED",
      payloadJson: json({ jobId, parentJobId: continuation.contract.parentJobId, ...recovery }) } });
    return { job: updated, reused: false };
  });
}
