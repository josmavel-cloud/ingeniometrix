import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/server/auth/password";
import { createSession, validateEmail } from "@/server/auth/session";

export async function POST(request: Request) {
  try {
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

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Credenciales invalidas." },
        { status: 401 },
      );
    }

    await createSession({ userId: user.id });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Unable to start Ingeniometrix session.", error);

    return NextResponse.json(
      { error: "No se pudo iniciar la sesion." },
      { status: 500 },
    );
  }
}
