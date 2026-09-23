import { grantTestPackage, removeTestCommercialData } from "./fixtures/commercial";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { BlueprintJobStatus, DegreeLevel, GeneratedArtifactKind, Provider, TemplateKey, University } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { findGeneratedArtifactForUserVersion } from "@/server/artifacts/generated-artifact-service";
import { assertLoginAllowed, recordLoginFailure } from "@/server/auth/login-throttle";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  enqueueBlueprintJobForUser,
  runNextBlueprintJobStage,
  type ReleaseJobExecutor,
} from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emails = [`pilot-a-${suffix}@example.test`, `pilot-b-${suffix}@example.test`];

async function createProject(userId: string, title: string) {
  const project = await prisma.project.create({
    data: {
      userId,
      title,
      degreeLevel: DegreeLevel.MAESTRIA,
      university: University.OTHER,
      program: "Programa de prueba aislado",
      templateKey: TemplateKey.GENERIC_POSGRADO_PE,
      intake: {
        create: {
          topic: title,
          problemContext: "Problema verificable para una prueba de aislamiento.",
          targetPopulation: "Corpus de prueba",
          preferredMethodology: "Diseño cualitativo de prueba",
          availableData: "Evidencia bibliográfica de prueba",
          academicConstraints: "Sin datos privados reales",
        },
      },
    },
  });
  const reference = await prisma.reference.create({
    data: {
      title: `Referencia aislada ${title}`,
      normalizedTitle: `referencia aislada ${title.toLowerCase()}`,
      authorsJson: ["Autor de prueba"],
      abstract: "Resumen inspeccionable de prueba.",
      year: 2025,
    },
  });
  await prisma.projectReference.create({
    data: {
      projectId: project.id,
      referenceId: reference.id,
      sourceProvider: Provider.SYSTEM,
      selected: true,
      selectedOrder: 1,
    },
  });
  return project;
}

