import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { recordLlmUsage } from "@/server/llm-usage-registry";

import type {
  LlmProvider,
  StructuredObjectInput,
  TextGenerationResult,
  TextGenerationInput,
  VisionStructuredObjectInput,
} from "../provider";

export type OpenAiProviderConfig = {
  apiKey: string;
  defaultModel: string;
};

const DEFAULT_OPENAI_TIMEOUT_MS = 120_000;
const DEFAULT_OPENAI_RETRIES = 1;
let reservedApiUsd = 0; // Shared by provider instances in one bounded evaluation process.

function resolveTimeoutMs() {
  const rawValue = Number.parseInt(process.env.LLM_REQUEST_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : DEFAULT_OPENAI_TIMEOUT_MS;
}

function resolveRetryCount() {
  const rawValue = Number.parseInt(process.env.LLM_REQUEST_MAX_RETRIES ?? "", 10);
  return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : DEFAULT_OPENAI_RETRIES;
}

function resolveMaxOutputTokens(explicitValue?: number) {
  const candidate = explicitValue ?? Number.parseInt(process.env.LLM_MAX_OUTPUT_TOKENS ?? "", 10);
  return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : undefined;
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
      return await work(); // SDK timeout aborts the request; no orphan Promise.race request.
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
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
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: resolveTimeoutMs(),
    maxRetries: 0, // Only our explicit retry policy applies.
  });
  const defaultModel = config.defaultModel;

  async function request(params: Parameters<typeof client.responses.create>[0]) {
    const limit = Number(process.env.IMX_LLM_RUN_BUDGET_USD);
    const rates = params.model === "gpt-5.4" ? [2.5, 15] : params.model === "gpt-5.4-mini" ? [0.75, 4.5] : params.model === "gpt-5.4-nano" ? [0.2, 1.25] : null;
    // UTF-8 bytes conservatively bound input tokens, plus schema/request overhead.
    const reserved = rates && params.max_output_tokens ? ((Buffer.byteLength(JSON.stringify(params)) + 2048) * rates[0] + params.max_output_tokens * rates[1]) / 1e6 : null;
    if (limit > 0 && (reserved === null || reservedApiUsd + reserved > limit)) throw new Error("LLM_BUDGET_BLOCKED: llamada no autorizada por el limite preventivo.");
    if (limit > 0) reservedApiUsd += reserved!;
    const startedAt = new Date().toISOString();
    const response = await client.responses.create(params as any) as OpenAI.Responses.Response;
    if (limit > 0 && rates && response.usage) reservedApiUsd += (response.usage.input_tokens * rates[0] + response.usage.output_tokens * rates[1]) / 1e6 - reserved!;
    const auditDir = process.env.IMX_LLM_AUDIT_DIR;
    if (auditDir) {
      await mkdir(auditDir, { recursive: true });
      await writeFile(path.join(auditDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ started_at: startedAt, ended_at: new Date().toISOString(), request: params, response: { id: response.id, model: response.model, status: response.status, incomplete_details: response.incomplete_details, usage: response.usage, output_text: response.output_text } }, null, 2));
    }
    return response;
  }

  return {
    name: "openai",
    async generateStructuredObject<T>(input: StructuredObjectInput) {
      const model = input.model ?? defaultModel;
      const response = await runWithTimeoutAndRetry(() =>
        request({
          model,
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
        }),
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

      if (!response.output_text) {
        throw new Error("OpenAI no devolvio contenido estructurado.");
      }

      return JSON.parse(response.output_text) as T;
    },
    async generateVisionStructuredObject<T>(input: VisionStructuredObjectInput) {
      const model = input.model ?? defaultModel;
      const imageBuffer = await readFile(input.imagePath);
      const mimeType = input.imageMimeType ?? "image/png";
      const response = await runWithTimeoutAndRetry(() =>
        request({
          model,
          store: false,
          max_output_tokens: resolveMaxOutputTokens(input.maxOutputTokens),
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: input.prompt },
                { type: "input_image", image_url: `data:${mimeType};base64,${imageBuffer.toString("base64")}` },
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
        } as unknown as Parameters<typeof client.responses.create>[0]),
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
          store: false,
          max_output_tokens: resolveMaxOutputTokens(input.maxOutputTokens),
          input: input.prompt,
        }),
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
