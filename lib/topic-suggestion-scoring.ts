import {
  PROJECT_CAREERS,
  PROJECT_PRESETS,
  type ProjectPreset,
  type ProjectPresetDegreeLevel,
} from "@/lib/project-presets";
import type {
  ProjectTemplateKey,
  ProjectUniversityCode,
} from "@/lib/peru-universities";

export type TopicSuggestionTone = "lilac" | "gold" | "mint" | "blush";

export type ProjectPresetSuggestionEntry = {
  preset: ProjectPreset;
  reasons: string[];
  score: number;
  tone: TopicSuggestionTone;
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokenVariants(token: string) {
  const variants = new Set([token]);

  if (token.endsWith("es") && token.length > 5) {
    variants.add(token.slice(0, -2));
  }

  if (token.endsWith("s") && token.length > 4) {
    variants.add(token.slice(0, -1));
  }

  return Array.from(variants);
}

export function getInterestTokens(value: string) {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 4),
    ),
  );
}

export function buildPresetSearchText(preset: ProjectPreset) {
  return normalizeSearchText(
    [
      preset.careerLabel,
      preset.label,
      preset.title,
      preset.researchLine,
      ...preset.intakePresets.flatMap((intake) => [
        intake.label,
        intake.topic,
        intake.problemContext,
        intake.researchLine,
        intake.targetPopulation,
      ]),
    ].join(" "),
  );
}

export function getMatchingSearchTokens(input: {
  queryTokens: string[];
  searchText: string;
}) {
  return input.queryTokens.filter((token) =>
    getTokenVariants(token).some((variant) => input.searchText.includes(variant)),
  );
}

export function getTopicAreaLabel(areaId: string | null | undefined) {
  return PROJECT_CAREERS.find((career) => career.id === areaId)?.label ?? null;
}

export function buildProjectPresetSuggestionEntries(params: {
  areaId?: string | null;
  degreeLevel: ProjectPresetDegreeLevel;
  university: ProjectUniversityCode;
  templateKey: ProjectTemplateKey;
  interestText: string;
  limit?: number;
}) {
  const { areaId, degreeLevel, interestText } = params;
  const interestTokens = getInterestTokens(interestText);
  const normalizedInterest = normalizeSearchText(interestText);
  const tones: TopicSuggestionTone[] = ["lilac", "gold", "mint", "blush"];

  const candidatePresets = areaId
    ? PROJECT_PRESETS.filter((preset) => preset.careerId === areaId)
    : PROJECT_PRESETS;

  return candidatePresets
    .map((preset) => {
      const reasons: string[] = [];
      let score = 0;

      if (preset.degreeLevel === degreeLevel) {
        score += 2;
        reasons.push(
          degreeLevel === "MAESTRIA"
            ? "Encaja con maestria."
            : "Encaja con posgrado.",
        );
      }

      if (areaId && preset.careerId === areaId) {
        score += 3;
        reasons.push("Se alinea con el area definida.");
      }

      const haystack = buildPresetSearchText(preset);
      const matchingTokens = getMatchingSearchTokens({
        queryTokens: interestTokens,
        searchText: haystack,
      });

      if (matchingTokens.length > 0) {
        score += matchingTokens.length * 6;
        reasons.push(
          `Se acerca a tu interes: ${matchingTokens.slice(0, 2).join(", ")}.`,
        );
      }

      if (normalizedInterest.length >= 5 && haystack.includes(normalizedInterest)) {
        score += 10;
        reasons.push("Se alinea de forma directa con lo que escribiste.");
      }

      if (reasons.length === 0) {
        reasons.push("Base corta del catalogo para empezar rapido.");
      }

      return { preset, reasons, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.preset.degreeLevel !== right.preset.degreeLevel) {
        return left.preset.degreeLevel === degreeLevel ? -1 : 1;
      }

      return left.preset.title.localeCompare(right.preset.title, "es");
    })
    .slice(0, params.limit ?? 4)
    .map((entry, index) => ({
      ...entry,
      tone: tones[index % tones.length],
    }));
}
