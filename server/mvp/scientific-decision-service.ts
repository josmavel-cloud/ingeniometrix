import { z } from "zod";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { openAiBackgroundRequestFingerprint } from "@/llm/providers/openai";
import type { LlmProvider, StructuredObjectInput } from "@/llm/provider";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { currentJobExecution, fingerprint, preflightWholeJobCost, stageCheckpoint, versionedCheckpointKey, readCompletedCheckpoint, stableJson } from "./job-execution-context";
import { assessEvidenceCoverage } from "./evidence-coverage";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import { autonomousDesignEvidencePatchSchema, accountDecisionSources, alternativeCanBeConfirmed, alternativeIsApprovable, autonomousDesignPatchSchema, buildMethodEvidencePack, criticAttemptEnvelopeSchema, decisionContextFingerprint, designCritiqueSchema, designRepairSchema, intentFromIntake, scientificDecisionV2Schema, targetedAutonomousCriticSchema, validateDesignCritique, validateScientificDecision, type DesignAlternative, type DesignCritique, type MethodEvidencePack, type ResearchIntentContract, type ScientificDecision } from "./scientific-decision-contracts";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as selector } from "./prompts/scientific-design-selector.v3";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT as critic } from "./prompts/scientific-design-critic.v3";
import { SCIENTIFIC_DESIGN_CRITIC_RECOVERY_PROMPT as criticRecovery } from "./prompts/scientific-design-critic-recovery.v1";
import { SCIENTIFIC_DESIGN_REPAIR_PROMPT as repair } from "./prompts/scientific-design-repair.v1";
import { SCIENTIFIC_DESIGN_OUTPUT_REPAIR_PROMPT as outputRepair } from "./prompts/scientific-design-output-repair.v1";
import { SCIENTIFIC_DESIGN_AUTONOMOUS_PATCH_PROMPT as autonomousPatch, SCIENTIFIC_DESIGN_AUTONOMOUS_PATCH_PROMPT_DIGEST as digestPatch } from "./prompts/scientific-design-autonomous-patch.v1";
import { SCIENTIFIC_DESIGN_AUTONOMOUS_TARGETED_CRITIC_PROMPT as targetedCritic, SCIENTIFIC_DESIGN_AUTONOMOUS_TARGETED_CRITIC_PROMPT_DIGEST as digestCritic } from "./prompts/scientific-design-autonomous-targeted-critic.v1";
import { applyAutonomousDesignPatch, compactAlternativeForRepair, compactCriticEvidence, compactPatchReview, inScopeAlternatives, resolveNonmaterialDecisions } from "./autonomous-design-resolution";
import { mandatoryCompositionReservationFloor, designSupportRemainingForecast } from "./whole-job-cost-forecast";
import { designSupportGaps, isFutureRequirementFinding } from "./design-support-gap";
import { webDiscoveryPolicyCostBound } from "@/server/retrieval/astra-web-cost-policy";
import { augmentMethodEvidencePack, effectiveGenerationLedger, sealDesignSupport, type DesignSupportAddendum } from "./design-support-addendum";
import { researchDesignSupport, DESIGN_MINI_RESEARCH_POLICY } from "./design-mini-research";
import { buildDesignSupportDigest, digestPromptContext, DESIGN_SUPPORT_DIGEST_VERSION } from "./design-support-digest";
import { reuseProjectDesignSupport } from "./design-support-reuse";
import { appendGenerationInput, currentGenerationInput, frozenProject, researchProjectFingerprint } from "@/server/projects/generation-input-snapshot";

