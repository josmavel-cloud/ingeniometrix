import { createHash } from "node:crypto";
import { z } from "zod";
import type { MethodEvidencePack, ResearchIntentContract } from "./scientific-decision-contracts";
import { permitsMethodologicalSupport } from "./evidence-coverage";

/** Derived contracts. They never replace frozen Intake, source selection or evidence. */
export const CORPUS_METHOD_PROFILE_VERSION = "CorpusMethodProfile.v1";
export const METHOD_COVERAGE_MATRIX_VERSION = "MethodCoverageMatrix.v1";
export const METHOD_COVERAGE_CRITIC_VERSION = "MethodCoverageCritic.v1";
export const CORPUS_CLASSES = ["EMPIRICAL_QUANTITATIVE", "EMPIRICAL_QUALITATIVE", "EMPIRICAL_MIXED_METHODS", "THEORETICAL_CONCEPTUAL", "SYSTEMATIC_OR_SCOPING_REVIEW", "OTHER_REVIEW_SYNTHESIS", "POLICY_STANDARD_GUIDANCE", "OTHER"] as const;
export const CLASS_METHOD_OPERATIONS = ["DATA_EXTRACTION", "QUALITY_APPRAISAL", "CODING", "WITHIN_CLASS_SYNTHESIS"] as const;
export const COVERAGE_STATUSES = ["SUPPORTED", "CONDITIONALLY_SUPPORTED", "UNSUPPORTED", "NOT_APPLICABLE"] as const;
const text = z.string().trim().min(1);
const texts = z.array(text);
const classId = z.enum(CORPUS_CLASSES);
const pointerSchema = z.object({ source_id: text, evidence_id: text }).strict();
export const methodCoverageStatusSchema = z.enum(COVERAGE_STATUSES);
const identity = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unique = <T>(values: T[]) => [...new Set(values)];
const pointerKey = (pointer: { source_id: string; evidence_id: string }) => `${pointer.source_id}:${pointer.evidence_id}`;
const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every(value => b.includes(value));

// Quotations point at actual immutable input. A title, a critic's opinion or a
// keyword alone is not evidence of the design used in a selected publication.
export const corpusClassificationBasisSchema = z.object({
  kind: z.enum(["FROZEN_INTENT", "SELECTED_EVIDENCE"]),
  field: text.nullable(), source_id: text.nullable(), evidence_id: text.nullable(),
  quote: text, rationale: text,
}).strict();
export const corpusMethodProfileProposalSchema = z.object({
  classes: z.array(z.object({
    classId,
    presence: z.enum(["OBSERVED", "DECLARED", "CONTINGENT"]),
    roleInResearch: text, claimsExpectedFromClass: texts,
    appraisalNeeded: z.boolean(), synthesisNeeded: z.boolean(), integrationNeeded: z.boolean(),
    basis: z.array(corpusClassificationBasisSchema).min(1), limitations: texts,
  }).strict()).min(1).max(CORPUS_CLASSES.length),
  sourceAssignments: z.array(z.object({
    sourceId: text, classId: classId.nullable(), componentClasses: z.array(classId),
    roleInResearch: text, basis: z.array(corpusClassificationBasisSchema), limitations: texts,
  }).strict()),
}).strict();
export type CorpusMethodProfileProposal = z.infer<typeof corpusMethodProfileProposalSchema>;
export type CorpusClassId = typeof CORPUS_CLASSES[number];

function intentValue(intent: ResearchIntentContract, path: string): unknown {
  // Only explicit paths to the frozen definition; no model prose/history/critic.
  const parts = path.replace(/^intent\./, "").split(".");
  if (parts.some(part => ["__proto__", "prototype", "constructor"].includes(part))) return undefined;
  let result: unknown = intent;
  for (const part of parts) {
    if (result == null || typeof result !== "object" || !Object.prototype.hasOwnProperty.call(result, part)) return undefined;
    result = (result as Record<string, unknown>)[part];
  }
  return result;
}
const quoteText = (value: string) => value.normalize("NFKC").replace(/\s+/gu, " ").trim();
function validateBasis(basis: z.infer<typeof corpusClassificationBasisSchema>, intent: ResearchIntentContract, pack: MethodEvidencePack, ownSource?: string) {
  if (basis.kind === "FROZEN_INTENT") {
    const value = basis.field ? intentValue(intent, basis.field) : undefined;
    if (basis.source_id !== null || basis.evidence_id !== null || typeof value !== "string" || !quoteText(value).includes(quoteText(basis.quote)))
      throw new Error("CORPUS_CLASSIFICATION_INTENT_PROVENANCE_INVALID");
    return;
  }
  const item = pack.items.find(item => item.source_id === basis.source_id && item.evidence_id === basis.evidence_id);
  if (basis.field !== null || !item || !pack.selected_sources.some(source => source.source_id === basis.source_id) ||
      ownSource && basis.source_id !== ownSource || (!item.excerpt || !quoteText(item.excerpt).includes(quoteText(basis.quote))) ||
      ["VERIFIED_METADATA_ONLY", "NONE"].includes(item.evidence_level))
    throw new Error("CORPUS_CLASSIFICATION_EVIDENCE_PROVENANCE_INVALID");
}

