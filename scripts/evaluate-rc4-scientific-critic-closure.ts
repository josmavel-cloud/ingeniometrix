// Bounded G1.1 closure. It reuses immutable G1 inputs and never acquires evidence.
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpenAiProvider } from "@/llm/providers/openai";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { closeJobCostControl, fingerprint, jobCostSnapshot, stableJson, stageCheckpoint, withJobExecution } from "@/server/mvp/job-execution-context";
import {
  accountDecisionSources,
  buildMethodEvidencePack,
  intentFromIntake,
  legacyDesignCritiqueSchema,
  migrateLegacyCritique,
  migrateLegacyScopeSemantics,
  scientificDecisionV2Schema,
  validateScientificDecision,
} from "@/server/mvp/scientific-decision-contracts";
import { critiqueScientificDecision } from "@/server/mvp/scientific-decision-service";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as selector } from "@/server/mvp/prompts/scientific-design-selector.v3";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT as critic } from "@/server/mvp/prompts/scientific-design-critic.v3";
import { SCIENTIFIC_DESIGN_CRITIC_RECOVERY_PROMPT as recovery } from "@/server/mvp/prompts/scientific-design-critic-recovery.v1";
import type { LlmProvider, StructuredObjectInput, TextGenerationInput } from "@/llm/provider";

const SOURCE = path.resolve("artifacts-local/rc4/scientific-design-evaluation-v1");
const ROOT = path.resolve("artifacts-local/rc4/scientific-design-evaluation-g1-1");
const MAX_CALLS = 3;
const MAX_SPEND = 3;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const save = async (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: exclusive ? "wx" : "w" });
const resolveTemplate = (record: typeof selector | typeof critic | typeof recovery, variables: Record<string, unknown>) => `${record.systemPrompt}\n\n${record.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => stableJson(variables[key]))}`;

async function oldIncomplete() {
  const directory = path.join(SOURCE, "qualitative", "provider-calls");
  const audits = await Promise.all((await readdir(directory)).map((file) => read(path.join(directory, file))));
  const audit = audits.find((item) => item.response?.status === "incomplete" && item.response?.incomplete_details?.reason === "max_output_tokens");
  if (!audit) throw new Error("QUALITATIVE_INCOMPLETE_RESPONSE_NOT_FOUND");
  const usage = audit.response.usage;
  return {
    audit,
    diagnostic: {
      model: audit.response.model,
      reasoning_effort: "high",
      max_output_tokens: 4096,
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? null,
      visible_output_tokens: usage.output_tokens - (usage.output_tokens_details?.reasoning_tokens ?? 0),
      total_output_tokens: usage.output_tokens,
      finish_status: audit.response.status,
      incomplete_reason: audit.response.incomplete_details?.reason ?? null,
      schema_parse_status: "NOT_ATTEMPTED_INCOMPLETE_PROVIDER_RESPONSE",
    },
  };
}

function verifiedFrozenInput(value: any) {
  const { input_hash, ledger_hash, ...payload } = value;
  if (fingerprint(payload) !== input_hash || fingerprint(value.ledger) !== ledger_hash) throw new Error("FROZEN_INPUT_HASH_MISMATCH");
  return value;
}

