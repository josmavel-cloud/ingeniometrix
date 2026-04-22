import { getConfiguredLlmProvider } from "@/llm";
import type { LlmProvider } from "@/llm/provider";
import {
  TEMPLATE_SOURCE_CONVENTIONAL_FALLBACKS_SCHEMA_NAME,
  templateSourceConventionalFallbacksSchema,
  type NormalizedTemplateSourceDocument,
  type TemplateSourceConventionalFallbacks,
  type TemplateSourceSemanticAnalysis,
} from "@/server/reporting/template-ingestion-types";

import { buildTemplateConventionalFallbacksPrompt } from "./build-template-conventional-fallbacks-prompt";

function needsConventionalFallbacks(analysis: TemplateSourceSemanticAnalysis) {
  return (
    analysis.citation_style_guess === "UNKNOWN" ||
    analysis.methodology_mode === "unknown" ||
    analysis.element_rule_candidates.page.paper_size == null ||
    analysis.element_rule_candidates.paragraph.font_family == null ||
    analysis.element_rule_candidates.paragraph.font_size_pt == null ||
    analysis.element_rule_candidates.paragraph.line_spacing == null ||
    analysis.element_rule_candidates.equation.alignment == null ||
    analysis.element_rule_candidates.table.source_note_required == null ||
    analysis.element_rule_candidates.figure.source_note_required == null ||
    analysis.element_rule_candidates.caption.prefix_style == null ||
    analysis.element_rule_candidates.citation.inline_style == null ||
    analysis.element_rule_candidates.reference_list.ordering == null
  );
}

