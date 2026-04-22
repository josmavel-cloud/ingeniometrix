import type { Intake, Project, Reference } from "@prisma/client";

import type {
  BlueprintContextCompletion,
  BlueprintReadinessSnapshot,
  BlueprintReferenceInsight,
  BlueprintTemplateContext,
} from "./blueprint-types";

type BlueprintPromptInput = {
  project: Project;
  intake: Intake;
  selectedReferences: Array<{
    selectedOrder: number | null;
    reference: Reference;
  }>;
  referenceInsights: BlueprintReferenceInsight[];
  templateContext: BlueprintTemplateContext;
  assistedContext?: BlueprintContextCompletion | null;
  readinessSnapshot?: BlueprintReadinessSnapshot | null;
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
        `access_url: ${reference.landingPageUrl ?? (reference.doi ? `https://doi.org/${reference.doi}` : "NO_DISPONIBLE")}`,
        `authors: ${Array.isArray(reference.authorsJson) ? reference.authorsJson.join(", ") : "NO_DISPONIBLE"}`,
        `year: ${reference.year ?? "NO_DISPONIBLE"}`,
        `venue: ${reference.venue ?? "NO_DISPONIBLE"}`,
        `abstract: ${truncate(reference.abstract, 900) || "NO_DISPONIBLE"}`,
      ].join("\n");
    })
    .join("\n\n");
  const templateBlock = [
    `template_key: ${input.templateContext.template_key}`,
    `template_name: ${input.templateContext.template_name}`,
    `template_source: ${input.templateContext.source}`,
    `required_section_keys: ${
      input.templateContext.required_section_keys.length > 0
        ? input.templateContext.required_section_keys.join(", ")
        : "NO_DISPONIBLE"
    }`,
    `available_semantic_keys: ${
      input.templateContext.available_semantic_keys.length > 0
        ? input.templateContext.available_semantic_keys.join(", ")
        : "NO_DISPONIBLE"
    }`,
    `guidance_notes: ${
      input.templateContext.guidance_notes.length > 0
        ? input.templateContext.guidance_notes.join(" | ")
        : "NO_DISPONIBLE"
    }`,
  ].join("\n");
  const insightsBlock = input.referenceInsights
    .map((insight, index) => {
      return [
        `Insight ${index + 1}:`,
        `reference_id: ${insight.reference_id}`,
        `evidence_strength: ${insight.evidence_strength}`,
        `is_recent: ${insight.is_recent ? "SI" : "NO"}`,
        `topic_focus: ${
          insight.topic_focus.length > 0 ? insight.topic_focus.join(", ") : "NO_DISPONIBLE"
        }`,
        `problem_signal: ${insight.problem_signal ?? "NO_DISPONIBLE"}`,
        `method_signal: ${insight.method_signal ?? "NO_DISPONIBLE"}`,
        `population_or_context_signal: ${insight.population_or_context_signal ?? "NO_DISPONIBLE"}`,
        `technical_solution_signal: ${insight.technical_solution_signal ?? "NO_DISPONIBLE"}`,
        `main_finding_signal: ${insight.main_finding_signal ?? "NO_DISPONIBLE"}`,
        `limitation_signal: ${insight.limitation_signal ?? "NO_DISPONIBLE"}`,
        `future_line_signal: ${insight.future_line_signal ?? "NO_DISPONIBLE"}`,
      ].join("\n");
    })
    .join("\n\n");
  const readinessBlock = input.readinessSnapshot
    ? [
        `readiness_status: ${input.readinessSnapshot.readiness_status}`,
        `missing_intake_fields: ${
          input.readinessSnapshot.missing_intake_fields.join(", ") || "NINGUNO"
        }`,
        `warnings: ${input.readinessSnapshot.warnings.join(" | ") || "NINGUNO"}`,
      ].join("\n")
    : "NO_DISPONIBLE";
  const assistedContextBlock = input.assistedContext
    ? [
        `research_line: ${input.assistedContext.research_line}`,
        `problem_frame: ${input.assistedContext.problem_frame}`,
        `population_frame: ${input.assistedContext.population_frame}`,
        `methodology_frame: ${input.assistedContext.methodology_frame}`,
        `analysis_frame: ${input.assistedContext.analysis_frame}`,
        `assumptions: ${
          input.assistedContext.assumptions.length > 0
            ? input.assistedContext.assumptions.join(" | ")
            : "NINGUNA"
        }`,
        `rationale: ${input.assistedContext.rationale}`,
      ].join("\n")
    : "NO_DISPONIBLE";

  return `
Eres Ingeniometrix, un asistente etico de planeamiento de tesis para estudiantes de maestria y posgrado en Peru.

Tu tarea es generar UN blueprint inicial de investigacion en ESPANOL, siguiendo el schema exacto solicitado.

Reglas no negociables:
- no inventes citas
- no inventes datos
- no inventes resultados
- usa SOLO las referencias seleccionadas por el usuario
- no traduzcas titulos de referencias; mantenlos tal como fueron recuperados
- si falta informacion, declarala explicitamente en assumptions
- si un campo clave no puede afirmarse con certeza, usa una formulacion cauta y academica, sin fingir precision
- el producto NO es una tesis completa; es un plan estructurado y trazable
- esta version es un blueprint MVP: prioriza claridad, viabilidad y trazabilidad antes que exhaustividad

Reglas de trazabilidad:
- references_used debe contener solo reference_id reales de la lista entregada
- no menciones una referencia fuera de la lista
- si una idea no puede apoyarse en las referencias entregadas, no la presentes como afirmacion bibliografica fuerte
- la plantilla base ya fue elegida por el usuario y debe orientar la estructura del blueprint
- usa los reference insights como ideas derivadas de las referencias para problema, metodo, hallazgos utiles y lineas futuras
- trata las referencias como antecedentes recientes cuando su year este dentro de los ultimos 5 anos
- prioriza antecedentes que describan soluciones tecnicas, enfoques metodologicos o vacios aun no resueltos
- devuelve solo los campos solicitados por el schema; no intentes completar una tesis ni una version extendida

Proyecto:
- project_title: ${input.project.title}
- degree_level: ${input.project.degreeLevel}
- university: ${input.project.university}
- program: ${input.project.program}
- template_key: ${input.project.templateKey}

Plantilla base seleccionada:
${templateBlock}

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

Ideas extraidas desde las referencias:
${insightsBlock}

Readiness previo del motor:
${readinessBlock}

Contexto asistido para estabilizar el blueprint:
${assistedContextBlock}

Instrucciones de calidad:
- produce un blueprint coherente y defendible
- el tono debe ser academico, claro y util para revision con asesor
- si una seccion aun no puede quedar cerrada, formula una version inicial prudente y deja la incertidumbre en assumptions
- si existe contexto asistido, usalo como apoyo prudente para cerrar vacios del intake sin presentarlo como hecho confirmado
- si research_line no fue dada con claridad, usa una formulacion prudente y agregalo tambien a assumptions
- specific_objectives y research_questions deben alinearse entre si
- intenta sostener el blueprint con al menos 5 antecedentes recientes si estan disponibles dentro de las referencias seleccionadas
- revisa limitation_signal y future_line_signal para detectar que falta por investigar y usa eso para mejorar general_objective y specific_objectives
- si technical_solution_signal aparece en los antecedentes, aprovecha esas soluciones como base comparativa para justificar el enfoque propuesto
- references_used debe incluir las referencias mas utiles realmente usadas para sustentar el blueprint
- integra ideas de metodo, contexto, hallazgos y futuras lineas solo cuando puedan sostenerse con los insights entregados
- si la plantilla exige una seccion pero la evidencia no alcanza, evita inventar contenido y deja la incertidumbre en assumptions
`.trim();
}
