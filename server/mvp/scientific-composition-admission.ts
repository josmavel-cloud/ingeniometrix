import type { LlmProvider, StructuredObjectInput } from "@/llm/provider";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { fingerprint, preflightWholeJobCost, stageCheckpoint } from "./job-execution-context";
import { scientificStructuredCall } from "./scientific-structured-call";

export const SCIENTIFIC_COMPOSITION_ADMISSION_POLICY = "scientific-composition-token-admission.v1";
export const SCIENTIFIC_COMPOSITION_CONTEXT_LIMIT = 65_536;

/** Full request (including strict output schema), never a byte-truncated excerpt.
 * Exact count is preferred. A conservative estimate remains visibly an estimate. */
export async function scientificCompositionForecast(input: {
  provider: LlmProvider; request: StructuredObjectInput; minimumRemainingMandatoryReservation: number;
}) {
  const { request } = input;
  if (!request.model || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens! <= 0 ||
      !Number.isFinite(input.minimumRemainingMandatoryReservation) || input.minimumRemainingMandatoryReservation < 0)
    throw new Error("SCIENTIFIC_COMPOSITION_FORECAST_INVALID");
  const bound = input.provider.estimateStructuredRequest
    ? await input.provider.estimateStructuredRequest(request)
    : responseCostBound({ model: request.model, input: request.prompt,
      text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } },
      ...(request.reasoningEffort ? { reasoning: { effort: request.reasoningEffort } } : {}), max_output_tokens: request.maxOutputTokens });
  if (!bound || !Number.isSafeInteger(bound.inputTokens) || bound.inputTokens < 0 ||
      !Number.isFinite(bound.maximumUsd) || bound.maximumUsd < 0) throw new Error("SCIENTIFIC_COMPOSITION_FORECAST_INVALID");
  const forecast = {
    policyVersion: SCIENTIFIC_COMPOSITION_ADMISSION_POLICY, requestFingerprint: fingerprint(request),
    model: request.model, schemaName: request.schemaName,
    promptBytesDiagnostic: Buffer.byteLength(request.prompt), schemaBytesDiagnostic: Buffer.byteLength(JSON.stringify(request.schema)),
    inputTokens: bound.inputTokens, tokenCountProvenance: bound.tokenCountProvenance,
    maxOutputTokens: request.maxOutputTokens!, contextLimitTokens: SCIENTIFIC_COMPOSITION_CONTEXT_LIMIT,
    maximumUsd: bound.maximumUsd, minimumRemainingMandatoryReservation: input.minimumRemainingMandatoryReservation,
    contextAdmissible: bound.inputTokens + request.maxOutputTokens! <= SCIENTIFIC_COMPOSITION_CONTEXT_LIMIT,
  };
  return forecast;
}

export async function generateAdmittedScientificComposition<T>(input: {
  provider: LlmProvider; request: StructuredObjectInput; projectId: string; runId: string;
  minimumRemainingMandatoryReservation: number;
}) {
  const requestHash = fingerprint(input.request);
  // Persist admission once for this exact request. If its background response is
  // already dispatched, recovery reuses admission and the existing reservation;
  // it does not add that same call's maximum to committed cost a second time.
  const forecast = await stageCheckpoint(`COMPOSITION_ADMISSION:${requestHash}`, {
    policy: SCIENTIFIC_COMPOSITION_ADMISSION_POLICY, requestHash,
    minimumRemainingMandatoryReservation: input.minimumRemainingMandatoryReservation,
  }, async () => {
    const value = await scientificCompositionForecast(input);
    await stageCheckpoint(`COMPOSITION_FORECAST:${requestHash}`, { requestHash, policy: value.policyVersion }, async () => value);
    if (!value.contextAdmissible) throw new Error("SCIENTIFIC_COMPOSITION_CONTEXT_UNSAFE");
    await preflightWholeJobCost({ nextStage: input.request.schemaName, nextStageReservation: value.maximumUsd,
      minimumRemainingMandatoryReservation: input.minimumRemainingMandatoryReservation });
    return value;
  });
  if (!forecast.contextAdmissible) throw new Error("SCIENTIFIC_COMPOSITION_CONTEXT_UNSAFE");
  return scientificStructuredCall<T>(input.provider, { ...input.request, maxRetries: 0 }, input);
}
