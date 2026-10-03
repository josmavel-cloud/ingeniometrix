import { METHOD_CONTEXT_ADMISSION_VERSION } from "./method-coverage-context";
import { METHOD_CONTEXT_ADMISSION_EVENT, METHOD_CONTEXT_RECOVERY_EVENT, METHOD_CONTEXT_RECOVERY_VERSION, validateMethodContextRecovery, type CorrectedMethodAdmission } from "./method-context-recovery-contract";
import { METHOD_DOCUMENT_INSPECTION_VERSION } from "./design-support-document";
import { METHOD_ACQUISITION_RECOVERY_EVENT, METHOD_ACQUISITION_RECOVERY_VERSION, validateMethodAcquisitionRecovery } from "./method-acquisition-recovery-contract";
import { validateMethodExecutionRecovery } from "./method-coverage-recovery-contract";
import { DESIGN_MINI_RESEARCH_PURPOSE } from "@/server/retrieval/web-discovery-contract";
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
import { METHOD_COVERAGE_ASSESSMENT_PROMPT, METHOD_RECONSTRUCTION_PROMPT } from "./prompts/method-coverage.v1";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const METHOD_CONTRACT_RECOVERY_VERSION = "method-assessment-contract-recovery.v1";
const activeStatuses = ["QUEUED", "RUNNING", "WAITING_NEXT_STAGE"] as const;
type CostEntry = { id: string; status: string; estimate: number | null; usage?: unknown; model?: string; actualModel?: string | null; paidOperationId?: string; qaAuthorization?: { grantId?: string; effectiveHardCapUsd?: number } };

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
    const qa = await qaJobPolicy(tx, jobId);
    if (!qa) throw new Error("SCIENTIFIC_CONTINUATION_NOT_AUTHORIZED");
    if (activeStatuses.some(status => status === job.status)) return { job, reused: true };
    const metadata = job.metadataJson as Record<string, unknown>;
    const priorMessage = (job.errorJson as { message?: string } | null)?.message ?? "";
    const contextRecovery = priorMessage === "METHOD_COVERAGE_CONTEXT_UNSAFE" && Boolean(metadata.methodAcquisitionRecovery);
    const acquisitionRecovery = priorMessage.startsWith("COST_LIMIT_REACHED: el trabajo restante completo") && Boolean(metadata.methodCoverageExecutionRecovery);
    if (job.status !== "FAILED" || job.currentStage !== "resolving_design" || job.lockedAt ||
      (contextRecovery ? job.attempts !== job.maxAttempts + 1 : acquisitionRecovery ? job.attempts !== job.maxAttempts : job.attempts >= job.maxAttempts))
      throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_NOT_ELIGIBLE");
    const executionRecovery = priorMessage === "METHOD_HANDOFF_INVALID";
    if (contextRecovery ? metadata.methodContextAdmissionRecovery : acquisitionRecovery ? metadata.methodAcquisitionRecovery : executionRecovery ? metadata.methodCoverageExecutionRecovery : metadata.methodAssessmentContractRecovery)
      throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_ALREADY_USED");
    const cost = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } } });
    const entries = (cost.outputJson as { entries?: CostEntry[] }).entries ?? [];
    const backgrounds = await tx.blueprintJobStage.findMany({ where: { jobId, stageKey: { startsWith: "provider:background:" } } });
    const responses = backgrounds.map(row => row.outputJson as unknown as BackgroundProviderResponseRecord);
    const executionProof = executionRecovery ? validateMethodExecutionRecovery({ priorMessage, projectId, runId: data.runId,
      responses, entries, stages: await tx.blueprintJobStage.findMany({ where: { jobId } }),
      priorAssessmentRecovery: metadata.methodAssessmentContractRecovery as Parameters<typeof validateMethodExecutionRecovery>[0]["priorAssessmentRecovery"],
      discoveryOperationsSinceJobCreated: await tx.paidOperation.count({ where: { userId, projectId,
        purpose: DESIGN_MINI_RESEARCH_PURPOSE, createdAt: { gte: job.createdAt } } }) }) : null;
    if (acquisitionRecovery) {
      const previousCap = Math.max(0, ...entries.map(entry => entry.qaAuthorization?.effectiveHardCapUsd ?? 0));
      if (METHOD_DOCUMENT_INSPECTION_VERSION !== "methodological-document-inspection.v2" || !qa.overage ||
        qa.overage.jobHardUsd <= previousCap || entries.some(entry => entry.qaAuthorization?.grantId === qa.overage!.grantId))
        throw new Error("METHOD_ACQUISITION_CORRECTED_CONTRACT_AND_PROSPECTIVE_QA_REQUIRED");
    }
    const acquisitionProof = acquisitionRecovery || contextRecovery ? validateMethodAcquisitionRecovery({ priorMessage: contextRecovery ? ((metadata.methodAcquisitionRecovery as {priorError:{message:string}}).priorError.message) : priorMessage, jobId, userId, projectId, runId: data.runId,
      responses, entries, stages: await tx.blueprintJobStage.findMany({ where: { jobId } }),
      priorAssessmentRecovery: metadata.methodAssessmentContractRecovery as Parameters<typeof validateMethodAcquisitionRecovery>[0]["priorAssessmentRecovery"],
      priorExecutionRecovery: metadata.methodCoverageExecutionRecovery as Parameters<typeof validateMethodAcquisitionRecovery>[0]["priorExecutionRecovery"],
      operations: await tx.paidOperation.findMany({ where: { userId, projectId, purpose: DESIGN_MINI_RESEARCH_PURPOSE,
        createdAt: { gte: job.createdAt } }, include: { calls: true } }) }) : null;
    let contextProof: ReturnType<typeof validateMethodContextRecovery> | null = null;
    let contextAdmissionAuditId: string | null = null;
    if(contextRecovery){
      if(await scientificContinuationAttemptLimit(tx,job)!==job.maxAttempts+1)throw new Error("METHOD_CONTEXT_PRIOR_ALLOWANCE_INVALID");
      const audit=await tx.auditLog.findFirst({where:{userId,projectId,eventType:METHOD_CONTEXT_ADMISSION_EVENT,
        payloadJson:{path:["jobId"],equals:jobId}},orderBy:{createdAt:"desc"}});
      const approved=audit?.payloadJson as {admission?:CorrectedMethodAdmission;costFingerprint?:string;frozenInputFingerprint?:string;previousRecoveryFingerprint?:string}|null;
      if(!approved?.admission||approved.costFingerprint!==fingerprint(entries)||approved.frozenInputFingerprint!==continuation.contract.frozenInputFingerprint||
        approved.previousRecoveryFingerprint!==fingerprint(metadata.methodAcquisitionRecovery))throw new Error("METHOD_CONTEXT_AUDITED_ADMISSION_REQUIRED");
      contextProof=validateMethodContextRecovery({priorMessage,previous:metadata.methodAcquisitionRecovery as never,current:acquisitionProof!,
        admission:approved.admission,admissionVersion:METHOD_CONTEXT_ADMISSION_VERSION,promptVersion:METHOD_RECONSTRUCTION_PROMPT.version,
        costEntries:entries,stages:await tx.blueprintJobStage.findMany({where:{jobId}})});
      contextAdmissionAuditId=audit!.id;
    }
    const response = executionRecovery || acquisitionRecovery || contextRecovery ? null : validateMethodAssessmentRecovery({ priorMessage, responses, entries,
      targetPromptVersion: METHOD_COVERAGE_ASSESSMENT_PROMPT.version, projectId, runId: data.runId });
    const current = await generationContextForUser(userId, projectId, tx);
    assertExpectedGenerationContext(data.expectedContext, current);
    if (current.evidenceSetId !== frozenEvidenceSetId) throw new Error("EVIDENCE_SET_CHANGED");
    const project = await tx.project.findFirstOrThrow({ where: { id: projectId, userId }, include: {
      intake: true, projectReferences: { where: { selected: true }, include: { reference: true }, orderBy: { id: "asc" } } } });
    if (researchProjectFingerprint(project) !== data.inputFingerprint) throw new Error("INPUT_CHANGED");
    if (await tx.blueprintJob.count({ where: { projectId, id: { not: jobId }, status: { in: [...activeStatuses, "WAITING_USER_DECISION"] } } }))
      throw new Error("SCIENTIFIC_CONTINUATION_COMPETING_JOB");
    await assertQaCommitment(tx, userId, 0, jobId); // Future dispatch independently reserves complete remaining work.
    await reserveInternalGenerationJob(tx, jobId);
    const recovery = contextProof ? {...contextProof, authorizedAt:new Date().toISOString(), reason:"EXACT_REQUEST_CONTEXT_CORRECTED_BEFORE_DISPATCH",
      priorError:job.errorJson,admissionAuditId:contextAdmissionAuditId,jobId,projectId,parentJobId:continuation.contract.parentJobId,
      previousAttempts:job.attempts,previousMaxAttempts:job.maxAttempts,additionalExecutionAllowance:1,
      frozenInputFingerprint:continuation.contract.frozenInputFingerprint,parentUnchanged:true,priorCostPreserved:true,historicalAttemptLimitsUnchanged:true
    } : acquisitionProof ? { ...acquisitionProof, authorizedAt: new Date().toISOString(),
      reason: "COMPLETED_DISCOVERY_REINSPECTION_UNDER_CORRECTED_ACQUISITION", priorError: job.errorJson,
      inspectionPolicyVersion: METHOD_DOCUMENT_INSPECTION_VERSION,
      prospectiveQaGrantId: qa.overage!.grantId, effectiveJobHardUsd: qa.overage!.jobHardUsd,
      effectiveCampaignCapUsd: qa.overage!.campaignCapUsd,
      jobId, projectId, parentJobId: continuation.contract.parentJobId,
      previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts, additionalExecutionAllowance: 1,
      frozenInputFingerprint: continuation.contract.frozenInputFingerprint,
      effectiveEvidenceFingerprint: continuation.contract.effectiveEvidenceFingerprint,
      parentUnchanged: true, priorCostPreserved: true, historicalAttemptLimitsUnchanged: true,
      targetReconstructionPromptVersion: METHOD_RECONSTRUCTION_PROMPT.version,
      targetReconstructionPromptFingerprint: fingerprint(METHOD_RECONSTRUCTION_PROMPT),
    } : executionProof ? { ...executionProof, authorizedAt: new Date().toISOString(), reason: "PREDISPATCH_GATING_AND_METHOD_HANDOFF_CORRECTED", targetReconstructionPromptVersion: METHOD_RECONSTRUCTION_PROMPT.version, targetReconstructionPromptFingerprint: fingerprint(METHOD_RECONSTRUCTION_PROMPT), priorError: job.errorJson, previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts, frozenInputFingerprint: continuation.contract.frozenInputFingerprint, effectiveEvidenceFingerprint: continuation.contract.effectiveEvidenceFingerprint, parentUnchanged: true, priorCostPreserved: true } : { version: METHOD_CONTRACT_RECOVERY_VERSION, authorizedAt: new Date().toISOString(),
      reason: "STRUCTURED_OUTPUT_CONTRACT_CORRECTED", priorError: job.errorJson,
      priorResponseId: response!.responseId, priorRequestFingerprint: response!.requestFingerprint,
      priorUsageFingerprint: fingerprint(response!.usage), fromPromptVersion: "method-coverage-assessment.v1",
      toPromptVersion: METHOD_COVERAGE_ASSESSMENT_PROMPT.version, targetContractFingerprint,
      previousAttempts: job.attempts, previousMaxAttempts: job.maxAttempts,
      frozenInputFingerprint: continuation.contract.frozenInputFingerprint,
      effectiveEvidenceFingerprint: continuation.contract.effectiveEvidenceFingerprint,
      incompleteResponsePreserved: true, priorCostPreserved: true, parentUnchanged: true };
    const updated: BlueprintJob = await tx.blueprintJob.update({ where: { id: jobId }, data: {
      status: "WAITING_NEXT_STAGE", nextAttemptAt: null, completedAt: null, lockedAt: null,
      errorMessage: null, errorJson: Prisma.DbNull,
      metadataJson: json({ ...metadata, [contextRecovery ? "methodContextAdmissionRecovery" : acquisitionRecovery ? "methodAcquisitionRecovery" : executionRecovery ? "methodCoverageExecutionRecovery" : "methodAssessmentContractRecovery"]: recovery }),
    } });
    await tx.project.update({ where: { id: projectId }, data: { status: "BLUEPRINT_GENERATING" } });
    await tx.auditLog.create({ data: { userId, projectId, actorType: "USER", eventType: contextRecovery ? METHOD_CONTEXT_RECOVERY_EVENT : acquisitionRecovery ? METHOD_ACQUISITION_RECOVERY_EVENT : executionRecovery ? "SCIENTIFIC_CONTINUATION_EXECUTION_RECOVERY_AUTHORIZED" : "SCIENTIFIC_CONTINUATION_CONTRACT_RECOVERY_AUTHORIZED",
      payloadJson: json({ jobId, parentJobId: continuation.contract.parentJobId, ...recovery, recoveryFingerprint: fingerprint(recovery) }) } });
    return { job: updated, reused: false };
  });
}

