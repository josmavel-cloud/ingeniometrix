import type { Intake, Project } from "@prisma/client";

import blueprintContextCompletionSchema from "@/ai/schemas/blueprint-context-completion.schema.json";
import type { LlmProvider } from "@/llm/provider";

import { generateStructuredObjectWithTextFallback } from "./blueprint-llm-json";
import type {
  BlueprintContextCompletion,
  BlueprintReadinessSnapshot,
  BlueprintReferenceInsight,
} from "./blueprint-types";

function buildBlueprintContextCompletionPrompt(input: {
  project: Pick<Project, "title" | "degreeLevel" | "university" | "program" | "templateKey">;
  intake: Pick<
    Intake,
    | "topic"
    | "problemContext"
    | "researchLine"
    | "academicConstraints"
    | "targetPopulation"
    | "availableData"
    | "preferredMethodology"
    | "advisorNotes"
  >;
  referenceInsights: BlueprintReferenceInsight[];
  readinessSnapshot: BlueprintReadinessSnapshot;
}) {
  const insightsBlock = input.referenceInsights
    .slice(0, 6)
    .map((insight, index) =>
      [
        `Insight ${index + 1}:`,
        `reference_id: ${insight.reference_id}`,
        `topic_focus: ${insight.topic_focus.join(", ") || "NO_DISPONIBLE"}`,
        `problem_signal: ${insight.problem_signal ?? "NO_DISPONIBLE"}`,
        `method_signal: ${insight.method_signal ?? "NO_DISPONIBLE"}`,
        `population_signal: ${insight.population_or_context_signal ?? "NO_DISPONIBLE"}`,
        `finding_signal: ${insight.main_finding_signal ?? "NO_DISPONIBLE"}`,
        `future_line_signal: ${insight.future_line_signal ?? "NO_DISPONIBLE"}`,
      ].join("\n"),
    )
    .join("\n\n");

  return `
Eres Ingeniometrix. Debes completar un contexto minimo y prudente para permitir la generacion de un blueprint inicial de investigacion.

Reglas:
- responde solo con el objeto solicitado
- no inventes datos ni resultados
- usa el intake y los insights como base
- cuando falte precision, formula una propuesta prudente y agregala a assumptions
- no conviertas esto en una tesis; solo prepara una base operativa para el motor

Proyecto:
- title: ${input.project.title}
- degree_level: ${input.project.degreeLevel}
- university: ${input.project.university}
- program: ${input.project.program}
- template_key: ${input.project.templateKey}

Intake actual:
- topic: ${input.intake.topic}
- problem_context: ${input.intake.problemContext ?? "NO_ESPECIFICADO"}
- research_line: ${input.intake.researchLine ?? "NO_ESPECIFICADO"}
- academic_constraints: ${input.intake.academicConstraints ?? "NO_ESPECIFICADO"}
- target_population: ${input.intake.targetPopulation ?? "NO_ESPECIFICADO"}
- available_data: ${input.intake.availableData ?? "NO_ESPECIFICADO"}
- preferred_methodology: ${input.intake.preferredMethodology ?? "NO_ESPECIFICADO"}
- advisor_notes: ${input.intake.advisorNotes ?? "NO_ESPECIFICADO"}

Readiness detectado:
- status: ${input.readinessSnapshot.readiness_status}
- missing_intake_fields: ${
    input.readinessSnapshot.missing_intake_fields.join(", ") || "NINGUNO"
  }
- warnings: ${input.readinessSnapshot.warnings.join(" | ") || "NINGUNO"}

Insights:
${insightsBlock || "NO_DISPONIBLE"}

Devuelve:
- research_line: propuesta prudente si hace falta
- problem_frame: reformulacion breve y clara del problema
- population_frame: delimitacion prudente de poblacion/contexto
- methodology_frame: propuesta metodologica inicial prudente
- analysis_frame: propuesta basica de analisis alineada al metodo
- assumptions: supuestos explicitos para lo que no pueda afirmarse con certeza
- rationale: por que estas propuestas ayudan a que el motor genere un blueprint mas estable
`.trim();
}

export async function generateBlueprintContextCompletion(params: {
  provider: LlmProvider;
  project: Pick<Project, "title" | "degreeLevel" | "university" | "program" | "templateKey">;
  intake: Pick<
    Intake,
    | "topic"
    | "problemContext"
    | "researchLine"
    | "academicConstraints"
    | "targetPopulation"
    | "availableData"
    | "preferredMethodology"
    | "advisorNotes"
  >;
  referenceInsights: BlueprintReferenceInsight[];
  readinessSnapshot: BlueprintReadinessSnapshot;
}) {
  const prompt = buildBlueprintContextCompletionPrompt(params);

  return generateStructuredObjectWithTextFallback<BlueprintContextCompletion>({
    provider: params.provider,
    prompt,
    schemaName: "blueprint_context_completion",
    schema: blueprintContextCompletionSchema as Record<string, unknown>,
  });
}
