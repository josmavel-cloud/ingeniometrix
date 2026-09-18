import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const result = await runMvpStep6BlueprintDocx({
      userId: user.id,
      projectId: id,
    });

    return NextResponse.json(
      {
        step: result.step_key,
        status: result.status,
        step_run_id: result.step_run_id,
        project_id: result.project_id,
        blueprint_version_id: result.blueprint_version_id,
        docx_path: result.docx_path,
        artifact_manifest_path: result.artifact_manifest_path,
        artifacts: result.artifacts,
        metrics: result.metrics,
        api_usage: result.api_usage,
        step7_contract: {
          docx_path: result.docx_path,
          blueprint_version_id: result.blueprint_version_id,
          manifest: result.artifacts.manifest,
          api_usage_report: result.artifacts.api_usage_report,
        },
        warnings: result.warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "No se pudo ejecutar el Step 6 Blueprint DOCX.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
