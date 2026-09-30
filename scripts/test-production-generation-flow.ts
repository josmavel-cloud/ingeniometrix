import { fixtureSourceAssessments } from "./fixtures/source-sufficiency-test-context";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { createConversationalProject, readDefinition, changeDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import type { ConversationalView } from "@/lib/conversational-intake";
import { syncSourceSelectionToDraft } from "@/server/projects/project-draft-service";
import { generationContextForUser, assertExpectedGenerationContext } from "@/server/projects/generation-context-service";
import { enqueueBlueprintJobForUser, runNextBlueprintJobStage } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { grantTestPackage, removeTestCommercialData } from "./fixtures/commercial";
import { DISPLAY_TRANSLATION_POLICY, referenceDisplayContentHash, readReferenceDisplayTranslations } from "@/server/retrieval/reference-translation-service";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "127.0.0.1" || url.port !== "55440" || url.pathname !== "/imx_b4_validation_rc4")
    throw new Error("Isolated test DB required");
  const user = await prisma.user.create({ data: { email: `generation-flow-${randomUUID()}@example.test` } });
  const refs: string[] = [];
  let projectId: string | null = null;
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation",
      idea: "Estudio de estrategias de aprendizaje en una comunidad académica", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    projectId = project.id;
    const initial = await readDefinition(user.id, project.id);
    assert.ok(initial);
    let definition: ConversationalView = initial;
    for (let revision = 2; revision <= 14; revision++) {
      definition = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: definition.revision,
        etag: definition.etag, action: { kind: "EDIT", field: "concepts", value: `aprendizaje, evaluación, variante ${revision}`,
          knowledge: "KNOWN" } });
    }
    assert.equal(definition.revision, 14);
    await confirmDefinition(user.id, project.id, definition.revision, definition.definitionHash);
    const reference = await prisma.reference.create({ data: { title: "Estudio de los procesos de aprendizaje",
      normalizedTitle: "estudio de los procesos de aprendizaje", authorsJson: ["Fixture"],
      abstract: "El estudio analiza el aprendizaje de los estudiantes y la evaluación en el contexto académico." } });
    refs.push(reference.id);
    await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id,
      selected: true, selectedOrder: 1, sourceProvider: "SYSTEM" } });
    for (let i = 2; i <= 3; i++) {
      const extra = await prisma.reference.create({ data: { title: `Estudio complementario de aprendizaje ${i}`,
        normalizedTitle: `estudio complementario de aprendizaje ${i}`, authorsJson: ["Fixture"], abstract: "Un resumen real del fixture de aprendizaje." } });
      refs.push(extra.id);
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: extra.id, selected: true, selectedOrder: i, sourceProvider: "SYSTEM" } });
    }
    await fixtureSourceAssessments(user.id, project.id, refs);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
      await syncSourceSelectionToDraft(tx, project.id, refs);
    });
    const context = await generationContextForUser(user.id, project.id);
    assert.equal(context.confirmedRevision, 14);
    assert.equal(context.draftRevision, 15);
    assert.equal(context.definitionHash, definition.definitionHash);
    assert.equal(context.evidenceSetId, null);
    assert.throws(() => assertExpectedGenerationContext({ ...context, definitionHash: "0".repeat(64) }, context), /DEFINITION_REVISION_CONFLICT/);
    assert.throws(() => assertExpectedGenerationContext({ ...context, selectionHash: "0".repeat(64) }, context), /SOURCE_SELECTION_CONFLICT/);
    await grantTestPackage(user.id);
    const operationId = randomUUID();
    const job = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", expectedContext: context, operationId });
    assert.equal(job.currentStage, "preparing_sources");
    assert.equal(await prisma.projectEvidenceSet.count({ where: { projectId: project.id } }), 0);
    const replay = await enqueueBlueprintJobForUser(user.id, project.id, { scientificProfile: "rc4", expectedContext: context, operationId });
    assert.equal(replay.id, job.id);
    assert.equal(await prisma.commercialReservation.count({ where: { jobId: job.id } }), 1);
    const stage = await runNextBlueprintJobStage(job.id);
    assert.equal(stage.job?.currentStage, "materializing_evidence");
    assert.equal(await prisma.projectEvidenceSet.count({ where: { projectId: project.id } }), 1);
    const evidence = await prisma.projectEvidenceSet.findFirstOrThrow({ where: { projectId: project.id } });
    assert.notEqual(evidence.readiness, "BLOCKED");
    assert.equal(await prisma.generationInputSnapshot.count({ where: { jobId: job.id } }), 1);
    const beforeDisplay = await generationContextForUser(user.id, project.id);
    assert.equal(beforeDisplay.confirmedRevision, 14);
    const sourceBefore = await prisma.reference.findUniqueOrThrow({ where: { id: reference.id } });
    await prisma.referenceDisplayTranslation.create({ data: { referenceId: reference.id,
      contentHash: referenceDisplayContentHash(reference), targetLanguage: "es", policyVersion: DISPLAY_TRANSLATION_POLICY,
      sourceLanguage: "es", displayTitle: null, displayAbstract: null, provenance: "OFFLINE_FIXTURE" } });
    assert.equal((await readReferenceDisplayTranslations([sourceBefore], "es")).size, 1);
    assert.deepEqual((await prisma.reference.findUniqueOrThrow({ where: { id: reference.id } })).updatedAt, sourceBefore.updatedAt);
    assert.equal((await generationContextForUser(user.id, project.id)).evidenceSetId, beforeDisplay.evidenceSetId);
    await prisma.reference.update({ where: { id: reference.id }, data: { title: "Estudio revisado de los procesos de aprendizaje" } });
    const revisedReference = await prisma.reference.findUniqueOrThrow({ where: { id: reference.id } });
    assert.equal((await readReferenceDisplayTranslations([revisedReference], "es")).size, 0,
      "canonical content changes invalidate only the matching display translation");
    assert.equal((await generationContextForUser(user.id, project.id)).evidenceSetId, null,
      "a real bibliographic edit invalidates the current evidence pool");
    await assert.rejects(prisma.projectEvidenceSet.update({ where: { id: evidence.id }, data: { readiness: "BLOCKED" } }));
    console.log("PASS production generation flow: confirmed 14, aggregate 15, durable preparation, immutable evidence, frozen input, translation isolation, one reservation; provider calls 0");
  } finally {
    await removeTestCommercialData([user.id]);
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } });
    if (projectId) await rm(`artifacts-local/mvp-source-inspection/${projectId}`, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "TEST_FAILED"); process.exitCode = 1; });
