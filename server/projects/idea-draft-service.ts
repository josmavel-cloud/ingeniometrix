import { DegreeLevel } from "@prisma/client";

import { getPresetDegreeLevelForProject } from "@/lib/degree-levels";
import { buildProjectPresetSuggestionEntries, normalizeSearchText } from "@/lib/topic-suggestion-scoring";
import { getUniversityDisplayNameByCode, type ProjectTemplateKey, type ProjectUniversityCode } from "@/lib/peru-universities";

import { generateTopicSuggestionsInRealTime } from "./topic-suggestion-generator";
import { resolveAndRecordTopicArea } from "./topic-area-service";

type GenerateIdeaDraftsInput = {
  degreeLevel: DegreeLevel;
  university: ProjectUniversityCode;
  program: string;
  templateKey: ProjectTemplateKey;
  topicAreaId?: string | null;
  topicAreaLabel?: string | null;
  seedText?: string | null;
};

type IdeaDraft = {
  title: string;
  rationale: string;
};

function buildFallbackSeed(input: GenerateIdeaDraftsInput) {
  if (input.seedText?.trim()) {
    return input.seedText.trim();
  }

  return `Idea general de investigacion aplicada en ${input.topicAreaLabel ?? "un area academica de posgrado"}`;
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

  try {
    const suggestions = await generateTopicSuggestionsInRealTime({
      university: getUniversityDisplayNameByCode(input.university),
      degreeLevel: input.degreeLevel,
      program: input.program,
      areaLabel,
      seedText,
      taxonomyHints: areaLabel ? [areaLabel] : [],
    });

    return {
      generatedIdea: suggestions[0]?.title ?? seedText,
      relatedIdeas: suggestions.map(
        (suggestion) =>
          ({
            title: suggestion.title,
            rationale: suggestion.rationale,
          }) satisfies IdeaDraft,
      ),
      resolvedArea,
    };
  } catch {
    const fallbackSuggestions = buildProjectPresetSuggestionEntries({
      areaId: resolvedArea.topicAreaId,
      degreeLevel: getPresetDegreeLevelForProject(input.degreeLevel),
      university: input.university,
      templateKey: input.templateKey,
      interestText: seedText,
      limit: 3,
    }).map(
      (entry) =>
        ({
          title: entry.preset.title,
          rationale: entry.reasons[0] ?? "Idea breve relacionada con tu area.",
        }) satisfies IdeaDraft,
    );

    const relatedIdeas =
      fallbackSuggestions.length > 0
        ? fallbackSuggestions
        : [
            {
              title: areaLabel
                ? `Propuesta general sobre ${areaLabel.toLowerCase()} en contexto peruano`
                : seedText,
              rationale:
                "Idea base generada como respaldo para que puedas arrancar y editarla manualmente.",
            },
          ];

    const generatedIdea =
      relatedIdeas.find((item) =>
        normalizeSearchText(item.title).includes(normalizeSearchText(areaLabel ?? "")),
      )?.title ?? relatedIdeas[0]?.title ?? seedText;

    return {
      generatedIdea,
      relatedIdeas,
      resolvedArea,
    };
  }
}
