import type { Intake, Project } from "@prisma/client";

import { APP_DEFAULT_LANGUAGE, normalizeLanguageCode, type SupportedLanguage } from "@/lib/language";
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
  project: Pick<
    Project,
    "title" | "templateKey" | "degreeLevel" | "university" | "program" | "language"
  >;
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
  const normalized =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : null;
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeList(values: string[] | null | undefined, fallback: string[]) {
  const rawValues = Array.isArray(values) ? values : [];
  const items =
    rawValues
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0) ?? [];

  return items.length > 0 ? items : fallback;
}

function normalizeReferenceSnapshots(values: BlueprintReferenceSnapshot[] | null | undefined) {
  const rawValues = Array.isArray(values) ? values : [];

  return (
    rawValues
      .filter(
        (value): value is BlueprintReferenceSnapshot =>
          Boolean(value) && typeof value === "object",
      )
      .map((value) => ({
        reference_id:
          typeof value.reference_id === "string" ? value.reference_id.trim() : "",
        title:
          typeof value.title === "string"
            ? value.title.replace(/\s+/g, " ").trim()
            : "",
        doi: typeof value.doi === "string" ? value.doi.trim() : null,
      }))
      .filter((value) => value.reference_id || value.title || value.doi) ?? []
  );
}

function toQuestion(value: string) {
  const trimmed = value.trim();

  if (trimmed.endsWith("?")) {
    return trimmed;
  }

  return `${trimmed}?`;
}

function normalizeSentenceTerminal(value: string) {
  return value.replace(/[.?!]+$/g, "").trim();
}

function deriveQuestionFromObjective(objective: string) {
  const normalized = normalizeSentenceTerminal(objective);
  const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);

  if (/^identificar\s+/i.test(normalized)) {
    return `Cuales son ${normalized.replace(/^identificar\s+/i, "")}?`;
  }

  if (/^determinar\s+/i.test(normalized)) {
    return `Como se puede determinar ${normalized.replace(/^determinar\s+/i, "")}?`;
  }

  if (/^analizar\s+/i.test(normalized)) {
    return `Como se analiza ${normalized.replace(/^analizar\s+/i, "")}?`;
  }

  if (/^evaluar\s+/i.test(normalized)) {
    return `Como se evalua ${normalized.replace(/^evaluar\s+/i, "")}?`;
  }

  if (/^proponer\s+/i.test(normalized)) {
    return `Que propuesta permite ${normalized.replace(/^proponer\s+/i, "")}?`;
  }

  return `Como se puede ${lowered}?`;
}

function deriveQuestionFromObjectiveEn(objective: string) {
  const normalized = normalizeSentenceTerminal(objective);
  const lowered = normalized.charAt(0).toLowerCase() + normalized.slice(1);

  if (/^identify\s+/i.test(normalized)) {
    return `What are ${normalized.replace(/^identify\s+/i, "")}?`;
  }

  if (/^determine\s+/i.test(normalized)) {
    return `How can ${normalized.replace(/^determine\s+/i, "")} be determined?`;
  }

  if (/^analyze\s+/i.test(normalized)) {
    return `How can ${normalized.replace(/^analyze\s+/i, "")} be analyzed?`;
  }

  if (/^evaluate\s+/i.test(normalized)) {
    return `How can ${normalized.replace(/^evaluate\s+/i, "")} be evaluated?`;
  }

  if (/^propose\s+/i.test(normalized)) {
    return `What proposal could support ${normalized.replace(/^propose\s+/i, "")}?`;
  }

  return `How can ${lowered} be addressed?`;
}

function alignQuestionsToObjectives(
  objectives: string[],
  questions: string[],
  language: SupportedLanguage,
) {
  const normalizedQuestions = questions.map(toQuestion);

  return objectives.map((objective, index) =>
    normalizedQuestions[index] ??
      toQuestion(
        language === "en"
          ? deriveQuestionFromObjectiveEn(objective)
          : deriveQuestionFromObjective(objective),
      ),
  );
}