export function buildCorpusMethodProfile(input: {
  intent: ResearchIntentContract; pack: MethodEvidencePack; frozenInputFingerprint: string;
  proposal: CorpusMethodProfileProposal;
}) {
  const proposal = corpusMethodProfileProposalSchema.parse(input.proposal);
  const selectedSourceIds = input.pack.selected_sources.map(source => source.source_id).sort();
  if (!input.frozenInputFingerprint || !sameSet(proposal.sourceAssignments.map(source => source.sourceId), selectedSourceIds))
    throw new Error("CORPUS_SELECTED_SOURCE_COVERAGE_MISMATCH");
  const ids = proposal.classes.map(row => row.classId);
  if (unique(ids).length !== ids.length) throw new Error("CORPUS_CLASS_DUPLICATE");
  for (const assignment of proposal.sourceAssignments) {
    assignment.basis.forEach(basis => validateBasis(basis, input.intent, input.pack, assignment.sourceId));
    if (assignment.classId === null) {
      if (!assignment.limitations.length || assignment.componentClasses.length) throw new Error("CORPUS_UNKNOWN_CLASS_REQUIRES_LIMITATION");
    } else if (!ids.includes(assignment.classId) || !assignment.basis.some(basis => basis.kind === "SELECTED_EVIDENCE")) {
      throw new Error("CORPUS_OBSERVED_CLASS_REQUIRES_DIRECT_EVIDENCE");
    }
    if (unique(assignment.componentClasses).length !== assignment.componentClasses.length)
      throw new Error("CORPUS_COMPONENT_CLASS_DUPLICATE");
  }
  const classes = proposal.classes.map(row => {
    row.basis.forEach(basis => validateBasis(basis, input.intent, input.pack));
    const includedSourceIds = proposal.sourceAssignments.filter(source => source.classId === row.classId).map(source => source.sourceId).sort();
    if (row.presence === "OBSERVED" && !includedSourceIds.length || row.presence !== "OBSERVED" && includedSourceIds.length)
      throw new Error("CORPUS_CLASS_PRESENCE_CONTRADICTION");
    if (row.presence === "DECLARED" && !row.basis.some(basis => basis.kind === "FROZEN_INTENT"))
      throw new Error("CORPUS_DECLARED_CLASS_REQUIRES_INTENT");
    if (row.presence === "CONTINGENT" && (!row.limitations.length || !row.basis.some(basis => basis.kind === "FROZEN_INTENT")))
      throw new Error("CORPUS_CONTINGENT_CLASS_REQUIRES_BOUNDARY");
    return { ...row, includedSourceIds };
  });
  const value = {
    version: CORPUS_METHOD_PROFILE_VERSION, frozenInputFingerprint: input.frozenInputFingerprint,
    intentFingerprint: identity(input.intent), selectedSourceIds,
    corpusClasses: classes,
    sourceAssignments: [...proposal.sourceAssignments].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    unknownSourceIds: proposal.sourceAssignments.filter(source => source.classId === null).map(source => source.sourceId).sort(),
    // Component counts are intentionally separate: a mixed study is one work,
    // never one quantitative + one qualitative + one mixed study.
    observedClassCounts: Object.fromEntries(classes.map(row => [row.classId, row.includedSourceIds.length])),
    scientificClassificationStatus: "PROPOSED_FROM_FROZEN_INPUT_REQUIRES_INDEPENDENT_REVIEW" as const,
  };
  return { ...value, profileFingerprint: identity(value) };
}
export type CorpusMethodProfile = ReturnType<typeof buildCorpusMethodProfile>;

