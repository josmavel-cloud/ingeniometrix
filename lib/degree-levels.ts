import type { DegreeLevel } from "@/lib/hybrid-contracts";

import type { SupportedLanguage } from "@/lib/language";
import type { ProjectPresetDegreeLevel } from "@/lib/project-presets";

export const PROJECT_DEGREE_LEVEL_OPTIONS: Array<{
  value: DegreeLevel;
  label: string;
}> = [
  { value: "PREGRADO", label: "Pregrado" },
  { value: "POSGRADO", label: "Posgrado" },
  { value: "ESPECIALIZACION", label: "Especializacion" },
  { value: "MAESTRIA", label: "Maestria" },
  { value: "DOCTORADO", label: "Doctorado" },
  { value: "PROYECTO_INVESTIGACION", label: "Proyecto de investigacion" },
];

export function getDegreeLevelLabel(degreeLevel: DegreeLevel) {
  switch (degreeLevel) {
    case "PREGRADO":
      return "Pregrado";
    case "ESPECIALIZACION":
      return "Especializacion";
    case "MAESTRIA":
      return "Maestria";
    case "DOCTORADO":
      return "Doctorado";
    case "PROYECTO_INVESTIGACION":
      return "Proyecto de investigacion";
    case "POSGRADO":
    default:
      return "Posgrado";
  }
}

export function getDegreeLevelLabelForLanguage(
  degreeLevel: DegreeLevel,
  language: SupportedLanguage,
) {
  if (language !== "en") {
    return getDegreeLevelLabel(degreeLevel);
  }

  switch (degreeLevel) {
    case "PREGRADO":
      return "Undergraduate";
    case "ESPECIALIZACION":
      return "Specialization";
    case "MAESTRIA":
      return "Master's";
    case "DOCTORADO":
      return "Doctorate";
    case "PROYECTO_INVESTIGACION":
      return "Research project";
    case "POSGRADO":
    default:
      return "Graduate";
  }
}

export function getPresetDegreeLevelForProject(
  degreeLevel: DegreeLevel,
): ProjectPresetDegreeLevel {
  if (degreeLevel === "MAESTRIA" || degreeLevel === "DOCTORADO") {
    return "MAESTRIA";
  }

  return "POSGRADO";
}

export function getGenericProgramDefault(degreeLevel: DegreeLevel) {
  switch (degreeLevel) {
    case "PREGRADO":
      return "Programa de pregrado";
    case "ESPECIALIZACION":
      return "Programa de especializacion";
    case "MAESTRIA":
      return "Programa de maestria";
    case "DOCTORADO":
      return "Programa de doctorado";
    case "PROYECTO_INVESTIGACION":
      return "Proyecto de investigacion";
    case "POSGRADO":
    default:
      return "Programa de posgrado";
  }
}
