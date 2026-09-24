import { NextResponse } from "next/server";
import { directArtifactDownload } from "@/server/hybrid/download-redirect";
import { ExportStatus, GeneratedArtifactKind } from "@prisma/client";
import { readCanonicalStep6Docx } from "@/server/mvp/canonical-docx-download";

import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/server/auth/session";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { buildCanonicalReportFromBlueprint } from "@/server/reporting/blueprint-report/build-canonical-report-from-blueprint";
import { renderCanonicalReportDocxBuffer } from "@/server/reporting/docx/render-canonical-report-docx";
import {
  findGeneratedArtifactForUserVersion,
  upsertGeneratedArtifact,
} from "@/server/artifacts/generated-artifact-service";
import { getProjectContentLanguageForUser } from "@/server/projects/project-language-service";

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
    const direct = await directArtifactDownload(user.id, id, versionId, "BLUEPRINT_DOCX");
    if (direct) return direct;
    const language = await getProjectContentLanguageForUser(user.id, id);
    const blueprintVersion = await getBlueprintVersionForUser(user.id, id, versionId);
    const stored = await findGeneratedArtifactForUserVersion({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.BLUEPRINT_DOCX,
    });
    const canonicalDocx = stored?.content
      ? Buffer.from(stored.content)
      : await readCanonicalStep6Docx(blueprintVersion);
    const docxBuffer = canonicalDocx ?? await renderCanonicalReportDocxBuffer((await buildCanonicalReportFromBlueprint({
      projectId: id, blueprintVersionId: versionId, languageOverride: language,
    })).canonicalDocument);
    const filename = stored?.fileName ?? (canonicalDocx ? "final-thesis-plan.docx" : `${slugify(blueprintVersion.id)}-ingeniometrix-blueprint.docx`);
    await upsertGeneratedArtifact({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.BLUEPRINT_DOCX,
      fileName: filename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: docxBuffer,
      metadataJson: {
        exportRoute: canonicalDocx ? "canonical-step6-docx" : "blueprint-canonical-docx",
        language,
        renderer: canonicalDocx ? "mvp-step6" : "canonical-report-docx",
      },
    });
    await prisma.blueprintVersion.update({
      where: { id: versionId },
      data: { exportStatus: ExportStatus.READY },
    });

    return new NextResponse(docxBuffer as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el DOCX del blueprint.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
