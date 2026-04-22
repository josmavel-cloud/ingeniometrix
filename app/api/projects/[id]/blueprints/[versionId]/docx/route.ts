import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";
import { buildCanonicalReportFromBlueprint } from "@/server/reporting/blueprint-report/build-canonical-report-from-blueprint";
import { renderCanonicalReportDocxBuffer } from "@/server/reporting/docx/render-canonical-report-docx";

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
    const report = await buildCanonicalReportFromBlueprint({
      projectId: id,
      blueprintVersionId: versionId,
    });
    const docxBuffer = await renderCanonicalReportDocxBuffer(report.canonicalDocument);
    const filename = `${slugify(blueprintVersion.id)}-ingeniometrix-blueprint.docx`;

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
