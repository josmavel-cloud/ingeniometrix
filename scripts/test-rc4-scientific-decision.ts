import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alternativeIsApprovable, buildMethodEvidencePack, intentFromIntake, validateScientificDecision, validateDesignCritique, CRITIQUE_DIMENSIONS, type DesignAlternative } from "@/server/mvp/scientific-decision-contracts";
import { approveScientificDecision, approvedDesignForCurrentJob, decisionForUser, proposeScientificDecision, reviseScientificDecision } from "@/server/mvp/scientific-decision-service";
import { enqueueBlueprintJobForUser, runNextBlueprintJobStage, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { generateScientificPlan } from "@/server/mvp/scientific-plan-generation";
import { definition, design, ledger, matrix } from "./test-b3-scientific-contracts";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const alternative: DesignAlternative = { id: "option-1", label: "Propuesta cualitativa sintética", scope_fulfilled: "Preserva intención de prueba", definition, research_design: design, components: [{ name: "Análisis temático", kind: "method", role: "Interpretación", inputs: ["Corpus propuesto"], outputs: ["Categorías propuestas"], dependencies: [], support: [{ source_id: "S1", evidence_id: "E3" }] }], scope_changes: [], applicability_conditions: ["Acceso por confirmar"], baselines_or_comparisons: [], transfer_limits: ["Caso único"], feasibility: "Propuesta sintética", discarded_alternative_reasons: [], qualitative_component: "Análisis temático", quantitative_component: null, integration_strategy: null, pending_user_decisions: [] };
const decision = { alternatives: [alternative], recommended_id: alternative.id, recommendation_rationale: "Fixture de contrato, no evaluación científica real", clarification_questions: [] };
const critique = { assessments: [{ alternative_id: alternative.id, intent_preserved: true, method_supported: true, executable: true, checked_dimensions: [...CRITIQUE_DIMENSIONS], issues: [] }], summary: "Crítica sintética, no humana" };

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  global.fetch = async () => { throw new Error("No network allowed"); };
  const intent = intentFromIntake({ topic: "Comprender experiencias", availableData: "Quizás entrevistas" });
  assert.equal(intent.confirmed_data.length, 0, "Unclassified prose cannot certify data access");
  const pack = buildMethodEvidencePack(ledger);
  validateScientificDecision(decision, intent, pack);
  validateDesignCritique(decision, critique);
  const mixed = structuredClone(decision); mixed.alternatives[0].research_design.approach = "mixed";
  assert.throws(() => validateScientificDecision(mixed, intent, pack), /MIXED_METHODS/);
  mixed.alternatives[0].quantitative_component = "Componente cuantitativo propuesto"; mixed.alternatives[0].integration_strategy = "Integración explícita en interpretación";
  assert.doesNotThrow(() => validateScientificDecision(mixed, intent, pack));
  const badEvidence = structuredClone(decision); badEvidence.alternatives[0].research_design.methodological_support[0].evidence_id = "invented";
  assert.throws(() => validateScientificDecision(badEvidence, intent, pack), /UNSUPPORTED/);
  assert.throws(() => validateDesignCritique(decision, { assessments: [], summary: "Incomplete" }), /CRITIQUE_COVERAGE/);
  assert.ok(!alternativeIsApprovable({ ...alternative, pending_user_decisions: [{ question: "¿Hay acceso indispensable?", blocking: true }] }, critique));
  assert.equal(buildMethodEvidencePack(ledger, 1).excluded.length, ledger.semantic_extractions[0].evidence_items.length);
  assert.ok(responseCostBound({ model: "gpt-6-astra", max_output_tokens: 8192, input: "fixture" })!.maximumUsd < 0.5);
  assert.equal(responseCostBound({ model: "gpt-6-astra", max_output_tokens: 8192, input: [{ type: "input_image", detail: "high" }] }), null, "New text model support does not imply verified vision billing");
  let repairCalls = 0;
  const rejected = await proposeScientificDecision({ projectId: "fixture", runId: "fixture", intake: { topic: "Fixture" }, academicLevel: "MAESTRIA", ledger, provider: { generateStructuredObject: async (request: any) => {
    repairCalls++;
    return request.schemaName.startsWith("design_selector") ? decision : { ...critique, assessments: [{ ...critique.assessments[0], executable: false }] };
  } } as any });
  assert.equal(repairCalls, 4, "At most selector+critic, then ONE repair+critic");
  assert.equal(rejected.repair_rounds, 1);
  assert.ok(!alternativeIsApprovable(rejected.decision.alternatives[0], rejected.critique));
  const insufficient = structuredClone(ledger); insufficient.semantic_extractions = [];
  await assert.rejects(() => proposeScientificDecision({ projectId: "fixture", runId: "fixture", intake: {}, academicLevel: "MAESTRIA", ledger: insufficient, provider: { generateStructuredObject: async () => { throw new Error("Must not call provider"); } } as any }), /INSUFFICIENT_EVIDENCE/);

  const user = await prisma.user.create({ data: { email: `rc4-design-${Date.now()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `rc4-design-other-${Date.now()}@example.test` } });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Fixture", program: "Fixture", university: "OTHER", degreeLevel: "MAESTRIA", templateKey: "GENERIC_POSGRADO_PE", intake: { create: { topic: "Comprender un fenómeno", problemContext: definition.problem, targetPopulation: "Corpus sintético", preferredMethodology: "Cualitativa", availableData: "No confirmados", academicConstraints: "Solo pruebas" } } }, include: { intake: true } });
    const reference = await prisma.reference.create({ data: { title: "Fixture", normalizedTitle: "rc4 fixture", authorsJson: ["Autor sintético"] } });
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id, selected: true, selectedOrder: 1, sourceProvider: "SYSTEM" } });
    const testLedger = structuredClone(ledger); testLedger.project_id = project.id; testLedger.source_registry[0].reference_id = reference.id; testLedger.references[0].reference_id = reference.id;
    const dir = await mkdtemp(path.join(os.tmpdir(), "imx-rc4-design-"));
    let selectorCalls = 0, criticCalls = 0, scienceCalls = 0, step5Calls = 0;
    const provider = { generateStructuredObject: async (request: any) => {
      if (request.schemaName.startsWith("design_selector")) { selectorCalls++; assert.equal(request.model, "gpt-6-astra"); assert.equal(request.reasoningEffort, "high"); return decision; }
      if (request.schemaName.startsWith("design_critic")) { criticCalls++; assert.equal(request.model, "gpt-5.6-sol"); assert.equal(request.reasoningEffort, "high"); return critique; }
      scienceCalls++;
      const phase = request.schemaName.replace("b3_", "");
      const narrative = { paragraphs: [{ text: "Narración de prueba con evidencia sintética.", citations: [{ source_id: "S1", evidence_id: "E3" }] }], assumptions: [], limitations: [] };
      if (["research_design", "research_questions", "objectives_and_optional_hypotheses"].includes(phase)) throw new Error("Approved scientific objects must not be regenerated");
      if (phase === "problem_definition") return { ...narrative, problem: definition.problem };
      if (phase === "consistency_matrix") return matrix;
      if (phase === "cross_section_review") return { critical_issues: [], warnings: [], checked_dimensions: ["Fixture"] };
      if (phase === "final_title") return { title: "Fixture", short_title: "Fixture", rationale: "Fixture", keywords: [], warnings: [] };
      return narrative;
    } } as any;
    const executor: ReleaseJobExecutor = {
      materialize: async () => {
        step5Calls++;
        const step = await prisma.mvpStepRun.create({ data: { projectId: project.id, userId: user.id, stepKey: "step_5_source_health", status: "COMPLETED" } });
        testLedger.step_run_id = step.id;
        await prisma.projectEvidenceLedger.create({ data: { projectId: project.id, stepRunId: step.id, citationStyle: "APA7", sourceRegistryJson: json(testLedger.source_registry), referencesJson: json(testLedger.references), ledgerJson: json(testLedger) } });
        return { status: "completed", step_run_id: step.id, artifact_manifest_path: dir } as never;
      },
      recommend: async ({ runId }) => proposeScientificDecision({ projectId: project.id, runId, intake: project.intake as unknown as Record<string, unknown>, academicLevel: project.degreeLevel, ledger: testLedger, provider }),
      generate: async ({ runId }) => {
        const approved = await approvedDesignForCurrentJob(project.intake, testLedger);
        assert.ok(approved);
        const result = await generateScientificPlan({ provider, projectId: project.id, runId, intake: project.intake, ledger: testLedger, artifactDir: dir, approvedDesign: approved });
        assert.deepEqual(result.definition, definition); assert.deepEqual(result.design, design);
        throw new Error("PDF_SYNTHETIC_PRESENTATION_FAILURE");
      },
    };
    const job = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4" });
    await runNextBlueprintJobStage(job.id, executor);
    const waiting = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(waiting.job?.status, "WAITING_USER_DECISION");
    assert.equal(scienceCalls, 0);
    assert.equal((await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4" })).id, job.id);
    for (let i = 0; i < 10; i++) await runNextBlueprintJobStage(job.id, executor);
    assert.equal(selectorCalls, 1); assert.equal(criticCalls, 1); assert.equal(step5Calls, 1);
    await assert.rejects(() => decisionForUser(other.id, project.id, job.id));
    const publicDecision = await decisionForUser(user.id, project.id, job.id);
    const approval = { userId: user.id, projectId: project.id, jobId: job.id, decisionFingerprint: publicDecision.decision!.fingerprint, alternativeId: alternative.id, acceptScopeChanges: false };
    await assert.rejects(() => approveScientificDecision({ ...approval, userId: other.id }));
    await assert.rejects(() => approveScientificDecision({ ...approval, decisionFingerprint: "0".repeat(64) }), /REVISION_CONFLICT/);
    await assert.rejects(() => reviseScientificDecision(approval), /REQUIRES_CHANGED_INPUT/);
    project.intake = await prisma.intake.update({ where: { projectId: project.id }, data: { academicConstraints: "Restricción corregida explícitamente por el usuario" } });
    await assert.rejects(() => approveScientificDecision(approval), /INPUT_CHANGED/);
    const cost = { policy: { hard: 2 }, entries: [{ id: "fixture-reservation", maximum: 0.2, estimate: null, status: "failed_unknown_usage" }] };
    await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: "control:cost", status: "RUNNING", progress: 0, outputJson: json(cost) } });
    await Promise.all([reviseScientificDecision(approval), reviseScientificDecision(approval)]);
    assert.deepEqual((await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: "control:cost" } } })).outputJson, cost);
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } })).attempts, 0);
    assert.equal(await prisma.blueprintJobStage.count({ where: { jobId: job.id, stageKey: { startsWith: "archive:design-revision-1:" } } }), 6);
    await runNextBlueprintJobStage(job.id, executor); await runNextBlueprintJobStage(job.id, executor);
    const revised = await decisionForUser(user.id, project.id, job.id);
    assert.notEqual(revised.decision!.fingerprint, approval.decisionFingerprint);
    await reviseScientificDecision(approval);
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } })).status, "WAITING_USER_DECISION", "Old revision replay cannot schedule calls");
    approval.decisionFingerprint = revised.decision!.fingerprint;
    await Promise.all([approveScientificDecision(approval), approveScientificDecision(approval)]);
    await runNextBlueprintJobStage(job.id, executor);
    assert.equal(scienceCalls, 10, "Approved questions/objectives/design replace three paid re-generation calls");
    const after = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(after.status, "FAILED");
    const repeated = await approveScientificDecision(approval);
    assert.ok(repeated.approved);
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } })).status, "FAILED", "approval replay cannot restart failure");
    console.log("PASS RC4 scientific decision: model/effort contract, evidence pointers, mixed-method conditions, owned approval, pause/idempotency, approved-state consumption; mocked only, paid calls=0.");
  } finally { await prisma.user.delete({ where: { id: user.id } }); await prisma.user.delete({ where: { id: other.id } }); await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