async function priorNewResults() {
  const files = ["qualitative-recovery/result.json", "applied-education/result.json"];
  const results = [];
  for (const relative of files) {
    try { results.push(await read(path.join(ROOT, relative))); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
  }
  return results;
}

async function prepare() {
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const qualitative = verifiedFrozenInput(await read(path.join(SOURCE, "qualitative.input.json")));
  const applied = verifiedFrozenInput(await read(path.join(SOURCE, "applied-education.input.json")));
  const geo = verifiedFrozenInput(await read(path.join(SOURCE, "geospatial.input.json")));
  const geoResult = await read(path.join(SOURCE, "geospatial/result.json"));
  const geoDecision = scientificDecisionV2Schema.parse(geoResult.result.decision);
  const geoIntent = intentFromIntake({ ...geo.intake, degreeLevel: geo.academic_level });
  const migratedGeoCritique = migrateLegacyCritique(geoIntent, geoDecision, legacyDesignCritiqueSchema.parse(geoResult.result.critique));
  await save(path.join(ROOT, "geospatial.derived.json"), {
    source_result_hash: fingerprint(geoResult),
    source_input_hash: geo.input_hash,
    selector_rerun: false,
    critic_rerun: false,
    scope_semantics: geoDecision.alternatives.map((alternative) => ({ alternative_id: alternative.id, scope: migrateLegacyScopeSemantics(geoIntent, alternative) })),
    migrated_critique: migratedGeoCritique,
  });
  const qualitativeDecision = scientificDecisionV2Schema.parse(await read(path.join(SOURCE, "qualitative/selector.output.json")));
  const qualitativeIntent = intentFromIntake({ ...qualitative.intake, degreeLevel: qualitative.academic_level });
  await save(path.join(ROOT, "qualitative.derived.json"), {
    source_input_hash: qualitative.input_hash,
    selector_output_hash: fingerprint(qualitativeDecision),
    selector_rerun: false,
    scope_semantics_before_critic: qualitativeDecision.alternatives.map((alternative) => ({ alternative_id: alternative.id, scope: migrateLegacyScopeSemantics(qualitativeIntent, alternative) })),
  });
  const incomplete = await oldIncomplete();
  await save(path.join(ROOT, "qualitative-truncation-diagnostic.json"), incomplete.diagnostic);

  const qualitativePack = buildMethodEvidencePack(qualitative.ledger);
  const recoveryPrompt = resolveTemplate(recovery, { intent_json: qualitativeIntent, method_evidence_pack_json: qualitativePack, decision_json: qualitativeDecision, incomplete_critic_json: incomplete.audit.response.output_text, missing_schema_fields_json: ["complete compact schema"] });
  const appliedIntent = intentFromIntake({ ...applied.intake, degreeLevel: applied.academic_level });
  const appliedPack = buildMethodEvidencePack(applied.ledger);
  const selectorPrompt = resolveTemplate(selector, { intent_json: appliedIntent, method_evidence_pack_json: appliedPack });
  const selectorBound = responseCostBound({ model: selector.model, max_output_tokens: selector.max_output_tokens, reasoning: { effort: selector.reasoning_effort }, store: false, input: selectorPrompt, text: { format: { type: "json_schema", name: "design_selector_g1_1", strict: true, schema: z.toJSONSchema(scientificDecisionV2Schema) } } });
  // The critic decision is not known yet. The selector prompt is used as a conservative
  // same-order context proxy; every real call is independently bounded again.
  const criticProxy = resolveTemplate(critic, { intent_json: appliedIntent, method_evidence_pack_json: appliedPack, decision_json: { maximum_selector_output_tokens: selector.max_output_tokens } });
  const bounds = [
    { call: "qualitative_critic_recovery", bound: responseCostBound({ model: recovery.model, max_output_tokens: recovery.max_output_tokens, reasoning: { effort: recovery.reasoning_effort }, store: false, input: recoveryPrompt, text: { format: { type: "json_schema", name: "design_critic_recovery_1", strict: true, schema: z.toJSONSchema((await import("@/server/mvp/scientific-decision-contracts")).designCritiqueSchema) } } }) },
    { call: "applied_selector", bound: selectorBound },
    { call: "applied_critic_proxy", bound: responseCostBound({ model: critic.model, max_output_tokens: critic.max_output_tokens, reasoning: { effort: critic.reasoning_effort }, store: false, input: criticProxy, text: { format: { type: "json_schema", name: "design_critic_0", strict: true, schema: z.toJSONSchema((await import("@/server/mvp/scientific-decision-contracts")).designCritiqueSchema) } } }) },
  ];
  const maximum = bounds.reduce((sum, item) => sum + (item.bound?.maximumUsd ?? Infinity), 0);
  if (!Number.isFinite(maximum) || maximum > MAX_SPEND) throw new Error(`G1_1_PREFLIGHT_BUDGET_BLOCKED:${maximum}`);
  const manifest = {
    source_root: SOURCE,
    immutable_source_hashes: { geospatial: geo.input_hash, qualitative: qualitative.input_hash, applied: applied.input_hash },
    truncation: incomplete.diagnostic,
    cases: {
      qualitative: { distinction: "Cualitativo interpretativo sobre experiencias docentes rurales; trabajo de campo pendiente." },
      applied: { distinction: "Diseño documental y evaluación técnica de un protocolo para actividades matemáticas digitales; sin participantes ni inferencia causal. No es una copia del caso cualitativo." },
    },
    global_policy: { maximum_new_calls: MAX_CALLS, maximum_new_spend_usd: MAX_SPEND, transport_retries: 0, deep_research: false, images: false, documents: false },
    preflight_bounds: bounds,
    combined_maximum_usd: maximum,
  };
  await save(path.join(ROOT, "manifest.json"), manifest);
  await writeFile(path.join(ROOT, "PROMPTS_USED.md"), "# G1.1 critic closure prompts\n\nActual arrangement: one concatenated Responses input, strict JSON schema, store=false, no tools, no temperature, transport retries=0. Inputs are frozen data, never instructions.\n\n" + [critic, recovery, selector].map((record) => `## ${record.id}\n\nVersion: ${record.version}\nModel: ${record.model}\nReasoning: ${record.reasoning_effort}\nMax output tokens: ${record.max_output_tokens}\nSchema: ${record.schema}\nVariables: ${record.variables.join(", ")}\nConsumer: server/mvp/scientific-decision-service.ts and bounded G1.1 evaluator.\nRetry: critic v3 once; only INCOMPLETE_TOKEN_LIMIT permits one recovery. The three-call evaluation-wide cap disables a fourth applied recovery after the qualitative recovery.\nCost reservation: full configured output ceiling plus conservative input/cache-write bound before dispatch.\n\n### Complete instructions\n\n${record.systemPrompt}\n\n### Complete user template\n\n${record.userPromptTemplate}\n`).join("\n") + "\nDynamic variables: intent_json = whitelisted frozen user intent; method_evidence_pack_json = inspectable evidence excerpts and explicit source accounting; decision_json = immutable selector result; incomplete_critic_json = incomplete provider fragment, never authority; missing_schema_fields_json = deterministic missing-field hints.\n", { mode: 0o600 });
  console.log(JSON.stringify(manifest, null, 2));
}

async function apiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const env = parseEnv(await readFile(path.resolve("../ingeniometrix-wt-release0/.env.release"), "utf8"));
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_MISSING");
  return env.OPENAI_API_KEY;
}

