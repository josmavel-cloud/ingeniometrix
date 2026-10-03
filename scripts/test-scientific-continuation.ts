import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createConversationalProject, readDefinition, changeDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import { prepareSelectedSources } from "@/server/projects/source-preparation-service";
import { confirmEvidenceSet } from "@/server/projects/evidence-set-service";
import { generationContextForUser } from "@/server/projects/generation-context-service";
import { fixtureSourceAssessments } from "./fixtures/source-sufficiency-test-context";
import { updateSelectedProjectReferences } from "@/server/retrieval/reference-service";
import { enqueueBlueprintJobForUser, runNextBlueprintJobStage, type ReleaseJobExecutor } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { authorizeScientificContinuationQa, enqueueScientificContinuationForUser, readScientificContinuation, validateContinuationCheckpoint } from "@/server/mvp/scientific-continuation";
import { fingerprint, stageCheckpoint } from "@/server/mvp/job-execution-context";
import { decisionContextFingerprint } from "@/server/mvp/scientific-decision-contracts";
import { assertQaCommitment, qaJobPolicy, QA_COST_POLICY_VERSION } from "@/server/mvp/qa-acceptance-policy";
import { reserveInternalGenerationJob } from "@/server/commercial/internal-generation";
import { ledger } from "./test-b3-scientific-contracts";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  global.fetch = async () => { throw new Error("No provider calls permitted"); };
  const user = await prisma.user.create({ data: { email: `continuation-${randomUUID()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `continuation-other-${randomUUID()}@example.test` } });
  const references: string[] = [];
  try {
    const capability = await prisma.internalGenerationCapability.create({ data: { userId: user.id, grantKey: randomUUID(), issuedBy: "isolated-test", reason: "Continuation authorization fixture" } });
    const campaign = await prisma.qaAcceptanceCampaign.create({ data: { id: randomUUID(), userId: user.id, issuedBy: "isolated-test",
      reason: "Scientific continuation fixture", expiresAt: new Date(Date.now() + 3600_000), totalCapMicros: 10000000, jobCapMicros: 5000000, maxJobs: 2 } });
    const created = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Feedback in digital mathematics", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    const view = (await readDefinition(user.id, created.id))!;
    const edited = await changeDefinition(user.id, created.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag,
      action: { kind: "EDIT", field: "concepts", value: "feedback; digital mathematics", knowledge: "KNOWN" } });
    await confirmDefinition(user.id, created.id, edited.revision, edited.definitionHash);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: created.id }, include: { intake: true } });
    for (const index of [1, 2, 3]) {
      const reference = await prisma.reference.create({ data: { title: `Evidencia de aprendizaje ${index}`, normalizedTitle: `continuation fixture ${randomUUID()}`,
        authorsJson: ["Autor sintético"], abstract: `Estudio sintético sobre experiencias de aprendizaje digital ${index}.`, year: 2020 + index } });
      references.push(reference.id);
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id, selected: false, sourceProvider: "SYSTEM", relevanceScore: 50 } });
    }
    await fixtureSourceAssessments(user.id, project.id, references);
    await updateSelectedProjectReferences(user.id, project.id, references);
    await prepareSelectedSources(user.id, project.id);
    await confirmEvidenceSet(user.id, project.id);
    const expectedContext = await generationContextForUser(user.id, project.id);
    const base = structuredClone(ledger); base.project_id = project.id;
    const executor: ReleaseJobExecutor = {
      materialize: async () => {
        const step = await prisma.mvpStepRun.create({ data: { projectId: project.id, userId: user.id, stepKey: "step_5_source_health", status: "COMPLETED" } });
        base.step_run_id = step.id;
        await prisma.projectEvidenceLedger.create({ data: { projectId: project.id, stepRunId: step.id, citationStyle: "APA7",
          sourceRegistryJson: json(base.source_registry), referencesJson: json(base.references), ledgerJson: json(base) } });
        return { status: "completed", project_id: project.id, step_run_id: step.id, artifact_manifest_path: "/tmp/continuation-fixture-manifest" } as never;
      },
      recommend: async () => stageCheckpoint("SCIENTIFIC_DECISION", { fixture: true }, async () => {
        const value = { contextFingerprint: decisionContextFingerprint(project.intake, base), intent: {}, decision: { alternatives: [] }, evidence_pack: {} };
        return { ...value, decisionFingerprint: fingerprint(value) } as never;
      }),
      resolve: async () => { throw new Error("AUTONOMOUS_DESIGN_UNRESOLVED: fixture, not scientific acceptance"); },
      generate: async () => { throw new Error("Must not generate in continuation infrastructure fixture"); },
    };
    const parent = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", expectedContext, operationId: randomUUID() });
    for (let i = 0; i < 4; i++) await runNextBlueprintJobStage(parent.id, executor);
    await prisma.blueprintJob.update({ where: { id: parent.id }, data: { attempts: 8, maxAttempts: 8 } });
    await prisma.blueprintJobStage.create({ data: { jobId: parent.id, stageKey: "control:cost", status: "FAILED", progress: 100,
      outputJson: { entries: [{ estimate: 0.35, maximum: 0.5, status: "completed", stage: "HISTORICAL_FIXTURE" }] } } });
    const old = await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user.id, status: "FAILED",
      metadataJson: { qaCampaignId: campaign.id, costPolicyVersion: QA_COST_POLICY_VERSION } } });
    await prisma.blueprintJobStage.create({ data: { jobId: old.id, stageKey: "control:cost", status: "FAILED", progress: 100,
      outputJson: { entries: [{ estimate: null, maximum: 0.41215, status: "failed_unknown_usage" }] } } });
    const beforeParent = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: parent.id } });
    const beforeCost = await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0));
    assert.equal(beforeCost?.committedBefore, 0.76215);
    await assert.rejects(() => enqueueScientificContinuationForUser(other.id, project.id, parent.id), /PROJECT_NOT_FOUND/);
    await assert.rejects(() => enqueueScientificContinuationForUser(user.id, project.id, parent.id), /NOT_AUTHORIZED/);
    const grant = await authorizeScientificContinuationQa({ userId: user.id, projectId: project.id, parentJobId: parent.id,
      issuedBy: "isolated-test", reason: "New methodological contract explicitly authorized", extendCampaign48Hours: true });
    const replayGrant = await authorizeScientificContinuationQa({ userId: user.id, projectId: project.id, parentJobId: parent.id,
      issuedBy: "isolated-test", reason: "Duplicate request", extendCampaign48Hours: true });
    assert.equal(grant.id, replayGrant.id);
    assert.equal((await prisma.qaAcceptanceCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).expiresAt.getTime(), campaign.expiresAt.getTime() + 48 * 3600_000);
    const results = await Promise.all(Array.from({ length: 4 }, () => enqueueScientificContinuationForUser(user.id, project.id, parent.id)));
    assert.equal(new Set(results.map(row => row.jobId)).size, 1, "One child for concurrent requests");
    const childId = results[0].jobId;
    const continuation = await readScientificContinuation(childId);
    assert.equal(continuation?.contract.parentJobId, parent.id);
    assert.equal(continuation?.contract.reason, "METHOD_COVERAGE_RECONSTRUCTION");
    assert.equal(await prisma.blueprintJobStage.count({ where: { jobId: childId } }), 0, "No copied checkpoints or costs");
    assert.deepEqual(await prisma.blueprintJob.findUniqueOrThrow({ where: { id: parent.id } }), beforeParent, "Exhausted historical parent unchanged");
    assert.equal((await prisma.$transaction(tx => assertQaCommitment(tx, user.id, 0)))?.committedBefore, beforeCost?.committedBefore, "Historical unknown counted exactly once");
    let resolves = 0;
    const childExecutor: ReleaseJobExecutor = {
      materialize: async () => { throw new Error("Must not repeat extraction"); },
      recommend: async () => { throw new Error("Must not repeat selector/critic"); },
      resolve: async ({ jobId, runId }) => { resolves++; assert.equal(jobId, childId); assert.notEqual(runId, continuation!.contract.parentRunId);
        assert.equal((await readScientificContinuation(jobId))!.decision.decisionFingerprint, continuation!.decision.decisionFingerprint); },
      generate: executor.generate,
    };
    const advanced = await runNextBlueprintJobStage(childId, childExecutor);
    assert.equal(advanced.job?.currentStage, "generating_plan"); assert.equal(resolves, 1);
    const ref = continuation!.contract.reusedCheckpointIds.find(row => row.stageKey === "checkpoint:SCIENTIFIC_DECISION")!;
    const original = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { id: ref.id } });
    await prisma.blueprintJobStage.update({ where: { id: ref.id }, data: { outputJson: { value: {}, outputHash: "tampered", files: [], fingerprint: "bad" } } });
    await assert.rejects(() => readScientificContinuation(childId), /CHECKPOINT_INVALID/);
    await prisma.blueprintJobStage.update({ where: { id: ref.id }, data: { outputJson: original.outputJson as Prisma.InputJsonValue } });
    const costRow = await prisma.blueprintJobStage.findUniqueOrThrow({ where: { jobId_stageKey: { jobId: parent.id, stageKey: "control:cost" } } });
    await prisma.blueprintJobStage.update({ where: { id: costRow.id }, data: { outputJson: { entries: [{ estimate: null, maximum: 0.4, status: "failed_unknown_usage" }] } } });
    await assert.rejects(() => readScientificContinuation(childId), /USAGE_UNCERTAIN/);
    await prisma.blueprintJobStage.update({ where: { id: costRow.id }, data: { outputJson: costRow.outputJson as Prisma.InputJsonValue } });
    await prisma.auditLog.create({ data: { userId: user.id, projectId: project.id, actorType: "SYSTEM",
      eventType: "SCIENTIFIC_CONTINUATION_QA_REVOKED", payloadJson: { grantAuditId: grant.id, reason: "Isolated revocation regression" } } });
    await assert.rejects(() => prisma.$transaction(tx => qaJobPolicy(tx, childId)), /NOT_AUTHORIZED/);
    await prisma.internalGenerationCapability.update({ where: { id: capability.id }, data: { status: "REVOKED" } });
    await assert.rejects(() => prisma.$transaction(tx => reserveInternalGenerationJob(tx, childId)), /CAPABILITY_REQUIRED/);
    assert.throws(() => validateContinuationCheckpoint({ status: "COMPLETED", stageKey: "control:cost", outputJson: {} }), /CHECKPOINT_INVALID/);
    assert.equal(await prisma.commercialReservation.count({ where: { userId: user.id } }), 0);
    console.log("PASS continuation: parent 8/8 preserved; concurrent child identity; no repeated science or cost; immutable inherited input; ownership; tamper; QA expiry/idempotency; revocation; worker advances without questions. Provider calls=0.");
  } finally {
    await prisma.internalGenerationAuthorization.deleteMany({ where: { userId: user.id } });
    await prisma.internalGenerationCapability.deleteMany({ where: { userId: user.id } });
    await prisma.qaAcceptanceCampaign.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.reference.deleteMany({ where: { id: { in: references } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
