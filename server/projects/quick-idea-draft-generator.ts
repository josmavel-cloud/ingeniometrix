import { QUICK_IDEA_DRAFT_GENERATOR_2_PROMPT } from "@/server/mvp/prompts/quick-idea-draft-generator.v2";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import ideaDraftBundleSchema from "@/ai/schemas/idea-draft-bundle.schema.json";
import { getLanguageInstruction, normalizeLanguageCode } from "@/lib/language";
import { getConfiguredLlmProvider } from "@/llm";

type IdeaDraft = {
  title: string;
  rationale: string;
  problem: string;
  objectOrPopulation: string;
  context: string;
  scientificApproach: string;
  feasibility: string;
  recentActivitySignal: string;
  missingDecisions: string[];
};

type QuickIdeaDraftGeneratorInput = {
  degreeLevel: string;
  country: string;
  language?: string | null;
  areaLabel: string | null;
  seedText: string;
  mode: "PROPOSE" | "REFINE";
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
    model:
      process.env.IMX_IDEA_MODEL?.trim() ||
      process.env.LLM_DEFAULT_MODEL?.trim() ||
      "gpt-5.4",
    prompt: renderVersionedPrompt(QUICK_IDEA_DRAFT_GENERATOR_2_PROMPT, {
      var_0: getLanguageInstruction(language),
      var_1: input.mode,
      var_2: input.degreeLevel,
      var_3: input.country,
      var_4: input.areaLabel ?? "No especificada",
      var_5: input.seedText.trim() || "Sin intencion previa; proponer opciones",
      var_6: existingIdeas,
    }).trim(),
    schemaName: "idea_draft_bundle",
    maxOutputTokens: 2600,
    trackingAttribution: { promptVersion: QUICK_IDEA_DRAFT_GENERATOR_2_PROMPT.version },
    schema: ideaDraftBundleSchema as Record<string, unknown>,
  });
}