export const SCIENTIFIC_DECISION_STAGE = "checkpoint:SCIENTIFIC_DECISION";
export const SCIENTIFIC_APPROVAL_STAGE = "approval:SCIENTIFIC_DESIGN";
export const AUTONOMOUS_DESIGN_STAGE = "checkpoint:AUTONOMOUS_DESIGN";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const criticRequiredFields = ["assessments", "alternative_id", "decision", "intent_preserved", "scope", "status", "current_user_intent", "recommended_scope", "difference", "rationale", "confirmation_required", "confirmed", "theory_framework_fit", "method_fit", "method_integration", "mixed_methods_validity", "data_feasibility", "validation_strategy", "procedural_executability", "evidence_support", "transferability", "uncertainty_disclosure", "question_objective_method_alignment", "complexity_discipline", "novelty_discipline", "academic_level_fit", "critical_findings", "user_decisions_required", "repair_targets"];
export function missingCriticSchemaFields(partial: string) { return criticRequiredFields.filter((field) => !partial.includes(`\"${field}\"`)); }
export async function critiqueScientificDecision(input: { projectId: string; runId: string; intent: ResearchIntentContract; pack: MethodEvidencePack; decision: ScientificDecision; provider: LlmProvider; previousIncomplete?: { partialOutput: string; reason: string }; allowRecovery?: boolean; checkpointPrefix?: string }) {
  const promptRecords: unknown[] = [];
  async function attempt(key: string, record: typeof critic | typeof criticRecovery, variables: Record<string, unknown>) {
    const prompt = `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, variable: string) => stableJson(variables[variable]))}`;
    if (Buffer.byteLength(prompt) > 60000) throw new Error("USER_ACTION_REQUIRED: el contexto de crítica necesita una selección más acotada; no se truncó evidencia.");
    const schemaJson = z.toJSONSchema(designCritiqueSchema);
    const value = await stageCheckpoint(`${key}_RESPONSE`, { prompt, schemaJson, model: record.model, effort: record.reasoning_effort, output: record.max_output_tokens }, async () => {
      try {
        const request = { prompt, schema: schemaJson, schemaName: key.toLowerCase(), model: record.model, reasoningEffort: record.reasoning_effort, maxOutputTokens: record.max_output_tokens, maxRetries: 0 as const, trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "scientific_design_critic", promptVersion: record.version, schemaName: key.toLowerCase() } };
        const background = currentJobExecution() && input.provider.generateBackgroundStructuredObject;
        const critique = designCritiqueSchema.parse(await (background
          ? background({ ...request, logicalAttemptKey: fingerprint({ projectId: input.projectId, runId: input.runId, key, promptHash: fingerprint(prompt), version: record.version }), requestFingerprint: openAiBackgroundRequestFingerprint(request) })
          : input.provider.generateStructuredObject(request)));
        return criticAttemptEnvelopeSchema.parse({ status: "COMPLETE", critique, incomplete_output: null, incomplete_reason: null, missing_schema_fields: [] });
      } catch (error) {
        if (error instanceof IncompleteStructuredOutputError) return criticAttemptEnvelopeSchema.parse({ status: error.reason === "max_output_tokens" ? "INCOMPLETE_TOKEN_LIMIT" : "INCOMPLETE_PROVIDER", critique: null, incomplete_output: error.partialOutput, incomplete_reason: error.reason, missing_schema_fields: missingCriticSchemaFields(error.partialOutput) });
        if (error instanceof z.ZodError || error instanceof SyntaxError) return criticAttemptEnvelopeSchema.parse({ status: "INVALID_SCHEMA", critique: null, incomplete_output: null, incomplete_reason: error.message, missing_schema_fields: criticRequiredFields });
        return criticAttemptEnvelopeSchema.parse({ status: "FAILED", critique: null, incomplete_output: null, incomplete_reason: error instanceof Error ? error.message : String(error), missing_schema_fields: [] });
      }
    });
    promptRecords.push({ id: record.id, version: record.version, model: record.model, reasoning_effort: record.reasoning_effort, max_output_tokens: record.max_output_tokens, variables: record.variables, schema: schemaJson, actual_roles: "single concatenated Responses input", completion_status: value.status, request_hash: fingerprint(prompt) });
    return value;
  }
  const first = input.previousIncomplete ? criticAttemptEnvelopeSchema.parse({ status: input.previousIncomplete.reason === "max_output_tokens" ? "INCOMPLETE_TOKEN_LIMIT" : "INCOMPLETE_PROVIDER", critique: null, incomplete_output: input.previousIncomplete.partialOutput, incomplete_reason: input.previousIncomplete.reason, missing_schema_fields: missingCriticSchemaFields(input.previousIncomplete.partialOutput) }) : await attempt(`${input.checkpointPrefix ?? "DESIGN"}_CRITIC_0`, critic, { intent_json: input.intent, method_evidence_pack_json: input.pack, decision_json: input.decision });
  const final = first.status === "INCOMPLETE_TOKEN_LIMIT" && input.allowRecovery !== false ? await attempt(`${input.checkpointPrefix ?? "DESIGN"}_CRITIC_RECOVERY_1`, criticRecovery, { intent_json: input.intent, method_evidence_pack_json: input.pack, decision_json: input.decision, incomplete_critic_json: first.incomplete_output, missing_schema_fields_json: first.missing_schema_fields }) : first;
  if (final.status !== "COMPLETE" || !final.critique) throw new Error(`SCIENTIFIC_CRITIC_${final.status}: ${final.incomplete_reason ?? "sin dictamen completo"}`);
  validateDesignCritique(input.decision, final.critique);
  return { critique: final.critique, completion: { first: first.status, recovery: first === final ? null : final.status, recoveryCalls: first === final ? 0 : 1 }, promptRecords };
}
export async function proposeScientificDecision(input: { projectId: string; runId: string; intake: Record<string, unknown>; academicLevel: string; ledger: MvpStep5EvidenceLedger; provider?: LlmProvider }) {
  const coverage = assessEvidenceCoverage(input.ledger);
  if (coverage.status === "INSUFFICIENT") throw new Error(`INSUFFICIENT_EVIDENCE_COVERAGE: aporta extractos verificables para ${coverage.uncovered_dimensions.join(", ")}; concreta problema, unidad de estudio, datos disponibles y validación antes de proponer metodología.`);
  const intent = intentFromIntake({ ...input.intake, degreeLevel: input.academicLevel });
  const pack = buildMethodEvidencePack(input.ledger);
  const contextFingerprint = decisionContextFingerprint(input.intake, input.ledger);
  const policy = { selector, critic, criticRecovery, repair, outputRepair, repair_rounds: 1, critic_calls: 1, critic_recovery_calls: 1, contextFingerprint, academicLevel: input.academicLevel };
  return stageCheckpoint("SCIENTIFIC_DECISION", policy, async () => {
    const provider = input.provider ?? getConfiguredLlmProvider();
    const promptRecords: unknown[] = [];
    async function call<S extends z.ZodType>(key: string, schema: S, record: typeof selector | typeof repair | typeof outputRepair, variables: Record<string, unknown>): Promise<z.infer<S>> {
      const prompt = `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, variable: string) => stableJson(variables[variable]))}`;
      if (Buffer.byteLength(prompt) > 60000) throw new Error("USER_ACTION_REQUIRED: el contexto de diseño necesita una selección más acotada; no se truncó evidencia.");
      const schemaJson = z.toJSONSchema(schema);
      const request = { prompt, schema: schemaJson, schemaName: key.toLowerCase(), model: record.model, reasoningEffort: record.reasoning_effort, maxOutputTokens: record.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "scientific_design", promptVersion: record.version, schemaName: key.toLowerCase() } } as const;
      const background = key === "DESIGN_SELECTOR_0" && provider.generateBackgroundStructuredObject;
      const result = schema.parse(await stageCheckpoint(key, { prompt, schemaJson, model: record.model, effort: record.reasoning_effort, output: record.max_output_tokens }, () => background
        ? background({ ...request, logicalAttemptKey: fingerprint({ evaluationCase: `${input.projectId}:${input.runId}:scientific-design`, frozenInputFingerprint: contextFingerprint, promptVersion: record.version, model: record.model, reasoning: record.reasoning_effort, attempt: 0 }), requestFingerprint: openAiBackgroundRequestFingerprint({ ...request, model: record.model }) })
        : provider.generateStructuredObject(request)));
      promptRecords.push({ ...record, actual_roles: "single concatenated Responses input", schema: schemaJson, transport: background ? "Responses background create once + retrieve by response_id" : "foreground Responses", retry_policy: "one selector, one critic, at most one targeted repair; evaluation transport retries disabled", request_hash: fingerprint(prompt) });
      return result;
    }
    let round = 0;
    // Persist the incomplete response as an envelope so restart cannot pay for the
    // initial selector again. Output repair and critique repair share ONE allowance.
    const selected = await stageCheckpoint("DESIGN_SELECTOR_RESPONSE", { selector, contextFingerprint, academicLevel: input.academicLevel }, async () => {
      try { return { decision: await call("DESIGN_SELECTOR_0", scientificDecisionV2Schema, selector, { intent_json: intent, method_evidence_pack_json: pack }), partial: null as string | null }; }
      catch (error) { if (!(error instanceof IncompleteStructuredOutputError) || error.reason !== "max_output_tokens" || !error.partialOutput) throw error; return { decision: null, partial: error.partialOutput }; }
    });
    let decision: ScientificDecision;
    if (selected.partial !== null) {
      round = 1;
      decision = await call("DESIGN_REPAIR_1", scientificDecisionV2Schema, outputRepair, { intent_json: intent, method_evidence_pack_json: pack, partial_output_json: selected.partial });
    } else decision = selected.decision!;
    validateScientificDecision(decision, intent, pack);
    let critique: DesignCritique = { assessments: [] };
    let criticCompletion = { first: "COMPLETE", recovery: null as string | null, recoveryCalls: 0 };
    if (decision.alternatives.length) {
      const reviewed = await critiqueScientificDecision({ projectId: input.projectId, runId: input.runId, intent, pack, decision, provider });
      critique = reviewed.critique; criticCompletion = reviewed.completion; promptRecords.push(...reviewed.promptRecords);
      const correctable = decision.alternatives.filter((a) => critique.assessments.find((assessment) => assessment.alternative_id === a.id)?.decision === "REPAIR_REQUIRED" && !a.pending_user_decisions.some((d) => d.blocking) && !(critique.assessments.find((assessment) => assessment.alternative_id === a.id)?.user_decisions_required.length));
      if (round === 0 && !decision.alternatives.some((a) => alternativeCanBeConfirmed(a, critique)) && correctable.length) {
        const patch = await call("DESIGN_REPAIR_1", designRepairSchema, repair, { intent_json: intent, method_evidence_pack_json: pack, decision_json: decision, critique_json: critique });
        const allowed = new Set(correctable.map((a) => a.id));
        if (new Set(patch.replacements.map((a) => a.id)).size !== patch.replacements.length || patch.replacements.some((a) => !allowed.has(a.id))) throw new Error("DESIGN_REPAIR_SCOPE_INVALID");
        decision = { ...decision, alternatives: decision.alternatives.map((a) => patch.replacements.find((replacement) => replacement.id === a.id) ?? a) };
        validateScientificDecision(decision, intent, pack);
        // The original independent criticism is retained. A repair cannot self-certify.
        for (const a of patch.replacements) a.pending_user_decisions.push({ question: "La corrección requiere revisar los hallazgos del dictamen antes de confirmar el diseño.", blocking: true });
        round = 1;
      }
    }
    const value = { intent, evidence_pack: pack, source_decisions: accountDecisionSources(pack, decision), decision, critique, critic_completion: criticCompletion, repair_rounds: Math.min(round, 1), contextFingerprint, academicLevel: input.academicLevel, prompt_records: promptRecords };
    return { ...value, decisionFingerprint: fingerprint(value) };
  });
}
export type ScientificDecisionBundle = Awaited<ReturnType<typeof proposeScientificDecision>>;

