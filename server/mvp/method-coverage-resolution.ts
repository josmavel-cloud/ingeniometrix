import { z } from "zod";
import { normalizeDeclaredMethodHandoffs } from "./method-handoff-normalization";
import type { LlmProvider, StructuredObjectInput } from "@/llm/provider";
import { getConfiguredLlmProvider } from "@/llm";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { scientificStructuredCall } from "./scientific-structured-call";
import { currentJobExecution, fingerprint, preflightWholeJobCost, readCompletedCheckpoint, stableJson, stageCheckpoint, versionedCheckpointKey } from "./job-execution-context";
import type { ScientificDecisionBundle } from "./scientific-decision-service";
import { designAlternativeV2Schema, validateScientificDecision, type MethodEvidencePack } from "./scientific-decision-contracts";
import { researchDesignSchema, evidencePointerSchema } from "./research-plan-contracts";
import { buildCorpusMethodProfile, buildMethodCoverageMatrix, bindMethodCoverageCritique, validateMethodCoverageCritique,
  methodCoverageAssessmentSchema, methodCoverageMatrixProposalSchema, methodCoverageCritiqueProposalSchema, corpusRoleRefinementProposalSchema, deriveCorpusMethodRoles,
  methodCoverageCells, methodCoverageGaps, type MethodCoverageMatrix, type CorpusMethodProfile } from "./method-coverage-contracts";
import { augmentMethodEvidencePack, sealDesignSupport, type DesignSupportSource, type DesignSupportAddendum } from "./design-support-addendum";
import { buildDesignSupportDigest, digestPromptContext } from "./design-support-digest";
import { designSupportGaps, type DesignSupportGap } from "./design-support-gap";
import { researchDesignSupport, DESIGN_MINI_RESEARCH_POLICY } from "./design-mini-research";
import { webDiscoveryPolicyCostBound } from "@/server/retrieval/astra-web-cost-policy";
import { mandatoryCompositionReservationFloor } from "./whole-job-cost-forecast";
import { METHOD_COVERAGE_ASSESSMENT_PROMPT as assessmentPrompt, METHOD_RECONSTRUCTION_PROMPT as reconstructionPrompt,
  METHOD_COVERAGE_CRITIC_PROMPT as criticPrompt } from "./prompts/method-coverage.v1";

export const METHOD_COVERAGE_RESOLUTION_POLICY = "method-coverage-reconstruction.v1";
const text = z.string().min(1), texts = z.array(text);
function contextCapacityCostBound(record: typeof reconstructionPrompt | typeof criticPrompt) {
  const value = responseCostBound({model:record.model,max_output_tokens:record.max_output_tokens},65536-record.max_output_tokens);
  if (!value) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
  return value.maximumUsd;
}
export { methodCoverageAssessmentSchema } from "./method-coverage-contracts";
// Scientific definition is deliberately absent. It is copied from the frozen
// selector, not rewritten by the methodological reconstruction model.
export const methodologicalReconstructionSchema = z.object({
  alternatives: z.array(z.object({
    id: text, primaryMethod: text, label: text, corpusRoles:corpusRoleRefinementProposalSchema,
    researchDesign: researchDesignSchema.omit({ unit_population_corpus: true, constructs: true, data_material_sources: true, pending_decisions: true }),
    methodComponents: z.array(z.object({ name: text, kind: z.enum(["method", "technique"]), role: text,
      inputs: texts, outputs: texts, dependencies: texts, support: z.array(evidencePointerSchema) }).strict()).min(1),
    qualitativeComponent: text.nullable(), quantitativeComponent: text.nullable(), integrationStrategy: text.nullable(),
    integrationPurpose: text.nullable(), methodHandoffs: z.array(z.object({from:text,to:text,transferred_output:text,use_by_next_method:text}).strict()),
    feasibility: text, dataRequirements: z.array(z.object({ description: text, availability: z.enum(["PENDING", "PROPOSED"]), confirmation_or_action: text }).strict()),
    limitations: texts, rationale: text, coverageProposal: methodCoverageMatrixProposalSchema,
  }).strict()).min(1).max(2),
  selectedId: text, selectionRationale: text,
}).strict();

