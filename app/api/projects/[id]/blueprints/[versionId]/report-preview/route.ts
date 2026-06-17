import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";
import { GeneratedArtifactKind } from "@prisma/client";

import { requireCurrentUser } from "@/server/auth/session";
import { upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { generateBlueprintReportBundle } from "@/server/reporting/reporting-engine";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id, versionId } = await context.params;
    await getBlueprintVersionForUser(user.id, id, versionId);

    const payload = (await request.json().catch(() => ({}))) as {
      templateVersionId?: string;
      templateKey?: string;
    };

    const bundle = await generateBlueprintReportBundle({
      projectId: id,
      blueprintVersionId: versionId,
      templateVersionId: payload.templateVersionId,
      templateKey: payload.templateKey,
    });
    const docxBuffer = await readFile(bundle.paths.docx);
    const docxFilename = `${bundle.templateKey}-${versionId}-ingeniometrix-report-preview.docx`
      .replace(/[^a-zA-Z0-9_.-]+/g, "-")
      .toLowerCase();
    const manifest = {
      projectId: bundle.projectId,
      blueprintVersionId: bundle.blueprintVersionId,
      templateKey: bundle.templateKey,
      templateVersionId: bundle.templateVersionId,
      outputDir: bundle.outputDir,
      validation: bundle.validation,
      paths: bundle.paths,
      sectionCount: bundle.canonicalDocument.body.sections.length,
      annexCount: bundle.canonicalDocument.annexes.length,
      referenceCount: bundle.canonicalDocument.references.length,
    };

    await upsertGeneratedArtifact({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.BLUEPRINT_DOCX,
      fileName: docxFilename,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: docxBuffer,
      metadataJson: {
        exportRoute: "blueprint-report-preview",
        templateKey: bundle.templateKey,
        templateVersionId: bundle.templateVersionId,
      },
    });
    await upsertGeneratedArtifact({
      userId: user.id,
      projectId: id,
      blueprintVersionId: versionId,
      kind: GeneratedArtifactKind.REPORT_PREVIEW,
      fileName: `${bundle.templateKey}-${versionId}-report-preview-manifest.json`
        .replace(/[^a-zA-Z0-9_.-]+/g, "-")
        .toLowerCase(),
      mimeType: "application/json; charset=utf-8",
      content: JSON.stringify(manifest, null, 2),
      metadataJson: {
        exportRoute: "blueprint-report-preview",
      },
    });

    return NextResponse.json({
      bundle: manifest,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el preview del reporte.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
