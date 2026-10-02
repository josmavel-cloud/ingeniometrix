import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { createOpenAiProvider, openAiBackgroundRequestFingerprint, ProviderResponsePendingError } from "@/llm/providers/openai";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { closeJobCostControl, jobCostSnapshot, preflightWholeJobCost, reconcileBackgroundJobUsage, recordRetrievedBackgroundResponse, settleCurrentJobCall, stageCheckpoint, withJobExecution } from "@/server/mvp/job-execution-context";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { INTERNAL_GENERATION_POLICY, reserveInternalGenerationJob } from "@/server/commercial/internal-generation";

const usage = { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, output_tokens_details: { reasoning_tokens: 100 }, total_tokens: 1500 };
const response = (id: string, status: string, outputText = "", withUsage = false) => ({
  id,
  object: "response",
  created_at: Math.floor(Date.now() / 1000),
  model: "gpt-6-astra",
  status,
  output: [],
  output_text: outputText,
  usage: withUsage ? usage : null,
  incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
  error: status === "failed" ? { code: "provider_failure", message: "fixture" } : null,
}) as any;

const request = (logicalAttemptKey: string, totalWaitSeconds: number) => {
  const base = { prompt: "Return {ok:true}", schemaName: "background_fixture", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }, model: "gpt-6-astra", reasoningEffort: "high" as const, maxOutputTokens: 1024 };
  return { ...base, logicalAttemptKey, requestFingerprint: openAiBackgroundRequestFingerprint(base), initialPollSeconds: 0.01, maxPollSeconds: 0.02, totalWaitSeconds };
};