async function boundedProvider(directory: string, allowed: string[]) {
  const earlier = await priorNewResults();
  const priorCalls = earlier.reduce((sum, item) => sum + item.calls, 0);
  const priorSpend = earlier.reduce((sum, item) => sum + item.cost_usd, 0);
  const actual = createOpenAiProvider({ apiKey: await apiKey(), defaultModel: selector.model });
  let calls = 0;
  const requests: unknown[] = [];
  const provider: LlmProvider = {
    name: actual.name,
    async generateStructuredObject<T>(request: StructuredObjectInput): Promise<T> {
      if (!allowed.includes(request.schemaName) || calls >= allowed.length || priorCalls + calls >= MAX_CALLS) throw new Error("G1_1_GLOBAL_CALL_LIMIT");
      const bound = responseCostBound({ model: request.model, max_output_tokens: request.maxOutputTokens, reasoning: { effort: request.reasoningEffort }, store: false, input: request.prompt, text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } } });
      if (!bound || priorSpend + bound.maximumUsd > MAX_SPEND) throw new Error("G1_1_GLOBAL_SPEND_LIMIT");
      calls++;
      const record = { call: priorCalls + calls, schema: request.schemaName, model: request.model, max_output_tokens: request.maxOutputTokens, maximum_reserved_usd: bound.maximumUsd, prompt_hash: fingerprint(request.prompt), at: new Date().toISOString() };
      requests.push(record);
      await save(path.join(directory, "dispatches.json"), requests);
      await save(path.join(directory, `${request.schemaName}.request.json`), request);
      const output = await actual.generateStructuredObject<T>(request);
      await save(path.join(directory, `${request.schemaName}.output.json`), output);
      return output;
    },
    generateText: (request: TextGenerationInput) => actual.generateText(request),
    generateTextDetailed: (request: TextGenerationInput) => actual.generateTextDetailed(request),
  };
  return { provider, calls: () => calls };
}