export async function completeTemplateAnalysisWithConventionalFallbacks(input: {
  normalizedDocument: NormalizedTemplateSourceDocument;
  semanticAnalysis: TemplateSourceSemanticAnalysis;
  llmProvider?: LlmProvider;
  model?: string;
}) {
  if (!needsConventionalFallbacks(input.semanticAnalysis)) {
    return input.semanticAnalysis;
  }

  const provider = input.llmProvider ?? getConfiguredLlmProvider();
  const resolvedModel = input.model ?? (process.env.LLM_FAST_MODEL?.trim() || undefined);
  const prompt = buildTemplateConventionalFallbacksPrompt({
    normalizedDocument: input.normalizedDocument,
    semanticAnalysis: input.semanticAnalysis,
  });

  const fallback = await provider.generateStructuredObject<TemplateSourceConventionalFallbacks>({
    prompt,
    schemaName: TEMPLATE_SOURCE_CONVENTIONAL_FALLBACKS_SCHEMA_NAME,
    schema: templateSourceConventionalFallbacksSchema,
    model: resolvedModel,
  });

  return {
    ...input.semanticAnalysis,
    citation_style_guess:
      input.semanticAnalysis.citation_style_guess !== "UNKNOWN"
        ? input.semanticAnalysis.citation_style_guess
        : fallback.citation_style_guess,
    methodology_mode:
      input.semanticAnalysis.methodology_mode !== "unknown"
        ? input.semanticAnalysis.methodology_mode
        : fallback.methodology_mode,
    element_rule_candidates: {
      ...input.semanticAnalysis.element_rule_candidates,
      page: {
        paper_size:
          input.semanticAnalysis.element_rule_candidates.page.paper_size ??
          fallback.element_rule_candidates.page.paper_size,
        margin_left_cm:
          input.semanticAnalysis.element_rule_candidates.page.margin_left_cm ??
          fallback.element_rule_candidates.page.margin_left_cm,
        margin_right_cm:
          input.semanticAnalysis.element_rule_candidates.page.margin_right_cm ??
          fallback.element_rule_candidates.page.margin_right_cm,
        margin_top_cm:
          input.semanticAnalysis.element_rule_candidates.page.margin_top_cm ??
          fallback.element_rule_candidates.page.margin_top_cm,
        margin_bottom_cm:
          input.semanticAnalysis.element_rule_candidates.page.margin_bottom_cm ??
          fallback.element_rule_candidates.page.margin_bottom_cm,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.page.confidence,
          fallback.element_rule_candidates.page.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.page.notes ?? []),
          ...(fallback.element_rule_candidates.page.notes ?? []),
        ],
      },
      paragraph: {
        font_family:
          input.semanticAnalysis.element_rule_candidates.paragraph.font_family ??
          fallback.element_rule_candidates.paragraph.font_family,
        font_size_pt:
          input.semanticAnalysis.element_rule_candidates.paragraph.font_size_pt ??
          fallback.element_rule_candidates.paragraph.font_size_pt,
        line_spacing:
          input.semanticAnalysis.element_rule_candidates.paragraph.line_spacing ??
          fallback.element_rule_candidates.paragraph.line_spacing,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.paragraph.confidence,
          fallback.element_rule_candidates.paragraph.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.paragraph.notes ?? []),
          ...(fallback.element_rule_candidates.paragraph.notes ?? []),
        ],
      },
      equation: {
        numbering:
          input.semanticAnalysis.element_rule_candidates.equation.numbering ??
          fallback.element_rule_candidates.equation.numbering,
        alignment:
          input.semanticAnalysis.element_rule_candidates.equation.alignment ??
          fallback.element_rule_candidates.equation.alignment,
        reference_style:
          input.semanticAnalysis.element_rule_candidates.equation.reference_style ??
          fallback.element_rule_candidates.equation.reference_style,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.equation.confidence,
          fallback.element_rule_candidates.equation.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.equation.notes ?? []),
          ...(fallback.element_rule_candidates.equation.notes ?? []),
        ],
      },
      table: {
        caption_position:
          input.semanticAnalysis.element_rule_candidates.table.caption_position ??
          fallback.element_rule_candidates.table.caption_position,
        numbering:
          input.semanticAnalysis.element_rule_candidates.table.numbering ??
          fallback.element_rule_candidates.table.numbering,
        allow_vertical_lines:
          input.semanticAnalysis.element_rule_candidates.table.allow_vertical_lines ??
          fallback.element_rule_candidates.table.allow_vertical_lines,
        source_note_required:
          input.semanticAnalysis.element_rule_candidates.table.source_note_required ??
          fallback.element_rule_candidates.table.source_note_required,
        note_position:
          input.semanticAnalysis.element_rule_candidates.table.note_position ??
          fallback.element_rule_candidates.table.note_position,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.table.confidence,
          fallback.element_rule_candidates.table.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.table.notes ?? []),
          ...(fallback.element_rule_candidates.table.notes ?? []),
        ],
      },
      figure: {
        caption_position:
          input.semanticAnalysis.element_rule_candidates.figure.caption_position ??
          fallback.element_rule_candidates.figure.caption_position,
        numbering:
          input.semanticAnalysis.element_rule_candidates.figure.numbering ??
          fallback.element_rule_candidates.figure.numbering,
        source_note_required:
          input.semanticAnalysis.element_rule_candidates.figure.source_note_required ??
          fallback.element_rule_candidates.figure.source_note_required,
        note_position:
          input.semanticAnalysis.element_rule_candidates.figure.note_position ??
          fallback.element_rule_candidates.figure.note_position,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.figure.confidence,
          fallback.element_rule_candidates.figure.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.figure.notes ?? []),
          ...(fallback.element_rule_candidates.figure.notes ?? []),
        ],
      },
      caption: {
        prefix_style:
          input.semanticAnalysis.element_rule_candidates.caption.prefix_style ??
          fallback.element_rule_candidates.caption.prefix_style,
        separator:
          input.semanticAnalysis.element_rule_candidates.caption.separator ??
          fallback.element_rule_candidates.caption.separator,
        font_style:
          input.semanticAnalysis.element_rule_candidates.caption.font_style ??
          fallback.element_rule_candidates.caption.font_style,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.caption.confidence,
          fallback.element_rule_candidates.caption.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.caption.notes ?? []),
          ...(fallback.element_rule_candidates.caption.notes ?? []),
        ],
      },
      citation: {
        inline_style:
          input.semanticAnalysis.element_rule_candidates.citation.inline_style ??
          fallback.element_rule_candidates.citation.inline_style,
        numbering:
          input.semanticAnalysis.element_rule_candidates.citation.numbering ??
          fallback.element_rule_candidates.citation.numbering,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.citation.confidence,
          fallback.element_rule_candidates.citation.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.citation.notes ?? []),
          ...(fallback.element_rule_candidates.citation.notes ?? []),
        ],
      },
      reference_list: {
        ordering:
          input.semanticAnalysis.element_rule_candidates.reference_list.ordering ??
          fallback.element_rule_candidates.reference_list.ordering,
        confidence: Math.max(
          input.semanticAnalysis.element_rule_candidates.reference_list.confidence,
          fallback.element_rule_candidates.reference_list.confidence,
        ),
        notes: [
          ...(input.semanticAnalysis.element_rule_candidates.reference_list.notes ?? []),
          ...(fallback.element_rule_candidates.reference_list.notes ?? []),
        ],
      },
    },
    warnings: Array.from(new Set([...input.semanticAnalysis.warnings, ...fallback.warnings])),
    review_notes: Array.from(
      new Set([...input.semanticAnalysis.review_notes, ...fallback.review_notes]),
    ),
  };
}
