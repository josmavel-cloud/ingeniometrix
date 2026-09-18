import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  applyMvpStep2IntakeChoice,
  MVP_STEP2_KEY,
  runMvpEvidenceInformedTopicRefinement,
} from "@/server/mvp/topic-refinement-service";
import { asStepRunJson, findLatestMvpStepRun } from "@/server/mvp/step-run-service";

import { createStep1FixtureProject, ensureStep1FixtureUser } from "./lib/step1-fixture-project";

const TEST_USER_EMAIL = "mvp-step2-refinement-diagnostics@ingeniometrix.local";

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

function chooseRecommended(refinement: Awaited<ReturnType<typeof runMvpEvidenceInformedTopicRefinement>>) {
  return (
    refinement.alternatives.find((option) => option.option_id === refinement.recommended_option_id) ??
    refinement.alternatives.find((option) => option.strategy === "balanceada") ??
    refinement.alternatives[0]
  );
}

async function runDiagnostic() {
  const runId = `step2-refinement-diagnostics-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-step2-refinement-diagnostics", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await ensureStep1FixtureUser(TEST_USER_EMAIL, "MVP Step 2 Diagnostics");
  const project = await createStep1FixtureProject({ user, label: runId });

  await logAuditEvent({
    eventType: "MVP_STEP2_DIAGNOSTIC_STARTED",
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
  const selected = chooseRecommended(refinement);
  const selection = await applyMvpStep2IntakeChoice({
    userId: user.id,
    projectId: project.id,
    optionId: selected.option_id,
    stepRunId: refinement.step_run_id,
  });
  const latestRun = await findLatestMvpStepRun({
    projectId: project.id,
    stepKey: MVP_STEP2_KEY,
  });

  if (!latestRun) {
    throw new Error("No se pudo recuperar el MvpStepRun del Paso 2.");
  }

  const checks = [
    { key: "step2_status_not_failed", passed: refinement.status !== "failed", detail: refinement.status },
    { key: "three_alternatives", passed: refinement.alternatives.length === 3, detail: String(refinement.alternatives.length) },
    {
      key: "alternatives_have_source_feasibility",
      passed: refinement.alternatives.every((option) => option.source_feasibility.first_batch_candidate_ids.length > 0),
      detail: refinement.alternatives.map((option) => `${option.option_id}:${option.source_feasibility.first_batch_candidate_ids.length}`).join(", "),
    },
    {
      key: "coverage_has_abstracts",
      passed: refinement.evidence_map.source_feasibility.abstract_count >= 1,
      detail: String(refinement.evidence_map.source_feasibility.abstract_count),
    },
    {
      key: "candidate_pool_seeded_for_step3",
      passed: refinement.evidence_map.source_feasibility.first_batch_candidate_ids.length > 0,
      detail: refinement.evidence_map.source_feasibility.first_batch_candidate_ids.join(", "),
    },
    {
      key: "frontend_cable_after_step2",
      passed: refinement.frontend_cable.intervention_point === "after_step_2" && refinement.frontend_cable.options.length === 3,
      detail: refinement.frontend_cable.action,
    },
    { key: "artifact_manifest_exists", passed: await fileExists(refinement.artifact_manifest_path), detail: refinement.artifact_manifest_path },
    { key: "step_run_completed_or_partial", passed: ["COMPLETED", "PARTIALLY_COMPLETED"].includes(latestRun.status), detail: latestRun.status },
    { key: "tokens_reported", passed: Boolean(refinement.api_usage.report.filtered_delta), detail: refinement.api_usage.run_id },
    { key: "selection_applied", passed: selection.selected_option_id === selected.option_id, detail: selection.selected_option_id },
  ];

  const report = {
    ok: checks.every((item) => item.passed),
    run_id: runId,
    artifact_dir: artifactDir,
    project_id: project.id,
    selected_option_id: selected.option_id,
    checks,
    step2_summary: {
      status: refinement.status,
      source: refinement.source,
      model: refinement.model,
      candidate_count: refinement.evidence_map.source_feasibility.candidate_count,
      abstract_count: refinement.evidence_map.source_feasibility.abstract_count,
      probable_pdf_count: refinement.evidence_map.source_feasibility.probable_pdf_count,
      feasibility_score_100: refinement.evidence_map.source_feasibility.score_100,
      first_batch_candidate_ids: refinement.evidence_map.source_feasibility.first_batch_candidate_ids,
      frontend_options: refinement.frontend_cable.options,
    },
  };

  const outputPath = path.join(artifactDir, "step2-diagnostics-report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: "MVP_STEP2_DIAGNOSTIC_COMPLETED",
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
