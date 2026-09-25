import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { definitionSchema } from "@/lib/conversational-intake";
import { intakeTurnInputSchema, intakeTurnResultSchema } from "@/lib/intake-turn-contract";
import { materialAmbiguities, materialQuestion } from "@/lib/intake-question-policy";
import { getConfiguredLlmProvider } from "@/llm";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { checkRevision, definitionView, jsonValue, lockedDefinition, nextTurnSequence, readDefinition, writeDefinition } from "./conversational-definition-service";
import { intakeModelPolicy } from "./intake-model-policy";
import { INTAKE_PROMPT } from "./prompts/conversational-intake.v2";

// Dependency injection is available only to local tests; never from HTTP/environment.
type ModelCall = (prompt: string) => Promise<unknown>;
export async function submitIntakeTurn(userId: string, projectId: string, raw: unknown, testModel?: ModelCall) {
  const input = intakeTurnInputSchema.parse(raw);
  if (process.env.IMX_CONVERSATIONAL_INTAKE === "0") throw new Error("CONVERSATIONAL_INTAKE_DISABLED");
  const policy = intakeModelPolicy();
  const claim = await prisma.$transaction(async tx => {
    const { view } = await lockedDefinition(tx, userId, projectId);
    const old = await tx.intakeTurn.findUnique({ where: { projectId_requestId: { projectId, requestId: input.requestId } } });
    if (old) {
      if (old.inputHash !== fingerprint(input)) throw new Error("IDEMPOTENCY_INPUT_CONFLICT");
      return { turn: old, claimed: false, view };
    }
    checkRevision(view, input.baseRevision, input.etag);
    if (input.initial && (view.definition.fields.originalIdea.value !== input.message || await tx.intakeTurn.count({ where: { projectId, kind: "MESSAGE" } }) !== 0)) throw new Error("INITIAL_IDEA_ALREADY_REVIEWED");
    if (await tx.intakeTurn.count({ where: { projectId, kind: "MESSAGE" } }) >= policy.maxModelTurns) throw new Error("INTAKE_MODEL_TURN_LIMIT");
    if (await tx.intakeTurn.count({ where: { projectId, status: "RUNNING" } })) throw new Error("INTAKE_TURN_IN_PROGRESS");
    const turn = await tx.intakeTurn.create({ data: { userId, projectId, sequence: await nextTurnSequence(tx, projectId), requestId: input.requestId, inputHash: fingerprint(input),
      baseRevision: input.baseRevision, kind: "MESSAGE", inputJson: { message: input.message, ...(input.initial ? { initial: true } : {}) }, status: "RUNNING" } });
    return { turn, claimed: true, view };
  });
  if (!claim.claimed) return { status: claim.turn.status, state: await readDefinition(userId, projectId) };
  try {
    const history = await prisma.intakeTurn.findMany({ where: { projectId, userId, kind: { in: ["INITIAL_IDEA", "MESSAGE", "ACTION"] } }, orderBy: { sequence: "desc" }, take: 12,
      select: { requestId: true, inputJson: true, kind: true } });
    const previousQuestions = (await prisma.intakeTurn.findMany({ where: { projectId, userId, kind: "MESSAGE", status: "COMPLETE" }, select: { resultJson: true } }))
      .filter(t => Boolean((t.resultJson as { nextQuestion?: unknown } | null)?.nextQuestion)).length;
    const knownIds = new Set(history.map(t => t.requestId));
    // Do not ship a growing transcript: current authority plus bounded recent inputs.
    const prompt = `${INTAKE_PROMPT.instructions}\nINPUT_JSON\n${JSON.stringify({ baseRevision: input.baseRevision, definition: claim.view.definition, messages: history.reverse() })}`;
    if (Buffer.byteLength(prompt) > 100000) throw new Error("INTAKE_CONTEXT_LIMIT");
    const result = await withPaidOperation({ userId, projectId, draftId: claim.view.id, requestId: `intake:${input.requestId}`, purpose: INTAKE_PROMPT.id,
      revision: String(input.baseRevision), inputs: { input, promptVersion: INTAKE_PROMPT.version, policy } }, async () => {
      const rawResult = testModel ? await testModel(prompt) : await getConfiguredLlmProvider().generateStructuredObject({ ...policy,
        prompt, schemaName: "intake_turn_v1", schema: z.toJSONSchema(intakeTurnResultSchema), trackingLabel: "conversational-intake.v2",
        trackingAttribution: { stage: "intake", source: INTAKE_PROMPT.id, promptVersion: INTAKE_PROMPT.version, promptHash: fingerprint(INTAKE_PROMPT.instructions) } });
      const parsed = intakeTurnResultSchema.parse(rawResult);
      if (parsed.baseRevision !== input.baseRevision) throw new Error("MODEL_REVISION_MISMATCH");
      if ([...parsed.ambiguities, ...(parsed.nextQuestion ? [parsed.nextQuestion] : [])].some(a => ["originalIdea", "academicLevel"].includes(a.field))) throw new Error("USE_EXPLICIT_FIELD_CONTROL");
      if (new Set(parsed.proposedChanges.map(p => p.field)).size !== parsed.proposedChanges.length) throw new Error("DUPLICATE_PROPOSED_FIELD");
      for (const p of parsed.proposedChanges) {
        if (["originalIdea", "academicLevel"].includes(p.field) || p.sourceMessageIds.some(id => !knownIds.has(id))) throw new Error("INVALID_PROPOSAL_PROVENANCE");
        if (p.knowledge !== "KNOWN" && p.value.trim()) throw new Error("UNKNOWN_MUST_BE_EMPTY");
        if (claim.view.definition.proposals.some(old => old.status === "REJECTED" && old.field === p.field && old.proposed.value === p.value)) throw new Error("REJECTED_PROPOSAL_REPEATED");
      }
      return { ...parsed, ambiguities: materialAmbiguities(parsed), nextQuestion: materialQuestion(parsed, claim.view.definition, previousQuestions) };
    });
    return await prisma.$transaction(async tx => {
      const { draft, view } = await lockedDefinition(tx, userId, projectId);
      if (view.revision !== input.baseRevision) {
        await tx.intakeTurn.update({ where: { id: claim.turn.id }, data: { status: "STALE", resultJson: jsonValue(result) } });
        return { status: "STALE", state: view };
      }
      const d = structuredClone(view.definition);
      for (const [i, p] of result.proposedChanges.entries()) {
        for (const old of d.proposals) if (old.field === p.field && old.status === "PENDING") old.status = "STALE";
        d.proposals.push({ id: `${input.requestId}:${i}`, field: p.field, baseRevision: view.revision, status: "PENDING",
          proposed: { value: p.value, origin: p.origin, acceptance: "UNREVIEWED", knowledge: p.knowledge, sourceMessageIds: p.sourceMessageIds,
            interpretationConfidence: p.interpretationConfidence, lastChangedRevision: view.revision } });
      }
      for (const [i, a] of result.ambiguities.entries()) d.ambiguities.push({ ...a, id: `${input.requestId}:a${i}`, resolved: false });
      const row = await writeDefinition(tx, draft, definitionSchema.parse(d));
      await tx.intakeTurn.update({ where: { id: claim.turn.id }, data: { status: "COMPLETE", resultJson: jsonValue(result), resultingRevision: row.revision } });
      return { status: "COMPLETE", state: definitionView(row) };
    });
  } catch {
    await prisma.intakeTurn.updateMany({ where: { id: claim.turn.id, status: "RUNNING" }, data: { status: "FAILED", resultJson: { safeError: "INTAKE_ASSISTANCE_UNAVAILABLE" } } });
    return { status: "FAILED", state: await readDefinition(userId, projectId) };
  }
}
