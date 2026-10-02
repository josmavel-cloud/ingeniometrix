import { prisma } from "@/lib/prisma";
import { securityAudit } from "@/server/auth/security-events";
import { activeInternalGenerationCapability } from "@/server/commercial/internal-generation";

// Operations-only command; never bundled into an HTTP handler or public UI.
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const index = value.indexOf("=");
  if (!value.startsWith("--") || index < 3) throw new Error("INVALID_ARGUMENT");
  return [value.slice(2, index), value.slice(index + 1)];
}));
async function main() {
  const expiresAt = new Date(args.expiresAt);
  if (!/^[a-f0-9-]{36}$/.test(args.userId ?? "") || !/^[a-z0-9-]{8,80}$/.test(args.campaignId ?? "") ||
    !args.actor || !args.reason || !Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() ||
    expiresAt.getTime() > Date.now() + 48 * 3600_000) throw new Error("QA_PROVISIONING_CONTEXT_INVALID");
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${args.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: args.userId }, select: { _count: { select: { sessions: true, projects: true } } } });
    if (!user._count.sessions || !user._count.projects || !await activeInternalGenerationCapability(args.userId, tx))
      throw new Error("QA_TECHNICAL_IDENTITY_NOT_AUTHORIZED");
    const old = await tx.qaAcceptanceCampaign.findUnique({ where: { id: args.campaignId } });
    if (old) {
      if (old.userId !== args.userId || old.expiresAt.getTime() !== expiresAt.getTime()) throw new Error("QA_CAMPAIGN_CONFLICT");
      return old;
    }
    if (await tx.qaAcceptanceCampaign.findFirst({ where: { userId: args.userId, status: "ACTIVE", expiresAt: { gt: new Date() } } }))
      throw new Error("QA_CAMPAIGN_ALREADY_ACTIVE");
    const campaign = await tx.qaAcceptanceCampaign.create({ data: { id: args.campaignId, userId: args.userId,
      issuedBy: args.actor, reason: args.reason, expiresAt, totalCapMicros: 10_000_000, jobCapMicros: 5_000_000, maxJobs: 2 } });
    await securityAudit("SCIENTIFIC_QA_CAMPAIGN_AUTHORIZED", args.userId, { campaignId: campaign.id,
      actor: args.actor, reason: args.reason, expiresAt: expiresAt.toISOString(), additionalUsd: 10, perJobUsd: 5, maxJobs: 2 }, tx);
    return campaign;
  });
  console.log(JSON.stringify({ campaignId: result.id, expiresAt: result.expiresAt, totalUsd: result.totalCapMicros / 1e6,
    perJobUsd: result.jobCapMicros / 1e6, maxJobs: result.maxJobs }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "QA_PROVISIONING_FAILED"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