/** Method-only changes; no model field can overwrite frozen scientific authority. */
export function applyMethodReconstruction(bundle: ScientificDecisionBundle, patch: z.infer<typeof methodologicalReconstructionSchema>["alternatives"][number], pack: MethodEvidencePack) {
  const original = designAlternativeV2Schema.parse(bundle.decision.alternatives.find(a => a.id === bundle.decision.recommended_id));
  if (![`${original.id}-R1`, "A2", "A3"].includes(patch.id)) throw new Error("METHOD_RECONSTRUCTION_ALTERNATIVE_INVALID");
  const priorConfirmed = original.data_requirements.filter(row => row.availability === "USER_CONFIRMED");
  const next = designAlternativeV2Schema.parse({ ...original, id: patch.id, label: patch.label, primary_method: patch.primaryMethod,
    research_design: { ...original.research_design, ...patch.researchDesign,
      // Neither class handling nor a methodology choice can narrow these fields.
      unit_population_corpus: original.research_design.unit_population_corpus,
      constructs: original.research_design.constructs, data_material_sources: original.research_design.data_material_sources,
      pending_decisions: [], limitations: [...new Set([...original.research_design.limitations, ...patch.researchDesign.limitations, ...patch.limitations])],
    },
    components: normalizeDeclaredMethodHandoffs([...original.components.filter(c => c.kind !== "method" && c.kind !== "technique"), ...patch.methodComponents],patch.methodHandoffs).components,
    qualitative_component: patch.qualitativeComponent, quantitative_component: patch.quantitativeComponent,
    integration_strategy: patch.integrationStrategy, integration_purpose: patch.integrationPurpose, method_handoffs: patch.methodHandoffs,
    feasibility: patch.feasibility, data_requirements: [...priorConfirmed, ...patch.dataRequirements],
    transfer_limits: [...new Set([...original.transfer_limits, ...patch.limitations])], pending_user_decisions: [],
  });
  if (fingerprint(next.definition) !== fingerprint(original.definition) || next.scope_fulfilled !== original.scope_fulfilled ||
      next.scope_effect !== "preserves" || next.scope_changes.length) throw new Error("METHOD_RECONSTRUCTION_SCOPE_CHANGED");
  validateScientificDecision({ ...bundle.decision, alternatives: [next], recommended_id: next.id }, bundle.intent, pack);
  return next;
}

