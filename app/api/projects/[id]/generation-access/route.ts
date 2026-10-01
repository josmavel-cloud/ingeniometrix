import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { activeInternalGenerationCapability } from "@/server/commercial/internal-generation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const project = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  return NextResponse.json({ internalGenerationAuthorized: Boolean(await activeInternalGenerationCapability(user.id)) });
}
