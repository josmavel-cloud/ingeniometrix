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
        score += 5;
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

      const haystack = normalizeSearchText(
        [preset.label, preset.title, preset.researchLine].join(" "),
      );
      const matchingTokens = interestTokens.filter((token) => haystack.includes(token));

      if (matchingTokens.length > 0) {
        score += matchingTokens.length * 3;
        reasons.push(
          `Se acerca a tu interes: ${matchingTokens.slice(0, 2).join(", ")}.`,
        );
      } else if (normalizedInterest.length >= 10 && haystack.includes(normalizedInterest)) {
        score += 4;
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
