import assert from "node:assert/strict";
import { z } from "zod";
import { applyMethodReconstruction, resolveMethodCoverage, methodCoverageAssessmentSchema, methodologicalReconstructionSchema } from "../server/mvp/method-coverage-resolution";
import { methodCoverageCritiqueProposalSchema, methodCoverageMatrixProposalSchema, type MethodCoverageMatrix } from "../server/mvp/method-coverage-contracts";
import { designAlternativeV2Schema } from "../server/mvp/scientific-decision-contracts";
import type { ScientificDecisionBundle } from "../server/mvp/scientific-decision-service";
import type { LlmProvider, StructuredObjectInput } from "../llm/provider";
import { fixture, critiqueFor, intent } from "./test-method-coverage";
import { responseCostBound } from "../llm/providers/openai-cost-bound";
import type { DesignSupportSource } from "../server/mvp/design-support-addendum";

const data = fixture(["EMPIRICAL_QUANTITATIVE", "EMPIRICAL_QUALITATIVE", "EMPIRICAL_MIXED_METHODS"]);
const original = designAlternativeV2Schema.parse({
  id: "A1", label: "Síntesis documental de corpus heterogéneo", scope_fulfilled: intent.scope,
  primary_method: "Síntesis documental", scope_effect: "preserves", scope_change_impact: null,
  definition: { problem: intent.problem, questions: [{ id: "Q1", text: "¿Qué condiciones y límites describe la evidencia?", kind: "general" }],
    objectives: [{ id: "O1", text: "Sintetizar condiciones y límites documentados.", question_ids: ["Q1"] }], hypotheses_or_propositions: [] },
  research_design: { paradigm: "Pragmatismo metodológico delimitado", approach: "other", design: "Síntesis documental propuesta",
    unit_population_corpus: intent.unit_population_corpus, sampling_selection: "Selección transparente y pertinente al alcance.",
    constructs: [{ id: "C1", name: "Condiciones y límites", kind: "category", dimensions_indicators: [], operational_definition: "Condiciones documentadas, sin inferencia causal nueva." }],
    data_material_sources: [intent.unit_population_corpus], techniques: ["Extracción trazable"], instruments: ["Tabla de extracción por tipo de fuente"],
    procedure: ["Clasificar cada fuente antes de interpretarla."], analysis_method: "Síntesis por diseños y contraste entre clases.",
    quality_criteria: ["Trazabilidad de cada afirmación y revisión de discrepancias."], ethical_considerations: ["Respetar acceso autorizado a documentos."],
    assumptions: [], limitations: ["El corpus final se determinará durante la tesis."], pending_decisions: [],
    methodological_support: [{ source_id: "M1", evidence_id: "P1" }] },
  components: [{ name: "Síntesis documental", kind: "method", role: "Integrar evidencia sin perder sus diferencias.", inputs: ["Corpus"], outputs: ["Síntesis"], dependencies: [], support: [{ source_id: "M1", evidence_id: "P1" }] }],
  scope_changes: [], applicability_conditions: ["Verificar disponibilidad de los documentos."], baselines_or_comparisons: [], transfer_limits: ["No afirmar efectos causales nuevos."],
  feasibility: "Propuesta sujeta a disponibilidad documental.", discarded_alternative_reasons: [], qualitative_component: null, quantitative_component: null,
  integration_strategy: "Integración comparativa delimitada.", integration_purpose: "Interpretar diferencias y convergencias sin sumar medidas incompatibles.",
  method_handoffs: [], data_requirements: [{ description: "Documentos pertinentes por localizar durante la tesis.", availability: "PENDING", confirmation_or_action: "Verificar acceso durante la ejecución." }],
  pending_user_decisions: [],
});
const bundle = {
  intent, evidence_pack: data.pack, decisionFingerprint: "decision-fixture", contextFingerprint: "frozen-fixture", academicLevel: "MAESTRIA",
  decision: { alternatives: [original], recommended_id: "A1", recommendation_rationale: "Fixture sintético", clarification_questions: [] },
  critique: { assessments: [{ alternative_id: "A1", evidence_support: "PASS_WITH_LIMITATIONS",
    critical_findings: [{ code: "NOV", severity: "WARNING", affected_field: "novelty", issue: "No se acredita novedad absoluta.", required_action: "Cualificar la contribución.", evidence_or_reason: "No se inspeccionó toda la literatura." },
      { code: "METHOD", severity: "WARNING", affected_field: "methodological_support", issue: "Comprobar respaldo por operación.", required_action: "Criticar cada operación y sus límites.", evidence_or_reason: "La validez puede ser composicional." }] }] },
} as unknown as ScientificDecisionBundle;
const matrixProposal = (matrix: MethodCoverageMatrix) => ({ corpusClasses: matrix.corpusClasses, crossClassIntegration: matrix.crossClassIntegration });
const reconstructed = {
  id: "A1-R1", primaryMethod: original.primary_method, label: "Arquitectura metodológica reconstruida",
  researchDesign: (({ unit_population_corpus: _a, constructs: _b, data_material_sources: _c, ...design }) => design)(original.research_design),
  methodComponents: original.components, qualitativeComponent: null, quantitativeComponent: null,
  integrationStrategy: original.integration_strategy, integrationPurpose: original.integration_purpose,
  methodHandoffs: original.method_handoffs, feasibility: original.feasibility,
  dataRequirements: original.data_requirements, limitations: ["La cobertura observada no representa el corpus final."],
  rationale: "Métodos adecuados por clase, sin alterar alcance ni preguntas.", coverageProposal: matrixProposal(data.matrix),
};
function reviewProposal(matrix: MethodCoverageMatrix) {
  const { version: _v, profileFingerprint: _p, effectiveEvidenceFingerprint: _e, ...value } = critiqueFor(matrix);
  value.findingAssessments.push({ code: "METHOD", category: "EVIDENCE_CLAIM_LIMITATION", methodValidityImpact: false,
    reason: "El fixture simula validación de cada operación.", retainedPlanTreatment: "Mantener límites por fuente y por operación." });
  return value;
}
function strictSchema(schema: unknown): void {
  if (schema === null || typeof schema !== "object") return;
  const node = schema as Record<string, unknown>;
  if (node.type === "object") {
    assert.equal(node.additionalProperties, false);
    assert.deepEqual(new Set(node.required as string[]), new Set(Object.keys(node.properties as object)));
  }
  Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(strictSchema) : strictSchema(value));
}
for (const schema of [methodCoverageAssessmentSchema, methodologicalReconstructionSchema, methodCoverageCritiqueProposalSchema]) strictSchema(z.toJSONSchema(schema));

