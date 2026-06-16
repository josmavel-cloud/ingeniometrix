import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
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

    return NextResponse.json({
      bundle: {
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
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el preview del reporte.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
