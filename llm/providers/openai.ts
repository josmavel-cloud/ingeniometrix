import OpenAI from "openai";
import { setTimeout as delay } from "node:timers/promises";

import { recordLlmUsage } from "@/server/llm-usage-registry";

import type {
  LlmProvider,
  StructuredObjectInput,
  TextGenerationResult,
  TextGenerationInput,
} from "../provider";

export type OpenAiProviderConfig = {
  apiKey: string;
  defaultModel: string;
};

const DEFAULT_OPENAI_TIMEOUT_MS = 120_000;
const DEFAULT_OPENAI_RETRIES = 1;

function resolveTimeoutMs() {
  const rawValue = Number.parseInt(process.env.LLM_REQUEST_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : DEFAULT_OPENAI_TIMEOUT_MS;
}

function resolveRetryCount() {
  const rawValue = Number.parseInt(process.env.LLM_REQUEST_MAX_RETRIES ?? "", 10);
  return Number.isFinite(rawValue) && rawValue >= 0 ? rawValue : DEFAULT_OPENAI_RETRIES;
}

async function runWithTimeoutAndRetry<T>(work: () => Promise<T>) {
  const timeoutMs = resolveTimeoutMs();
  const maxRetries = resolveRetryCount();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await Promise.race([
        work(),
        delay(timeoutMs).then(() => {
          throw new Error(`OpenAI excedio el timeout de ${timeoutMs} ms.`);
        }),
      ]);
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
  });
  const defaultModel = config.defaultModel;

  return {
    name: "openai",
    async generateStructuredObject<T>(input: StructuredObjectInput) {
      const model = input.model ?? defaultModel;
      const response = await runWithTimeoutAndRetry(() =>
        client.responses.create({
          model,
          store: false,
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

      await recordLlmUsage({
        provider: "openai",
        model,
        operation: input.trackingLabel ?? `structured:${input.schemaName}`,
        inputTokens: response.usage?.input_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });

      if (!response.output_text) {
        throw new Error("OpenAI no devolvio contenido estructurado.");
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
        client.responses.create({
          model,
          store: false,
          input: input.prompt,
        }),
      );

      const usageResult = await recordLlmUsage({
        provider: "openai",
        model,
        operation: input.trackingLabel ?? "text_generation",
        inputTokens: response.usage?.input_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
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
