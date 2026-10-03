import assert from "node:assert/strict";
import {
  CORPUS_CLASSES, CLASS_METHOD_OPERATIONS, buildCorpusMethodProfile, buildUnresolvedMethodCoverageMatrix,
  buildMethodCoverageMatrix, methodCoverageGaps, validateMethodCoverageMatrix, methodCoverageCells,
  validateMethodCoverageCritique, bindMethodCoverageCritique, corpusMethodProfileProposalSchema,
  methodCoverageMatrixProposalSchema, methodCoverageCritiqueProposalSchema,
  type CorpusClassId, type CorpusMethodProfileProposal, type MethodCoverageMatrix,
} from "../server/mvp/method-coverage-contracts";
import type { MethodEvidencePack, ResearchIntentContract } from "../server/mvp/scientific-decision-contracts";
import { z } from "zod";

const broadCorpus = "Publicaciones académicas relevantes al objeto y propósito confirmados, sin exclusión por tipo de diseño.";
export const intent = {
  user_statements: { targetPopulation: broadCorpus, topic: "Síntesis de evidencia multidisciplinaria" },
  scope: broadCorpus, problem: "Resultados heterogéneos necesitan una síntesis responsable.", expected_outcome: "Sintetizar condiciones y límites.",
  context: "", academic_level: "MAESTRIA", unit_population_corpus: broadCorpus, confirmed_data: [], possible_data: [], resources: [],
  restrictions: [], preferences: [], unclassified_data_statement: "", requirements: [],
} satisfies ResearchIntentContract;
const descriptions: Record<CorpusClassId, string> = {
  EMPIRICAL_QUANTITATIVE: "El estudio empleó un diseño cuantitativo observacional y estadística descriptiva.",
  EMPIRICAL_QUALITATIVE: "La investigación empleó entrevistas cualitativas y análisis temático contextualizado.",
  EMPIRICAL_MIXED_METHODS: "Se desarrolló un estudio mixto con componentes cuantitativos y cualitativos diferenciados.",
  THEORETICAL_CONCEPTUAL: "El ensayo conceptual compara argumentos, definiciones y consistencia de proposiciones teóricas.",
  SYSTEMATIC_OR_SCOPING_REVIEW: "Se realizó una revisión sistemática con búsqueda documentada y selección de estudios.",
  OTHER_REVIEW_SYNTHESIS: "La revisión narrativa examina estudios previos y delimita sus aportes y límites.",
  POLICY_STANDARD_GUIDANCE: "La guía institucional establece criterios y procedimientos de aplicación normativa.",
  OTHER: "El documento es una obra de investigación de tipo distinto, descrito explícitamente en su método.",
};
export function fixture(classes: CorpusClassId[]) {
  const pack = { version: "fixture", items: classes.flatMap((id, index) => [
    { source_id: `S${index + 1}`, evidence_id: "E1", excerpt: descriptions[id], summary: descriptions[id],
      section: "methodology", evidence_level: "PDF_FULLTEXT", allowed_use: "blueprint_planning",
      locator: { source_id: `S${index + 1}`, citation_key: `S${index + 1}`, reference_id: `reference-${index + 1}`, page_number: 1, chunk_id: "paragraph-1" } },
    { source_id: `M${index + 1}`, evidence_id: "P1", excerpt: `Procedimientos verificables para ${id}; límites de transferencia y requisitos de aplicación.`, summary: "Pasaje original metodológico.",
      section: "methodology", evidence_level: "HTML_PASSAGE", allowed_use: "theory_or_method_support",
      locator: { source_id: `M${index + 1}`, citation_key: `M${index + 1}`, reference_id: `method-${index + 1}`, page_number: null, chunk_id: "procedure-1" } },
  ]), selected_sources: classes.map((_, i) => ({ source_id: `S${i + 1}`, title: `Fuente ${i + 1}`, year: 2025, doi: null })),
  excluded: [], source_accounting: [], context_chars: 0 } as MethodEvidencePack;
  const basis = (id: CorpusClassId, index: number) => ({ kind: "SELECTED_EVIDENCE" as const, field: null,
    source_id: `S${index + 1}`, evidence_id: "E1", quote: descriptions[id], rationale: "La fuente declara este diseño; la revisión científica debe comprobar su clasificación." });
  const proposal: CorpusMethodProfileProposal = {
    classes: classes.map((id, index) => ({ classId: id, presence: "OBSERVED", roleInResearch: "Síntesis separada conforme al diseño y al papel de la fuente.",
      claimsExpectedFromClass: ["Condiciones y límites que el estudio realmente documenta."], appraisalNeeded: true, synthesisNeeded: true,
      integrationNeeded: true, basis: [basis(id, index)], limitations: [] })),
    sourceAssignments: classes.map((id, index) => ({ sourceId: `S${index + 1}`, classId: id, componentClasses: [],
      roleInResearch: "Antecedente seleccionado; no prueba acceso al futuro corpus.", basis: [basis(id, index)], limitations: [] })),
  };
  const profile = buildCorpusMethodProfile({ intent, pack, frozenInputFingerprint: "frozen-a", proposal });
  const unresolved = buildUnresolvedMethodCoverageMatrix(profile, "effective-a");
  const matrix = structuredClone(unresolved);
  matrix.corpusClasses.forEach((row, index) => row.operations.forEach(cell => {
    if (!cell.required) return;
    cell.strategy = `Procedimiento de ${cell.operation} apropiado para ${row.classId}.`;
    cell.supportPointers = [{ source_id: `M${index + 1}`, evidence_id: "P1" }];
    cell.coverageStatus = "SUPPORTED";
    cell.applicabilityJustification = "Transferibilidad explícita sometida a crítica independiente.";
  }));
  if (matrix.crossClassIntegration.required) {
    Object.assign(matrix.crossClassIntegration, { strategy: "Integración explícita preservando diferencias, contexto y niveles de evidencia.",
      supportPointers: [{ source_id: "M1", evidence_id: "P1" }], coverageStatus: "SUPPORTED" });
  }
  matrix.overallCoverageStatus = "SUPPORTED";
  return { pack, proposal, profile, unresolved, matrix };
}
export function critiqueFor(matrix: MethodCoverageMatrix) {
  return bindMethodCoverageCritique({ alternativeId: "A1-R1", intentPreserved: true, corpusClassificationValid: true, methodCoherent: true,
    cellAssessments: methodCoverageCells(matrix).map(cell => ({ cellId: cell.cellId, coverageStatus: cell.coverageStatus,
      transferSupported: cell.required, reason: "Juicio independiente simulado para comprobar el contrato, no aceptación científica live.",
      supportPointers: cell.supportPointers, futureRequirements: cell.futureRequirements, limitations: cell.limitations })),
    findingAssessments: [{ code: "NOV", category: "NOVELTY_CLAIM_WARNING", methodValidityImpact: false,
      reason: "La novedad no está demostrada y no invalida el procedimiento.", retainedPlanTreatment: "No afirmar primacía ni novedad ya demostrada." }],
    blockingScientificIssue: false, blockingReason: "", limitations: [] }, matrix);
}
let checks = 0;
const cases: CorpusClassId[][] = [
  ["EMPIRICAL_QUANTITATIVE", "EMPIRICAL_QUALITATIVE"],
  ["EMPIRICAL_QUANTITATIVE", "EMPIRICAL_QUALITATIVE", "EMPIRICAL_MIXED_METHODS"],
  ["EMPIRICAL_QUALITATIVE", "THEORETICAL_CONCEPTUAL"],
  ["EMPIRICAL_MIXED_METHODS", "SYSTEMATIC_OR_SCOPING_REVIEW"],
  [...CORPUS_CLASSES],
];
for (const classes of cases) {
  const { pack, profile, matrix, unresolved } = fixture(classes);
  const input = { profile, pack, effectiveEvidenceFingerprint: "effective-a" };
  assert.ok(methodCoverageGaps(unresolved).every(gap => gap.requiredEvidence === "INSPECTABLE_SUBSTANTIVE_METHOD_GUIDANCE"));
  assert.ok(methodCoverageGaps(unresolved).length >= classes.length * 3);
  validateMethodCoverageMatrix(matrix, input);
  const validated = validateMethodCoverageCritique(critiqueFor(matrix), { ...input, matrix, alternativeId: "A1-R1", findingCodes: ["NOV"] });
  assert.equal(validated.evidenceSupported, true);
  assert.equal(validated.appraisalCoverageSupported, "SUPPORTED");
  assert.equal(validated.crossClassIntegrationSupported, "SUPPORTED");
  assert.equal(methodCoverageGaps(matrix).length, 0);
  assert.equal(profile.selectedSourceIds.length, classes.length);
  checks += 8;
}
// Every class needs its own operation assessment. Qualitative precedent cannot
// certify quantitative appraisal by being a valid pointer somewhere in the pack.
const main = fixture(["EMPIRICAL_QUANTITATIVE", "EMPIRICAL_QUALITATIVE", "EMPIRICAL_MIXED_METHODS"]);
const args = { profile: main.profile, pack: main.pack, effectiveEvidenceFingerprint: "effective-a", matrix: main.matrix,
  alternativeId: "A1-R1", findingCodes: ["NOV"] };
