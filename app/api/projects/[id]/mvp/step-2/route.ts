import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  applyMvpStep2IntakeChoice,
  runMvpEvidenceInformedTopicRefinement,
} from "@/server/mvp/topic-refinement-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      optionId?: unknown;
      stepRunId?: unknown;
      model?: unknown;
    };

    if (body.action === "apply_selection") {
      if (typeof body.optionId !== "string" || !body.optionId.trim()) {
        throw new Error("optionId es obligatorio para aplicar la seleccion de Step 2.");
      }

      const result = await applyMvpStep2IntakeChoice({
        userId: user.id,
        projectId: id,
        optionId: body.optionId,
        stepRunId: typeof body.stepRunId === "string" ? body.stepRunId : undefined,
      });

      return NextResponse.json(
        {
          step: "step_2_evidence_informed_refinement",
          status: "completed",
          project_id: result.project_id,
          step_run_id: result.step_run_id,
          selected_option_id: result.selected_option_id,
          selected_strategy: result.selected_strategy,
          first_batch_candidate_ids: result.first_batch_candidate_ids,
          discarded_candidate_ids: result.discarded_candidate_ids,
          step3_contract: {
            first_batch_candidate_ids: result.first_batch_candidate_ids,
            next_action: "prepare_step_3_sources",
          },
          next_action_es: result.next_action_es,
        },
        { status: 200 },
      );
    }

    const result = await runMvpEvidenceInformedTopicRefinement({
      userId: user.id,
      projectId: id,
      model: typeof body.model === "string" ? body.model : undefined,
    });

    return NextResponse.json(
      {
        step: result.step_key,
        status: result.status,
        project_id: result.project_id,
        step_run_id: result.step_run_id,
        artifact_manifest_path: result.artifact_manifest_path,
        source: result.source,
        model: result.model,
        evidence_summary: {
          candidate_count: result.evidence_map.source_feasibility.candidate_count,
          abstract_count: result.evidence_map.source_feasibility.abstract_count,
          probable_pdf_count: result.evidence_map.source_feasibility.probable_pdf_count,
          score_100: result.evidence_map.source_feasibility.score_100,
          readiness: result.evidence_map.source_feasibility.readiness,
        },
        frontend_cable: result.frontend_cable,
        recommended_option_id: result.recommended_option_id,
        alternatives: result.alternatives,
        api_usage: result.api_usage,
        warnings: result.warnings,
        errors: result.errors,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "No se pudo ejecutar el Step 2 de refinamiento.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
