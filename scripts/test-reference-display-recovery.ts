import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueReferenceDisplayJobs } from "@/server/retrieval/reference-display-jobs";
import { referenceDisplayBatchIdentity } from "@/server/retrieval/reference-display-job-policy";
import { authorizeReferenceDisplayQaBatch, referenceDisplayQaPolicy } from "@/server/retrieval/reference-display-qa";
import { reservePreJobCall, withPaidOperation } from "@/server/mvp/pre-job-budget";
import { assertQaCommitment } from "@/server/mvp/qa-acceptance-policy";

global.fetch = async () => { throw new Error("PROVIDER_FORBIDDEN_IN_OFFLINE_TEST"); };
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  const user = await prisma.user.create({ data: { email: `translation-recovery-${randomUUID()}@example.test` } });
  const refs: string[] = [];
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Synthetic translation recovery", degreeLevel: "MAESTRIA" } });
    const otherProject = await prisma.project.create({ data: { userId: user.id, title: "Isolated other project", degreeLevel: "MAESTRIA" } });
    const capability = await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: randomUUID(), issuedBy: "isolated-test", reason: "Technical QA" } });
    const campaign = await prisma.qaAcceptanceCampaign.create({ data: { id: randomUUID(), userId: user.id, issuedBy: "isolated-test",
      reason: "Synthetic translation QA", expiresAt: new Date(Date.now() + 3600000), totalCapMicros: 10000000, jobCapMicros: 5000000, maxJobs: 2 } });
    const ref = await prisma.reference.create({ data: { title: "The study of public archives", normalizedTitle: "the study of public archives",
      abstract: "The study evaluates conservation methods and their limitations.", authorsJson: [], rawOpenAlexJson: { language: "en" } } }); refs.push(ref.id);
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: ref.id, sourceProvider: "SYSTEM", selected: true } });
    const rows = [{ referenceId: ref.id, reference: ref }];
    const legacyKey = referenceDisplayBatchIdentity(project.id, "es", rows, true);
    assert.notEqual(legacyKey, referenceDisplayBatchIdentity(project.id, "es", rows), "Prompt/schema execution version changes identity; presentation cache unchanged");
    const prior = await prisma.referenceDisplayJob.create({ data: { userId: user.id, projectId: project.id, requestKey: legacyKey,
      referenceIdsJson: [ref.id], targetLanguage: "es", status: "BUDGET_UNAVAILABLE", failureCategory: "BUDGET_UNAVAILABLE" } });
    const oldPaid = await prisma.paidOperation.create({ data: { userId: user.id, projectId: project.id, requestId: legacyKey,
      revision: legacyKey, purpose: "REFERENCE_DISPLAY", inputFingerprint: "old", status: "FAILED", hardCapMicros: 250000 } });
    const unknown = await prisma.paidOperation.create({ data: { userId: user.id, projectId: project.id, requestId: `old-unknown:${randomUUID()}`,
      revision: "historical", purpose: "SOURCE_SUFFICIENCY", inputFingerprint: "history", status: "FAILED", hardCapMicros: 1500000, committedMicros: 1300000,
      calls: { create: { purpose: "history", model: "fixture", reservedMicros: 1300000, status: "UNKNOWN_USAGE", attributionJson: {} } } } });
    // Ordinary daily cap is still enforced even for a technical internal account.
    const ordinary = { userId: user.id, projectId: project.id, requestId: `ordinary:${randomUUID()}`, purpose: "REFERENCE_DISPLAY", revision: "normal", inputs: {} };
    await assert.rejects(() => withPaidOperation(ordinary, () => reservePreJobCall("reference_translation_batch", "fixture", 0.01)), /PRE_JOB_COST_LIMIT/);
    const input = { userId: user.id, projectId: project.id, priorJobId: prior.id, campaignId: campaign.id, issuedBy: "isolated-authority", reason: "Fresh corrected translation acceptance" };
    const [grantA, grantB] = await Promise.all([authorizeReferenceDisplayQaBatch(input), authorizeReferenceDisplayQaBatch(input)]);
    assert.equal(grantA.id, grantB.id, "Concurrent authorization creates one deterministic child batch");
    assert.equal((await prisma.referenceDisplayJob.findUniqueOrThrow({ where: { id: prior.id } })).status, "BUDGET_UNAVAILABLE");
    assert.equal((await prisma.paidOperation.findUniqueOrThrow({ where: { id: oldPaid.id } })).status, "FAILED");
    const enqueued = await enqueueReferenceDisplayJobs(user.id, project.id);
    assert.deepEqual(enqueued.map(job => job.id), [grantA.id], "Mounted card cannot create an overlapping batch");
    const operation = { userId: user.id, projectId: project.id, requestId: grantA.requestKey, purpose: "REFERENCE_DISPLAY", revision: grantA.requestKey, inputs: {} };
    let calls = 0;
    const run = () => withPaidOperation(operation, async () => { calls++; const ticket = await reservePreJobCall("reference_translation_batch", "fixture", 0.05);
      await ticket.complete(0.008, { input_tokens: 30, output_tokens: 20 }, "fixture"); return { complete: true }; });
    await run(); await run(); assert.equal(calls, 1, "Completed paid checkpoint is reused");
    const report = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0));
    assert.equal(report?.committedBefore, 1.308, "Historical unknown still counts; known call replaces reservation exactly once");
    assert.equal((await prisma.paidOperation.findUniqueOrThrow({ where: { id: unknown.id } })).committedMicros, 1300000);
    const actualCall = await prisma.paidOperationCall.findFirstOrThrow({ where: { operation: { requestId: grantA.requestKey } } });
    assert.equal((actualCall.attributionJson as { funding: string }).funding, "SCOPED_QA_TRANSLATION");
    await assert.rejects(prisma.$transaction(tx => referenceDisplayQaPolicy(tx, { ...operation, projectId: otherProject.id })), /AUTHORIZATION_INVALID/);
    await prisma.internalGenerationCapability.update({ where: { id: capability.id }, data: { status: "REVOKED" } });
    await assert.rejects(prisma.$transaction(tx => referenceDisplayQaPolicy(tx, operation)), /AUTHORIZATION_INVALID/);
    await prisma.internalGenerationCapability.update({ where: { id: capability.id }, data: { status: "ACTIVE" } });
    await prisma.qaAcceptanceCampaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(prisma.$transaction(tx => referenceDisplayQaPolicy(tx, operation)), /AUTHORIZATION_INVALID/);
    await prisma.qaAcceptanceCampaign.update({ where: { id: campaign.id }, data: { expiresAt: new Date(Date.now() + 3600000) } });
    const uncertainRef = await prisma.reference.create({ data: { title: "Methods in education", normalizedTitle: "methods in education", authorsJson: [], rawOpenAlexJson: { language: "en" } } }); refs.push(uncertainRef.id);
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: uncertainRef.id, sourceProvider: "SYSTEM" } });
    const uncertainKey = referenceDisplayBatchIdentity(project.id, "es", [{ referenceId: uncertainRef.id, reference: uncertainRef }], true);
    const uncertainJob = await prisma.referenceDisplayJob.create({ data: { userId: user.id, projectId: project.id, targetLanguage: "es",
      requestKey: uncertainKey, referenceIdsJson: [uncertainRef.id], status: "FAILED" } });
    await prisma.paidOperation.create({ data: { userId: user.id, projectId: project.id, requestId: uncertainKey, revision: uncertainKey, purpose: "REFERENCE_DISPLAY",
      inputFingerprint: "uncertain", status: "FAILED", hardCapMicros: 250000, committedMicros: 50000,
      calls: { create: { purpose: "reference_translation_batch", model: "fixture", reservedMicros: 50000, status: "UNKNOWN_USAGE", attributionJson: {} } } } });
    await assert.rejects(authorizeReferenceDisplayQaBatch({ ...input, priorJobId: uncertainJob.id }), /NOT_PROVEN_UNDISPATCHED/);
    const next = await enqueueReferenceDisplayJobs(user.id, project.id);
    assert(next.some(job => job.id === uncertainJob.id));
    assert.equal(await prisma.referenceDisplayJob.count({ where: { projectId: project.id, referenceIdsJson: { array_contains: uncertainRef.id } } }), 1,
      "Regrouping/prompt version cannot bypass uncertain usage");
    console.log("PASS translation recovery: scoped QA, ordinary cap, no-dispatch proof, concurrency, unknown reservation, regrouping, ownership, expiry/revocation; provider calls=0");
  } finally {
    await prisma.referenceDisplayJob.deleteMany({ where: { userId: user.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: user.id } });
    await prisma.qaAcceptanceCampaign.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