async function main() {
  const passwordHash = await hashPassword("secure-pilot-password");
  const [userA, userB] = await Promise.all(emails.map((email) => prisma.user.create({ data: { email, passwordHash } })));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "imx-secure-pilot-"));
  await grantTestPackage(userA.id);

  try {
    assert.equal(await verifyPassword("secure-pilot-password", passwordHash), true);
    assert.equal(await verifyPassword("wrong-password", passwordHash), false);

    const [projectA] = await Promise.all([
      createProject(userA.id, "Proyecto privado A"),
      createProject(userB.id, "Proyecto privado B"),
    ]);

    await assert.rejects(() => enqueueBlueprintJobForUser(userB.id, projectA.id), /Proyecto no encontrado/);

    const job = await enqueueBlueprintJobForUser(userA.id, projectA.id);
    let materializeCalls = 0;
    let generateCalls = 0;
    const docxPath = path.join(tempDir, "final-thesis-plan.docx");
    const pdfPath = path.join(tempDir, "final-thesis-plan.pdf");
    await Promise.all([
      writeFile(docxPath, Buffer.from("secure pilot docx")),
      writeFile(pdfPath, Buffer.from("%PDF-1.7\nsecure pilot")),
      writeFile(path.join(tempDir, "bibliography.bib"), "@article{pilot}"),
      writeFile(path.join(tempDir, "bibliography.ris"), "TY  - JOUR\nER  -"),
      writeFile(path.join(tempDir, "evidence-log.json"), JSON.stringify({ private: true })),
    ]);

    const executor: ReleaseJobExecutor = {
      async materialize() {
        materializeCalls += 1;
        return {
          status: "completed",
          step_run_id: `step5-${suffix}`,
          artifact_manifest_path: path.join(tempDir, "step5.json"),
        } as never;
      },
      async generate() {
        generateCalls += 1;
        const version = await prisma.blueprintVersion.create({
          data: {
            projectId: projectA.id,
            versionNumber: 1,
            model: "offline-test",
            promptVersion: "offline-test",
            intakeSnapshotJson: {},
            selectedReferencesSnapshotJson: {},
            blueprintJson: {},
            coherenceReportJson: {},
          },
        });
        return {
          status: "completed",
          blueprint_version_id: version.id,
          docx_path: docxPath,
          pdf_path: pdfPath,
          artifact_dir: tempDir,
          artifact_manifest_path: path.join(tempDir, "manifest.json"),
        } as never;
      },
    };

    const first = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(first.job?.currentStage, "generating_plan");
    assert.equal(materializeCalls, 1);

    await prisma.blueprintJob.update({
      where: { id: job.id },
      data: { status: BlueprintJobStatus.RUNNING, lockedAt: new Date(Date.now() - 20 * 60 * 1000) },
    });
    const recoveredAfterRestart = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(recoveredAfterRestart.job?.currentStage, "persisting_artifacts");
    assert.equal(generateCalls, 1);

    const completed = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(completed.job?.status, BlueprintJobStatus.COMPLETED);
    const duplicate = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(duplicate.state, "locked_or_finished");
    assert.equal(generateCalls, 1);

    const version = await prisma.blueprintVersion.findFirstOrThrow({ where: { projectId: projectA.id } });
    await getBlueprintVersionForUser(userA.id, projectA.id, version.id);
    await assert.rejects(() => getBlueprintVersionForUser(userB.id, projectA.id, version.id), /no encontr/i);

    const ownArtifact = await findGeneratedArtifactForUserVersion({
      userId: userA.id,
      projectId: projectA.id,
      blueprintVersionId: version.id,
      kind: GeneratedArtifactKind.BLUEPRINT_DOCX,
    });
    const foreignArtifact = await findGeneratedArtifactForUserVersion({
      userId: userB.id,
      projectId: projectA.id,
      blueprintVersionId: version.id,
      kind: GeneratedArtifactKind.BLUEPRINT_DOCX,
    });
    assert.ok(ownArtifact);
    assert.equal(foreignArtifact, null);
    assert.equal((await prisma.generatedArtifact.count({ where: { jobId: job.id } })), 5);
    await rm(tempDir, { recursive: true, force: true });
    assert.equal(Buffer.from(ownArtifact!.content).toString(), "secure pilot docx");

    const failingJob = await enqueueBlueprintJobForUser(userA.id, projectA.id);
    let providerFailureCalls = 0;
    const unavailableProviderExecutor: ReleaseJobExecutor = {
      async materialize() {
        providerFailureCalls += 1;
        throw Object.assign(new Error("PROVIDER_UNAVAILABLE_TEST"), { status: 503 });
      },
      async generate() {
        throw new Error("generation must not run");
      },
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await runNextBlueprintJobStage(failingJob.id, unavailableProviderExecutor);
      await prisma.blueprintJob.updateMany({
        where: { id: failingJob.id, status: BlueprintJobStatus.QUEUED },
        data: { nextAttemptAt: new Date(0) },
      });
    }
    const exhausted = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: failingJob.id } });
    assert.equal(exhausted.status, BlueprintJobStatus.FAILED);
    assert.equal(providerFailureCalls, 3);

    const throttleRequest = new Request("http://127.0.0.1/auth", { headers: { "x-forwarded-for": "192.0.2.10" } });
    const initialThrottle = await assertLoginAllowed(throttleRequest, emails[0]);
    for (let index = 0; index < 5; index += 1) await recordLoginFailure(initialThrottle.keyHash);
    assert.equal((await assertLoginAllowed(throttleRequest, emails[0])).allowed, false);

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      ownership_isolation: true,
      restart_recovery: true,
      duplicate_output_prevention: true,
      durable_artifact_after_local_file_removal: true,
      login_throttle: true,
      unavailable_provider_bounded_retries: true,
      job_id: job.id,
    })}\n`);
  } finally {
    await removeTestCommercialData([userA.id, userB.id]);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await rm(tempDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
