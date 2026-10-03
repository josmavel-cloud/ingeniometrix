import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { QA_COST_POLICY_VERSION, QA_OVERAGE_AUTHORIZED_EVENT, QA_OVERAGE_POLICY_VERSION, qaCampaignCommitment } from "./qa-acceptance-policy";

export type QaOverageForecast = {
  version: "qa-closure-forecast.v1";
  stages: Array<{ stage: string; maximumUsd: number; basis: string }>;
  safetyReserveUsd: number;
  contingencyUsd: number;
  evidence: string;
};
export type QaOverageRequest = { userId: string; projectId: string; jobId: string; campaignId: string;
  issuedBy: string; reason: string; expiresAt: string; supersedesGrantId?: string; jobHardUsd: number; campaignCapUsd: number; forecast: QaOverageForecast };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const finiteMoney = (value: number) => Number.isFinite(value) && value >= 0;

// Trusted operations only. This is not reachable from an HTTP action or client role.
// Dry-run and apply inspect the same frozen identity and existing, conservatively
// accounted history. Apply appends one grant; it never edits ledgers or snapshots.
export async function provisionQaOverage(input: QaOverageRequest, apply = false) {
  const expiry = new Date(input.expiresAt);
  if (!input.issuedBy?.trim() || !input.reason?.trim() || !Number.isFinite(expiry.getTime()) || expiry <= new Date() ||
    expiry.getTime() > Date.now() + 48 * 3600_000 || !finiteMoney(input.jobHardUsd) || !finiteMoney(input.campaignCapUsd) ||
    input.forecast?.version !== "qa-closure-forecast.v1" || !input.forecast.evidence?.trim() ||
    !input.forecast.stages?.length || input.forecast.stages.some(stage => !stage.stage?.trim() || !stage.basis?.trim() || !finiteMoney(stage.maximumUsd)) ||
    !finiteMoney(input.forecast.safetyReserveUsd) || !finiteMoney(input.forecast.contingencyUsd))
    throw new Error("QA_OVERAGE_REQUEST_INVALID");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${input.jobId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
    const job = await tx.blueprintJob.findFirstOrThrow({ where: { id: input.jobId, userId: input.userId, projectId: input.projectId },
      select: { metadataJson: true, status: true } });
    const metadata = job.metadataJson as { qaCampaignId?: string; costPolicyVersion?: string; commercialPolicy?: string;
      scientificContinuation?: { version: string; parentJobId: string; frozenInputFingerprint: string; grantAuditId: string } } | null;
    const continuation = metadata?.scientificContinuation;
    const campaign = await tx.qaAcceptanceCampaign.findFirstOrThrow({ where: { id: input.campaignId, userId: input.userId, status: "ACTIVE" } });
    const capability = await tx.internalGenerationCapability.findFirst({ where: { userId: input.userId, status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } });
    if (!capability || !continuation || metadata?.qaCampaignId !== campaign.id || metadata.costPolicyVersion !== QA_COST_POLICY_VERSION ||
      metadata.commercialPolicy !== "internal-platform-v1" || !["FAILED", "RUNNING", "QUEUED", "WAITING_NEXT_STAGE"].includes(job.status) ||
      campaign.totalCapMicros > 10_000_000 || campaign.jobCapMicros > 5_000_000 || campaign.maxJobs > 2 ||
      input.jobHardUsd < campaign.jobCapMicros / 1e6 || input.campaignCapUsd < campaign.totalCapMicros / 1e6)
      throw new Error("QA_OVERAGE_TECHNICAL_JOB_NOT_AUTHORIZED");
    const originalGrant = await tx.auditLog.findFirst({ where: { id: continuation.grantAuditId, userId: input.userId,
      projectId: input.projectId, eventType: "SCIENTIFIC_CONTINUATION_QA_AUTHORIZED" } });
    const authority = originalGrant?.payloadJson as { version?: string; parentJobId?: string; campaignId?: string;
      frozenInputFingerprint?: string; expiresAt?: string; maxContinuations?: number } | null;
    if (continuation.version !== "method-coverage-continuation.v1" || authority?.version !== continuation.version ||
      authority.parentJobId !== continuation.parentJobId || authority.campaignId !== campaign.id ||
      authority.frozenInputFingerprint !== continuation.frozenInputFingerprint || authority.maxContinuations !== 1 ||
      !authority.expiresAt || !Number.isFinite(new Date(authority.expiresAt).getTime()) || expiry > new Date(authority.expiresAt) ||
      await tx.auditLog.count({ where: { userId: input.userId, projectId: input.projectId,
        eventType: "SCIENTIFIC_CONTINUATION_QA_REVOKED", payloadJson: { path: ["grantAuditId"], equals: continuation.grantAuditId } } }))
      throw new Error("QA_OVERAGE_CONTINUATION_AUTHORITY_INVALID");
    const authorizationFingerprint = hash(input);
    const prior = await tx.auditLog.findFirst({ where: { userId: input.userId, projectId: input.projectId,
      eventType: QA_OVERAGE_AUTHORIZED_EVENT, payloadJson: { path: ["jobId"], equals: input.jobId } }, orderBy: { createdAt: "desc" } });
    const previousAuthorization = prior?.payloadJson as { authorizationFingerprint?: string; jobHardUsd?: number; campaignCapUsd?: number;
      campaignId?: string; frozenInputFingerprint?: string; supersedesGrantId?: string } | null;
    if (prior) {
      // A revoked branch cannot be reopened by changing the request fingerprint.
      let ancestor: typeof prior | null = prior;
      const visited = new Set<string>();
      while (ancestor) {
        if (visited.has(ancestor.id)) throw new Error("QA_OVERAGE_GRANT_CHAIN_INVALID");
        visited.add(ancestor.id);
        if (await tx.auditLog.count({ where: { userId: input.userId, eventType: "SCIENTIFIC_QA_OVERAGE_REVOKED",
          payloadJson: { path: ["grantId"], equals: ancestor.id } } })) throw new Error("QA_OVERAGE_GRANT_REVOKED");
        const parentId: string | undefined = (ancestor.payloadJson as { supersedesGrantId?: string }).supersedesGrantId;
        ancestor = parentId ? await tx.auditLog.findFirst({ where: { id: parentId, userId: input.userId, projectId: input.projectId,
          eventType: QA_OVERAGE_AUTHORIZED_EVENT, payloadJson: { path: ["jobId"], equals: input.jobId } } }) : null;
        if (parentId && !ancestor) throw new Error("QA_OVERAGE_GRANT_CHAIN_INVALID");
      }
      if (previousAuthorization?.authorizationFingerprint === authorizationFingerprint)
        return { applied: true, reused: true, grantId: prior.id, authorization: prior.payloadJson };
      if (input.supersedesGrantId !== prior.id || previousAuthorization?.campaignId !== campaign.id ||
        previousAuthorization.frozenInputFingerprint !== continuation.frozenInputFingerprint ||
        !Number.isFinite(previousAuthorization.jobHardUsd) || !Number.isFinite(previousAuthorization.campaignCapUsd) ||
        input.jobHardUsd < previousAuthorization.jobHardUsd! || input.campaignCapUsd < previousAuthorization.campaignCapUsd!)
        throw new Error("QA_OVERAGE_GRANT_CONFLICT");
    } else if (input.supersedesGrantId) throw new Error("QA_OVERAGE_SUPERSEDED_GRANT_NOT_FOUND");
    const totals = await qaCampaignCommitment(tx, campaign);
    const current = totals.jobCommitments.find(item => item.jobId === input.jobId);
    if (!current) throw new Error("QA_OVERAGE_COST_HISTORY_REQUIRED");
    const remaining = input.forecast.stages.reduce((sum, stage) => sum + stage.maximumUsd, 0);
    const projectedJob = current.known + current.unknown + remaining + input.forecast.safetyReserveUsd + input.forecast.contingencyUsd;
    const projectedCampaign = totals.committed - current.known - current.unknown + input.jobHardUsd;
    // Explicit caps must cover the supplied complete path, with at most a dollar
    // of rounding headroom. Larger contingency must be quantified in the forecast.
    if (projectedJob > input.jobHardUsd + 1e-8 || input.jobHardUsd > Math.ceil(projectedJob - 1e-8) ||
      projectedCampaign > input.campaignCapUsd + 1e-8 || input.campaignCapUsd > Math.max(campaign.totalCapMicros / 1e6, Math.ceil(projectedCampaign - 1e-8)))
      throw new Error("QA_OVERAGE_FORECAST_OR_CEILING_INVALID");
    const authorization = { version: QA_OVERAGE_POLICY_VERSION, jobId: input.jobId, projectId: input.projectId,
      campaignId: campaign.id, frozenInputFingerprint: continuation.frozenInputFingerprint, capabilityId: capability.id,
      issuedBy: input.issuedBy, reason: input.reason, expiresAt: expiry.toISOString(), jobHardUsd: input.jobHardUsd,
      campaignCapUsd: input.campaignCapUsd, authorizationFingerprint,
      supersedesGrantId: prior?.id ?? null,
      priorJobHardUsd: previousAuthorization?.jobHardUsd ?? campaign.jobCapMicros / 1e6,
      priorCampaignCapUsd: previousAuthorization?.campaignCapUsd ?? campaign.totalCapMicros / 1e6,
      knownJobCost: current.known, unknownJobReserved: current.unknown, campaignKnownCost: totals.known,
      campaignUnknownReserved: totals.unknown, projectedJob, projectedCampaign, forecast: input.forecast,
      historicalPoliciesAndUsageUnchanged: true, newJobsAuthorized: 0 };
    if (!apply) return { applied: false, reused: false, grantId: null, authorization };
    const grant = await tx.auditLog.create({ data: { userId: input.userId, projectId: input.projectId, actorType: "SYSTEM",
      eventType: QA_OVERAGE_AUTHORIZED_EVENT, payloadJson: json(authorization) } });
    return { applied: true, reused: false, grantId: grant.id, authorization };
  });
}

export async function revokeQaOverage(input: { grantId: string; issuedBy: string; reason: string }) {
  if (!input.issuedBy.trim() || !input.reason.trim()) throw new Error("QA_OVERAGE_AUTHORITY_REQUIRED");
  return prisma.$transaction(async tx => {
    const grant = await tx.auditLog.findFirstOrThrow({ where: { id: input.grantId, eventType: QA_OVERAGE_AUTHORIZED_EVENT } });
    const value = grant.payloadJson as { jobId: string };
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${value.jobId} FOR UPDATE`;
    const previous = await tx.auditLog.findFirst({ where: { userId: grant.userId, eventType: "SCIENTIFIC_QA_OVERAGE_REVOKED",
      payloadJson: { path: ["grantId"], equals: grant.id } } });
    if (previous) return previous;
    return tx.auditLog.create({ data: { userId: grant.userId, projectId: grant.projectId, actorType: "SYSTEM",
      eventType: "SCIENTIFIC_QA_OVERAGE_REVOKED", payloadJson: { version: QA_OVERAGE_POLICY_VERSION, ...input } } });
  });
}
