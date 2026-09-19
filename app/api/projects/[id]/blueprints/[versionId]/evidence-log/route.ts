import { NextResponse } from "next/server";
import { GeneratedArtifactKind } from "@prisma/client";

import { requireCurrentUser } from "@/server/auth/session";
import { upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";
import { buildEvidenceLog } from "@/server/blueprint/blueprint-export";
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
    const evidenceLog = buildEvidenceLog(blueprintVersion);
    const filename = `${slugify(blueprintVersion.id)}-ingeniometrix-evidence-log.json`;
    const body = JSON.stringify(evidenceLog, null, 2);
    await upsertGeneratedArtifact({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.EVIDENCE_LOG,
      fileName: filename,
      mimeType: "application/json; charset=utf-8",
      content: body,
      metadataJson: {
        exportRoute: "blueprint-evidence-log",
      },
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el evidence_log.json.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