export async function recommendDesignForJob(input: { jobId: string; userId: string; projectId: string; runId: string; stepRunId: string }) {
  const project = frozenProject(await prisma.project.findFirstOrThrow({ where: { id: input.projectId, userId: input.userId }, include: { intake: true } }))!;
  const ledgerRow = await prisma.projectEvidenceLedger.findFirstOrThrow({ where: { projectId: input.projectId, stepRunId: input.stepRunId } });
  const ledger = ledgerRow.ledgerJson as unknown as MvpStep5EvidenceLedger;
  if (ledger.project_id !== input.projectId || ledger.step_run_id !== input.stepRunId) throw new Error("EVIDENCE_CONTINUITY");
  return proposeScientificDecision({ projectId: input.projectId, runId: input.runId, intake: project.intake as unknown as Record<string, unknown>, academicLevel: project.degreeLevel, ledger });
}

export function selectAutonomousCandidate(decision: ScientificDecision, critique: DesignCritique) {
  const ordered = [...decision.alternatives].sort((a, b) => Number(b.id === decision.recommended_id) - Number(a.id === decision.recommended_id));
  return ordered.find((alternative) => {
    const assessment = critique.assessments.find((item) => item.alternative_id === alternative.id);
    return "scope_effect" in alternative && alternative.scope_effect === "preserves" && !alternative.scope_changes.length &&
      !alternative.pending_user_decisions.some((item) => item.blocking) &&
      assessment?.decision === "ACCEPT" && assessment.intent_preserved &&
      ["PRESERVED", "CLARIFIED"].includes(assessment.scope.status) &&
      !assessment.scope.confirmation_required && !assessment.user_decisions_required.length &&
      !assessment.critical_findings.some((finding) => finding.severity === "BLOCKING");
  });
}

// The saved selector and first independent critique remain the authority. A
// recovered job reuses both checkpoints and may pay for at most one revision and
// its independent critique. It cannot approve a scope change on the user's behalf.
export async function resolveAutonomousDesignForJob(input: { jobId: string; userId: string; projectId: string; runId: string }) {
  const row = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: input.jobId, stageKey: SCIENTIFIC_DECISION_STAGE } } });
  const bundle = (row.outputJson as unknown as { value: ScientificDecisionBundle }).value;
  if (!bundle?.decisionFingerprint || fingerprint({ intent: bundle.intent, evidence_pack: bundle.evidence_pack, source_decisions: bundle.source_decisions, decision: bundle.decision, critique: bundle.critique, critic_completion: bundle.critic_completion, repair_rounds: bundle.repair_rounds, contextFingerprint: bundle.contextFingerprint, academicLevel: bundle.academicLevel, prompt_records: bundle.prompt_records }) !== bundle.decisionFingerprint) throw new Error("SCIENTIFIC_DECISION_CHECKPOINT_INVALID");
  const job = await prisma.blueprintJob.findFirstOrThrow({ where: { id: input.jobId, projectId: input.projectId, userId: input.userId }, select: { stageDataJson: true } });
  const stepRunId = (job.stageDataJson as { step5?: { stepRunId: string } } | null)?.step5?.stepRunId;
  const ledgerRow = stepRunId ? await prisma.projectEvidenceLedger.findFirst({ where: { projectId: input.projectId, stepRunId } }) : null;
  return resolveAutonomousDesignBundle(bundle, { ...input,
    availableEvidencePack: ledgerRow ? buildMethodEvidencePack(ledgerRow.ledgerJson as unknown as MvpStep5EvidenceLedger, 30000) : undefined });
}

