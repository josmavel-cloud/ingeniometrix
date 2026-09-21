import { QUICK_IDEA_DRAFT_GENERATOR_1_PROMPT } from "@/server/mvp/prompts/quick-idea-draft-generator.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import ideaDraftBundleSchema from "@/ai/schemas/idea-draft-bundle.schema.json";
import { getLanguageInstruction, normalizeLanguageCode } from "@/lib/language";
import { getConfiguredLlmProvider } from "@/llm";

type IdeaDraft = {
  title: string;
  rationale: string;
};

type QuickIdeaDraftGeneratorInput = {
  university: string;
  universityContext: string;
  degreeLevel: string;
  program: string;
  language?: string | null;
  areaLabel: string | null;
  seedText: string;
  existingTitles: string[];
};

type IdeaDraftBundle = {
  generatedIdea: IdeaDraft;
  relatedIdeas: IdeaDraft[];
};

export async function generateQuickIdeaDraft(
  input: QuickIdeaDraftGeneratorInput,
) {
  const provider = getConfiguredLlmProvider();
  const language = normalizeLanguageCode(input.language) ?? "es";
  const existingIdeas =
    input.existingTitles.length > 0
      ? input.existingTitles.map((title) => `- ${title}`).join("\n")
      : "- Sin ideas previas generadas";

  return provider.generateStructuredObject<IdeaDraftBundle>({
    model: process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini",
    prompt: renderVersionedPrompt(QUICK_IDEA_DRAFT_GENERATOR_1_PROMPT, { var_0: (getLanguageInstruction(language)), var_1: (input.university), var_2: (input.universityContext), var_3: (input.degreeLevel), var_4: (input.program), var_5: (input.areaLabel ?? "No especificada"), var_6: (input.seedText), var_7: (existingIdeas) }).trim(),
    schemaName: "idea_draft_bundle",
    trackingAttribution: { promptVersion: QUICK_IDEA_DRAFT_GENERATOR_1_PROMPT.version },
    schema: ideaDraftBundleSchema as Record<string, unknown>,
  });
}
