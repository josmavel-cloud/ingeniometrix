import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/server/auth/password";
import { runNextBlueprintJobStage, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3301";
const origin = new URL(baseUrl).origin;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emails = [`e2e-a-${suffix}@example.test`, `e2e-b-${suffix}@example.test`];
const password = "secure-pilot-e2e-password";
const referenceIds: string[] = [];
let tempDir = "";

function headers(cookie?: string, json = false) {
  return {
    Origin: origin,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: headers(undefined, true),
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("imx_session="));
  assert.equal(response.headers.get("set-cookie")?.includes("HttpOnly"), true);
  assert.equal(response.headers.get("set-cookie")?.toLowerCase().includes("samesite=strict"), true);
  return cookie!;
}

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(`${baseUrl}${url}`, { ...init, redirect: "manual" });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function main() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "imx-release-e2e-"));
  const passwordHash = await hashPassword(password);
  const [userA] = await Promise.all(emails.map((email) => prisma.user.create({ data: { email, passwordHash } })));

  try {
    const unauthenticated = await fetch(`${baseUrl}/api/projects`, { redirect: "manual" });
    assert.notEqual(unauthenticated.status, 200);

    const cookieA = await login(emails[0]);
    const cookieB = await login(emails[1]);

    const crossOrigin = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { Origin: "https://evil.example", Cookie: cookieA, "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
    });
    assert.equal(crossOrigin.status, 403);

    const created = await jsonRequest("/api/projects", {
      method: "POST",
      headers: headers(cookieA, true),
      body: JSON.stringify({
        title: "Plan piloto seguro",
        customIdeaText: "Evaluar un problema académico sin datos privados",
        degreeLevel: "MAESTRIA",
        university: "OTHER",
        program: "Programa de prueba",
        language: "es",
        templateKey: "GENERIC_POSGRADO_PE",
        topicAreaLabel: "Metodología de investigación",
      }),
    });
    assert.equal(created.response.status, 201);
    const projectId = String((created.payload as { project: { id: string } }).project.id);

    const intake = await jsonRequest(`/api/projects/${projectId}/intake`, {
      method: "PUT",
      headers: headers(cookieA, true),
      body: JSON.stringify({
        topic: "Plan piloto seguro",
        problemContext: "Existe una brecha metodológica verificable en el contexto de prueba.",
        targetPopulation: "Corpus académico de prueba",
        availableData: "Tres resúmenes bibliográficos inspeccionables",
        preferredMethodology: "Diseño cualitativo documental",
        academicConstraints: "No usar datos personales reales",
      }),
    });
    assert.equal(intake.response.status, 200);

    for (let index = 1; index <= 3; index += 1) {
      const reference = await prisma.reference.create({
        data: {
          title: `Fuente E2E ${index}`,
          normalizedTitle: `fuente e2e ${index} ${suffix}`,
          authorsJson: [`Autor ${index}`],
          abstract: `Resumen verificable ${index} para el caso de prueba.`,
          year: 2024,
        },
      });
      referenceIds.push(reference.id);
      await prisma.projectReference.create({
        data: { projectId, referenceId: reference.id, sourceProvider: Provider.SYSTEM },
      });
    }

    const listed = await jsonRequest(`/api/projects/${projectId}/references`, {
      method: "GET",
      headers: headers(cookieA),
    });
    assert.equal(listed.response.status, 200);

    const selected = await jsonRequest(`/api/projects/${projectId}/references`, {
      method: "PUT",
      headers: headers(cookieA, true),
      body: JSON.stringify({ selectedReferenceIds: referenceIds }),
    });
    assert.equal(selected.response.status, 200);

    const forbiddenProject = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: headers(cookieB),
      redirect: "manual",
    });
    assert.notEqual(forbiddenProject.status, 200);
    const forbiddenMutation = await fetch(`${baseUrl}/api/projects/${projectId}/intake`, {
      method: "PUT",
      headers: headers(cookieB, true),
      body: JSON.stringify({ topic: "Ataque", problemContext: "No autorizado", targetPopulation: "Nadie" }),
      redirect: "manual",
    });
    assert.notEqual(forbiddenMutation.status, 200);

    const queued = await jsonRequest(`/api/projects/${projectId}/blueprints`, {
      method: "POST",
      headers: headers(cookieA, true),
      body: "{}",
    });
    assert.equal(queued.response.status, 202);
    const jobId = String((queued.payload as { job: { id: string } }).job.id);

    const docxPath = path.join(tempDir, "final-thesis-plan.docx");
    const pdfPath = path.join(tempDir, "final-thesis-plan.pdf");
    await Promise.all([
      writeFile(docxPath, "authenticated DOCX"),
      writeFile(pdfPath, "%PDF-1.7\nauthenticated PDF"),
      writeFile(path.join(tempDir, "bibliography.bib"), "@article{e2e}"),
      writeFile(path.join(tempDir, "bibliography.ris"), "TY  - JOUR\nER  -"),
      writeFile(path.join(tempDir, "evidence-log.json"), JSON.stringify({ e2e: true })),
    ]);
    const executor: ReleaseJobExecutor = {
      async materialize() {
        return { status: "completed", step_run_id: `step5-${suffix}`, artifact_manifest_path: path.join(tempDir, "step5.json") } as never;
      },
      async generate() {
        const latest = await prisma.blueprintVersion.aggregate({ where: { projectId }, _max: { versionNumber: true } });
        const version = await prisma.blueprintVersion.create({
          data: {
            projectId,
            versionNumber: (latest._max.versionNumber ?? 0) + 1,
            model: "offline-e2e",
            promptVersion: "offline-e2e",
            intakeSnapshotJson: {},
            selectedReferencesSnapshotJson: {},
            blueprintJson: {},
            coherenceReportJson: {},
          },
        });
        return { status: "completed", blueprint_version_id: version.id, docx_path: docxPath, pdf_path: pdfPath, artifact_dir: tempDir, artifact_manifest_path: path.join(tempDir, "manifest.json") } as never;
      },
    };

    await runNextBlueprintJobStage(jobId, executor);
    await runNextBlueprintJobStage(jobId, executor);
    await runNextBlueprintJobStage(jobId, executor);

    const progress = await jsonRequest(`/api/projects/${projectId}/blueprints/progress`, {
      method: "GET",
      headers: headers(cookieA),
    });
    assert.equal(progress.response.status, 200);
    assert.equal((progress.payload as { progress: { jobStatus: string } }).progress.jobStatus, "COMPLETED");

    const version = await prisma.blueprintVersion.findFirstOrThrow({ where: { projectId }, orderBy: { versionNumber: "desc" } });
    const result = await fetch(`${baseUrl}/api/projects/${projectId}/blueprints/${version.id}`, { headers: headers(cookieA) });
    assert.equal(result.status, 200);
    const docx = await fetch(`${baseUrl}/api/projects/${projectId}/blueprints/${version.id}/docx`, { headers: headers(cookieA) });
    const pdf = await fetch(`${baseUrl}/api/projects/${projectId}/blueprints/${version.id}/pdf`, { headers: headers(cookieA) });
    assert.equal(docx.status, 200);
    assert.equal(Buffer.from(await docx.arrayBuffer()).toString(), "authenticated DOCX");
    assert.equal(pdf.status, 200);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");

    const foreignDownload = await fetch(`${baseUrl}/api/projects/${projectId}/blueprints/${version.id}/docx`, { headers: headers(cookieB), redirect: "manual" });
    assert.notEqual(foreignDownload.status, 200);
    const legacy = await fetch(`${baseUrl}/lab/master-blueprint`, { redirect: "manual" });
    assert.equal(legacy.status, 404);

    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: headers(cookieA), redirect: "manual" });
    assert.equal(logout.status, 200);
    const revoked = await fetch(`${baseUrl}/api/projects`, { headers: headers(cookieA), redirect: "manual" });
    assert.notEqual(revoked.status, 200);

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      login: true,
      project: true,
      intake: true,
      evidence_fixture: true,
      human_selection: true,
      generation_job: true,
      authorized_docx_pdf: true,
      cross_user_read_mutate_generate_download_blocked: true,
      logout_revocation: true,
      csrf_origin_rejection: true,
      legacy_routes_blocked: true,
      project_id: projectId,
      job_id: jobId,
    })}\n`);
  } finally {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    if (referenceIds.length) await prisma.reference.deleteMany({ where: { id: { in: referenceIds } } });
    await rm(tempDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
