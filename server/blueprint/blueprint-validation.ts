import { normalizeTitle, extractSearchTerms } from "@/lib/text";

import type { ResearchBlueprintRecord } from "./blueprint-types";

type IntakeLike = {
  researchLine?: string | null;
  problemContext?: string | null;
  targetPopulation?: string | null;
  availableData?: string | null;
  preferredMethodology?: string | null;
  advisorNotes?: string | null;
};

function keywordOverlap(left: string | null | undefined, right: string | null | undefined) {
  const leftTerms = new Set(extractSearchTerms(left, { maxTerms: 8, minLength: 4 }));
  const rightTerms = extractSearchTerms(right, { maxTerms: 8, minLength: 4 });

  return rightTerms.filter((term) => leftTerms.has(term)).length;
}

export function validateBlueprintTraceability(
  blueprint: ResearchBlueprintRecord,
  selectedReferences: Array<{ id: string; title: string; doi: string | null }>,
) {
  const selectedReferenceIds = new Set(selectedReferences.map((reference) => reference.id));
  const unresolvedReferenceEntries = blueprint.references_used.filter(
    (reference) => !reference.reference_id?.trim(),
  );
  const invalidReferenceIds = blueprint.references_used
    .map((reference) => reference.reference_id?.trim())
    .filter((referenceId): referenceId is string => Boolean(referenceId))
    .filter((referenceId) => !selectedReferenceIds.has(referenceId));

  if (unresolvedReferenceEntries.length > 0) {
    throw new Error(
      `El blueprint devolvio ${unresolvedReferenceEntries.length} referencia(s) sin ID resoluble dentro del set seleccionado.`,
    );
  }

  if (invalidReferenceIds.length > 0) {
    throw new Error(
      `El blueprint usa referencias no seleccionadas: ${Array.from(new Set(invalidReferenceIds)).join(", ")}.`,
    );
  }

  if (blueprint.references_used.length === 0) {
    throw new Error("El blueprint no incluyo referencias trazables.");
  }
}

export function validateBlueprintCitationPlan(
  blueprint: ResearchBlueprintRecord,
  selectedReferences: Array<{ id: string }>,
) {
  const selectedReferenceIds = new Set(selectedReferences.map((reference) => reference.id));
  const invalidSectionReferenceIds =
    blueprint.citation_plan
      ?.flatMap((section) => section.supported_reference_ids)
      .filter((referenceId) => !selectedReferenceIds.has(referenceId)) ?? [];

  if (invalidSectionReferenceIds.length > 0) {
    throw new Error(
      `El citation plan usa referencias no seleccionadas: ${Array.from(new Set(invalidSectionReferenceIds)).join(", ")}.`,
    );
  }
}

