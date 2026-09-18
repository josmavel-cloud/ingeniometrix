import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { runMvpEvidenceMaterialization } from "@/server/mvp/evidence-materialization-service";
import { MVP_STEP5_KEY } from "@/server/mvp/evidence-materialization-types";
import { asStepRunJson, findLatestMvpStepRun } from "@/server/mvp/step-run-service";

const DEFAULT_USER_EMAIL = "mvp-step3-source-selection-diagnostics@ingeniometrix.local";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findProjectWithSelectedSources(input: { userId: string; projectId?: string }) {
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        userId: input.userId,
      },
      include: {
        intake: true,
        projectReferences: {
          where: { selected: true },
          include: { reference: true },
          orderBy: { selectedOrder: "asc" },
        },
      },
    });
    if (!project) {
      throw new Error(`Project ${input.projectId} was not found for this user.`);
    }
    return project;
  }

  const recentProjects = await prisma.project.findMany({
    where: { userId: input.userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        include: { reference: true },
        orderBy: { selectedOrder: "asc" },
      },
    },
  });

  const project = recentProjects.find((candidate) => candidate.projectReferences.length > 0);
  if (!project) {
    throw new Error("No project with selected sources was found. Run Step 3 selection before Step 5 diagnostics.");
  }
  return project;
}