export async function resolveAutonomousDesignBundle(bundle: ScientificDecisionBundle,
  input: { userId: string; projectId: string; runId: string; provider?: LlmProvider;
    availableEvidencePack?: MethodEvidencePack;
    researchSupport?: typeof researchDesignSupport }) {
  return stageCheckpoint("AUTONOMOUS_DESIGN", { decisionFingerprint: bundle.decisionFingerprint, policyVersion: "autonomous-evidence-resolution.v5", patchVersion: digestPatch.version, maxRevisionLoops: 3 }, async () => {
    const decision = bundle.decision;
    const critique = bundle.critique;
    let revised = false;
    let designSupport: Awaited<ReturnType<typeof researchDesignSupport>> | null = null;
    let addendum: DesignSupportAddendum | null = null;
    let effectivePack = bundle.evidence_pack;
    let supportOperations = 0;
    let inspectedExisting = false;
    let inspectedPriorSupport = false;
    const gatherSupport = async (late?: typeof targetedAutonomousCriticSchema._output) => {
      const gaps = designSupportGaps(bundle, late);
      if (!gaps.length || supportOperations >= 2) return false;
      if (!inspectedExisting) {
        inspectedExisting = true;
        const additional = input.availableEvidencePack?.items.filter(item => item.allowed_use === "theory_or_method_support" &&
          !["ABSTRACT_METADATA", "VERIFIED_METADATA_ONLY"].includes(item.evidence_level) &&
          !effectivePack.items.some(old => old.source_id === item.source_id && old.evidence_id === item.evidence_id)) ?? [];
        if (additional.length) {
          effectivePack = { ...effectivePack, items: [...effectivePack.items, ...additional] };
          return true; // New inspected context must still pass the independent critic.
        }
      }
      if (!inspectedPriorSupport) {
        inspectedPriorSupport = true;
        const reused = await reuseProjectDesignSupport({ ...input, gaps });
        if (reused.length) {
          addendum = sealDesignSupport({ userId: input.userId, projectId: input.projectId,
            jobId: currentJobExecution()!.jobId, definitionHash: bundle.contextFingerprint,
            policyVersion: "design-mini-research.v2", sources: reused });
          effectivePack = augmentMethodEvidencePack(effectivePack, addendum);
          designSupport = { status: "VERIFIED_SUPPORT", support: reused, limitations: [], operations: [] };
          return true;
        }
      }
      const discoveryBound = webDiscoveryPolicyCostBound(DESIGN_MINI_RESEARCH_POLICY);
      if (!discoveryBound) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
      supportOperations++;
      const result = await (input.researchSupport ?? researchDesignSupport)({ ...input, bundle, gaps,
        operationOrdinal: supportOperations as 1 | 2, knownSupport: addendum?.sources,
        beforeDiscovery: () => preflightWholeJobCost({ nextStage: "design_support_discovery", nextStageReservation: discoveryBound.maximumUsd,
          minimumRemainingMandatoryReservation: designSupportRemainingForecast(bundle, gaps[0].alternativeId, digestPatch, digestCritic) }).then(() => undefined) });
      designSupport = { ...result, operations: [...(designSupport?.operations ?? []), ...result.operations],
        limitations: [...(designSupport?.limitations ?? []), ...result.limitations], support: [...(designSupport?.support ?? []), ...result.support] };
      if (!result.support.length) return false;
      const sources = [...(addendum?.sources ?? []), ...result.support].filter((source, index, all) =>
        all.findIndex(item => item.document.sha256 === source.document.sha256) === index);
      addendum = sealDesignSupport({ userId: input.userId, projectId: input.projectId,
        jobId: currentJobExecution()?.jobId ?? input.runId, definitionHash: bundle.contextFingerprint,
        policyVersion: "design-mini-research.v2", sources });
      effectivePack = augmentMethodEvidencePack({ ...bundle.evidence_pack, items: effectivePack.items.filter(item =>
        !item.source_id.startsWith("DS-")) }, addendum);
      return true;
    };
    let selected = selectAutonomousCandidate(decision, critique);
    const deterministicResolution = selected ? null : resolveNonmaterialDecisions({ decision, critique, intent: bundle.intent, pack: bundle.evidence_pack });
    if (deterministicResolution) { selected = deterministicResolution.alternative; revised = true; }
    let targetedReview: typeof targetedAutonomousCriticSchema._output | null = null;
    if (!selected) {
      if (designSupportGaps(bundle).length && !await gatherSupport())
        throw new Error("DESIGN_SUPPORT_UNAVAILABLE: se conserva el dictamen; no se pagó un parche sin evidencia nueva.");
      for (let resolutionRound = 0; resolutionRound < 3; resolutionRound++) {
      const candidates = inScopeAlternatives(decision, critique);
      if (!candidates.length) throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: no hay alternativa dentro del alcance confirmado.");
      const alternative = candidates.find((item) => item.id === decision.recommended_id) ?? candidates[0];
      const assessment = critique.assessments.find((item) => item.alternative_id === alternative.id)!;
      // Only evidence selected for inspection enters the repair; acquisition
      // never changes the independent critic's scientific acceptance conditions.
      const evidenceIds = new Set([ ...alternative.research_design.methodological_support, ...alternative.components.flatMap((item) => item.support) ].map((item) => `${item.source_id}:${item.evidence_id}`));
      const relevantEvidence = effectivePack.items.filter((item) => evidenceIds.has(`${item.source_id}:${item.evidence_id}`) ||
        !bundle.evidence_pack.items.some(old => old.source_id === item.source_id && old.evidence_id === item.evidence_id));
      const findings = assessment.critical_findings;
      const provider = input.provider ?? getConfiguredLlmProvider();
      const evidenceWithIdentity = relevantEvidence.map(item => {
        const support = (addendum as DesignSupportAddendum | null)?.sources.find(source => source.sourceId === item.source_id);
        const selectedSource = bundle.evidence_pack.selected_sources.find(source => source.source_id === item.source_id);
        return { ...item, source_identity: support ? { title: support.title, authors: support.authors, year: support.year,
          doi: support.doi, provenance: support.provenance, observedUrl: support.document.observedUrl,
          finalUrl: support.document.finalUrl, documentHash: support.document.sha256,
          transferLimits: "Adquisición y extracción verificadas; aplicabilidad a esta afirmación pendiente del dictamen independiente." } : selectedSource };
      });
      const patchSchema = effectivePack.items.length > bundle.evidence_pack.items.length ? autonomousDesignEvidencePatchSchema : autonomousDesignPatchSchema;
      const schema = z.toJSONSchema(patchSchema);
      const patchSchemaName = patchSchema === autonomousDesignEvidencePatchSchema ? "autonomous_design_evidence_patch_v1" : "autonomous_design_patch_v2";
      const render = (record: { systemPrompt: string; userPromptTemplate: string }, variables: Record<string, unknown>) =>
        `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, variable: string) => stableJson(variables[variable]))}`;
      const apply = (patch: z.infer<typeof patchSchema>) => applyAutonomousDesignPatch({ decision, critique, intent: bundle.intent, pack: effectivePack, patch,
        methodologicalSupportAdded: "methodologicalSupportAdded" in patch ? patch.methodologicalSupportAdded as Array<{ source_id: string; evidence_id: string }> : [] });
      // Preserve an entire completed v4 patch+critic pair under its exact original
      // contract. A new digest does not justify paying again for the old rejection.
      const legacyVariables = { intent_json: bundle.intent, alternative_json: compactAlternativeForRepair(alternative), findings_json: findings,
        evidence_json: resolutionRound > 0 ? compactCriticEvidence(evidenceWithIdentity) : evidenceWithIdentity };
      const legacyPrompt = render(autonomousPatch, legacyVariables);
      const legacyInputs = { promptHash: fingerprint(legacyPrompt), schema, model: autonomousPatch.model, version: autonomousPatch.version };
      const legacyKey = await versionedCheckpointKey(`AUTONOMOUS_DESIGN_PATCH_EVIDENCE_${resolutionRound + 1}`, legacyInputs);
      const legacyPatch = await readCompletedCheckpoint<z.infer<typeof patchSchema>>(legacyKey, legacyInputs);
      const reviewSchema = z.toJSONSchema(targetedAutonomousCriticSchema);
      let reused: { patch: z.infer<typeof patchSchema>; review: typeof targetedAutonomousCriticSchema._output } | null = null;
      if (legacyPatch) {
        patchSchema.parse(legacyPatch);
        const legacyReviewPrompt = render(targetedCritic, { ...legacyVariables, alternative_json: compactAlternativeForRepair(apply(legacyPatch)),
          patch_json: compactPatchReview(legacyPatch), evidence_json: compactCriticEvidence(evidenceWithIdentity) });
        const legacyReviewInputs = { promptHash: fingerprint(legacyReviewPrompt), schema: reviewSchema, model: targetedCritic.model, version: targetedCritic.version };
        const legacyReviewKey = await versionedCheckpointKey(`AUTONOMOUS_DESIGN_TARGETED_CRITIC_EVIDENCE_${resolutionRound + 1}`, legacyReviewInputs);
        const savedReview = await readCompletedCheckpoint<typeof targetedAutonomousCriticSchema._output>(legacyReviewKey, legacyReviewInputs);
        if (savedReview) reused = { patch: legacyPatch, review: targetedAutonomousCriticSchema.parse(savedReview) };
      }
      let patch: z.infer<typeof patchSchema>;
      if (reused) {
        patch = reused.patch; selected = apply(patch); targetedReview = reused.review;
      } else {
        const digest = buildDesignSupportDigest({ pack: effectivePack, addendum,
          identity: { userId: input.userId, projectId: input.projectId, jobId: currentJobExecution()?.jobId ?? input.runId, definitionHash: bundle.contextFingerprint },
          gaps: designSupportGaps(bundle, targetedReview ?? undefined),
          requiredPointers: [...alternative.research_design.methodological_support, ...alternative.components.flatMap(item => item.support)] });
        await stageCheckpoint(`DESIGN_SUPPORT_DIGEST_${resolutionRound + 1}_${digest.digestFingerprint}`, { fingerprint: digest.digestFingerprint }, async () => digest);
        const evidence = digestPromptContext(digest);
        const variables = { intent_json: bundle.intent, alternative_json: compactAlternativeForRepair(alternative),
          findings_json: { initial: findings, priorIndependentReview: targetedReview }, evidence_json: evidence };
        const prompt = render(digestPatch, variables);
        const request = { prompt, schema, schemaName: patchSchemaName, model: digestPatch.model, reasoningEffort: digestPatch.reasoning_effort,
          maxOutputTokens: digestPatch.max_output_tokens, maxRetries: 0 as const,
          trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "autonomous_design_patch", promptVersion: digestPatch.version, schemaName: patchSchemaName } };
        const admit = async (phase: string, value: StructuredObjectInput) => {
          const bound = provider.estimateStructuredRequest ? await provider.estimateStructuredRequest(value) : responseCostBound({
            model: value.model, input: value.prompt, reasoning: { effort: value.reasoningEffort }, max_output_tokens: value.maxOutputTokens,
            text: { format: { type: "json_schema", name: value.schemaName, strict: true, schema: value.schema } } });
          if (!bound) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
          // A bounded stage envelope, below configured models' context capacities.
          // Bytes are diagnostic only. Never truncate scientific evidence to fit.
          if (bound.inputTokens + (value.maxOutputTokens ?? 0) > 65536) throw new Error("DESIGN_DIGEST_FINDING_SPLIT_REQUIRED");
          const telemetry = { effectiveEvidenceFingerprint: digest.effectiveEvidenceFingerprint, digestFingerprint: digest.digestFingerprint,
            inputTokens: bound.inputTokens, tokenCountProvenance: bound.tokenCountProvenance, maximumUsd: bound.maximumUsd,
            promptBytes: Buffer.byteLength(value.prompt), digestBytes: Buffer.byteLength(stableJson(evidence)), byteDiagnosticExceeded: Buffer.byteLength(value.prompt) > 40000 };
          await stageCheckpoint(`DESIGN_CONTEXT_${phase}_${fingerprint(value)}`, { request: fingerprint(value) }, async () => telemetry);
          return bound;
        };
        const patchInputs = { promptHash: fingerprint(prompt), schema, model: digestPatch.model, version: digestPatch.version,
          effectiveEvidenceFingerprint: digest.effectiveEvidenceFingerprint, digestFingerprint: digest.digestFingerprint };
        const patchKey = await versionedCheckpointKey(`AUTONOMOUS_DESIGN_PATCH_EVIDENCE_${resolutionRound + 1}`, patchInputs);
        const savedPatch = await readCompletedCheckpoint<z.infer<typeof patchSchema>>(patchKey, patchInputs);
        if (savedPatch) patch = patchSchema.parse(savedPatch);
        else {
          const patchBound = await admit("PATCH", request);
          const criticMinimum = responseCostBound({ model: digestCritic.model, input: stableJson(variables), max_output_tokens: digestCritic.max_output_tokens });
          if (!criticMinimum) throw new Error("WHOLE_JOB_FORECAST_MODEL_UNPRICED");
          const compositionFloor = mandatoryCompositionReservationFloor(bundle, alternative.id).reduce((sum, phase) => sum + phase.minimumReservationUsd, 0);
          await preflightWholeJobCost({ nextStage: "autonomous_design_patch", nextStageReservation: patchBound.maximumUsd,
            minimumRemainingMandatoryReservation: criticMinimum.maximumUsd + compositionFloor });
          patch = patchSchema.parse(await stageCheckpoint(patchKey, patchInputs, () => provider.generateBackgroundStructuredObject && currentJobExecution()
            ? provider.generateBackgroundStructuredObject({ ...request, logicalAttemptKey: fingerprint({ projectId: input.projectId, runId: input.runId, key: patchKey, ...patchInputs }), requestFingerprint: openAiBackgroundRequestFingerprint(request) })
            : provider.generateStructuredObject(request)));
        }
        const allowed = new Set(digest.passages.map(item => `${item.source_id}:${item.evidence_id}`));
        if ("methodologicalSupportAdded" in patch && (patch.methodologicalSupportAdded as Array<{ source_id: string; evidence_id: string }>).some(item => !allowed.has(`${item.source_id}:${item.evidence_id}`)))
          throw new Error("AUTONOMOUS_PATCH_DIGEST_POINTER_INVALID");
        selected = apply(patch);
        const reviewPrompt = render(digestCritic, { ...variables, alternative_json: compactAlternativeForRepair(selected), patch_json: compactPatchReview(patch) });
        const reviewRequest = { prompt: reviewPrompt, schema: reviewSchema, schemaName: "autonomous_design_targeted_critic_v2", model: digestCritic.model,
          reasoningEffort: digestCritic.reasoning_effort, maxOutputTokens: digestCritic.max_output_tokens, maxRetries: 0 as const,
          trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "autonomous_design_targeted_critic", promptVersion: digestCritic.version, schemaName: "autonomous_design_targeted_critic_v2" } };
        const criticInputs = { promptHash: fingerprint(reviewPrompt), schema: reviewSchema, model: digestCritic.model, version: digestCritic.version,
          effectiveEvidenceFingerprint: digest.effectiveEvidenceFingerprint, digestFingerprint: digest.digestFingerprint };
        const criticKey = await versionedCheckpointKey(`AUTONOMOUS_DESIGN_TARGETED_CRITIC_EVIDENCE_${resolutionRound + 1}`, criticInputs);
        const savedReview = await readCompletedCheckpoint<typeof targetedAutonomousCriticSchema._output>(criticKey, criticInputs);
        targetedReview = savedReview ? targetedAutonomousCriticSchema.parse(savedReview) : await (async () => {
          const reviewBound = await admit("CRITIC", reviewRequest);
          await preflightWholeJobCost({ nextStage: "autonomous_design_targeted_critic", nextStageReservation: reviewBound.maximumUsd,
            minimumRemainingMandatoryReservation: mandatoryCompositionReservationFloor(bundle, selected!.id).reduce((sum, phase) => sum + phase.minimumReservationUsd, 0) });
          return targetedAutonomousCriticSchema.parse(await stageCheckpoint(criticKey, criticInputs, () => provider.generateBackgroundStructuredObject && currentJobExecution()
            ? provider.generateBackgroundStructuredObject({ ...reviewRequest, logicalAttemptKey: fingerprint({ projectId: input.projectId, runId: input.runId, key: criticKey, ...criticInputs }), requestFingerprint: openAiBackgroundRequestFingerprint(reviewRequest) })
            : provider.generateStructuredObject(reviewRequest)));
        })();
      }
      if (!targetedReview.evidenceSupported && resolutionRound < 2 && await gatherSupport(targetedReview)) {
        selected = undefined;
        continue;
      }
      const priorBlocking = new Set(findings.filter((finding) => finding.severity === "BLOCKING").map((finding) => finding.code));
      const deferrable = new Set(findings.filter((finding) => finding.severity === "BLOCKING" &&
        isFutureRequirementFinding(finding.affected_field) &&
        patch.unresolvedFindingCodes.includes(finding.code) &&
        patch.dataRequirements.some((requirement) => requirement.availability === "PENDING")).map((finding) => finding.code));
      const deferred = new Set(targetedReview.deferredAsFutureRequirementCodes);
      if (targetedReview.alternativeId !== selected.id || !targetedReview.intentPreserved || !targetedReview.methodCoherent || !targetedReview.evidenceSupported || targetedReview.blockingScientificIssue ||
        [...deferred].some((code) => !deferrable.has(code)) ||
        targetedReview.unresolvedFindingCodes.some((code) => priorBlocking.has(code) && !deferred.has(code)) ||
        [...priorBlocking].some((code) => !targetedReview!.resolvedFindingCodes.includes(code) && !deferred.has(code)))
        throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: crítica focalizada no aprobó la corrección.");
      revised = true;
      break;
      }
    }
    if (!selected) throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: no existe un diseño validado dentro del alcance confirmado.");
    const alternative = { ...selected,
      transfer_limits: [...new Set([...selected.transfer_limits,
        ...(targetedReview?.limitations ?? []),
        ...selected.pending_user_decisions.map(item => `Verificar durante la investigación: ${item.question}`)])],
      pending_user_decisions: [] };
    validateScientificDecision({ ...decision, alternatives: [alternative], recommended_id: alternative.id }, bundle.intent, effectivePack);
    const finalAddendum = addendum as DesignSupportAddendum | null;
    return { supportAddendum: finalAddendum, effectiveEvidenceFingerprint: finalAddendum?.checksum ?? bundle.contextFingerprint, decisionFingerprint: bundle.decisionFingerprint, contextFingerprint: bundle.contextFingerprint, academicLevel: bundle.academicLevel, alternative, critique, deterministicResolution: deterministicResolution?.reclassified ?? null, targetedReview, revised, designSupport, policyVersion: autonomousPatch.version };
  });
}

