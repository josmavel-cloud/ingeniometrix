import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { MVP_STEP1_KEY, normalizeIntakeForMvpProject } from "@/server/mvp/intake-normalization-service";
import { asStepRunJson, findLatestMvpStepRun } from "@/server/mvp/step-run-service";

import { createStep1FixtureProject, ensureStep1FixtureUser } from "./lib/step1-fixture-project";

const TEST_USER_EMAIL = "mvp-step1-diagnostics@ingeniometrix.local";

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

async function findAuditEvents(projectId: string, eventTypePrefix: string) {
  return prisma.auditLog.findMany({
    where: {
      projectId,
      eventType: { startsWith: eventTypePrefix },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function runDiagnostic() {
  const runId = `step1-diagnostics-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-step1-intake-diagnostics", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await ensureStep1FixtureUser(TEST_USER_EMAIL, "MVP Step 1 Diagnostics");

  await logAuditEvent({
    eventType: "MVP_STEP1_DIAGNOSTIC_STARTED",
    actorType: ActorType.SYSTEM,
    userId: user.id,
    payloadJson: asStepRunJson({ run_id: runId, artifact_dir: artifactDir }),
  });

  const fullProject = await createStep1FixtureProject({ user, label: `${runId}-full` });
  const full = await normalizeIntakeForMvpProject({ userId: user.id, projectId: fullProject.id });

  const partialProject = await createStep1FixtureProject({
    user,
    label: `${runId}-partial`,
    intakeOverride: {
      researchLine: undefined,
      academicConstraints: undefined,
      availableData: undefined,
      preferredMethodology: undefined,
      advisorNotes: undefined,
    },
  });
  const partial = await normalizeIntakeForMvpProject({ userId: user.id, projectId: partialProject.id });

  const missingIntakeProject = await createStep1FixtureProject({
    user,
    label: `${runId}-missing-intake`,
    withIntake: false,
  });
  let missingIntakeError: string | null = null;
  try {
    await normalizeIntakeForMvpProject({ userId: user.id, projectId: missingIntakeProject.id });
  } catch (error) {
    missingIntakeError = error instanceof Error ? error.message : String(error);
  }

  const fullRun = await findLatestMvpStepRun({ projectId: fullProject.id, stepKey: MVP_STEP1_KEY });
  const partialRun = await findLatestMvpStepRun({ projectId: partialProject.id, stepKey: MVP_STEP1_KEY });
  const missingRun = await findLatestMvpStepRun({ projectId: missingIntakeProject.id, stepKey: MVP_STEP1_KEY });

  if (!fullRun || !partialRun || !missingRun) {
    throw new Error("No se pudieron recuperar todos los runs del Paso 1 para el diagnostico.");
  }

  const checks = [
    { key: "full_status", passed: full.status !== "failed", detail: full.status },
    { key: "full_tokens_reported", passed: Boolean(full.api_usage.report), detail: full.api_usage.run_id },
    { key: "full_artifact_manifest", passed: await fileExists(full.artifact_manifest_path), detail: full.artifact_manifest_path },
    { key: "partial_status", passed: partial.status === "partially_completed", detail: partial.status },
    { key: "partial_missing_fields", passed: partial.input_quality.missing_fields.length > 0, detail: partial.input_quality.missing_fields.join(", ") },
    { key: "missing_intake_failed", passed: missingRun.status === "FAILED", detail: missingRun.status },
    { key: "missing_intake_error", passed: Boolean(missingIntakeError), detail: missingIntakeError ?? "none" },
    { key: "full_duration_recorded", passed: Boolean(fullRun.durationMs && fullRun.durationMs >= 0), detail: String(fullRun.durationMs) },
    { key: "partial_duration_recorded", passed: Boolean(partialRun.durationMs && partialRun.durationMs >= 0), detail: String(partialRun.durationMs) },
    { key: "audit_started", passed: (await findAuditEvents(fullProject.id, "MVP_STEP1_INTAKE_")).length >= 2, detail: "audit events present" },
  ];

  const report = {
    ok: checks.every((item) => item.passed),
    run_id: runId,
    artifact_dir: artifactDir,
    checks,
    cases: {
      full: {
        project_id: fullProject.id,
        result_status: full.status,
        source: full.source,
        run_status: fullRun.status,
        artifact_manifest_path: full.artifact_manifest_path,
        api_usage_delta: full.api_usage.report.filtered_delta,
      },
      partial: {
        project_id: partialProject.id,
        result_status: partial.status,
        missing_fields: partial.input_quality.missing_fields,
        run_status: partialRun.status,
        artifact_manifest_path: partial.artifact_manifest_path,
      },
      missing_intake: {
        project_id: missingIntakeProject.id,
        error: missingIntakeError,
        run_status: missingRun.status,
      },
    },
  };

  const outputPath = path.join(artifactDir, "step1-diagnostics-report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: "MVP_STEP1_DIAGNOSTIC_COMPLETED",
    actorType: ActorType.SYSTEM,
    userId: user.id,
    payloadJson: asStepRunJson({
      run_id: runId,
      artifact_dir: artifactDir,
      output_path: outputPath,
      ok: report.ok,
      check_count: checks.length,
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