const rejected = critiqueFor(main.matrix);
const quantCell = rejected.cellAssessments.find(cell => cell.cellId === "EMPIRICAL_QUANTITATIVE:QUALITY_APPRAISAL")!;
quantCell.coverageStatus = "UNSUPPORTED"; quantCell.transferSupported = false; quantCell.reason = "La guía solo sustenta la evaluación cualitativa.";
assert.equal(validateMethodCoverageCritique(rejected, args).evidenceSupported, false);
const newlyDiscovered = critiqueFor(main.matrix);
newlyDiscovered.findingAssessments = [{...newlyDiscovered.findingAssessments[0],code:"NEW-METHOD-GAP",methodValidityImpact:true}];
const retainedRejection = validateMethodCoverageCritique(newlyDiscovered,args);
assert.equal(retainedRejection.evidenceSupported,false);
assert.deepEqual(retainedRejection.unassessedHistoricalFindingCodes,["NOV"]);
const duplicateFinding = critiqueFor(main.matrix);
duplicateFinding.findingAssessments.push({...duplicateFinding.findingAssessments[0]});
assert.throws(()=>validateMethodCoverageCritique(duplicateFinding,args),/FINDING_DUPLICATE/);
const missingIntegration = structuredClone(main.matrix); missingIntegration.crossClassIntegration.required = false;
assert.throws(() => validateMethodCoverageMatrix(missingIntegration, args), /INTEGRATION_MISSING/);
const omitted = structuredClone(main.matrix); omitted.corpusClasses.pop();
assert.throws(() => validateMethodCoverageMatrix(omitted, args), /CORPUS_CLASS_MISMATCH/);
const foreignPointer = structuredClone(main.matrix); foreignPointer.corpusClasses[0].operations[0].supportPointers = [{ source_id: "OTHER_JOB", evidence_id: "P1" }];
assert.throws(() => validateMethodCoverageMatrix(foreignPointer, args), /POINTER_INVALID/);
const metadata = structuredClone(main.pack); metadata.items.find(item => item.source_id === "M1")!.evidence_level = "ABSTRACT_METADATA";
assert.throws(() => validateMethodCoverageMatrix(main.matrix, { ...args, pack: metadata }), /SUBSTANTIVE_EVIDENCE_REQUIRED/);
const counterfeited = structuredClone(main.matrix); counterfeited.effectiveEvidenceFingerprint = "another-job-evidence";
assert.throws(() => validateMethodCoverageMatrix(counterfeited, args), /IDENTITY_MISMATCH/);
const silentOmission = critiqueFor(main.matrix); silentOmission.cellAssessments.pop();
assert.throws(() => validateMethodCoverageCritique(silentOmission, args), /CELL_COVERAGE_MISMATCH/);
const waived = critiqueFor(main.matrix); waived.cellAssessments[0].coverageStatus = "NOT_APPLICABLE";
assert.throws(() => validateMethodCoverageCritique(waived, args), /APPLICABILITY_MISMATCH/);
checks += 8;
// Observed mixed study remains one work despite its quantitative/qualitative
// components. Explicit UNKNOWN never becomes a made-up design classification.
const mixed = fixture(["EMPIRICAL_MIXED_METHODS"]);
mixed.proposal.sourceAssignments[0].componentClasses = ["EMPIRICAL_QUANTITATIVE", "EMPIRICAL_QUALITATIVE"];
const mixedProfile = buildCorpusMethodProfile({ intent, pack: mixed.pack, frozenInputFingerprint: "frozen-a", proposal: mixed.proposal });
assert.equal(mixedProfile.observedClassCounts.EMPIRICAL_MIXED_METHODS, 1);
assert.equal(mixedProfile.observedClassCounts.EMPIRICAL_QUANTITATIVE, undefined);
const unknown = structuredClone(mixed.proposal);
unknown.sourceAssignments[0] = { ...unknown.sourceAssignments[0], classId: null, componentClasses: [], basis: [], limitations: ["El diseño no está declarado en los pasajes disponibles."] };
unknown.classes[0] = { ...unknown.classes[0], presence: "CONTINGENT", basis: [{ kind: "FROZEN_INTENT", field: "scope", source_id: null, evidence_id: null, quote: broadCorpus,
  rationale: "El alcance admite esta clase si se encuentra; no se presume observada." }], limitations: ["No se ha observado en las fuentes disponibles."] };
