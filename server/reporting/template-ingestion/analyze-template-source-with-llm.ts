import { getConfiguredLlmProvider } from "@/llm";
import type { LlmProvider } from "@/llm/provider";
import {
  TEMPLATE_SOURCE_SEMANTIC_ANALYSIS_SCHEMA_NAME,
  templateSourceSemanticAnalysisSchema,
  type NormalizedTemplateSourceDocument,
  type TemplateSourceSemanticAnalysis,
} from "@/server/reporting/template-ingestion-types";

import { buildTemplateSourceAnalysisPrompt } from "./build-template-source-analysis-prompt";

export async function analyzeTemplateSourceWithLlm(input: {
  normalizedDocument: NormalizedTemplateSourceDocument;
  llmProvider?: LlmProvider;
  model?: string;
}) {
  const provider = input.llmProvider ?? getConfiguredLlmProvider();
  const resolvedModel = input.model ?? (process.env.LLM_FAST_MODEL?.trim() || undefined);
  const prompt = buildTemplateSourceAnalysisPrompt({
    normalizedDocument: input.normalizedDocument,
  });

  return provider.generateStructuredObject<TemplateSourceSemanticAnalysis>({
    prompt,
    schemaName: TEMPLATE_SOURCE_SEMANTIC_ANALYSIS_SCHEMA_NAME,
    schema: templateSourceSemanticAnalysisSchema,
    model: resolvedModel,
  });
}
