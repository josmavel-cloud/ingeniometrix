import { AsyncLocalStorage } from "node:async_hooks";

export type BudgetEntry = { purpose: string; model: string; reserved_usd: number; estimated_usd: number | null; provider_usage: unknown; status: "reserved" | "completed" | "failed_unknown_usage" };
export class ApplicationBudget {
  readonly entries: BudgetEntry[] = [];
  private boundViolated = false;
  constructor(readonly hardCapUsd = 5, readonly targetUsd = 2) {
    if (!(hardCapUsd > 0 && hardCapUsd <= 5)) throw new Error("Invalid application hard cap");
  }
  get committedUsd() { return this.entries.reduce((sum, e) => sum + (e.estimated_usd ?? e.reserved_usd), 0); }
  reserve(purpose: string, model: string, maximumUsd: number) {
    if (this.boundViolated || !Number.isFinite(maximumUsd) || maximumUsd <= 0 || this.committedUsd + maximumUsd > this.hardCapUsd) throw new Error("LLM_BUDGET_BLOCKED: presupuesto preventivo excedido.");
    const entry: BudgetEntry = { purpose, model, reserved_usd: maximumUsd, estimated_usd: null, provider_usage: null, status: "reserved" };
    this.entries.push(entry);
    return { complete: (estimatedUsd: number, usage: unknown) => {
      if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) throw new Error("Invalid provider usage cost");
      entry.estimated_usd = estimatedUsd; entry.provider_usage = usage; entry.status = "completed";
      if (estimatedUsd > maximumUsd) { this.boundViolated = true; throw new Error("BUDGET_BOUND_VIOLATED: stop subsequent calls and review pricing."); }
    }, fail: () => { if (entry.status !== "completed") entry.status = "failed_unknown_usage"; } };
  }
}
const context = new AsyncLocalStorage<ApplicationBudget>();
export const currentApplicationBudget = () => context.getStore();
export function withApplicationBudget<T>(budget: ApplicationBudget, work: () => Promise<T>) { return context.run(budget, work); }
