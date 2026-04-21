import type { Intake, Project, Reference } from "@prisma/client";

type BlueprintPromptInput = {
  project: Project;
  intake: Intake;
  selectedReferences: Array<{
    selectedOrder: number | null;
    reference: Reference;
  }>;
};

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function buildBlueprintPrompt(input: BlueprintPromptInput) {
  const referencesBlock = input.selectedReferences
    .map((item, index) => {
      const reference = item.reference;

      return [
        `Referencia ${index + 1}:`,
        `reference_id: ${reference.id}`,
        `title: ${reference.title}`,
        `doi: ${reference.doi ?? "NO_DISPONIBLE"}`,
        `authors: ${Array.isArray(reference.authorsJson) ? reference.authorsJson.join(", ") : "NO_DISPONIBLE"}`,
        `year: ${reference.year ?? "NO_DISPONIBLE"}`,
        `venue: ${reference.venue ?? "NO_DISPONIBLE"}`,
        `abstract: ${truncate(reference.abstract, 900) || "NO_DISPONIBLE"}`,
      ].join("\n");
    })
    .join("\n\n");

  return `
Eres Ingeniometrix, un asistente etico de planeamiento de tesis para estudiantes de maestria y posgrado en Peru.

Tu tarea es generar UN blueprint de investigacion en ESPANOL, siguiendo el schema exacto solicitado.

Reglas no negociables:
- no inventes citas
- no inventes datos
- no inventes resultados
- usa SOLO las referencias seleccionadas por el usuario
- no traduzcas titulos de referencias; mantenlos tal como fueron recuperados
- si falta informacion, declarala explicitamente en assumptions
- si un campo clave no puede afirmarse con certeza, usa una formulacion cauta y academica, sin fingir precision
- el producto NO es una tesis completa; es un plan estructurado y trazable

Reglas de trazabilidad:
- references_used debe contener solo reference_id reales de la lista entregada
- no menciones una referencia fuera de la lista
- si una idea no puede apoyarse en las referencias entregadas, no la presentes como afirmacion bibliografica fuerte

Proyecto:
- project_title: ${input.project.title}
- degree_level: ${input.project.degreeLevel}
- university: ${input.project.university}
- program: ${input.project.program}
- template_key: ${input.project.templateKey}

Intake del usuario:
- topic: ${input.intake.topic}
- problem_context: ${input.intake.problemContext ?? "NO_ESPECIFICADO"}
- research_line: ${input.intake.researchLine ?? "NO_ESPECIFICADO"}
- academic_constraints: ${input.intake.academicConstraints ?? "NO_ESPECIFICADO"}
- target_population: ${input.intake.targetPopulation ?? "NO_ESPECIFICADO"}
- available_data: ${input.intake.availableData ?? "NO_ESPECIFICADO"}
- preferred_methodology: ${input.intake.preferredMethodology ?? "NO_ESPECIFICADO"}
- advisor_notes: ${input.intake.advisorNotes ?? "NO_ESPECIFICADO"}

Referencias seleccionadas:
${referencesBlock}

Instrucciones de calidad:
- produce un blueprint coherente y defendible
- el tono debe ser academico, claro y util para revision con asesor
- si research_line no fue dada con claridad, usa una formulacion prudente y agregalo tambien a assumptions
- specific_objectives, research_questions y consistency_matrix deben alinearse entre si
- references_used debe incluir las referencias mas utiles realmente usadas para sustentar el blueprint
`.trim();
}