async function evaluationJob(caseId: string, input: any) {
  const user = await prisma.user.create({ data: { email: `rc4-g1-1-${caseId}-${Date.now()}@example.test` } });
  const project = await prisma.project.create({ data: { userId: user.id, title: String(input.intake.topic), program: "Evaluación privada G1.1", degreeLevel: input.academic_level, university: null } });
  const startedAt = new Date();
  const job = await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, status: "RUNNING", startedAt, lockedAt: startedAt, metadataJson: { evaluation: "rc4-g1-1", caseId, frozenInputHash: input.input_hash } } });
  return { user, project, job, startedAt };
}

async function closeJob(jobId: string, ok: boolean, error: string | null) {
  await prisma.$transaction(async (tx) => {
    await tx.blueprintJob.update({ where: { id: jobId }, data: { status: ok ? "WAITING_USER_DECISION" : "FAILED", lockedAt: null, errorMessage: error, completedAt: ok ? null : new Date() } });
    await closeJobCostControl(tx, jobId, ok ? "COMPLETED" : "FAILED");
  });
}

function usageSummary(cost: any) {
  const entries = cost?.entries ?? [];
  return {
    input_tokens: entries.reduce((sum: number, entry: any) => sum + (entry.usage?.input_tokens ?? 0), 0),
    cached_input_tokens: entries.reduce((sum: number, entry: any) => sum + (entry.usage?.input_tokens_details?.cached_tokens ?? 0), 0),
    output_tokens: entries.reduce((sum: number, entry: any) => sum + (entry.usage?.output_tokens ?? 0), 0),
    total_tokens: entries.reduce((sum: number, entry: any) => sum + (entry.usage?.total_tokens ?? 0), 0),
  };
}

async function runQualitative() {
  const directory = path.join(ROOT, "qualitative-recovery");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, "execution.lock"), new Date().toISOString(), { mode: 0o600, flag: "wx" });
  const input = verifiedFrozenInput(await read(path.join(SOURCE, "qualitative.input.json")));
  const decision = scientificDecisionV2Schema.parse(await read(path.join(SOURCE, "qualitative/selector.output.json")));
  const intent = intentFromIntake({ ...input.intake, degreeLevel: input.academic_level });
  const pack = buildMethodEvidencePack(input.ledger);
  validateScientificDecision(decision, intent, pack);
  const incomplete = await oldIncomplete();
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  process.env.LLM_REQUEST_TIMEOUT_MS = "240000";
  process.env.IMX_LLM_AUDIT_DIR = path.join(directory, "provider-calls");
  const { provider, calls } = await boundedProvider(directory, ["design_critic_recovery_1"]);
  const state = await evaluationJob("qualitative-recovery", input);
  let result: any, error: string | null = null, cost: any;
  await withJobExecution({ jobId: state.job.id, startedAt: state.startedAt, stage: "scientific_critic_closure" }, async () => {
    try {
      result = await withApplicationBudget(new ApplicationBudget(2, 1.25), () => critiqueScientificDecision({ projectId: state.project.id, runId: state.job.id, intent, pack, decision, provider, previousIncomplete: { partialOutput: incomplete.audit.response.output_text, reason: "max_output_tokens" } }));
    } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    cost = await jobCostSnapshot();
  });
  await closeJob(state.job.id, Boolean(result), error);
  const summary = { case: "qualitative", project_id: state.project.id, job_id: state.job.id, source_selector_hash: fingerprint(decision), source_selector_rerun: false, calls: calls(), cost_usd: cost?.committed_usd ?? 0, usage: usageSummary(cost), completion: result?.completion ?? null, critique: result?.critique ?? null, source_decisions: result ? accountDecisionSources(pack, decision) : null, error };
  await save(path.join(directory, "result.json"), summary);
  console.log(JSON.stringify({ case: summary.case, calls: summary.calls, cost_usd: summary.cost_usd, usage: summary.usage, completion: summary.completion, error }, null, 2));
  if (!result) process.exitCode = 1;
}

