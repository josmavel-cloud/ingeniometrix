import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { globalConfirmationPreview, definitionReadiness } from "@/lib/conversational-intake";
import { createConversationalProject, confirmDefinition, readConfirmedSearchIntent, readDefinition } from "@/server/projects/conversational-definition-service";
import { submitIntakeTurn } from "@/server/projects/intake-conversation-service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test DB only");
  global.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
  const user = await prisma.user.create({ data: { email: `intake-automation-${randomUUID()}@example.test` } });
  try {
    const project = await createConversationalProject(user.id, { intakeMode: "conversation", idea: "Educación", degreeLevel: "MAESTRIA", requestId: randomUUID() });
    const initial = await readDefinition(user.id, project.id);
    assert.ok(initial);
    assert.equal(initial.definition.fields.topic.knowledge, "UNKNOWN", "broad area is not a confirmed topic");
    const requestId = randomUUID();
    const fields = [
      ["topic", "Aprendizaje en actividades digitales"], ["problem", "Dificultades de aprendizaje en actividades digitales"],
      ["purpose", "Evaluar estrategias de apoyo al aprendizaje"], ["object", "Actividades digitales de aprendizaje"],
      ["concepts", "Aprendizaje; actividades digitales"], ["context", "Entornos educativos"],
    ] as const;
    const response = await submitIntakeTurn(user.id, project.id,
      { requestId, baseRevision: initial.revision, etag: initial.etag, message: "Educación", initial: true },
      async () => ({ schemaVersion: "intake-turn.v1", baseRevision: initial.revision,
        assistantText: "Te propongo una dirección inicial que puedes ajustar.",
        starterIdea: { schemaVersion: "starter-research-idea.v1", workingTitle: "Aprendizaje en actividades digitales",
          researchProblem: "Dificultades de aprendizaje", purpose: "Evaluar estrategias", objectOrPopulation: "Actividades digitales",
          context: "Entornos educativos", coreConcepts: ["Aprendizaje", "Actividades digitales"],
          possibleResearchAction: "Evaluar", possibleOutput: "Propuesta de apoyo", assumptions: [], uncertainties: [], provenance: "AI_PROPOSED" },
        proposedChanges: fields.map(([field, value]) => ({ field, value, origin: "AI_PROPOSED", knowledge: "KNOWN",
          sourceMessageIds: [requestId], interpretationConfidence: "MEDIUM" })), ambiguities: [], nextQuestion: null }));
    assert.equal(response.status, "COMPLETE");
    const proposed = await readDefinition(user.id, project.id);
    assert.ok(proposed);
    assert.equal(proposed.definition.fields.object.knowledge, "UNKNOWN", "AI proposal remains provisional");
    assert.equal(definitionReadiness(globalConfirmationPreview(proposed.definition)).evidenceSearch.status, "READY");
    await confirmDefinition(user.id, project.id, proposed.revision, proposed.definitionHash);
    const confirmed = await readConfirmedSearchIntent(user.id, project.id);
    assert.equal(confirmed.readiness, "READY");
    assert.equal(confirmed.fieldProvenance.object?.origin, "AI_PROPOSED");
    assert.equal(confirmed.fieldProvenance.object?.acceptance, "ACCEPTED");
    const saved = await readDefinition(user.id, project.id);
    assert.ok(saved);
    assert.equal(saved.definition.fields.object.value, "Actividades digitales de aprendizaje");
    const notesRequest = randomUUID();
    await submitIntakeTurn(user.id, project.id, { requestId: notesRequest, baseRevision: saved.revision, etag: saved.etag,
      message: "Prefiero una explicación breve" }, async () => ({ schemaVersion: "intake-turn.v1", baseRevision: saved.revision,
      assistantText: "Puedo mantener la explicación breve.", proposedChanges: [{ field: "advisorNotes", value: "Explicación breve",
        origin: "AI_INFERRED", knowledge: "KNOWN", sourceMessageIds: [notesRequest], interpretationConfidence: "HIGH" }],
      ambiguities: [], nextQuestion: null, starterIdea: null }));
    const notes = await readDefinition(user.id, project.id);
    assert.ok(notes);
    assert.equal((await readConfirmedSearchIntent(user.id, project.id)).definitionHash, confirmed.definitionHash,
      "a pending proposal does not stale the confirmed search");
    await confirmDefinition(user.id, project.id, notes.revision, notes.definitionHash);
    const afterNotes = await readConfirmedSearchIntent(user.id, project.id);
    assert.notEqual(afterNotes.definitionHash, confirmed.definitionHash,
      "an accepted adviser note changes the design input and requires new confirmation");
    const beforeScope = await readDefinition(user.id, project.id);
    assert.ok(beforeScope);
    const scopeRequest = randomUUID();
    await submitIntakeTurn(user.id, project.id, { requestId: scopeRequest, baseRevision: beforeScope.revision, etag: beforeScope.etag,
      message: "Cambia el objeto de investigación" }, async () => ({ schemaVersion: "intake-turn.v1", baseRevision: beforeScope.revision,
      assistantText: "Propongo revisar el objeto de estudio.", proposedChanges: [{ field: "object", value: "Prácticas de docentes en entornos educativos",
        origin: "AI_PROPOSED", knowledge: "KNOWN", sourceMessageIds: [scopeRequest], interpretationConfidence: "MEDIUM" }],
      ambiguities: [], nextQuestion: null, starterIdea: null }));
    const scope = await readDefinition(user.id, project.id);
    assert.ok(scope);
    assert.equal((await readConfirmedSearchIntent(user.id, project.id)).definitionHash, afterNotes.definitionHash,
      "an unconfirmed material alternative does not change the user's frozen intent");
    await confirmDefinition(user.id, project.id, scope.revision, scope.definitionHash);
    assert.notEqual((await readConfirmedSearchIntent(user.id, project.id)).definitionHash, afterNotes.definitionHash,
      "a globally confirmed scope change creates a new scientific authority");
    console.log("PASS isolated DB: broad area -> one starter call -> six proposals -> one global confirmation -> searchable intent; network=0");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
