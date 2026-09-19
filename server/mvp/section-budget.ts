import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import { evidencePointerSchema } from "./research-plan-contracts";
import { SECTION_BUDGET_PROMPT as prompt } from "./prompts/section-budget.v2";
export const compactParagraphsSchema = z.object({ paragraphs: z.array(z.object({ text: z.string().min(1), citations: z.array(evidencePointerSchema) })).min(1) });
type Paragraphs = z.infer<typeof compactParagraphsSchema>["paragraphs"];
export const paragraphWordCount = (paragraphs: Paragraphs) => paragraphs.map((p) => p.text).join(" ").trim().split(/\s+/).filter(Boolean).length;
export async function compactSectionToBudget(input: { provider: LlmProvider; section: string; maxWords: number; paragraphs: Paragraphs; projectId: string; runId: string }) {
  if (paragraphWordCount(input.paragraphs) <= input.maxWords) return { paragraphs: input.paragraphs, prompt_record: null };
  const schema = z.toJSONSchema(compactParagraphsSchema);
  const pointers = (paragraphs: Paragraphs) => new Set(paragraphs.flatMap((p) => p.citations.map((c) => `${c.source_id}:${c.evidence_id}`)));
  const before = pointers(input.paragraphs);
  let result = { paragraphs: input.paragraphs }, attempts = 0;
  for (; attempts < 2; attempts++) {
    const context = { section: input.section, max_words: input.maxWords, target_words: Math.floor(input.maxWords * (attempts ? 0.7 : 0.85)), observed_words: paragraphWordCount(result.paragraphs), paragraphs: result.paragraphs };
    const actual = `${prompt.systemPrompt}\n\n${prompt.userPromptTemplate.replace("{{context_json}}", JSON.stringify(context))}`;
    result = compactParagraphsSchema.parse(await input.provider.generateStructuredObject({ prompt: actual, schema, schemaName: `b3_compact_${input.section}`, model: prompt.model, maxOutputTokens: prompt.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: prompt.version, stage: "blueprint_generation" } }));
    const after = pointers(result.paragraphs);
    if (before.size !== after.size || [...before].some((p) => !after.has(p))) throw new Error("SECTION_COMPACTION_CHANGED_EVIDENCE");
    if (paragraphWordCount(result.paragraphs) <= input.maxWords) { attempts++; break; }
  }
  // Section targets are editorial, not scientific gates. Preserve complete reasoning if
  // two bounded attempts miss the target; the measured PDF hard limit still blocks export.
  const unresolved = paragraphWordCount(result.paragraphs) > input.maxWords;
  return { paragraphs: result.paragraphs, prompt_record: { ...prompt, section: input.section, max_words: input.maxWords, schema, message_arrangement: "single concatenated Responses input", retry_policy: "one compaction plus at most one measured over-budget repair; each pre-reserved", attempts, budget_unresolved: unresolved, warning: unresolved ? "SECTION_TARGET_MISSED: complete content retained; PDF hard limit remains enforced" : null, before_words: paragraphWordCount(input.paragraphs), after_words: paragraphWordCount(result.paragraphs) } };
}
