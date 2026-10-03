/** Derived checkpoint/display currency comes from the settled integer ledger.
 * It is not a replacement invoice and never rewrites provider usage/history. */
export function checkpointSettledCost(estimatedCostMicros: number | null) {
  if (estimatedCostMicros !== null && (!Number.isSafeInteger(estimatedCostMicros) || estimatedCostMicros < 0))
    throw new Error("CHECKPOINT_SETTLED_COST_INVALID");
  return { estimatedCostMicros, estimatedCostUsd: estimatedCostMicros === null ? null : estimatedCostMicros / 1_000_000 };
}
