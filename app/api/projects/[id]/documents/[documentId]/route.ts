import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { prepareUploadedPdf, removeUploadedPdf } from "@/server/projects/uploaded-pdf-source-service";

type Context = { params: Promise<{ id: string; documentId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    const { id, documentId } = await context.params;
    const result = await prepareUploadedPdf(user.id, id, documentId);
    return NextResponse.json({ id: result.id, status: result.status, identityStatus: result.identityStatus,
      extractionStatus: result.extractionStatus, referenceId: result.referenceId },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DOCUMENT_PREPARATION_FAILED";
    return NextResponse.json({ error: message }, { status: message === "DOCUMENT_NOT_FOUND" ? 404 : 409 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    const { id, documentId } = await context.params;
    return NextResponse.json(await removeUploadedPdf(user.id, id, documentId),
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DOCUMENT_REMOVAL_FAILED";
    return NextResponse.json({ error: message }, { status: message === "DOCUMENT_NOT_FOUND" ? 404 : 409 });
  }
}
