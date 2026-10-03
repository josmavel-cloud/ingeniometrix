import type { Prisma } from "@prisma/client";

export const QA_COST_POLICY_VERSION = "scientific-closure-qa.v1";
export const QA_OVERAGE_POLICY_VERSION = "scientific-closure-overage.v1";
export const QA_OVERAGE_AUTHORIZED_EVENT = "SCIENTIFIC_QA_OVERAGE_AUTHORIZED";
export type QaOverage = { grantId: string; jobHardUsd: number; campaignCapUsd: number; expiresAt: string };

async function qaOverageForJob(tx: Prisma.TransactionClient, job: { id: string; userId: string; projectId: string },
  campaignId: string, frozenInputFingerprint?: string): Promise<QaOverage | null> {
  const grants = await tx.auditLog.findMany({ where: { userId: job.userId, projectId: job.projectId,
    eventType: QA_OVERAGE_AUTHORIZED_EVENT, payloadJson: { path: ["jobId"], equals: job.id } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const grant = grants[0];
  if (!grant) return null;
  const value = grant.payloadJson as { version?: string; campaignId?: string; jobId?: string; projectId?: string;
    frozenInputFingerprint?: string; jobHardUsd?: number; campaignCapUsd?: number; expiresAt?: string; issuedBy?: string; reason?: string } | null;
  if (value?.version !== QA_OVERAGE_POLICY_VERSION || value.campaignId !== campaignId || value.jobId !== job.id ||
    value.projectId !== job.projectId || !frozenInputFingerprint || value.frozenInputFingerprint !== frozenInputFingerprint ||
    !value.issuedBy || !value.reason || !value.expiresAt || !Number.isFinite(new Date(value.expiresAt).getTime()) ||
    new Date(value.expiresAt).getTime() > grant.createdAt.getTime() + 48 * 3600_000 ||
    !Number.isFinite(value.jobHardUsd) || value.jobHardUsd! <= 0 || !Number.isFinite(value.campaignCapUsd) || value.campaignCapUsd! < value.jobHardUsd!)
    throw new Error("QA_OVERAGE_AUTHORIZATION_INVALID");
  if (new Date(value.expiresAt) <= new Date()) return null;
  // Supersession is append-only and linear. Revoking any ancestor revokes the
  // whole branch; never silently fall back to a superseded spending authority.
  let ancestor: typeof grant | undefined = grant;
  const visited = new Set<string>();
  while (ancestor) {
    if (visited.has(ancestor.id)) throw new Error("QA_OVERAGE_GRANT_CHAIN_INVALID");
    visited.add(ancestor.id);
    const child = ancestor.payloadJson as { version?: string; campaignId?: string; frozenInputFingerprint?: string;
      jobHardUsd: number; campaignCapUsd: number; supersedesGrantId?: string | null };
    if (child.version !== QA_OVERAGE_POLICY_VERSION || child.campaignId !== campaignId || child.frozenInputFingerprint !== frozenInputFingerprint)
      throw new Error("QA_OVERAGE_GRANT_CHAIN_INVALID");
    if (await tx.auditLog.count({ where: { userId: job.userId, eventType: "SCIENTIFIC_QA_OVERAGE_REVOKED",
      payloadJson: { path: ["grantId"], equals: ancestor.id } } })) return null;
    const previous = child.supersedesGrantId ? grants.find(item => item.id === child.supersedesGrantId) : undefined;
    if (child.supersedesGrantId && (!previous || previous.createdAt > ancestor.createdAt ||
      (previous.payloadJson as { jobHardUsd: number }).jobHardUsd > child.jobHardUsd ||
      (previous.payloadJson as { campaignCapUsd: number }).campaignCapUsd > child.campaignCapUsd))
      throw new Error("QA_OVERAGE_GRANT_CHAIN_INVALID");
    ancestor = previous;
  }
  const capability = await tx.internalGenerationCapability.findFirst({ where: { userId: job.userId, status: "ACTIVE",
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } });
  if (!capability) throw new Error("INTERNAL_GENERATION_CAPABILITY_REQUIRED");
  return { grantId: grant.id, jobHardUsd: value.jobHardUsd!, campaignCapUsd: value.campaignCapUsd!, expiresAt: value.expiresAt };
}
export function allowsNewQaAcceptance(campaign: { id: string; status: string; expiresAt: Date; maxJobs: number } | null,
  priorCampaignId: unknown, explicitOperation: boolean) {
  return Boolean(campaign && campaign.status === "ACTIVE" && campaign.expiresAt > new Date() &&
    campaign.maxJobs <= 2 && campaign.id === priorCampaignId && explicitOperation);
}
export async function activeQaCampaign(tx: Prisma.TransactionClient, userId: string) {
  // Authorization is provisioned by a trusted operations command, never HTTP input.
  return tx.qaAcceptanceCampaign.findFirst({ where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
}
export async function qaJobPolicy(tx: Prisma.TransactionClient, jobId: string) {
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId }, select: { id: true, userId: true, projectId: true, metadataJson: true } });
  const metadata = job.metadataJson as { qaCampaignId?: string; costPolicyVersion?: string; commercialPolicy?: string; scientificContinuation?: { version: string; parentJobId: string; frozenInputFingerprint: string; grantAuditId: string } } | null;
  if (metadata?.costPolicyVersion !== QA_COST_POLICY_VERSION) return null;
  if (!metadata.qaCampaignId || metadata.commercialPolicy !== "internal-platform-v1") throw new Error("QA_AUTHORIZATION_INVALID");
  const campaign = await tx.qaAcceptanceCampaign.findUniqueOrThrow({ where: { id: metadata.qaCampaignId } });
  const overage = await qaOverageForJob(tx, job, campaign.id, metadata.scientificContinuation?.frozenInputFingerprint);
  if (campaign.userId !== job.userId || campaign.status !== "ACTIVE" || (campaign.expiresAt <= new Date() && !overage) ||
    campaign.totalCapMicros > 10_000_000 || campaign.jobCapMicros > 5_000_000 || campaign.maxJobs > 2)
    throw new Error("QA_AUTHORIZATION_EXPIRED_OR_INVALID");
  if (metadata.scientificContinuation) {
    const continuation = metadata.scientificContinuation;
    const grant = await tx.auditLog.findFirst({ where: { id: continuation.grantAuditId, userId: job.userId,
      projectId: job.projectId, eventType: "SCIENTIFIC_CONTINUATION_QA_AUTHORIZED" } });
    const authorization = grant?.payloadJson as { version?: string; parentJobId?: string; campaignId?: string;
      frozenInputFingerprint?: string; expiresAt?: string; maxContinuations?: number } | null;
    const revoked = await tx.auditLog.count({ where: { userId: job.userId, projectId: job.projectId,
      eventType: "SCIENTIFIC_CONTINUATION_QA_REVOKED", payloadJson: { path: ["grantAuditId"], equals: continuation.grantAuditId } } });
    if (continuation.version !== "method-coverage-continuation.v1" || !authorization || revoked ||
      authorization.version !== continuation.version || authorization.parentJobId !== continuation.parentJobId ||
      authorization.campaignId !== campaign.id || authorization.frozenInputFingerprint !== continuation.frozenInputFingerprint ||
      authorization.maxContinuations !== 1 || !authorization.expiresAt || new Date(authorization.expiresAt) <= new Date())
      throw new Error("SCIENTIFIC_CONTINUATION_NOT_AUTHORIZED");
  }
  return { campaign, overage, policy: { target: 2, soft: 2.5, hard: overage?.jobHardUsd ?? campaign.jobCapMicros / 1e6,
    deep: 0.5, mandatoryReserve: 0.25, version: QA_COST_POLICY_VERSION } };
}

export async function qaCampaignCommitment(tx: Prisma.TransactionClient, campaign: { id: string; userId: string; createdAt: Date }) {
  const jobs = await tx.blueprintJob.findMany({ where: { userId: campaign.userId, metadataJson: { path: ["qaCampaignId"], equals: campaign.id } },
    select: { id: true, stages: { where: { stageKey: "control:cost" }, select: { outputJson: true } } } });
  const linked = new Set<string>();
  let known = 0, unknown = 0;
  const jobCommitments: Array<{ jobId: string; known: number; unknown: number }> = [];
  for (const job of jobs) {
    let jobKnown = 0, jobUnknown = 0;
    for (const stage of job.stages) {
      const entries = (stage.outputJson as { entries?: Array<{ paidOperationId?: string; estimate: number | null; maximum: number }> } | null)?.entries ?? [];
      for (const entry of entries) {
        if (!Number.isFinite(entry.maximum) || entry.maximum < 0 || entry.estimate !== null && (!Number.isFinite(entry.estimate) || entry.estimate < 0))
          throw new Error("QA_COST_RECORD_INVALID");
        if (entry.estimate === null) jobUnknown += entry.maximum; else jobKnown += entry.estimate;
        if (entry.paidOperationId) linked.add(entry.paidOperationId);
      }
    }
    known += jobKnown; unknown += jobUnknown;
    jobCommitments.push({ jobId: job.id, known: jobKnown, unknown: jobUnknown });
  }
  // Linked job entries and PaidOperation are two audit views of one charge.
  const operations = await tx.paidOperation.findMany({ where: { userId: campaign.userId, createdAt: { gte: campaign.createdAt } },
    select: { id: true, committedMicros: true, calls: { select: { estimatedMicros: true, reservedMicros: true } } } });
  for (const operation of operations.filter(item => !linked.has(item.id))) {
    const pending = operation.calls.reduce((sum, call) => sum + (call.estimatedMicros === null ? call.reservedMicros : 0), 0);
    if (pending > operation.committedMicros || operation.committedMicros < 0) throw new Error("QA_COST_RECORD_INVALID");
    unknown += pending / 1e6; known += (operation.committedMicros - pending) / 1e6;
  }
  return { committed: known + unknown, known, unknown, jobCommitments };
}

export async function assertQaCommitment(tx: Prisma.TransactionClient, userId: string, additionalUsd: number, jobId?: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const qa = jobId ? await qaJobPolicy(tx, jobId) : null;
  if (qa && qa.campaign.userId !== userId) throw new Error("QA_AUTHORIZATION_INVALID");
  const campaign = qa?.campaign ?? await activeQaCampaign(tx, userId);
  if (!campaign) return;
  const totals = await qaCampaignCommitment(tx, campaign);
  const ceiling = qa?.overage?.campaignCapUsd ?? campaign.totalCapMicros / 1e6;
  if (!Number.isFinite(additionalUsd) || additionalUsd < 0 || totals.committed + additionalUsd > ceiling)
    throw new Error("QA_COMMITMENT_LIMIT_REACHED");
  return { campaignId: campaign.id, committedBefore: totals.committed, knownBefore: totals.known, unknownBefore: totals.unknown,
    additionalUsd, ceiling, overageGrantId: qa?.overage?.grantId ?? null };
}
