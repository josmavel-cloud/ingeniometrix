import type { LlmProvider, StructuredObjectInput } from "@/llm/provider";
import { openAiBackgroundRequestFingerprint } from "@/llm/providers/openai";
import { currentJobExecution, fingerprint } from "./job-execution-context";

/** Section composition and review use the same durable response transport as
 * design. A foreground fixture remains supported outside a worker execution. */
export async function scientificStructuredCall<T>(provider: LlmProvider, input: StructuredObjectInput,
  identity: { projectId: string; runId: string }): Promise<T> {
  const execution = currentJobExecution();
  if (!execution || !provider.generateBackgroundStructuredObject)
    return provider.generateStructuredObject<T>({ ...input, maxRetries: 0 });
  if (!input.model) throw new Error("SCIENTIFIC_MODEL_REQUIRED");
  const requestFingerprint = openAiBackgroundRequestFingerprint({ ...input, model: input.model });
  return provider.generateBackgroundStructuredObject<T>({ ...input, maxRetries: 0, requestFingerprint,
    logicalAttemptKey: fingerprint({ version: "scientific-composition-background.v1", jobId: execution.jobId,
      ...identity, stage: execution.stage, requestFingerprint }) });
}
