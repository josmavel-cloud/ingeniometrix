import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyDefinitionAction, definitionReadiness, emptyDefinition, searchIntent, userValue, type ConversationalView } from "@/lib/conversational-intake";
import { prisma } from "@/lib/prisma";
import { changeDefinition, confirmDefinition, createConversationalProject, readConfirmedSearchIntent, readDefinition } from "@/server/projects/conversational-definition-service";
import { submitIntakeTurn } from "@/server/projects/intake-conversation-service";
import { listProjectsForUser } from "@/server/projects/project-service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test DB only");
  let network = 0;
  global.fetch = async () => { network++; throw new Error("NETWORK_FORBIDDEN"); };
  // Real user's failure shape: sufficient accepted topic/object, an old context
  // question, then an answer proposed by a later turn. No staging fixture writes.
  const d = emptyDefinition();
  d.fields.topic = userValue("Diseñar y evaluar un protocolo de retroalimentación automática para actividades digitales de matemáticas en secundaria", 4, "idea");
  d.fields.object = userValue("Protocolo de retroalimentación automática", 5, "idea");
  d.ambiguities.push({ id: "question:a0", field: "context", question: "¿IA general o aplicada directamente en las actividades?", blocksSearch: true, resolved: false });
  d.proposals.push({ id: "question:0", field: "context", baseRevision: 6, status: "STALE", proposed: { ...userValue("Uso de IA", 6, "question"), origin: "AI_INFERRED", acceptance: "UNREVIEWED" } },
    { id: "answer:0", field: "context", baseRevision: 7, status: "PENDING", proposed: { ...userValue("IA aplicada directamente en las actividades", 7, "answer"), origin: "AI_INFERRED", acceptance: "UNREVIEWED" } });
  assert.equal(definitionReadiness(d).evidenceSearch.status, "NEEDS_CLARIFICATION");
  const accepted = applyDefinitionAction(d, { kind: "ACCEPT", proposalId: "answer:0" }, 10, "accept");
  assert.equal(definitionReadiness(accepted).evidenceSearch.status, "READY");
  assert.equal(accepted.fields.context.origin, "AI_INFERRED");
  assert.equal(d.ambiguities[0].resolved, false, "No historical mutation");
  const beforeQuestion = structuredClone(d);
  beforeQuestion.proposals[1].baseRevision = 6;
  assert.equal(definitionReadiness(applyDefinitionAction(beforeQuestion, { kind: "ACCEPT", proposalId: "answer:0" }, 10, "accept")).evidenceSearch.status, "NEEDS_CLARIFICATION");
  const deferred = applyDefinitionAction(d, { kind: "DEFER", ambiguityId: "question:a0" }, 10, "defer");
  assert.equal(definitionReadiness(deferred).evidenceSearch.status, "READY");
  assert.equal(deferred.fields.context.knowledge, "UNKNOWN");
  assert.deepEqual(searchIntent("p", 10, "h", deferred).unresolvedAmbiguities.map(a => a.blocksSearch), [false]);
  const rejected = applyDefinitionAction(deferred, { kind: "REJECT", proposalId: "answer:0" }, 11, "reject");
  assert.equal(definitionReadiness(rejected).evidenceSearch.status, "READY");
  assert.equal(searchIntent("p", 11, "h", rejected).context, null);
  for (const field of ["methodPreference", "dataAccess", "taxonomy", "academicLevel", "advisorNotes"] as const) {
    const optional = structuredClone(accepted);
    optional.ambiguities.push({ id: field, field, question: "Pendiente", blocksSearch: true, resolved: false });
    assert.equal(definitionReadiness(optional).evidenceSearch.status, "READY", `${field} is not a retrieval prerequisite`);
  }
  const vague = emptyDefinition(); vague.fields.topic = userValue("Tecnología y educación", 1, "idea");
  assert.equal(definitionReadiness(vague).evidenceSearch.status, "NEEDS_CLARIFICATION");
  vague.ambiguities.push({ id: "core", field: "object", question: "¿Qué estudiarás?", blocksSearch: true, resolved: false, createdRevision: 2 });
  await assert.rejects(async () => applyDefinitionAction(vague, { kind: "DEFER", ambiguityId: "core" }, 3, "defer"));
  assert.equal(definitionReadiness(applyDefinitionAction(vague, { kind: "EDIT", field: "object", value: "Experiencias de aprendizaje en actividades digitales", knowledge: "KNOWN" }, 3, "edit")).evidenceSearch.status, "READY");

  const user = await prisma.user.create({ data: { email: `handoff-${randomUUID()}@example.test` } });
  try {
    const p = await createConversationalProject(user.id, { intakeMode: "conversation", idea: d.fields.topic.value, degreeLevel: "MAESTRIA", requestId: randomUUID() });
    let v: ConversationalView = (await readDefinition(user.id, p.id))!;
    const input = { requestId: randomUUID(), baseRevision: v.revision, etag: v.etag, message: "Aclaración" };
    const failure = await submitIntakeTurn(user.id, p.id, input, async () => { throw new Error("Simulated timeout/unavailable"); });
    assert.equal(failure.status, "FAILED");
    v = await changeDefinition(user.id, p.id, { requestId: randomUUID(), baseRevision: v.revision, etag: v.etag, action: { kind: "EDIT", field: "object", value: d.fields.object.value, knowledge: "KNOWN" } });
    const reviewed = v;
    v = await changeDefinition(user.id, p.id, { requestId: randomUUID(), baseRevision: v.revision, etag: v.etag, action: { kind: "EDIT", field: "context", value: "Lima", knowledge: "KNOWN" } });
    await assert.rejects(() => confirmDefinition(user.id, p.id, reviewed.revision, reviewed.definitionHash), /borrador cambió/);
    assert.equal(await prisma.intake.count({ where: { projectId: p.id } }), 0);
    const lateInput = { requestId: randomUUID(), baseRevision: v.revision, etag: v.etag, message: "Una respuesta tardía" };
    const late = await submitIntakeTurn(user.id, p.id, lateInput, async () => {
      // Model response outlives its HTTP client. Manual confirmation remains
      // possible, but its revision must not be invalidated by the late result.
      await confirmDefinition(user.id, p.id, v.revision, v.definitionHash);
      return { schemaVersion: "intake-turn.v1", baseRevision: v.revision, assistantText: "Propuesta tardía", proposedChanges: [], ambiguities: [], nextQuestion: null };
    });
    assert.equal(late.status, "STALE");
    assert.equal((await readDefinition(user.id, p.id))!.revision, v.revision);
    const snapshot = (await prisma.intake.findUniqueOrThrow({ where: { projectId: p.id } })).confirmedDefinitionJson as any;
    assert.equal(snapshot.revision, v.revision); assert.equal(snapshot.definitionHash, v.definitionHash);
    const intent = await readConfirmedSearchIntent(user.id, p.id);
    assert.equal(intent.context, "Lima"); assert.equal(intent.readiness, "READY");
    assert.equal(intent.methodologicalSignals.length, 0); assert.equal(intent.taxonomy, null);
    assert.equal((await readDefinition(user.id, p.id))!.confirmedRevision, v.revision);
    assert.equal(await prisma.auditLog.count({ where: { projectId: p.id, eventType: "RESEARCH_DEFINITION_CONFIRMED" } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { projectId: p.id, eventType: { in: ["SEARCH_INPUT_FROZEN", "SEARCH_COMPLETED"] } } }), 0);
    assert.ok((await listProjectsForUser(user.id)).some(x => x.id === p.id));
    assert.equal((await listProjectsForUser("other-user")).some(x => x.id === p.id), false);
    await assert.rejects(() => readConfirmedSearchIntent("other-user", p.id), /NOT_FOUND/);
    assert.equal(network, 0);
    console.log("PASS handoff: real regression shape, dated ambiguity resolution, explicit deferral, optional UNKNOWN/rejected/taxonomy, core blockers, failed-turn manual recovery, exact atomic confirmation, stale rejection, immutable historical state, owner listing/isolation, SearchIntent v2; network calls=0");
  } finally {
    await prisma.paidOperation.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
