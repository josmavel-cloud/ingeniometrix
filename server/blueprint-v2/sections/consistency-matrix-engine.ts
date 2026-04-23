import type { ConsistencyMatrixRow, MasterSectionDraft } from "@/server/blueprint-v2/types";
import { parseBulletLines } from "@/server/blueprint-v2/utils";

function getSectionContent(
  drafts: MasterSectionDraft[],
  key: string,
  fallback = "",
) {
  return drafts.find((draft) => draft.section_key === key)?.content ?? fallback;
}

function deriveQuestionFromObjective(objective: string) {
  const normalized = objective.replace(/^[*-]\s*/, "").replace(/[.]+$/g, "").trim();

  if (!normalized) {
    return "Pregunta por afinar con el asesor.";
  }

  const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  const verbMatch = lowered.match(
    /^(identificar|describir|analizar|evaluar|determinar|establecer|proponer|examinar|comparar|estimar)\s+(.+)$/i,
  );

  if (!verbMatch) {
    return `Como se manifiesta ${lowered}?`;
  }

  const [, verb, remainder] = verbMatch;

  switch (verb.toLowerCase()) {
    case "identificar":
      return `Que elementos permiten identificar ${remainder}?`;
    case "describir":
      return `Como se caracteriza ${remainder}?`;
    case "analizar":
    case "examinar":
      return `Como se relaciona ${remainder} con el problema de investigacion?`;
    case "evaluar":
    case "estimar":
      return `En que medida ${remainder}?`;
    case "determinar":
    case "establecer":
      return `Que relacion existe respecto de ${remainder}?`;
    case "comparar":
      return `Que diferencias o similitudes se observan en ${remainder}?`;
    case "proponer":
      return `Que lineamientos resultan pertinentes para ${remainder}?`;
    default:
      return `Como se manifiesta ${lowered}?`;
  }
}

export function buildConsistencyMatrixFromSections(
  drafts: MasterSectionDraft[],
): ConsistencyMatrixRow[] {
  const specificObjectives = parseBulletLines(
    getSectionContent(drafts, "specific_objectives"),
  );
  const specificQuestions = parseBulletLines(
    getSectionContent(drafts, "specific_research_questions"),
  );
  const method = getSectionContent(drafts, "methodology");
  const techniques = parseBulletLines(
    getSectionContent(drafts, "data_collection_techniques"),
  );
  const normalizedTechnique =
    techniques[0] ||
    getSectionContent(drafts, "research_instruments") ||
    "Tecnica por precisar segun el diseno final.";
  const rows = specificObjectives.map((objective, index) => ({
    objective,
    question:
      specificQuestions[index] ??
      deriveQuestionFromObjective(objective),
    method: method || "Metodologia por precisar con mayor detalle.",
    technique: normalizedTechnique,
  }));

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      objective:
        getSectionContent(drafts, "general_objective") ||
        "Objetivo general por precisar con mayor evidencia.",
      question:
        getSectionContent(drafts, "general_research_question") ||
        "Pregunta general por precisar con mayor evidencia.",
      method: method || "Metodologia por precisar con mayor detalle.",
      technique: normalizedTechnique,
    },
  ];
}
