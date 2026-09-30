import type OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { ASTRA_WEB_COST_POLICY } from "./astra-web-cost-policy";
import { WEB_DISCOVERY_POLICY_VERSION, WEB_DISCOVERY_SCHEMA_VERSION, type WebSourceObservation } from "./web-discovery-contract";
import { summarizeWebToolCalls, type validateWebToolLimit } from "./web-discovery-validation";

export const WEB_DISCOVERY_DIAGNOSTIC_VERSION = "web-discovery-diagnostic.v2";
type ResponseParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & { max_tool_calls: number };
type Response = OpenAI.Responses.Response;

const safeId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
const safeCode = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
const safeQuery = (value: unknown, smoke: boolean) => smoke && typeof value === "string" &&
  value.length <= 300 && /^[\x20-\x7e]+$/.test(value) &&
  !/(?:authorization|bearer|cookie|secret|password|api[_-]?key|sk-[A-Za-z0-9]|token\s*[=:]|@)/i.test(value) ? value : null;
const safeDiagnosticUrl = (value: string) => {
  if (/(?:sk-[A-Za-z0-9]|@)/i.test(value)) return null;
  try {
    const url = new URL(value);
    // A public result can still carry a private token in an arbitrary query key.
    if (url.search) return null;
    return value;
  } catch { return null; }
};

export function webDiscoveryRequestDiagnostic(params: ResponseParams) {
  const format = params.text?.format;
  return {
    model: params.model,
    maxToolCalls: params.max_tool_calls,
    toolChoice: typeof params.tool_choice === "string" ? params.tool_choice : null,
    toolTypes: params.tools?.map(tool => tool.type) ?? [],
    webSearchExternalWebAccess: (params.tools?.find(tool => tool.type === "web_search") as
      { external_web_access?: boolean } | undefined)?.external_web_access ?? null,
    include: params.include ?? [],
    // null means omitted from the object passed to the SDK; its create() path defaults to false.
    stream: params.stream ?? null,
    reasoningEffort: params.reasoning?.effort ?? null,
    maxOutputTokens: params.max_output_tokens ?? null,
    structuredOutputSchemaVersion: format?.type === "json_schema" && format.name === "web_discovery_result_v1" ?
      WEB_DISCOVERY_SCHEMA_VERSION : null,
    webPolicyVersion: WEB_DISCOVERY_POLICY_VERSION,
    costPolicyVersion: ASTRA_WEB_COST_POLICY.version,
  };
}

export function webDiscoveryResponseDiagnostic(response: Response, observations: WebSourceObservation[], smoke: boolean) {
  const summary = summarizeWebToolCalls(response);
  const calls = response.output.flatMap((item, outputIndex) => {
    if (item.type !== "web_search_call") return [];
    const action = item.action;
    return [{ outputIndex, id: safeId(item.id), status: safeCode(item.status), actionType: safeCode(action?.type),
      query: action?.type === "search" ? safeQuery(action.query, smoke) : null,
      queryList: action?.type === "search" && Array.isArray(action.queries) ?
        action.queries.map(query => safeQuery(query, smoke)) : null,
      sourceCount: action?.type === "search" ? (action.sources?.length ?? 0) : 0 }];
  });
  const echoedMax = (response as Response & { max_tool_calls?: unknown }).max_tool_calls;
  const reason = response.incomplete_details?.reason;
  return {
    responseId: safeId(response.id), responseStatus: safeCode(response.status),
    responseMaxToolCalls: typeof echoedMax === "number" && Number.isSafeInteger(echoedMax) ? echoedMax : null,
    incompleteDetails: reason ? { reason: safeCode(reason) } : null,
    webSearchCalls: calls,
    finalWebSearchOutputItems: calls.length,
    uniqueWebSearchCallIds: summary.uniqueWebSearchCallAttempts,
    completedWebSearchCalls: summary.completedUniqueWebSearchCalls,
    rawWebSearchOutputItems: summary.rawWebSearchOutputItems,
    uniqueWebSearchCallAttempts: summary.uniqueWebSearchCallAttempts,
    completedUniqueWebSearchCalls: summary.completedUniqueWebSearchCalls,
    unknownStatusCallIds: summary.unknownStatusCallIds.map(safeId),
    searchActions: calls.filter(call => call.actionType === "search").length,
    openPageActions: calls.filter(call => call.actionType === "open_page").length,
    findInPageActions: calls.filter(call => call.actionType === "find_in_page").length,
    otherActions: calls.filter(call => !["search", "open_page", "find_in_page"].includes(call.actionType ?? "")).length,
    observations: observations.map(observation => ({ observationId: observation.observationId,
      toolCallId: observation.toolCallId, normalizedUrl: safeDiagnosticUrl(observation.normalizedUrl),
      sourceIndex: observation.sourceIndex ?? null })),
  };
}

export function webDiscoverySettlementDiagnostic(input: {
  toolCallCount: number;
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number } | null;
  totalSettledCostUsd: number | null;
}) {
  const estimatedToolCostUsd = input.usage ? input.toolCallCount * ASTRA_WEB_COST_POLICY.webSearchUsdPerCall : null;
  return { toolCallCountUsedForSettlement: input.toolCallCount,
    inputTokens: input.usage?.inputTokens ?? null, outputTokens: input.usage?.outputTokens ?? null,
    reasoningTokens: input.usage?.reasoningTokens ?? null,
    estimatedToolCostUsd, estimatedModelCostUsd: input.totalSettledCostUsd === null || estimatedToolCostUsd === null ?
      null : input.totalSettledCostUsd - estimatedToolCostUsd,
    totalSettledCostUsd: input.totalSettledCostUsd,
    providerInvoicedCostUsd: null };
}

export type WebDiscoveryDiagnostic = {
  version: typeof WEB_DISCOVERY_DIAGNOSTIC_VERSION;
  request: ReturnType<typeof webDiscoveryRequestDiagnostic>;
  response?: ReturnType<typeof webDiscoveryResponseDiagnostic>;
  toolLimit?: ReturnType<typeof validateWebToolLimit>;
  settlement?: ReturnType<typeof webDiscoverySettlementDiagnostic>;
};

// PaidOperation is private and owner-scoped. Persist only the allowlisted trace,
// never the request body, provider envelope, auth headers, or page text.
export async function persistWebDiscoveryDiagnostic(operationId: string, diagnostic: WebDiscoveryDiagnostic) {
  await prisma.paidOperation.update({ where: { id: operationId }, data: { resultJson: diagnostic } });
}
