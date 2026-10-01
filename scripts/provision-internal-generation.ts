import { prisma } from "@/lib/prisma";
import { securityAudit } from "@/server/auth/security-events";

const args = Object.fromEntries(process.argv.slice(2).map(part => {
  const equal = part.indexOf("=");
  if (!part.startsWith("--") || equal < 3) throw new Error("INVALID_ARGUMENT");
  return [part.slice(2, equal), part.slice(equal + 1)];
}));
const action = args.action;
if (!["grant", "revoke", "status"].includes(action) || !/^[0-9a-f-]{36}$/i.test(args.userId ?? "") ||
  !/^[a-z0-9:_-]{8,100}$/i.test(args.grantKey ?? "")) throw new Error("INVALID_PROVISIONING_CONTEXT");

async function main() {
  const user = await prisma.user.findUnique({ where: { id: args.userId }, select: { id: true,
    _count: { select: { projects: true, sessions: true } } } });
  if (!user || user._count.projects < 1 || user._count.sessions < 1) throw new Error("OWNER_IDENTITY_NOT_VERIFIED");
  const existing = await prisma.internalGenerationCapability.findUnique({ where: { grantKey: args.grantKey } });
  if (action === "status") {
    console.log(JSON.stringify({ userId: user.id, grantKey: args.grantKey, status: existing?.status ?? "ABSENT" }));
    return;
  }
  if (!args.actor || !args.reason || args.actor.length > 100 || args.reason.length > 240)
    throw new Error("PROVISIONING_AUDIT_CONTEXT_REQUIRED");
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    if (action === "grant") {
      if (existing && existing.userId !== user.id) throw new Error("GRANT_KEY_OWNER_CONFLICT");
      if (existing?.status === "REVOKED") throw new Error("REVOKED_GRANT_CANNOT_BE_REUSED");
      const grant = existing ?? await tx.internalGenerationCapability.create({ data: { userId: user.id,
        grantKey: args.grantKey, issuedBy: args.actor, reason: args.reason } });
      if (!existing) await securityAudit("INTERNAL_GENERATION_CAPABILITY_GRANTED", user.id,
        { capabilityId: grant.id, actor: args.actor, reason: args.reason }, tx);
      return { id: grant.id, status: grant.status };
    }
    if (!existing || existing.userId !== user.id) throw new Error("CAPABILITY_NOT_FOUND");
    if (existing.status === "REVOKED") return { id: existing.id, status: existing.status };
    const grant = await tx.internalGenerationCapability.update({ where: { id: existing.id }, data: { status: "REVOKED",
      revokedAt: new Date(), revokedBy: args.actor } });
    await securityAudit("INTERNAL_GENERATION_CAPABILITY_REVOKED", user.id,
      { capabilityId: grant.id, actor: args.actor, reason: args.reason }, tx);
    return { id: grant.id, status: grant.status };
  });
  console.log(JSON.stringify({ userId: user.id, capabilityId: result.id, status: result.status }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : "PROVISIONING_FAILED"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
