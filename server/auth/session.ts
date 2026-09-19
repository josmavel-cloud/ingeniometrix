import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getLocaleForLanguage, LANGUAGE_COOKIE_NAME, normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "imx_session";
const SESSION_MAX_AGE_SECONDS = Math.max(
  900,
  Number(process.env.IMX_SESSION_MAX_AGE_SECONDS ?? 60 * 60 * 12),
);
const RELEASE0_LOCAL_EMAIL = "release0-local@ingeniometrix.local";
const RELEASE0_LOCAL_NAME = "Ingeniometrix Release 0";

type SessionPayload = {
  userId: string;
  userAgent?: string | null;
};

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createSession(payload: SessionPayload) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.$transaction([
    prisma.userSession.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] },
    }),
    prisma.userSession.create({
      data: {
        userId: payload.userId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgentHash: payload.userAgent ? hashToken(payload.userAgent).slice(0, 32) : null,
      },
    }),
  ]);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.userSession.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

async function resolveCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const now = new Date();
  const session = await prisma.userSession.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: now } },
    include: { user: true },
  });

  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return session;
}

export async function getCurrentUserId() {
  return (await resolveCurrentSession())?.userId ?? null;
}

export async function getCurrentUser() {
  try {
    return (await resolveCurrentSession())?.user ?? null;
  } catch (error) {
    console.error("Unable to resolve Ingeniometrix session user.", error);
    return null;
  }
}

function isAuthlessWorkspaceEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.IMX_AUTHLESS_WORKSPACE === "1";
}

async function getRelease0LocalUser() {
  const cookieStore = await cookies();
  const locale = getLocaleForLanguage(normalizeLanguageCode(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value));
  return prisma.user.upsert({
    where: { email: RELEASE0_LOCAL_EMAIL },
    update: { name: RELEASE0_LOCAL_NAME, locale },
    create: { email: RELEASE0_LOCAL_EMAIL, name: RELEASE0_LOCAL_NAME, locale },
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user && isAuthlessWorkspaceEnabled()) return getRelease0LocalUser();
  if (!user) redirect("/workspace");
  return user;
}
