import type { LlmProvider } from "./provider";
import { createOpenAiProvider } from "./providers/openai";

export function getConfiguredLlmProvider(): LlmProvider {
  const providerName = process.env.LLM_PROVIDER?.trim().toLowerCase() ?? "openai";

  if (providerName !== "openai") {
    throw new Error(`Proveedor LLM no soportado en Release 0: ${providerName}.`);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY en el entorno local.");
  }

  return createOpenAiProvider({
    apiKey,
    defaultModel: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
  });
}
