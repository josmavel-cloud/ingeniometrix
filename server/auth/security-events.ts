import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const secretHash = (value: string) => createHash("sha256").update(value).digest("hex");
export async function securityAudit(eventType: string, userId: string | null, payload: Record<string, string | number | boolean | null> = {}, tx: Prisma.TransactionClient = prisma) {
  await tx.auditLog.create({ data: { eventType, userId, actorType: "SYSTEM", payloadJson: payload } });
}
// Database lock serializes limits across app processes. Proxy IP trust is opt-in.
export async function rateLimit(scope: string, subject: string, max: number, windowSeconds = 900) {
  const keyHash = secretHash(`g4:${scope}:${subject}`);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${keyHash}))`;
    const row = await tx.authThrottle.findUnique({ where: { keyHash } });
    const now = new Date();
    const active = row && now.getTime() - row.windowStartedAt.getTime() < windowSeconds * 1000;
    if (active && row.failureCount >= max) throw new Error("RATE_LIMITED");
    await tx.authThrottle.upsert({ where: { keyHash }, create: { keyHash, failureCount: 1 },
      update: { failureCount: active ? row.failureCount + 1 : 1, windowStartedAt: active ? row.windowStartedAt : now } });
  });
}
export function requestAddress(request: Request) {
  return process.env.IMX_TRUST_PROXY_IP === "1" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "untrusted-network";
}
