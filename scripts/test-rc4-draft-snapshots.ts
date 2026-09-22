import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { draftIntakeFrom, type DraftView } from "@/lib/project-draft-contract";
import { DraftSaveQueue } from "@/lib/draft-save-queue";
import { confirmProjectDraft, readProjectDraft, saveProjectDraft } from "@/server/projects/project-draft-service";
import { currentGenerationInput, frozenProject, readGenerationInput, researchProjectFingerprint } from "@/server/projects/generation-input-snapshot";
import { enqueueBlueprintJobForUser, runNextBlueprintJobStage } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { saveIntakeForProject } from "@/server/projects/project-service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  global.fetch = async () => { throw new Error("No network allowed"); };
  const initial = draftIntakeFrom({ topic: "Original", academicConstraints: "Tiempo limitado", advisorNotes: "Mantener alcance" });
  let sends = 0;
  const queue = new DraftSaveQueue({ id: "fixture", revision: 1, confirmedRevision: 1, etag: "fixture-1", staleScopes: [], intake: initial, updatedAt: "fixture" }, async (revision, intake) => {
    sends++; assert.equal(revision, sends); await new Promise((resolve) => setTimeout(resolve, 5));
    return { id: "fixture", revision: revision + 1, confirmedRevision: 1, etag: `fixture-${revision + 1}`, staleScopes: [], intake, updatedAt: "fixture" };
  });
  await Promise.all([queue.save({ ...initial, topic: "A" }), queue.save({ ...initial, topic: "B" })]);
  assert.ok(queue.matches({ ...initial, topic: "B" })); assert.equal(sends, 2);
  await queue.save({ ...initial, topic: "B" }); assert.equal(sends, 2);
  let rejectedSends = 0;
  const conflictQueue = new DraftSaveQueue({ id: "fixture", revision: 1, confirmedRevision: 1, etag: "fixture-1", staleScopes: [], intake: initial, updatedAt: "fixture" }, async () => { rejectedSends++; throw new Error("CONFLICT"); });
  await assert.rejects(() => conflictQueue.save({ ...initial, topic: "C" }), /CONFLICT/);
  await assert.rejects(() => conflictQueue.save({ ...initial, topic: "D" }), /CONFLICT/);
  assert.equal(rejectedSends, 1, "Conflict cannot silently overwrite with another revision");

  const user = await prisma.user.create({ data: { email: `rc4-drafts-${Date.now()}@example.test` } });
  let referenceId: string | undefined;
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Fixture", program: "Fixture", university: "OTHER", degreeLevel: "MAESTRIA", templateKey: "GENERIC_POSGRADO_PE", intake: { create: initial } } });
    const legacy = await readProjectDraft(user.id, project.id);
    assert.equal(legacy.revision, 0); assert.equal(await prisma.projectDraft.count({ where: { projectId: project.id } }), 0, "GET cannot create state");
    await assert.rejects(() => readProjectDraft("other-user", project.id), /NOT_FOUND/);
    const first = await saveProjectDraft(user.id, project.id, 0, { ...initial, topic: "" });
    assert.equal(first.revision, 1, "Incomplete work must be saved");
    const tabs = await Promise.allSettled([saveProjectDraft(user.id, project.id, 1, { ...initial, topic: "Tab A" }), saveProjectDraft(user.id, project.id, 1, { ...initial, topic: "Tab B" })]);
    assert.equal(tabs.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(tabs.filter((r) => r.status === "rejected").length, 1);
    const saved = (tabs.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<DraftView>).value;
    assert.equal(saved.intake.advisorNotes, initial.advisorNotes);
    await assert.rejects(() => confirmProjectDraft(user.id, project.id, 1));
    const confirmed = await confirmProjectDraft(user.id, project.id, saved.revision);
    const replay = await confirmProjectDraft(user.id, project.id, saved.revision);
    assert.equal(replay.project.intake!.updatedAt.toISOString(), confirmed.project.intake!.updatedAt.toISOString());
    const ref = await prisma.reference.create({ data: { title: "Original reference", normalizedTitle: "original fixture reference", authorsJson: [] } }); referenceId = ref.id;
    const selected = await prisma.projectReference.create({ data: { projectId: project.id, referenceId: ref.id, selected: true, selectedOrder: 1, sourceProvider: "SYSTEM" } });
    const incomplete = await saveProjectDraft(user.id, project.id, saved.revision, { ...saved.intake, advisorNotes: "Nuevo criterio" });
    await assert.rejects(() => saveIntakeForProject(user.id, project.id, initial), /borrador cambió/);
    await assert.rejects(() => enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4" }), /DRAFT_CONFIRMATION_REQUIRED/);
    await confirmProjectDraft(user.id, project.id, incomplete.revision);
    await assert.rejects(() => enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", confirmedDraftRevision: saved.revision }), /DRAFT_REVISION_CONFLICT/);
    const job = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4" });
    const persisted = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: job.id } });
    const id = (persisted.stageDataJson as { inputSnapshotId: string }).inputSnapshotId;
    const input = (await readGenerationInput(job.id, id))!;
    assert.equal(input.project.intake.advisorNotes, "Nuevo criterio");
    assert.equal(input.inspection, null);
    const oldModel = process.env.IMX_STEP5_EXTRACTION_MODEL;
    process.env.IMX_STEP5_EXTRACTION_MODEL = "unapproved-test-model";
    try { await assert.rejects(() => readGenerationInput(job.id, id), /GENERATION_CONFIGURATION_CHANGED/); }
    finally { if (oldModel === undefined) delete process.env.IMX_STEP5_EXTRACTION_MODEL; else process.env.IMX_STEP5_EXTRACTION_MODEL = oldModel; }
    await assert.rejects(() => prisma.generationInputSnapshot.update({ where: { id }, data: { contentHash: "overwrite" } }), /immutable/);
    const originalHash = researchProjectFingerprint(input.project);
    await prisma.intake.update({ where: { projectId: project.id }, data: { topic: "Changed while worker queued" } });
    await prisma.reference.update({ where: { id: ref.id }, data: { title: "Changed reference metadata" } });
    await prisma.projectReference.update({ where: { id: selected.id }, data: { selected: false } });
    const outcome = await runNextBlueprintJobStage(job.id, { materialize: async () => {
      const live = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { intake: true, projectReferences: { where: { selected: true }, include: { reference: true } } } });
      assert.equal(live.projectReferences.length, 0);
      const frozen = frozenProject(live)!;
      assert.equal(researchProjectFingerprint(frozen), originalHash);
      assert.equal(frozen.projectReferences[0].reference.title, "Original reference");
      assert.equal(currentGenerationInput()!.id, id);
      return { status: "completed", step_run_id: "mock-step", artifact_manifest_path: "fixture" } as never;
    }, generate: async () => { throw new Error("Should not draft before approval"); } });
    assert.equal(outcome.job!.status, "WAITING_NEXT_STAGE");
    assert.equal(outcome.job!.currentStage, "scientific_design");
    assert.equal(currentGenerationInput(), undefined, "Frozen context cannot leak between jobs");
    assert.equal((await readGenerationInput(job.id, id))!.project.intake.topic, saved.intake.topic);
    await saveIntakeForProject(user.id, project.id, { ...initial, topic: "Explicit canonical edit" });
    const synchronized = await readProjectDraft(user.id, project.id);
    assert.equal(synchronized.intake.topic, "Explicit canonical edit");
    assert.ok(synchronized.revision > incomplete.revision);
    assert.equal(synchronized.confirmedRevision, synchronized.revision);
    console.log("PASS RC4 drafts/snapshots: partial persistence, two-tab conflict, explicit confirmation, queue ordering, immutable inputs, live edits cannot alter worker snapshot; paid calls=0.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    if (referenceId) await prisma.reference.delete({ where: { id: referenceId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
