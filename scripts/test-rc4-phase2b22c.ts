import assert from "node:assert/strict";
import type OpenAI from "openai";
import { webDiscoveryActualCost, webDiscoveryCostBound } from "@/server/retrieval/astra-web-cost-policy";
import { extractWebObservations, summarizeWebToolCalls, validateWebDiscoveryProposals,
  validateWebToolLimit } from "@/server/retrieval/web-discovery-validation";
import { webDiscoveryResponseDiagnostic } from "@/server/retrieval/web-discovery-diagnostics";

type WebItem = { id: string; status: string; action: { type: string; query?: string;
  sources?: Array<{ type: "url"; url: string }> } };
const url = "https://example.org/source";
const item = (id: string, status = "completed", actionType = "search", source = url): WebItem => ({
  id, status, action: actionType === "search" ? { type: "search", query: "public source",
    sources: [{ type: "url", url: source }] } : { type: actionType },
});
const response = (items: WebItem[], maxToolCalls: number | undefined = 1): OpenAI.Responses.Response => ({
  id: "resp_fixture", model: "gpt-6-astra", status: "completed", created_at: 1780000000,
  ...(maxToolCalls === undefined ? {} : { max_tool_calls: maxToolCalls }),
  output: items.map(value => ({ type: "web_search_call", ...value })),
  output_text: "not-json", usage: null,
} as unknown as OpenAI.Responses.Response);
const inspect = (items: WebItem[], maxToolCalls: number | undefined = 1) => {
  const r = response(items, maxToolCalls);
  const extracted = extractWebObservations(r, "operation_fixture");
  const limit = validateWebToolLimit(extracted, 1, (r as typeof r & { max_tool_calls?: unknown }).max_tool_calls);
  return { extracted, limit, trace: webDiscoveryResponseDiagnostic(r, extracted.observations, true) };
};
const proposal = (observedUrl: string) => JSON.stringify({ schemaVersion: "web-discovery-result.v1",
  candidates: [{ localCandidateRef: "c1", gapIds: ["gap_fixture"],
    identityProposal: { title: "Primary source", authors: [], year: null, doi: null, issuer: null,
      sourceType: "OTHER_CREDIBLE_PRIMARY_SOURCE" }, observedUrl,
    relevanceProposal: { role: "DIRECT", gapCoverage: "Covers the requested dimension",
      rationale: "Source text is relevant", uncertainty: "Metadata not independently verified" },
    accessProposal: { reportedAccessType: "UNKNOWN", reportedPdfUrl: null, alternateUrls: [] } }] });

const one = inspect([item("first")]);
assert.deepEqual([one.extracted.rawWebSearchOutputItems, one.extracted.uniqueWebSearchCallAttempts,
  one.extracted.completedUniqueWebSearchCalls], [1, 1, 1]);
assert(one.limit.accepted);

// Sanitized shape of the preserved smoke: completed search, incomplete open_page.
const historical = inspect([item("first"), item("second", "searching", "open_page")]);
assert.deepEqual([historical.extracted.rawWebSearchOutputItems, historical.extracted.uniqueWebSearchCallAttempts,
  historical.extracted.completedUniqueWebSearchCalls], [2, 2, 1]);
assert.equal(historical.limit.reason, "WITHIN_LIMIT");
assert.equal(historical.extracted.observations.length, 1);
assert.equal(historical.extracted.observations[0].toolCallId, "first");
assert.equal(historical.trace.webSearchCalls[1].status, "searching");
assert.equal(historical.trace.webSearchCalls[1].actionType, "open_page");
assert.equal(historical.trace.completedWebSearchCalls, 1);
assert.equal(historical.trace.responseMaxToolCalls, 1);

const twoCompleted = inspect([item("first"), item("second")]);
assert.equal(twoCompleted.limit.reason, "COMPLETED_CALL_LIMIT_EXCEEDED");
const duplicate = inspect([item("same"), item("same")]);
assert.deepEqual([duplicate.extracted.rawWebSearchOutputItems, duplicate.extracted.uniqueWebSearchCallAttempts,
  duplicate.extracted.completedUniqueWebSearchCalls], [2, 1, 1]);
