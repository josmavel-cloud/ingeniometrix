type CostEntry = { id: string; purpose: string; stage: string; model: string; actualModel: string | null;
  estimate: number | null; maximum: number; status: string; retry: boolean;
  usage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number;
    input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } } | null };

const tokens = (usage: CostEntry["usage"]) => ({ input: usage?.inputTokens ?? usage?.input_tokens ?? 0,
  output: usage?.outputTokens ?? usage?.output_tokens ?? 0,
  reasoning: usage?.reasoningTokens ?? usage?.output_tokens_details?.reasoning_tokens ?? 0 });

export function generationCostReport(record: { entries?: CostEntry[] } | null,
  miniOperations: Array<{ operationId: string; estimatedCostUsd: number | null; reservedCostUsd: number;
    usage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number } | null }> = []) {
  const categories = ["evidence", "design", "mini_research", "composition", "visuals", "export", "other"] as const;
  type Category = typeof categories[number];
  const category = (entry: CostEntry): Category => {
    const key = `${entry.stage}:${entry.purpose}`.toLowerCase();
    if (/design_mini_research/.test(key)) return "mini_research";
    if (/evidence|extract|materializ/.test(key)) return "evidence";
    if (/design|selector|critic/.test(key)) return "design";
    if (/hero|visual|image|infograph/.test(key)) return "visuals";
    if (/export|docx|pdf|render/.test(key)) return "export";
    if (/section|plan|draft|composition|matrix|title|review/.test(key)) return "composition";
    return "other";
  };
  const byStage = Object.fromEntries(categories.map(name => [name, { calls: 0, inputTokens: 0, outputTokens: 0,
    reasoningTokens: 0, knownCostUsd: 0, unresolvedReservationUsd: 0 }]));
  for (const entry of record?.entries ?? []) {
    const aggregate = byStage[category(entry)];
    const usage = tokens(entry.usage);
    aggregate.calls++;
    aggregate.inputTokens += usage.input;
    aggregate.outputTokens += usage.output;
    aggregate.reasoningTokens += usage.reasoning;
    if (entry.estimate !== null) aggregate.knownCostUsd += entry.estimate;
    else aggregate.unresolvedReservationUsd += entry.maximum;
  }
  const jobPaidOperationIds = new Set((record?.entries ?? []).filter(entry => entry.purpose === "DESIGN_SUPPORT_MINI_RESEARCH")
    .map(entry => (entry as CostEntry & { paidOperationId?: string }).paidOperationId).filter(Boolean));
  for (const operation of miniOperations) {
    if (jobPaidOperationIds.has(operation.operationId)) continue;
    const aggregate = byStage.mini_research;
    aggregate.calls++;
    aggregate.inputTokens += operation.usage?.inputTokens ?? 0;
    aggregate.outputTokens += operation.usage?.outputTokens ?? 0;
    aggregate.reasoningTokens += operation.usage?.reasoningTokens ?? 0;
    if (operation.estimatedCostUsd !== null) aggregate.knownCostUsd += operation.estimatedCostUsd;
    else aggregate.unresolvedReservationUsd += operation.reservedCostUsd;
  }
  return { byStage, total: Object.values(byStage).reduce((sum, row) => ({ calls: sum.calls + row.calls,
    inputTokens: sum.inputTokens + row.inputTokens, outputTokens: sum.outputTokens + row.outputTokens,
    reasoningTokens: sum.reasoningTokens + row.reasoningTokens, knownCostUsd: sum.knownCostUsd + row.knownCostUsd,
    unresolvedReservationUsd: sum.unresolvedReservationUsd + row.unresolvedReservationUsd }),
    { calls: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, knownCostUsd: 0, unresolvedReservationUsd: 0 }) };
}
