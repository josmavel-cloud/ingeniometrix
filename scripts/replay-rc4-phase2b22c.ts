// Read-only replay of the persisted, sanitized 2B2.2b trace. It can establish
// tool-limit/provenance semantics, not the missing Structured Output payload.
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { extractWebObservations, validateWebToolLimit } from "@/server/retrieval/web-discovery-validation";

async function main() {
  const operationId = process.env.IMX_WEB_TRACE_OPERATION_ID;
  if (!operationId || !/^[0-9a-f-]{36}$/.test(operationId)) throw new Error("TRACE_OPERATION_ID_REQUIRED");
  const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { id: operationId },
    select: { resultJson: true, projectId: true, calls: { select: { estimatedMicros: true, status: true } } } });
  assert.equal(operation.projectId, null, "only an isolated smoke may be replayed");
  const stored = operation.resultJson as { diagnostics?: unknown };
  const trace = stored.diagnostics as { request?: { maxToolCalls?: number }; settlement?: {
    toolCallCountUsedForSettlement?: number; totalSettledCostUsd?: number }; response?: {
    responseId?: string; responseStatus?: string; responseMaxToolCalls?: number | null;
    finalWebSearchOutputItems?: number; uniqueWebSearchCallIds?: number; completedWebSearchCalls?: number;
    webSearchCalls?: Array<{ id: string; status: string; actionType: string; sourceCount: number }>;
    observations?: Array<{ toolCallId: string; normalizedUrl: string | null }>;
  } };
  assert(trace.response?.webSearchCalls && trace.response.observations);
  const observationsByCall = new Map<string, string[]>();
  for (const observation of trace.response.observations) {
    if (!observation.normalizedUrl) continue;
    const urls = observationsByCall.get(observation.toolCallId) ?? [];
    urls.push(observation.normalizedUrl);
    observationsByCall.set(observation.toolCallId, urls);
  }
  const reconstructed = { id: trace.response.responseId, status: trace.response.responseStatus,
    created_at: 0, output: trace.response.webSearchCalls.map(call => ({ type: "web_search_call",
      id: call.id, status: call.status, action: { type: call.actionType,
        sources: (observationsByCall.get(call.id) ?? []).map(url => ({ type: "url", url })) } }))
  } as unknown as OpenAI.Responses.Response;
  const extracted = extractWebObservations(reconstructed, operationId);
  const limit = validateWebToolLimit(extracted, trace.request?.maxToolCalls ?? 0,
    trace.response.responseMaxToolCalls);
  assert.equal(extracted.rawWebSearchOutputItems, trace.response.finalWebSearchOutputItems);
  assert.equal(extracted.uniqueWebSearchCallAttempts, trace.response.uniqueWebSearchCallIds);
  assert.equal(extracted.completedUniqueWebSearchCalls, trace.response.completedWebSearchCalls);
  assert.equal(limit.reason, "WITHIN_LIMIT");
  assert.equal(extracted.observations.length, observationsByCall.get(trace.response.webSearchCalls[0].id)?.length);
  assert.equal(trace.response.webSearchCalls[1]?.status, "searching");
  assert.equal(trace.response.webSearchCalls[1]?.actionType, "open_page");
  assert.equal(observationsByCall.get(trace.response.webSearchCalls[1].id), undefined);
  assert.equal(trace.settlement?.toolCallCountUsedForSettlement, 2);
  assert.equal(operation.calls[0]?.status, "COMPLETED");
  assert.equal(operation.calls[0]?.estimatedMicros,
    Math.ceil((trace.settlement?.totalSettledCostUsd ?? 0) * 1_000_000));
  console.log(JSON.stringify({ raw: extracted.rawWebSearchOutputItems,
    attempts: extracted.uniqueWebSearchCallAttempts, completed: extracted.completedUniqueWebSearchCalls,
    acceptance: limit.reason, eligibleObservations: extracted.observations.length,
    nonCompletedObservations: 0, settlementToolItems: trace.settlement.toolCallCountUsedForSettlement,
    historicalEstimatedMicros: operation.calls[0].estimatedMicros, structuredOutputReplayed: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
