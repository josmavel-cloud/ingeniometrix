import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { readCanonicalStep6Pdf } from "@/server/mvp/canonical-pdf-download";

export async function GET(_request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id, versionId } = await context.params;
    const version = await getBlueprintVersionForUser(user.id, id, versionId);
    const buffer = await readCanonicalStep6Pdf(version);
    return new NextResponse(buffer as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="final-thesis-plan.pdf"', "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo recuperar el PDF de esta version." }, { status: 400 });
  }
}
