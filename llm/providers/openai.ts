import OpenAI from "openai";
import { setTimeout as delay } from "node:timers/promises";

import type {
  LlmProvider,
  StructuredObjectInput,
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

  return {
    name: "openai",
    async generateStructuredObject<T>(input: StructuredObjectInput) {
      const response = await runWithTimeoutAndRetry(() =>
        client.responses.create({
          model: input.model ?? config.defaultModel,
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

      if (!response.output_text) {
        throw new Error("OpenAI no devolvio contenido estructurado.");
      }

      return JSON.parse(response.output_text) as T;
    },
    async generateText(input: TextGenerationInput) {
      const response = await runWithTimeoutAndRetry(() =>
        client.responses.create({
          model: input.model ?? config.defaultModel,
          store: false,
          input: input.prompt,
        }),
      );

      if (!response.output_text) {
        throw new Error("OpenAI no devolvio texto.");
      }

      return response.output_text;
    },
  };
}
