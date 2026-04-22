import type { LlmProvider } from "@/llm/provider";
import type {
  ExtractedDocxSourceInput,
  ExtractedPdfNativeTextSourceInput,
  TemplateExtractionPipelineResult,
} from "@/server/reporting/template-ingestion-types";

import { analyzeTemplateSourceWithLlm } from "./analyze-template-source-with-llm";
import { completeTemplateAnalysisWithConventionalFallbacks } from "./complete-template-analysis-with-conventional-fallbacks";
import { deriveTemplateCandidate } from "./derive-template-candidate";
import { normalizeDocxTemplateSource } from "./normalize-docx-template-source";
import { normalizePdfNativeTemplateSource } from "./normalize-pdf-native-template-source";

type ExtractTemplateFromPdfNativeSourceInput = {
  sourceType: "pdf_native_text";
  source: ExtractedPdfNativeTextSourceInput;
  useLlmAnalysis?: boolean;
  llmRequired?: boolean;
  llmProvider?: LlmProvider;
  model?: string;
};

type ExtractTemplateFromDocxSourceInput = {
  sourceType: "docx";
  source: ExtractedDocxSourceInput;
  useLlmAnalysis?: boolean;
  llmRequired?: boolean;
  llmProvider?: LlmProvider;
  model?: string;
};

export async function extractTemplateFromSource(
  input: ExtractTemplateFromPdfNativeSourceInput | ExtractTemplateFromDocxSourceInput,
): Promise<TemplateExtractionPipelineResult> {
  const normalizedDocument =
    input.sourceType === "docx"
      ? normalizeDocxTemplateSource(input.source)
      : normalizePdfNativeTemplateSource(input.source);
  const pipelineWarnings: string[] = [];
  let semanticAnalysis = null;

  if (input.useLlmAnalysis ?? true) {
    try {
      const baseSemanticAnalysis = await analyzeTemplateSourceWithLlm({
        normalizedDocument,
        llmProvider: input.llmProvider,
        model: input.model,
      });
      semanticAnalysis = await completeTemplateAnalysisWithConventionalFallbacks({
        normalizedDocument,
        semanticAnalysis: baseSemanticAnalysis,
        llmProvider: input.llmProvider,
        model: input.model,
      });
    } catch (error) {
      if (input.llmRequired) {
        throw error;
      }

      pipelineWarnings.push(
        error instanceof Error
          ? `El analisis semantico con OpenAI fallo y se uso solo la extraccion determinista: ${error.message}`
          : "El analisis semantico con OpenAI fallo y se uso solo la extraccion determinista.",
      );
    }
  }

  const templateCandidate = deriveTemplateCandidate({
    normalizedDocument,
    semanticAnalysis,
    pipelineWarnings,
  });

  return {
    normalizedDocument,
    semanticAnalysis,
    templateCandidate,
  };
}
