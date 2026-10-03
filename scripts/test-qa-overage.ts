import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { reserveInternalGenerationJob, assertInternalGenerationAuthorization } from "@/server/commercial/internal-generation";
import { QA_COST_POLICY_VERSION, QA_OVERAGE_AUTHORIZED_EVENT, assertQaCommitment, qaJobPolicy } from "@/server/mvp/qa-acceptance-policy";
import { provisionQaOverage, revokeQaOverage, type QaOverageRequest } from "@/server/mvp/qa-overage-provisioning";
import { preflightWholeJobCost, reserveJobCall, withJobExecution } from "@/server/mvp/job-execution-context";
import { internalPilotJobCostPolicy } from "@/server/mvp/execution-policy";
import { ApplicationBudget, currentApplicationBudget, hasPaidBudgetContext, reservePaidCall, withApplicationBudget } from "@/server/mvp/application-budget";
import { currentPaidOperation, withPaidOperation } from "@/server/mvp/pre-job-budget";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  global.fetch = async () => { throw new Error("Provider calls forbidden in QA overage regression"); };
  const user = await prisma.user.create({ data: { email: `qa-overage-${randomUUID()}@example.test` } });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Isolated QA funding", degreeLevel: "MAESTRIA" } });
    const otherProject = await prisma.project.create({ data: { userId: user.id, title: "Other project", degreeLevel: "MAESTRIA" } });
    const capability = await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: randomUUID(), issuedBy: "isolated-test", reason: "Synthetic test" } });
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const campaign = await prisma.qaAcceptanceCampaign.create({ data: { id: randomUUID(), userId: user.id, issuedBy: "isolated-test", reason: "Synthetic test",
      expiresAt: new Date(expiresAt), totalCapMicros: 10_000_000, jobCapMicros: 5_000_000, maxJobs: 2 } });
    const parent = await prisma.blueprintJob.create({ data: { userId: user.id, projectId: project.id, status: "FAILED",
      metadataJson: { qaCampaignId: campaign.id, commercialPolicy: "internal-platform-v1", costPolicyVersion: QA_COST_POLICY_VERSION } } });
    const grant = await prisma.auditLog.create({ data: { userId: user.id, projectId: project.id, actorType: "SYSTEM", eventType: "SCIENTIFIC_CONTINUATION_QA_AUTHORIZED",
      payloadJson: { version: "method-coverage-continuation.v1", parentJobId: parent.id, campaignId: campaign.id, frozenInputFingerprint: "frozen-fixture", expiresAt, maxContinuations: 1 } } });
    const metadata = { qaCampaignId: campaign.id, commercialPolicy: "internal-platform-v1", costPolicyVersion: QA_COST_POLICY_VERSION,
      scientificContinuation: { version: "method-coverage-continuation.v1", parentJobId: parent.id, frozenInputFingerprint: "frozen-fixture", grantAuditId: grant.id } };
    const job = await prisma.blueprintJob.create({ data: { userId: user.id, projectId: project.id, status: "RUNNING", startedAt: new Date(), metadataJson: metadata } });
    const auth = await prisma.$transaction(tx => reserveInternalGenerationJob(tx, job.id));
    const policy = { target: 2, soft: 2.5, hard: 5, deep: 0.5, mandatoryReserve: 0.25, version: QA_COST_POLICY_VERSION };
    const entry = (cost: number | null, maximum: number) => ({ id: randomUUID(), purpose: "historical", stage: "fixture", model: "fixture", actualModel: "fixture",
      maximum, estimate: cost, usage: cost === null ? null : { input_tokens: 1 }, status: cost === null ? "failed_unknown_usage" : "completed",
      startedAt: new Date().toISOString(), category: "SCIENTIFIC", retry: false, mandatoryReserve: 0.25 });
    await prisma.blueprintJobStage.create({ data: { jobId: parent.id, stageKey: "control:cost", status: "COMPLETED", progress: 100, outputJson: { policy, entries: [entry(4.17, 4.17)] } } });
    const initial = { policy, entries: [entry(2.95, 2.95), entry(null, 0.41215)] };
    await prisma.blueprintJobStage.create({ data: { jobId: job.id, stageKey: "control:cost", status: "COMPLETED", progress: 100, outputJson: initial } });
    const parentBefore = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: parent.id, stageKey: "control:cost" } } });
    const request: QaOverageRequest = { userId: user.id, projectId: project.id, jobId: job.id, campaignId: campaign.id,
      issuedBy: "authorized-test-operator", reason: "Explicit bounded scientific QA completion", expiresAt, jobHardUsd: 10, campaignCapUsd: 15,
      forecast: { version: "qa-closure-forecast.v1", stages: [{ stage: "remaining-science", maximumUsd: 6, basis: "synthetic complete-path bound" }],
        safetyReserveUsd: 0.25, contingencyUsd: 0.38785, evidence: "Isolated fixture forecasts; not an invoice" } };
    const dry = await provisionQaOverage(request);
    assert.equal(dry.applied, false);
    assert.equal(await prisma.auditLog.count({ where: { userId: user.id, eventType: QA_OVERAGE_AUTHORIZED_EVENT } }), 0);
    await assert.rejects(() => provisionQaOverage({ ...request, projectId: otherProject.id }), /No .*found|not found/i);
    await assert.rejects(() => provisionQaOverage({ ...request, jobHardUsd: 20, campaignCapUsd: 30 }), /FORECAST_OR_CEILING/);
    const before = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0));
    assert.ok(Math.abs(before!.committedBefore - 7.53215) < 1e-8);
    await assert.rejects(() => prisma.$transaction(tx => assertQaCommitment(tx, user.id, 3)), /QA_COMMITMENT/);
    const grants = await Promise.all([provisionQaOverage(request, true), provisionQaOverage(request, true)]);
    assert.equal(grants[0].grantId, grants[1].grantId, "Concurrent grant is idempotent");
    assert.equal(await prisma.auditLog.count({ where: { userId: user.id, eventType: QA_OVERAGE_AUTHORIZED_EVENT } }), 1);
    assert.equal((await prisma.qaAcceptanceCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).jobCapMicros, 5_000_000);
    assert.equal((await prisma.internalGenerationAuthorization.findUniqueOrThrow({ where: { id: auth.id } })).hardCapMicros, 5_000_000);
    assert.equal((await prisma.$transaction(tx => qaJobPolicy(tx, job.id)))!.policy.hard, 10);
    assert.equal(await prisma.$transaction(tx => assertInternalGenerationAuthorization(tx, job.id)), 10);
    assert.equal((await prisma.$transaction(tx => qaJobPolicy(tx, parent.id)))!.policy.hard, 5, "Grant cannot fund another job");
    await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 3, job.id));
    await assert.rejects(() => prisma.$transaction(tx => assertQaCommitment(tx, user.id, 3)), /QA_COMMITMENT/);
    await assert.rejects(() => prisma.$transaction(tx => assertQaCommitment(tx, user.id, 8, job.id)), /QA_COMMITMENT/);
    await withJobExecution({ jobId: job.id, startedAt: job.startedAt!, stage: "method_coverage" }, async () => {
      const forecast = await preflightWholeJobCost({ nextStage: "method-support", nextStageReservation: 3.3, minimumRemainingMandatoryReservation: 1 });
      assert.equal(forecast!.hardCap, 10);
      const tickets = await Promise.allSettled([reserveJobCall("method-support", "fixture", 3.3), reserveJobCall("method-support", "fixture", 3.3)]);
      assert.equal(tickets.filter(item => item.status === "fulfilled").length, 1, "Concurrent calls still enforce exact effective job cap");
      const fulfilled = tickets.find(item => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveJobCall>>>;
      await fulfilled.value!.complete(0.5, { input_tokens: 1 }, "fixture");
      await withPaidOperation({ userId: user.id, projectId: project.id, requestId: `qa-overage-linked:${randomUUID()}`, purpose: "DESIGN_SUPPORT_MINI_RESEARCH",
        revision: "frozen", inputs: {} }, async () => {
        const ticket = await reserveJobCall("web-support", "fixture", 0.2, 0, currentPaidOperation()!.id);
        await ticket!.complete(0.1, { input_tokens: 1 }, "fixture");
      });
    });
    const totals = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0, job.id));
    assert.ok(Math.abs(totals!.committedBefore - 8.13215) < 1e-8, "Linked provider charge counted once");
    assert.equal(totals!.unknownBefore, 0.41215, "Unknown usage remains fully reserved");
    const saved = (await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: job.id, stageKey: "control:cost" } } })).outputJson as any;
    assert.deepEqual(saved.policy, initial.policy, "Original job cost-policy snapshot unchanged");
    assert.deepEqual(saved.entries.slice(0, 2), initial.entries, "Original known/unknown entries untouched");
    assert.deepEqual((await prisma.blueprintJobStage.findUniqueOrThrow({ where: { id: parentBefore.id } })).outputJson, parentBefore.outputJson);
    const firstGrantBefore = await prisma.auditLog.findUniqueOrThrow({ where: { id: grants[0].grantId! } });
    const superseding: QaOverageRequest = { ...request, supersedesGrantId: grants[0].grantId!, jobHardUsd: 16, campaignCapUsd: 21,
      reason: "Two remaining bounded scientific paths", forecast: { ...request.forecast,
        stages: [{ stage: "two-remaining-method-paths", maximumUsd: 10, basis: "Two bounded hypothetical paths" }], contingencyUsd: 1.78785 } };
    await assert.rejects(() => provisionQaOverage({ ...superseding, supersedesGrantId: randomUUID() }, true), /GRANT_CONFLICT/);
    const preview = await provisionQaOverage(superseding);
    assert.equal(preview.applied, false);
    const successors = await Promise.all([provisionQaOverage(superseding, true), provisionQaOverage(superseding, true)]);
    assert.equal(successors[0].grantId, successors[1].grantId, "Concurrent supersession appends exactly one grant");
    assert.notEqual(successors[0].grantId, grants[0].grantId);
    assert.equal(await prisma.auditLog.count({ where: { userId: user.id, eventType: QA_OVERAGE_AUTHORIZED_EVENT } }), 2);
    assert.deepEqual(await prisma.auditLog.findUniqueOrThrow({ where: { id: firstGrantBefore.id } }), firstGrantBefore,
      "Superseded grant is immutable");
    assert.equal((await prisma.$transaction(tx => qaJobPolicy(tx, job.id)))!.policy.hard, 16);
    assert.equal((await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0, job.id)))!.ceiling, 21);
    await assert.rejects(() => provisionQaOverage(request, true), /GRANT_CONFLICT/, "Old grant request cannot resurrect a superseded authority");
    assert.equal(hasPaidBudgetContext(), false);
    await withJobExecution({jobId:job.id,startedAt:job.startedAt!,stage:"scientific_review"},async()=>{
      assert.equal(currentApplicationBudget(),undefined);
      assert.equal(hasPaidBudgetContext(),true,"Durable job owns the funding context without installing a stale local cap5");
      const next=await reservePaidCall("scientific_review","fixture",6);
      await next.complete(5.5,{input_tokens:1},"fixture");
      const funded=(await prisma.blueprintJobStage.findUniqueOrThrow({where:{jobId_stageKey:{jobId:job.id,stageKey:"control:cost"}}})).outputJson as any;
      assert.equal(funded.policy.hard,5,"Saved original snapshot remains5");
      assert.equal(funded.entries.at(-1).qaAuthorization.effectiveHardCapUsd,16);
      assert.equal(funded.entries.at(-1).qaAuthorization.grantId,successors[0].grantId);
      await assert.rejects(()=>reservePaidCall("scientific_review","fixture",7),/COST_LIMIT|QA_COMMITMENT/);
      await assert.rejects(()=>withApplicationBudget(new ApplicationBudget(.01),()=>reservePaidCall("evaluation_limit","fixture",.02)),/BUDGET_BLOCKED/,
        "Explicit evaluation limits still apply even to a funded job");
    });
    const local=new ApplicationBudget();
    await assert.rejects(()=>withApplicationBudget(local,()=>reservePaidCall("standalone","fixture",6)),/BUDGET_BLOCKED/,
      "Non-worker default evaluation cap is unchanged");
    await prisma.internalGenerationCapability.update({ where: { id: capability.id }, data: { status: "REVOKED" } });
    await assert.rejects(() => prisma.$transaction(tx => qaJobPolicy(tx, job.id)), /CAPABILITY_REQUIRED/);
    await prisma.internalGenerationCapability.update({ where: { id: capability.id }, data: { status: "ACTIVE" } });
    const revocations = await Promise.all([revokeQaOverage({ grantId: grants[0].grantId!, issuedBy: "test", reason: "revoke" }),
      revokeQaOverage({ grantId: grants[0].grantId!, issuedBy: "test", reason: "revoke" })]);
    assert.equal(revocations[0].id, revocations[1].id);
    assert.equal((await prisma.$transaction(tx => qaJobPolicy(tx, job.id)))!.policy.hard, 5, "Revoking a predecessor revokes the full branch; no fallback to old grant");
    await assert.rejects(() => provisionQaOverage(request, true), /REVOKED/);
    await prisma.qaAcceptanceCampaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(() => prisma.$transaction(tx => qaJobPolicy(tx, job.id)), /EXPIRED/);
    assert.equal(internalPilotJobCostPolicy().hard, 3, "Ordinary internal pilot remains unchanged");
    assert.equal(await prisma.commercialReservation.count({ where: { userId: user.id } }), 0);
    console.log("PASS: exact-job QA overlay, dry-run, idempotent grant/supersession/branch revoke, concurrency caps, linked accounting, unknown retained, historical policy immutable, ordinary pilot unchanged; provider calls=0");
  } finally {
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: user.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: user.id } });
    await prisma.qaAcceptanceCampaign.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