async function runApplied() {
  const qualitative = await read(path.join(ROOT, "qualitative-recovery/result.json"));
  if (qualitative.error || qualitative.completion?.recovery !== "COMPLETE") throw new Error("QUALITATIVE_CLOSURE_NOT_COMPLETE");
  const directory = path.join(ROOT, "applied-education");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(directory, "execution.lock"), new Date().toISOString(), { mode: 0o600, flag: "wx" });
  const input = verifiedFrozenInput(await read(path.join(SOURCE, "applied-education.input.json")));
  const intent = intentFromIntake({ ...input.intake, degreeLevel: input.academic_level });
  const pack = buildMethodEvidencePack(input.ledger);
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  process.env.LLM_REQUEST_TIMEOUT_MS = "240000";
  process.env.IMX_LLM_AUDIT_DIR = path.join(directory, "provider-calls");
  const { provider, calls } = await boundedProvider(directory, ["design_selector_g1_1", "design_critic_0"]);
  const state = await evaluationJob("applied-education", input);
  let decision: any, reviewed: any, error: string | null = null, cost: any;
  await withJobExecution({ jobId: state.job.id, startedAt: state.startedAt, stage: "scientific_design_closure" }, async () => {
    try {
      await withApplicationBudget(new ApplicationBudget(2, 1.25), async () => {
        const prompt = resolveTemplate(selector, { intent_json: intent, method_evidence_pack_json: pack });
        decision = scientificDecisionV2Schema.parse(await stageCheckpoint("DESIGN_SELECTOR_G1_1", { prompt, model: selector.model, effort: selector.reasoning_effort, output: selector.max_output_tokens }, () => provider.generateStructuredObject({ prompt, schema: z.toJSONSchema(scientificDecisionV2Schema), schemaName: "design_selector_g1_1", model: selector.model, reasoningEffort: selector.reasoning_effort, maxOutputTokens: selector.max_output_tokens, trackingAttribution: { projectId: state.project.id, runId: state.job.id, stage: "scientific_design_selector", promptVersion: selector.version, schemaName: "design_selector_g1_1" } })));
        validateScientificDecision(decision, intent, pack);
        // The task-wide cap leaves no fourth call after qualitative recovery + these
        // two calls. Incompleteness therefore fails closed instead of exceeding it.
        reviewed = await critiqueScientificDecision({ projectId: state.project.id, runId: state.job.id, intent, pack, decision, provider, allowRecovery: false });
      });
    } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    cost = await jobCostSnapshot();
  });
  await closeJob(state.job.id, Boolean(reviewed), error);
  const summary = { case: "applied-education", project_id: state.project.id, job_id: state.job.id, frozen_input_hash: input.input_hash, calls: calls(), cost_usd: cost?.committed_usd ?? 0, usage: usageSummary(cost), selector_complete: Boolean(decision), critic_complete: reviewed?.completion?.first === "COMPLETE", decision: decision ?? null, critique: reviewed?.critique ?? null, completion: reviewed?.completion ?? null, source_decisions: decision ? accountDecisionSources(pack, decision) : null, error };
  await save(path.join(directory, "result.json"), summary);
  console.log(JSON.stringify({ case: summary.case, calls: summary.calls, cost_usd: summary.cost_usd, usage: summary.usage, selector_complete: summary.selector_complete, critic_complete: summary.critic_complete, error }, null, 2));
  if (!reviewed) process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("ISOLATED_RC4_DB_REQUIRED");
  if (process.argv.includes("--prepare")) return prepare();
  if (!process.argv.includes("--paid")) throw new Error("EXPLICIT_PAID_FLAG_REQUIRED");
  if (process.argv.includes("--qualitative-recovery")) return runQualitative();
  if (process.argv.includes("--applied")) return runApplied();
  throw new Error("Use --prepare, --qualitative-recovery --paid, or --applied --paid");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