const unknownProfile = buildCorpusMethodProfile({ intent, pack: mixed.pack, frozenInputFingerprint: "frozen-a", proposal: unknown });
assert.deepEqual(unknownProfile.unknownSourceIds, ["S1"]);
assert.equal(unknownProfile.observedClassCounts.EMPIRICAL_MIXED_METHODS, 0);
assert.equal(buildUnresolvedMethodCoverageMatrix(unknownProfile, "effective-a").corpusClasses[0].operations[0].requiredWhen, "IF_CLASS_ENCOUNTERED");
const fakeClassification = structuredClone(mixed.proposal); fakeClassification.sourceAssignments[0].basis[0].quote = "The title looks quantitative";
assert.throws(() => buildCorpusMethodProfile({ intent, pack: mixed.pack, frozenInputFingerprint: "frozen-a", proposal: fakeClassification }), /PROVENANCE_INVALID/);
const borrowedClassification = structuredClone(main.proposal); borrowedClassification.sourceAssignments[0].basis = main.proposal.sourceAssignments[1].basis;
assert.throws(() => buildCorpusMethodProfile({ intent, pack: main.pack, frozenInputFingerprint: "frozen-a", proposal: borrowedClassification }), /PROVENANCE_INVALID/);
checks += 7;
// Future facts may be conditional; unsupported methodology cannot be disguised
// as a future-data task, and no condition can be silently omitted.
const conditional = structuredClone(main.matrix);
const conditioned = conditional.corpusClasses[0].operations[0];
conditioned.coverageStatus = "CONDITIONALLY_SUPPORTED"; conditioned.futureRequirements = ["Verificar el acceso a los informes antes de ejecutar la tesis."];
conditional.overallCoverageStatus = "CONDITIONALLY_SUPPORTED";
const conditionReview = critiqueFor(conditional);
assert.equal(validateMethodCoverageCritique(conditionReview, { ...args, matrix: conditional }).evidenceSupported, true);
conditioned.futureRequirements = [];
assert.throws(() => validateMethodCoverageMatrix(conditional, args), /CONDITION_UNDISCLOSED/);
const noPointerCondition = structuredClone(main.matrix); noPointerCondition.corpusClasses[0].operations[0].coverageStatus = "CONDITIONALLY_SUPPORTED";
noPointerCondition.corpusClasses[0].operations[0].supportPointers = []; noPointerCondition.corpusClasses[0].operations[0].futureRequirements = ["Buscar apoyo más adelante."];
assert.throws(() => validateMethodCoverageMatrix(noPointerCondition, args), /SUPPORT_MISSING/);
checks += 3;
// Theoretical background needs appropriate handling, not an automatic empirical
// risk-of-bias instrument. The independent critic checks the declared role.
const theory = fixture(["THEORETICAL_CONCEPTUAL"]);
theory.proposal.classes[0].roleInResearch = "Marco conceptual; no aporta estimaciones empíricas de efectos.";
theory.proposal.classes[0].appraisalNeeded = false;
theory.proposal.classes[0].synthesisNeeded = false;
const theoryProfile = buildCorpusMethodProfile({ intent, pack: theory.pack, frozenInputFingerprint: "frozen-a", proposal: theory.proposal });
const theoryMatrix = buildUnresolvedMethodCoverageMatrix(theoryProfile, "effective-a");
assert.equal(theoryMatrix.corpusClasses[0].operations.find(cell => cell.operation === "QUALITY_APPRAISAL")!.coverageStatus, "NOT_APPLICABLE");
assert.equal(theoryMatrix.corpusClasses[0].operations.find(cell => cell.operation === "DATA_EXTRACTION")!.required, true);
checks += 2;
// The core does not choose a clinical/manual framework based on discipline.
for (const domain of ["ingeniería", "salud", "educación", "gestión", "ciencias sociales", "humanidades"]) {
  const frozen = { ...intent, context: domain };
  const before = JSON.stringify(main.pack);
  const profile = buildCorpusMethodProfile({ intent: frozen, pack: main.pack, frozenInputFingerprint: `frozen-${domain}`, proposal: main.proposal });
  const matrix = buildUnresolvedMethodCoverageMatrix(profile, "effective-a");
  assert.ok(matrix.corpusClasses.every(row => row.operations.every(cell => cell.strategy === "")));
  assert.equal(JSON.stringify(main.pack), before);
  checks += 2;
}
// Strict Responses contract can be validated before a paid call: all fields are
// required, optional identity/aggregate output is generated by the server.
for (const schema of [corpusMethodProfileProposalSchema, methodCoverageMatrixProposalSchema, methodCoverageCritiqueProposalSchema]) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  function strict(node: unknown): void {
    if (node === null || typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    if (row.type === "object") {
      assert.equal(row.additionalProperties, false);
      assert.deepEqual(new Set(row.required as string[]), new Set(Object.keys(row.properties as object)));
    }
    Object.values(row).forEach(value => { if (Array.isArray(value)) value.forEach(strict); else strict(value); });
  }
  strict(json); checks++;
}
const serverBound = buildMethodCoverageMatrix({ proposal: { corpusClasses: main.matrix.corpusClasses, crossClassIntegration: main.matrix.crossClassIntegration }, profile: main.profile,
  pack: main.pack, effectiveEvidenceFingerprint: "effective-a" });
assert.equal(serverBound.overallCoverageStatus, "SUPPORTED");
assert.equal(serverBound.profileFingerprint, main.profile.profileFingerprint); checks += 2;
console.log(`Method coverage contracts: PASS (${checks} checks; fixtures validate contracts, not live scientific quality).`);