function deriveKeyConstructs(input: {
  topic: string;
  objective: string;
  problem: string;
  language: SupportedLanguage;
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
    : [
        input.language === "en"
          ? "Constructs to confirm with the advisor"
          : "Constructos por precisar con el asesor",
      ];
}

function deriveTechniques(
  input: NormalizeBlueprintDraftInput["intake"],
  language: SupportedLanguage,
) {
  const context = `${input.availableData ?? ""} ${input.preferredMethodology ?? ""}`.toLowerCase();

  if (context.includes("document")) {
    return [language === "en" ? "Traceable document analysis" : "Analisis documental trazable"];
  }

  if (context.includes("encuest")) {
    return [
      language === "en"
        ? "Survey or structured instrument to validate"
        : "Encuesta o instrumento estructurado por validar",
    ];
  }

  if (context.includes("entrevist")) {
    return [
      language === "en"
        ? "Semi-structured interview to refine"
        : "Entrevista semiestructurada por afinar",
    ];
  }

  return [
    language === "en"
      ? "Technique to define with greater methodological precision"
      : "Tecnica por definir con mayor precision metodologica",
  ];
}

function deriveWorkPlan(language: SupportedLanguage) {
  if (language === "en") {
    return [
      {
        phase: "Problem delimitation and focus adjustment",
        duration: "Pending scheduling with the institutional timeline.",
      },
      {
        phase: "Literature review and methodological consolidation",
        duration: "Pending scheduling according to project availability.",
      },
      {
        phase: "Data collection or analysis and plan drafting",
        duration: "Pending scheduling with the advisor and deliverables.",
      },
    ];
  }

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
  const language = normalizeLanguageCode(input.project.language) ?? APP_DEFAULT_LANGUAGE;
  const assistedAssumptions = Array.isArray(input.assistedContext?.assumptions)
    ? input.assistedContext.assumptions.filter(
        (assumption): assumption is string => typeof assumption === "string",
      )
    : [];
  const derivedTechniques = deriveTechniques(input.intake, language);
  const researchQuestions = normalizeList(input.draft.research_questions, [
    toQuestion(
      language === "en"
        ? `How to address ${input.intake.topic} with greater academic precision`
        : `Como abordar ${input.intake.topic} con mayor precision academica`,
    ),
  ]);
  const specificObjectives = normalizeList(input.draft.specific_objectives, [
    language === "en"
      ? "Clarify the study scope based on the intake and selected sources."
      : "Precisar mejor el alcance del estudio con base en el intake y las fuentes seleccionadas.",
  ]);
  const alignedResearchQuestions = alignQuestionsToObjectives(
    specificObjectives,
    researchQuestions,
    language,
  );
  const proposedMethodology = normalizeText(
    input.draft.proposed_methodology,
    input.intake.preferredMethodology ??
      (language === "en"
        ? "Methodology to define in greater detail before the extended version."
        : "Metodologia por precisar con mayor detalle antes de la version extendida."),
  );
  const problemStatement = normalizeText(
    input.draft.problem_statement,
    input.intake.problemContext ??
      (language === "en"
        ? `The project requires a clearer problem delimitation regarding ${input.intake.topic}.`
        : `El proyecto requiere una mejor delimitacion del problema sobre ${input.intake.topic}.`),
  );
  const problemDelimitation = normalizeText(
    input.draft.problem_delimitation,
    [
      input.intake.problemContext,
      input.intake.targetPopulation,
      input.intake.academicConstraints,
    ]
      .filter(Boolean)
      .join(" ") ||
      (language === "en"
        ? "The exact problem delimitation still requires manual validation."
        : "La delimitacion exacta del problema aun requiere validacion manual."),
  );
  const generalObjective = normalizeText(
    input.draft.general_objective,
    language === "en"
      ? `Develop a clearer research foundation for ${input.intake.topic}.`
      : `Desarrollar una base investigativa mas clara sobre ${input.intake.topic}.`,
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
        (language === "en"
          ? "Research line to confirm with the institutional context."
          : "Linea de investigacion por confirmar con el contexto institucional."),
    ),
    problem_statement: problemStatement,
    problem_delimitation: normalizeText(
      input.draft.problem_delimitation,
      input.assistedContext?.problem_frame ?? problemDelimitation,
    ),
    justification: normalizeText(
      input.draft.justification,
      language === "en"
        ? "The justification should be reviewed with the advisor to clarify academic and applied relevance."
        : "La justificacion debe revisarse con el asesor para precisar relevancia academica y aplicada.",
    ),
    general_objective: generalObjective,
    specific_objectives: specificObjectives,
    research_questions: alignedResearchQuestions,
    hypotheses_or_guiding_questions: alignedResearchQuestions,
    key_constructs_or_variables: deriveKeyConstructs({
      topic: input.intake.topic,
      objective: generalObjective,
      problem: problemStatement,
      language,
    }),
    proposed_methodology: proposedMethodology,
    population_and_sample: normalizeText(
      input.draft.population_and_sample,
      input.assistedContext?.population_frame ??
      input.intake.targetPopulation ??
        (language === "en"
          ? "Population and sample require further methodological delimitation."
          : "Poblacion y muestra pendientes de mayor delimitacion metodologica."),
    ),
    data_collection_techniques: derivedTechniques,
    analysis_plan: normalizeText(
      input.draft.analysis_plan,
      input.assistedContext?.analysis_frame ??
      input.intake.availableData ??
        (language === "en"
          ? "Analysis plan to define according to available data and the final method."
          : "Plan de analisis por precisar segun los datos disponibles y el metodo final."),
    ),
    consistency_matrix: specificObjectives.map((objective, index) => ({
      objective,
      question:
        alignedResearchQuestions[index] ??
        alignedResearchQuestions[alignedResearchQuestions.length - 1] ??
        (language === "en"
          ? "How is the proposed objective operationalized?"
          : "Como se operacionaliza el objetivo propuesto?"),
      method: proposedMethodology,
      technique:
        derivedTechniques[0] ??
        (language === "en"
          ? "Technique to define with greater methodological precision"
          : "Tecnica por definir con mayor precision metodologica"),
    })),
    work_plan: deriveWorkPlan(language),
    assumptions: Array.from(
      new Set(
        normalizeList(input.draft.assumptions, [
          language === "en"
            ? "The initial blueprint uses explicit assumptions while the intake and selected evidence are refined."
            : "La version inicial del blueprint usa supuestos explicitos mientras se afina el intake y la evidencia seleccionada.",
        ]).concat(assistedAssumptions),
      ),
    ),
    limitations: normalizeList(input.draft.limitations, [
      language === "en"
        ? "The initial version still requires methodological refinement and manual academic validation."
        : "La version inicial aun requiere refinamiento metodologico y validacion academica manual.",
    ]),
    references_used: normalizeReferenceSnapshots(input.draft.references_used),
  };
}
