import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { changeDefinition, createConversationalProject, readDefinition } from "@/server/projects/conversational-definition-service";
import { submitIntakeTurn } from "@/server/projects/intake-conversation-service";
import { intakeModelPolicy } from "@/server/projects/intake-model-policy";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test DB required");
  global.fetch = async () => { throw new Error("NO_NETWORK"); };
  assert.ok(responseCostBound({ model: intakeModelPolicy().model, max_output_tokens: intakeModelPolicy().maxOutputTokens })!.maximumUsd > 0);
  const user = await prisma.user.create({ data: { email: `phase1-turn-${randomUUID()}@example.test` } });
  let calls = 0;
  try {
    for (const [index, idea] of ["Diseño de un sistema de visualización geoespacial", "Quiero mejorar la educación", "Comprender experiencias de pertenencia mediante relatos", "Me interesa la memoria cultural"].entries()) {
      const p = await createConversationalProject(user.id, { intakeMode: "conversation", idea, degreeLevel: "MAESTRIA", requestId: randomUUID() });
      const state = (await readDefinition(user.id, p.id))!;
      const input = { message: index === 0 ? idea : "Me interesa comprender el fenómeno, aún no conozco el método", requestId: randomUUID(), baseRevision: state.revision, etag: state.etag, ...(index === 0 ? { initial: true as const } : {}) };
      const mock = async () => { calls++; return { schemaVersion: "intake-turn.v1", baseRevision: input.baseRevision, assistantText: "Podemos precisar el objeto sin elegir aún un método.",
        proposedChanges: [{ field: "purpose", value: "Comprender el fenómeno", origin: "AI_INFERRED", knowledge: "KNOWN", sourceMessageIds: [input.requestId], interpretationConfidence: "MEDIUM" }, ...(index === 0 ? [{ field: "object", value: "Sistema de visualización geoespacial", origin: "AI_INFERRED" as const, knowledge: "KNOWN" as const, sourceMessageIds: [input.requestId], interpretationConfidence: "MEDIUM" as const }] : [])],
        ambiguities: [], nextQuestion: { field: "object", question: "¿Qué objeto o corpus te interesa?", options: [] } }; };
      const result = await submitIntakeTurn(user.id, p.id, input, mock);
      assert.equal(result.status, "COMPLETE");
      if (index === 0) {
        const firstTurn = await prisma.intakeTurn.findUniqueOrThrow({ where: { projectId_requestId: { projectId: p.id, requestId: input.requestId } } });
        assert.equal((firstTurn.inputJson as { initial?: boolean }).initial, true);
        assert.equal((firstTurn.resultJson as { nextQuestion?: unknown }).nextQuestion, null, "A faithful proposal removes a redundant question");
        assert.equal(result.state!.definition.fields.object.value, "", "Proposal did not become scientific fact");
      }
      assert.equal(result.state!.definition.fields.purpose.value, "");
      assert.equal(result.state!.definition.proposals[0].proposed.acceptance, "UNREVIEWED");
      const before = calls;
      await submitIntakeTurn(user.id, p.id, input, mock); assert.equal(calls, before);
      if (index === 0) {
        const current = (await readDefinition(user.id, p.id))!;
        await assert.rejects(() => submitIntakeTurn(user.id, p.id, { ...input, requestId: randomUUID(), baseRevision: current.revision, etag: current.etag }, mock), /INITIAL_IDEA_ALREADY_REVIEWED/);
      }
      await assert.rejects(() => submitIntakeTurn("wrong-user", p.id, input, mock), /NOT_FOUND/);
      const v = (await readDefinition(user.id, p.id))!;
      const staleInput = { message: input.message, requestId: randomUUID(), baseRevision: v.revision, etag: v.etag };
      const stale = await submitIntakeTurn(user.id, p.id, staleInput, async () => {
        await changeDefinition(user.id, p.id, { requestId: randomUUID(), baseRevision: v.revision, etag: v.etag, action: { kind: "EDIT", field: "context", value: "Archivo histórico", knowledge: "KNOWN" } });
        return { ...await mock(), baseRevision: v.revision, proposedChanges: [] };
      });
      assert.equal(stale.status, "STALE");
      assert.equal(stale.state!.definition.fields.context.value, "Archivo histórico");
      const latest = (await readDefinition(user.id, p.id))!;
      const failure = await submitIntakeTurn(user.id, p.id, { ...staleInput, requestId: randomUUID(), baseRevision: latest.revision, etag: latest.etag }, async () => { throw new Error("Provider unavailable"); });
      assert.equal(failure.status, "FAILED");
      assert.equal(failure.state!.revision, latest.revision);
      assert.equal(await prisma.intake.count({ where: { projectId: p.id } }), 0);
    }
    console.log("PASS Phase1 Gate2: four disciplines, mocked structured model, proposal-only, exact provenance, no provider, idempotent replay, delayed result stale, unavailable model preserved, persistent PaidOperation");
  } finally {
    await prisma.paidOperation.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
