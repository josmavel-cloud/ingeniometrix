import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createSession, validateEmail } from "@/server/auth/session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      name?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim() || null;

    if (!email || !validateEmail(email)) {
      return NextResponse.json(
        { error: "Ingresa un correo valido." },
        { status: 400 },
      );
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
      },
      create: {
        email,
        name,
      },
    });

    await createSession({ userId: user.id });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo iniciar la sesion." },
      { status: 500 },
    );
  }
}
