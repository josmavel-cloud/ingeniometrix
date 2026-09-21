import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { withPaidOperation, reservePreJobCall } from "@/server/mvp/pre-job-budget";
import { reservePaidCall, ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { getCurrentLlmUsageContext } from "@/server/llm-usage-registry";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  global.fetch = async () => { throw new Error("Network forbidden in offline regression"); };
  const user = await prisma.user.create({ data: { email: `rc4-budget-${Date.now()}@example.test` } });
  const input = { userId: user.id, requestId: "request-original", revision: "fixture-v1", purpose: "ideas", inputs: { subject: "Synthetic" } };
  try {
    await assert.rejects(() => reservePaidCall("unscoped", "gpt-5.4-mini", 0.01), /PERSISTENT_PAID_CONTEXT/);
    let executions = 0;
    const work = () => withPaidOperation(input, async () => {
      executions++;
      assert.equal(getCurrentLlmUsageContext()?.requestId, input.requestId);
      assert.equal(getCurrentLlmUsageContext()?.revision, input.revision);
      const calls = await Promise.allSettled([reservePaidCall("ideas", "gpt-5.4-mini", 0.15), reservePaidCall("ideas", "gpt-5.4-mini", 0.15)]);
      assert.equal(calls.filter((call) => call.status === "fulfilled").length, 1);
      for (const call of calls) if (call.status === "fulfilled") await call.value.complete(0.04, { input_tokens: 100, output_tokens: 50 }, "gpt-5.4-mini");
      return { title: "Synthetic result" };
    });
    const concurrent = await Promise.allSettled([work(), work()]);
    assert.ok(concurrent.some((result) => result.status === "fulfilled"));
    assert.equal(executions, 1);
    assert.deepEqual(await work(), { title: "Synthetic result" });
    assert.equal(executions, 1, "replay returns persisted result, not another provider execution");
    await assert.rejects(() => withPaidOperation({ ...input, inputs: "changed" }, async () => null), /INPUT_CONFLICT/);
    const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId: user.id, requestId: input.requestId } } });
    assert.equal(operation.committedMicros, 40000);
    assert.equal(operation.status, "COMPLETED");
    const entries = await prisma.paidOperationCall.findMany({ where: { operationId: operation.id } });
    assert.equal(entries.length, 1);
    assert.equal((entries[0].attributionJson as { requestId: string }).requestId, input.requestId);

    let late: Awaited<ReturnType<typeof reservePreJobCall>> | undefined;
    await withPaidOperation({ ...input, requestId: "request-unknown" }, async () => {
      late = await reservePreJobCall("timeout", "gpt-5.4-mini", 0.2);
      return { incomplete: true };
    });
    const unknown = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId: user.id, requestId: "request-unknown" } }, include: { calls: true } });
    assert.equal(unknown.committedMicros, 200000);
    assert.equal(unknown.calls[0].status, "PENDING_RECONCILIATION");
    assert.equal(unknown.calls[0].estimatedMicros, null);
    await prisma.paidOperation.update({ where: { id: unknown.id }, data: { createdAt: new Date(0) } });
    process.env.IMX_PRE_JOB_DAILY_CAP_USD = "0.25";
    await assert.rejects(() => withPaidOperation({ ...input, requestId: "request-over-daily" }, async () => reservePreJobCall("new", "gpt-5.4-mini", 0.02)), /PRE_JOB_COST_LIMIT/);
    assert.equal(await prisma.paidOperationCall.count({ where: { operation: { userId: user.id } } }), 2, "daily/unknown bounds apply before dispatch");
    await late!.complete(0.1, { input_tokens: 100 }, "gpt-5.4-mini");
    await late!.complete(0.1, { input_tokens: 100 }, "gpt-5.4-mini");
    const settled = await prisma.paidOperation.findUniqueOrThrow({ where: { id: unknown.id } });
    assert.equal(settled.committedMicros, 100000);
    assert.equal(settled.status, "COMPLETED");
    const evaluation = new ApplicationBudget(0.01);
    await assert.rejects(() => withPaidOperation({ ...input, requestId: "request-evaluation" }, () => withApplicationBudget(evaluation, () => reservePaidCall("too-expensive", "gpt-5.4-mini", 0.02))), /BUDGET_BLOCKED/);
    assert.equal(await prisma.paidOperationCall.count({ where: { operation: { userId: user.id } } }), 2);
    await assert.rejects(() => withPaidOperation({ ...input, requestId: "request-foreign", projectId: "not-owned" }, async () => null), /PROJECT_NOT_FOUND/);
    console.log("PASS RC4 pre-job durable reservation, idempotency, ownership, unknown usage, daily cap, late reconciliation, evaluation cap; paid calls=0.");
  } finally {
    delete process.env.IMX_PRE_JOB_DAILY_CAP_USD;
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
