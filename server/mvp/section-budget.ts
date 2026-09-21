import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import { evidencePointerSchema } from "./research-plan-contracts";
import { SECTION_BUDGET_PROMPT as prompt } from "./prompts/section-budget.v2";
import { stageCheckpoint } from "./job-execution-context";
export const compactParagraphsSchema = z.object({ paragraphs: z.array(z.object({ text: z.string().min(1), citations: z.array(evidencePointerSchema) })).min(1) });
type Paragraphs = z.infer<typeof compactParagraphsSchema>["paragraphs"];
export const paragraphWordCount = (paragraphs: Paragraphs) => paragraphs.map((p) => p.text).join(" ").trim().split(/\s+/).filter(Boolean).length;
export async function compactSectionToBudget(input: { provider: LlmProvider; section: string; maxWords: number; paragraphs: Paragraphs; projectId: string; runId: string }) {
  if (paragraphWordCount(input.paragraphs) <= input.maxWords) return { paragraphs: input.paragraphs, prompt_record: null };
  const schema = z.toJSONSchema(compactParagraphsSchema);
  const pointers = (paragraphs: Paragraphs) => new Set(paragraphs.flatMap((p) => p.citations.map((c) => `${c.source_id}:${c.evidence_id}`)));
  const before = pointers(input.paragraphs);
  let result = { paragraphs: input.paragraphs }, attempts = 0;
  try {
  for (; attempts < 1; attempts++) {
    const context = { section: input.section, max_words: input.maxWords, target_words: Math.floor(input.maxWords * (attempts ? 0.7 : 0.85)), observed_words: paragraphWordCount(result.paragraphs), paragraphs: result.paragraphs };
    const actual = `${prompt.systemPrompt}\n\n${prompt.userPromptTemplate.replace("{{context_json}}", JSON.stringify(context))}`;
    result = await stageCheckpoint(`EDITORIAL:${input.section}`, { actual, schema, model: prompt.model, version: prompt.version }, async () => compactParagraphsSchema.parse(await input.provider.generateStructuredObject({ prompt: actual, schema, schemaName: `b3_compact_${input.section}`, model: prompt.model, maxOutputTokens: prompt.max_output_tokens, trackingAttribution: { projectId: input.projectId, runId: input.runId, promptVersion: prompt.version, stage: "blueprint_generation" } })));
    const after = pointers(result.paragraphs);
    if (before.size !== after.size || [...before].some((p) => !after.has(p))) throw new Error("SECTION_COMPACTION_CHANGED_EVIDENCE");
    if (paragraphWordCount(result.paragraphs) <= input.maxWords) { attempts++; break; }
  }
  } catch (error) {
    if (error instanceof Error && /CHANGED_EVIDENCE|LEASE_LOST/.test(error.message)) throw error;
    return { paragraphs: input.paragraphs, prompt_record: { ...prompt, section: input.section, attempts: attempts + 1, warning: `EDITORIAL_FALLBACK_ORIGINAL: ${error instanceof Error ? error.message : error}`, budget_unresolved: true } };
  }
  // Editorial work cannot invalidate complete scientific content.
  const unresolved = paragraphWordCount(result.paragraphs) > input.maxWords;
  return { paragraphs: result.paragraphs, prompt_record: { ...prompt, section: input.section, max_words: input.maxWords, schema, message_arrangement: "single concatenated Responses input", retry_policy: "one targeted compaction; original text retained on failure", attempts, budget_unresolved: unresolved, warning: unresolved ? "SECTION_TARGET_MISSED: complete content retained; length warning" : null, before_words: paragraphWordCount(input.paragraphs), after_words: paragraphWordCount(result.paragraphs) } };
}