export function buildCoherenceReport(
  blueprint: ResearchBlueprintRecord,
  intake: IntakeLike,
  selectedReferences: Array<{ id: string }>,
) {
  const problemObjectiveOverlap = keywordOverlap(
    blueprint.problem_statement,
    blueprint.general_objective,
  );
  const objectiveQuestionGap = Math.abs(
    blueprint.specific_objectives.length - blueprint.research_questions.length,
  );
  const matrixGap = Math.abs(
    blueprint.consistency_matrix.length - blueprint.specific_objectives.length,
  );
  const allQuestionsMapped = blueprint.consistency_matrix.every(
    (row, index) => row.question === blueprint.research_questions[index],
  );
  const hasMethodAndMatrix =
    blueprint.proposed_methodology.trim().length > 0 &&
    blueprint.consistency_matrix.length > 0;
  const hasPopulationFit =
    (intake.targetPopulation?.trim().length ?? 0) > 0 &&
    blueprint.population_and_sample.trim().length > 0;
  const hasTechniquesAndAnalysis =
    blueprint.data_collection_techniques.length > 0 &&
    blueprint.analysis_plan.trim().length > 0;
  const invalidTraceability = blueprint.references_used.some(
    (reference) => !selectedReferences.find((item) => item.id === reference.reference_id),
  );
  const weakCitationCoverage =
    blueprint.citation_plan?.filter(
      (section) => section.support_level === "intake_only" || section.support_level === "assumption",
    ).length ?? 0;

  const missingInformationFlags = [
    !intake.researchLine?.trim() ? "La linea de investigacion fue poco precisa o no fue indicada." : null,
    !intake.availableData?.trim() ? "No se especificaron claramente los datos disponibles." : null,
    !intake.preferredMethodology?.trim()
      ? "No se indico una metodologia preferida desde el intake."
      : null,
    !intake.advisorNotes?.trim()
      ? "No se registraron observaciones del asesor en esta version."
      : null,
    objectiveQuestionGap > 0
      ? "La cantidad de objetivos especificos y preguntas de investigacion no coincide."
      : null,
    matrixGap > 0 || !allQuestionsMapped
      ? "La matriz de consistencia no refleja una relacion 1 a 1 entre objetivos y preguntas."
      : null,
  ].filter((flag): flag is string => Boolean(flag));

  const riskFlags = [
    blueprint.assumptions.length >= 4
      ? "El blueprint depende de varias assumptions; conviene revisar alcance y precision del intake."
      : null,
    blueprint.references_used.length < 5
      ? "Se usaron pocas referencias para sustentar el blueprint."
      : null,
    normalizeTitle(blueprint.population_and_sample).includes("pendiente")
      ? "La delimitacion de poblacion y muestra aun requiere precision."
      : null,
    weakCitationCoverage >= 3
      ? "Varias secciones del blueprint dependen mas del intake o assumptions que de soporte bibliografico directo."
      : null,
  ].filter((flag): flag is string => Boolean(flag));

  return {
    problem_objective_alignment: {
      status:
        problemObjectiveOverlap >= 2
          ? "pass"
          : problemObjectiveOverlap === 1
            ? "warning"
            : "fail",
      notes:
        problemObjectiveOverlap >= 2
          ? "El objetivo general mantiene una relacion clara con el problema planteado."
          : problemObjectiveOverlap === 1
            ? "El objetivo general guarda relacion parcial con el problema y conviene afinar el foco."
            : "El objetivo general no evidencia alineacion suficiente con el problema planteado.",
    },
    objective_question_alignment: {
      status:
        objectiveQuestionGap === 0 && matrixGap === 0 && allQuestionsMapped
          ? "pass"
          : objectiveQuestionGap <= 1
            ? "warning"
            : "fail",
      notes:
        objectiveQuestionGap === 0 && matrixGap === 0 && allQuestionsMapped
          ? "Cada objetivo especifico tiene una pregunta de investigacion alineada y una matriz consistente."
          : objectiveQuestionGap <= 1
            ? "La relacion entre objetivos, preguntas o matriz aun necesita un ajuste fino para quedar 1 a 1."
            : "Existe un desbalance claro entre objetivos especificos, preguntas y matriz de consistencia.",
    },
    objective_method_alignment: {
      status: hasMethodAndMatrix ? "pass" : "warning",
      notes: hasMethodAndMatrix
        ? "La metodologia propuesta y la matriz de consistencia muestran alineacion basica."
        : "La metodologia o la matriz de consistencia aun necesitan mayor definicion.",
    },
    population_method_alignment: {
      status: hasPopulationFit ? "pass" : "warning",
      notes: hasPopulationFit
        ? "La poblacion y muestra mantienen coherencia con el enfoque descrito."
        : "La delimitacion de poblacion y muestra aun no esta suficientemente conectada al metodo.",
    },
    technique_analysis_alignment: {
      status: hasTechniquesAndAnalysis ? "pass" : "warning",
      notes: hasTechniquesAndAnalysis
        ? "Las tecnicas de recoleccion y el plan de analisis tienen una relacion razonable."
        : "Las tecnicas o el plan de analisis aun requieren ajuste para verse consistentes.",
    },
    citation_traceability: {
      status: invalidTraceability ? "fail" : "pass",
      notes: invalidTraceability
        ? "Se detectaron referencias usadas fuera del set seleccionado por el usuario."
        : "Todas las referencias usadas pueden trazarse al set seleccionado.",
    },
    missing_information_flags: missingInformationFlags,
    risk_flags: riskFlags,
  };
}
