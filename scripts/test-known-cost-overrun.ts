import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { reserveJobCall, withJobExecution, jobCostSnapshot, preflightWholeJobCost } from "@/server/mvp/job-execution-context";
import { INTERNAL_GENERATION_POLICY, reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { INTERNAL_PILOT_COST_POLICY_VERSION } from "@/server/mvp/execution-policy";

global.fetch = async () => { throw new Error("NO_PROVIDER_IN_COST_REGRESSION"); };
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  const user = await prisma.user.create({ data: { email: `known-cost-${randomUUID()}@example.test` } });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Synthetic known usage deviation", degreeLevel: "MAESTRIA" } });
    await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: randomUUID(), issuedBy: "isolated-test", reason: "Cost regression" } });
    const job = await prisma.blueprintJob.create({ data: { userId: user.id, projectId: project.id, status: "RUNNING", startedAt: new Date(),
      metadataJson: { commercialPolicy: INTERNAL_GENERATION_POLICY, costPolicyVersion: INTERNAL_PILOT_COST_POLICY_VERSION } } });
    await prisma.$transaction(tx => reserveInternalGenerationJob(tx, job.id));
    const known = { id: randomUUID(), purpose: "synthetic-known-stage", stage: "METHOD_ASSESSMENT", model: "fixture", actualModel: "fixture-v1",
      maximum: 0.6034, estimate: 0.60385, usage: { input_tokens: 15540, output_tokens: 0 }, status: "completed",
      startedAt: new Date().toISOString(), category: "SUCCESSFUL_SCIENTIFIC_COST", retry: false, mandatoryReserve: 0.25,
      inputTokensReserved: 15504, tokenCountProvenance: "EXACT_PROVIDER_COUNT" };
    const unknown = { ...known, id: randomUUID(), maximum: 0.25, estimate: null, usage: null, status: "failed_unknown_usage" };
    // An isolated historical fixture: actual cost already known; no new call or
    // manual production reconciliation is used to create this regression.
    await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: "control:cost", status: "RUNNING", progress: 0,
      outputJson: { policy: { target: 2, soft: 2, hard: 2, deep: 0.5, mandatoryReserve: 0.25 }, entries: [known, unknown] } } });
    await withJobExecution({ jobId: job.id, startedAt: job.startedAt!, stage: "METHOD_RECONSTRUCTION" }, async () => {
      // Full forecast and dispatch guard both use .60385, never .6034 + .60385.
      const forecast = await preflightWholeJobCost({ nextStage: "next", nextStageReservation: 0.6, minimumRemainingMandatoryReservation: 0.2 });
      assert.equal(forecast!.knownSpent, 0.60385); assert.equal(forecast!.unknownReserved, 0.25);
      await assert.rejects(() => reserveJobCall("denied-before-any-new-call", "fixture", 1), /COST_LIMIT/);
      assert.equal(await prisma.auditLog.count({ where: { projectId: project.id, eventType: "JOB_CALL_RESERVATION_OVERRUN_RECORDED" } }), 1, "Discrepancy audit survives a denied next reservation");
      const attempts = await Promise.allSettled([reserveJobCall("next-scientific", "fixture", 0.6), reserveJobCall("next-scientific", "fixture", 0.6)]);
      assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1, "Known overrun permits one fitting next call; lock prevents overspending");
      assert.equal(attempts.filter(row => row.status === "rejected" && /COST_LIMIT/.test(String(row.reason))).length, 1);
      const ticket = (attempts.find(row => row.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveJobCall>>>).value!;
      await Promise.all([ticket.complete(0.1, { input_tokens: 20, output_tokens: 10 }, "fixture"), ticket.complete(0.1, { input_tokens: 20, output_tokens: 10 }, "fixture")]);
      const record = await jobCostSnapshot();
      assert(record && "committed_usd" in record);
      assert(Math.abs(record.committed_usd - 0.95385) < 1e-10, "Known estimate replaces reservation once; historical unknown stays fully reserved");
      assert.deepEqual(record!.entries.find(row => row.id === known.id), known, "Original estimate, maximum, tokens and historical entry unchanged");
      assert.deepEqual(record!.entries.find(row => row.id === unknown.id), unknown);
      assert.equal(await prisma.auditLog.count({ where: { projectId: project.id, eventType: "JOB_CALL_RESERVATION_OVERRUN_RECORDED" } }), 1);
      await assert.rejects(() => reserveJobCall("too-large", "fixture", 0.8), /COST_LIMIT/, "Total hard cap plus mandatory reserve remains enforced");
      assert.equal(await prisma.auditLog.count({ where: { projectId: project.id, eventType: "JOB_CALL_RESERVATION_OVERRUN_RECORDED" } }), 1, "Rejected reservation does not repeat audit");
      const future = await reserveJobCall("future-small-overrun", "fixture", 0.01);
      await future!.complete(0.011, { input_tokens: 12, output_tokens: 3 }, "fixture");
      await future!.complete(0.011, { input_tokens: 12, output_tokens: 3 }, "fixture");
      assert.equal(await prisma.auditLog.count({ where: { projectId: project.id, eventType: "JOB_CALL_RESERVATION_OVERRUN_RECORDED" } }), 2, "New settlement records its variance once");
      const allowed = await reserveJobCall("within-remainder", "fixture", 0.02);
      await allowed!.complete(0.005, { input_tokens: 5, output_tokens: 1 }, "fixture");
    });
    console.log("PASS known cost overrun: preserved history, known replacement, unknown held, exact hard cap, concurrent admission, idempotent settlement/audit; provider calls=0");
  } finally {
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: user.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
