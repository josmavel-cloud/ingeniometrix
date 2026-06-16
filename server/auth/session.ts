import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getLocaleForLanguage, LANGUAGE_COOKIE_NAME, normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "imx_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const RELEASE0_LOCAL_EMAIL = "release0-local@ingeniometrix.local";
const RELEASE0_LOCAL_NAME = "Ingeniometrix Release 0";

type SessionPayload = {
  userId: string;
};

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createSession(payload: SessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, payload.userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUserId() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: userId },
  });
}

function isAuthlessWorkspaceEnabled() {
  return process.env.IMX_AUTHLESS_WORKSPACE === "1";
}

async function getRelease0LocalUser() {
  const cookieStore = await cookies();
  const locale = getLocaleForLanguage(
    normalizeLanguageCode(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value),
  );

  return prisma.user.upsert({
    where: { email: RELEASE0_LOCAL_EMAIL },
    update: {
      name: RELEASE0_LOCAL_NAME,
      locale,
    },
    create: {
      email: RELEASE0_LOCAL_EMAIL,
      name: RELEASE0_LOCAL_NAME,
      locale,
    },
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user && isAuthlessWorkspaceEnabled()) {
    return getRelease0LocalUser();
  }

  if (!user) {
    redirect("/workspace");
  }

  return user;
}
