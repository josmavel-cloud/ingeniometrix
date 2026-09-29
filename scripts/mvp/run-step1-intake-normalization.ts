import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType } from "@prisma/client";

import { logAuditEvent } from "@/server/audit/audit-service";
import { normalizeIntakeForMvpProject } from "@/server/mvp/intake-normalization-service";
import { asStepRunJson } from "@/server/mvp/step-run-service";

import { prisma } from "@/lib/prisma";
import { createStep1FixtureProject, ensureStep1FixtureUser } from "./lib/step1-fixture-project";

const TEST_USER_EMAIL = "mvp-step1-intake@ingeniometrix.local";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const runId = `step1-intake-runner-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-step1-intake-runner", runId);
  await mkdir(artifactDir, { recursive: true });

  const user = await ensureStep1FixtureUser(TEST_USER_EMAIL, "MVP Step 1 Intake Runner");
  const project = await createStep1FixtureProject({ user, label: runId });

  await logAuditEvent({
    eventType: "MVP_STEP1_RUNNER_STARTED",
    actorType: ActorType.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({ run_id: runId, artifact_dir: artifactDir }),
  });

  const result = await normalizeIntakeForMvpProject({
    userId: user.id,
    projectId: project.id,
  });

  const outputPath = path.join(artifactDir, "runner-output.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: "MVP_STEP1_RUNNER_COMPLETED",
    actorType: ActorType.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({
      run_id: runId,
      artifact_dir: artifactDir,
      output_path: outputPath,
      result_status: result.status,
      source: result.source,
    }),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
