import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { runMvpEvidenceMaterialization } from "@/server/mvp/evidence-materialization-service";
import { currentJobExecution } from "@/server/mvp/job-execution-context";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    if (!currentJobExecution()) return NextResponse.json({ error: "Inicia la generación desde el proyecto para conservar su presupuesto y progreso.", code: "PERSISTENT_JOB_REQUIRED" }, { status: 409 });
    const { id } = await context.params;
    const result = await runMvpEvidenceMaterialization({
      userId: user.id,
      projectId: id,
    });

    return NextResponse.json(
      {
        step: "step_5_evidence_materialization",
        status: result.status,
        step_run_id: result.step_run_id,
        project_id: result.project_id,
        artifact_manifest_path: result.artifact_manifest_path,
        artifacts: result.artifacts,
        metrics: {
          selected_source_count: result.selected_source_count,
          materialized_pdf_count: result.materialized_pdf_count,
          fulltext_chunk_count: result.fulltext_chunk_count,
          pdf_layout_candidate_count: result.pdf_layout_candidate_count,
          source_asset_count: result.source_asset_count,
          curated_asset_count: result.curated_asset_count,
          visual_localized_asset_count: result.visual_localized_asset_count,
          semantic_extraction_count: result.semantic_extraction_count,
          evidence_card_count: result.evidence_card_count,
          extraction_gap_count: result.extraction_gap_count,
        },
        api_usage: result.api_usage,
        step6_contract: {
          references: result.artifacts.references,
          evidence_ledger: result.artifacts.evidence_ledger,
          blueprint_v2_evidence_ledger: result.artifacts.blueprint_v2_evidence_ledger,
          source_assets: result.artifacts.source_assets,
          visual_localized_assets: result.artifacts.visual_localized_assets,
          extraction_gaps: result.artifacts.extraction_gaps,
        },
        warnings: result.warnings,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "No se pudo ejecutar el Step 5 de evidencia y assets.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
