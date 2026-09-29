import type { ConversationalView, DefinitionAction } from "./conversational-intake";
// Same serialization discipline as DraftSaveQueue, operating on small field actions.
export class DefinitionSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private failed: { requestId: string; baseRevision: number; etag: string; action: DefinitionAction } | null = null;
  constructor(public current: ConversationalView, private send: (input: { requestId: string; baseRevision: number; etag: string; action: DefinitionAction }) => Promise<ConversationalView>) {}
  save(action: DefinitionAction): Promise<ConversationalView> {
    const frozen = structuredClone(action);
    const operation = this.tail.then(async () => {
      if (!this.failed && frozen.kind === "EDIT") {
        const field = this.current.definition.fields[frozen.field];
        const knowledge = frozen.knowledge === "KNOWN" && !frozen.value.trim() ? "UNKNOWN" : frozen.knowledge;
        const value = knowledge === "KNOWN" ? frozen.value.trim() : "";
        if (field.value === value && field.knowledge === knowledge && field.origin === "USER_EXPLICIT") return this.current;
      }
      if (this.failed && JSON.stringify(this.failed.action) !== JSON.stringify(frozen)) throw new Error("Resuelve primero el guardado pendiente.");
      const request = this.failed ?? { requestId: crypto.randomUUID(), baseRevision: this.current.revision, etag: this.current.etag, action: frozen };
      try { const result = await this.send(request); this.current = result; this.failed = null; return result; }
      catch (e) { this.failed = request; throw e; }
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }
  async flush() { await this.tail; if (this.failed) throw new Error("Hay cambios pendientes."); return this.current; }
}
