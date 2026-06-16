import type { BlueprintLaunchIntake } from "@/blueprint_launch/fixtures/synthetic-intake";

function safeSentence(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function buildBlueprintDraft(intake: BlueprintLaunchIntake) {
  const topic = safeSentence(intake.topic, "Tema pendiente de definir.");
  const problemContext = safeSentence(
    intake.problemContext,
    "Contexto del problema pendiente de definir.",
  );
  const researchLine = safeSentence(
    intake.researchLine,
    "Linea de investigacion pendiente de definir.",
  );
  const constraints = safeSentence(
    intake.academicConstraints,
    "Restricciones academicas pendientes de definir.",
  );
  const targetPopulation = safeSentence(
    intake.targetPopulation,
    "Poblacion objetivo pendiente de definir.",
  );
  const availableData = safeSentence(
    intake.availableData,
    "Datos disponibles pendientes de definir.",
  );
  const methodology = safeSentence(
    intake.preferredMethodology,
    "Metodologia preferida pendiente de definir.",
  );
  const advisorNotes = safeSentence(
    intake.advisorNotes,
    "Observaciones del asesor pendientes de definir.",
  );
  const searchQuery = safeSentence(
    intake.searchQuery,
    "Consulta de busqueda pendiente de definir.",
  );

  return [
    "BLUEPRINT BASE - BORRADOR LOCAL CON DATOS SINTETICOS",
    "",
    `Tema propuesto: ${topic}`,
    "",
    "Planteamiento inicial del problema:",
    problemContext,
    "",
    `Linea de investigacion: ${researchLine}`,
    `Poblacion objetivo: ${targetPopulation}`,
    `Metodologia sugerida: ${methodology}`,
    "",
    "Delimitacion operativa:",
    constraints,
    "",
    "Disponibilidad de datos para una primera validacion:",
    availableData,
    "",
    "Orientacion inicial del blueprint:",
    `Se propone desarrollar un blueprint de investigacion aplicado en torno a "${topic}". El documento debe traducir el problema descrito en un objetivo general claro, objetivos especificos medibles, preguntas de investigacion coherentes y un plan metodologico ejecutable para la poblacion definida.`,
    "",
    "Texto base sugerido:",
    `La investigacion se enfocara en ${topic.toLowerCase()} dentro de la linea ${researchLine.toLowerCase()}. A partir del contexto identificado, el blueprint debera justificar la relevancia academica y aplicada del problema, acotar el estudio a ${targetPopulation.toLowerCase()} y sostener una estrategia metodologica compatible con ${methodology.toLowerCase()}.`,
    "",
    "Supuestos iniciales de trabajo:",
    `1. Existe acceso suficiente a informacion vinculada con ${targetPopulation.toLowerCase()}.`,
    `2. Los datos descritos permiten una aproximacion consistente para el analisis: ${availableData}`,
    `3. El desarrollo del documento debe respetar estas restricciones: ${constraints}`,
    "",
    "Observaciones para la siguiente iteracion:",
    advisorNotes,
    "",
    "Consulta sintetica de recuperacion futura:",
    searchQuery,
  ].join("\n");
}
