import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/server/auth/session";
import { securityAudit } from "@/server/auth/security-events";
import { limitedJson } from "@/server/commercial/mercado-pago";
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  const body = z.object({ trainingConsent: z.boolean() }).strict().safeParse(await limitedJson(request).catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  await prisma.$transaction(async (tx) => { await tx.user.update({ where: { id: user.id }, data: body.data }); await securityAudit("TRAINING_CONSENT_CHANGED", user.id, { enabled: body.data.trainingConsent, version: "optional-improvement-v1" }, tx); });
  return NextResponse.json(body.data);
}