export const methodCoverageCellSchema = z.object({
  cellId: text,
  operation: z.enum([...CLASS_METHOD_OPERATIONS, "CROSS_CLASS_INTEGRATION"]),
  required: z.boolean(),
  requiredWhen: z.enum(["ALWAYS", "IF_CLASS_ENCOUNTERED", "NOT_NEEDED_FOR_ROLE"]),
  strategy: z.string(), claim: text,
  supportPointers: z.array(pointerSchema),
  coverageStatus: methodCoverageStatusSchema,
  applicabilityJustification: text,
  assumptions: texts, futureRequirements: texts, limitations: texts,
}).strict();
export const methodCoverageMatrixSchema = z.object({
  version: z.literal(METHOD_COVERAGE_MATRIX_VERSION),
  profileFingerprint: text, effectiveEvidenceFingerprint: text,
  corpusClasses: z.array(z.object({
    classId, sourceIds: texts,
    operations: z.array(methodCoverageCellSchema).length(CLASS_METHOD_OPERATIONS.length),
    limitations: texts,
  }).strict()).min(1).max(CORPUS_CLASSES.length),
  crossClassIntegration: methodCoverageCellSchema,
  overallCoverageStatus: methodCoverageStatusSchema,
}).strict();
export type MethodCoverageCell = z.infer<typeof methodCoverageCellSchema>;
export type MethodCoverageMatrix = z.infer<typeof methodCoverageMatrixSchema>;
// Provider output never invents trusted fingerprints or derived aggregate state.
export const methodCoverageMatrixProposalSchema = methodCoverageMatrixSchema.omit({
  version: true, profileFingerprint: true, effectiveEvidenceFingerprint: true, overallCoverageStatus: true,
});
export type MethodCoverageMatrixProposal = z.infer<typeof methodCoverageMatrixProposalSchema>;
export function buildMethodCoverageMatrix(input: {
  proposal: MethodCoverageMatrixProposal; profile: CorpusMethodProfile; pack: MethodEvidencePack;
  effectiveEvidenceFingerprint: string;
}) {
  const proposal = methodCoverageMatrixProposalSchema.parse(input.proposal);
  const matrix: MethodCoverageMatrix = { ...proposal, version: METHOD_COVERAGE_MATRIX_VERSION,
    profileFingerprint: input.profile.profileFingerprint, effectiveEvidenceFingerprint: input.effectiveEvidenceFingerprint,
    overallCoverageStatus: aggregateMethodCoverage([...proposal.corpusClasses.flatMap(row => row.operations), proposal.crossClassIntegration]) };
  return validateMethodCoverageMatrix(matrix, input);
}
export function methodCoverageCells(matrix: MethodCoverageMatrix) {
  return [...matrix.corpusClasses.flatMap(row => row.operations), matrix.crossClassIntegration];
}
export function aggregateMethodCoverage(cells: Array<Pick<MethodCoverageCell, "required" | "coverageStatus">>): z.infer<typeof methodCoverageStatusSchema> {
  const required = cells.filter(cell => cell.required);
  if (!required.length) return "NOT_APPLICABLE";
  if (required.some(cell => cell.coverageStatus === "UNSUPPORTED" || cell.coverageStatus === "NOT_APPLICABLE")) return "UNSUPPORTED";
  return required.some(cell => cell.coverageStatus === "CONDITIONALLY_SUPPORTED") ? "CONDITIONALLY_SUPPORTED" : "SUPPORTED";
}
export function buildUnresolvedMethodCoverageMatrix(profile: CorpusMethodProfile, effectiveEvidenceFingerprint: string): MethodCoverageMatrix {
  const cell = (cellId: string, operation: MethodCoverageCell["operation"], needed: boolean, contingent: boolean): MethodCoverageCell => ({
    cellId, operation, required: needed,
    requiredWhen: !needed ? "NOT_NEEDED_FOR_ROLE" : contingent ? "IF_CLASS_ENCOUNTERED" : "ALWAYS",
    strategy: "", claim: `${operation}: definir un procedimiento apropiado para el papel de esta evidencia.`,
    supportPointers: [], coverageStatus: needed ? "UNSUPPORTED" : "NOT_APPLICABLE",
    applicabilityJustification: needed ? "Se requiere un procedimiento respaldado; no se infiere de palabras clave." : "La operación no es necesaria para el papel declarado; el dictamen independiente debe verificarlo.",
    assumptions: [], futureRequirements: [], limitations: [],
  });
  const corpusClasses = profile.corpusClasses.map(row => ({ classId: row.classId, sourceIds: row.includedSourceIds,
    operations: CLASS_METHOD_OPERATIONS.map(operation => cell(`${row.classId}:${operation}`, operation,
      operation === "DATA_EXTRACTION" || operation === "QUALITY_APPRAISAL" && row.appraisalNeeded || operation === "WITHIN_CLASS_SYNTHESIS" && row.synthesisNeeded,
      row.presence === "CONTINGENT")), limitations: row.limitations }));
  const integrationNeeded = profile.corpusClasses.filter(row => row.integrationNeeded).length > 1;
  const crossClassIntegration = cell("CROSS_CLASS_INTEGRATION", "CROSS_CLASS_INTEGRATION", integrationNeeded, false);
  return { version: METHOD_COVERAGE_MATRIX_VERSION, profileFingerprint: profile.profileFingerprint, effectiveEvidenceFingerprint,
    corpusClasses, crossClassIntegration, overallCoverageStatus: aggregateMethodCoverage([...corpusClasses.flatMap(row => row.operations), crossClassIntegration]) };
}

