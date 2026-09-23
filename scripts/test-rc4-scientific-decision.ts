import { grantTestPackage, removeTestCommercialData } from "./fixtures/commercial";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountDecisionSources, alternativeCanBeConfirmed, alternativeIsApprovable, buildMethodEvidencePack, intentFromIntake, migrateLegacyCritique, migrateLegacyScopeSemantics, validateScientificDecision, validateDesignCritique, type DesignAlternative } from "@/server/mvp/scientific-decision-contracts";
import { approveScientificDecision, approvedDesignForCurrentJob, critiqueScientificDecision, decisionForUser, proposeScientificDecision, reviseScientificDecision } from "@/server/mvp/scientific-decision-service";
import { enqueueBlueprintJobForUser, runNextBlueprintJobStage, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { generateScientificPlan } from "@/server/mvp/scientific-plan-generation";
import { definition, design, ledger, matrix } from "./test-b3-scientific-contracts";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT } from "@/server/mvp/prompts/scientific-design-critic.v3";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const alternative: DesignAlternative = { id: "option-1", label: "Propuesta cualitativa sintética", scope_fulfilled: "Preserva intención de prueba", definition, research_design: design, components: [{ name: "Análisis temático", kind: "method", role: "Interpretación", inputs: ["Corpus propuesto"], outputs: ["Categorías propuestas"], dependencies: [], support: [{ source_id: "S1", evidence_id: "E3" }] }], scope_changes: [], applicability_conditions: ["Acceso por confirmar"], baselines_or_comparisons: [], transfer_limits: ["Caso único"], feasibility: "Propuesta sintética", discarded_alternative_reasons: [], qualitative_component: "Análisis temático", quantitative_component: null, integration_strategy: null, pending_user_decisions: [] };
const alternativeV2 = { ...alternative, primary_method: "Análisis temático", scope_effect: "preserves" as const, scope_change_impact: null, integration_purpose: null as string | null, method_handoffs: [], data_requirements: [{ description: "Corpus de entrevistas por producir", availability: "PROPOSED" as const, confirmation_or_action: "Confirmar acceso antes del trabajo de campo" }] };
const decision = { alternatives: [alternativeV2], recommended_id: alternative.id, recommendation_rationale: "Fixture de contrato, no evaluación científica real", clarification_questions: [] };
const pass = "PASS" as const;
const scope = { status: "PRESERVED" as const, current_user_intent: "Comprender experiencias", recommended_scope: "Comprender experiencias", difference: "Precisión operacional sin reducción", rationale: "Mismo objeto y resultado", confirmation_required: false, confirmed: false };
const critique = { assessments: [{ alternative_id: alternative.id, decision: "ACCEPT" as const, intent_preserved: true, scope, theory_framework_fit: pass, method_fit: pass, method_integration: pass, mixed_methods_validity: pass, data_feasibility: pass, validation_strategy: pass, procedural_executability: pass, evidence_support: pass, transferability: pass, uncertainty_disclosure: pass, question_objective_method_alignment: pass, complexity_discipline: pass, novelty_discipline: pass, academic_level_fit: pass, critical_findings: [], user_decisions_required: [], repair_targets: [] }] };
const rejectedCritique = { assessments: [{ ...critique.assessments[0], decision: "REPAIR_REQUIRED" as const, validation_strategy: "FAIL" as const, critical_findings: [{ code: "VALIDATION_MISSING", severity: "BLOCKING" as const, affected_field: "research_design.quality_criteria", issue: "Falta criterio", evidence_or_reason: "El diseño no lo define", required_action: "Definirlo" }], repair_targets: ["research_design.quality_criteria"] }] };

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  global.fetch = async () => { throw new Error("No network allowed"); };
  const intent = intentFromIntake({ topic: "Comprender experiencias", availableData: "Quizás entrevistas" });
  assert.equal(intent.confirmed_data.length, 0, "Unclassified prose cannot certify data access");
  const pack = buildMethodEvidencePack(ledger);
  validateScientificDecision(decision, intent, pack);
  assert.ok(accountDecisionSources(pack, decision).some((s) => s.used_to_justify_decision));
  assert.ok(accountDecisionSources(pack, { ...decision, alternatives: [] }).every((s) => s.excluded && s.exclusion_reason), "Selected sources not cited in the design remain accounted for");
  validateDesignCritique(decision, critique);
  const mixed = structuredClone(decision); mixed.alternatives[0].research_design.approach = "mixed";
  assert.throws(() => validateScientificDecision(mixed, intent, pack), /MIXED_METHODS/);
  mixed.alternatives[0].quantitative_component = "Componente cuantitativo propuesto"; mixed.alternatives[0].integration_strategy = "Integración explícita en interpretación";
  mixed.alternatives[0].integration_purpose = "Interpretar discrepancias entre medición y experiencias";
  assert.doesNotThrow(() => validateScientificDecision(mixed, intent, pack));
  const badEvidence = structuredClone(decision); badEvidence.alternatives[0].research_design.methodological_support[0].evidence_id = "invented";
  assert.throws(() => validateScientificDecision(badEvidence, intent, pack), /UNSUPPORTED/);
  assert.throws(() => validateDesignCritique(decision, { assessments: [] }), /CRITIQUE_COVERAGE/);
  assert.ok(!alternativeIsApprovable({ ...alternative, pending_user_decisions: [{ question: "¿Hay acceso indispensable?", blocking: true }] }, critique));
  assert.equal(buildMethodEvidencePack(ledger, 1).excluded.length, ledger.semantic_extractions[0].evidence_items.length);
  assert.ok(buildMethodEvidencePack(ledger, 1).source_accounting.every((s) => s.exclusion_reason), "Budget exclusion is explicit per selected source");
  const compactIntent = intentFromIntake({ topic: "Implementar una solución", id: "private-db-id", createdAt: "private", researchScope: "Alcance confirmado", constructs: "Categorías", pendingDecisions: "Acceso" });
  assert.equal(compactIntent.scope, "Alcance confirmado");
  assert.equal(compactIntent.user_statements.id, undefined);
  assert.ok(compactIntent.requirements.some((r) => r.id === "pending-decisions" && r.authority === "PENDING"));
  assert.throws(() => validateScientificDecision(decision, compactIntent, pack), /INTENT_ACTION_CHANGE/);
  const tool = structuredClone(decision); tool.alternatives[0].components[0].name = "Python"; tool.alternatives[0].primary_method = "Python";
  assert.throws(() => validateScientificDecision(tool, intent, pack), /SOFTWARE_IS_NOT/);
  const cycle = structuredClone(decision); cycle.alternatives[0].components[0].dependencies = [cycle.alternatives[0].primary_method];
  assert.throws(() => validateScientificDecision(cycle, intent, pack), /DEPENDENCY_CYCLE/);
  const missingDependency = structuredClone(decision); missingDependency.alternatives[0].components[0].dependencies = ["Método ausente"];
  assert.throws(() => validateScientificDecision(missingDependency, intent, pack), /DEPENDENCY_UNKNOWN/);
  const handoff = structuredClone(decision);
  handoff.alternatives[0].components.push({ name: "Contraste interpretativo", kind: "method", role: "Integrar discrepancias del corpus sintético", inputs: ["Categorías propuestas"], outputs: ["Síntesis interpretativa"], dependencies: ["Análisis temático"], support: [{ source_id: "S1", evidence_id: "E3" }] });
  const integrated = { ...handoff, alternatives: [{ ...handoff.alternatives[0], method_handoffs: [{ from: "Análisis temático", to: "Contraste interpretativo", transferred_output: "Categorías propuestas", use_by_next_method: "Examinar discrepancias" }] }] };
  assert.doesNotThrow(() => validateScientificDecision(integrated, intent, pack));
  integrated.alternatives[0].method_handoffs[0].transferred_output = "Salida inexistente";
  assert.throws(() => validateScientificDecision(integrated, intent, pack), /HANDOFF_INVALID/);
  assert.throws(() => validateScientificDecision(handoff, intent, pack), /INTEGRATION_MISSING/);
  const inventedAccess = { ...decision, alternatives: [{ ...alternativeV2, data_requirements: [{ description: "Corpus", availability: "USER_CONFIRMED" as const, confirmation_or_action: "Afirmación sin respaldo en intake" }] }] };
  assert.throws(() => validateScientificDecision(inventedAccess, intent, pack), /DATA_ACCESS_NOT_USER_CONFIRMED/);
  const noValidation = structuredClone(decision); noValidation.alternatives[0].research_design.quality_criteria = [];
  assert.throws(() => validateScientificDecision(noValidation, intent, pack), /NOT_EXECUTABLE/);
  const changed = { ...alternativeV2, scope_effect: "narrows" as const };
  assert.throws(() => validateScientificDecision({ ...decision, alternatives: [changed] }, intent, pack), /SCOPE_CHANGE_DISCLOSURE/);
  const scopeCritique = (status: typeof scope.status | "CLARIFIED" | "NARROWED" | "EXPANDED" | "MATERIAL_CHANGE_PROPOSED" | "PENDING_USER_DECISION", decisionStatus: "ACCEPT" | "ACCEPT_WITH_USER_CONFIRMATION" | "REPAIR_REQUIRED", confirmationRequired: boolean, decisions: string[] = []) => ({ assessments: [{ ...critique.assessments[0], decision: decisionStatus, scope: { ...scope, status, confirmation_required: confirmationRequired, confirmed: false }, user_decisions_required: decisions, repair_targets: decisionStatus === "REPAIR_REQUIRED" ? ["scope"] : [] }] });
  assert.doesNotThrow(() => validateDesignCritique(decision, scopeCritique("PRESERVED", "ACCEPT", false)));
  assert.doesNotThrow(() => validateDesignCritique(decision, scopeCritique("CLARIFIED", "ACCEPT", false)));
  for (const status of ["NARROWED", "EXPANDED", "MATERIAL_CHANGE_PROPOSED"] as const) {
    const review = scopeCritique(status, "ACCEPT_WITH_USER_CONFIRMATION", true);
    assert.doesNotThrow(() => validateDesignCritique(decision, review));
    assert.ok(alternativeCanBeConfirmed(alternativeV2, review));
    assert.ok(!alternativeIsApprovable(alternativeV2, review));
    assert.ok(alternativeIsApprovable(alternativeV2, review, true));
  }
  const pendingScope = scopeCritique("PENDING_USER_DECISION", "REPAIR_REQUIRED", true, ["Elegir caso único o múltiple"]);
  assert.doesNotThrow(() => validateDesignCritique(decision, pendingScope));
  assert.ok(!alternativeCanBeConfirmed(alternativeV2, pendingScope));
  assert.throws(() => validateDesignCritique(decision, scopeCritique("PENDING_USER_DECISION", "ACCEPT_WITH_USER_CONFIRMATION", true, ["Elegir"])), /PENDING_SCOPE/);
  const ambiguous = { ...alternativeV2, pending_user_decisions: [{ question: "¿Se estudiará una institución o casos múltiples?", blocking: true }] };
  assert.equal(migrateLegacyScopeSemantics(intent, ambiguous).status, "PENDING_USER_DECISION", "A pending delimitation is not a confirmed narrowing");
  const migrated = migrateLegacyCritique(intent, { ...decision, alternatives: [ambiguous] }, { assessments: [{ alternative_id: ambiguous.id, intent_preserved: true, method_supported: true, executable: true, checked_dimensions: ["intent"], issues: [] }], summary: "Salida histórica" });
  assert.equal(migrated.assessments[0].scope.status, "PENDING_USER_DECISION");
  assert.equal(migrated.assessments[0].decision, "REPAIR_REQUIRED");
  assert.deepEqual(migrated.assessments[0].repair_targets, ["scope"]);
  assert.ok(responseCostBound({ model: "gpt-6-astra", max_output_tokens: 8192, input: "fixture" })!.maximumUsd < 0.5);
  assert.equal(SCIENTIFIC_DESIGN_CRITIC_PROMPT.max_output_tokens, 8192);
  assert.ok(responseCostBound({ model: "gpt-5.6-sol", max_output_tokens: SCIENTIFIC_DESIGN_CRITIC_PROMPT.max_output_tokens, input: "fixture" })!.maximumUsd > responseCostBound({ model: "gpt-5.6-sol", max_output_tokens: 4096, input: "fixture" })!.maximumUsd, "Reservation includes the configured critic ceiling");
  assert.equal(responseCostBound({ model: "gpt-6-astra", max_output_tokens: 8192, input: [{ type: "input_image", detail: "high" }] }), null, "New text model support does not imply verified vision billing");
  let repairCalls = 0;
  const rejected = await proposeScientificDecision({ projectId: "fixture", runId: "fixture", intake: { topic: "Fixture" }, academicLevel: "MAESTRIA", ledger, provider: { generateStructuredObject: async (request: any) => {
    repairCalls++;
    return request.schemaName.startsWith("design_selector") ? decision : request.schemaName.startsWith("design_repair") ? { replacements: [structuredClone(alternativeV2)], corrected_findings: ["Procedimiento aclarado"], unresolved_findings: [] } : rejectedCritique;
  } } as any });
  assert.equal(repairCalls, 3, "One selector, ONE critic, at most ONE targeted repair");
  assert.equal(rejected.repair_rounds, 1);
  assert.ok(!alternativeIsApprovable(rejected.decision.alternatives[0], rejected.critique));
  const outputCalls: string[] = [];
  const restored = await proposeScientificDecision({ projectId: "fixture", runId: "fixture", intake: { topic: "Fixture" }, academicLevel: "MAESTRIA", ledger, provider: { generateStructuredObject: async (request: any) => {
    outputCalls.push(request.schemaName);
    if (request.schemaName.startsWith("design_selector")) throw new IncompleteStructuredOutputError('{"alternatives":[', "max_output_tokens");
    return request.schemaName.startsWith("design_repair") ? structuredClone(decision) : critique;
  } } as any });
  assert.deepEqual(outputCalls, ["design_selector_0", "design_repair_1", "design_critic_0"]);
  assert.equal(restored.repair_rounds, 1);
  const criticRecoveryCalls: string[] = [];
  const recoveredCritic = await proposeScientificDecision({ projectId: "fixture", runId: "critic-recovery", intake: { topic: "Fixture" }, academicLevel: "MAESTRIA", ledger, provider: { generateStructuredObject: async (request: any) => {
    criticRecoveryCalls.push(request.schemaName);
    if (request.schemaName.startsWith("design_selector")) return decision;
    if (request.schemaName === "design_critic_0") throw new IncompleteStructuredOutputError(JSON.stringify(critique), "max_output_tokens");
    return critique;
  } } as any });
  assert.deepEqual(criticRecoveryCalls, ["design_selector_0", "design_critic_0", "design_critic_recovery_1"]);
  assert.deepEqual(recoveredCritic.critic_completion, { first: "INCOMPLETE_TOKEN_LIMIT", recovery: "COMPLETE", recoveryCalls: 1 });
  const twiceIncomplete: string[] = [];
  await assert.rejects(() => proposeScientificDecision({ projectId: "fixture", runId: "critic-fails-closed", intake: { topic: "Fixture" }, academicLevel: "MAESTRIA", ledger, provider: { generateStructuredObject: async (request: any) => {
    twiceIncomplete.push(request.schemaName);
    if (request.schemaName.startsWith("design_selector")) return decision;
    throw new IncompleteStructuredOutputError(JSON.stringify(critique), "max_output_tokens");
  } } as any }), /SCIENTIFIC_CRITIC_INCOMPLETE_TOKEN_LIMIT/);
  assert.deepEqual(twiceIncomplete, ["design_selector_0", "design_critic_0", "design_critic_recovery_1"], "A valid-looking partial JSON cannot pass and recovery never reruns the selector");
  let closureCalls = 0;
  await assert.rejects(() => critiqueScientificDecision({ projectId: "fixture", runId: "critic-global-cap", intent, pack, decision, allowRecovery: false, provider: { generateStructuredObject: async () => { closureCalls++; throw new IncompleteStructuredOutputError("{}", "max_output_tokens"); } } as any }), /SCIENTIFIC_CRITIC_INCOMPLETE_TOKEN_LIMIT/);
  assert.equal(closureCalls, 1, "An evaluation-wide cap may disable recovery without weakening production's one-recovery default");
  const insufficient = structuredClone(ledger); insufficient.semantic_extractions = [];
  await assert.rejects(() => proposeScientificDecision({ projectId: "fixture", runId: "fixture", intake: {}, academicLevel: "MAESTRIA", ledger: insufficient, provider: { generateStructuredObject: async () => { throw new Error("Must not call provider"); } } as any }), /INSUFFICIENT_EVIDENCE/);

  const user = await prisma.user.create({ data: { email: `rc4-design-${Date.now()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `rc4-design-other-${Date.now()}@example.test` } });
  await grantTestPackage(user.id);
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
    assert.equal(await prisma.blueprintJobStage.count({ where: { jobId: job.id, stageKey: { startsWith: "archive:design-revision-1:" } } }), 7, "Includes the paid selector response envelope for safe replay");
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
  } finally { await removeTestCommercialData([user.id, other.id]); await prisma.user.delete({ where: { id: user.id } }); await prisma.user.delete({ where: { id: other.id } }); await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
