import { NextResponse } from "next/server";
import { ExportStatus, GeneratedArtifactKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireCurrentUser } from "@/server/auth/session";
import { getRequestLanguage } from "@/server/i18n/request-language";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { renderBlueprintV2AcademicDocxBuffer } from "@/server/blueprint-v2/export/academic-docx-export";
import { buildCanonicalReportFromBlueprint } from "@/server/reporting/blueprint-report/build-canonical-report-from-blueprint";
import { renderCanonicalReportDocxBuffer } from "@/server/reporting/docx/render-canonical-report-docx";
import { upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";

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
    const language = await getRequestLanguage();
    const { id, versionId } = await context.params;
    const blueprintVersion = await getBlueprintVersionForUser(user.id, id, versionId);
    const academicDocx = await renderBlueprintV2AcademicDocxBuffer({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      languageOverride: language,
      variant: "university",
    });

    if (academicDocx) {
      await upsertGeneratedArtifact({
        userId: user.id,
        projectId: id,
        blueprintVersionId: versionId,
        kind: GeneratedArtifactKind.BLUEPRINT_DOCX,
        fileName: academicDocx.filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: academicDocx.buffer,
        metadataJson: {
          exportRoute: "blueprint-academic-docx",
          language,
          variant: "university",
          renderer: "blueprint-v2-academic-docx",
        },
      });
      await prisma.blueprintVersion.update({
        where: { id: versionId },
        data: { exportStatus: ExportStatus.READY },
      });

      return new NextResponse(academicDocx.buffer as BodyInit, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename=\"${academicDocx.filename}\"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const report = await buildCanonicalReportFromBlueprint({
      projectId: id,
      blueprintVersionId: versionId,
      languageOverride: language,
    });
    const docxBuffer = await renderCanonicalReportDocxBuffer(report.canonicalDocument);
    const filename = `${slugify(blueprintVersion.id)}-ingeniometrix-blueprint.docx`;
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
        exportRoute: "blueprint-canonical-docx",
        language,
        renderer: "canonical-report-docx",
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
