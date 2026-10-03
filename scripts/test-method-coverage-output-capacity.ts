import assert from "node:assert/strict";
import { CORPUS_CLASSES, methodCoverageCells, methodCoverageCritiqueProposalSchema, buildCorpusMethodProfile } from "../server/mvp/method-coverage-contracts";
import { methodCoverageAssessmentSchema, methodologicalReconstructionSchema } from "../server/mvp/method-coverage-resolution";
import { METHOD_COVERAGE_ASSESSMENT_PROMPT as assessmentPrompt, METHOD_RECONSTRUCTION_PROMPT as reconstructionPrompt, METHOD_COVERAGE_CRITIC_PROMPT as criticPrompt } from "../server/mvp/prompts/method-coverage.v1";
import { fixture, critiqueFor, intent } from "./test-method-coverage";

// Capacity fixtures are contracts, not model outputs or scientific acceptance.
// Live incomplete assessment: 8192 output tokens included 4142 reasoning and
// 4050 emitted text tokens. The partial corpus alone occupied 18186 characters;
// the required method matrix had not started. Never accept that partial output.
const observedReasoningTokens = 4142;
const reasoningAllowance = Math.ceil(observedReasoningTokens * 1.5);
const largest = fixture([...CORPUS_CLASSES]);
for (const cell of methodCoverageCells(largest.matrix)) {
  cell.strategy = `Procedimiento explícito de ${cell.operation}: registrar unidad, contexto, resultados y límites; conservar trazabilidad y resolver discrepancias sin combinar observaciones incompatibles.`;
  cell.applicabilityJustification = "La guía respalda esta operación; su aplicación requiere verificar el tipo de documento y conservar las limitaciones de transferencia al contexto confirmado.";
  cell.assumptions = ["La tesis dispondrá de documentos obtenidos por vías autorizadas."];
  cell.futureRequirements = ["Verificar disponibilidad y registrar decisiones durante la ejecución."];
  cell.limitations = ["La propuesta no acredita datos recogidos ni inferencias causales nuevas."];
}
const coverageProposal = { corpusClasses: largest.matrix.corpusClasses, crossClassIntegration: largest.matrix.crossClassIntegration };
const assessment = methodCoverageAssessmentSchema.parse({ corpusProposal: largest.proposal, coverageProposal,
  researchQuestions: largest.matrix.corpusClasses.slice(0, 4).map(row => ({ cellIds: row.operations.map(cell => cell.cellId),
    question: `¿Qué procedimientos fundamentan extracción, valoración y síntesis de ${row.classId} dentro del alcance confirmado?`, rationale: "Una pregunta metodológica acotada debe resolver operaciones relacionadas; no se supone búsqueda nueva necesaria." })) });
const alternative = (id: string) => ({ id, primaryMethod: "Síntesis documental heterogénea", label: "Métodos por clase con integración explícita",
  researchDesign: { paradigm: "Pragmatismo delimitado", approach: "other", design: "Síntesis documental comparativa", sampling_selection: "Selección conforme al alcance confirmado.",
    techniques: ["Extracción por clase", "Contraste entre clases"], instruments: ["Tabla de extracción y evaluación"], procedure: ["Clasificar fuentes con trazabilidad.", "Aplicar operaciones por clase y registrar discrepancias."],
    analysis_method: "Síntesis por clase seguida de integración limitada a afirmaciones comparables.", quality_criteria: ["Evidencia verificable y discrepancias documentadas."],
    ethical_considerations: ["Acceso autorizado y respeto de autoría."], assumptions: ["La adquisición futura requiere disponibilidad autorizada."], limitations: ["No se acredita novedad absoluta."], methodological_support: [{source_id: "M1", evidence_id: "P1"}] },
  methodComponents: [{ name: "Síntesis por clases", kind: "method", role: "Integración que conserva heterogeneidad.", inputs: ["Corpus clasificado"], outputs: ["Síntesis trazable"], dependencies: [], support: [{source_id: "M1", evidence_id: "P1"}] }],
  qualitativeComponent: "Interpretar argumentos con contexto.", quantitativeComponent: "Conservar denominadores y comparabilidad.", integrationStrategy: "Comparar sin sumar evidencia incompatible.", integrationPurpose: "Identificar condiciones y límites.",
  methodHandoffs: [{from: "Extracción", to: "Síntesis", transferred_output: "Registros trazables", use_by_next_method: "Comparación delimitada"}], feasibility: "Sujeta a disponibilidad documental.",
  dataRequirements: [{ description: "Corpus futuro pertinente.", availability: "PENDING", confirmation_or_action: "Verificar durante la tesis." }], limitations: ["No se presumen datos nuevos."], rationale: "Conservar alcance con operaciones respaldadas.", coverageProposal });
