import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import type { LlmProvider } from "@/llm/provider";
import { currentJobExecution, fingerprint, stageCheckpoint, stableJson } from "./job-execution-context";
import { assessEvidenceCoverage } from "./evidence-coverage";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import { alternativeIsApprovable, buildMethodEvidencePack, decisionContextFingerprint, designCritiqueSchema, intentFromIntake, scientificDecisionSchema, validateDesignCritique, validateScientificDecision, type DesignAlternative, type DesignCritique, type ScientificDecision } from "./scientific-decision-contracts";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as selector } from "./prompts/scientific-design-selector.v1";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT as critic } from "./prompts/scientific-design-critic.v1";
import { appendGenerationInput, currentGenerationInput, frozenProject, researchProjectFingerprint } from "@/server/projects/generation-input-snapshot";

export const SCIENTIFIC_DECISION_STAGE = "checkpoint:SCIENTIFIC_DECISION";
export const SCIENTIFIC_APPROVAL_STAGE = "approval:SCIENTIFIC_DESIGN";
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function proposeScientificDecision(input: { projectId: string; runId: string; intake: Record<string, unknown>; academicLevel: string; ledger: MvpStep5EvidenceLedger; provider?: LlmProvider }) {
  if (assessEvidenceCoverage(input.ledger).status === "INSUFFICIENT") throw new Error("INSUFFICIENT_EVIDENCE_COVERAGE");
  const intent = intentFromIntake({ ...input.intake, degreeLevel: input.academicLevel });
  const pack = buildMethodEvidencePack(input.ledger);
  const contextFingerprint = decisionContextFingerprint(input.intake, input.ledger);
  const policy = { selector, critic, repair_rounds: 1, contextFingerprint, academicLevel: input.academicLevel };
  return stageCheckpoint("SCIENTIFIC_DECISION", policy, async () => {
    const provider = input.provider ?? getConfiguredLlmProvider();
    const promptRecords: unknown[] = [];
    async function call<S extends z.ZodType>(key: string, schema: S, record: typeof selector | typeof critic, variables: Record<string, unknown>): Promise<z.infer<S>> {
      const prompt = `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, variable: string) => stableJson(variables[variable]))}`;
      if (Buffer.byteLength(prompt) > 60000) throw new Error("USER_ACTION_REQUIRED: el contexto de diseño necesita una selección más acotada; no se truncó evidencia.");
      const schemaJson = z.toJSONSchema(schema);
      const result = schema.parse(await stageCheckpoint(key, { prompt, schemaJson, model: record.model, effort: record.reasoning_effort, output: record.max_output_tokens }, () => provider.generateStructuredObject({ prompt, schema: schemaJson, schemaName: key.toLowerCase(), model: record.model, reasoningEffort: record.reasoning_effort, maxOutputTokens: record.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, stage: "scientific_design", promptVersion: record.version, schemaName: key.toLowerCase() } })));
      promptRecords.push({ ...record, actual_roles: "single concatenated Responses input", schema: schemaJson, retry_policy: "provider bounded retries + at most one explicit scientific repair", request_hash: fingerprint(prompt) });
      return result;
    }
    let decision: ScientificDecision;
    let critique: DesignCritique = { assessments: [], summary: "No hay alternativa evaluable." };
    let round = 0;
    for (; round <= 1; round++) {
      decision = await call(`DESIGN_SELECTOR_${round}`, scientificDecisionSchema, selector, { intent_json: intent, method_evidence_pack_json: pack, critique_json: round ? critique : null });
      validateScientificDecision(decision, intent, pack);
      if (!decision.alternatives.length) { critique = { assessments: [], summary: "Se requiere aclaración antes de proponer un diseño." }; break; }
      critique = await call(`DESIGN_CRITIC_${round}`, designCritiqueSchema, critic, { intent_json: intent, method_evidence_pack_json: pack, decision_json: decision });
      validateDesignCritique(decision, critique);
      if (decision.alternatives.some((a) => alternativeIsApprovable(a, critique))) break;
    }
    const value = { intent, evidence_pack: pack, decision: decision!, critique, repair_rounds: Math.min(round, 1), contextFingerprint, academicLevel: input.academicLevel, prompt_records: promptRecords };
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
  return { status: job.status, decision: reviewable ? { fingerprint: bundle.decisionFingerprint, expected_outcome: bundle.intent.expected_outcome, recommendation: bundle.decision.recommendation_rationale, recommended_id: bundle.decision.recommended_id, clarification_questions: bundle.decision.clarification_questions, alternatives: bundle.decision.alternatives.map((a) => ({ ...a, approvable: job.status === "WAITING_USER_DECISION" && alternativeIsApprovable(a, bundle.critique), review: bundle.critique.assessments.find((r) => r.alternative_id === a.id) })) } : null };
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
    if (!option || !alternativeIsApprovable(option, bundle.critique)) throw new Error("DESIGN_REQUIRES_CLARIFICATION");
    if (option.scope_changes.length && !input.acceptScopeChanges) throw new Error("SCOPE_CHANGE_REQUIRES_EXPLICIT_APPROVAL");
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} AND "userId" = ${input.userId} FOR UPDATE`;
    const project = await tx.project.findFirstOrThrow({ where: { id: input.projectId, userId: input.userId }, include: { intake: true, projectReferences: { where: { selected: true }, orderBy: { id: "asc" } } } });
    const jobData = job.stageDataJson as { inputFingerprint: string; step5: { stepRunId: string } };
    const projectHash = researchProjectFingerprint(project);
    const ledgerRow = await tx.projectEvidenceLedger.findFirstOrThrow({ where: { projectId: input.projectId, stepRunId: jobData.step5.stepRunId } });
    if (projectHash !== jobData.inputFingerprint || project.degreeLevel !== bundle.academicLevel || decisionContextFingerprint(project.intake, ledgerRow.ledgerJson as unknown as MvpStep5EvidenceLedger) !== bundle.contextFingerprint) throw new Error("INPUT_CHANGED: revisa el diseño con la nueva información.");
    await tx.blueprintJobStage.create({ data: { jobId: job.id, stageKey: SCIENTIFIC_APPROVAL_STAGE, status: "COMPLETED", progress: 50, completedAt: new Date(), outputJson: json({ decisionFingerprint: bundle.decisionFingerprint, contextFingerprint: bundle.contextFingerprint, alternativeId: option.id, alternative: option, userId: input.userId, approvedAt: new Date().toISOString(), scopeChangesAccepted: input.acceptScopeChanges, academicLevel: project.degreeLevel }) } });
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
