import type { Intake, Project } from "@prisma/client";

import { extractSearchTerms } from "@/lib/text";

import type {
  BlueprintContextCompletion,
  BlueprintReferenceSnapshot,
  ResearchBlueprintCore,
} from "./blueprint-types";

export type ResearchBlueprintCoreDraft = {
  project_title: string;
  template_key: string;
  degree_level:
    | "PREGRADO"
    | "POSGRADO"
    | "ESPECIALIZACION"
    | "MAESTRIA"
    | "DOCTORADO";
  university: string;
  program: string;
  research_line: string;
  problem_statement: string;
  problem_delimitation?: string;
  justification: string;
  general_objective: string;
  specific_objectives: string[];
  research_questions: string[];
  proposed_methodology: string;
  population_and_sample: string;
  analysis_plan: string;
  assumptions: string[];
  references_used?: BlueprintReferenceSnapshot[];
  limitations?: string[];
};

type NormalizeBlueprintDraftInput = {
  draft: ResearchBlueprintCoreDraft;
  project: Pick<Project, "title" | "templateKey" | "degreeLevel" | "university" | "program">;
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
  assistedContext?: BlueprintContextCompletion | null;
};

function normalizeText(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeList(values: string[] | null | undefined, fallback: string[]) {
  const items =
    values
      ?.map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0) ?? [];

  return items.length > 0 ? items : fallback;
}

function toQuestion(value: string) {
  const trimmed = value.trim();

  if (trimmed.endsWith("?")) {
    return trimmed;
  }

  return `${trimmed}?`;
}

function deriveKeyConstructs(input: {
  topic: string;
  objective: string;
  problem: string;
}) {
  const terms = extractSearchTerms(
    `${input.topic} ${input.objective} ${input.problem}`,
    {
      maxTerms: 6,
      minLength: 4,
    },
  );

  return terms.length > 0
    ? terms.map((term) => term.charAt(0).toUpperCase() + term.slice(1))
    : ["Constructos por precisar con el asesor"];
}

function deriveTechniques(input: NormalizeBlueprintDraftInput["intake"]) {
  const context = `${input.availableData ?? ""} ${input.preferredMethodology ?? ""}`.toLowerCase();

  if (context.includes("document")) {
    return ["Analisis documental trazable"];
  }

  if (context.includes("encuest")) {
    return ["Encuesta o instrumento estructurado por validar"];
  }

  if (context.includes("entrevist")) {
    return ["Entrevista semiestructurada por afinar"];
  }

  return ["Tecnica por definir con mayor precision metodologica"];
}

function deriveWorkPlan() {
  return [
    {
      phase: "Delimitacion del problema y ajuste del enfoque",
      duration: "Pendiente de calendarizar con el cronograma institucional.",
    },
    {
      phase: "Revision de literatura y consolidacion metodologica",
      duration: "Pendiente de calendarizar segun disponibilidad del proyecto.",
    },
    {
      phase: "Levantamiento o analisis de datos y redaccion del plan",
      duration: "Pendiente de calendarizar con asesor y entregables.",
    },
  ];
}

export function normalizeBlueprintDraft(
  input: NormalizeBlueprintDraftInput,
): ResearchBlueprintCore {
  const assistedAssumptions = input.assistedContext?.assumptions ?? [];
  const derivedTechniques = deriveTechniques(input.intake);
  const researchQuestions = normalizeList(input.draft.research_questions, [
    toQuestion(`Como abordar ${input.intake.topic} con mayor precision academica`),
  ]).map(toQuestion);
  const specificObjectives = normalizeList(input.draft.specific_objectives, [
    "Precisar mejor el alcance del estudio con base en el intake y las fuentes seleccionadas.",
  ]);
  const proposedMethodology = normalizeText(
    input.draft.proposed_methodology,
    input.intake.preferredMethodology ??
      "Metodologia por precisar con mayor detalle antes de la version extendida.",
  );
  const problemStatement = normalizeText(
    input.draft.problem_statement,
    input.intake.problemContext ??
      `El proyecto requiere una mejor delimitacion del problema sobre ${input.intake.topic}.`,
  );
  const problemDelimitation = normalizeText(
    input.draft.problem_delimitation,
    [
      input.intake.problemContext,
      input.intake.targetPopulation,
      input.intake.academicConstraints,
    ]
      .filter(Boolean)
      .join(" ") || "La delimitacion exacta del problema aun requiere validacion manual.",
  );

  return {
    project_title: normalizeText(input.draft.project_title, input.project.title),
    template_key: normalizeText(input.draft.template_key, input.project.templateKey),
    degree_level: input.project.degreeLevel,
    university: normalizeText(input.draft.university, input.project.university),
    program: normalizeText(input.draft.program, input.project.program),
    research_line: normalizeText(
      input.draft.research_line,
      input.assistedContext?.research_line ??
      input.intake.researchLine ??
        "Linea de investigacion por confirmar con el contexto institucional.",
    ),
    problem_statement: problemStatement,
    problem_delimitation: normalizeText(
      input.draft.problem_delimitation,
      input.assistedContext?.problem_frame ?? problemDelimitation,
    ),
    justification: normalizeText(
      input.draft.justification,
      "La justificacion debe revisarse con el asesor para precisar relevancia academica y aplicada.",
    ),
    general_objective: normalizeText(
      input.draft.general_objective,
      `Desarrollar una base investigativa mas clara sobre ${input.intake.topic}.`,
    ),
    specific_objectives: specificObjectives,
    research_questions: researchQuestions,
    hypotheses_or_guiding_questions: researchQuestions,
    key_constructs_or_variables: deriveKeyConstructs({
      topic: input.intake.topic,
      objective: input.draft.general_objective,
      problem: problemStatement,
    }),
    proposed_methodology: proposedMethodology,
    population_and_sample: normalizeText(
      input.draft.population_and_sample,
      input.assistedContext?.population_frame ??
      input.intake.targetPopulation ??
        "Poblacion y muestra pendientes de mayor delimitacion metodologica.",
    ),
    data_collection_techniques: derivedTechniques,
    analysis_plan: normalizeText(
      input.draft.analysis_plan,
      input.assistedContext?.analysis_frame ??
      input.intake.availableData ??
        "Plan de analisis por precisar segun los datos disponibles y el metodo final.",
    ),
    consistency_matrix: specificObjectives.map((objective, index) => ({
      objective,
      question:
        researchQuestions[index] ??
        researchQuestions[researchQuestions.length - 1] ??
        "Como se operacionaliza el objetivo propuesto?",
      method: proposedMethodology,
      technique:
        derivedTechniques[0] ?? "Tecnica por definir con mayor precision metodologica",
    })),
    work_plan: deriveWorkPlan(),
    assumptions: Array.from(
      new Set(
        normalizeList(input.draft.assumptions, [
          "La version inicial del blueprint usa supuestos explicitos mientras se afina el intake y la evidencia seleccionada.",
        ]).concat(assistedAssumptions),
      ),
    ),
    limitations: normalizeList(input.draft.limitations, [
      "La version inicial aun requiere refinamiento metodologico y validacion academica manual.",
    ]),
    references_used: input.draft.references_used ?? [],
  };
}
