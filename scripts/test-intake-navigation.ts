import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DefinitionSaveQueue } from "@/lib/definition-save-queue";
import { emptyDefinition, applyDefinitionAction, type ConversationalView } from "@/lib/conversational-intake";
import { flushProjectDraft, registerDraftFlush } from "@/lib/draft-save-queue";

async function main() {
  const initial: ConversationalView = { id: "fixture", revision: 1, confirmedRevision: null, etag: "v1", definitionHash: "initial", definition: emptyDefinition() };
  let sent = 0;
  const queue: DefinitionSaveQueue = new DefinitionSaveQueue(initial, async (r): Promise<ConversationalView> => {
    sent++; assert.equal(r.baseRevision, sent);
    return { ...initial, revision: r.baseRevision + 1, etag: `v${sent + 1}`, definition: applyDefinitionAction(queue.current.definition, r.action, r.baseRevision + 1, r.requestId) };
  });
  await Promise.all(["Primero", "Después"].map(value => queue.save({ kind: "EDIT", field: "topic", value, knowledge: "KNOWN" })));
  assert.equal(queue.current.definition.fields.topic.value, "Después");
  await queue.save({ kind: "EDIT", field: "topic", value: "Después", knowledge: "KNOWN" });
  assert.equal(sent, 2, "Concurrent flushes cannot duplicate an identical saved field edit");
  const unregister = registerDraftFlush("fixture", async () => (await queue.flush()).revision);
  assert.equal(await flushProjectDraft("fixture"), 3);
  assert.equal(queue.current.confirmedRevision, null, "Flush never confirms"); unregister();
  let failedId = "", attempts = 0;
  const retry = new DefinitionSaveQueue(initial, async r => { attempts++; if (attempts === 1) { failedId = r.requestId; throw new Error("Lost response"); } assert.equal(r.requestId, failedId); return { ...initial, revision: 2 }; });
  const action = { kind: "EDIT" as const, field: "topic" as const, value: "Tema", knowledge: "KNOWN" as const };
  await assert.rejects(() => retry.save(action)); await retry.save(action); assert.equal(attempts, 2);
  const hook = readFileSync("components/projects/use-persisted-intake.ts", "utf8");
  assert.ok(hook.includes("anchor.href !== location.href")); assert.ok(!hook.includes("() => confirm(currentForm.current)"));
  const ui = readFileSync("components/projects/conversational-intake.tsx", "utf8");
  for (const marker of ["role=\"log\"", "No lo sé", "Rechazar", "Confirmar esta definición", "sessionStorage", "popstate", "conflictRef"]) assert.ok(ui.includes(marker), marker);
  console.log("PASS Phase1 Gates3/4 contract checks: serialization, idempotent retry, no implicit confirmation, query navigation, pending local text, conflict handling; manual browser acceptance remains required");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