const reconstruction = methodologicalReconstructionSchema.parse({ alternatives: [alternative("A1-R1"), alternative("A2")], selectedId: "A1-R1", selectionRationale: "Seleccionar la alternativa sustentada sin cambiar alcance." });
const {version: _v, profileFingerprint: _p, effectiveEvidenceFingerprint: _e, ...reviewValue} = critiqueFor(largest.matrix);
reviewValue.findingAssessments = Array.from({length: 10}, (_, index) => ({ code: `F${index}`, category: "EVIDENCE_CLAIM_LIMITATION" as const, methodValidityImpact: false,
  reason: "El respaldo procede del pasaje citado y debe conservar sus restricciones de transferencia.", retainedPlanTreatment: "Explicitar el alcance de la afirmación y mantener las verificaciones futuras." }));
const review = methodCoverageCritiqueProposalSchema.parse(reviewValue);
const measurements = [
  ["assessment", assessment, assessmentPrompt.max_output_tokens],
  ["reconstruction_two_alternatives", reconstruction, reconstructionPrompt.max_output_tokens],
  ["independent_critic", review, criticPrompt.max_output_tokens],
].map(([stage, value, cap]) => {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  // LOCAL_ESTIMATE only: conservative 3.5 UTF-8 bytes/token (live text ratio
  // was >4.4 characters/token). No exact-provider-count claim or network call.
  const estimatedTextTokens = Math.ceil(bytes / 3.5);
  const estimateIncludingReasoning = estimatedTextTokens + reasoningAllowance;
  assert.ok(estimateIncludingReasoning * 1.2 <= Number(cap), `${stage}: bytes=${bytes}, local estimate=${estimatedTextTokens}, reasoning=${reasoningAllowance}, needs cap=${Math.ceil(estimateIncludingReasoning * 1.2)}`);
  return { stage, bytes, provenance: "LOCAL_ESTIMATE", estimatedTextTokens, reasoningAllowance, estimateIncludingReasoning, cap, headroom: Number(cap) - estimateIncludingReasoning };
});
// Primary mixed work + secondary quantitative component must not invent a
// quantitative-only observed work; broad future eligibility remains intact.
const mixed = fixture(["EMPIRICAL_MIXED_METHODS"]);
mixed.proposal.sourceAssignments[0].componentClasses = ["EMPIRICAL_QUANTITATIVE"];
mixed.proposal.classes.push({ ...mixed.proposal.classes[0], classId: "EMPIRICAL_QUANTITATIVE", presence: "CONTINGENT",
  basis: [{ kind: "FROZEN_INTENT", field: "scope", source_id: null, evidence_id: null, quote: intent.scope, rationale: "El corpus amplio admite obras futuras; ninguna seleccionada tiene este diseño principal." }],
  limitations: ["Los componentes cuantitativos observados no acreditan una obra cuantitativa independiente."] });
const profile = buildCorpusMethodProfile({intent, pack: mixed.pack, frozenInputFingerprint: "fixture", proposal: mixed.proposal});
assert.equal(profile.observedClassCounts.EMPIRICAL_MIXED_METHODS, 1);
assert.equal(profile.observedClassCounts.EMPIRICAL_QUANTITATIVE, 0);
const invalidPresence = structuredClone(mixed.proposal); invalidPresence.classes[1].presence = "OBSERVED";
assert.throws(() => buildCorpusMethodProfile({intent, pack: mixed.pack, frozenInputFingerprint: "fixture", proposal: invalidPresence}), /PRESENCE_CONTRADICTION/);
const fakeSupportAssignment = structuredClone(mixed.proposal); fakeSupportAssignment.sourceAssignments.push({...fakeSupportAssignment.sourceAssignments[0], sourceId: "M1"});
assert.throws(() => buildCorpusMethodProfile({intent, pack: mixed.pack, frozenInputFingerprint: "fixture", proposal: fakeSupportAssignment}), /SELECTED_SOURCE_COVERAGE_MISMATCH/);
console.log(JSON.stringify({status: "PASS", observedOutputTokens: 8192, observedReasoningTokens, classCount: CORPUS_CLASSES.length, cellsPerMatrix: 33, measurements}, null, 2));
