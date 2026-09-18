import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  applyMvpStep4FinalSourceSelection,
  requestMvpStep4AdditionalSources,
} from "@/server/mvp/source-selection-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      selectedReferenceIds?: unknown;
    };

    if (body.action === "apply_selection") {
      const selectedReferenceIds = Array.isArray(body.selectedReferenceIds)
        ? body.selectedReferenceIds.filter((item): item is string => typeof item === "string")
        : [];
      const result = await applyMvpStep4FinalSourceSelection({
        userId: user.id,
        projectId: id,
        selectedReferenceIds,
      });

      return NextResponse.json(
        {
          step: result.step_key,
          status: result.status,
          project_id: result.project_id,
          step_run_id: result.step_run_id,
          artifact_manifest_path: result.artifact_manifest_path,
          selected_reference_ids: result.selected_reference_ids,
          discarded_candidate_ids: result.discarded_candidate_ids,
          frontend_cable: result.frontend_cable,
          step5_contract: {
            selected_reference_ids: result.selected_reference_ids,
            next_action: "run_step_5_source_health",
          },
          warnings: result.warnings,
          errors: result.errors,
        },
        { status: 200 },
      );
    }

    const result = await requestMvpStep4AdditionalSources({
      userId: user.id,
      projectId: id,
    });

    return NextResponse.json(
      {
        step: result.step_key,
        status: result.status,
        project_id: result.project_id,
        step_run_id: result.step_run_id,
        artifact_manifest_path: result.artifact_manifest_path,
        batches: result.batches,
        search_layers: result.search_layers,
        frontend_cable: result.frontend_cable,
        next_action_es: result.next_action_es,
        warnings: result.warnings,
        errors: result.errors,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "No se pudo ejecutar el Step 4 de fuentes adicionales.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