export async function decisionForUser(userId: string, projectId: string, jobId: string) {
  const job = await prisma.blueprintJob.findFirst({ where: { id: jobId, projectId, userId }, include: { stages: { where: { stageKey: { in: [SCIENTIFIC_DECISION_STAGE, SCIENTIFIC_APPROVAL_STAGE] } } } } });
  if (!job) throw new Error("PROJECT_NOT_FOUND");
  const stored = job.stages.find((s) => s.stageKey === SCIENTIFIC_DECISION_STAGE)?.outputJson as unknown as { value: ScientificDecisionBundle } | undefined;
  if (!stored) return { status: job.status, decision: null };
  const bundle = stored.value;
  const failure = job.errorJson as { message?: string } | null;
  const reviewable = job.status === "WAITING_USER_DECISION" || job.status === "FAILED" && /DESIGN_APPROVAL|INPUT_CHANGED/.test(failure?.message ?? "");
  return { status: job.status, decision: reviewable ? { fingerprint: bundle.decisionFingerprint, expected_outcome: bundle.intent.expected_outcome, recommendation: bundle.decision.recommendation_rationale, recommended_id: bundle.decision.recommended_id, clarification_questions: bundle.decision.clarification_questions, alternatives: bundle.decision.alternatives.map((a) => { const review = bundle.critique.assessments.find((r) => r.alternative_id === a.id); return { ...a, approvable: job.status === "WAITING_USER_DECISION" && alternativeCanBeConfirmed(a, bundle.critique), scope: review?.scope, review: review ? { ...review, issues: review.critical_findings.map((finding) => ({ finding: finding.issue, required_action: finding.required_action })) } : undefined }; }) } : null };
}

