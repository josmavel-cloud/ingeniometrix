import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { authorizePresentationRecoveryForUser, enqueueBlueprintJobForUser, runNextBlueprintJobStage, resumeLatestBlueprintJobForUser, getBlueprintProgressForUserV2, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { reservePaidCall } from "@/server/mvp/application-budget";
import { claimJobControlSlot, reserveJobCall, stageCheckpoint, withJobExecution, createBlueprintVersionOnce, closeJobCostControl } from "@/server/mvp/job-execution-context";
import { assessRenderSanity, classifyFailure, maxEditorialCompressionRounds, pageBudgetPolicy } from "@/server/mvp/execution-policy";
import { findGeneratedArtifactForUserVersion, upsertGeneratedArtifact } from "@/server/artifacts/generated-artifact-service";
import { generateScientificPlan } from "@/server/mvp/scientific-plan-generation";
import { renderBoxes } from "@/server/mvp/visual-deliverables";
import { compactDocxWhitespace } from "@/server/mvp/docx-layout-compaction";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { definition, design, matrix, ledger } from "./test-b3-scientific-contracts";

async function main() {
  if (!process.env.DATABASE_URL?.includes("imx_b4_validation")) throw new Error("B4 dedicated isolated DB required");
  global.fetch = async () => { throw new Error("Paid/network calls forbidden in B4 regression"); };
  const user = await prisma.user.create({ data: { email: `b4-${Date.now()}@example.test` } });
  const otherUser = await prisma.user.create({ data: { email: `b4-other-${Date.now()}@example.test` } });
  const directory = await mkdtemp(path.join(os.tmpdir(), "imx-b4-"));
  let checks = 0;
  const ok = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Fixture B4", program: "Fixture", university: "OTHER", degreeLevel: "MAESTRIA", templateKey: "GENERIC_POSGRADO_PE", intake: { create: { topic: "Fixture", problemContext: "Fixture", targetPopulation: "Fixture", preferredMethodology: "Fixture", availableData: "Fixture", academicConstraints: "Fixture" } } } });
    const reference = await prisma.reference.create({ data: { title: "Fixture", normalizedTitle: "b4 fixture", authorsJson: ["Fixture"], abstract: "Evidence fixture" } });
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id, sourceProvider: "SYSTEM", selected: true, selectedOrder: 1 } });
    const job = await enqueueBlueprintJobForUser(user.id, project.id);
    let scientificCalls = 0, evidenceCalls = 0, failPresentation = true;
    const narrative = { paragraphs: [{ text: "Se propone investigar el problema conservando las decisiones pendientes.", citations: [{ source_id: "S1", evidence_id: "E3" }] }], assumptions: [], limitations: [] };
    const provider = { generateStructuredObject: async (input: any) => {
      scientificCalls++;
      const ticket = await reservePaidCall(input.schemaName, input.model, 0.02);
      await ticket.complete(0.01, { input_tokens: 10, output_tokens: 10 }, input.model);
      switch (input.schemaName.replace("b3_", "")) {
        case "problem_definition": return { ...narrative, problem: definition.problem };
        case "research_questions": return { questions: definition.questions };
        case "objectives_and_optional_hypotheses": return { objectives: definition.objectives, hypotheses_or_propositions: [] };
        case "research_design": return design;
        case "consistency_matrix": return matrix;
        case "cross_section_review": return { critical_issues: [], warnings: [], checked_dimensions: ["Fixture"] };
        case "final_title": return { title: "Plan de prueba", short_title: "Prueba", rationale: "Fixture", keywords: [], warnings: [] };
        default: return narrative;
      }
    } } as any;
    const executor: ReleaseJobExecutor = {
      materialize: async () => { evidenceCalls++; return { status: "completed", step_run_id: "fixture", artifact_manifest_path: directory } as never; },
      generate: async ({ runId }) => {
        const scientific = await generateScientificPlan({ provider, projectId: project.id, runId, intake: {}, ledger, artifactDir: directory });
        ok(scientific.design.approach === design.approach, "methodology preserved");
        ok(scientific.drafts.some((draft) => draft.citation_anchors.length), "citations preserved");
        if (failPresentation) throw new Error("PDF_BODY_BUDGET: synthetic presentation failure");
        const version = await prisma.blueprintVersion.create({ data: { projectId: project.id, versionNumber: 1, model: "offline", promptVersion: "offline", intakeSnapshotJson: {}, selectedReferencesSnapshotJson: [], blueprintJson: {}, coherenceReportJson: {} } });
        for (const file of ["final-thesis-plan.docx", "final-thesis-plan.pdf", "bibliography.bib", "bibliography.ris", "evidence-log.json"]) await writeFile(path.join(directory, file), "offline fixture");
        return { status: "completed", blueprint_version_id: version.id, docx_path: path.join(directory, "final-thesis-plan.docx"), pdf_path: path.join(directory, "final-thesis-plan.pdf"), artifact_dir: directory, artifact_manifest_path: directory } as never;
      },
    };
    await runNextBlueprintJobStage(job.id, executor);
    await runNextBlueprintJobStage(job.id, executor);
    const failed = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } });
    ok(failed.status === "FAILED" && failed.attempts === 1, "presentation failure is not automatically retried");
    ok(scientificCalls === 13 && evidenceCalls === 1, "one scientific execution");
    const beforeCost = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: "control:cost" } } });
    // 61 observations cover 0..600 seconds at the real list polling interval.
    // No advancing worker is authorized in this simulation.
    for (let elapsed = 0; elapsed <= 600000; elapsed += 10000) {
      const progress = await getBlueprintProgressForUserV2(user.id, project.id);
      assert.equal(progress.shouldNudge, false);
    }
    const incompatibleResumes = await Promise.allSettled(Array.from({ length: 12 }, () => resumeLatestBlueprintJobForUser(user.id, project.id)));
    ok(incompatibleResumes.every((result) => result.status === "rejected"), "presentation recovery without complete checkpoints is rejected without mutation");
    const after = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } });
    const afterCost = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: "control:cost" } } });
    ok(after.attempts === failed.attempts && after.updatedAt.getTime() === failed.updatedAt.getTime(), "10-minute polling/concurrent resume cannot reset or mutate attempts");
    ok(scientificCalls === 13 && JSON.stringify(beforeCost.outputJson) === JSON.stringify(afterCost.outputJson), "polling adds zero provider calls/cost");
    await assert.rejects(() => enqueueBlueprintJobForUser(user.id, project.id), /restablecer/); checks++;
    for (const file of ["components/projects/project-list.tsx", "components/projects/blueprint-panel.tsx"]) ok(!(await readFile(file, "utf8")).includes("/blueprints/resume"), "UI polling has no resume side effect");
    for (const step of [5, 6]) ok((await readFile(`app/api/projects/[id]/mvp/step-${step}/route.ts`, "utf8")).includes('code: "PERSISTENT_JOB_REQUIRED"'), "direct HTTP generation cannot bypass job budget");
    for (const stageKey of ["checkpoint:VISUALS", "checkpoint:DOCX", "checkpoint:PDF", "checkpoint:FINAL_EXPORT"]) {
      await prisma.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: job.id, stageKey } }, create: { jobId: job.id, stageKey, status: "COMPLETED", progress: 100, completedAt: new Date(), outputJson: { fixture: true } }, update: { status: "COMPLETED", outputJson: { fixture: true } } });
    }
    const authorizations = await Promise.all(Array.from({ length: 12 }, () => authorizePresentationRecoveryForUser(user.id, project.id, job.id)));
    const authorized = authorizations[0];
    ok(authorizations.every((result) => result.shouldContinue) && authorized.job.attempts === failed.attempts, "concurrent presentation-only recovery is idempotent and preserves cumulative attempts");
    failPresentation = false;
    await runNextBlueprintJobStage(job.id, executor);
    await runNextBlueprintJobStage(job.id, executor);
    const finished = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } });
    ok(finished.status === "COMPLETED" && finished.attempts === 1, "successful presentation preserves cumulative failures");
    ok(scientificCalls === 13 && evidenceCalls === 1, "presentation retry adds ZERO scientific or evidence calls");
    ok(await prisma.generatedArtifact.count({ where: { jobId: job.id } }) === 5, "artifact persistence completed");
    const completedData = finished.stageDataJson as { step6?: { blueprint_version_id?: string } };
    const versionId = completedData.step6?.blueprint_version_id!;
    ok(Boolean(await findGeneratedArtifactForUserVersion({ userId: user.id, projectId: project.id, blueprintVersionId: versionId, kind: "BLUEPRINT_DOCX" })), "recovered artifact is downloadable by its owner");
    ok(!await findGeneratedArtifactForUserVersion({ userId: otherUser.id, projectId: project.id, blueprintVersionId: versionId, kind: "BLUEPRINT_DOCX" }), "recovered artifact remains isolated from another user");
    const originalDocx = await findGeneratedArtifactForUserVersion({ userId: user.id, projectId: project.id, blueprintVersionId: versionId, kind: "BLUEPRINT_DOCX" });
    await upsertGeneratedArtifact({ userId: user.id, projectId: project.id, blueprintVersionId: versionId, kind: "BLUEPRINT_DOCX", fileName: originalDocx!.fileName, mimeType: originalDocx!.mimeType, content: originalDocx!.content, metadataJson: { download: true } });
    const downloadedDocx = await findGeneratedArtifactForUserVersion({ userId: user.id, projectId: project.id, blueprintVersionId: versionId, kind: "BLUEPRINT_DOCX" });
    ok(downloadedDocx?.jobId === job.id, "authorized download upsert preserves job provenance");
    const recoveredCost = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: "control:cost" } } });
    const accounting = (row: typeof beforeCost) => { const value = row.outputJson as { entries: unknown; policy: unknown }; return JSON.stringify({ entries: value.entries, policy: value.policy }); };
    ok(accounting(beforeCost) === accounting(recoveredCost), "checkpoint-only recovery has zero paid call/token/cost delta");
    ok(beforeCost.status === "FAILED" && Boolean(beforeCost.completedAt) && recoveredCost.status === "COMPLETED" && Boolean(recoveredCost.completedAt), "cost control terminal state follows job; accounting is unchanged");
    const staleJob = await enqueueBlueprintJobForUser(user.id, project.id);
    await prisma.blueprintJob.update({ where: { id: staleJob.id }, data: { status: "RUNNING", attempts: 2, lockedAt: new Date(0), startedAt: new Date(0) } });
    await runNextBlueprintJobStage(staleJob.id, executor);
    await Promise.all(Array.from({ length: 12 }, () => resumeLatestBlueprintJobForUser(user.id, project.id)));
    const exhausted = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: staleJob.id } });
    ok(exhausted.status === "FAILED" && exhausted.attempts === 3 && evidenceCalls === 1, "last stale-lock recovery exhausts job without paying; concurrent resume cannot resurrect it");

    const control = await prisma.blueprintJob.create({ data: { userId: user.id, projectId: project.id, status: "RUNNING", startedAt: new Date(), currentStage: "generating_plan", metadataJson: { executionPolicy: "b4.v1" } } });
    await withJobExecution({ jobId: control.id, startedAt: control.startedAt!, stage: "SECTION_DRAFTS:test" }, async () => {
      const tickets = await Promise.allSettled([reserveJobCall("scientific", "gpt-5.4", 1.1), reserveJobCall("scientific", "gpt-5.4", 1.1)]);
      ok(tickets.filter((ticket) => ticket.status === "fulfilled").length === 1, "atomic reservations prevent concurrent overspend");
      const success = tickets.find((ticket) => ticket.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveJobCall>>>;
      await success.value!.fail();
      await assert.rejects(() => reserveJobCall("scientific", "gpt-5.4", 1.0), /COST_LIMIT/); checks++;
      const output = execFileSync("node_modules/.bin/tsx", ["-e", `import {withJobExecution,reserveJobCall} from './server/mvp/job-execution-context'; import {prisma} from './lib/prisma'; (async()=>{try{await withJobExecution({jobId:process.env.B4_JOB!,startedAt:new Date(process.env.B4_STARTED!),stage:'restart'},()=>reserveJobCall('scientific','gpt-5.4',1.0));process.exitCode=1;}catch(e){if(!String(e).includes('COST_LIMIT'))throw e; console.log('PERSISTED_CAP');}finally{await prisma.$disconnect();}})();`], { encoding: "utf8", env: { ...process.env, B4_JOB: control.id, B4_STARTED: control.startedAt!.toISOString() } });
      ok(output.includes("PERSISTED_CAP"), "new process cannot reset existing cost reservation");
      ok(await claimJobControlSlot("editorial-compression-rounds", maxEditorialCompressionRounds()), "first publication-wide editorial compression round is allowed");
      ok(!await claimJobControlSlot("editorial-compression-rounds", maxEditorialCompressionRounds()), "second editorial compression round is blocked");
      await assert.rejects(() => withJobExecution({ jobId: control.id, startedAt: control.startedAt!, stage: "recovery", checkpointOnly: true, allowedCheckpointWork: ["DOCX", "PDF", "FINAL_EXPORT"] }, () => reserveJobCall("scientific", "gpt-5.4", 0.01)), /CHECKPOINT_ONLY_PAID_CALL_FORBIDDEN/); checks++;
      await assert.rejects(() => reserveJobCall("deep_research", "o4-mini-deep-research", 0.51), /COST_LIMIT/); checks++;
      let executions = 0;
      const run = () => stageCheckpoint("TEST", { prompt: "v1" }, async () => { executions++; return { answer: "kept" }; });
      await run(); await run(); ok(executions === 1, "checkpoint reused with matching inputs");
      await stageCheckpoint("TEST", { prompt: "v2" }, async () => { executions++; return { answer: "new" }; });
      ok(executions === 2, "changed prompt invalidates checkpoint");
      const publication = { projectId: project.id, versionNumber: 999, model: "offline", promptVersion: "offline", intakeSnapshotJson: {}, selectedReferencesSnapshotJson: [], blueprintJson: {}, coherenceReportJson: {} };
      const versions = await Promise.all([createBlueprintVersionOnce(publication, { science: "same" }), createBlueprintVersionOnce(publication, { science: "same" })]);
      ok(versions[0].id === versions[1].id, "publication transaction prevents duplicate versions after interrupted export");
      await assert.rejects(() => createBlueprintVersionOnce(publication, { science: "changed" }), /INPUT_CHANGED/); checks++;
      const late = await reserveJobCall("scientific", "gpt-5.4", 0.05);
      await prisma.$transaction(async (tx) => {
        await tx.blueprintJob.update({ where: { id: control.id }, data: { status: "FAILED", completedAt: new Date() } });
        await closeJobCostControl(tx, control.id, "FAILED");
      });
      const terminal = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: control.id, stageKey: "control:cost" } } });
      const pendingEntries = (terminal.outputJson as { entries: { status: string; estimate: number | null; maximum: number }[] }).entries;
      ok(pendingEntries.some((entry) => entry.status === "pending_reconciliation" && entry.estimate === null && entry.maximum === 0.05), "terminal job retains unknown/in-flight reservation instead of refunding it");
      await late!.complete(0.01, { input_tokens: 10 }, "gpt-5.4");
      const settled = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { id: terminal.id } });
      ok(settled.status === "FAILED" && (settled.outputJson as { entries: { estimate: number | null }[] }).entries.at(-1)?.estimate === 0.01, "late usage settles without reopening terminal job/cost control");
      await prisma.blueprintJob.update({ where: { id: control.id }, data: { startedAt: new Date(control.startedAt!.getTime() + 1000) } });
      await assert.rejects(() => reserveJobCall("scientific", "gpt-5.4", 0.01), /LEASE_LOST/); checks++;
    });
    const generic25 = pageBudgetPolicy(25);
    ok(pageBudgetPolicy(15).status === "WITHIN_TARGET" && pageBudgetPolicy(18).status === "ABOVE_TARGET" && generic25.status === "ABOVE_SOFT_MAX" && generic25.publicationAllowed, "generic valid 25-page plan publishes with structured length warning");
    const template25 = pageBudgetPolicy(25, { templateHardMaxBodyPages: 18 });
    ok(template25.status === "TEMPLATE_LIMIT_EXCEEDED" && !template25.publicationAllowed, "real template hard maximum remains enforceable without scientific regeneration");
    const repeatedPage = "Contenido científico repetido de manera patológica ".repeat(10);
    const runaway = assessRenderSanity({ bodyPages: 25, bodyPageTexts: [repeatedPage, repeatedPage, repeatedPage], expectedBodyPages: 15 });
    ok(runaway.status === "RENDER_SANITY_FAILURE" && !pageBudgetPolicy(25, { renderSanity: runaway }).publicationAllowed, "structural runaway render remains blockable independently from academic length");
    ok(!classifyFailure(new Error("PDF_BODY_BUDGET")).autoRetry && classifyFailure(new Error("TEMPLATE_PAGE_LIMIT")).category === "USER_ACTION_REQUIRED" && classifyFailure(new Error("RENDER_SANITY_FAILURE")).category === "PRESENTATION" && !classifyFailure(new Error("unknown failure")).autoRetry && classifyFailure({ status: 503 }).autoRetry, "central retry policy");
    const imagePath = path.join(directory, "long-spanish.png");
    await renderBoxes({ outputPath: imagePath, title: "Flujo metodológico", subtitle: "Diseño propuesto, no resultados", boxes: Array.from({ length: 5 }, () => "Priorización de pedidos urgentes y restricciones operativas explícitas, análisis de decisiones pendientes y verificación metodológica. ".repeat(20)), arrows: true });
    const layout = JSON.parse(await readFile(`${imagePath}.layout.json`, "utf8"));
    ok(layout.minimum_font_px >= 18 && layout.original_labels[0].length > layout.display_labels[0].length, "long labels have readable deterministic fallback with full retained input");
    const syntheticDocx = path.join(directory, "spacing.docx");
    const zip = new JSZip();
    const content = '<w:document><w:p><w:pPr><w:spacing w:line="276" w:after="80"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>Método, limitación y cita (Autor, 2026).</w:t></w:r></w:p></w:document>';
    zip.file("word/document.xml", content); await writeFile(syntheticDocx, await zip.generateAsync({ type: "nodebuffer" }));
    await compactDocxWhitespace(syntheticDocx);
    const compacted = await (await JSZip.loadAsync(await readFile(syntheticDocx))).file("word/document.xml")!.async("string");
    ok(compacted.replace('w:after="60"', 'w:after="80"') === content, "layout compaction preserves text, citations, fonts and line spacing exactly");
    const callsBeforeNegative = scientificCalls;
    await assert.rejects(() => generateScientificPlan({ provider, projectId: project.id, runId: "negative", intake: {}, ledger: { ...ledger, semantic_extractions: [] }, artifactDir: directory }), /INSUFFICIENT/); checks++;
    ok(scientificCalls === callsBeforeNegative, "insufficient evidence blocks before any paid/scientific call");
    const imageBound = responseCostBound({ model: "gpt-5.4-mini", max_output_tokens: 1000, input: [{ type: "input_image", detail: "high", image_url: "data:image/png;base64," + "A".repeat(1000000) }] });
    ok(imageBound?.imageTokens === 3001 && imageBound.maximumUsd < 0.02, "vision bound counts patches, not a megabyte of base64 as text tokens");
    ok(responseCostBound({ model: "unknown", max_output_tokens: 1000 }) === null && responseCostBound({ model: "gpt-5.4-mini", max_output_tokens: 1000, input: [{ type: "input_image", detail: "original" }] }) === null, "unknown pricing/detail cannot authorize an unbounded call");
    console.log(JSON.stringify({ status: "PASS", checks, polling_simulated_ms: 600000, paid_calls: 0, scientific_calls_added_on_presentation_retry: scientificCalls - 13, artifacts: directory }));
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.user.delete({ where: { id: otherUser.id } }); await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
