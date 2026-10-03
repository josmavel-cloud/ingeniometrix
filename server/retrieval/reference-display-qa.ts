import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { activeInternalGenerationCapability } from "@/server/commercial/internal-generation";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { activeQaCampaign, assertQaCommitment } from "@/server/mvp/qa-acceptance-policy";
import { matchesReferenceDisplayBatch, referenceDisplayBatchIdentity, REFERENCE_DISPLAY_JOB_POLICY } from "./reference-display-job-policy";

export const REFERENCE_DISPLAY_QA_POLICY = "reference-display-qa.v1";
const GRANT = "REFERENCE_DISPLAY_QA_AUTHORIZED";
type GrantPayload = { version: string; campaignId: string; projectId: string; requestKey: string; sourceRequestKey: string;
  expiresAt: string; priorJobId: string; capabilityId: string; maximumMicros: number; issuedBy: string; reason: string };

/** Trusted operations only: no HTTP endpoint and no client supplied role/campaign.
 * One content-bound batch after a demonstrated denial before provider dispatch.
 * Prior job/operation/cost records are never rewritten. */
export async function authorizeReferenceDisplayQaBatch(input: { userId: string; projectId: string; priorJobId: string;
  campaignId: string; issuedBy: string; reason: string }) {
  if (!input.issuedBy.trim() || !input.reason.trim()) throw new Error("REFERENCE_DISPLAY_QA_AUTHORITY_REQUIRED");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
    const campaign = await activeQaCampaign(tx, input.userId);
    const capability = await activeInternalGenerationCapability(input.userId, tx);
    if (!campaign || campaign.id !== input.campaignId || !capability ||
      !await tx.project.findFirst({ where: { id: input.projectId, userId: input.userId } }))
      throw new Error("REFERENCE_DISPLAY_QA_AUTHORIZATION_INVALID");
    const prior = await tx.referenceDisplayJob.findFirst({ where: { id: input.priorJobId, userId: input.userId, projectId: input.projectId } });
    if (!prior || !["FAILED", "BUDGET_UNAVAILABLE"].includes(prior.status)) throw new Error("REFERENCE_DISPLAY_QA_PARENT_NOT_FAILED");
    const paid = await tx.paidOperation.findUnique({ where: { userId_requestId: { userId: input.userId, requestId: prior.requestKey } }, include: { calls: true } });
    if (!paid || paid.status !== "FAILED" || paid.calls.length || paid.committedMicros !== 0 || paid.boundBreached)
      throw new Error("REFERENCE_DISPLAY_QA_NOT_PROVEN_UNDISPATCHED");
    const ids = prior.referenceIdsJson as string[];
    if (!Array.isArray(ids) || !ids.length || ids.length > 4 || ids.some(id => typeof id !== "string"))
      throw new Error("REFERENCE_DISPLAY_JOB_INPUT_INVALID");
    const rows = await tx.projectReference.findMany({ where: { projectId: input.projectId, referenceId: { in: ids } }, include: { reference: true } });
    if (rows.length !== ids.length || !matchesReferenceDisplayBatch(prior.requestKey, input.projectId, prior.targetLanguage, rows))
      throw new Error("REFERENCE_DISPLAY_INPUT_CHANGED");
    const sourceRequestKey = referenceDisplayBatchIdentity(input.projectId, prior.targetLanguage, rows);
    const requestKey = `reference-display-qa:${fingerprint([prior.id, sourceRequestKey, REFERENCE_DISPLAY_QA_POLICY])}`;
    const previousGrant = await tx.auditLog.findFirst({ where: { userId: input.userId, projectId: input.projectId, eventType: GRANT,
      payloadJson: { path: ["requestKey"], equals: requestKey } } });
    if (previousGrant) return tx.referenceDisplayJob.findUniqueOrThrow({ where: { requestKey } });
    // An overlapping uncertain batch cannot be escaped by changing grouping.
    const jobs = await tx.referenceDisplayJob.findMany({ where: { userId: input.userId, projectId: input.projectId } });
    const overlap = jobs.filter(job => job.id !== prior.id && Array.isArray(job.referenceIdsJson) && job.referenceIdsJson.some(id => ids.includes(String(id))));
    for (const job of overlap) {
      if (["QUEUED", "RUNNING"].includes(job.status)) throw new Error("REFERENCE_DISPLAY_ALREADY_RUNNING");
      const operation = await tx.paidOperation.findUnique({ where: { userId_requestId: { userId: input.userId, requestId: job.requestKey } }, include: { calls: true } });
      if (operation?.calls.some(call => call.estimatedMicros === null || call.status !== "COMPLETED") ||
        operation?.status === "FAILED" && operation.calls.length > 0)
        throw new Error("REFERENCE_DISPLAY_USAGE_RECONCILIATION_REQUIRED");
    }
    await assertQaCommitment(tx, input.userId, 0.25);
    const job = await tx.referenceDisplayJob.create({ data: { userId: input.userId, projectId: input.projectId, requestKey,
      targetLanguage: prior.targetLanguage, referenceIdsJson: ids } });
    const payload: GrantPayload = { version: REFERENCE_DISPLAY_QA_POLICY, campaignId: campaign.id, projectId: input.projectId,
      requestKey, sourceRequestKey, priorJobId: prior.id, capabilityId: capability.id, maximumMicros: 250000,
      expiresAt: new Date(Math.min(campaign.expiresAt.getTime(), Date.now() + 48 * 3600000)).toISOString(),
      issuedBy: input.issuedBy, reason: input.reason };
    await tx.auditLog.create({ data: { userId: input.userId, projectId: input.projectId, actorType: "SYSTEM", eventType: GRANT,
      payloadJson: { ...payload, displayJobId: job.id, executionPolicy: REFERENCE_DISPLAY_JOB_POLICY,
        previousPaidOperationId: paid.id, previousCommittedMicros: paid.committedMicros } } });
    return job;
  });
}

