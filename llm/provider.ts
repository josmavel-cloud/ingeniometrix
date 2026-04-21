export type StructuredObjectInput = {
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
};

export type TextGenerationInput = {
  prompt: string;
  model?: string;
};

export interface LlmProvider {
  readonly name: string;
  generateStructuredObject<T>(input: StructuredObjectInput): Promise<T>;
  generateText(input: TextGenerationInput): Promise<string>;
}
