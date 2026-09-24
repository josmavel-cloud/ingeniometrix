import { NextResponse } from "next/server";

import { userPdfUploadCapability } from "@/lib/user-pdf-contract";
import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/server/auth/session";

type Context = { params: Promise<{ id: string }> };

async function requireOwnedProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) throw new Error("Proyecto no encontrado.");
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    const projectId = (await context.params).id;
    await requireOwnedProject(user.id, projectId);
    if (process.env.IMX_HYBRID_TRANSFERS === "1") {
      const [documents, draft] = await Promise.all([
        prisma.uploadedPdf.findMany({ where: { projectId, userId: user.id }, select: { id: true, fileName: true, status: true, byteSize: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
        prisma.projectDraft.findUnique({ where: { projectId }, select: { revision: true } }),
      ]);
      return NextResponse.json({ capability: { ...userPdfUploadCapability, enabled: true, maxBytesPerFile: 30 * 1024 * 1024, persistenceStatus: "QUARANTINE_ONLY" }, documents, draftRevision: draft?.revision }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ capability: userPdfUploadCapability, documents: [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar la carga de documentos." }, { status: 404 });
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    await requireOwnedProject(user.id, (await context.params).id);
    return NextResponse.json({ error: "La carga de PDF aun no esta habilitada en este gate.", code: "PDF_UPLOAD_NOT_AVAILABLE", capability: userPdfUploadCapability }, { status: 501 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo validar el proyecto." }, { status: 404 });
  }
}