/** A single explicitly audited corrected execution cycle, separate from the
 * historical failure allowance. A browser flag or unaudited metadata has no effect. */
export async function scientificContinuationAttemptLimit(db: Pick<Prisma.TransactionClient, "auditLog">,
  job: Pick<BlueprintJob, "id" | "userId" | "projectId" | "maxAttempts" | "metadataJson">) {
  const metadata = job.metadataJson as { scientificContinuation?: { parentJobId?: string; frozenInputFingerprint?: string };
    methodContextAdmissionRecovery?: {version?:string;jobId?:string;projectId?:string;previousAttempts?:number;previousMaxAttempts?:number;additionalExecutionAllowance?:number;previousRecoveryFingerprint?:string;frozenInputFingerprint?:string};
    methodAcquisitionRecovery?: { version?: string; jobId?: string; projectId?: string; parentJobId?: string;
      previousAttempts?: number; previousMaxAttempts?: number; additionalExecutionAllowance?: number; frozenInputFingerprint?: string } } | null;
  const recovery = metadata?.methodAcquisitionRecovery;
  if (!recovery || recovery.version !== METHOD_ACQUISITION_RECOVERY_VERSION || recovery.jobId !== job.id ||
    recovery.projectId !== job.projectId || recovery.previousAttempts !== job.maxAttempts ||
    recovery.previousMaxAttempts !== job.maxAttempts || recovery.additionalExecutionAllowance !== 1 ||
    recovery.parentJobId !== metadata?.scientificContinuation?.parentJobId ||
    recovery.frozenInputFingerprint !== metadata?.scientificContinuation?.frozenInputFingerprint) return job.maxAttempts;
  const audit = await db.auditLog.findFirst({ where: { userId: job.userId, projectId: job.projectId,
    eventType: METHOD_ACQUISITION_RECOVERY_EVENT, payloadJson: { path: ["jobId"], equals: job.id } }, orderBy: { createdAt: "desc" } });
  if ((audit?.payloadJson as { recoveryFingerprint?: string } | null)?.recoveryFingerprint !== fingerprint(recovery)) return job.maxAttempts;
  const next=metadata?.methodContextAdmissionRecovery;
  if(!next)return job.maxAttempts+1;
  if(next.version!==METHOD_CONTEXT_RECOVERY_VERSION||next.jobId!==job.id||next.projectId!==job.projectId||next.previousAttempts!==job.maxAttempts+1||
    next.previousMaxAttempts!==job.maxAttempts||next.additionalExecutionAllowance!==1||next.previousRecoveryFingerprint!==fingerprint(recovery)||
    next.frozenInputFingerprint!==metadata.scientificContinuation?.frozenInputFingerprint)return job.maxAttempts+1;
  const contextAudit=await db.auditLog.findFirst({where:{userId:job.userId,projectId:job.projectId,eventType:METHOD_CONTEXT_RECOVERY_EVENT,
    payloadJson:{path:["jobId"],equals:job.id}},orderBy:{createdAt:"desc"}});
  return (contextAudit?.payloadJson as {recoveryFingerprint?:string}|null)?.recoveryFingerprint===fingerprint(next)?job.maxAttempts+2:job.maxAttempts+1;
}