async function runDiagnostic() {
  const runId = `step5-evidence-materialization-diagnostics-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-step5-evidence-materialization-diagnostics", runId);
  await mkdir(artifactDir, { recursive: true });

  const email = readArg("email") ?? DEFAULT_USER_EMAIL;
  const projectId = readArg("project");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`User ${email} was not found.`);
  }

  const project = await findProjectWithSelectedSources({ userId: user.id, projectId });
  await logAuditEvent({
    eventType: "MVP_STEP5_DIAGNOSTIC_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({ run_id: runId, artifact_dir: artifactDir }),
  });

  const result = await runMvpEvidenceMaterialization({
    userId: user.id,
    projectId: project.id,
    runId,
  });
  const latestRun = await findLatestMvpStepRun({
    projectId: project.id,
    stepKey: MVP_STEP5_KEY,
  });
  const planRow = await prisma.projectTemplateContentPlan.findUnique({
    where: { id: result.template_content_plan_id },
  });
  const ledgerRow = await prisma.projectEvidenceLedger.findUnique({
    where: { id: result.evidence_ledger_id },
  });
  const evidenceCardRows = await prisma.projectEvidenceCard.findMany({
    where: {
      projectId: project.id,
      stepRunId: result.step_run_id,
    },
    orderBy: { sourceId: "asc" },
  });
  const sourceMaterializationRows = await prisma.projectSourceMaterialization.findMany({
    where: {
      projectId: project.id,
      stepRunId: result.step_run_id,
    },
    orderBy: { sourceId: "asc" },
  });
  const sourceAssetRows = await prisma.projectSourceAsset.findMany({
    where: {
      projectId: project.id,
      stepRunId: result.step_run_id,
    },
    orderBy: [{ sourceId: "asc" }, { pageNumber: "asc" }],
  });
  const curatedSourceAssetRows = sourceAssetRows.filter((asset) => asset.curationStatus === "CURATED_FOR_BLUEPRINT");

  const checks = [
    {
      key: "selected_sources_materialized",
      passed: result.source_registry.length === project.projectReferences.length,
      detail: `${result.source_registry.length}/${project.projectReferences.length}`,
    },
    {
      key: "references_match_registry",
      passed: result.references.length === result.source_registry.length,
      detail: `${result.references.length}/${result.source_registry.length}`,
    },
    {
      key: "section_plan_ready",
      passed: result.section_content_plan.some((section) => section.section_key === "methodology") &&
        result.section_content_plan.some((section) => section.section_key === "references"),
      detail: result.section_content_plan.map((section) => section.section_key).join(", "),
    },
    {
      key: "llm_wave_statuses_valid",
      passed: result.llm_wave_plan.length === 3 &&
        result.llm_wave_plan.some(
          (wave) =>
            wave.wave_key === "source_evidence_extraction" &&
            (wave.status === "executed" || wave.status === "partially_executed"),
        ) &&
        result.llm_wave_plan.some(
          (wave) =>
            wave.wave_key === "asset_visual_localization" &&
            (wave.status === "executed" || wave.status === "partially_executed"),
        ) &&
        result.llm_wave_plan.some((wave) => wave.wave_key === "equation_latex_ocr"),
      detail: result.llm_wave_plan.map((wave) => `${wave.wave_key}:${wave.status}`).join(", "),
    },
    {
      key: "evidence_cards_created",
      passed: result.evidence_cards.length === result.source_registry.length && evidenceCardRows.length === result.evidence_cards.length,
      detail: `${result.evidence_cards.length} cards, ${evidenceCardRows.length} db rows`,
    },
    {
      key: "pdf_fulltext_materialized",
      passed: result.materialized_pdf_count >= 1 && sourceMaterializationRows.length === result.source_registry.length,
      detail: `${result.materialized_pdf_count} PDFs materialized, ${result.fulltext_chunk_count} chunks, ${sourceMaterializationRows.length} db rows`,
    },
    {
      key: "pdf_layout_inventory_created",
      passed: result.pdf_layout_inventories.some((item) => item.status === "completed" && item.candidates.length > 0),
      detail: `${result.pdf_layout_candidate_count} layout candidates across ${result.pdf_layout_inventories.length} inventories`,
    },
    {
      key: "source_assets_detected",
      passed: result.source_asset_count >= 1 && sourceAssetRows.length === result.source_asset_count,
      detail: `${result.source_asset_count} assets, ${result.rendered_asset_page_count} rendered pages, ${sourceAssetRows.length} db rows`,
    },
    {
      key: "source_assets_curated",
      passed: result.curated_asset_count >= 1 && curatedSourceAssetRows.length === result.curated_asset_count,
      detail: `${result.curated_asset_count} curated assets, ${curatedSourceAssetRows.length} db rows`,
    },
    {
      key: "semantic_extractions_completed",
      passed: result.semantic_extraction_count >= 1 &&
        result.semantic_extractions.some((item) => item.evidence_items.length > 0 || item.technique_method_theory.length > 0),
      detail: `${result.semantic_extraction_count} completed semantic extractions, ${result.semantic_extractions.length} sources`,
    },
    {
      key: "visual_assets_localized",
      passed: result.visual_localized_asset_count >= 1 &&
        result.visual_localized_assets.some((item) => item.localization_status === "localized" && Boolean(item.cropped_image_path)),
      detail: `${result.visual_localized_asset_count} localized assets, ${result.visual_localized_assets.length} visual attempts`,
    },
    {
      key: "equation_latex_available",
      passed: result.visual_localized_assets.some((item) =>
        item.asset_kind === "equation" &&
        (item.equation_latex_status === "transcribed" || item.equation_latex_status === "partial") &&
        Boolean(item.equation_latex),
      ),
      detail: `${result.visual_localized_assets.filter((item) => item.asset_kind === "equation").length} equation visual attempts`,
    },
    {
      key: "db_template_content_plan_created",
      passed: Boolean(planRow),
      detail: result.template_content_plan_id,
    },
    {
      key: "db_evidence_ledger_created",
      passed: Boolean(ledgerRow),
      detail: result.evidence_ledger_id,
    },
    {
      key: "artifact_manifest_exists",
      passed: await fileExists(result.artifact_manifest_path),
      detail: result.artifact_manifest_path,
    },
    {
      key: "registry_artifact_exists",
      passed: await fileExists(result.artifacts.source_registry),
      detail: result.artifacts.source_registry,
    },
    {
      key: "references_artifact_exists",
      passed: await fileExists(result.artifacts.references),
      detail: result.artifacts.references,
    },
    {
      key: "pdf_materializations_artifact_exists",
      passed: await fileExists(result.artifacts.pdf_materializations),
      detail: result.artifacts.pdf_materializations,
    },
    {
      key: "pdf_layout_inventories_artifact_exists",
      passed: await fileExists(result.artifacts.pdf_layout_inventories),
      detail: result.artifacts.pdf_layout_inventories,
    },
    {
      key: "source_assets_artifact_exists",
      passed: await fileExists(result.artifacts.source_assets),
      detail: result.artifacts.source_assets,
    },
    {
      key: "curated_assets_artifact_exists",
      passed: await fileExists(result.artifacts.curated_assets),
      detail: result.artifacts.curated_assets,
    },
    {
      key: "visual_localized_assets_artifact_exists",
      passed: await fileExists(result.artifacts.visual_localized_assets),
      detail: result.artifacts.visual_localized_assets,
    },
    {
      key: "blueprint_v2_evidence_ledger_artifact_exists",
      passed: await fileExists(result.artifacts.blueprint_v2_evidence_ledger),
      detail: result.artifacts.blueprint_v2_evidence_ledger,
    },
    {
      key: "semantic_extractions_artifact_exists",
      passed: await fileExists(result.artifacts.semantic_extractions),
      detail: result.artifacts.semantic_extractions,
    },
    {
      key: "budget_policy_artifact_exists",
      passed: await fileExists(result.artifacts.budget_policy),
      detail: result.artifacts.budget_policy,
    },
    {
      key: "api_usage_report_artifact_exists",
      passed: await fileExists(result.artifacts.api_usage_report),
      detail: result.artifacts.api_usage_report,
    },
    {
      key: "evidence_cards_artifact_exists",
      passed: await fileExists(result.artifacts.evidence_cards),
      detail: result.artifacts.evidence_cards,
    },
    {
      key: "step_run_completed",
      passed: latestRun?.status === "COMPLETED" || latestRun?.status === "PARTIALLY_COMPLETED",
      detail: latestRun?.status ?? "missing",
    },
  ];

  const report = {
    ok: checks.every((item) => item.passed),
    run_id: runId,
    artifact_dir: artifactDir,
    project_id: project.id,
    current_intake: project.intake
      ? {
          topic: project.intake.topic,
          problem_context: project.intake.problemContext,
          research_line: project.intake.researchLine,
          target_population: project.intake.targetPopulation,
          preferred_methodology: project.intake.preferredMethodology,
          search_query: project.intake.searchQuery,
        }
      : null,
    selected_source_count: result.selected_source_count,
    citation_style: result.citation_style,
    checks,
    result_summary: {
      status: result.status,
      template_key: result.template_key,
      template_version_id: result.template_version_id,
      template_content_plan_id: result.template_content_plan_id,
      evidence_ledger_id: result.evidence_ledger_id,
      started_at: result.started_at,
      completed_at: result.completed_at,
      duration_ms: result.duration_ms,
      api_usage: result.api_usage,
      budget_policy: result.budget_policy,
      planned_section_count: result.planned_section_count,
      planned_llm_wave_count: result.planned_llm_wave_count,
      materialized_pdf_count: result.materialized_pdf_count,
      pdf_layout_candidate_count: result.pdf_layout_candidate_count,
      fulltext_chunk_count: result.fulltext_chunk_count,
      source_asset_count: result.source_asset_count,
      rendered_asset_page_count: result.rendered_asset_page_count,
      curated_asset_count: result.curated_asset_count,
      visual_localized_asset_count: result.visual_localized_asset_count,
      semantic_extraction_count: result.semantic_extraction_count,
      evidence_card_count: result.evidence_card_count,
      extraction_gap_count: result.extraction_gap_count,
      artifact_manifest_path: result.artifact_manifest_path,
      artifacts: result.artifacts,
      first_references: result.references.slice(0, 5).map((reference) => ({
        citation_key: reference.citation_key,
        inline_citation_hint: reference.inline_citation_hint,
        formatted_reference: reference.formatted_reference,
      })),
      pdf_materializations: result.pdf_materializations.map((item) => ({
        source_id: item.source_id,
        status: item.status,
        page_count: item.page_count,
        char_count: item.char_count,
        chunk_count: item.chunk_count,
        source_pdf_path: item.source_pdf_path,
        fulltext_path: item.fulltext_path,
        pages_path: item.pages_path,
        chunks_path: item.chunks_path,
        asset_signal_counts: item.asset_signal_counts,
        warnings: item.warnings,
        errors: item.errors,
      })),
      pdf_layout_inventories: result.pdf_layout_inventories.map((item) => ({
        source_id: item.source_id,
        status: item.status,
        extractor_version: item.extractor_version,
        page_count: item.page_count,
        candidate_count: item.candidates.length,
        first_candidates: item.candidates.slice(0, 8).map((candidate) => ({
          candidate_id: candidate.candidate_id,
          page_number: candidate.page_number,
          asset_kind: candidate.asset_kind,
          detection_method: candidate.detection_method,
          score_100: candidate.score_100,
          bbox_pdf_points: candidate.bbox_pdf_points,
          caption_text: candidate.caption_text,
          crop_path: candidate.crop_path,
          page_image_path: candidate.page_image_path,
        })),
        warnings: item.warnings,
        errors: item.errors,
      })),
      source_assets: result.source_assets.slice(0, 20).map((asset) => ({
        asset_id: asset.asset_id,
        source_id: asset.source_id,
        asset_kind: asset.asset_kind,
        detection_method: asset.detection_method,
        render_strategy: asset.render_strategy,
        status: asset.status,
        page_number: asset.page_number,
        caption_or_signal_text: asset.caption_or_signal_text,
        image_path: asset.image_path,
        structured_path: asset.structured_path,
        coordinates: asset.coordinates,
        fallback_insert_as_image: asset.fallback_insert_as_image,
      })),
      curated_assets: result.curated_assets.map((asset) => ({
        asset_id: asset.asset_id,
        source_id: asset.source_id,
        reference_id: asset.reference_id,
        citation_key: asset.citation_key,
        section_key: asset.section_key,
        asset_kind: asset.asset_kind,
        curation_score_100: asset.curation_score_100,
        curation_reason: asset.curation_reason,
        page_number: asset.page_number,
        citation_anchor: asset.citation_anchor,
        coordinates: asset.coordinates,
        caption_or_signal_text: asset.caption_or_signal_text,
        image_path: asset.image_path,
      })),
      visual_localized_assets: result.visual_localized_assets.map((asset) => ({
        asset_id: asset.asset_id,
        source_id: asset.source_id,
        reference_id: asset.reference_id,
        citation_key: asset.citation_key,
        section_key: asset.section_key,
        asset_kind: asset.asset_kind,
        page_number: asset.page_number,
        localization_status: asset.localization_status,
        confidence_100: asset.confidence_100,
        bbox_normalized: asset.bbox_normalized,
        bbox_pixels: asset.bbox_pixels,
        cropped_image_path: asset.cropped_image_path,
        equation_latex: asset.equation_latex,
        equation_latex_status: asset.equation_latex_status,
        equation_latex_confidence_100: asset.equation_latex_confidence_100,
        fallback_page_image_path: asset.fallback_page_image_path,
        citation_anchor: asset.citation_anchor,
        warnings: asset.warnings,
        errors: asset.errors,
      })),
      semantic_extractions: result.semantic_extractions.map((item) => ({
        source_id: item.source_id,
        status: item.status,
        model: item.model,
        evidence_basis: item.evidence_basis,
        input_chunk_count: item.input_chunk_count,
        input_char_count: item.input_char_count,
        quality_score_100: item.quality_score_100,
        quality_decision: item.quality_decision,
        method_theory_count: item.technique_method_theory.length,
        variable_count: item.variables_or_constructs.length,
        limitation_count: item.limitations.length,
        evidence_item_count: item.evidence_items.length,
        asset_review_count: item.asset_reviews.length,
        gaps: item.gaps,
        warnings: item.warnings,
        errors: item.errors,
        first_evidence_items: item.evidence_items.slice(0, 3),
        first_methods_or_theories: item.technique_method_theory.slice(0, 3),
      })),
      evidence_cards: result.evidence_cards.slice(0, 5).map((card) => ({
        card_id: card.card_id,
        source_id: card.source_id,
        evidence_basis: card.evidence_basis,
        quality_status: card.quality_status,
        quality_score_100: card.quality_score_100,
        assigned_section_keys: card.assigned_section_keys,
        requires_full_text: card.requires_full_text,
        source_artifacts: card.source_artifacts,
        extraction_gaps: card.extraction_gaps,
        text_excerpt: card.text_excerpt,
      })),
    },
  };

  const outputPath = path.join(artifactDir, "step5-evidence-materialization-diagnostics-report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: "MVP_STEP5_DIAGNOSTIC_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({
      run_id: runId,
      artifact_dir: artifactDir,
      output_path: outputPath,
      ok: report.ok,
      failed_checks: checks.filter((item) => !item.passed).map((item) => item.key),
      duration_ms: result.duration_ms,
      api_usage: result.api_usage,
      curated_asset_count: result.curated_asset_count,
      visual_localized_asset_count: result.visual_localized_asset_count,
      semantic_extraction_count: result.semantic_extraction_count,
    }),
  });

  return report;
}

runDiagnostic()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
