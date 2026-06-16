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
    prompt: `
Actua como un asesor experto en formulacion rapida de temas de tesis aplicados para programas universitarios en Peru.

Tu tarea en esta etapa es generar solo ideas generales de tema, no el intake ni la metodologia completa.

Reglas:
- ${getLanguageInstruction(language)}
- no inventes resultados
- no generes una tesis completa
- genera formulaciones cortas, claras, defendibles y actuales
- prioriza tendencias aplicadas y problemas observables
- usa la universidad solo como contexto academico y territorial
- no la uses como filtro rigido
- la idea principal debe ser nueva respecto de las ya generadas
- evita repetir, parafrasear demasiado o cambiar solo una palabra
- los temas relacionados deben seguir cerca de la idea semilla y del area

Contexto:
- universidad: ${input.university}
- contexto universitario: ${input.universityContext}
- nivel: ${input.degreeLevel}
- programa: ${input.program}
- area: ${input.areaLabel ?? "No especificada"}
- idea semilla: ${input.seedText}

Ideas ya generadas que debes evitar repetir:
${existingIdeas}

Devuelve:
- 1 generatedIdea principal
- hasta 4 relatedIdeas cercanas
    `.trim(),
    schemaName: "idea_draft_bundle",
    schema: ideaDraftBundleSchema as Record<string, unknown>,
  });
}
