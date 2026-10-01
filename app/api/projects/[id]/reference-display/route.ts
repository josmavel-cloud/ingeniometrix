import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { enqueueReferenceDisplayJobs, referenceDisplayStatus } from "@/server/retrieval/reference-display-jobs";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  try { return NextResponse.json({ jobs: await referenceDisplayStatus(user.id, id) }); }
  catch { return NextResponse.json({ error: "No pudimos consultar las traducciones." }, { status: 404 }); }
}
export async function POST(_request: Request, context: Context) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const project = await prisma.project.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  const jobs = await enqueueReferenceDisplayJobs(user.id, id);
  return NextResponse.json({ jobs }, { status: 202 });
}
