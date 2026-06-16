import type { Intake, Project, Reference } from "@prisma/client";

import blueprintAntecedentSynthesisSchema from "@/ai/schemas/blueprint-antecedent-synthesis.schema.json";
import { getLanguageInstruction } from "@/lib/language";
import type { LlmProvider } from "@/llm/provider";

import { generateStructuredObjectWithTextFallback } from "./blueprint-llm-json";
import type {
  BlueprintAntecedentSynthesis,
  BlueprintReferenceInsight,
} from "./blueprint-types";

function truncate(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function buildAntecedentPrompt(input: {
  project: Pick<Project, "title" | "degreeLevel" | "university" | "program" | "language">;
  intake: Pick<
    Intake,
    | "topic"
    | "problemContext"
    | "researchLine"
    | "targetPopulation"
    | "preferredMethodology"
  >;
  selectedReferences: Array<{
    selectedOrder: number | null;
    reference: Reference;
  }>;
  referenceInsights: BlueprintReferenceInsight[];
}) {
  const languageInstruction = getLanguageInstruction(input.project.language);
  const referencesBlock = input.selectedReferences
    .slice(0, 7)
    .map((item, index) => {
      const reference = item.reference;
      const insight =
        input.referenceInsights.find(
          (candidate) => candidate.reference_id === reference.id,
        ) ?? null;

      return [
        `Antecedente ${index + 1}:`,
        `reference_id: ${reference.id}`,
        `title: ${reference.title}`,
        `authors: ${
          Array.isArray(reference.authorsJson)
            ? reference.authorsJson.join(", ")
            : "NO_DISPONIBLE"
        }`,
        `year: ${reference.year ?? "NO_DISPONIBLE"}`,
        `download_url: ${
          reference.landingPageUrl ??
          (reference.doi ? `https://doi.org/${reference.doi}` : "NO_DISPONIBLE")
        }`,
        `abstract: ${truncate(reference.abstract, 1200) || "NO_DISPONIBLE"}`,
        `problem_signal: ${insight?.problem_signal ?? "NO_DISPONIBLE"}`,
        `method_signal: ${insight?.method_signal ?? "NO_DISPONIBLE"}`,
        `technical_solution_signal: ${insight?.technical_solution_signal ?? "NO_DISPONIBLE"}`,
        `future_line_signal: ${insight?.future_line_signal ?? "NO_DISPONIBLE"}`,
        `limitation_signal: ${insight?.limitation_signal ?? "NO_DISPONIBLE"}`,
      ].join("\n");
    })
    .join("\n\n");

  return `
Eres Ingeniometrix. Debes sintetizar antecedentes recientes para fortalecer un blueprint de investigacion.
${languageInstruction}
Mantén titulos de referencias, DOI y nombres propios tal como fueron recuperados.

Objetivo:
- identificar hasta 5 antecedentes utiles dentro de las referencias seleccionadas
- resumir su aporte tecnico
- detectar que vacio o trabajo pendiente dejan abierto
- proponer orientaciones concretas para mejorar los objetivos del blueprint

Reglas:
- usa solo las referencias entregadas
- prioriza las referencias mas recientes y con abstract utilizable
- si hay soluciones tecnicas descritas, resumela sin exagerar
- si una referencia no deja claro el vacio pendiente, formula una inferencia prudente basada en limitation_signal y future_line_signal
- no inventes resultados ni citas nuevas
- responde en el idioma solicitado arriba

Proyecto:
- title: ${input.project.title}
- degree_level: ${input.project.degreeLevel}
- university: ${input.project.university}
- program: ${input.project.program}

Contexto del usuario:
- topic: ${input.intake.topic}
- problem_context: ${input.intake.problemContext ?? "NO_ESPECIFICADO"}
- research_line: ${input.intake.researchLine ?? "NO_ESPECIFICADO"}
- target_population: ${input.intake.targetPopulation ?? "NO_ESPECIFICADA"}
- preferred_methodology: ${input.intake.preferredMethodology ?? "NO_ESPECIFICADA"}

Referencias disponibles:
${referencesBlock || "NO_DISPONIBLE"}

Devuelve:
- summaries: hasta 5 antecedentes con
  - reference_id
  - title
  - authors
  - year
  - download_url
  - summary
  - technical_solution
  - unresolved_gap
- gap_overview: sintesis breve de lo que aun falta resolver segun el conjunto
- objective_guidance: 2 a 5 orientaciones concretas para mejorar objetivos y preguntas a partir de esos vacios
`.trim();
}

export async function generateBlueprintAntecedentSynthesis(params: {
  provider: LlmProvider;
  project: Pick<Project, "title" | "degreeLevel" | "university" | "program" | "language">;
  intake: Pick<
    Intake,
    | "topic"
    | "problemContext"
    | "researchLine"
    | "targetPopulation"
    | "preferredMethodology"
  >;
  selectedReferences: Array<{
    selectedOrder: number | null;
    reference: Reference;
  }>;
  referenceInsights: BlueprintReferenceInsight[];
}) {
  const prompt = buildAntecedentPrompt(params);

  return generateStructuredObjectWithTextFallback<BlueprintAntecedentSynthesis>({
    provider: params.provider,
    prompt,
    schemaName: "blueprint_antecedent_synthesis",
    schema: blueprintAntecedentSynthesisSchema as Record<string, unknown>,
  });
}
