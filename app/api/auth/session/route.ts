import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "@/server/auth/login-throttle";
import { verifyPassword } from "@/server/auth/password";
import { createSession, validateEmail } from "@/server/auth/session";
import { rateLimit, requestAddress, secretHash, securityAudit } from "@/server/auth/security-events";
import { limitedJson } from "@/server/commercial/mercado-pago";

export async function POST(request: Request) {
  let stage = "READ_BODY";

  try {
    stage = "READ_BODY";
    await rateLimit("password-login", requestAddress(request), 30);
    const body = (await limitedJson(request, 4096)) as {
      email?: string;
      password?: string;
    };

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { error: "Ingresa un correo valido." },
        { status: 400 },
      );
    }

    const throttle = await assertLoginAllowed(request, email);
    if (!throttle.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta nuevamente mas tarde." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
      );
    }

    stage = "USER_LOOKUP";
    const user = await prisma.user.findUnique({
      where: { email },
    });

    stage = "VERIFY_PASSWORD";
    const passwordValid = await verifyPassword(password, user?.passwordHash);
    if (!user || !passwordValid) {
      await securityAudit("LOGIN_FAILURE", null, { method: "password", subjectHash: secretHash(email) });
      const blockedUntil = await recordLoginFailure(throttle.keyHash);
      return NextResponse.json(
        { error: "Credenciales invalidas." },
        {
          status: blockedUntil ? 429 : 401,
          headers: blockedUntil ? { "Retry-After": String(15 * 60) } : undefined,
        },
      );
    }

    stage = "CREATE_SESSION";
    await clearLoginFailures(throttle.keyHash);
    await createSession({ userId: user.id, userAgent: request.headers.get("user-agent") });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") return NextResponse.json({ error: "Demasiados intentos. Intenta nuevamente más tarde." }, { status: 429 });
    console.error(`Unable to start Ingeniometrix session at ${stage}.`, error);

    return NextResponse.json(
      { error: "No se pudo iniciar la sesion." },
      { status: 500 },
    );
  }
}