function validateSupportPointers(pointers: MethodCoverageCell["supportPointers"], pack: MethodEvidencePack, substantiveRequired: boolean) {
  const keys = pointers.map(pointerKey);
  if (unique(keys).length !== keys.length) throw new Error("METHOD_COVERAGE_DUPLICATE_POINTER");
  for (const pointer of pointers) {
    const item = pack.items.find(item => pointerKey(item) === pointerKey(pointer));
    if (!item || !item.excerpt?.trim() || !permitsMethodologicalSupport(item.allowed_use)) throw new Error("METHOD_COVERAGE_POINTER_INVALID");
    if (substantiveRequired && !["PDF_FULLTEXT", "PDF_SAMPLE_TEXT", "HTML_PASSAGE", "FULL_TEXT_PASSAGE"].includes(item.evidence_level))
      throw new Error("METHOD_COVERAGE_SUBSTANTIVE_EVIDENCE_REQUIRED");
  }
}
export function validateMethodCoverageMatrix(matrixInput: MethodCoverageMatrix, input: {
  profile: CorpusMethodProfile; pack: MethodEvidencePack; effectiveEvidenceFingerprint: string;
}) {
  const matrix = methodCoverageMatrixSchema.parse(matrixInput);
  if (matrix.profileFingerprint !== input.profile.profileFingerprint || matrix.effectiveEvidenceFingerprint !== input.effectiveEvidenceFingerprint)
    throw new Error("METHOD_COVERAGE_IDENTITY_MISMATCH");
  if (!sameSet(matrix.corpusClasses.map(row => row.classId), input.profile.corpusClasses.map(row => row.classId)))
    throw new Error("METHOD_COVERAGE_CORPUS_CLASS_MISMATCH");
  const all = methodCoverageCells(matrix);
  if (unique(all.map(cell => cell.cellId)).length !== all.length) throw new Error("METHOD_COVERAGE_CELL_DUPLICATE");
  for (const row of matrix.corpusClasses) {
    const corpus = input.profile.corpusClasses.find(item => item.classId === row.classId)!;
    if (!sameSet(row.sourceIds, corpus.includedSourceIds) || !sameSet(row.operations.map(cell => cell.operation), [...CLASS_METHOD_OPERATIONS]))
      throw new Error("METHOD_COVERAGE_CLASS_OPERATION_MISMATCH");
    for (const operation of row.operations) {
      if (operation.cellId !== `${row.classId}:${operation.operation}`) throw new Error("METHOD_COVERAGE_CELL_ID_MISMATCH");
      if (operation.required && corpus.presence === "CONTINGENT" && operation.requiredWhen !== "IF_CLASS_ENCOUNTERED")
        throw new Error("METHOD_COVERAGE_CONTINGENT_CORPUS_MISREPRESENTED");
      if ((operation.operation === "DATA_EXTRACTION" || operation.operation === "QUALITY_APPRAISAL" && corpus.appraisalNeeded ||
        operation.operation === "WITHIN_CLASS_SYNTHESIS" && corpus.synthesisNeeded) && !operation.required)
        throw new Error("METHOD_COVERAGE_REQUIRED_OPERATION_OMITTED");
    }
  }
  if (matrix.crossClassIntegration.cellId !== "CROSS_CLASS_INTEGRATION" || matrix.crossClassIntegration.operation !== "CROSS_CLASS_INTEGRATION" ||
      input.profile.corpusClasses.filter(row => row.integrationNeeded).length > 1 && !matrix.crossClassIntegration.required)
    throw new Error("METHOD_COVERAGE_INTEGRATION_MISSING");
  for (const cell of all) {
    if (!cell.required && (cell.coverageStatus !== "NOT_APPLICABLE" || cell.requiredWhen !== "NOT_NEEDED_FOR_ROLE") ||
        cell.required && (cell.requiredWhen === "NOT_NEEDED_FOR_ROLE" || cell.coverageStatus === "NOT_APPLICABLE"))
      throw new Error("METHOD_COVERAGE_APPLICABILITY_CONTRADICTION");
    const supported = cell.coverageStatus === "SUPPORTED" || cell.coverageStatus === "CONDITIONALLY_SUPPORTED";
    if (supported && (!cell.strategy.trim() || !cell.supportPointers.length)) throw new Error("METHOD_COVERAGE_SUPPORT_MISSING");
    if (cell.coverageStatus === "CONDITIONALLY_SUPPORTED" && !cell.futureRequirements.length && !cell.assumptions.length && !cell.limitations.length)
      throw new Error("METHOD_COVERAGE_CONDITION_UNDISCLOSED");
    validateSupportPointers(cell.supportPointers, input.pack, supported);
  }
  if (matrix.overallCoverageStatus !== aggregateMethodCoverage(all)) throw new Error("METHOD_COVERAGE_AGGREGATE_INVALID");
  return matrix;
}

