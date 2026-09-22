// One authorized G1.2 applied-domain attempt. Frozen evidence; no retrieval or documents.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { createOpenAiProvider, openAiBackgroundRequestFingerprint, ProviderResponsePendingError } from "@/llm/providers/openai";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import type { BackgroundStructuredObjectInput, LlmProvider, StructuredObjectInput, TextGenerationInput } from "@/llm/provider";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { closeJobCostControl, fingerprint, jobCostSnapshot, stableJson, stageCheckpoint, withJobExecution } from "@/server/mvp/job-execution-context";
import { accountDecisionSources, buildMethodEvidencePack, intentFromIntake, scientificDecisionV2Schema, validateScientificDecision } from "@/server/mvp/scientific-decision-contracts";
import { critiqueScientificDecision } from "@/server/mvp/scientific-decision-service";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as selector } from "@/server/mvp/prompts/scientific-design-selector.v3";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT as critic } from "@/server/mvp/prompts/scientific-design-critic.v3";
import { SCIENTIFIC_DESIGN_CRITIC_RECOVERY_PROMPT as recovery } from "@/server/mvp/prompts/scientific-design-critic-recovery.v1";

const SOURCE = path.resolve("artifacts-local/rc4/scientific-design-evaluation-v1/applied-education.input.json");
const OLD_RESULT = path.resolve("artifacts-local/rc4/scientific-design-evaluation-g1-1/applied-education/result.json");
const ROOT = path.resolve("artifacts-local/rc4/scientific-design-evaluation-g1-2/applied-education");
const MAX_NEW_SPEND = 3;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const save = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
const resolveTemplate = (record: typeof selector | typeof critic | typeof recovery, variables: Record<string, unknown>) => `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => stableJson(variables[key]))}`;

function frozen(value: any) {
  const { input_hash, ledger_hash, ...payload } = value;
  if (fingerprint(payload) !== input_hash || fingerprint(value.ledger) !== ledger_hash) throw new Error("FROZEN_INPUT_HASH_MISMATCH");
  return value;
}

async function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const env = parseEnv(await readFile(path.resolve("../ingeniometrix-wt-release0/.env.release"), "utf8"));
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_MISSING");
  return env.OPENAI_API_KEY;
}

async function prepare() {
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const input = frozen(await read(SOURCE));
  const intent = intentFromIntake({ ...input.intake, degreeLevel: input.academic_level });
  const pack = buildMethodEvidencePack(input.ledger);
  const selectorPrompt = resolveTemplate(selector, { intent_json: intent, method_evidence_pack_json: pack });
  const selectorBound = responseCostBound({ model: selector.model, reasoning: { effort: selector.reasoning_effort }, background: true, store: true, max_output_tokens: selector.max_output_tokens, input: selectorPrompt, text: { format: { type: "json_schema", name: "design_selector_g1_2", strict: true, schema: z.toJSONSchema(scientificDecisionV2Schema) } } });
  const maximumDecisionProxy = { conservative_selector_output: "x".repeat(selector.max_output_tokens * 4) };
  const criticProxy = resolveTemplate(critic, { intent_json: intent, method_evidence_pack_json: pack, decision_json: maximumDecisionProxy });
  const criticParams = { model: critic.model, reasoning: { effort: critic.reasoning_effort }, store: false, max_output_tokens: critic.max_output_tokens, input: criticProxy, text: { format: { type: "json_schema", name: "design_critic_0", strict: true, schema: z.toJSONSchema((await import("@/server/mvp/scientific-decision-contracts")).designCritiqueSchema) } } };
  const criticBound = responseCostBound(criticParams);
  const recoveryPrompt = resolveTemplate(recovery, { intent_json: intent, method_evidence_pack_json: pack, decision_json: maximumDecisionProxy, incomplete_critic_json: "x".repeat(critic.max_output_tokens * 4), missing_schema_fields_json: ["all required compact fields"] });
  const recoveryBound = responseCostBound({ ...criticParams, input: recoveryPrompt, text: { format: { ...criticParams.text.format, name: "design_critic_recovery_1" } } });
  const maximum = [selectorBound, criticBound, recoveryBound].reduce((sum, bound) => sum + (bound?.maximumUsd ?? Infinity), 0);
  if (!Number.isFinite(maximum) || maximum > MAX_NEW_SPEND) throw new Error(`G1_2_PREFLIGHT_BUDGET_BLOCKED:${maximum}`);
  const old = await read(OLD_RESULT);
  const manifest = {
    frozen_input_hash: input.input_hash,
    selector_prompt_version: selector.version,
    applied_case: "Diseño y evaluación técnica de un protocolo de retroalimentación para actividades matemáticas digitales",
    background_policy: { background: true, store: true, initial_poll_seconds: 2, max_poll_seconds: 15, total_wait_seconds: 900, create_attempts: 1 },
    new_call_maximums: { selector: selectorBound, critic: criticBound, critic_recovery: recoveryBound, total_usd: maximum },
    old_unknown_commitment: { usage: "UNKNOWN", maximum_usd: old.cost_usd, released: false, billed_cost_claimed: false },
  };
  await save(path.join(ROOT, "preflight.json"), manifest);
  console.log(JSON.stringify(manifest, null, 2));
  return { input, intent, pack, selectorPrompt, maximum, old };
}