/** Operator-only evidence registration; no route exposes this function and it
 * does not enqueue or dispatch. The normal owner-scoped resume consumes it once. */
export async function authorizeMethodContextRecovery(input:{userId:string;projectId:string;jobId:string;issuedBy:string;reason:string;
  request:{prompt:string;schema:unknown;model:string;maxOutputTokens:number;trackingAttribution:{projectId:string;runId:string;promptVersion:string}};
  admission:CorrectedMethodAdmission}){
  if(!input.issuedBy.trim()||!input.reason.trim()||input.request.trackingAttribution.projectId!==input.projectId||
    input.request.trackingAttribution.runId!==`secure-pilot-${input.jobId}`||input.request.trackingAttribution.promptVersion!==METHOD_RECONSTRUCTION_PROMPT.version||
    input.request.model!==METHOD_RECONSTRUCTION_PROMPT.model||input.request.maxOutputTokens!==METHOD_RECONSTRUCTION_PROMPT.max_output_tokens||
    input.admission.maxOutputTokens!==input.request.maxOutputTokens||input.admission.requestFingerprint!==fingerprint(input.request)||
    input.admission.schemaFingerprint!==fingerprint(input.request.schema)||!input.request.prompt.includes(input.admission.digestFingerprint)||
    !input.request.prompt.includes(input.admission.effectiveEvidenceFingerprint))throw new Error("METHOD_CONTEXT_REQUEST_PROOF_INVALID");
  const continuation=await readScientificContinuation(input.jobId);
  if(!continuation)throw new Error("SCIENTIFIC_CONTINUATION_RECOVERY_NOT_ELIGIBLE");
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${input.jobId} FOR UPDATE`;
    const job=await tx.blueprintJob.findFirstOrThrow({where:{id:input.jobId,userId:input.userId,projectId:input.projectId}});
    const metadata=job.metadataJson as Record<string,any>;
    const priorMessage=(job.errorJson as {message?:string})?.message??"";
    if(job.status!=="FAILED"||job.currentStage!=="resolving_design"||job.lockedAt||job.attempts!==job.maxAttempts+1||
      metadata.methodContextAdmissionRecovery||await scientificContinuationAttemptLimit(tx,job)!==job.maxAttempts+1)
      throw new Error("METHOD_CONTEXT_RECOVERY_NOT_ELIGIBLE");
    if(!await qaJobPolicy(tx,job.id))throw new Error("SCIENTIFIC_CONTINUATION_NOT_AUTHORIZED");
    const stages=await tx.blueprintJobStage.findMany({where:{jobId:job.id}});
    const entries=(stages.find(row=>row.stageKey==="control:cost")?.outputJson as {entries:CostEntry[]})?.entries??[];
    const current=validateMethodAcquisitionRecovery({priorMessage:metadata.methodAcquisitionRecovery.priorError.message,
      jobId:job.id,userId:job.userId,projectId:job.projectId,runId:`secure-pilot-${job.id}`,entries,stages,
      responses:stages.filter(row=>row.stageKey.startsWith("provider:background:")).map(row=>row.outputJson as unknown as BackgroundProviderResponseRecord),
      priorAssessmentRecovery:metadata.methodAssessmentContractRecovery,priorExecutionRecovery:metadata.methodCoverageExecutionRecovery,
      operations:await tx.paidOperation.findMany({where:{userId:job.userId,projectId:job.projectId,purpose:DESIGN_MINI_RESEARCH_PURPOSE,
        createdAt:{gte:job.createdAt}},include:{calls:true}})});
    const proof=validateMethodContextRecovery({priorMessage,previous:metadata.methodAcquisitionRecovery,current,
      admission:input.admission,admissionVersion:METHOD_CONTEXT_ADMISSION_VERSION,promptVersion:METHOD_RECONSTRUCTION_PROMPT.version,costEntries:entries,stages});
    await assertQaCommitment(tx,job.userId,0,job.id);
    const payload={jobId:job.id,parentJobId:continuation.contract.parentJobId,projectId:job.projectId,
      frozenInputFingerprint:continuation.contract.frozenInputFingerprint,issuedBy:input.issuedBy,reason:input.reason,
      ...proof,admission:input.admission};
    const existing=await tx.auditLog.findFirst({where:{userId:job.userId,projectId:job.projectId,eventType:METHOD_CONTEXT_ADMISSION_EVENT,
      payloadJson:{path:["jobId"],equals:job.id}},orderBy:{createdAt:"desc"}});
    if(existing){if(fingerprint(existing.payloadJson)!==fingerprint(payload))throw new Error("METHOD_CONTEXT_ADMISSION_ALREADY_RECORDED");return existing;}
    return tx.auditLog.create({data:{userId:job.userId,projectId:job.projectId,actorType:"SYSTEM",eventType:METHOD_CONTEXT_ADMISSION_EVENT,payloadJson:json(payload)}});
  });
}
