import { NextResponse } from "next/server";
import { directArtifactDownload } from "@/server/hybrid/download-redirect";
import { GeneratedArtifactKind } from "@prisma/client";
import { requireCurrentUser } from "@/server/auth/session";
import {
  findGeneratedArtifactForUserVersion,
  upsertGeneratedArtifact,
} from "@/server/artifacts/generated-artifact-service";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { readCanonicalStep6Pdf } from "@/server/mvp/canonical-pdf-download";

export async function GET(_request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id, versionId } = await context.params;
    const direct = await directArtifactDownload(user.id, id, versionId, "BLUEPRINT_PDF");
    if (direct) return direct;
    const version = await getBlueprintVersionForUser(user.id, id, versionId);
    const stored = await findGeneratedArtifactForUserVersion({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.BLUEPRINT_PDF,
    });
    const buffer = stored?.content ? Buffer.from(stored.content) : await readCanonicalStep6Pdf(version);
    if (!stored) {
      await upsertGeneratedArtifact({
        userId: user.id,
        projectId: id,
        blueprintVersionId: versionId,
        kind: GeneratedArtifactKind.BLUEPRINT_PDF,
        fileName: "final-thesis-plan.pdf",
        mimeType: "application/pdf",
        content: buffer,
        metadataJson: { source: "canonical-mvp-step6", private: true },
      });
    }
    return new NextResponse(buffer as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="final-thesis-plan.pdf"', "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo recuperar el PDF de esta version." }, { status: 400 });
  }
}
