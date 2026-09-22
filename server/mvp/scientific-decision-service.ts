import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import type { LlmProvider } from "@/llm/provider";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { currentJobExecution, fingerprint, stageCheckpoint, stableJson } from "./job-execution-context";
import { assessEvidenceCoverage } from "./evidence-coverage";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import { accountDecisionSources, alternativeCanBeConfirmed, alternativeIsApprovable, buildMethodEvidencePack, criticAttemptEnvelopeSchema, decisionContextFingerprint, designCritiqueSchema, designRepairSchema, intentFromIntake, scientificDecisionV2Schema, validateDesignCritique, validateScientificDecision, type DesignAlternative, type DesignCritique, type MethodEvidencePack, type ResearchIntentContract, type ScientificDecision } from "./scientific-decision-contracts";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as selector } from "./prompts/scientific-design-selector.v3";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT as critic } from "./prompts/scientific-design-critic.v3";
import { SCIENTIFIC_DESIGN_CRITIC_RECOVERY_PROMPT as criticRecovery } from "./prompts/scientific-design-critic-recovery.v1";
import { SCIENTIFIC_DESIGN_REPAIR_PROMPT as repair } from "./prompts/scientific-design-repair.v1";
import { SCIENTIFIC_DESIGN_OUTPUT_REPAIR_PROMPT as outputRepair } from "./prompts/scientific-design-output-repair.v1";
import { appendGenerationInput, currentGenerationInput, frozenProject, researchProjectFingerprint } from "@/server/projects/generation-input-snapshot";

export const SCIENTIFIC_DECISION_STAGE = "checkpoint:SCIENTIFIC_DECISION";
export const SCIENTIFIC_APPROVAL_STAGE = "approval:SCIENTIFIC_DESIGN";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const criticRequiredFields = ["assessments", "alternative_id", "decision", "intent_preserved", "scope", "status", "current_user_intent", "recommended_scope", "difference", "rationale", "confirmation_required", "confirmed", "theory_framework_fit", "method_fit", "method_integration", "mixed_methods_validity", "data_feasibility", "validation_strategy", "procedural_executability", "evidence_support", "transferability", "uncertainty_disclosure", "question_objective_method_alignment", "complexity_discipline", "novelty_discipline", "academic_level_fit", "critical_findings", "user_decisions_required", "repair_targets"];
export function missingCriticSchemaFields(partial: string) { return criticRequiredFields.filter((field) => !partial.includes(`\"${field}\"`)); }
export async function critiqueScientificDecision(input: { projectId: string; runId: string; intent: ResearchIntentContract; pack: MethodEvidencePack; decision: ScientificDecision; provider: LlmProvider; previousIncomplete?: { partialOutput: string; reason: string }; allowRecovery?: boolean }) {
  const promptRecords: unknown[] = [];
  async function attempt(key: string, record: typeof critic | typeof criticRecovery, variables: Record<string, unknown>) {
    const prompt = `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, variable: string) => stableJson(variables[variable]))}`;
    if (Buffer.byteLength(prompt) > 60000) throw new Error("USER_ACTION_REQUIRED: el contexto de crítica necesita una selección más acotada; no se truncó evidencia.");
    const schemaJson = z.toJSONSchema(designCritiqueSchema);
    const value = await stageCheckpoint(`${key}_RESPONSE`, { prompt, schemaJson, model: record.model, effort: record.reasoning_effort, output: record.max_output_tokens }, async () => {
      try {
        const critique = designCritiqueSchema.parse(await input.provider.generateStructuredObject({ prompt, schema: schemaJson, schemaName: key.toLowerCase(), model: record.model, reasoningEffort: record.reasoning_effort, maxOutputTokens: record.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "scientific_design_critic", promptVersion: record.version, schemaName: key.toLowerCase() } }));
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
  const first = input.previousIncomplete ? criticAttemptEnvelopeSchema.parse({ status: input.previousIncomplete.reason === "max_output_tokens" ? "INCOMPLETE_TOKEN_LIMIT" : "INCOMPLETE_PROVIDER", critique: null, incomplete_output: input.previousIncomplete.partialOutput, incomplete_reason: input.previousIncomplete.reason, missing_schema_fields: missingCriticSchemaFields(input.previousIncomplete.partialOutput) }) : await attempt("DESIGN_CRITIC_0", critic, { intent_json: input.intent, method_evidence_pack_json: input.pack, decision_json: input.decision });
  const final = first.status === "INCOMPLETE_TOKEN_LIMIT" && input.allowRecovery !== false ? await attempt("DESIGN_CRITIC_RECOVERY_1", criticRecovery, { intent_json: input.intent, method_evidence_pack_json: input.pack, decision_json: input.decision, incomplete_critic_json: first.incomplete_output, missing_schema_fields_json: first.missing_schema_fields }) : first;
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
      const result = schema.parse(await stageCheckpoint(key, { prompt, schemaJson, model: record.model, effort: record.reasoning_effort, output: record.max_output_tokens }, () => provider.generateStructuredObject({ prompt, schema: schemaJson, schemaName: key.toLowerCase(), model: record.model, reasoningEffort: record.reasoning_effort, maxOutputTokens: record.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "scientific_design", promptVersion: record.version, schemaName: key.toLowerCase() } })));
      promptRecords.push({ ...record, actual_roles: "single concatenated Responses input", schema: schemaJson, retry_policy: "one selector, one critic, at most one targeted repair; evaluation transport retries disabled", request_hash: fingerprint(prompt) });
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
  const approval = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: job.id, stageKey: SCIENTIFIC_APPROVAL_STAGE } } });
  const saved = approval?.outputJson as { contextFingerprint: string; alternative: DesignAlternative; academicLevel: string } | null;
  if (!saved || saved.academicLevel !== (currentGenerationInput()?.project.degreeLevel ?? job.project.degreeLevel) || saved.contextFingerprint !== decisionContextFingerprint(intake, ledger)) throw new Error("DESIGN_APPROVAL_REQUIRED_OR_STALE");
  return saved.alternative;
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
