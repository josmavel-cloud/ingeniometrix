import { extractSearchTerms } from "@/lib/text";
import {
  buildCitationPlan,
  buildEnrichedBlueprintRecord,
} from "@/server/blueprint/blueprint-engine";
import type {
  BlueprintReferenceInsight,
  BlueprintTemplateContext,
  ResearchBlueprintCore,
  ResearchBlueprintRecord,
} from "@/server/blueprint/blueprint-types";
import type {
  ConsistencyMatrixRow,
  EvidenceLedger,
  MasterSectionDraft,
  SourceIntakeGateResult,
} from "@/server/blueprint-v2/types";
import { cleanText, parseBulletLines } from "@/server/blueprint-v2/utils";

function getDraftText(drafts: MasterSectionDraft[], key: string) {
  return cleanText(drafts.find((draft) => draft.section_key === key)?.content);
}

function getBulletDraft(drafts: MasterSectionDraft[], key: string) {
  return parseBulletLines(drafts.find((draft) => draft.section_key === key)?.content ?? "");
}

function deriveQuestionFromObjective(objective: string) {
  const normalized = objective.replace(/^[*-]\s*/, "").replace(/[.]+$/g, "").trim();

  if (!normalized) {
    return "Pregunta de investigacion por afinar con mayor evidencia.";
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

function buildSpecificResearchQuestions(input: {
  specificObjectives: string[];
  specificQuestions: string[];
}) {
  return input.specificObjectives.map(
    (objective, index) => input.specificQuestions[index] ?? deriveQuestionFromObjective(objective),
  );
}

function getTopFormalSources(input: {
  drafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
}) {
  const usedSourceIds = Array.from(
    new Set(
      input.drafts.flatMap((draft) => [
        ...draft.supported_source_ids,
        ...draft.supported_pdf_source_ids,
      ]),
    ),
  );

  return usedSourceIds
    .map((sourceId) =>
      input.evidenceLedger.source_registry.find((source) => source.source_id === sourceId),
    )
    .filter(
      (source): source is NonNullable<typeof source> =>
        Boolean(source && source.eligible_for_formal_reference),
    );
}

function deriveKeyConstructs(input: {
  problem: string;
  objectives: string[];
  methodology: string;
}) {
  const terms = extractSearchTerms(
    `${input.problem} ${input.objectives.join(" ")} ${input.methodology}`,
    {
      maxTerms: 8,
      minLength: 4,
    },
  );

  return terms.length > 0
    ? terms.map((term) => term.charAt(0).toUpperCase() + term.slice(1))
    : ["Constructos por precisar con revision academica"];
}

function buildWorkPlanFromSchedule(drafts: MasterSectionDraft[]) {
  const scheduleLines = getBulletDraft(drafts, "schedule");

  if (scheduleLines.length > 0) {
    return scheduleLines.slice(0, 5).map((line, index) => ({
      phase: line,
      duration: `Bloque ${index + 1} del cronograma institucional.`,
    }));
  }

  return [
    {
      phase: "Reajuste del planteamiento y consolidacion de antecedentes",
      duration: "Segun el cronograma institucional.",
    },
    {
      phase: "Definicion metodologica y validacion del plan",
      duration: "Segun el cronograma institucional.",
    },
    {
      phase: "Revision final del plan y preparacion de anexos",
      duration: "Segun el cronograma institucional.",
    },
  ];
}

function buildReferenceInsightsFromLedger(evidenceLedger: EvidenceLedger): BlueprintReferenceInsight[] {
  return evidenceLedger.source_registry
    .filter((source) => source.eligible_for_formal_reference)
    .map((source) => {
      const pack = evidenceLedger.evidence_packs.find((item) => item.source_id === source.source_id);
      const currentYear = new Date().getFullYear();

      return {
        reference_id: source.source_id,
        title: source.title,
        doi: source.doi,
        year: source.year,
        venue: source.venue,
        abstract_available: Boolean(source.abstract?.trim()),
        is_recent: typeof source.year === "number" && source.year >= currentYear - 5,
        evidence_strength:
          pack?.pdf_summary?.trim() && source.abstract?.trim()
            ? "high"
            : source.abstract?.trim()
              ? "medium"
              : "low",
        topic_focus: extractSearchTerms(`${source.title} ${source.abstract ?? ""}`, {
          maxTerms: 6,
          minLength: 4,
        }),
        problem_signal: pack?.problem_signal ?? null,
        method_signal: pack?.method_signal ?? null,
        population_or_context_signal: pack?.context_signal ?? null,
        technical_solution_signal: pack?.finding_signal ?? null,
        main_finding_signal: pack?.finding_signal ?? null,
        limitation_signal: pack?.limitation_signal ?? null,
        future_line_signal: pack?.future_line_signal ?? null,
      } satisfies BlueprintReferenceInsight;
    });
}

export function buildLegacyBlueprintFromMaster(input: {
  projectTitle: string;
  projectTemplateKey: string;
  projectDegreeLevel: ResearchBlueprintCore["degree_level"];
  projectUniversity: string;
  projectProgram: string;
  researchLine: string | null | undefined;
  drafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
  consistencyMatrix: ConsistencyMatrixRow[];
  templateContext: BlueprintTemplateContext;
  sourceGate: SourceIntakeGateResult;
}): {
  legacyBlueprint: ResearchBlueprintRecord;
  referenceInsights: BlueprintReferenceInsight[];
} {
  const specificObjectives = getBulletDraft(input.drafts, "specific_objectives");
  const specificQuestions = getBulletDraft(input.drafts, "specific_research_questions");
  const normalizedSpecificQuestions = buildSpecificResearchQuestions({
    specificObjectives:
      specificObjectives.length > 0
        ? specificObjectives
        : ["Objetivo especifico por afinar con mayor evidencia."],
    specificQuestions,
  });
  const methodology =
    getDraftText(input.drafts, "methodology") ||
    getDraftText(input.drafts, "methodological_approach");
  const limitations = getBulletDraft(input.drafts, "scope_and_limitations");
  const referencesUsed = getTopFormalSources({
    drafts: input.drafts,
    evidenceLedger: input.evidenceLedger,
  }).map((source) => ({
    reference_id: source.source_id,
    title: source.title,
    doi: source.doi,
  }));
  const assumptions = input.evidenceLedger.assumptions.map((assumption) => assumption.statement);

  const core: ResearchBlueprintCore = {
    project_title: input.projectTitle,
    template_key: input.projectTemplateKey,
    degree_level: input.projectDegreeLevel,
    university: input.projectUniversity,
    program: input.projectProgram,
    research_line:
      input.researchLine?.trim() ||
      "Linea de investigacion por validar con el programa academico.",
    problem_statement: getDraftText(input.drafts, "problem_statement"),
    problem_delimitation:
      getDraftText(input.drafts, "scope_and_limitations") ||
      getDraftText(input.drafts, "problem_statement"),
    justification: getDraftText(input.drafts, "justification"),
    general_objective: getDraftText(input.drafts, "general_objective"),
    specific_objectives:
      specificObjectives.length > 0
        ? specificObjectives
        : ["Objetivo especifico por afinar con mayor evidencia."],
    research_questions:
      normalizedSpecificQuestions.length > 0
        ? normalizedSpecificQuestions
        : ["Pregunta de investigacion por afinar con mayor evidencia."],
    hypotheses_or_guiding_questions:
      getBulletDraft(input.drafts, "specific_hypotheses").length > 0
        ? getBulletDraft(input.drafts, "specific_hypotheses")
        : [normalizedSpecificQuestions[0] || "Pregunta guia por precisar."],
    key_constructs_or_variables: deriveKeyConstructs({
      problem: getDraftText(input.drafts, "problem_statement"),
      objectives: specificObjectives,
      methodology,
    }),
    proposed_methodology: methodology,
    population_and_sample: getDraftText(input.drafts, "population_and_sample"),
    data_collection_techniques:
      getBulletDraft(input.drafts, "data_collection_techniques").length > 0
        ? getBulletDraft(input.drafts, "data_collection_techniques")
        : [getDraftText(input.drafts, "research_instruments") || "Tecnica por precisar."],
    analysis_plan: getDraftText(input.drafts, "analysis_plan"),
    consistency_matrix: input.consistencyMatrix,
    work_plan: buildWorkPlanFromSchedule(input.drafts),
    assumptions:
      assumptions.length > 0
        ? assumptions
        : [
            "El engine completo la redaccion con base en el intake y la evidencia disponible cuando el soporte formal no alcanzo para cerrar todos los detalles.",
          ],
    limitations:
      limitations.length > 0
        ? limitations
        : ["La version actual requiere revision academica para ajustar alcance y detalle."],
    references_used:
      referencesUsed.length > 0
        ? referencesUsed
        : input.sourceGate.selected_sources.slice(0, 3).map((source) => ({
            reference_id: source.source_id,
            title: source.title,
            doi: source.doi,
          })),
  };
  const referenceInsights = buildReferenceInsightsFromLedger(input.evidenceLedger);
  const citationPlan = buildCitationPlan({
    blueprint: core,
    intake: {
      topic: input.projectTitle,
      problemContext: getDraftText(input.drafts, "problem_statement"),
      researchLine: input.researchLine ?? null,
      academicConstraints: null,
      targetPopulation: getDraftText(input.drafts, "population_and_sample"),
      availableData: null,
      preferredMethodology: methodology,
      advisorNotes: null,
      projectId: "",
      id: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      searchQuery: null,
    },
    referenceInsights,
  });

  return {
    legacyBlueprint: buildEnrichedBlueprintRecord({
      blueprint: core,
      templateContext: input.templateContext,
      referenceInsights,
      citationPlan,
      readinessSnapshot: {
        readiness_status: input.sourceGate.fallback_required ? "assisted" : "ready",
        missing_intake_fields: [],
        warnings: input.sourceGate.coverage_warnings,
        evidence_summary: {
          selected_reference_count: input.sourceGate.selected_source_count,
          abstracts_available_count: input.evidenceLedger.source_registry.filter((source) =>
            Boolean(source.abstract?.trim()),
          ).length,
          problem_signal_count: input.evidenceLedger.evidence_packs.filter((pack) =>
            Boolean(pack.problem_signal),
          ).length,
          method_signal_count: input.evidenceLedger.evidence_packs.filter((pack) =>
            Boolean(pack.method_signal),
          ).length,
          population_signal_count: input.evidenceLedger.evidence_packs.filter((pack) =>
            Boolean(pack.context_signal),
          ).length,
        },
      },
    }),
    referenceInsights,
  };
}
