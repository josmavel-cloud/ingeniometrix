import { DegreeLevel } from "@prisma/client";

import { getPresetDegreeLevelForProject } from "@/lib/degree-levels";
import { APP_DEFAULT_LANGUAGE, normalizeLanguageCode } from "@/lib/language";
import { buildProjectPresetSuggestionEntries, normalizeSearchText } from "@/lib/topic-suggestion-scoring";
import {
  buildUniversityResearchContext,
  getUniversityDisplayNameByCode,
  type ProjectTemplateKey,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";

import { generateQuickIdeaDraft } from "./quick-idea-draft-generator";
import { resolveAndRecordTopicArea } from "./topic-area-service";

type GenerateIdeaDraftsInput = {
  degreeLevel: DegreeLevel;
  university: ProjectUniversityCode;
  program: string;
  language?: string | null;
  templateKey: ProjectTemplateKey;
  topicAreaId?: string | null;
  topicAreaLabel?: string | null;
  seedText?: string | null;
  existingTitles?: string[];
};

type IdeaDraft = {
  title: string;
  rationale: string;
};

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
  const universityContext = buildUniversityResearchContext(input.university);
  const language = normalizeLanguageCode(input.language) ?? APP_DEFAULT_LANGUAGE;
  const existingTitles = Array.isArray(input.existingTitles)
    ? input.existingTitles
    : [];

  try {
    const bundle = await generateQuickIdeaDraft({
      university: getUniversityDisplayNameByCode(input.university),
      universityContext: universityContext.contextSummary,
      degreeLevel: input.degreeLevel,
      program: input.program,
      language,
      areaLabel,
      seedText,
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
      university: input.university,
      templateKey: input.templateKey,
      interestText: seedText,
      limit: 5,
    }).map(
      (entry) =>
        ({
          title: entry.preset.title,
          rationale:
            entry.reasons[0] ??
            (language === "en"
              ? "Brief idea related to your area."
              : "Idea breve relacionada con tu area."),
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
            {
              title: areaLabel
                ? language === "en"
                  ? `General proposal about ${areaLabel.toLowerCase()} in the Peruvian context`
                  : `Propuesta general sobre ${areaLabel.toLowerCase()} en contexto peruano`
                : seedText,
              rationale:
                language === "en"
                  ? "Fallback base idea so you can start and edit it manually."
                  : "Idea base generada como respaldo para que puedas arrancar y editarla manualmente.",
            },
          ];
    const generatedIdea = allIdeas[0] ?? {
      title: seedText,
      rationale:
        language === "en"
          ? "Fallback base idea so you can start and edit it manually."
          : "Idea base generada como respaldo para que puedas arrancar y editarla manualmente.",
    };
    const relatedIdeas = allIdeas.slice(1, 5);

    return {
      generatedIdea,
      relatedIdeas,
      resolvedArea,
    };
  }
}
