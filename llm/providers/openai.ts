import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { recordLlmUsage, type LlmUsageAttribution } from "@/server/llm-usage-registry";
import { reservePaidCall, withPaidCallAttempt } from "@/server/mvp/application-budget";
import { claimBackgroundProviderResponse, currentJobExecution, fingerprint, settleCurrentJobCall, updateBackgroundProviderResponse } from "@/server/mvp/job-execution-context";
import { currentPaidOperation } from "@/server/mvp/pre-job-budget";
import { classifyFailure } from "@/server/mvp/execution-policy";
import { responseCostBound } from "./openai-cost-bound";
import { IncompleteStructuredOutputError } from "../structured-output-error";

import type {
  LlmProvider,
  BackgroundStructuredObjectInput,
  StructuredObjectInput,
  TextGenerationResult,
  TextGenerationInput,
  VisionStructuredObjectInput,
} from "../provider";

export type OpenAiProviderConfig = {
  apiKey: string;
  defaultModel: string;
  // Test seam for deterministic lifecycle tests; production always uses the SDK.
  responseClient?: { responses: Pick<OpenAI["responses"], "create" | "retrieve"> };
};

const DEFAULT_OPENAI_TIMEOUT_MS = 120_000;
const DEFAULT_OPENAI_RETRIES = 1;
let reservedApiUsd = 0; // Shared by provider instances in one bounded evaluation process.

export class ProviderResponsePendingError extends Error {
  constructor(readonly responseId: string, readonly providerStatus: string) {
    super(`PROVIDER_RESPONSE_PENDING:${responseId}:${providerStatus}`);
    this.name = "ProviderResponsePendingError";
  }
}

function resolveTimeoutMs() {
  const rawValue = Number.parseInt(process.env.LLM_REQUEST_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : DEFAULT_OPENAI_TIMEOUT_MS;
}

function resolveRetryCount() {
  const rawValue = Number.parseInt(process.env.LLM_REQUEST_MAX_RETRIES ?? "", 10);
  return Number.isFinite(rawValue) && rawValue >= 0 ? Math.min(rawValue, 2) : DEFAULT_OPENAI_RETRIES;
}

function resolveMaxOutputTokens(explicitValue?: number) {
  const candidate = explicitValue ?? Number.parseInt(process.env.LLM_MAX_OUTPUT_TOKENS ?? (currentPaidOperation() ? "4096" : ""), 10);
  return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : undefined;
}

function backgroundStructuredParams(input: StructuredObjectInput, model: string) {
  return {
    model,
    ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
    background: true,
    store: true,
    max_output_tokens: resolveMaxOutputTokens(input.maxOutputTokens),
    input: input.prompt,
    text: { format: { type: "json_schema", name: input.schemaName, strict: true, schema: input.schema } },
  };
}

export function openAiBackgroundRequestFingerprint(input: StructuredObjectInput & { model: string }) {
  return fingerprint({ provider: "openai", params: backgroundStructuredParams(input, input.model) });
}

function requireUsage(response: { usage?: {
  input_tokens: number;
  input_tokens_details?: { cached_tokens?: number } | null;
  output_tokens: number;
} | null }) {
  if (!response.usage) {
    throw new Error("OpenAI no devolvio metricas de uso; la llamada no se registrara como cero.");
  }

  return {
    inputTokens: response.usage.input_tokens,
    cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response.usage.output_tokens,
  };
}

async function runWithTimeoutAndRetry<T>(work: () => Promise<T>) {
  const timeoutMs = resolveTimeoutMs();
  const maxRetries = resolveRetryCount();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await withPaidCallAttempt(attempt, work); // SDK timeout aborts; each retry reserves independently.
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !classifyFailure(error).autoRetry) {
        throw error;
      }

      await delay(1_500);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI fallo por una razon no identificada.");
}

