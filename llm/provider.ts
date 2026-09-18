import type { LlmUsageAttribution } from "@/server/llm-usage-registry";

export type StructuredObjectInput = {
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
  trackingLabel?: string;
  trackingAttribution?: LlmUsageAttribution;
};

export type VisionStructuredObjectInput = StructuredObjectInput & {
  imagePath: string;
  imageMimeType?: "image/png" | "image/jpeg" | "image/webp";
};

export type TextGenerationInput = {
  prompt: string;
  model?: string;
  trackingLabel?: string;
  trackingAttribution?: LlmUsageAttribution;
};

export type TextGenerationResult = {
  text: string;
  usage: {
    provider: string;
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    costCad: number;
    durationMs: number;
  };
};

export interface LlmProvider {
  readonly name: string;
  generateStructuredObject<T>(input: StructuredObjectInput): Promise<T>;
  generateVisionStructuredObject?<T>(input: VisionStructuredObjectInput): Promise<T>;
  generateText(input: TextGenerationInput): Promise<string>;
  generateTextDetailed(input: TextGenerationInput): Promise<TextGenerationResult>;
}