export async function approveScientificDecision(input: { userId: string; projectId: string; jobId: string; decisionFingerprint: string; alternativeId: string; acceptScopeChanges: boolean }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${input.jobId} FOR UPDATE`;
    const job = await tx.blueprintJob.findFirstOrThrow({ where: { id: input.jobId, projectId: input.projectId, userId: input.userId } });
    const previous = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: job.id, stageKey: SCIENTIFIC_APPROVAL_STAGE } } });
    if (previous) {
      const saved = previous.outputJson as { decisionFingerprint: string; alternativeId: string };
      if (saved.decisionFingerprint !== input.decisionFingerprint || saved.alternativeId !== input.alternativeId) throw new Error("DESIGN_APPROVAL_ALREADY_FIXED");
      return { approved: true, jobId: job.id }; // idempotent; never requeue a completed job
    }
    if (job.status !== "WAITING_USER_DECISION") throw new Error("DESIGN_NOT_AWAITING_APPROVAL");
    const row = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: SCIENTIFIC_DECISION_STAGE } } });
    const bundle = (row.outputJson as unknown as { value: ScientificDecisionBundle }).value;
    if (bundle.decisionFingerprint !== input.decisionFingerprint) throw new Error("DESIGN_REVISION_CONFLICT");
    const option = bundle.decision.alternatives.find((a) => a.id === input.alternativeId);
    if (!option || !alternativeIsApprovable(option, bundle.critique, input.acceptScopeChanges)) throw new Error("DESIGN_REQUIRES_CLARIFICATION");
    const scope = bundle.critique.assessments.find((assessment) => assessment.alternative_id === option.id)?.scope;
    if (scope?.status === "PENDING_USER_DECISION") throw new Error("SCOPE_DECISION_REQUIRES_REVISION");
    if (scope?.confirmation_required && !input.acceptScopeChanges) throw new Error("SCOPE_CHANGE_REQUIRES_EXPLICIT_APPROVAL");
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} AND "userId" = ${input.userId} FOR UPDATE`;
    const project = await tx.project.findFirstOrThrow({ where: { id: input.projectId, userId: input.userId }, include: { intake: true, projectReferences: { where: { selected: true }, orderBy: { id: "asc" } } } });
    const jobData = job.stageDataJson as { inputFingerprint: string; step5: { stepRunId: string } };
    const projectHash = researchProjectFingerprint(project);
    const ledgerRow = await tx.projectEvidenceLedger.findFirstOrThrow({ where: { projectId: input.projectId, stepRunId: jobData.step5.stepRunId } });
    if (projectHash !== jobData.inputFingerprint || project.degreeLevel !== bundle.academicLevel || decisionContextFingerprint(project.intake, ledgerRow.ledgerJson as unknown as MvpStep5EvidenceLedger) !== bundle.contextFingerprint) throw new Error("INPUT_CHANGED: revisa el diseño con la nueva información.");
    await tx.blueprintJobStage.create({ data: { jobId: job.id, stageKey: SCIENTIFIC_APPROVAL_STAGE, status: "COMPLETED", progress: 50, completedAt: new Date(), outputJson: json({ decisionFingerprint: bundle.decisionFingerprint, contextFingerprint: bundle.contextFingerprint, alternativeId: option.id, alternative: option, scope: scope ? { ...scope, confirmed: scope.confirmation_required ? input.acceptScopeChanges : false } : null, userId: input.userId, approvedAt: new Date().toISOString(), scopeChangesAccepted: input.acceptScopeChanges, academicLevel: project.degreeLevel }) } });
    await tx.blueprintJob.update({ where: { id: job.id }, data: { status: "WAITING_NEXT_STAGE", currentStage: "generating_plan", lockedAt: null, nextAttemptAt: null } });
    return { approved: true, jobId: job.id };
  });
}