async function createEvaluationJob(input: any) {
  const user = await prisma.user.create({ data: { email: `rc4-g1-2-applied-${Date.now()}@example.test` } });
  const project = await prisma.project.create({ data: { userId: user.id, title: String(input.intake.topic), program: "Evaluación privada G1.2", degreeLevel: input.academic_level, university: null } });
  const startedAt = new Date();
  const job = await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, status: "RUNNING", startedAt, lockedAt: startedAt, metadataJson: { executionPolicy: "b4.v1", evaluation: "rc4-g1-2", caseId: "applied-education", frozenInputHash: input.input_hash } } });
  await save(path.join(ROOT, "execution-state.json"), { user_id: user.id, project_id: project.id, job_id: job.id, started_at: startedAt.toISOString(), frozen_input_hash: input.input_hash });
  return { user, project, job, startedAt };
}

function boundedProvider(actual: LlmProvider, directory: string) {
  let selectorCreates = 0; let criticCalls = 0;
  const requests: unknown[] = [];
  const record = async (kind: string, request: StructuredObjectInput, maximum: number) => {
    requests.push({ kind, schema: request.schemaName, model: request.model, maximum_reserved_usd: maximum, prompt_hash: fingerprint(request.prompt), at: new Date().toISOString() });
    await save(path.join(directory, "dispatches.json"), requests);
    await save(path.join(directory, `${request.schemaName}.request.json`), request);
  };
  const provider: LlmProvider = {
    name: actual.name,
    async generateStructuredObject<T>(request: StructuredObjectInput): Promise<T> {
      if (!["design_critic_0", "design_critic_recovery_1"].includes(request.schemaName) || criticCalls >= 2) throw new Error("G1_2_CRITIC_CALL_LIMIT");
      const bound = responseCostBound({ model: request.model!, reasoning: { effort: request.reasoningEffort }, store: false, max_output_tokens: request.maxOutputTokens, input: request.prompt, text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } } });
      if (!bound || bound.maximumUsd > MAX_NEW_SPEND) throw new Error("G1_2_SPEND_LIMIT");
      criticCalls++; await record("critic", request, bound.maximumUsd);
      const output = await actual.generateStructuredObject<T>(request);
      await save(path.join(directory, `${request.schemaName}.output.json`), output);
      return output;
    },
    async generateBackgroundStructuredObject<T>(request: BackgroundStructuredObjectInput): Promise<T> {
      if (request.schemaName !== "design_selector_g1_2") throw new Error("G1_2_SELECTOR_SCHEMA_INVALID");
      if (!actual.generateBackgroundStructuredObject) throw new Error("BACKGROUND_TRANSPORT_UNAVAILABLE");
      // Invocations after a process restart retrieve the same response and are not creates.
      const existing = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: request.trackingAttribution!.runId!, stageKey: `provider:background:${request.logicalAttemptKey}` } } });
      if (!existing) {
        if (selectorCreates >= 1) throw new Error("G1_2_SELECTOR_CREATE_LIMIT");
        const bound = responseCostBound({ model: request.model!, reasoning: { effort: request.reasoningEffort }, background: true, store: true, max_output_tokens: request.maxOutputTokens, input: request.prompt, text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } } });
        if (!bound || bound.maximumUsd > MAX_NEW_SPEND) throw new Error("G1_2_SPEND_LIMIT");
        selectorCreates++; await record("selector_background_create", request, bound.maximumUsd);
      }
      const output = await actual.generateBackgroundStructuredObject<T>(request);
      await save(path.join(directory, `${request.schemaName}.output.json`), output);
      return output;
    },
    generateText: (request: TextGenerationInput) => actual.generateText(request),
    generateTextDetailed: (request: TextGenerationInput) => actual.generateTextDetailed(request),
  };
  return { provider, counts: () => ({ selectorCreates, criticCalls }) };
}

