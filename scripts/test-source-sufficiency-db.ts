import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createConversationalProject, readDefinition, confirmDefinition } from "@/server/projects/conversational-definition-service";
import { listTopicAreaSuggestions } from "@/server/projects/topic-area-service";
import { updateSelectedProjectReferences } from "@/server/retrieval/reference-service";
import { sourceSufficiencyStatus } from "@/server/retrieval/source-sufficiency-status";
import { fixtureSourceAssessments } from "./fixtures/source-sufficiency-test-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55440"); assert.equal(url.pathname, "/imx_b4_validation_rc4");
  global.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
  const user = await prisma.user.create({ data: { email: `source-policy-${randomUUID()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `source-other-${randomUUID()}@example.test` } });
  const refs: string[] = [];
  try {
    const taxonomy = await prisma.taxonomyConcept.findMany({ where: { scheme: { code: "FORD-2015" } }, include: { scheme: true } });
    assert.equal(taxonomy.length, 50); assert.equal(taxonomy.filter(t => !t.parentId).length, 6);
    assert(taxonomy.every(t => t.labelEs && t.scheme.version === "2015-table-2.2-es-latam-v1"));
    assert.deepEqual(await listTopicAreaSuggestions("educacion"), await listTopicAreaSuggestions("educación"));
    const area = (await listTopicAreaSuggestions("educacion"))[0]; assert(area);
    const options = { schemaVersion: "ResearchIdeaOptions.v1", options: [1,2,3].map(i => ({ workingTitle: `Aprendizaje digital y participación ${i}`,
      briefProblem: "Variaciones de participación en actividades de aprendizaje", purpose: "Analizar la participación", objectOrPopulation: "Actividades digitales",
      context: "Entornos educativos", coreConcepts: ["aprendizaje", "participación"], whyItIsViable: "Debe comprobarse el acceso y alcance", uncertainties: ["Acceso a datos"], provenance: "AI_PROPOSED" })) };
    await withPaidOperation({ userId: user.id, requestId: "fixture-idea-options", purpose: "research-idea-options", revision: "fixture-v1", inputs: {} }, async () => options);
    const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId: user.id, requestId: "fixture-idea-options" } } });
    const input = { intakeMode: "conversation", idea: options.options[0].workingTitle, degreeLevel: "MAESTRIA", topicAreaId: area.code,
      requestId: randomUUID(), ideaChoice: { operationId: operation.id, index: 0 } };
    await assert.rejects(createConversationalProject(other.id, input), /NOT_AUTHORIZED/);
    const p = await createConversationalProject(user.id, input);
    assert.equal((await createConversationalProject(user.id, input)).id, p.id);
    const view = (await readDefinition(user.id, p.id))!;
    assert.equal(view.definition.fields.object.origin, "AI_PROPOSED"); assert.equal(view.definition.fields.object.acceptance, "UNREVIEWED");
    assert(view.definition.proposals.length >= 5); assert.equal(p.topicAreaId, area.code);
    await confirmDefinition(user.id, p.id, view.revision, view.definitionHash);
    assert.equal((await readDefinition(user.id, p.id))!.definition.fields.object.acceptance, "ACCEPTED");
    for (let i = 0; i < 3; i++) {
      const ref = await prisma.reference.create({ data: { title: `Fuente de aprendizaje ${i}`, normalizedTitle: `fuente de aprendizaje ${i}`, authorsJson: ["Fixture"], abstract: "Resumen auténtico de la publicación sintética." } });
      refs.push(ref.id); await prisma.projectReference.create({ data: { projectId: p.id, referenceId: ref.id, sourceProvider: "SYSTEM" } });
    }
    await fixtureSourceAssessments(user.id, p.id, refs, refs[2]);
    for (const n of [0,1,2,3,2,0,3]) {
      await updateSelectedProjectReferences(user.id, p.id, refs.slice(0,n));
      await updateSelectedProjectReferences(user.id, p.id, refs.slice(0,n));
      const status = await sourceSufficiencyStatus(user.id, p.id);
      assert.equal(status.selected, n); assert.equal(status.selectedUsable, n);
      assert.equal(status.readiness, n < 3 ? "BLOCKED" : "READY_WITH_LIMITATIONS");
    }
    await assert.rejects(updateSelectedProjectReferences(other.id, p.id, refs), /no encontrado/);
    assert.equal(await prisma.projectKnowledgeField.count({ where: { projectId: p.id, isPrimary: true } }), 1);
    console.log("PASS DB: FORD 50/6 hierarchy, accents, 3 idea options ownership/provenance/global confirmation, selection 0–3 idempotent, 2 CORE + EXPLORATORY limits; provider calls=0");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.reference.deleteMany({ where: { id: { in: refs } } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Test failed"); process.exitCode = 1; });
