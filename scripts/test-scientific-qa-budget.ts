import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { assertQaCommitment, QA_COST_POLICY_VERSION } from "@/server/mvp/qa-acceptance-policy";
import { reserveJobCall, withJobExecution } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  const user = await prisma.user.create({ data: { email: `qa-budget-${randomUUID()}@example.test` } });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Synthetic QA budget", degreeLevel: "MAESTRIA" } });
    await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: randomUUID(), issuedBy: "isolated-test", reason: "Offline authorization fixture" } });
    const campaign = await prisma.qaAcceptanceCampaign.create({ data: { id: randomUUID(), userId: user.id, issuedBy: "isolated-test",
      reason: "Offline budget fixture", expiresAt: new Date(Date.now() + 3600000), totalCapMicros: 10000000, jobCapMicros: 5000000, maxJobs: 2 } });
    const job = await prisma.blueprintJob.create({ data: { userId: user.id, projectId: project.id, status: "RUNNING", startedAt: new Date(),
      metadataJson: { commercialPolicy: "internal-platform-v1", costPolicyVersion: QA_COST_POLICY_VERSION, qaCampaignId: campaign.id } } });
    const authorization = await prisma.$transaction(tx => reserveInternalGenerationJob(tx, job.id));
    assert.equal(authorization.hardCapMicros, 5000000);
    await withJobExecution({ jobId: job.id, startedAt: job.startedAt!, stage: "DESIGN_MINI_RESEARCH" }, async () => {
      await withPaidOperation({ userId: user.id, projectId: project.id, requestId: `fixture:${randomUUID()}`,
        purpose: "DESIGN_SUPPORT_MINI_RESEARCH", revision: "frozen", inputs: {} }, async () => {
        const { currentPaidOperation } = await import("@/server/mvp/pre-job-budget");
        const ticket = await reserveJobCall("DESIGN_SUPPORT_MINI_RESEARCH", "fixture", 0.4, 0, currentPaidOperation()!.id);
        await ticket!.complete(0.1, { input_tokens: 10, output_tokens: 5 }, "fixture");
        return { fixture: true };
      });
      const report = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0));
      assert.equal(report?.committedBefore, 0.1, "Nested call counted once, not once per ledger view");
      const unknown = await reserveJobCall("fixture-unknown", "fixture", 0.41215);
      await unknown!.fail();
      const unknownReport = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0));
      assert.equal(unknownReport?.committedBefore, 0.51215, "Unknown reservation is not zero");
      await assert.rejects(() => reserveJobCall("too-large", "fixture", 4.5), /COST_LIMIT/);
      await assert.rejects(() => prisma.$transaction(tx => assertQaCommitment(tx, user.id, 10)), /QA_COMMITMENT/);
      await prisma.qaAcceptanceCampaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(0) } });
      await assert.rejects(() => reserveJobCall("expired", "fixture", 0.01), /QA_AUTHORIZATION_EXPIRED/);
    });
    assert.equal(await prisma.commercialReservation.count({ where: { userId: user.id } }), 0);
    console.log("PASS QA authorization, expiry, nested cost dedupe, unknown reservation and hard caps; provider calls=0");
  } finally {
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: user.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: user.id } });
    await prisma.qaAcceptanceCampaign.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
