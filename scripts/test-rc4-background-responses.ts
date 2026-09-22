import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { createOpenAiProvider, openAiBackgroundRequestFingerprint, ProviderResponsePendingError } from "@/llm/providers/openai";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { jobCostSnapshot, withJobExecution } from "@/server/mvp/job-execution-context";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";

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
  const blueprintJob = await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, status: "RUNNING", startedAt, lockedAt: startedAt, metadataJson: { executionPolicy: "b4.v1", offline: true } } });
  return { userId: user.id, jobId: blueprintJob.id, startedAt };
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  const createdUsers: string[] = [];
  try {
    const state = await job("restart"); createdUsers.push(state.userId);
    let creates = 0; let retrieves = 0;
    const client = { responses: {
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
    });
    assert.equal((await prisma.blueprintJob.findUniqueOrThrow({ where: { id: state.jobId } })).attempts, 0, "polling does not alter job attempts");

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
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
