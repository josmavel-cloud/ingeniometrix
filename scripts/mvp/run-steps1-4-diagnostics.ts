import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { MIN_SELECTED_REFERENCES } from "@/lib/research-workflow";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { normalizeIntakeForMvpProject, MVP_STEP1_KEY } from "@/server/mvp/intake-normalization-service";
import {
  applyMvpStep4FinalSourceSelection,
  MVP_STEP3_KEY,
  MVP_STEP4_KEY,
  prepareMvpStep3SourceSelection,
  requestMvpStep4AdditionalSources,
} from "@/server/mvp/source-selection-service";
import {
  applyMvpStep2IntakeChoice,
  MVP_STEP2_KEY,
  runMvpEvidenceInformedTopicRefinement,
} from "@/server/mvp/topic-refinement-service";
import { asStepRunJson, findLatestMvpStepRun } from "@/server/mvp/step-run-service";

import { createStep1FixtureProject, ensureStep1FixtureUser } from "./lib/step1-fixture-project";

const TEST_USER_EMAIL = "mvp-steps1-4-diagnostics@ingeniometrix.local";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fileExists(filePath: string | null | undefined) {
  if (!filePath) return false;
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function auditCount(projectId: string, eventTypePrefix: string) {
  return prisma.auditLog.count({
    where: {
      projectId,
      eventType: { startsWith: eventTypePrefix },
    },
  });
}

function chooseRecommended(refinement: Awaited<ReturnType<typeof runMvpEvidenceInformedTopicRefinement>>) {
  return (
    refinement.alternatives.find((option) => option.option_id === refinement.recommended_option_id) ??
    refinement.alternatives.find((option) => option.strategy === "balanceada") ??
    refinement.alternatives[0]
  );
}

async function runDiagnostic() {
  const runId = `steps1-4-diagnostics-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-steps1-4-diagnostics", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await ensureStep1FixtureUser(TEST_USER_EMAIL, "MVP Steps 1-4 Diagnostics");
  const project = await createStep1FixtureProject({ user, label: runId });

  await logAuditEvent({
    eventType: "MVP_STEPS1_4_DIAGNOSTIC_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({ run_id: runId, artifact_dir: artifactDir }),
  });

  const step1 = await normalizeIntakeForMvpProject({
    userId: user.id,
    projectId: project.id,
  });
  const step2 = await runMvpEvidenceInformedTopicRefinement({
    userId: user.id,
    projectId: project.id,
  });
  const selectedOption = chooseRecommended(step2);
  if (!selectedOption) {
    throw new Error("Step 2 no devolvio alternativas para diagnosticar Steps 1-4.");
  }
  const step2Selection = await applyMvpStep2IntakeChoice({
    userId: user.id,
    projectId: project.id,
    optionId: selectedOption.option_id,
    stepRunId: step2.step_run_id,
  });
  const step3FirstBatch = await prepareMvpStep3SourceSelection({
    userId: user.id,
    projectId: project.id,
  });
  const step4Expanded = await requestMvpStep4AdditionalSources({
    userId: user.id,
    projectId: project.id,
  });
  const expandedCandidates = [
    ...step4Expanded.batches.first.candidates,
    ...step4Expanded.batches.second.candidates,
  ];
  const selectedReferenceIds = expandedCandidates
    .slice(0, Math.max(MIN_SELECTED_REFERENCES, 3))
    .map((candidate) => candidate.reference_id);
  const step4Selection = await applyMvpStep4FinalSourceSelection({
    userId: user.id,
    projectId: project.id,
    selectedReferenceIds,
  });

  const [latestStep1, latestStep2, latestStep3, latestStep4, selectedRows, step4RunCount] = await Promise.all([
    findLatestMvpStepRun({ projectId: project.id, stepKey: MVP_STEP1_KEY }),
    findLatestMvpStepRun({ projectId: project.id, stepKey: MVP_STEP2_KEY }),
    findLatestMvpStepRun({ projectId: project.id, stepKey: MVP_STEP3_KEY }),
    findLatestMvpStepRun({ projectId: project.id, stepKey: MVP_STEP4_KEY }),
    prisma.projectReference.findMany({
      where: {
        projectId: project.id,
        selected: true,
      },
      orderBy: { selectedOrder: "asc" },
    }),
    prisma.mvpStepRun.count({
      where: {
        projectId: project.id,
        stepKey: MVP_STEP4_KEY,
      },
    }),
  ]);

  const checks = [
    {
      key: "step1_completed",
      passed: step1.status !== "failed" && ["COMPLETED", "PARTIALLY_COMPLETED"].includes(latestStep1?.status ?? ""),
      detail: `${step1.status}/${latestStep1?.status ?? "missing"}`,
    },
    {
      key: "step2_completed_and_selected",
      passed: step2.status !== "failed" && step2Selection.selected_option_id === selectedOption.option_id,
      detail: `${step2.status}/${step2Selection.selected_option_id}`,
    },
    {
      key: "step3_first_batch_ready",
      passed: step3FirstBatch.step_key === MVP_STEP3_KEY && step3FirstBatch.batches.first.visible_candidate_count > 0,
      detail: `${step3FirstBatch.step_key}:${step3FirstBatch.batches.first.visible_candidate_count}`,
    },
    {
      key: "step4_has_own_run_key",
      passed: step4Expanded.step_key === MVP_STEP4_KEY && step4Selection.step_key === MVP_STEP4_KEY && step4RunCount >= 2,
      detail: `${step4Expanded.step_key}/${step4Selection.step_key}; runs=${step4RunCount}`,
    },
    {
      key: "step4_artifacts_written",
      passed: await fileExists(step4Expanded.artifact_manifest_path) && await fileExists(step4Selection.artifact_manifest_path),
      detail: `${step4Expanded.artifact_manifest_path} | ${step4Selection.artifact_manifest_path}`,
    },
    {
      key: "final_selection_persisted",
      passed: selectedRows.length === step4Selection.selected_reference_ids.length && selectedRows.length >= MIN_SELECTED_REFERENCES,
      detail: `${selectedRows.length}/${step4Selection.selected_reference_ids.length}`,
    },
    {
      key: "handoff_to_step5_clear",
      passed: step4Selection.frontend_cable.intervention_point === "after_step_4_selection" &&
        step4Selection.frontend_cable.action === "run_source_health",
      detail: `${step4Selection.frontend_cable.intervention_point}:${step4Selection.frontend_cable.action}`,
    },
    {
      key: "mvp_step_runs_exist",
      passed: Boolean(latestStep1 && latestStep2 && latestStep3 && latestStep4),
      detail: [latestStep1?.id, latestStep2?.id, latestStep3?.id, latestStep4?.id].filter(Boolean).join(" | "),
    },
    {
      key: "audit_logs_exist",
      passed: (await auditCount(project.id, "MVP_STEP1_")) > 0 &&
        (await auditCount(project.id, "MVP_STEP2_")) > 0 &&
        (await auditCount(project.id, "MVP_STEP3_")) > 0 &&
        (await auditCount(project.id, "MVP_STEP4_")) > 0,
      detail: "audit prefixes checked",
    },
  ];
  const report = {
    artifact_type: "mvp_steps1_4_diagnostic_report",
    artifact_version: "v1",
    ok: checks.every((item) => item.passed),
    run_id: runId,
    generated_at: new Date().toISOString(),
    artifact_dir: artifactDir,
    project_id: project.id,
    checks,
    summary: {
      step1_status: step1.status,
      step2_status: step2.status,
      step2_source: step2.source,
      selected_option_id: step2Selection.selected_option_id,
      step3_first_batch_count: step3FirstBatch.batches.first.visible_candidate_count,
      step4_expanded_pool_count: step4Expanded.batches.expanded_pool_count,
      selected_reference_ids: step4Selection.selected_reference_ids,
      selected_reference_count: selectedRows.length,
      step5_handoff: step4Selection.frontend_cable,
    },
    artifacts: {
      step1_manifest: step1.artifact_manifest_path,
      step2_manifest: step2.artifact_manifest_path,
      step3_manifest: step3FirstBatch.artifact_manifest_path,
      step4_expanded_manifest: step4Expanded.artifact_manifest_path,
      step4_selection_manifest: step4Selection.artifact_manifest_path,
    },
  };
  const outputPath = path.join(artifactDir, "steps1-4-diagnostics-report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: report.ok ? "MVP_STEPS1_4_DIAGNOSTIC_COMPLETED" : "MVP_STEPS1_4_DIAGNOSTIC_FAILED",
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

  return { ...report, output_path: outputPath };
}

runDiagnostic()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