function providerFor(mode: "PASS" | "CONDITIONAL" | "REJECT_CLASSIFICATION" | "NEW_SUPPORT" | "REJECT_METHOD") {
  const calls: StructuredObjectInput[] = [];
  const provider = {
    name: "offline-method-coverage-fixture",
    estimateStructuredRequest: async () => responseCostBound({ model: "gpt-6-astra", max_output_tokens: 100 }, 1000)!,
    generateStructuredObject: async <T>(request: StructuredObjectInput): Promise<T> => {
      assert.equal(request.maxRetries, 0);
      strictSchema(request.schema);
      calls.push(request);
      const context = JSON.parse(request.prompt.split("CONTEXTO VERIFICABLE:\n")[1]);
      if (request.schemaName === "method_coverage_assessment_v1") {
        assert.deepEqual(context.userSelectedSourceIds, data.pack.selected_sources.map(source => source.source_id));
        assert.ok(Array.isArray(context.systemDesignSupportSourceIds));
        assert.ok(context.systemDesignSupportSourceIds.every((id: string) => !context.userSelectedSourceIds.includes(id)));
        assert.equal(request.trackingAttribution?.promptVersion, "method-coverage-assessment.v2");
        const matrix = structuredClone(data.matrix);
        if (mode === "NEW_SUPPORT") {
          matrix.corpusClasses[0].operations[0].coverageStatus = "UNSUPPORTED";
          matrix.corpusClasses[0].operations[0].supportPointers = [];
        }
        return { corpusProposal: data.proposal, coverageProposal: matrixProposal(matrix), researchQuestions: mode === "NEW_SUPPORT"
          ? [{ cellIds: [matrix.corpusClasses[0].operations[0].cellId], question: "¿Cómo extraer condiciones de estudios cuantitativos?", rationale: "La operación no tiene aún respaldo procedimental." }] : [] } as T;
      }
      if (request.schemaName.startsWith("method_reconstruction_v1_")) {
        const patch = structuredClone(reconstructed);
        if (mode === "NEW_SUPPORT") {
          assert.ok(context.evidence.passages.some((passage: { source_id: string }) => passage.source_id === "DS-new-fixture"));
          patch.coverageProposal.corpusClasses[0].operations[0].supportPointers = [{ source_id: "DS-new-fixture", evidence_id: "DS-new-fixture:P1" }];
        }
        return { alternatives: [patch], selectedId: "A1-R1", selectionRationale: "Conservar alcance con operaciones metodológicas explícitas." } as T;
      }
      if (request.schemaName.startsWith("method_coverage_critic_v1_")) {
        const review = reviewProposal(context.coverageMatrix);
        if (mode === "NEW_SUPPORT") assert.ok(context.evidence.passages.some((passage: { source_id: string }) => passage.source_id === "DS-new-fixture"));
        if (mode === "CONDITIONAL") {
          review.cellAssessments[0].coverageStatus = "CONDITIONALLY_SUPPORTED";
          review.cellAssessments[0].futureRequirements = ["Verificar disponibilidad del corpus antes de extraerlo."];
        }
        if (mode === "REJECT_CLASSIFICATION") review.corpusClassificationValid = false;
        if (mode === "REJECT_METHOD") {
          review.methodCoherent = false;
          review.blockingScientificIssue = true;
          review.blockingReason = "El procedimiento es incompatible con el propósito del fixture.";
        }
        return review as T;
      }
      throw new Error(`Unexpected mock request: ${request.schemaName}`);
    },
  } as unknown as LlmProvider;
  return { provider, calls };
}
async function run() {
  global.fetch = async () => { throw new Error("Offline regression forbids network"); };
  const before = JSON.stringify(bundle);
  const pass = providerFor("PASS");
  let searches = 0;
  const forbidSearch = async () => { searches++; throw new Error("Unexpected methodological search"); };
  const resolved = await resolveMethodCoverage(bundle, { userId: "fixture-user", projectId: "fixture-project", runId: "fixture-run", inheritedSupport: [],
    provider: pass.provider, researchSupport: forbidSearch });
  assert.equal(pass.calls.length, 3, "One assessment, one method reconstruction, one independent critic");
  assert.equal(searches, 0, "Existing sufficient support does not trigger new discovery");
  assert.equal(resolved.targetedReview.evidenceSupported, true);
  assert.equal(resolved.alternative.pending_user_decisions.length, 0);
  assert.equal(resolved.alternative.research_design.pending_decisions.length, 0);
  assert.deepEqual(resolved.alternative.definition, original.definition);
  assert.equal(resolved.alternative.scope_fulfilled, original.scope_fulfilled);
  assert.equal(JSON.stringify(bundle), before, "Frozen evidence and decision remain immutable");
  const patchCtx = JSON.parse(pass.calls[1].prompt.split("CONTEXTO VERIFICABLE:\n")[1]);
  const criticCtx = JSON.parse(pass.calls[2].prompt.split("CONTEXTO VERIFICABLE:\n")[1]);
  assert.equal(patchCtx.evidence.effectiveEvidenceFingerprint, criticCtx.evidence.effectiveEvidenceFingerprint);
  assert.equal(patchCtx.evidence.digestFingerprint, criticCtx.evidence.digestFingerprint);
  assert.equal(resolved.methodCoverage.effectiveEvidenceFingerprint, resolved.supportAddendum.checksum);
  assert.ok(resolved.alternative.research_design.methodological_support.length >= original.research_design.methodological_support.length);

  const conditional = providerFor("CONDITIONAL");
  const conditionalResult = await resolveMethodCoverage(bundle, { userId: "fixture-user", projectId: "fixture-project", runId: "fixture-run", inheritedSupport: [],
    provider: conditional.provider, researchSupport: forbidSearch });
  assert.equal(conditionalResult.methodCoverage.corpusClasses[0].operations[0].coverageStatus, "CONDITIONALLY_SUPPORTED", "Independent conditions must survive into the effective design");
  assert.ok(conditionalResult.methodCoverage.corpusClasses[0].operations[0].futureRequirements.length);

  for (const mode of ["REJECT_CLASSIFICATION", "REJECT_METHOD"] as const) {
    const rejected = providerFor(mode);
    await assert.rejects(() => resolveMethodCoverage(bundle, { userId: "fixture-user", projectId: "fixture-project", runId: "fixture-run", inheritedSupport: [],
      provider: rejected.provider, researchSupport: forbidSearch }), /AUTONOMOUS_DESIGN_UNRESOLVED/);
    assert.equal(rejected.calls.length, 3, "A rejection unrelated to missing support must not repeat completed calls");
  }

  const newSupport = providerFor("NEW_SUPPORT");
  let gapSearches = 0;
  const supported = await resolveMethodCoverage(bundle, { userId: "fixture-user", projectId: "fixture-project", runId: "fixture-run", inheritedSupport: [], provider: newSupport.provider,
    researchSupport: async input => {
      gapSearches++;
      assert.equal(input.methodCoverage?.ordinal, 1);
      assert.deepEqual(input.methodCoverage?.cellIds, ["EMPIRICAL_QUANTITATIVE:DATA_EXTRACTION"]);
      const source: DesignSupportSource = { sourceId: "DS-new-fixture", gapId: input.gaps![0].gapId, title: "Guía metodológica sintética", authors: [], year: null, doi: null,
        provenance: "SYSTEM_DESIGN_SUPPORT", observationIds: ["completed-observation-fixture"], document: {
          observedUrl: "https://example.org/method", finalUrl: "https://example.org/method", mediaType: "text/html", sha256: "a".repeat(64), title: "Guía metodológica sintética",
          passages: [{ text: "El procedimiento de extracción debe registrar los resultados, sus denominadores y las condiciones de medición, manteniendo unidades y límites de interpretación para no combinar cantidades incompatibles.", page: null, locator: "section:extraction:paragraph:1" }],
        } };
      return { status: "VERIFIED_SUPPORT", support: [source], operations: [], limitations: [], acquiredDocuments: 1 };
    } });
  assert.equal(gapSearches, 1);
  assert.equal((supported.researchAudit[0] as { acquiredDocuments: number }).acquiredDocuments, 1);
  assert.equal(newSupport.calls.length, 3);
  assert.equal(supported.supportAddendum.sources[0].provenance, "SYSTEM_DESIGN_SUPPORT");
  assert.ok(supported.alternative.research_design.methodological_support.some(pointer => pointer.source_id === "DS-new-fixture"));
  assert.equal(JSON.stringify(bundle), before);
  const inherited = providerFor("PASS");
  await resolveMethodCoverage(bundle, { userId: "fixture-user", projectId: "fixture-project", runId: "fixture-inherited",
    inheritedSupport: supported.supportAddendum.sources, provider: inherited.provider, researchSupport: forbidSearch });
  const inheritedContext = JSON.parse(inherited.calls[0].prompt.split("CONTEXTO VERIFICABLE:\n")[1]);
  assert.deepEqual(inheritedContext.systemDesignSupportSourceIds, ["DS-new-fixture"]);
  assert.ok(!inheritedContext.userSelectedSourceIds.includes("DS-new-fixture"), "Inherited methodology never becomes selected corpus");

  // Two documents can be downloaded while only one (or none) is admitted.
  // Across operations count those bytes, not the size of the accepted-source list.
  const rejectedSupport = providerFor("NEW_SUPPORT");
  const originalMock = rejectedSupport.provider.generateStructuredObject.bind(rejectedSupport.provider);
  rejectedSupport.provider.generateStructuredObject = async <T>(request: StructuredObjectInput): Promise<T> => {
    const output = await originalMock<Record<string, any>>(request);
    if (request.schemaName.startsWith("method_coverage_critic_")) {
      const cell = output.cellAssessments.find((row: { cellId: string }) => row.cellId === "EMPIRICAL_QUANTITATIVE:DATA_EXTRACTION");
      cell.coverageStatus = "UNSUPPORTED"; cell.transferSupported = false;
      cell.reason = "Los documentos adquiridos no acreditan esta operación.";
    }
    return output as T;
  };
  let acquiredOperations = 0;
  await assert.rejects(() => resolveMethodCoverage(bundle, { userId: "fixture-user", projectId: "fixture-project", runId: "fixture-run", inheritedSupport: [],
    provider: rejectedSupport.provider, maxResearchOperations: 4, researchSupport: async input => {
      acquiredOperations++;
      assert.equal(input.methodCoverage?.documentAllowance, acquiredOperations === 1 ? 4 : 2);
      const source = structuredClone(supported.supportAddendum.sources[0]);
      source.gapId = input.gaps![0].gapId;
      return { status: "VERIFIED_SUPPORT", support: acquiredOperations === 1 ? [source] : [], operations: [], limitations: [], acquiredDocuments: 2 };
    } }), /AUTONOMOUS_DESIGN_UNRESOLVED/);
  assert.equal(acquiredOperations, 2, "Four acquired documents exhaust the job limit even if only one was admitted");

  const pending = structuredClone(reconstructed); pending.researchDesign.pending_decisions = ["Elegir metodología con el usuario."];
  const parsedPending = methodologicalReconstructionSchema.shape.alternatives.element.parse(pending);
  assert.equal("pending_decisions" in parsedPending.researchDesign, false, "The provider contract cannot request another user decision");
  assert.equal(applyMethodReconstruction(bundle, parsedPending, data.pack).research_design.pending_decisions.length, 0);
  console.log("Method coverage resolver: PASS (mocked scientific contracts; no provider, DB or scientific acceptance claim).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