export function methodCoverageGaps(matrix: MethodCoverageMatrix) {
  return methodCoverageCells(matrix).filter(cell => cell.required && cell.coverageStatus === "UNSUPPORTED").map(cell => ({
    gapId: `method-cell-${identity([matrix.profileFingerprint, cell.cellId, cell.claim]).slice(0, 20)}`,
    cellId: cell.cellId,
    classId: matrix.corpusClasses.find(row => row.operations.some(item => item.cellId === cell.cellId))?.classId ?? null,
    operation: cell.operation, claim: cell.claim, proposedStrategy: cell.strategy,
    requiredWhen: cell.requiredWhen,
    requiredEvidence: "INSPECTABLE_SUBSTANTIVE_METHOD_GUIDANCE" as const,
    question: `¿Qué procedimientos y condiciones verificables respaldan ${cell.operation} para ${matrix.corpusClasses.find(row => row.operations.some(item => item.cellId === cell.cellId))?.classId ?? "la integración entre clases"}: ${cell.claim}${cell.strategy ? ` mediante ${cell.strategy}` : ""}?`,
    existingPointers: cell.supportPointers,
  }));
}

export const SCIENTIFIC_FINDING_CATEGORIES = ["METHOD_VALIDITY_BLOCKER", "EVIDENCE_CLAIM_LIMITATION", "FEASIBILITY_REQUIREMENT", "NOVELTY_CLAIM_WARNING", "FUTURE_DATA_REQUIREMENT", "OTHER"] as const;
export const methodCoverageCritiqueSchema = z.object({
  version: z.literal(METHOD_COVERAGE_CRITIC_VERSION), alternativeId: text,
  profileFingerprint: text, effectiveEvidenceFingerprint: text,
  intentPreserved: z.boolean(), corpusClassificationValid: z.boolean(), methodCoherent: z.boolean(),
  cellAssessments: z.array(z.object({
    cellId: text, coverageStatus: methodCoverageStatusSchema, transferSupported: z.boolean(),
    reason: text, supportPointers: z.array(pointerSchema), futureRequirements: texts, limitations: texts,
  }).strict()),
  findingAssessments: z.array(z.object({
    code: text, category: z.enum(SCIENTIFIC_FINDING_CATEGORIES), methodValidityImpact: z.boolean(),
    reason: text, retainedPlanTreatment: text,
  }).strict()),
  blockingScientificIssue: z.boolean(), blockingReason: z.string(), limitations: texts,
}).strict();
export type MethodCoverageCritique = z.infer<typeof methodCoverageCritiqueSchema>;
export const methodCoverageCritiqueProposalSchema = methodCoverageCritiqueSchema.omit({
  version: true, profileFingerprint: true, effectiveEvidenceFingerprint: true,
});
export function bindMethodCoverageCritique(proposal: z.infer<typeof methodCoverageCritiqueProposalSchema>, matrix: MethodCoverageMatrix): MethodCoverageCritique {
  return { ...methodCoverageCritiqueProposalSchema.parse(proposal), version: METHOD_COVERAGE_CRITIC_VERSION,
    profileFingerprint: matrix.profileFingerprint, effectiveEvidenceFingerprint: matrix.effectiveEvidenceFingerprint };
}
export function validateMethodCoverageCritique(critiqueInput: MethodCoverageCritique, input: {
  matrix: MethodCoverageMatrix; profile: CorpusMethodProfile; pack: MethodEvidencePack;
  effectiveEvidenceFingerprint: string; alternativeId: string; findingCodes: string[];
}) {
  const matrix = validateMethodCoverageMatrix(input.matrix, input);
  const critique = methodCoverageCritiqueSchema.parse(critiqueInput);
  if (critique.alternativeId !== input.alternativeId || critique.profileFingerprint !== matrix.profileFingerprint ||
      critique.effectiveEvidenceFingerprint !== matrix.effectiveEvidenceFingerprint) throw new Error("METHOD_CRITIC_IDENTITY_MISMATCH");
  const cells = methodCoverageCells(matrix);
  if (!sameSet(critique.cellAssessments.map(row => row.cellId), cells.map(cell => cell.cellId))) throw new Error("METHOD_CRITIC_CELL_COVERAGE_MISMATCH");
  if (!sameSet(critique.findingAssessments.map(row => row.code), unique(input.findingCodes))) throw new Error("METHOD_CRITIC_FINDING_COVERAGE_MISMATCH");
  const assessedCells = cells.map(cell => {
    const assessment = critique.cellAssessments.find(row => row.cellId === cell.cellId)!;
    const supported = ["SUPPORTED", "CONDITIONALLY_SUPPORTED"].includes(assessment.coverageStatus);
    if (cell.required && assessment.coverageStatus === "NOT_APPLICABLE" || !cell.required && assessment.coverageStatus !== "NOT_APPLICABLE")
      throw new Error("METHOD_CRITIC_APPLICABILITY_MISMATCH");
    if (supported && (!assessment.supportPointers.length || !assessment.transferSupported)) throw new Error("METHOD_CRITIC_SUPPORT_CONTRADICTION");
    validateSupportPointers(assessment.supportPointers, input.pack, supported);
    if (assessment.supportPointers.some(pointer => !cell.supportPointers.some(allowed => pointerKey(allowed) === pointerKey(pointer))))
      throw new Error("METHOD_CRITIC_UNDECLARED_CELL_SUPPORT");
    if (assessment.coverageStatus === "CONDITIONALLY_SUPPORTED" && !assessment.futureRequirements.length && !assessment.limitations.length)
      throw new Error("METHOD_CRITIC_CONDITION_UNDISCLOSED");
    return { ...cell, coverageStatus: assessment.coverageStatus };
  });
  if (critique.blockingScientificIssue !== Boolean(critique.blockingReason.trim())) throw new Error("METHOD_CRITIC_BLOCKING_REASON_MISMATCH");
  const coverage = (operation: MethodCoverageCell["operation"]) => aggregateMethodCoverage(assessedCells.filter(cell => cell.operation === operation));
  const overallCoverageStatus = aggregateMethodCoverage(assessedCells);
  const methodValidityBlocker = critique.findingAssessments.some(finding => finding.methodValidityImpact);
  // The public boolean is a deterministic aggregate of independently assessed
  // REQUIRED operations, never a forced approval based on pointer validity.
  return { critique, overallCoverageStatus,
    appraisalCoverageSupported: coverage("QUALITY_APPRAISAL"),
    extractionCoverageSupported: coverage("DATA_EXTRACTION"),
    codingCoverageSupported: coverage("CODING"),
    withinClassSynthesisSupported: coverage("WITHIN_CLASS_SYNTHESIS"),
    crossClassIntegrationSupported: coverage("CROSS_CLASS_INTEGRATION"),
    methodologicalTransferSupported: critique.cellAssessments.filter(row => cells.find(cell => cell.cellId === row.cellId)?.required).every(row => row.transferSupported),
    evidenceSupported: critique.intentPreserved && critique.corpusClassificationValid && critique.methodCoherent &&
      !critique.blockingScientificIssue && !methodValidityBlocker && ["SUPPORTED", "CONDITIONALLY_SUPPORTED"].includes(overallCoverageStatus),
  };
}