export async function approvedDesignForCurrentJob(intake: unknown, ledger: MvpStep5EvidenceLedger): Promise<DesignAlternative | undefined> {
  const execution = currentJobExecution();
  if (!execution) return undefined;
  const job = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: execution.jobId }, include: { project: { select: { degreeLevel: true } } } });
  if ((job.metadataJson as { scientificProfile?: string } | null)?.scientificProfile !== "rc4") return undefined;
  const approval = await prisma.blueprintJobStage.findFirst({ where: { jobId: job.id, stageKey: { in: [AUTONOMOUS_DESIGN_STAGE, SCIENTIFIC_APPROVAL_STAGE] }, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
  const saved = (approval?.outputJson as { value?: { contextFingerprint: string; alternative: DesignAlternative; academicLevel: string }; contextFingerprint?: string; alternative?: DesignAlternative; academicLevel?: string } | null)?.value ?? approval?.outputJson as { contextFingerprint: string; alternative: DesignAlternative; academicLevel: string } | null;
  if (!saved || saved.academicLevel !== (currentGenerationInput()?.project.degreeLevel ?? job.project.degreeLevel) || saved.contextFingerprint !== decisionContextFingerprint(intake, ledger)) throw new Error("DESIGN_APPROVAL_REQUIRED_OR_STALE");
  return saved.alternative;
}

export async function approvedGenerationContextForCurrentJob(intake: unknown, ledger: MvpStep5EvidenceLedger) {
  const design = await approvedDesignForCurrentJob(intake, ledger);
  const execution = currentJobExecution();
  if (!execution || !design) return { design, ledger };
  const job = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: execution.jobId }, select: { userId: true, projectId: true } });
  const row = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: execution.jobId, stageKey: AUTONOMOUS_DESIGN_STAGE } } });
  const saved = (row?.outputJson as { value?: { supportAddendum?: DesignSupportAddendum; effectiveEvidenceFingerprint?: string } } | null)?.value;
  if (!saved?.supportAddendum) return { design, ledger };
  if (row?.status !== "COMPLETED" || saved.effectiveEvidenceFingerprint !== saved.supportAddendum.checksum)
    throw new Error("DESIGN_SUPPORT_CONTEXT_MISMATCH");
  for (const source of saved.supportAddendum.sources) {
    if (!source.document.privateArtifactPath || createHash("sha256").update(await readFile(source.document.privateArtifactPath)).digest("hex") !== source.document.sha256)
      throw new Error("DESIGN_SUPPORT_ARTIFACT_INTEGRITY");
  }
  return { design, ledger: effectiveGenerationLedger(ledger, saved.supportAddendum, { ...job, jobId: execution.jobId,
    definitionHash: decisionContextFingerprint(intake, ledger) }) };
}

