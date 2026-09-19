import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function throttleKey(request: Request, email: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(`${address}\n${email.toLowerCase()}`).digest("hex");
}

export async function assertLoginAllowed(request: Request, email: string) {
  const now = new Date();
  const keyHash = throttleKey(request, email);
  const row = await prisma.authThrottle.findUnique({ where: { keyHash } });
  if (row?.blockedUntil && row.blockedUntil > now) {
    return {
      allowed: false as const,
      keyHash,
      retryAfterSeconds: Math.max(1, Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000)),
    };
  }
  return { allowed: true as const, keyHash, retryAfterSeconds: 0 };
}

export async function recordLoginFailure(keyHash: string) {
  const now = new Date();
  const existing = await prisma.authThrottle.findUnique({ where: { keyHash } });
  const inWindow = Boolean(existing && now.getTime() - existing.windowStartedAt.getTime() < WINDOW_MS);
  const failureCount = inWindow && existing ? existing.failureCount + 1 : 1;
  const blockedUntil = failureCount >= MAX_FAILURES ? new Date(now.getTime() + BLOCK_MS) : null;

  await prisma.authThrottle.upsert({
    where: { keyHash },
    create: { keyHash, failureCount, windowStartedAt: now, blockedUntil },
    update: {
      failureCount,
      windowStartedAt: inWindow && existing ? existing.windowStartedAt : now,
      blockedUntil,
    },
  });
  return blockedUntil;
}

export async function clearLoginFailures(keyHash: string) {
  await prisma.authThrottle.deleteMany({ where: { keyHash } });
}
