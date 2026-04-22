import type { DegreeLevel } from "@prisma/client";

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
    case "POSGRADO":
    default:
      return "Posgrado";
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
    case "POSGRADO":
    default:
      return "Programa de posgrado";
  }
}
