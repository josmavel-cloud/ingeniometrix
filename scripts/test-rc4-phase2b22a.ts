import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { webDiscoveryActualCost } from "@/server/retrieval/astra-web-cost-policy";
import { createOpenAiWebDiscoveryProvider } from "@/server/retrieval/web-discovery-provider";
import { extractWebObservations } from "@/server/retrieval/web-discovery-validation";
import { webDiscoveryRequestDiagnostic, webDiscoveryResponseDiagnostic,
  WEB_DISCOVERY_DIAGNOSTIC_VERSION } from "@/server/retrieval/web-discovery-diagnostics";
import { runWebDiscoveryOperation } from "@/server/retrieval/web-discovery-operation";

if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/imx_b4_validation_rc4") throw new Error("ISOLATED_TEST_DB_REQUIRED");
process.env.IMX_RUN_WEB_DISCOVERY_SMOKE = "1";
process.env.IMX_ENABLE_ASTRA_WEB_DISCOVERY = "0";
let networkAttempts = 0;
global.fetch = async () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };

const publicUrl = "https://www.rfc-editor.org/rfc/rfc9110.html";
type WebItem = { id: string; status: string; action: { type: string; query?: string; queries?: string[];
  sources?: Array<{ type: string; url: string }> } };
const item = (id: string, status = "completed", type = "search", sources = 1): WebItem => ({ id, status,
  action: type === "search" ? { type, query: "site:rfc-editor.org HTTP Semantics",
    sources: Array.from({ length: sources }, (_, index) => ({ type: "url", url: `${publicUrl}?part=${index}` })) } : { type } });
