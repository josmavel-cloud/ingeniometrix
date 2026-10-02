import { grantTestPackage, removeTestCommercialData } from "./fixtures/commercial";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accountDecisionSources, alternativeCanBeConfirmed, alternativeIsApprovable, buildMethodEvidencePack, intentFromIntake, migrateLegacyCritique, migrateLegacyScopeSemantics, validateScientificDecision, validateDesignCritique, type DesignAlternative } from "@/server/mvp/scientific-decision-contracts";
import { approvedDesignForCurrentJob, critiqueScientificDecision, decisionForUser, proposeScientificDecision, resolveAutonomousDesignBundle, resolveAutonomousDesignForJob, selectAutonomousCandidate } from "@/server/mvp/scientific-decision-service";
import { enqueueBlueprintJobForUser, resumeLatestBlueprintJobForUser, runNextBlueprintJobStage, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { generateScientificPlan } from "@/server/mvp/scientific-plan-generation";
import { definition, design, ledger, matrix } from "./test-b3-scientific-contracts";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT } from "@/server/mvp/prompts/scientific-design-critic.v3";
import { prepareSelectedSources } from "@/server/projects/source-preparation-service";
import { confirmEvidenceSet } from "@/server/projects/evidence-set-service";
import { createConversationalProject, readDefinition, changeDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import { fixtureSourceAssessments } from "./fixtures/source-sufficiency-test-context";
import { updateSelectedProjectReferences } from "@/server/retrieval/reference-service";
import { normalizeTitle } from "@/lib/text";
import { generationContextForUser } from "@/server/projects/generation-context-service";
import { designSupportGaps, designSupportMetadataEligible } from "@/server/mvp/design-mini-research";
import { generationCostReport } from "@/server/mvp/generation-cost-report";
import { applyAutonomousDesignPatch, classifyPendingDecision, compactAlternativeForRepair, inScopeAlternatives, resolveNonmaterialDecisions } from "@/server/mvp/autonomous-design-resolution";
import { mandatoryCompositionReservationFloor, wholeJobCostEquation } from "@/server/mvp/whole-job-cost-forecast";
import { evidenceContextForPhase } from "@/server/mvp/generation-budgets";

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
  assert.equal(selectAutonomousCandidate(decision, critique)?.id, alternative.id);
  const scopeChanged = { ...alternativeV2, scope_effect: "narrows" as const, scope_changes: [{ requirement_id: "scope", proposed_change: "Otra población", reason: "Fixture" }] };
  assert.equal(selectAutonomousCandidate({ ...decision, alternatives: [scopeChanged] }, critique), undefined, "A material scope change cannot be auto-approved");
  assert.equal(selectAutonomousCandidate(decision, rejectedCritique), undefined, "A blocking scientific finding cannot be auto-approved");
  assert.equal(classifyPendingDecision("¿Cuál es la población?", "PRESERVED"), "SCOPE_BLOCKING");
  assert.equal(classifyPendingDecision("¿Se dispone de datos?", "PRESERVED"), "FACT_TO_VERIFY_DURING_RESEARCH");
  assert.equal(classifyPendingDecision("¿Qué software usar?", "PRESERVED"), "METHOD_DEFAULTABLE");
  assert.equal(inScopeAlternatives(decision, rejectedCritique).length, 1, "A repairable in-scope alternative remains available");
  assert.equal(inScopeAlternatives({ ...decision, alternatives: [scopeChanged] }, rejectedCritique).length, 0);
  assert.ok(JSON.stringify(compactAlternativeForRepair(alternativeV2)).length < JSON.stringify(alternativeV2).length);
  assert.ok(mandatoryCompositionReservationFloor({ decision, intent, evidence_pack: pack } as any, alternativeV2.id).length === 8);
  assert.equal(wholeJobCostEquation({ knownSpent: 0.4, unknownReserved: 0.9, nextStageReservation: 0.2,
    minimumRemainingMandatoryReservation: 0.4, safetyReserve: 0.25, hardCap: 2 }).allowed, false);
  assert.equal(wholeJobCostEquation({ knownSpent: 0.46472755, unknownReserved: 0.94293750,
    nextStageReservation: 0.401575, minimumRemainingMandatoryReservation: 0.156695 + 0.7924475,
    safetyReserve: 0.25, hardCap: 2 }).allowed, false,
    "The historical unknown reservation cannot be silently reclaimed to make a DOCX path fit");
  assert.equal(evidenceContextForPhase("methodology", [{ section_key: "methodology" }, { section_key: "problem_statement" }]).length, 1);
  const costs = generationCostReport({ entries: [
    { id: "evidence", purpose: "extraction", stage: "EVIDENCE", model: "fixture", actualModel: "fixture", maximum: 0.02, estimate: 0.01, status: "completed", retry: false, usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 } },
    { id: "mini", purpose: "DESIGN_SUPPORT_MINI_RESEARCH", stage: "DESIGN_MINI_RESEARCH_1", model: "fixture", actualModel: null, maximum: 0.03, estimate: null, status: "failed_unknown_usage", retry: false, usage: null },
  ] }, [{ operationId: "separate-mini", estimatedCostUsd: 0.02, reservedCostUsd: 0.04, usage: { inputTokens: 8, outputTokens: 3, reasoningTokens: 1 } }]);
  assert.equal(costs.total.knownCostUsd, 0.03);
  assert.equal(costs.total.unresolvedReservationUsd, 0.03);
  assert.equal(costs.byStage.mini_research.calls, 2);
  const persistedUsage = generationCostReport({ entries: [
    { id: "persisted", purpose: "design_critic_0", stage: "scientific_design", model: "fixture", actualModel: "fixture",
      maximum: 0.2, estimate: 0.09, status: "completed", retry: false,
      usage: { input_tokens: 8065, output_tokens: 2587, output_tokens_details: { reasoning_tokens: 1552 } } },
  ] });
  assert.equal(persistedUsage.byStage.design.inputTokens, 8065);
  assert.equal(persistedUsage.byStage.design.outputTokens, 2587);
  assert.equal(persistedUsage.byStage.design.reasoningTokens, 1552);
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
  const gapBundle = structuredClone(rejected);
  gapBundle.intent.unit_population_corpus = "Corpus sintético";
  gapBundle.critique.assessments[0].critical_findings[0].affected_field = "validation_strategy";
  gapBundle.critique.assessments[0].critical_findings[0].required_action = "Verificar la aplicabilidad del método con una fuente técnica primaria";
  assert.equal(designSupportGaps(gapBundle).length, 1);
  assert.equal(designSupportGaps(gapBundle)[0].maxCandidates, 5);
  const sourceMetadata = { title: "Thematic analysis of interview corpora", abstract: "A methodological evaluation of thematic analysis for interview corpora with explicit validation procedures and documented limitations.", doi: "10.1234/example", venue: "Journal of Methods", observedUrl: "https://example.org/article", requestedUrl: "https://example.org/article", method: "thematic analysis", object: "interview corpora" };
  assert.equal(designSupportMetadataEligible(sourceMetadata), true);
  assert.equal(designSupportMetadataEligible({ ...sourceMetadata, title: "Retail pricing strategy", abstract: "An economic evaluation of retail pricing strategies in supermarkets with explicit sales and inventory metrics from multiple vendors." }), false);
  assert.equal(designSupportMetadataEligible({ ...sourceMetadata, observedUrl: "https://example.org/another" }), false);
  assert.equal(designSupportMetadataEligible({ ...sourceMetadata, doi: null, venue: null }), false);
  const autonomousCalls: string[] = [];
  const nonmaterialDecision = { ...decision, alternatives: [{ ...alternativeV2,
    pending_user_decisions: [{ question: "¿Qué software usar?", blocking: true }] }] };
  const nonmaterialCritique = { assessments: [{ ...critique.assessments[0], decision: "REPAIR_REQUIRED" as const,
    user_decisions_required: ["¿Qué software usar?"], repair_targets: ["pending_user_decisions"] }] };
  const deterministic = resolveNonmaterialDecisions({ decision: nonmaterialDecision, critique: nonmaterialCritique, intent, pack });
  assert.equal(deterministic?.alternative.pending_user_decisions.length, 0);
  assert.equal(deterministic?.reclassified[0].classification, "METHOD_DEFAULTABLE");
  assert.equal(resolveNonmaterialDecisions({ decision, critique: rejectedCritique, intent, pack }), null,
    "Blocking scientific criticism still requires independent repair/review");
  const nonmaterialBundle = { ...rejected, decision: nonmaterialDecision, critique: nonmaterialCritique };
  const noCallResolution = await resolveAutonomousDesignBundle(nonmaterialBundle, { userId: "fixture", projectId: "fixture",
    runId: "deterministic", provider: { generateStructuredObject: async () => { throw new Error("No paid call expected"); } } as any });
  assert.equal(noCallResolution.alternative.pending_user_decisions.length, 0);
  assert.equal(noCallResolution.deterministicResolution?.[0].classification, "METHOD_DEFAULTABLE");
  const smallPatch = { alternativeId: alternativeV2.id, procedure: alternativeV2.research_design.procedure,
    qualityCriteria: alternativeV2.research_design.quality_criteria, dataRequirements: [{ description: "Acceso al corpus por verificar", availability: "PENDING" as const, confirmation_or_action: "Verificar antes de producir datos" }],
    assumptionsAdded: [], validationRequirementsAdded: [], limitationsAdded: ["El acceso aún no está confirmado"], rationale: "Aclaración del criterio sin ampliar alcance",
    resolvedFindingCodes: ["VALIDATION_MISSING"], unresolvedFindingCodes: [] };
  const smallReview = { alternativeId: alternativeV2.id, intentPreserved: true, methodCoherent: true, evidenceSupported: true,
    blockingScientificIssue: false, blockingReason: "", limitations: ["Acceso aún por verificar"], resolvedFindingCodes: ["VALIDATION_MISSING"], unresolvedFindingCodes: [] };
  const applied = applyAutonomousDesignPatch({ decision, critique: rejectedCritique, intent, pack, patch: smallPatch });
  assert.deepEqual(applied.definition, alternativeV2.definition);
  assert.deepEqual(applied.components, alternativeV2.components);
  assert.equal(applied.scope_effect, "preserves");
  assert.ok(applied.data_requirements.some((requirement) => requirement.availability === "PENDING"));
  assert.throws(() => applyAutonomousDesignPatch({ decision: { ...decision, alternatives: [scopeChanged] }, critique: rejectedCritique, intent, pack, patch: smallPatch }), /OUT_OF_SCOPE/);
  assert.throws(() => applyAutonomousDesignPatch({ decision, critique: rejectedCritique, intent, pack,
    patch: { ...smallPatch, dataRequirements: [{ description: "Datos inventados", availability: "USER_CONFIRMED", confirmation_or_action: "No consta" }] } as any }), /invalid_value|Invalid option|USER_CONFIRMED/i);
  const resolvedBundle = await resolveAutonomousDesignBundle(rejected, { userId: "fixture", projectId: "fixture", runId: "fixture",
    researchSupport: async () => { throw new Error("Mini research is not the default resolver"); },
    provider: { generateStructuredObject: async (request: any) => {
      autonomousCalls.push(request.schemaName);
      return request.schemaName === "autonomous_design_patch_v1" ? smallPatch : smallReview;
    } } as any });
  assert.deepEqual(autonomousCalls, ["autonomous_design_patch_v1", "autonomous_design_targeted_critic_v1"]);
  assert.equal(resolvedBundle.revised, true);
  assert.equal(resolvedBundle.alternative.pending_user_decisions.length, 0);
  assert.ok(resolvedBundle.alternative.transfer_limits.includes("Acceso aún por verificar"));
  let unsafeCalls = 0;
  await assert.rejects(() => resolveAutonomousDesignBundle(rejected, { userId: "fixture", projectId: "fixture", runId: "unsafe",
    researchSupport: async () => ({ status: "NOT_NEEDED", support: [], limitations: [], operations: [] }),
    provider: { generateStructuredObject: async (request: any) => {
      unsafeCalls++;
      return request.schemaName === "autonomous_design_patch_v1" ? smallPatch : { ...smallReview, blockingScientificIssue: true, blockingReason: "Criterio no sustentado" };
    } } as any }), /AUTONOMOUS_DESIGN_UNRESOLVED/);
  assert.equal(unsafeCalls, 2, "A failed independent critique cannot trigger an unbounded revision debate");
  const oversized = structuredClone(rejected);
  const cited = alternativeV2.research_design.methodological_support[0];
  const citedEvidence = oversized.evidence_pack.items.find((item) => item.source_id === cited.source_id && item.evidence_id === cited.evidence_id)!;
  citedEvidence.summary = "Contexto científico intacto. ".repeat(2000);
  let oversizedCalls = 0;
  await assert.rejects(() => resolveAutonomousDesignBundle(oversized, { userId: "fixture", projectId: "fixture", runId: "oversized",
    provider: { generateStructuredObject: async () => { oversizedCalls++; throw new Error("Should not dispatch"); } } as any }), /AUTONOMOUS_PATCH_CONTEXT_TOO_LARGE/);
  assert.equal(oversizedCalls, 0, "oversized scientific context is not silently truncated or billed");
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
  const referenceIds: string[] = [];
  try {
    const created = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Feedback in digital mathematics", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    const view = (await readDefinition(user.id, created.id))!;
    const edited = await changeDefinition(user.id, created.id, { requestId: randomUUID(), baseRevision: view.revision,
      etag: view.etag, action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics", knowledge: "KNOWN" } });
    await confirmDefinition(user.id, created.id, edited.revision, edited.definitionHash);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: created.id }, include: { intake: true } });
    for (const index of [1, 2, 3]) {
      const title = `Evidencia sintética de aprendizaje ${index}`;
      const reference = await prisma.reference.create({ data: { title, normalizedTitle: normalizeTitle(title), authorsJson: ["Autor sintético"],
        abstract: `Estudio sintético ${index} sobre experiencias de aprendizaje digital.`, year: 2020 + index } });
      referenceIds.push(reference.id);
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id, selected: false, sourceProvider: "SYSTEM", relevanceScore: 50 } });
    }
    await fixtureSourceAssessments(user.id, project.id, referenceIds);
    await updateSelectedProjectReferences(user.id, project.id, referenceIds);
    await prepareSelectedSources(user.id, project.id);
    await confirmEvidenceSet(user.id, project.id);
    const expectedContext = await generationContextForUser(user.id, project.id);
    const testLedger = structuredClone(ledger); testLedger.project_id = project.id; testLedger.source_registry[0].reference_id = referenceIds[0]; testLedger.references[0].reference_id = referenceIds[0];
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
      resolve: resolveAutonomousDesignForJob,
      generate: async ({ runId }) => {
        const approved = await approvedDesignForCurrentJob(project.intake, testLedger);
        assert.ok(approved);
        const result = await generateScientificPlan({ provider, projectId: project.id, runId, intake: project.intake, ledger: testLedger, artifactDir: dir, approvedDesign: approved });
        assert.deepEqual(result.definition, definition); assert.deepEqual(result.design, design);
        throw new Error("PDF_SYNTHETIC_PRESENTATION_FAILURE");
      },
    };
    const operationId = randomUUID();
    const job = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", expectedContext, operationId });
    await runNextBlueprintJobStage(job.id, executor);
    await runNextBlueprintJobStage(job.id, executor);
    const designed = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(designed.job?.status, "WAITING_NEXT_STAGE");
    assert.equal(designed.job?.currentStage, "resolving_design");
    assert.equal(scienceCalls, 0);
    assert.equal((await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", expectedContext, operationId })).id, job.id);
    await prisma.blueprintJob.update({ where: { id: job.id }, data: { status: "WAITING_USER_DECISION", currentStage: "awaiting_design_approval" } });
    const recovery = await resumeLatestBlueprintJobForUser(user.id, project.id);
    assert.equal(recovery.state, "autonomous_recovery_scheduled");
    assert.equal(recovery.job.currentStage, "resolving_design");
    const replay = await resumeLatestBlueprintJobForUser(user.id, project.id);
    assert.equal(replay.state, "already_scheduled", "Second owner visit cannot duplicate the recovery");
    const resolved = await runNextBlueprintJobStage(job.id, executor);
    assert.equal(resolved.job?.status, "WAITING_NEXT_STAGE");
    assert.equal(resolved.job?.currentStage, "generating_plan");
    assert.equal(selectorCalls, 1); assert.equal(criticCalls, 1); assert.equal(step5Calls, 1);
    assert.equal((await decisionForUser(user.id, project.id, job.id)).decision, null, "No post-Sources approval is presented");
    await assert.rejects(() => decisionForUser(other.id, project.id, job.id));
    await runNextBlueprintJobStage(job.id, executor);
    assert.equal(scienceCalls, 10, "Autonomous design replaces post-Sources questions and approval");
    const after = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(after.status, "FAILED");
    assert.equal(await prisma.blueprintJobStage.count({ where: { jobId: job.id, stageKey: "checkpoint:AUTONOMOUS_DESIGN", status: "COMPLETED" } }), 1);
    console.log("PASS RC4 scientific decision: model/effort contract, evidence pointers, automatic in-scope resolution and checkpoint consumption; mocked only, paid calls=0.");
  } finally { await removeTestCommercialData([user.id, other.id]); await prisma.user.delete({ where: { id: user.id } }); await prisma.user.delete({ where: { id: other.id } }); for (const id of referenceIds) await prisma.reference.deleteMany({ where: { id } }); await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