// Explicit user action, never a polling/resume side effect. Preserve the same job,
// cost ledger and failure count. A changed intake invalidates its extraction too:
// Step 5 currently uses intake-dependent prompts and its own continuity hash.
export async function reviseScientificDecision(input: { userId: string; projectId: string; jobId: string; decisionFingerprint: string }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BlueprintJob" WHERE id = ${input.jobId} FOR UPDATE`;
    const job = await tx.blueprintJob.findFirstOrThrow({ where: { id: input.jobId, projectId: input.projectId, userId: input.userId } });
    const key = "control:design-revisions";
    const control = await tx.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: job.id, stageKey: key } } });
    const history = (control?.outputJson as { requests: string[] } | null)?.requests ?? [];
    if (history.includes(input.decisionFingerprint)) return { revised: true, jobId: job.id }; // replay cannot requeue
    const failure = job.errorJson as { message?: string } | null;
    const designFailure = job.status === "FAILED" && /DESIGN_APPROVAL|INPUT_CHANGED/.test(failure?.message ?? "");
    if (job.status !== "WAITING_USER_DECISION" && !designFailure) throw new Error("DESIGN_NOT_REVISABLE");
    if (job.attempts >= job.maxAttempts || history.length >= 2) throw new Error("DESIGN_REVISION_LIMIT_REACHED");
    const row = await tx.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: SCIENTIFIC_DECISION_STAGE } } });
    const bundle = (row.outputJson as unknown as { value: ScientificDecisionBundle }).value;
    if (bundle.decisionFingerprint !== input.decisionFingerprint) throw new Error("DESIGN_REVISION_CONFLICT");
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} AND "userId" = ${input.userId} FOR UPDATE`;
    const project = await tx.project.findFirstOrThrow({ where: { id: input.projectId, userId: input.userId }, include: { intake: true, projectReferences: { where: { selected: true }, orderBy: { id: "asc" } } } });
    if (!project.intake || !project.projectReferences.length) throw new Error("DESIGN_REQUIRES_INTAKE_AND_SOURCES");
    const hash = researchProjectFingerprint(project);
    const previous = job.stageDataJson as { runId: string; inputFingerprint: string };
    if (hash === previous.inputFingerprint && project.degreeLevel === bundle.academicLevel) throw new Error("DESIGN_REVISION_REQUIRES_CHANGED_INPUT");
    // Retain complete audit/checkpoint history; do not erase or overwrite old outputs.
    const affected = await tx.blueprintJobStage.findMany({ where: { jobId: job.id, NOT: [{ stageKey: { startsWith: "control:" } }, { stageKey: { startsWith: "archive:" } }] } });
    for (const stage of affected) await tx.blueprintJobStage.update({ where: { id: stage.id }, data: { stageKey: `archive:design-revision-${history.length + 1}:${stage.stageKey}` } });
    await tx.blueprintJobStage.upsert({ where: { jobId_stageKey: { jobId: job.id, stageKey: key } }, create: { jobId: job.id, stageKey: key, status: "COMPLETED", progress: 0, outputJson: json({ requests: [...history, input.decisionFingerprint] }) }, update: { outputJson: json({ requests: [...history, input.decisionFingerprint] }) } });
    const frozen = await appendGenerationInput(tx, { jobId: job.id, projectId: job.projectId, userId: job.userId, revision: history.length + 2 });
    await tx.blueprintJob.update({ where: { id: job.id }, data: { status: "WAITING_NEXT_STAGE", currentStage: "materializing_evidence", progress: 5, lockedAt: null, nextAttemptAt: null, completedAt: null, errorMessage: null, errorJson: Prisma.DbNull, stageDataJson: json({ runId: `${previous.runId}-design-${history.length + 1}`, inputFingerprint: hash, inputSnapshotId: frozen.snapshot.id }) } });
    await tx.project.update({ where: { id: project.id }, data: { status: "BLUEPRINT_GENERATING" } });
    return { revised: true, jobId: job.id };
  });
}
