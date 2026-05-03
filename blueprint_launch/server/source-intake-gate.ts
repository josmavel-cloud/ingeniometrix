import {
  type BlueprintLaunchReferenceListItem,
  type BlueprintLaunchSourceAccessResolutionResult,
  type BlueprintLaunchSourceIntakeGateDecision,
  type BlueprintLaunchSourceIntakeGateResult,
} from "./local-playground-store";

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function buildSummary(
  decision: BlueprintLaunchSourceIntakeGateDecision,
  selectedCount: number,
  highOrMediumCount: number,
  abstractCount: number,
  completePublicContentCount: number,
  partialPublicContentCount: number,
) {
  if (decision === "PASS") {
    return `Gate aprobado con ${selectedCount} fuentes, ${highOrMediumCount} de calidad alta/media, ${abstractCount} con abstract, ${completePublicContentCount} con contenido publico completo y ${partialPublicContentCount} con acceso parcial.`;
  }

  if (decision === "PASS_WITH_WARNINGS") {
    return `Gate apto con alertas: ${selectedCount} fuentes seleccionadas, ${highOrMediumCount} de calidad alta/media, ${abstractCount} con abstract, ${completePublicContentCount} con contenido publico completo y ${partialPublicContentCount} con acceso parcial.`;
  }

  return `Gate bloqueado: el set seleccionado no ofrece cobertura minima suficiente para seguir al paso de completar evidencia.`;
}

function buildRecommendation(decision: BlueprintLaunchSourceIntakeGateDecision) {
  if (decision === "PASS") {
    return "Continuar al paso 3: completar evidencia.";
  }

  if (decision === "PASS_WITH_WARNINGS") {
    return "Continuar al paso 3 con alertas visibles y revisar si conviene agregar 1 o 2 fuentes mas.";
  }

  return "Volver a busqueda y seleccion antes de seguir al paso 3.";
}

export function evaluateBlueprintLaunchSourceIntakeGate(
  references: BlueprintLaunchReferenceListItem[],
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult,
): BlueprintLaunchSourceIntakeGateResult {
  const selected = references
    .filter((item) => item.selected)
    .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999));
  const selectedCount = selected.length;
  const highOrMediumCount = selected.filter((item) =>
    item.scoreBreakdown?.label === "ALTO" || item.scoreBreakdown?.label === "MEDIO",
  ).length;
  const abstractCount = selected.filter((item) => Boolean(item.reference.abstract?.trim())).length;
  const doiOrLandingCount = selected.filter(
    (item) => Boolean(item.reference.doi || item.reference.landingPageUrl),
  ).length;
  const completePublicContentCount = sourceAccessResolution.completePublicCount;
  const partialPublicContentCount = sourceAccessResolution.partialPublicCount;
  const averageRelevanceScore = average(
    selected.map((item) => item.relevanceScore ?? 0).filter((value) => value > 0),
  );
  const warnings: string[] = [];
  const blockingReasons: string[] = [];

  if (selectedCount < 3) {
    blockingReasons.push("Hay menos de 3 fuentes seleccionadas.");
  } else if (selectedCount === 3) {
    warnings.push("Solo hay 3 fuentes seleccionadas; el set es minimo.");
  }

  if (highOrMediumCount < 2) {
    blockingReasons.push("Menos de 2 fuentes quedaron con score ALTO o MEDIO.");
  } else if (highOrMediumCount === 2) {
    warnings.push("Solo 2 fuentes tienen score ALTO o MEDIO.");
  }

  if (abstractCount === 0) {
    blockingReasons.push("Ninguna fuente seleccionada tiene abstract disponible.");
  } else if (abstractCount < Math.ceil(selectedCount * 0.6)) {
    warnings.push("La cobertura de abstracts es menor al 60%.");
  }

  if (doiOrLandingCount < Math.ceil(selectedCount * 0.7)) {
    warnings.push("La cobertura de DOI o landing page es menor a la esperada.");
  }

  if (completePublicContentCount === 0) {
    warnings.push("No hay contenido publico completo resuelto en la seleccion actual.");
  } else if (completePublicContentCount < 2) {
    warnings.push("Solo hay 1 fuente con contenido publico completo resuelto.");
  }

  if (partialPublicContentCount > 0) {
    warnings.push("Parte del set solo tiene acceso parcial y puede requerir completar evidencia.");
  }

  if (averageRelevanceScore > 0 && averageRelevanceScore < 40) {
    warnings.push("El score promedio de relevancia es bajo para continuar con confianza.");
  }

  const decision: BlueprintLaunchSourceIntakeGateDecision =
    blockingReasons.length > 0
      ? "BLOCK"
      : warnings.length > 0
        ? "PASS_WITH_WARNINGS"
        : "PASS";

  return {
    savedAt: new Date().toISOString(),
    decision,
    summary: buildSummary(
      decision,
      selectedCount,
      highOrMediumCount,
      abstractCount,
      completePublicContentCount,
      partialPublicContentCount,
    ),
    nextStepRecommendation: buildRecommendation(decision),
    selectedCount,
    highOrMediumCount,
    abstractCount,
    doiOrLandingCount,
    completePublicContentCount,
    partialPublicContentCount,
    averageRelevanceScore,
    warnings,
    blockingReasons,
  };
}