async function job(label: string) {
  const user = await prisma.user.create({ data: { email: `background-${label}-${randomUUID()}@example.test` } });
  const project = await prisma.project.create({ data: { userId: user.id, title: `Background ${label}`, program: "Offline", degreeLevel: "MAESTRIA", university: null } });
  const startedAt = new Date();
  await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: `offline-background-${user.id}`,
    issuedBy: "isolated-test", reason: "background transport regression" } });
  const blueprintJob = await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, status: "RUNNING", startedAt, lockedAt: startedAt,
    metadataJson: { executionPolicy: "b4.v1", commercialPolicy: INTERNAL_GENERATION_POLICY, offline: true } } });
  await prisma.$transaction(tx => reserveInternalGenerationJob(tx, blueprintJob.id));
  return { userId: user.id, jobId: blueprintJob.id, startedAt };
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  const createdUsers: string[] = [];
  try {
    const state = await job("restart"); createdUsers.push(state.userId);
    let creates = 0; let retrieves = 0; let counts = 0;
    const client = { responses: {
      inputTokens: { count: async () => { counts++; return { input_tokens: 1200 }; } },
      create: async () => { creates++; return response("resp_restart", "queued"); },
      retrieve: async () => { retrieves++; return retrieves === 1 ? response("resp_restart", "in_progress") : response("resp_restart", "completed", '{"ok":true}', true); },
    } } as any;
    const firstProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: client });
    const input = request("restart-lifecycle", 0);
    await withJobExecution({ jobId: state.jobId, startedAt: state.startedAt, stage: "offline-background" }, () => withApplicationBudget(new ApplicationBudget(2, 1.25), async () => {
      await assert.rejects(() => firstProvider.generateBackgroundStructuredObject!(input), ProviderResponsePendingError);
    }));
    assert.equal(creates, 1); assert.equal(retrieves, 0);
    const persisted = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: state.jobId, stageKey: "provider:background:restart-lifecycle" } } });
    assert.equal((persisted.outputJson as any).responseId, "resp_restart");
    assert.equal((persisted.outputJson as any).status, "PENDING");

    // A new provider instance represents a restarted process. It retrieves the same ID.
    const restartedProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: client });
    const value = await withJobExecution({ jobId: state.jobId, startedAt: state.startedAt, stage: "offline-background" }, () => withApplicationBudget(new ApplicationBudget(2, 1.25), () => restartedProvider.generateBackgroundStructuredObject!<{ ok: boolean }>({ ...input, totalWaitSeconds: 2 })));
    assert.deepEqual(value, { ok: true });
    assert.equal(creates, 1, "restart cannot create a duplicate response");
    assert.equal(retrieves, 2, "polling retrieves the same response until terminal");
    const cached = await withJobExecution({ jobId: state.jobId, startedAt: state.startedAt, stage: "offline-background" }, () => restartedProvider.generateBackgroundStructuredObject!<{ ok: boolean }>({ ...input, totalWaitSeconds: 0 }));
    assert.deepEqual(cached, { ok: true }); assert.equal(creates, 1); assert.equal(retrieves, 2);
    await withJobExecution({ jobId: state.jobId, startedAt: state.startedAt, stage: "offline-background" }, async () => {
      const cost = await jobCostSnapshot();
      assert.equal(cost?.calls, 1); assert.equal(cost?.entries[0].status, "completed"); assert.deepEqual(cost?.entries[0].usage, usage);
      assert.equal(cost?.entries[0].inputTokensReserved, 1200);
      assert.equal(cost?.entries[0].tokenCountProvenance, "EXACT_PROVIDER_COUNT");
    });
    assert.equal(counts, 1, "identical Responses requests reuse the input token count");
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: state.jobId } })).attempts, 0, "polling does not alter job attempts");

    // A -> B -> A under one account must never reuse a different project's
    // provider response or cost checkpoint, even with the same logical key.
    const otherProject = await prisma.project.create({ data: { userId: state.userId, title: "Other isolated project",
      program: "Offline", degreeLevel: "MAESTRIA", university: null } });
    const otherStarted = new Date();
    const otherJob = await prisma.blueprintJob.create({ data: { projectId: otherProject.id, userId: state.userId,
      status: "RUNNING", startedAt: otherStarted, lockedAt: otherStarted,
      metadataJson: { executionPolicy: "b4.v1", commercialPolicy: INTERNAL_GENERATION_POLICY, offline: true } } });
    await prisma.$transaction(tx => reserveInternalGenerationJob(tx, otherJob.id));
    let otherCreates = 0;
    const otherProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: {
      responses: { create: async () => { otherCreates++; return response("resp_other_project", "completed", '{"ok":true}', true); },
        retrieve: async () => { throw new Error("completed fixture is not polled"); } },
    } as any });
    assert.deepEqual(await withJobExecution({ jobId: otherJob.id, startedAt: otherStarted, stage: "offline-background" }, () =>
      otherProvider.generateBackgroundStructuredObject!<{ ok: boolean }>(input)), { ok: true });
    assert.equal(otherCreates, 1);
    assert.deepEqual(await withJobExecution({ jobId: state.jobId, startedAt: state.startedAt, stage: "offline-background" }, () =>
      restartedProvider.generateBackgroundStructuredObject!<{ ok: boolean }>(input)), { ok: true });
    assert.equal(creates, 1);
    const otherResponse = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: otherJob.id, stageKey: "provider:background:restart-lifecycle" } } });
    assert.equal((otherResponse.outputJson as any).responseId, "resp_other_project");

    // A terminal job may receive attributed usage later. The reconciliation is
    // idempotent and keeps the original unknown reservation in the audit trail.
    const late = await job("late"); createdUsers.push(late.userId);
    const lateInput = request("late-usage", 0);
    const lateProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: {
      responses: { create: async () => response("resp_late", "queued"), retrieve: async () => { throw new Error("not retrieved during dispatch"); } },
    } as any });
    await withJobExecution({ jobId: late.jobId, startedAt: late.startedAt, stage: "offline-late" }, () =>
      assert.rejects(() => lateProvider.generateBackgroundStructuredObject!(lateInput), ProviderResponsePendingError));
    const lateResponse = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: late.jobId, stageKey: "provider:background:late-usage" } } });
    const lateRecord = lateResponse.outputJson as any;
    await withJobExecution({ jobId: late.jobId, startedAt: late.startedAt, stage: "offline-late" }, () =>
      settleCurrentJobCall(lateRecord.reservationId, null, null));
    await prisma.$transaction(async tx => {
      await closeJobCostControl(tx, late.jobId, "FAILED");
      await tx.blueprintJob.update({ where: { id: late.jobId }, data: { status: "FAILED" } });
    });
    const retrieved = { jobId: late.jobId, logicalAttemptKey: "late-usage", responseId: "resp_late",
      requestFingerprint: lateInput.requestFingerprint, providerStatus: "completed", actualModel: "gpt-6-astra", usage,
      outputText: '{"ok":true}' };
    await Promise.all([recordRetrievedBackgroundResponse(retrieved), recordRetrievedBackgroundResponse(retrieved)]);
    assert.equal(await prisma.auditLog.count({ where: { userId: late.userId, eventType: "BACKGROUND_RESPONSE_RETRIEVED_LATE" } }), 1);
    const proof = { jobId: late.jobId, logicalAttemptKey: "late-usage", reservationId: lateRecord.reservationId,
      responseId: "resp_late", requestFingerprint: lateInput.requestFingerprint,
      estimate: 0.017, usage, actualModel: "gpt-6-astra" };
    const concurrent = await Promise.all([reconcileBackgroundJobUsage(proof), reconcileBackgroundJobUsage(proof)]);
    assert.equal(concurrent.filter(item => item.reconciled).length, 1);
    await assert.rejects(() => reconcileBackgroundJobUsage({ ...proof, estimate: 0.019 }), /CONTRADICTORY/);
    await assert.rejects(() => reconcileBackgroundJobUsage({ ...proof, responseId: "resp_other" }), /PROVENANCE_MISMATCH/);
    const settled = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: late.jobId, stageKey: "control:cost" } } });
    assert.equal((settled.outputJson as any).entries[0].estimate, 0.017);
    assert.equal((settled.outputJson as any).entries[0].status, "completed");
    assert.equal((settled.outputJson as any).entries[0].category, "RECONCILED_PROVIDER_COST",
      "usage recovery does not certify the scientific output");
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: late.jobId } })).status, "FAILED");
    assert.equal(await prisma.auditLog.count({ where: { userId: late.userId, eventType: "BACKGROUND_JOB_USAGE_RECONCILED" } }), 1);

    const foreground = await job("foreground-timeout"); createdUsers.push(foreground.userId);
    let foregroundDispatches = 0;
    const foregroundProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: {
      responses: { create: async () => { foregroundDispatches++; throw Object.assign(new Error("Request timed out"), { status: 408 }); },
        retrieve: async () => { throw new Error("foreground response has no retrieval ID"); } },
    } as any });
    await withJobExecution({ jobId: foreground.jobId, startedAt: foreground.startedAt, stage: "offline-foreground" }, () =>
      assert.rejects(() => foregroundProvider.generateStructuredObject({ prompt: "fixture", schemaName: "timeout_fixture",
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
        model: "gpt-6-astra", maxOutputTokens: 1024 }), /Request timed out/));
    assert.equal(foregroundDispatches, 1, "uncertain foreground dispatch cannot be retried blindly");
    const foregroundCost = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: foreground.jobId, stageKey: "control:cost" } } });
    assert.equal((foregroundCost.outputJson as any).entries.length, 1);
    assert.equal((foregroundCost.outputJson as any).entries[0].status, "failed_unknown_usage");

    const malformed = await job("malformed-output"); createdUsers.push(malformed.userId);
    let malformedCreates = 0;
    const malformedProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: {
      responses: { create: async () => { malformedCreates++; return response("resp_malformed", "completed", "not-json", true); },
        retrieve: async () => { throw new Error("not retrieved"); } },
    } as any });
    const malformedInput = request("malformed-output", 0);
    const runMalformed = () => withJobExecution({ jobId: malformed.jobId, startedAt: malformed.startedAt,
      stage: "offline-malformed" }, () => malformedProvider.generateBackgroundStructuredObject!(malformedInput));
    await assert.rejects(runMalformed, SyntaxError);
    await assert.rejects(runMalformed, SyntaxError);
    assert.equal(malformedCreates, 1, "schema-invalid output retains known usage without another dispatch");
    const malformedCost = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: malformed.jobId, stageKey: "control:cost" } } });
    assert.equal((malformedCost.outputJson as any).entries[0].status, "completed");

    const rejected = await job("preflight-reject"); createdUsers.push(rejected.userId);
    let rejectedCreates = 0;
    const rejectedProvider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: {
      responses: { create: async () => { rejectedCreates++; return response("resp_never", "completed", '{"ok":true}', true); },
        retrieve: async () => { throw new Error("not retrieved"); } },
    } as any });
    await withJobExecution({ jobId: rejected.jobId, startedAt: rejected.startedAt, stage: "offline-reject" }, () =>
      assert.rejects(() => rejectedProvider.generateBackgroundStructuredObject!({ ...request("preflight-reject", 0),
        maxOutputTokens: 100000, requestFingerprint: openAiBackgroundRequestFingerprint({ ...request("preflight-reject", 0), maxOutputTokens: 100000 }) }), /COST_LIMIT/));
    assert.equal(rejectedCreates, 0, "cost guard rejects before provider dispatch");
    const forecastRun = () => withJobExecution({ jobId: rejected.jobId, startedAt: rejected.startedAt, stage: "offline-reject" }, () =>
      stageCheckpoint("BUDGET_PREFLIGHT_FIXTURE", { version: 1 }, () => preflightWholeJobCost({
        nextStage: "offline", nextStageReservation: 1.2, minimumRemainingMandatoryReservation: 0.8 })));
    for (let i = 0; i < 4; i++) await assert.rejects(forecastRun, /COST_LIMIT_REACHED/);
    const budgetCheckpoint = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: {
      jobId: rejected.jobId, stageKey: "checkpoint:BUDGET_PREFLIGHT_FIXTURE" } } });
    assert.equal((budgetCheckpoint.inputJson as any).attempts, 1, "a pre-dispatch budget rejection cannot exhaust scientific recovery attempts");
    assert.equal(rejectedCreates, 0);

    for (const terminal of ["completed", "failed", "cancelled", "incomplete"] as const) {
      const terminalState = await job(terminal); createdUsers.push(terminalState.userId);
      let terminalCreates = 0;
      const terminalClient = { responses: { create: async () => { terminalCreates++; return response(`resp_${terminal}`, terminal, terminal === "completed" ? '{"ok":true}' : terminal === "incomplete" ? "{}" : "", terminal === "completed" || terminal === "incomplete"); }, retrieve: async () => { throw new Error("terminal response must not be polled"); } } } as any;
      const provider = createOpenAiProvider({ apiKey: "offline", defaultModel: "gpt-6-astra", responseClient: terminalClient });
      const terminalInput = request(`terminal-${terminal}`, 1);
      const run = () => withJobExecution({ jobId: terminalState.jobId, startedAt: terminalState.startedAt, stage: "offline-terminal" }, () => withApplicationBudget(new ApplicationBudget(2, 1.25), () => provider.generateBackgroundStructuredObject!(terminalInput)));
      if (terminal === "completed") assert.deepEqual(await run(), { ok: true });
      else if (terminal === "incomplete") await assert.rejects(run, IncompleteStructuredOutputError);
      else await assert.rejects(run, new RegExp(`OPENAI_BACKGROUND_${terminal.toUpperCase()}`));
      assert.equal(terminalCreates, 1);
    }

    // An unknown-usage reservation remains committed at its maximum; it is never released as zero.
    const allCosts = await prisma.blueprintJobStage.findMany({ where: { job: { userId: { in: createdUsers } }, stageKey: "control:cost" } });
    assert.ok(allCosts.some((row) => (row.outputJson as any).entries.some((entry: any) => entry.status === "failed_unknown_usage" && entry.estimate === null && entry.maximum > 0)), "unknown usage keeps its maximum reservation");
    console.log("RC4 background response transport: PASS");
  } finally {
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
