import { NextResponse } from "next/server";
import { GeneratedArtifactKind } from "@prisma/client";

import { requireCurrentUser } from "@/server/auth/session";
import { upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";
import { extractExportReferences, renderRis } from "@/server/blueprint/blueprint-export";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id, versionId } = await context.params;
    const blueprintVersion = await getBlueprintVersionForUser(user.id, id, versionId);
    const references = extractExportReferences(blueprintVersion);
    const body = renderRis(references);
    const filename = `${slugify(blueprintVersion.id)}-ingeniometrix-referencias.ris`;
    await upsertGeneratedArtifact({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.RIS,
      fileName: filename,
      mimeType: "application/x-research-info-systems; charset=utf-8",
      content: body,
      metadataJson: {
        exportRoute: "blueprint-ris",
        referenceCount: references.length,
      },
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-research-info-systems; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el archivo RIS.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
