import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { MIN_SELECTED_REFERENCES } from "@/lib/research-workflow";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  applyMvpStep3SourceSelection,
  MVP_STEP3_KEY,
  prepareMvpStep3SourceSelection,
  requestMvpStep3MoreSources,
} from "@/server/mvp/source-selection-service";
import {
  applyMvpStep2IntakeChoice,
  runMvpEvidenceInformedTopicRefinement,
} from "@/server/mvp/topic-refinement-service";
import { asStepRunJson, findLatestMvpStepRun } from "@/server/mvp/step-run-service";

import { createStep1FixtureProject, ensureStep1FixtureUser } from "./lib/step1-fixture-project";

const TEST_USER_EMAIL = "mvp-step3-source-selection-diagnostics@ingeniometrix.local";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function chooseBalanced(refinement: Awaited<ReturnType<typeof runMvpEvidenceInformedTopicRefinement>>) {
  return (
    refinement.alternatives.find((option) => option.strategy === "balanceada") ??
    refinement.alternatives.find((option) => option.option_id === refinement.recommended_option_id) ??
    refinement.alternatives[0]
  );
}

async function runDiagnostic() {
  const runId = `step3-source-selection-diagnostics-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-step3-source-selection-diagnostics", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await ensureStep1FixtureUser(TEST_USER_EMAIL, "MVP Step 3 Diagnostics");
  const project = await createStep1FixtureProject({ user, label: runId });

  await logAuditEvent({
    eventType: "MVP_STEP3_DIAGNOSTIC_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({ run_id: runId, artifact_dir: artifactDir }),
  });

  const refinement = await runMvpEvidenceInformedTopicRefinement({
    userId: user.id,
    projectId: project.id,
  });
  const selectedOption = chooseBalanced(refinement);

  if (!selectedOption) {
    throw new Error("Paso 2 no devolvió alternativas para preparar Paso 3.");
  }

  const step2Choice = await applyMvpStep2IntakeChoice({
    userId: user.id,
    projectId: project.id,
    optionId: selectedOption.option_id,
    stepRunId: refinement.step_run_id,
  });
  const firstBatch = await prepareMvpStep3SourceSelection({
    userId: user.id,
    projectId: project.id,
  });
  const expanded = await requestMvpStep3MoreSources({
    userId: user.id,
    projectId: project.id,
  });
  const selectedReferenceIds = expanded.batches.first.candidates
    .slice(0, Math.max(MIN_SELECTED_REFERENCES, 3))
    .map((candidate) => candidate.reference_id);
  const applied = await applyMvpStep3SourceSelection({
    userId: user.id,
    projectId: project.id,
    selectedReferenceIds,
  });
  const latestRun = await findLatestMvpStepRun({
    projectId: project.id,
    stepKey: MVP_STEP3_KEY,
  });
  const selectedRows = await prisma.projectReference.findMany({
    where: {
      projectId: project.id,
      selected: true,
    },
    orderBy: { selectedOrder: "asc" },
  });

  const checks = [
    { key: "step2_choice_exists", passed: step2Choice.selected_option_id === selectedOption.option_id, detail: step2Choice.selected_option_id },
    { key: "first_batch_visible", passed: firstBatch.batches.first.visible_candidate_count > 0, detail: String(firstBatch.batches.first.visible_candidate_count) },
    { key: "first_batch_cable", passed: firstBatch.frontend_cable.intervention_point === "after_step_3_first_batch", detail: firstBatch.frontend_cable.action },
    { key: "expanded_pool_available", passed: expanded.batches.expanded_pool_count >= firstBatch.batches.first.visible_candidate_count, detail: String(expanded.batches.expanded_pool_count) },
    { key: "multilingual_layer_reported", passed: expanded.search_layers.some((layer) => layer.layer === "multilingual_expansion"), detail: expanded.search_layers.map((layer) => `${layer.layer}:${layer.languages.join(",") || "n/a"}`).join(" | ") },
    { key: "scores_present", passed: expanded.batches.first.candidates.every((candidate) => candidate.selection_score_100 >= 0), detail: expanded.batches.first.candidates.map((candidate) => String(candidate.selection_score_100)).join(", ") },
    { key: "selection_persisted", passed: selectedRows.length === selectedReferenceIds.length, detail: String(selectedRows.length) },
    { key: "selection_cable", passed: applied.frontend_cable.intervention_point === "after_step_3_selection", detail: applied.next_action_es },
    { key: "artifact_manifest_exists", passed: await fileExists(applied.artifact_manifest_path), detail: applied.artifact_manifest_path },
    { key: "step_run_completed", passed: latestRun?.status === "COMPLETED", detail: latestRun?.status ?? "missing" },
  ];

  const report = {
    ok: checks.every((item) => item.passed),
    run_id: runId,
    artifact_dir: artifactDir,
    project_id: project.id,
    selected_option_id: selectedOption.option_id,
    checks,
    step3_summary: {
      first_batch_count: firstBatch.batches.first.visible_candidate_count,
      expanded_pool_count: expanded.batches.expanded_pool_count,
      selected_reference_ids: applied.selected_reference_ids,
      search_layers: expanded.search_layers,
      frontend_cables: [
        firstBatch.frontend_cable,
        expanded.frontend_cable,
        applied.frontend_cable,
      ],
    },
  };

  const outputPath = path.join(artifactDir, "step3-source-selection-diagnostics-report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: "MVP_STEP3_DIAGNOSTIC_COMPLETED",
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