export function createOpenAiProvider(config: OpenAiProviderConfig): LlmProvider {
  const client = config.responseClient ?? new OpenAI({
    apiKey: config.apiKey,
    timeout: resolveTimeoutMs(),
    maxRetries: 0, // Only our explicit retry policy applies.
  });
  const defaultModel = config.defaultModel;

  const estimatedCost = (params: Parameters<typeof responseCostBound>[0], response: OpenAI.Responses.Response) => {
    const bound = responseCostBound(params);
    if (!bound?.rates || !response.usage) return null;
    const cached = response.usage.input_tokens_details?.cached_tokens ?? 0;
    const longContext = ["gpt-5.4", "gpt-6-astra", "gpt-5.6-sol"].includes(String(params.model)) && response.usage.input_tokens > 272000;
    return (((response.usage.input_tokens - cached) * (bound.cacheWriteFactor ?? 1) + cached / 10) * bound.rates[0] * (longContext ? 2 : 1) + response.usage.output_tokens * bound.rates[1] * (longContext ? 1.5 : 1)) / 1e6;
  };

  const audit = async (startedAt: string, params: unknown, response: OpenAI.Responses.Response) => {
    const auditDir = process.env.IMX_LLM_AUDIT_DIR;
    if (!auditDir) return;
    await mkdir(auditDir, { recursive: true });
    await writeFile(path.join(auditDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ started_at: startedAt, ended_at: new Date().toISOString(), request: params, response: { id: response.id, model: response.model, status: response.status, incomplete_details: response.incomplete_details, usage: response.usage, output_text: response.output_text } }, null, 2));
  };

  async function request(params: Parameters<typeof client.responses.create>[0], attribution?: LlmUsageAttribution) {
    const limit = Number(process.env.IMX_LLM_RUN_BUDGET_USD);
    const bound = responseCostBound(params as Parameters<typeof responseCostBound>[0]);
    const rates = bound?.rates ?? null;
    const reserved = bound?.maximumUsd ?? null;
    if (limit > 0 && (reserved === null || reservedApiUsd + reserved > limit)) throw new Error("LLM_BUDGET_BLOCKED: llamada no autorizada por el limite preventivo.");
    if (limit > 0) reservedApiUsd += reserved!;
    const startedAt = new Date().toISOString();
    if (reserved === null) throw new Error("LLM_BUDGET_BLOCKED: modelo o limite sin tarifa verificable.");
    const purpose = (params.text?.format as { name?: string } | undefined)?.name ?? "text";
    const reservation = await reservePaidCall(purpose, String(params.model), reserved, attribution);
    let response: OpenAI.Responses.Response;
    try { response = await client.responses.create(params as any) as OpenAI.Responses.Response; }
    catch (error) { await reservation?.fail(); throw error; }
    let estimatedUsd: number | null = null;
    if (reservation && rates && response.usage) {
      estimatedUsd = estimatedCost(params as Parameters<typeof responseCostBound>[0], response);
      if (estimatedUsd === null) await reservation.fail();
      else await reservation.complete(estimatedUsd, response.usage, response.model);
    } else await reservation?.fail();
    if (limit > 0 && estimatedUsd !== null) reservedApiUsd += estimatedUsd - reserved!;
    await audit(startedAt, params, response);
    return response;
  }

  return {
    name: "openai",
    async generateStructuredObject<T>(input: StructuredObjectInput) {
      const model = input.model ?? defaultModel;
      const response = await runWithTimeoutAndRetry(() =>
        request({
          model,
          ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
          store: false,
          max_output_tokens: resolveMaxOutputTokens(input.maxOutputTokens),
          input: input.prompt,
          text: {
            format: {
              type: "json_schema",
              name: input.schemaName,
              strict: true,
              schema: input.schema,
            },
          },
        }, input.trackingAttribution),
      );
      const usage = requireUsage(response);

      await recordLlmUsage({
        provider: "openai",
        model: response.model,
        operation: input.trackingLabel ?? `structured:${input.schemaName}`,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        attribution: input.trackingAttribution,
      });

      if (response.status === "incomplete") throw new IncompleteStructuredOutputError(response.output_text ?? "", response.incomplete_details?.reason ?? "unknown");
      if (!response.output_text) {
        throw new Error("OpenAI no devolvio contenido estructurado.");
      }

      return JSON.parse(response.output_text) as T;
    },
    async generateBackgroundStructuredObject<T>(input: BackgroundStructuredObjectInput) {
      if (!currentJobExecution()) throw new Error("PERSISTENT_BACKGROUND_CONTEXT_REQUIRED");
      const model = input.model ?? defaultModel;
      const params = backgroundStructuredParams(input, model) as Parameters<typeof client.responses.create>[0];
      const bound = responseCostBound(params as Parameters<typeof responseCostBound>[0]);
      if (!bound) throw new Error("LLM_BUDGET_BLOCKED: modelo o limite sin tarifa verificable.");
      const expectedFingerprint = openAiBackgroundRequestFingerprint({ ...input, model });
      if (expectedFingerprint !== input.requestFingerprint) throw new Error("BACKGROUND_REQUEST_FINGERPRINT_MISMATCH");
      const claim = await claimBackgroundProviderResponse({ provider: "openai", model, logicalAttemptKey: input.logicalAttemptKey, requestFingerprint: input.requestFingerprint, reservedCost: bound.maximumUsd, correlation: input.trackingAttribution ?? null });
      let record = claim.record;
      let reservation: Awaited<ReturnType<typeof reservePaidCall>> | null = null;
      let response: OpenAI.Responses.Response | null = null;
      const startedAt = record.createdAt;

      if (claim.created) {
        try {
          const processLimit = Number(process.env.IMX_LLM_RUN_BUDGET_USD);
          if (processLimit > 0 && reservedApiUsd + bound.maximumUsd > processLimit) throw new Error("LLM_BUDGET_BLOCKED: llamada no autorizada por el limite preventivo.");
          if (processLimit > 0) reservedApiUsd += bound.maximumUsd;
          reservation = await reservePaidCall(input.schemaName, model, bound.maximumUsd, input.trackingAttribution);
          record = await updateBackgroundProviderResponse(input.logicalAttemptKey, { status: "DISPATCHING", reservationId: reservation.durableReservationId });
          response = await client.responses.create(params as any) as OpenAI.Responses.Response;
          record = await updateBackgroundProviderResponse(input.logicalAttemptKey, { responseId: response.id, providerStatus: response.status ?? null, status: response.status === "completed" ? "PENDING" : "PENDING" });
        } catch (error) {
          if (response?.id) await updateBackgroundProviderResponse(input.logicalAttemptKey, { responseId: response.id, providerStatus: response.status ?? null, status: "PENDING" }).catch(() => undefined);
          else await updateBackgroundProviderResponse(input.logicalAttemptKey, { status: "CREATE_UNCERTAIN", error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
          await reservation?.fail();
          throw error;
        }
      } else if (record.status === "COMPLETED" && record.outputText) {
        return JSON.parse(record.outputText) as T;
      } else if (!record.responseId) {
        throw new Error(`BACKGROUND_CREATE_STATE_UNCERTAIN:${record.status}`);
      }

      const responseId = response?.id ?? record.responseId!;
      const initialMs = Math.max(250, (input.initialPollSeconds ?? 2) * 1000);
      const maxMs = Math.max(initialMs, (input.maxPollSeconds ?? 15) * 1000);
      const waitMaxMs = Math.max(0, (input.totalWaitSeconds ?? 900) * 1000);
      const deadline = Date.now() + waitMaxMs;
      let interval = initialMs;
      while (!response || response.status === "queued" || response.status === "in_progress") {
        if (Date.now() >= deadline) throw new ProviderResponsePendingError(responseId, response?.status ?? record.providerStatus ?? "unknown");
        await delay(Math.min(interval, Math.max(0, deadline - Date.now())));
        response = await client.responses.retrieve(responseId);
        record = await updateBackgroundProviderResponse(input.logicalAttemptKey, { providerStatus: response.status ?? null, status: response.status === "queued" || response.status === "in_progress" ? "PENDING" : response.status === "completed" ? "PENDING" : response.status === "cancelled" ? "CANCELLED" : response.status === "incomplete" ? "INCOMPLETE" : "FAILED" });
        interval = Math.min(maxMs, Math.ceil(interval * 1.6));
      }

      const cost = estimatedCost(params as Parameters<typeof responseCostBound>[0], response);
      if (cost !== null && response.usage) {
        if (reservation) await reservation.complete(cost, response.usage, response.model);
        else if (record.reservationId) await settleCurrentJobCall(record.reservationId, cost, response.usage, response.model);
      } else {
        if (reservation) await reservation.fail();
        else if (record.reservationId) await settleCurrentJobCall(record.reservationId, null, null, response.model);
      }
      if (claim.created && Number(process.env.IMX_LLM_RUN_BUDGET_USD) > 0 && cost !== null) reservedApiUsd += cost - bound.maximumUsd;
      await audit(startedAt, params, response);
      if (response.usage) {
        const usage = requireUsage(response);
        await recordLlmUsage({ provider: "openai", model: response.model, operation: input.trackingLabel ?? `structured:${input.schemaName}`, inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens, attribution: { ...(input.trackingAttribution ?? {}), requestId: response.id } });
      }
      if (response.status === "incomplete") {
        await updateBackgroundProviderResponse(input.logicalAttemptKey, { status: "INCOMPLETE", providerStatus: response.status, outputText: response.output_text ?? "", usage: response.usage ?? null, actualModel: response.model, error: response.incomplete_details?.reason ?? "incomplete" });
        throw new IncompleteStructuredOutputError(response.output_text ?? "", response.incomplete_details?.reason ?? "unknown");
      }
      if (response.status !== "completed") {
        const status = response.status === "cancelled" ? "CANCELLED" : "FAILED";
        await updateBackgroundProviderResponse(input.logicalAttemptKey, { status, providerStatus: response.status ?? null, usage: response.usage ?? null, actualModel: response.model, error: `OPENAI_BACKGROUND_${String(response.status).toUpperCase()}` });
        throw new Error(`OPENAI_BACKGROUND_${String(response.status).toUpperCase()}`);
      }
      if (!response.output_text) throw new Error("OpenAI no devolvio contenido estructurado.");
      await updateBackgroundProviderResponse(input.logicalAttemptKey, { status: "COMPLETED", providerStatus: response.status, outputText: response.output_text, usage: response.usage ?? null, actualModel: response.model, error: null });
      return JSON.parse(response.output_text) as T;
    },
    async generateVisionStructuredObject<T>(input: VisionStructuredObjectInput) {
      const model = input.model ?? defaultModel;
      const imageBuffer = await readFile(input.imagePath);
      const mimeType = input.imageMimeType ?? "image/png";
      const response = await runWithTimeoutAndRetry(() =>
        request({
          model,
          ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
          store: false,
          max_output_tokens: resolveMaxOutputTokens(input.maxOutputTokens),
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: input.prompt },
                { type: "input_image", detail: "high", image_url: `data:${mimeType};base64,${imageBuffer.toString("base64")}` },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: input.schemaName,
              strict: true,
              schema: input.schema,
            },
          },
        } as unknown as Parameters<typeof client.responses.create>[0], input.trackingAttribution),
      ) as any;
      const usage = requireUsage(response);

      await recordLlmUsage({
        provider: "openai",
        model: response.model,
        operation: input.trackingLabel ?? `vision_structured:${input.schemaName}`,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        attribution: input.trackingAttribution,
      });

      if (!response.output_text) {
        throw new Error("OpenAI no devolvio contenido visual estructurado.");
      }

      return JSON.parse(response.output_text) as T;
    },
    async generateText(input: TextGenerationInput) {
      const detailed = await this.generateTextDetailed(input);
      return detailed.text;
    },
    async generateTextDetailed(input: TextGenerationInput): Promise<TextGenerationResult> {
      const model = input.model ?? defaultModel;
      const startedAt = Date.now();
      const response = await runWithTimeoutAndRetry(() =>
        request({
          model,
          ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
          store: false,
          max_output_tokens: resolveMaxOutputTokens(input.maxOutputTokens),
          input: input.prompt,
        }, input.trackingAttribution),
      );
      const usage = requireUsage(response);

      const usageResult = await recordLlmUsage({
        provider: "openai",
        model: response.model,
        operation: input.trackingLabel ?? "text_generation",
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        attribution: input.trackingAttribution,
      });

      if (!response.output_text) {
        throw new Error("OpenAI no devolvio texto.");
      }

      return {
        text: response.output_text,
        usage: {
          provider: usageResult.callRecord.provider,
          model: usageResult.callRecord.model,
          inputTokens: usageResult.callRecord.inputTokens,
          cachedInputTokens: usageResult.callRecord.cachedInputTokens,
          outputTokens: usageResult.callRecord.outputTokens,
          totalTokens: usageResult.callRecord.totalTokens,
          costUsd: usageResult.callRecord.costUsd,
          costCad: usageResult.callRecord.costCad,
          durationMs: Date.now() - startedAt,
        },
      };
    },
  };
}
