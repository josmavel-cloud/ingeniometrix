import type { DraftIntake, DraftView } from "./project-draft-contract";

// Serialize saves from one tab; the server revision arbitrates different tabs.
export class DraftSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private error: Error | null = null;
  constructor(private current: DraftView, private send: (revision: number, intake: DraftIntake, etag: string) => Promise<DraftView>) {}
  matches(intake: DraftIntake) { return JSON.stringify(this.current.intake) === JSON.stringify(intake); }
  retry() { this.error = null; } // Explicit retry only; revision is never advanced speculatively.
  save(intake: DraftIntake): Promise<DraftView> {
    const frozen = structuredClone(intake);
    const next = this.tail.then(async () => {
      if (this.error) throw this.error;
      if (this.matches(frozen)) return this.current;
      try { this.current = await this.send(this.current.revision, frozen, this.current.etag); return this.current; }
      catch (error) { this.error = error instanceof Error ? error : new Error("No se pudo guardar."); throw this.error; }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const flushers = new Map<string, () => Promise<number>>();
export function registerDraftFlush(projectId: string, flush: () => Promise<number>) {
  flushers.set(projectId, flush);
  return () => { if (flushers.get(projectId) === flush) flushers.delete(projectId); };
}
export async function flushProjectDraft(projectId: string) { return await flushers.get(projectId)?.(); }