async function paid() {
  const { input, intent, pack, selectorPrompt, maximum, old } = await prepare();
  const stateFile = path.join(ROOT, "execution-state.json");
  let state: Awaited<ReturnType<typeof createEvaluationJob>>;
  try {
    const saved = await read(stateFile);
    const job = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: saved.job_id } });
    state = { user: await prisma.user.findUniqueOrThrow({ where: { id: saved.user_id } }), project: await prisma.project.findUniqueOrThrow({ where: { id: saved.project_id } }), job, startedAt: job.startedAt! };
    if (job.status === "WAITING_NEXT_STAGE" && (job.errorJson as any)?.category === "PROVIDER_RESPONSE_PENDING") {
      const startedAt = new Date();
      const resumed = await prisma.blueprintJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt, lockedAt: startedAt, nextAttemptAt: null } });
      state = { user: await prisma.user.findUniqueOrThrow({ where: { id: saved.user_id } }), project: await prisma.project.findUniqueOrThrow({ where: { id: saved.project_id } }), job: resumed, startedAt };
    } else if (job.status !== "RUNNING") throw new Error(`EXISTING_EVALUATION_JOB_NOT_RUNNING:${job.status}`);
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
    state = await createEvaluationJob(input);
  }
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  process.env.LLM_REQUEST_TIMEOUT_MS = "120000";
  process.env.IMX_LLM_RUN_BUDGET_USD = String(MAX_NEW_SPEND);
  process.env.IMX_LLM_AUDIT_DIR = path.join(ROOT, "provider-calls");
  const actual = createOpenAiProvider({ apiKey: await apiKey(), defaultModel: selector.model });
  const bounded = boundedProvider(actual, ROOT);
  const selectorSchema = z.toJSONSchema(scientificDecisionV2Schema);
  const logicalAttemptKey = fingerprint({ evaluationCase: "applied-education", frozenInputFingerprint: input.input_hash, promptVersion: selector.version, model: selector.model, reasoning: selector.reasoning_effort, attempt: 1 });
  const backgroundRequest = { prompt: selectorPrompt, schema: selectorSchema, schemaName: "design_selector_g1_2", model: selector.model, reasoningEffort: selector.reasoning_effort, maxOutputTokens: selector.max_output_tokens, trackingAttribution: { projectId: state.project.id, runId: state.job.id, stage: "scientific_design_selector", promptVersion: selector.version, schemaName: "design_selector_g1_2" }, logicalAttemptKey, requestFingerprint: "", initialPollSeconds: 2, maxPollSeconds: 15, totalWaitSeconds: 900 } as BackgroundStructuredObjectInput;
  backgroundRequest.requestFingerprint = openAiBackgroundRequestFingerprint({ ...backgroundRequest, model: selector.model });
  let decision: any = null; let reviewed: any = null; let error: string | null = null; let pending = false; let cost: any = null;
  await withJobExecution({ jobId: state.job.id, startedAt: state.startedAt, stage: "scientific_design_g1_2" }, async () => {
    try {
      await withApplicationBudget(new ApplicationBudget(MAX_NEW_SPEND, 1.25), async () => {
        decision = scientificDecisionV2Schema.parse(await stageCheckpoint("DESIGN_SELECTOR_G1_2", { input_hash: input.input_hash, prompt_version: selector.version, model: selector.model, reasoning: selector.reasoning_effort }, () => bounded.provider.generateBackgroundStructuredObject!(backgroundRequest)));
        validateScientificDecision(decision, intent, pack);
        reviewed = await critiqueScientificDecision({ projectId: state.project.id, runId: state.job.id, intent, pack, decision, provider: bounded.provider, allowRecovery: true });
      });
    } catch (caught) {
      pending = caught instanceof ProviderResponsePendingError;
      error = caught instanceof Error ? caught.message : String(caught);
    }
    cost = await jobCostSnapshot();
  });
  const providerStage = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId: state.job.id, stageKey: `provider:background:${logicalAttemptKey}` } } });
  if (pending) {
    await prisma.blueprintJob.update({ where: { id: state.job.id }, data: { status: "WAITING_NEXT_STAGE", lockedAt: null, nextAttemptAt: null, errorJson: json({ category: "PROVIDER_RESPONSE_PENDING", message: error }) } });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.blueprintJob.update({ where: { id: state.job.id }, data: { status: reviewed ? "WAITING_USER_DECISION" : "FAILED", lockedAt: null, completedAt: reviewed ? null : new Date(), errorMessage: error, errorJson: error ? json({ category: "G1_2_EVALUATION", message: error }) : Prisma.DbNull } });
      await closeJobCostControl(tx, state.job.id, reviewed ? "COMPLETED" : "FAILED");
    });
  }
  const sourceDecisions = decision ? accountDecisionSources(pack, decision) : null;
  const summary = {
    case: "applied-education",
    project_id: state.project.id,
    job_id: state.job.id,
    frozen_input_hash: input.input_hash,
    preflight_new_maximum_usd: maximum,
    old_unknown_commitment_usd: old.cost_usd,
    old_unknown_usage: "UNKNOWN",
    counts: bounded.counts(),
    response_id: (providerStage?.outputJson as any)?.responseId ?? null,
    provider_status: (providerStage?.outputJson as any)?.providerStatus ?? null,
    selector_complete: Boolean(decision),
    critic_complete: reviewed?.completion?.first === "COMPLETE" || reviewed?.completion?.recovery === "COMPLETE",
    critic_recovery_used: reviewed?.completion?.recoveryCalls === 1,
    decision,
    critique: reviewed?.critique ?? null,
    completion: reviewed?.completion ?? null,
    source_decisions: sourceDecisions,
    cost,
    error,
    pending,
  };
  await save(path.join(ROOT, "result.json"), summary);
  console.log(JSON.stringify({ ...summary, decision: undefined, critique: undefined, source_decisions: undefined, cost_entries: cost?.entries }, null, 2));
  if (!reviewed) process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("ISOLATED_RC4_DB_REQUIRED");
  if (process.argv.includes("--prepare")) return prepare();
  if (process.argv.includes("--paid")) return paid();
  throw new Error("Use --prepare or --paid explicitly");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
