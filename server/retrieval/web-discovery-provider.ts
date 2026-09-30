import OpenAI from "openai";
import { reservePaidCall } from "@/server/mvp/application-budget";
import { currentPaidOperation } from "@/server/mvp/pre-job-budget";
import { WEB_DISCOVERY_PROMPT } from "@/server/mvp/prompts/web-discovery.v1";
import { ASTRA_WEB_COST_POLICY, webDiscoveryActualCost, webDiscoveryCostBound } from "./astra-web-cost-policy";
import { WEB_DISCOVERY_PURPOSE, WEB_DISCOVERY_SCHEMA_VERSION,
  type WebDiscoveryInput, type WebDiscoveryProvider, type WebDiscoveryResult } from "./web-discovery-contract";
import { WEB_DISCOVERY_JSON_SCHEMA, extractWebObservations, validateWebDiscoveryProposals,
  validateWebToolLimit } from "./web-discovery-validation";
import { WEB_DISCOVERY_DIAGNOSTIC_VERSION, persistWebDiscoveryDiagnostic, webDiscoveryRequestDiagnostic,
  webDiscoveryResponseDiagnostic, webDiscoverySettlementDiagnostic, type WebDiscoveryDiagnostic } from "./web-discovery-diagnostics";

// The installed SDK predates the documented max_tool_calls/web options.
type ResponseParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & { max_tool_calls: number };
type Response = OpenAI.Responses.Response;
const CONTEXT_FIELDS = new Set(["originalIdea", "topic", "problem", "purpose", "object", "concepts", "intendedOutput",
  "context", "scope", "methodPreference", "constraints", "advisorNotes", "researchLine"]);

function boundedRequest(input: WebDiscoveryInput) {
  if (!input.operationContext.operationId || input.evidenceGaps.length !== 1 ||
      input.evidenceGaps.some(g => !g.webDiscoveryEligible || g.importance !== "MATERIAL" ||
        !["DISCOVERY", "EVIDENCE"].includes(g.kind) || g.searchIntentHash !== input.researchIntentProjection.searchIntentHash) ||
      input.policy.maxToolCalls < 1 || input.policy.maxToolCalls > (input.operationContext.smoke ? 1 : 2) ||
      input.policy.maxCandidates < 1 || input.policy.maxCandidates > (input.operationContext.smoke ? 1 : 6) ||
      input.policy.maxOutputTokens < 256 || input.policy.maxOutputTokens > (input.operationContext.smoke ? 2048 : 8000)) {
    throw new Error("INVALID_WEB_DISCOVERY_SCOPE");
  }
  if (input.operationContext.smoke ? process.env.IMX_RUN_WEB_DISCOVERY_SMOKE !== "1" :
      process.env.IMX_ENABLE_ASTRA_WEB_DISCOVERY !== "1") throw new Error("WEB_DISCOVERY_DISABLED");
  const signals = input.researchIntentProjection.scientificSignals;
  if (signals.length < 1 || signals.length > 12 || signals.some(s => !CONTEXT_FIELDS.has(s.field) ||
      !s.value.trim() || s.value.length > 400)) throw new Error("INVALID_RESEARCH_DISCOVERY_CONTEXT");
  if (input.seenSourceIdentities.length > 30 || input.seenSourceIdentities.some(s =>
      (s.doi?.length ?? 0) > 160 || (s.url?.length ?? 0) > 512 || (s.title?.length ?? 0) > 200)) {
    throw new Error("WEB_DISCOVERY_SEEN_SET_TOO_LARGE");
  }
  const prompt = JSON.stringify({ gap: input.evidenceGaps.map(g => ({ id: g.gapId, dimension: g.requiredDimension,
    role: g.desiredEvidenceRole, sourceTypes: g.preferredSourceTypes,
    unresolvedPremises: g.unresolvedPremises.map(p => ({ wording: p.anchor.quote, status: p.status })) })),
  scientificSignals: signals, alreadySeen: input.seenSourceIdentities, maximumCandidates: input.policy.maxCandidates });
  const params = { model: ASTRA_WEB_COST_POLICY.model, reasoning: { effort: "low" },
    // These two documented web-search fields are newer than the installed SDK typings.
    tools: [{ type: "web_search", external_web_access: true, search_context_size: "low", return_token_budget: "default" } as unknown as OpenAI.Responses.WebSearchTool],
    tool_choice: "required", max_tool_calls: input.policy.maxToolCalls, include: ["web_search_call.action.sources"],
    max_output_tokens: input.policy.maxOutputTokens, input: prompt, instructions: WEB_DISCOVERY_PROMPT.instructions,
    text: { format: { type: "json_schema", name: "web_discovery_result_v1", strict: true, schema: WEB_DISCOVERY_JSON_SCHEMA } },
    background: false, store: false } as unknown as ResponseParams;
  return params;
}

