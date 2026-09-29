import { DegreeLevel } from "@prisma/client";

import { getPresetDegreeLevelForProject } from "@/lib/degree-levels";
import { APP_DEFAULT_LANGUAGE, normalizeLanguageCode } from "@/lib/language";
import { buildProjectPresetSuggestionEntries, normalizeSearchText } from "@/lib/topic-suggestion-scoring";

import { generateQuickIdeaDraft } from "./quick-idea-draft-generator";
import { resolveAndRecordTopicArea } from "./topic-area-service";

type GenerateIdeaDraftsInput = {
  degreeLevel: DegreeLevel;
  country: string;
  language?: string | null;
  topicAreaId?: string | null;
  topicAreaLabel?: string | null;
  seedText?: string | null;
  existingTitles?: string[];
};

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

function fallbackDetails(input: GenerateIdeaDraftsInput, title: string): IdeaDraft {
  const language = normalizeLanguageCode(input.language) ?? APP_DEFAULT_LANGUAGE;
  const spanish = language !== "en";
  return {
    title,
    rationale: spanish
      ? "Direccion inicial editable y pendiente de validacion con evidencia."
      : "Editable initial direction pending evidence validation.",
    problem: spanish ? "Problema por delimitar en el Paso 2." : "Problem to delimit in Step 2.",
    objectOrPopulation: spanish ? "Unidad o poblacion por definir." : "Unit or population to define.",
    context: input.country,
    scientificApproach: spanish ? "Enfoque cientifico por confirmar." : "Scientific approach to confirm.",
    feasibility: spanish ? "Factibilidad por validar con datos y acceso." : "Feasibility to validate with data and access.",
    recentActivitySignal: spanish ? "Senal no verificada; requiere busqueda de evidencia." : "Unverified signal; evidence search required.",
    missingDecisions: spanish ? ["Delimitar problema", "Confirmar unidad de analisis"] : ["Delimit problem", "Confirm unit of analysis"],
  };
}

function buildFallbackSeed(input: GenerateIdeaDraftsInput) {
  if (input.seedText?.trim()) {
    return input.seedText.trim();
  }

  const language = normalizeLanguageCode(input.language) ?? APP_DEFAULT_LANGUAGE;

  return language === "en"
    ? `General applied research idea in ${input.topicAreaLabel ?? "an academic graduate area"}`
    : `Idea general de investigacion aplicada en ${input.topicAreaLabel ?? "un area academica de posgrado"}`;
}

export async function generateIdeaDrafts(input: GenerateIdeaDraftsInput) {
  const resolvedArea = await resolveAndRecordTopicArea({
    topicAreaId: input.topicAreaId,
    topicAreaLabel: input.topicAreaLabel,
  });
  const seedText = buildFallbackSeed({
    ...input,
    topicAreaLabel: resolvedArea.topicAreaLabel ?? input.topicAreaLabel ?? null,
  });
  const areaLabel = resolvedArea.topicAreaLabel ?? input.topicAreaLabel ?? null;
  const language = normalizeLanguageCode(input.language) ?? APP_DEFAULT_LANGUAGE;
  const existingTitles = Array.isArray(input.existingTitles)
    ? input.existingTitles
    : [];

  try {
    const bundle = await generateQuickIdeaDraft({
      degreeLevel: input.degreeLevel,
      country: input.country,
      language,
      areaLabel,
      seedText,
      mode: input.seedText?.trim() ? "REFINE" : "PROPOSE",
      existingTitles,
    });

    return {
      generatedIdea: bundle.generatedIdea,
      relatedIdeas: bundle.relatedIdeas,
      resolvedArea,
    };
  } catch {
    const fallbackSuggestions = buildProjectPresetSuggestionEntries({
      areaId: resolvedArea.topicAreaId,
      degreeLevel: getPresetDegreeLevelForProject(input.degreeLevel),
      interestText: seedText,
      limit: 5,
    }).map(
      (entry) =>
        ({
          ...fallbackDetails(input, entry.preset.title),
          rationale: entry.reasons[0] ?? fallbackDetails(input, entry.preset.title).rationale,
        }) satisfies IdeaDraft,
    );
    const normalizedExistingTitles = new Set(
      existingTitles.map((title) => normalizeSearchText(title)),
    );
    const uniqueFallbackIdeas = fallbackSuggestions.filter(
      (idea) => !normalizedExistingTitles.has(normalizeSearchText(idea.title)),
    );

    const allIdeas =
      uniqueFallbackIdeas.length > 0
        ? uniqueFallbackIdeas
        : [
            fallbackDetails(input, areaLabel
                ? language === "en"
                  ? `General proposal about ${areaLabel.toLowerCase()} in context ${input.country}`
                  : `Propuesta general sobre ${areaLabel.toLowerCase()} en el contexto ${input.country}`
                : seedText),
          ];
    const generatedIdea = allIdeas[0] ?? fallbackDetails(input, seedText);
    const relatedIdeas = allIdeas.slice(1, 3);

    return {
      generatedIdea,
      relatedIdeas,
      resolvedArea,
    };
  }
}
