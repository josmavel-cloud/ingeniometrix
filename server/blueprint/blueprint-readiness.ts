import type { Intake } from "@prisma/client";

import type {
  BlueprintReadinessSnapshot,
  BlueprintReferenceInsight,
} from "./blueprint-types";

export function buildBlueprintReadinessSnapshot(input: {
  intake: Intake;
  referenceInsights: BlueprintReferenceInsight[];
}): BlueprintReadinessSnapshot {
  const missingIntakeFields = [
    !input.intake.problemContext?.trim() ? "problem_context" : null,
    !input.intake.targetPopulation?.trim() ? "target_population" : null,
    !input.intake.preferredMethodology?.trim() ? "preferred_methodology" : null,
    !input.intake.researchLine?.trim() ? "research_line" : null,
  ].filter((item): item is string => Boolean(item));

  const abstractsAvailableCount = input.referenceInsights.filter(
    (insight) => insight.abstract_available,
  ).length;
  const recentAbstractCount = input.referenceInsights.filter(
    (insight) => insight.abstract_available && insight.is_recent,
  ).length;
  const problemSignalCount = input.referenceInsights.filter((insight) =>
    Boolean(insight.problem_signal),
  ).length;
  const methodSignalCount = input.referenceInsights.filter((insight) =>
    Boolean(insight.method_signal),
  ).length;
  const populationSignalCount = input.referenceInsights.filter((insight) =>
    Boolean(insight.population_or_context_signal),
  ).length;

  const warnings = [
    missingIntakeFields.length > 0
      ? `Faltan campos clave del intake: ${missingIntakeFields.join(", ")}.`
      : null,
    abstractsAvailableCount < 2
      ? "Hay pocas referencias con abstract utilizable para sostener el blueprint."
      : null,
    recentAbstractCount < 2
      ? "Hay pocos antecedentes recientes con abstract utilizable para sostener el blueprint."
      : null,
    problemSignalCount === 0
      ? "Las fuentes seleccionadas no muestran una senal clara de problema."
      : null,
    methodSignalCount === 0
      ? "Las fuentes seleccionadas no muestran una senal metodologica clara."
      : null,
    populationSignalCount === 0
      ? "Las fuentes seleccionadas no muestran una senal clara de poblacion o contexto."
      : null,
  ].filter((item): item is string => Boolean(item));

  const readinessStatus =
    missingIntakeFields.length === 0 &&
    abstractsAvailableCount >= 2 &&
    problemSignalCount > 0 &&
    methodSignalCount > 0 &&
    populationSignalCount > 0
      ? "ready"
      : "assisted";

  return {
    readiness_status: readinessStatus,
    missing_intake_fields: missingIntakeFields,
    warnings,
    evidence_summary: {
      selected_reference_count: input.referenceInsights.length,
      abstracts_available_count: abstractsAvailableCount,
      problem_signal_count: problemSignalCount,
      method_signal_count: methodSignalCount,
      population_signal_count: populationSignalCount,
    },
  };
}