/** Rechecked at worker execution AND before each paid reservation. */
export async function referenceDisplayQaPolicy(tx: Prisma.TransactionClient, input: { userId: string; projectId?: string;
  requestId: string; purpose: string }) {
  if (input.purpose !== "REFERENCE_DISPLAY" || !input.requestId.startsWith("reference-display-qa:")) return null;
  const grant = await tx.auditLog.findFirst({ where: { userId: input.userId, projectId: input.projectId, eventType: GRANT,
    payloadJson: { path: ["requestKey"], equals: input.requestId } }, orderBy: { createdAt: "desc" } });
  const payload = grant?.payloadJson as GrantPayload | null;
  const revoked = grant && await tx.auditLog.findFirst({ where: { userId: input.userId, eventType: "REFERENCE_DISPLAY_QA_REVOKED",
    payloadJson: { path: ["grantId"], equals: grant.id } } });
  const campaign = payload && await tx.qaAcceptanceCampaign.findUnique({ where: { id: payload.campaignId } });
  const activeCampaign = await activeQaCampaign(tx, input.userId);
  const expiry = payload ? new Date(payload.expiresAt).getTime() : NaN;
  const capability = payload && await tx.internalGenerationCapability.findUnique({ where: { id: payload.capabilityId } });
  if (!payload || revoked || payload.version !== REFERENCE_DISPLAY_QA_POLICY || payload.projectId !== input.projectId ||
    payload.maximumMicros !== 250000 || !Number.isFinite(expiry) || expiry <= Date.now() || !campaign || activeCampaign?.id !== campaign.id || campaign.userId !== input.userId ||
    campaign.status !== "ACTIVE" || campaign.expiresAt <= new Date() || !capability || capability.userId !== input.userId ||
    capability.status !== "ACTIVE" || capability.expiresAt && capability.expiresAt <= new Date() ||
    !await tx.project.findFirst({ where: { id: input.projectId, userId: input.userId } }))
    throw new Error("REFERENCE_DISPLAY_QA_AUTHORIZATION_INVALID");
  return { grantId: grant!.id, campaignId: campaign.id, maximumMicros: payload.maximumMicros, sourceRequestKey: payload.sourceRequestKey };
}