export function createOpenAiWebDiscoveryProvider(config: {
  apiKey: string;
  createResponse?: (params: ResponseParams) => Promise<Response>;
}): WebDiscoveryProvider {
  const client = config.createResponse ? null : new OpenAI({ apiKey: config.apiKey, timeout: 120_000, maxRetries: 0 });
  return { async discover(input) {
    if (currentPaidOperation()?.id !== input.operationContext.operationId) throw new Error("WEB_DISCOVERY_PAID_OPERATION_REQUIRED");
    const params = boundedRequest(input);
    const bound = webDiscoveryCostBound({ requestBytes: Buffer.byteLength(JSON.stringify(params)),
      maxOutputTokens: input.policy.maxOutputTokens, maxToolCalls: input.policy.maxToolCalls });
    if (!bound) throw new Error("COST_BOUND_UNAVAILABLE");
    const diagnostics: WebDiscoveryDiagnostic = { version: WEB_DISCOVERY_DIAGNOSTIC_VERSION,
      request: webDiscoveryRequestDiagnostic(params) };
    // The trace is derived from the same params object passed to responses.create.
    // It is persisted before any provider dispatch, even if the process later dies.
    await persistWebDiscoveryDiagnostic(input.operationContext.operationId, diagnostics);
    const ticket = await reservePaidCall(WEB_DISCOVERY_PURPOSE, ASTRA_WEB_COST_POLICY.model, bound.maximumUsd);
    let response: Response;
    try { response = config.createResponse ? await config.createResponse(params) : await client!.responses.create(params); }
    catch (error) {
      await ticket.fail();
      diagnostics.settlement = webDiscoverySettlementDiagnostic({ toolCallCount: 0, usage: null, totalSettledCostUsd: null });
      await persistWebDiscoveryDiagnostic(input.operationContext.operationId, diagnostics);
      const status = (error as { status?: number }).status;
      const name = (error as { name?: string }).name ?? "";
      const state: WebDiscoveryResult["state"] = /timeout|connection/i.test(name) ? "TIMEOUT_UNKNOWN_USAGE" :
        typeof status === "number" ? "PROVIDER_UNAVAILABLE" : "FAILED_RETRYABLE";
      return { schemaVersion: WEB_DISCOVERY_SCHEMA_VERSION, state, operationId: input.operationContext.operationId,
        responseId: null, model: ASTRA_WEB_COST_POLICY.model, searchActionCount: 0, toolCallCount: 0,
        toolCallsForAcceptance: 0, estimatedBillableToolCalls: 0,
        observations: [], candidates: [], rejectedProposals: [], usage: null, estimatedCostUsd: null,
        costPolicyVersion: ASTRA_WEB_COST_POLICY.version, diagnostics };
    }
    const usage = response.usage;
    const web = extractWebObservations(response, input.operationContext.operationId);
    diagnostics.response = webDiscoveryResponseDiagnostic(response, web.observations, input.operationContext.smoke);
    diagnostics.toolLimit = validateWebToolLimit(web, input.policy.maxToolCalls,
      (response as Response & { max_tool_calls?: unknown }).max_tool_calls);
    // Retain the final output-item trace before any acceptance or candidate filter.
    let diagnosticWriteError: unknown = null;
    try { await persistWebDiscoveryDiagnostic(input.operationContext.operationId, diagnostics); }
    catch (error) { diagnosticWriteError = error; }
    const used = usage ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
      reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
      cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0 } : null;
    // Billing remains conservatively estimated from raw output items; the
    // acceptance limit below counts only distinct completed tool calls.
    const estimatedBillableToolCalls = web.rawWebSearchOutputItems;
    const actualCost = used ? webDiscoveryActualCost(used, estimatedBillableToolCalls) : null;
    if (actualCost === null) await ticket.fail();
    else await ticket.complete(actualCost, { ...used, webSearchToolCalls: estimatedBillableToolCalls,
      pricingVersion: ASTRA_WEB_COST_POLICY.version }, response.model);
    diagnostics.settlement = webDiscoverySettlementDiagnostic({ toolCallCount: estimatedBillableToolCalls,
      usage: used, totalSettledCostUsd: actualCost });
    if (diagnosticWriteError) throw diagnosticWriteError;
    await persistWebDiscoveryDiagnostic(input.operationContext.operationId, diagnostics);
    const base: Omit<WebDiscoveryResult, "state" | "candidates" | "rejectedProposals"> = {
      schemaVersion: WEB_DISCOVERY_SCHEMA_VERSION, operationId: input.operationContext.operationId,
      responseId: response.id, model: response.model, searchActionCount: web.searchActionCount,
      toolCallCount: estimatedBillableToolCalls, toolCallsForAcceptance: web.completedUniqueWebSearchCalls,
      estimatedBillableToolCalls, observations: web.observations, usage: used,
      estimatedCostUsd: actualCost, costPolicyVersion: ASTRA_WEB_COST_POLICY.version, diagnostics };
    const result = (state: WebDiscoveryResult["state"], candidates: WebDiscoveryResult["candidates"] = [],
      rejectedProposals: WebDiscoveryResult["rejectedProposals"] = []): WebDiscoveryResult =>
      ({ ...base, state, candidates, rejectedProposals });
    if (!used) return result("TIMEOUT_UNKNOWN_USAGE");
    if (actualCost! > bound.maximumUsd) return result("COST_BOUND_UNAVAILABLE");
    if (!diagnostics.toolLimit.accepted) return result("INVALID_TOOL_PROVENANCE");
    if (response.status !== "completed") return result(response.status === "incomplete" ? "INVALID_STRUCTURED_OUTPUT" : "PROVIDER_UNAVAILABLE");
    if (!web.searchActionCount) return result("INVALID_TOOL_PROVENANCE");
    if (!web.observations.length) return result("NO_OBSERVED_SOURCES");
    const parsed = validateWebDiscoveryProposals(response.output_text ?? "", web.observations,
      input.evidenceGaps.map(g => g.gapId), input.policy.maxCandidates, input.operationContext.operationId,
      web.ineligibleSourceUrls);
    if (!parsed.validEnvelope) return result("INVALID_STRUCTURED_OUTPUT");
    return result(parsed.rejectedProposals.length ? "PARTIAL" : "COMPLETED", parsed.candidates, parsed.rejectedProposals);
  } };
}

// Test-only deterministic builders can inspect this contract without a paid call.
export const webDiscoveryRequestForTest = boundedRequest;