const response = (items: WebItem[], echoed?: number): OpenAI.Responses.Response => ({
  id: "resp_diagnostic_fixture", model: "gpt-6-astra", status: "completed", created_at: 1780000000,
  ...(echoed === undefined ? {} : { max_tool_calls: echoed }),
  output: items.map(value => ({ type: "web_search_call", ...value })),
  output_text: JSON.stringify({ schemaVersion: "web-discovery-result.v1", candidates: [] }),
  usage: { input_tokens: 1000, output_tokens: 160, input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 25 } },
} as unknown as OpenAI.Responses.Response);
const diagnostic = (items: WebItem[], echoed?: number) => {
  const r = response(items, echoed);
  const observed = extractWebObservations(r, "op_fixture");
  return { trace: webDiscoveryResponseDiagnostic(r, observed.observations, true), observed };
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const before = { sources: await prisma.reference.count(), projectLinks: await prisma.projectReference.count() };
  const one = diagnostic([item("ws_one")]);
  assert.equal(one.trace.finalWebSearchOutputItems, 1);
  assert.equal(one.trace.uniqueWebSearchCallIds, 1);
  assert.equal(one.trace.completedWebSearchCalls, 1);
  assert.equal(one.trace.searchActions, 1);
  assert.equal(one.trace.observations[0].sourceIndex, 0);
  // Lifecycle-like duplicates in a final non-streaming object are recorded, not reinterpreted.
  const lifecycle = diagnostic([item("ws_same", "searching"), item("ws_same")]);
  assert.deepEqual([lifecycle.trace.finalWebSearchOutputItems, lifecycle.trace.uniqueWebSearchCallIds,
    lifecycle.trace.completedWebSearchCalls, lifecycle.observed.toolCallCount], [2, 1, 1, 2]);
  const two = diagnostic([item("ws_first"), item("ws_second")]);
  assert.deepEqual([two.trace.finalWebSearchOutputItems, two.trace.uniqueWebSearchCallIds,
    two.trace.completedWebSearchCalls, two.observed.toolCallCount], [2, 2, 2, 2]);
  const incomplete = diagnostic([item("ws_first"), item("ws_second", "in_progress")]);
  assert.deepEqual([incomplete.trace.finalWebSearchOutputItems, incomplete.trace.completedWebSearchCalls,
    incomplete.observed.searchActionCount], [2, 1, 1]);
  const failed = diagnostic([item("ws_first"), item("ws_failed", "failed")]);
  assert.deepEqual([failed.trace.finalWebSearchOutputItems, failed.trace.completedWebSearchCalls], [2, 1]);
  const duplicate = diagnostic([item("ws_same"), item("ws_same")]);
  assert.deepEqual([duplicate.trace.finalWebSearchOutputItems, duplicate.trace.uniqueWebSearchCallIds], [2, 1]);
  const open = diagnostic([item("ws_search"), item("ws_page", "completed", "open_page")]);
  assert.deepEqual([open.trace.searchActions, open.trace.openPageActions, open.trace.findInPageActions], [1, 1, 0]);
  const find = diagnostic([item("ws_search"), item("ws_find", "completed", "find_in_page")]);
  assert.deepEqual([find.trace.searchActions, find.trace.findInPageActions], [1, 1]);
  const many = diagnostic([item("ws_many", "completed", "search", 33)]);
  assert.equal(many.trace.finalWebSearchOutputItems, 1);
  assert.equal(many.trace.webSearchCalls[0].sourceCount, 33);
  assert.equal(many.trace.observations.length, 33);
  assert.equal(many.trace.observations[32].sourceIndex, 32);
  assert.equal(diagnostic([item("ws_echo")], 1).trace.responseMaxToolCalls, 1);
  assert.equal(diagnostic([item("ws_no_echo")]).trace.responseMaxToolCalls, null);

  const user = await prisma.user.create({ data: { email: `web-trace-${Date.now()}@example.test` } });
  try {
    const intent = hash("isolated diagnostic fixture");
    let mockedCalls = 0;
    const provider = createOpenAiWebDiscoveryProvider({ apiKey: "offline-fixture", createResponse: async params => {
      mockedCalls++;
      const pending = await prisma.paidOperation.findFirstOrThrow({ where: { userId: user.id,
        purpose: "ASTRA_WEB_DISCOVERY" }, orderBy: { createdAt: "desc" } });
      const preCall = pending.resultJson as { version: string; request: { maxToolCalls: number; stream: boolean | null } };
      assert.equal(preCall.version, WEB_DISCOVERY_DIAGNOSTIC_VERSION);
      assert.equal(preCall.request.maxToolCalls, 1, "actual SDK params recorded before dispatch");
      assert.equal(preCall.request.stream, null, "SDK stream default is distinguished from request field");
      assert.equal(params.max_tool_calls, 1);
      return response([item("ws_first"), item("ws_second")], 1);
    } });
    const result = await runWebDiscoveryOperation({ userId: user.id, smoke: true,
      gapSetHash: hash("gap"), seenSetHash: hash("seen"),
      researchIntentProjection: { searchIntentHash: intent,
        scientificSignals: [{ field: "purpose", value: "Find a public technical record" }] },
      evidenceGaps: [{ gapId: "gap_fixture", searchIntentHash: intent, kind: "DISCOVERY", importance: "MATERIAL",
        requiredDimension: "Public technical record", desiredEvidenceRole: "DIRECT",
        preferredSourceTypes: ["SCHOLARLY"], unresolvedPremises: [], webDiscoveryEligible: true }],
      seenSourceIdentities: [], policy: { maxToolCalls: 1, maxCandidates: 1, maxOutputTokens: 800 }, provider });
    assert.equal(result.state, "INVALID_TOOL_PROVENANCE", "two completed calls still exceed the limit");
    assert.equal(mockedCalls, 1);
    const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { id: result.operationId },
      include: { calls: true } });
    const trace = (operation.resultJson as { diagnostics: typeof result.diagnostics }).diagnostics!;
    assert.equal(trace.response?.finalWebSearchOutputItems, 2);
    assert.equal(trace.response?.uniqueWebSearchCallIds, 2);
    assert.equal(trace.response?.completedWebSearchCalls, 2);
    assert.equal(trace.response?.responseMaxToolCalls, 1);
    assert.equal(trace.toolLimit?.reason, "COMPLETED_CALL_LIMIT_EXCEEDED");
    assert.equal(trace.settlement?.toolCallCountUsedForSettlement, 2);
    assert.equal(operation.calls[0].status, "COMPLETED");
    assert.equal(operation.calls[0].estimatedMicros, Math.ceil(webDiscoveryActualCost({ inputTokens: 1000,
      cachedInputTokens: 0, outputTokens: 160 }, 2)! * 1_000_000));
    assert.equal(operation.calls[0].estimatedMicros, Math.ceil(trace.settlement!.totalSettledCostUsd! * 1_000_000));
    const incompleteProvider = createOpenAiWebDiscoveryProvider({ apiKey: "offline-fixture",
      createResponse: async () => response([item("ws_search"), item("ws_page", "searching", "open_page")], 1) });
    const completed = await runWebDiscoveryOperation({ userId: user.id, smoke: true,
      gapSetHash: hash("gap-with-unprocessed-page"), seenSetHash: hash("seen"),
      researchIntentProjection: { searchIntentHash: intent,
        scientificSignals: [{ field: "purpose", value: "Find a public technical record" }] },
      evidenceGaps: [{ gapId: "gap_fixture", searchIntentHash: intent, kind: "DISCOVERY", importance: "MATERIAL",
        requiredDimension: "Public technical record", desiredEvidenceRole: "DIRECT",
        preferredSourceTypes: ["SCHOLARLY"], unresolvedPremises: [], webDiscoveryEligible: true }],
      seenSourceIdentities: [], policy: { maxToolCalls: 1, maxCandidates: 1, maxOutputTokens: 800 },
      provider: incompleteProvider });
    assert.equal(completed.state, "COMPLETED", "structured output is reached after an unprocessed second item");
    assert.deepEqual([completed.toolCallCount, completed.toolCallsForAcceptance,
      completed.estimatedBillableToolCalls], [2, 1, 2]);
    const completedOperation = await prisma.paidOperation.findUniqueOrThrow({ where: { id: completed.operationId },
      include: { calls: true } });
    const completedTrace = (completedOperation.resultJson as { diagnostics: typeof completed.diagnostics }).diagnostics!;
    assert.equal(completedTrace.toolLimit?.reason, "WITHIN_LIMIT");
    assert.equal(completedTrace.response?.completedUniqueWebSearchCalls, 1);
    assert.equal(completedTrace.settlement?.toolCallCountUsedForSettlement, 2);
    assert.equal(completedOperation.calls[0].estimatedMicros, operation.calls[0].estimatedMicros,
      "acceptance does not lower the conservative billing estimate");
    assert.equal((await prisma.reference.count()), before.sources);
    assert.equal((await prisma.projectReference.count()), before.projectLinks);
  } finally { await prisma.user.delete({ where: { id: user.id } }); }

  const secret = "sk-fakeDiagnosticSecret";
  const sampleRequest = { model: "gpt-6-astra", max_tool_calls: 1, tool_choice: "required",
    tools: [{ type: "web_search", external_web_access: true }],
    include: ["web_search_call.action.sources"], max_output_tokens: 800,
    reasoning: { effort: "low" }, input: `private ${secret}`, instructions: `Bearer ${secret}`,
    text: { format: { type: "json_schema", name: "web_discovery_result_v1" } } } as unknown as
    Parameters<typeof webDiscoveryRequestDiagnostic>[0];
  const secretResponse = response([{ ...item("ws_safe"), action: { type: "search", query: `Bearer ${secret}`,
    sources: [{ type: "url", url: `https://example.org/?token=${secret}` }] } }]);
  const safeTrace = { request: webDiscoveryRequestDiagnostic(sampleRequest),
    response: webDiscoveryResponseDiagnostic(secretResponse,
      extractWebObservations(secretResponse, "op_fixture").observations, true) };
  assert(!JSON.stringify(safeTrace).includes(secret), "diagnostic must redact credentials and private input");
  assert.equal(safeTrace.response.webSearchCalls[0].query, null);
  assert.equal(safeTrace.response.observations[0].normalizedUrl, null);
  assert.equal(networkAttempts, 0);
  console.log("PASS 2B2.2a: final-item counters, request/response/settlement traces, redaction, completed-call limit and no provider calls");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