type Input = { researchSupport?: typeof researchDesignSupport; maxResearchOperations?: 2 | 4; userId: string; projectId: string; runId: string; provider?: LlmProvider; inheritedSupport: DesignSupportSource[] };
export async function resolveMethodCoverage(bundle: ScientificDecisionBundle, input: Input) {
  const jobId = currentJobExecution()?.jobId ?? input.runId;
  const maxResearchOperations = input.maxResearchOperations ?? 2;
  return stageCheckpoint("AUTONOMOUS_DESIGN", { decisionFingerprint: bundle.decisionFingerprint,
    policyVersion: METHOD_COVERAGE_RESOLUTION_POLICY, maxResearchOperations, support: input.inheritedSupport.map(s => [s.sourceId,s.document.sha256]) }, async () => {
    const provider = input.provider ?? getConfiguredLlmProvider();
    const original = designAlternativeV2Schema.parse(bundle.decision.alternatives.find(a => a.id === bundle.decision.recommended_id));
    const findings = bundle.critique.assessments.find(a => a.alternative_id === original.id)!.critical_findings;
    const mandatoryRemaining = mandatoryCompositionReservationFloor(bundle, original.id).reduce((sum,p) => sum+p.minimumReservationUsd,0);
    const remainingMethodReview = contextCapacityCostBound(criticPrompt);
    const remainingMethodRepair = contextCapacityCostBound(reconstructionPrompt);
    let sources = [...input.inheritedSupport];
    let researchOperations = 0, acquiredDocuments = 0;
    const operations: Awaited<ReturnType<typeof researchDesignSupport>>["operations"] = [];
    const researchAudit: unknown[] = [];
    const observedGaps = new Map<string, DesignSupportGap>();
    const reseal = () => sealDesignSupport({ userId: input.userId, projectId: input.projectId, jobId,
      definitionHash: bundle.contextFingerprint, policyVersion: METHOD_COVERAGE_RESOLUTION_POLICY, sources });
    let addendum = reseal(), pack = augmentMethodEvidencePack(bundle.evidence_pack, addendum);
    async function call<S extends z.ZodType>(key: string, schema: S, record: typeof assessmentPrompt | typeof reconstructionPrompt | typeof criticPrompt, context: unknown): Promise<z.infer<S>> {
      const remainingAfterCall = mandatoryRemaining + (record.id === reconstructionPrompt.id ? remainingMethodReview :
        record.id === assessmentPrompt.id ? remainingMethodRepair + remainingMethodReview : 0);
      const prompt = `${record.systemPrompt}\n\nCONTEXTO VERIFICABLE:\n${stableJson(context)}`;
      const request: StructuredObjectInput & { model: string } = { prompt, schema: z.toJSONSchema(schema), schemaName: key.toLowerCase(),
        model: record.model, reasoningEffort: record.reasoning_effort, maxOutputTokens: record.max_output_tokens, maxRetries: 0,
        trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "method_coverage", promptVersion: record.version } };
      const checkpointInput = { request, policy: METHOD_COVERAGE_RESOLUTION_POLICY, effectiveEvidenceFingerprint: addendum.checksum };
      const actualKey = await versionedCheckpointKey(key, checkpointInput);
      const saved = await readCompletedCheckpoint<z.infer<S>>(actualKey, checkpointInput);
      if (saved) return schema.parse(saved);
      const bound = provider.estimateStructuredRequest ? await provider.estimateStructuredRequest(request) : responseCostBound({ model: request.model, input: prompt,
        text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } },
        reasoning: { effort: request.reasoningEffort }, max_output_tokens: request.maxOutputTokens! });
      if (!bound || bound.inputTokens + record.max_output_tokens > 65536) throw new Error("METHOD_COVERAGE_CONTEXT_UNSAFE");
      await stageCheckpoint(`${actualKey}_FORECAST`, { requestHash: fingerprint(request) }, async () => ({
        promptBytes: Buffer.byteLength(prompt), inputTokens: bound.inputTokens, countProvenance: bound.tokenCountProvenance,
        maximumUsd: bound.maximumUsd, minimumRemainingMandatoryReservation: remainingAfterCall,
        effectiveEvidenceFingerprint: addendum.checksum,
      }));
      // A resumed background response already owns its reservation. Persist the
      // original admission so retrieving it does not reserve its maximum twice.
      await stageCheckpoint(`METHOD_CALL_ADMISSION:${fingerprint(request)}`, { requestHash: fingerprint(request),
        minimumRemainingMandatoryReservation: remainingAfterCall }, async () => {
        await preflightWholeJobCost({ nextStage: key, nextStageReservation: bound.maximumUsd, minimumRemainingMandatoryReservation: remainingAfterCall });
        return { admitted: true, maximumUsd: bound.maximumUsd };
      });
      return schema.parse(await stageCheckpoint(actualKey, checkpointInput, () => scientificStructuredCall(provider, request, input)));
    }
    const digest = (required: Array<{source_id:string;evidence_id:string}> = []) => {
      const baseGap = designSupportGaps(bundle)[0];
      const gaps = [...new Set(sources.map(s=>s.gapId))].map(gapId=>observedGaps.get(gapId) ?? ({ ...baseGap, gapId }));
      // Corpus diagnosis needs all selected-source excerpts. Whole supplementary
      // passages remain persisted, with the existing digest ranking and audit.
      return buildDesignSupportDigest({ pack, addendum, identity: { userId:input.userId,projectId:input.projectId,jobId,definitionHash:bundle.contextFingerprint },
        gaps, requiredPointers: [...bundle.evidence_pack.items.map(i=>({source_id:i.source_id,evidence_id:i.evidence_id})), ...required] });
    };
    const initialDigest = digest(original.research_design.methodological_support);
    const assessment = await call("METHOD_COVERAGE_ASSESSMENT_V1", methodCoverageAssessmentSchema, assessmentPrompt,
      { frozenIntent: bundle.intent, historicalAlternative: original, historicalFindings: findings,
        userSelectedSourceIds: bundle.evidence_pack.selected_sources.map(source => source.source_id),
        systemDesignSupportSourceIds: sources.map(source => source.sourceId),
        existingEvidence: digestPromptContext(initialDigest), classPresenceRule: "OBSERVED requires at least one primary sourceAssignment of that class. Secondary components do not create another observed work. A future admissible class with no primary selected work is CONTINGENT, justified by frozen intent. SYSTEM_DESIGN_SUPPORT never enters sourceAssignments or classification basis; it may support method coverage." });
    let profile = buildCorpusMethodProfile({ intent: bundle.intent, pack: bundle.evidence_pack,
      frozenInputFingerprint: bundle.contextFingerprint, proposal: assessment.corpusProposal });
    const originalProfile = profile;
    let matrix = buildMethodCoverageMatrix({ proposal: assessment.coverageProposal, profile, pack, effectiveEvidenceFingerprint: addendum.checksum });
    const initialSupplied = new Set(initialDigest.passages.map(p=>`${p.source_id}:${p.evidence_id}`));
    if (methodCoverageCells(matrix).flatMap(c=>c.supportPointers).some(p=>!initialSupplied.has(`${p.source_id}:${p.evidence_id}`))) throw new Error("METHOD_COVERAGE_POINTER_NOT_SUPPLIED");
    await stageCheckpoint("CORPUS_METHOD_PROFILE_V1", { source: fingerprint(assessment), context: bundle.contextFingerprint }, async () => profile);
    await stageCheckpoint("METHOD_COVERAGE_BEFORE_V1", { profile: profile.profileFingerprint, evidence: addendum.checksum }, async () => matrix);

    async function fillGaps(current: MethodCoverageMatrix, questions: z.infer<typeof methodCoverageAssessmentSchema>["researchQuestions"]) {
      const unresolved = methodCoverageGaps(current);
      for (const question of questions) {
        if (researchOperations >= maxResearchOperations || acquiredDocuments >= 4) break;
        const cells = unresolved.filter(cell=>question.cellIds.includes(cell.cellId));
        if (!cells.length) continue;
        // A prior grouped question remains useful after another cell was solved.
        // Preserve its meaning but authorize only its still-unresolved cells.
        const pendingQuestion = { ...question, cellIds: cells.map(cell => cell.cellId) };
        const gap: DesignSupportGap = { gapId: `method-cell-${fingerprint([profile.profileFingerprint,pendingQuestion.cellIds,question.question]).slice(0,20)}`,
          alternativeId: original.id, findingCodes: findings.map(f=>f.code), origin: "TARGETED_CRITIC",
          question: question.question, whyMaterial: question.rationale, affectedClaim: cells.map(c=>c.claim).join("; "),
          requiredEvidenceType: "SCHOLARLY_METHOD_OR_STANDARD", searchProjection: question.question,
          existingEvidenceIds: pack.items.map(i=>`${i.source_id}:${i.evidence_id}`), availableEvidence: [],
          scopeBoundary: bundle.intent.scope, maxCandidates: 5, status: "OPEN" };
        observedGaps.set(gap.gapId, gap);
        const bound = webDiscoveryPolicyCostBound(DESIGN_MINI_RESEARCH_POLICY);
        if (!bound) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
        const nextResearchOrdinal = researchOperations + 1;
        // Keep acquisition capacity for independent unresolved method layers;
        // two near-identical manuals must not exhaust all four documents early.
        const remainingGroups = questions.filter(candidate => candidate.cellIds.some(id => unresolved.some(cell => cell.cellId === id))).length;
        const documentAllowance = Math.min(4 - acquiredDocuments,
          Math.max(1, 4 - acquiredDocuments - Math.min(maxResearchOperations - researchOperations - 1, remainingGroups - 1)));
        const result = await (input.researchSupport ?? researchDesignSupport)({ ...input, bundle, gaps:[gap], knownSupport:sources,
          methodCoverage: { version:METHOD_COVERAGE_RESOLUTION_POLICY, ordinal:nextResearchOrdinal,cellIds:pendingQuestion.cellIds,documentAllowance },
          focusedQuestion: question.question,
          beforeDiscovery:()=>preflightWholeJobCost({nextStage:"method_coverage_research",nextStageReservation:bound.maximumUsd,minimumRemainingMandatoryReservation:mandatoryRemaining+remainingMethodRepair+remainingMethodReview}).then(()=>undefined) });
        if (!result.operations.length) throw new Error("METHOD_RESEARCH_NOT_DISPATCHED: no existe una operación externa recuperable; se conserva el checkpoint y no se paga una reconstrucción sin respaldo nuevo.");
        if (result.operations.length !== 1) throw new Error("METHOD_RESEARCH_OPERATION_ACCOUNTING_INVALID");
        researchOperations = nextResearchOrdinal;
        operations.push(...result.operations);
        const fresh = result.support.filter(s=>!sources.some(old=>old.document.sha256===s.document.sha256));
        const received = result.acquiredDocuments;
        // Legacy cached operations did not retain rejected downloads. Count their
        // full per-operation allowance conservatively, never just admitted works.
        const acquiredThisOperation = received === undefined ? Math.min(2, 4 - acquiredDocuments) : received;
        if (!Number.isInteger(acquiredThisOperation) || acquiredThisOperation < fresh.length || acquiredThisOperation > Math.min(2, 4 - acquiredDocuments))
          throw new Error("METHOD_RESEARCH_ACQUISITION_ACCOUNTING_INVALID");
        sources.push(...fresh); acquiredDocuments += acquiredThisOperation;
        researchAudit.push({ question:pendingQuestion, status:result.status, limitations:result.limitations, addedSources:fresh.map(s=>s.sourceId), acquiredDocuments:acquiredThisOperation, cumulativeAcquiredDocuments:acquiredDocuments, operationIds:result.operations.map(o=>o.operationId) });
        addendum = reseal(); pack = augmentMethodEvidencePack(bundle.evidence_pack,addendum);
        // Stop the batch after useful material: reassess coverage before spending
        // on another question the same source may already answer.
        if (fresh.length) break;
      }
    }

    let questions = assessment.researchQuestions;
    for (let round=1;round<=maxResearchOperations+1;round++) {
      if (methodCoverageGaps(matrix).length) await fillGaps(matrix,questions);
      const contextDigest = digest(methodCoverageCells(matrix).flatMap(c=>c.supportPointers));
      await stageCheckpoint(`METHOD_COVERAGE_DIGEST_${round}`, { fingerprint:contextDigest.digestFingerprint }, async()=>contextDigest);
      const reconstruction = await call(`METHOD_RECONSTRUCTION_V1_${round}`, methodologicalReconstructionSchema, reconstructionPrompt,
        { frozenIntent:bundle.intent, immutableDefinition:original.definition, historicalAlternative:original,
          historicalFindings:findings, originalCorpus:originalProfile, corpus:profile, previousCoverage:matrix, evidence:digestPromptContext(contextDigest), researchAudit });
      const selected = reconstruction.alternatives.find(a=>a.id===reconstruction.selectedId);
      if (!selected || new Set(reconstruction.alternatives.map(a=>a.id)).size!==reconstruction.alternatives.length) throw new Error("METHOD_SELECTION_INVALID");
      const graph = normalizeDeclaredMethodHandoffs([...original.components.filter(c => c.kind !== "method" && c.kind !== "technique"), ...selected.methodComponents],selected.methodHandoffs);
      const graphInput = { reconstruction:fingerprint(selected),normalizationVersion:graph.audit.version };
      const graphKey = await versionedCheckpointKey(`METHOD_GRAPH_NORMALIZATION_${round}`,graphInput);
      await stageCheckpoint(graphKey,graphInput,async()=>graph.audit);
      const alternative = applyMethodReconstruction(bundle,selected,pack);
      const roleDerivation = deriveCorpusMethodRoles(originalProfile,selected.corpusRoles);
      const roleInput = { originalProfileFingerprint:originalProfile.profileFingerprint,derivationFingerprint:roleDerivation.audit.derivationFingerprint };
      const roleKey = await versionedCheckpointKey(`METHOD_CORPUS_ROLES_${round}`,roleInput);
      await stageCheckpoint(roleKey,roleInput,async()=>roleDerivation);
      profile = roleDerivation.profile;
      matrix = buildMethodCoverageMatrix({ proposal:selected.coverageProposal,profile,pack,effectiveEvidenceFingerprint:addendum.checksum });
      // Do not pay an independent review when reconstruction itself identifies
      // an unresolved operation. Acquire only those cells and version the input.
      if (methodCoverageGaps(matrix).length && researchOperations < maxResearchOperations && acquiredDocuments < 4) {
        const remaining = methodCoverageGaps(matrix);
        const usedQuestions = new Set(researchAudit.map(row => (row as { question: { question: string } }).question.question));
        questions = assessment.researchQuestions.filter(question => !usedQuestions.has(question.question) && question.cellIds.some(id => remaining.some(cell => cell.cellId === id)));
        if (!questions.length) questions = remaining.map(g=>({cellIds:[g.cellId],question:g.question,rationale:g.claim})).slice(0,4);
        continue;
      }
      const pointers = methodCoverageCells(matrix).flatMap(c=>c.supportPointers);
      const supplied = new Set(contextDigest.passages.map(i=>`${i.source_id}:${i.evidence_id}`));
      if ([...pointers,...alternative.research_design.methodological_support].some(p=>!supplied.has(`${p.source_id}:${p.evidence_id}`))) throw new Error("METHOD_COVERAGE_POINTER_NOT_SUPPLIED");
      const critiqueProposal = await call(`METHOD_COVERAGE_CRITIC_V1_${round}`, methodCoverageCritiqueProposalSchema, criticPrompt,
        { frozenIntent:bundle.intent, immutableDefinition:original.definition, originalCorpus:originalProfile, corpus:profile,
          roleRefinement:roleDerivation.audit,coverageMatrix:matrix,
          alternative, historicalFindings:findings, evidence:digestPromptContext(contextDigest) });
      const critique = bindMethodCoverageCritique(critiqueProposal,matrix);
      const result = validateMethodCoverageCritique(critique,{matrix,profile,pack,effectiveEvidenceFingerprint:addendum.checksum,
        alternativeId:alternative.id,findingCodes:findings.map(f=>f.code)});
      await stageCheckpoint(`METHOD_COVERAGE_REVIEW_${round}`, { critiqueHash:fingerprint(critique),matrixHash:fingerprint(matrix) },async()=>result);
      if (result.evidenceSupported && critique.intentPreserved && critique.methodCoherent && !critique.blockingScientificIssue) {
        const reviewedCell = (cell: typeof matrix.crossClassIntegration) => {
          const review = critique.cellAssessments.find(c=>c.cellId===cell.cellId)!;
          return { ...cell,coverageStatus:review.coverageStatus,
            futureRequirements:[...new Set([...cell.futureRequirements,...review.futureRequirements])],
            limitations:[...new Set([...cell.limitations,...review.limitations])] };
        };
        matrix = { ...matrix,corpusClasses:matrix.corpusClasses.map(c=>({...c,operations:c.operations.map(reviewedCell)})),
          crossClassIntegration:reviewedCell(matrix.crossClassIntegration),overallCoverageStatus:result.overallCoverageStatus };
        alternative.research_design.limitations.push(...methodCoverageCells(matrix).flatMap(c=>[...c.futureRequirements,...c.limitations]));
        const required = new Set(pointers.map(p=>`${p.source_id}:${p.evidence_id}`));
        alternative.research_design.methodological_support = [...new Map([...alternative.research_design.methodological_support,...pointers].map(p=>[`${p.source_id}:${p.evidence_id}`,p])).values()];
        alternative.research_design.limitations = [...new Set([...alternative.research_design.limitations,...critique.limitations,...critique.findingAssessments.map(f=>f.retainedPlanTreatment)])];
        const targetedReview = { alternativeId:alternative.id,intentPreserved:critique.intentPreserved,methodCoherent:critique.methodCoherent,
          evidenceSupported:result.evidenceSupported,blockingScientificIssue:critique.blockingScientificIssue,blockingReason:critique.blockingReason,
          limitations:critique.limitations,resolvedFindingCodes:[],unresolvedFindingCodes:[],deferredAsFutureRequirementCodes:[] };
        return { supportAddendum:addendum,effectiveEvidenceFingerprint:addendum.checksum,decisionFingerprint:bundle.decisionFingerprint,
          contextFingerprint:bundle.contextFingerprint,academicLevel:bundle.academicLevel,alternative,critique:bundle.critique,
          deterministicResolution:null,targetedReview,revised:true,designSupport:{status:"VERIFIED_SUPPORT",support:sources,operations,limitations:[]},
          policyVersion:METHOD_COVERAGE_RESOLUTION_POLICY,corpusProfile:profile,originalCorpusProfile:originalProfile,roleRefinement:roleDerivation.audit,methodCoverage:matrix,methodCoverageCritique:critique,
          coverageResult:result,selectedMethodEvidencePointers:[...required],researchAudit };
      }
      // A new versioned review can request only the precise cells it rejected.
      // Other limitations remain in the plan and do not trigger discovery.
      if (!critique.corpusClassificationValid) throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: clasificación del corpus rechazada; no se repite búsqueda sobre una premisa no validada.");
      const failed = new Map(critique.cellAssessments.filter(c=>methodCoverageCells(matrix).find(cell=>cell.cellId===c.cellId)?.required && (c.coverageStatus==="UNSUPPORTED"||!c.transferSupported)).map(c=>[c.cellId,c]));
      matrix = { ...matrix, corpusClasses:matrix.corpusClasses.map(c=>({...c,operations:c.operations.map(o=>failed.has(o.cellId)?{...o,coverageStatus:"UNSUPPORTED" as const}:o)})),
        crossClassIntegration:failed.has(matrix.crossClassIntegration.cellId)?{...matrix.crossClassIntegration,coverageStatus:"UNSUPPORTED"}:matrix.crossClassIntegration,
        overallCoverageStatus:"UNSUPPORTED" };
      questions = methodCoverageGaps(matrix).map(g=>({cellIds:[g.cellId],question:g.question,rationale:failed.get(g.cellId)?.reason??g.claim})).slice(0,4);
      if (!questions.length || researchOperations>=maxResearchOperations || acquiredDocuments>=4 || !critique.intentPreserved) break;
    }
    throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: la cobertura metodológica requerida no obtuvo validación independiente; se conservan los resultados y costes.");
  });
}
