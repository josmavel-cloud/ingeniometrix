import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/server/auth/password";
import { createSession, validateEmail } from "@/server/auth/session";

function toAuthRuntimeErrorPayload(stage: string, error: unknown) {
  return {
    error: "No se pudo iniciar la sesion.",
    diagnostic: {
      stage,
      name: error instanceof Error ? error.name : "UnknownError",
      code:
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : null,
    },
  };
}

export async function POST(request: Request) {
  let stage = "READ_BODY";

  try {
    stage = "READ_BODY";
    const body = (await request.json()) as {
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

    stage = "USER_LOOKUP";
    const user = await prisma.user.findUnique({
      where: { email },
    });

    stage = "VERIFY_PASSWORD";
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Credenciales invalidas." },
        { status: 401 },
      );
    }

    stage = "CREATE_SESSION";
    await createSession({ userId: user.id });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error(`Unable to start Ingeniometrix session at ${stage}.`, error);

    return NextResponse.json(
      toAuthRuntimeErrorPayload(stage, error),
      { status: 500 },
    );
  }
}
