import type { Prisma } from "@prisma/client";

export const QA_COST_POLICY_VERSION = "scientific-closure-qa.v1";
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
  const job = await tx.blueprintJob.findUniqueOrThrow({ where: { id: jobId }, select: { userId: true, metadataJson: true } });
  const metadata = job.metadataJson as { qaCampaignId?: string; costPolicyVersion?: string; commercialPolicy?: string } | null;
  if (metadata?.costPolicyVersion !== QA_COST_POLICY_VERSION) return null;
  if (!metadata.qaCampaignId || metadata.commercialPolicy !== "internal-platform-v1") throw new Error("QA_AUTHORIZATION_INVALID");
  const campaign = await tx.qaAcceptanceCampaign.findUniqueOrThrow({ where: { id: metadata.qaCampaignId } });
  if (campaign.userId !== job.userId || campaign.status !== "ACTIVE" || campaign.expiresAt <= new Date() ||
    campaign.totalCapMicros > 10_000_000 || campaign.jobCapMicros > 5_000_000 || campaign.maxJobs > 2)
    throw new Error("QA_AUTHORIZATION_EXPIRED_OR_INVALID");
  return { campaign, policy: { target: 2, soft: 2.5, hard: campaign.jobCapMicros / 1e6, deep: 0.5, mandatoryReserve: 0.25, version: QA_COST_POLICY_VERSION } };
}

export async function assertQaCommitment(tx: Prisma.TransactionClient, userId: string, additionalUsd: number) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const campaign = await activeQaCampaign(tx, userId);
  if (!campaign) return;
  const jobs = await tx.blueprintJob.findMany({ where: { userId, metadataJson: { path: ["qaCampaignId"], equals: campaign.id } },
    select: { id: true, stages: { where: { stageKey: "control:cost" }, select: { outputJson: true } } } });
  const linked = new Set<string>();
  let committed = 0;
  for (const job of jobs) for (const stage of job.stages) {
    const entries = (stage.outputJson as { entries?: Array<{ paidOperationId?: string; estimate: number | null; maximum: number }> } | null)?.entries ?? [];
    for (const entry of entries) { committed += entry.estimate ?? entry.maximum; if (entry.paidOperationId) linked.add(entry.paidOperationId); }
  }
  // A linked provider call appears in two audit views, but is counted once.
  const operations = await tx.paidOperation.findMany({ where: { userId, createdAt: { gte: campaign.createdAt } }, select: { id: true, committedMicros: true } });
  committed += operations.filter(operation => !linked.has(operation.id)).reduce((sum, operation) => sum + operation.committedMicros / 1e6, 0);
  if (!Number.isFinite(additionalUsd) || additionalUsd < 0 || committed + additionalUsd > campaign.totalCapMicros / 1e6)
    throw new Error("QA_COMMITMENT_LIMIT_REACHED");
  return { campaignId: campaign.id, committedBefore: committed, additionalUsd, ceiling: campaign.totalCapMicros / 1e6 };
}
