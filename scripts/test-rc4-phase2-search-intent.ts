import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { emptyDefinition, searchIntent, userValue, type ConversationalView } from "@/lib/conversational-intake";
import { legacySearchIntent, plannerIntake } from "@/lib/retrieval-search-input";
import { changeDefinition, confirmDefinition, createConversationalProject, readDefinition } from "@/server/projects/conversational-definition-service";
import { freezeSearchInput, loadSearchInput, searchInputIsStale } from "@/server/retrieval/search-intent-service";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test database required");
  global.fetch = async () => { throw new Error("NO_PROVIDER_CALLS"); };
  const user = await prisma.user.create({ data: { email: `phase2-contract-${randomUUID()}@example.test` } });
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Estudiar retroalimentación en matemáticas digitales de secundaria", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let view: ConversationalView = (await readDefinition(user.id, project.id))!;
    for (const [field, value] of [["object", "Actividades digitales de matemáticas"], ["context", "Estudiantes de secundaria en Lima"], ["methodPreference", "Cualitativa"]] as const) {
      view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag, action: { kind: "EDIT", field, value, knowledge: "KNOWN" } });
    }
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    const first = await loadSearchInput(user.id, project.id);
    assert.equal(first.intent.sourceKind, "CONFIRMED_DEFINITION");
    assert.equal(first.intent.context, "Estudiantes de secundaria en Lima");
    assert.match(first.plannerInput.problemContext ?? "", /Lima/);
    assert.equal(first.intent.methodologicalSignals[0]?.kind, "USER_PREFERENCE");
    assert.equal(first.intent.coreProblem, null);
    assert.deepEqual(first.intent.coreConcepts, []);
    assert.equal(first.intent.intendedOutput, null);
    assert.equal(first.intent.taxonomy, null);
    assert.equal(first.intent.academicLevel, "MAESTRIA");
    assert.equal(first.intent.userOriginalIdea, project.topicSeedText);
    assert.equal(first.intent.unresolvedFields.find(f => f.field === "dataAccess")?.knowledge, "UNKNOWN");
    assert.equal(first.plannerInput.availableData, undefined);
    const firstTrace = await freezeSearchInput(user.id, first);
    const frozen = await prisma.auditLog.findFirstOrThrow({ where: { projectId: project.id, eventType: "SEARCH_INPUT_FROZEN" } });
    assert.equal((frozen.payloadJson as { searchIntentHash: string }).searchIntentHash, firstTrace.searchIntentHash);
    assert.equal((frozen.payloadJson as { plannerInput: { problemContext: string } }).plannerInput.problemContext, first.plannerInput.problemContext);
    assert.equal(firstTrace.intakeId, first.intakeId);
    assert.equal(firstTrace.confirmedDraftRevision, view.revision);
    assert.equal(firstTrace.definitionHash, view.definitionHash);
    assert.equal(firstTrace.researchSearchIntentSchemaVersion, "research-search-intent.v2");
    await prisma.auditLog.create({ data: { projectId: project.id, userId: user.id, eventType: "SEARCH_COMPLETED", actorType: "SYSTEM", payloadJson: { referenceSearchVersion: "v2", searchSnapshot: { inputTrace: firstTrace } } } });
    assert.equal((await getLatestProjectReferenceSearchSnapshot(project.id))?.stale, false);
    view = (await readDefinition(user.id, project.id))!;
    view = await changeDefinition(user.id, project.id, { requestId: randomUUID(), baseRevision: view.revision, etag: view.etag, action: { kind: "EDIT", field: "context", value: "Estudiantes de secundaria en Arequipa", knowledge: "KNOWN" } });
    await assert.rejects(() => loadSearchInput(user.id, project.id), /DEFINITION_CONFIRMATION_REQUIRED/);
    await assert.rejects(() => freezeSearchInput(user.id, first), /SEARCH_INPUT_STALE/);
    assert.equal(searchInputIsStale(firstTrace, { revision: view.revision, definitionHash: view.definitionHash }), true);
    assert.equal((await getLatestProjectReferenceSearchSnapshot(project.id))?.stale, true);
    await confirmDefinition(user.id, project.id, view.revision, view.definitionHash);
    const second = await loadSearchInput(user.id, project.id);
    const secondTrace = await freezeSearchInput(user.id, second);
    assert.notEqual(secondTrace.definitionHash, firstTrace.definitionHash);
    assert.equal(second.intent.context, "Estudiantes de secundaria en Arequipa");
    const historical = await prisma.auditLog.findUniqueOrThrow({ where: { id: frozen.id } });
    assert.equal((historical.payloadJson as { definitionHash: string }).definitionHash, firstTrace.definitionHash);
    const legacy = await prisma.project.create({ data: { userId: user.id, title: "Legacy", degreeLevel: "MAESTRIA", intake: { create: { topic: "Lectura en escuelas", targetPopulation: "Estudiantes", preferredMethodology: "Entrevistas" } } } });
    const legacyInput = await loadSearchInput(user.id, legacy.id);
    assert.equal(legacyInput.intent.sourceKind, "LEGACY_COMPATIBILITY");
    assert.equal(legacyInput.intent.context, null);
    assert.equal(legacyInput.intent.userOriginalIdea, null);
    assert.equal(legacyInput.intent.methodologicalSignals[0]?.kind, "LEGACY_UNVERIFIED_PREFERENCE");
    assert.equal(legacyInput.plannerInput.topic, "Lectura en escuelas");
    assert.equal(legacyInput.plannerInput.preferredMethodology, "Entrevistas");
    const legacyTrace = await freezeSearchInput(user.id, legacyInput);
    assert.equal(legacyTrace.confirmedDraftRevision, null);
    assert.equal(legacyTrace.definitionHash, null);
    const d = emptyDefinition();
    d.fields.topic = userValue("Tema explícito", 1, "m1");
    d.fields.object = userValue("Objeto explícito", 1, "m1");
    d.proposals.push({ id: "reject-me", field: "concepts", baseRevision: 1, status: "REJECTED", proposed: { ...userValue("Concepto inventado", 1, "m1"), origin: "AI_PROPOSED", acceptance: "UNREVIEWED" } });
    d.ambiguities.push({ id: "a1", field: "concepts", question: "¿Qué tipo de evidencia importa?", blocksSearch: false, resolved: false });
    const pure = searchIntent(project.id, 1, "hash", d);
    assert.deepEqual(pure.coreConcepts, []);
    assert.equal(pure.fieldProvenance.concepts, undefined);
    assert.equal(pure.unresolvedAmbiguities[0].blocksSearch, false);
    assert.ok(!JSON.stringify(plannerIntake(pure)).includes("Concepto inventado"));
    assert.ok(!JSON.stringify(plannerIntake(pure)).includes("evidencia importa"));
    assert.equal(legacySearchIntent(project.id, { topic: "Tema", problemContext: null, targetPopulation: null, researchScope: null, constructs: null, preferredMethodology: null, academicConstraints: null, researchLine: null, availableData: null, advisorNotes: null, pendingDecisions: null }, "MAESTRIA", null).context, null);
    console.log("PASS Phase2.1: confirmed context, unknown/rejected/default exclusion, method signal, legacy mapping, pre-provider audit, new confirmation and immutable history; provider calls=0");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