assert(duplicate.limit.accepted);
assert.equal(duplicate.extracted.observations.length, 1, "duplicate output does not duplicate provenance");
const lastStatus = inspect([item("same"), item("same", "searching")]);
assert.deepEqual([lastStatus.extracted.uniqueWebSearchCallAttempts,
  lastStatus.extracted.completedUniqueWebSearchCalls, lastStatus.extracted.observations.length], [1, 0, 0],
"a later non-completed state revokes an earlier completed observation");
const openAttempt = inspect([item("first"), item("second", "searching", "search", "https://example.org/unready")]);
assert(openAttempt.limit.accepted);
assert.equal(openAttempt.extracted.observations.length, 1);
assert(openAttempt.extracted.ineligibleSourceUrls.includes("https://example.org/unready"));
const completedOpen = inspect([item("first"), item("second", "completed", "open_page")]);
assert.equal(completedOpen.limit.reason, "COMPLETED_CALL_LIMIT_EXCEEDED");

const unknown = inspect([item("first"), item("second", "unexpected", "search", "https://example.org/unknown")]);
assert(unknown.limit.accepted, "separable unknown-status attempt does not consume the completed-call cap");
assert.deepEqual(unknown.extracted.unknownStatusCallIds, ["second"]);
assert.equal(unknown.extracted.observations.length, 1);
assert.equal(validateWebDiscoveryProposals(proposal("https://example.org/unknown"), unknown.extracted.observations,
  ["gap_fixture"], 1, "operation_fixture", unknown.extracted.ineligibleSourceUrls).rejectedProposals[0].reason,
  "NON_COMPLETED_TOOL_PROVENANCE");
const overlap = inspect([item("first"), item("second", "unexpected", "search")]);
assert.equal(validateWebDiscoveryProposals(proposal(url), overlap.extracted.observations,
  ["gap_fixture"], 1, "operation_fixture", overlap.extracted.ineligibleSourceUrls).rejectedProposals[0].reason,
  "NON_COMPLETED_TOOL_PROVENANCE", "unknown-status source cannot borrow another call's provenance");
assert.equal(validateWebDiscoveryProposals(proposal(url), historical.extracted.observations,
  ["gap_fixture"], 1, "operation_fixture", historical.extracted.ineligibleSourceUrls).candidates.length, 1);
const noCompletedSource = inspect([item("only", "failed")]);
assert.equal(noCompletedSource.extracted.observations.length, 0);
assert.equal(validateWebDiscoveryProposals(proposal(url), noCompletedSource.extracted.observations,
  ["gap_fixture"], 1, "operation_fixture", noCompletedSource.extracted.ineligibleSourceUrls).candidates.length, 0);

assert.equal(inspect([item("first")], 2).limit.reason, "RESPONSE_LIMIT_MISMATCH");
assert.equal(validateWebToolLimit(summarizeWebToolCalls(response([item("first")])), 1, "unknown").reason,
  "RESPONSE_LIMIT_MISMATCH");
assert.equal(validateWebToolLimit(summarizeWebToolCalls(response([item("first")])), 1, undefined).reason,
  "WITHIN_LIMIT");
assert.equal(validateWebToolLimit(summarizeWebToolCalls(response([item("", "completed")])), 1, 1).reason,
  "INVALID_CALL_ID");

const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100 };
assert(webDiscoveryCostBound({ requestBytes: 1000, maxOutputTokens: 2048, maxToolCalls: 1 }));
assert.equal(webDiscoveryActualCost(usage, historical.extracted.rawWebSearchOutputItems)!,
  webDiscoveryActualCost(usage, 2));
assert(webDiscoveryActualCost(usage, historical.extracted.rawWebSearchOutputItems)! >
  webDiscoveryActualCost(usage, historical.extracted.completedUniqueWebSearchCalls)!);

console.log("PASS 2B2.2c: 2/2/1 historical shape, completed-call cap, final-ID state, provenance and conservative cost separation");
