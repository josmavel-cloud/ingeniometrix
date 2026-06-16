import type {
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchEvidencePlanningSourceCard,
  BlueprintLaunchLimitedInspectionItem,
  BlueprintLaunchLimitedSourceInspectionResult,
} from "@/blueprint_launch/server/local-playground-store";
import type { PdfRelevanceReviewResultV1 } from "@/server/blueprint-engine/quality/pdf-relevance-review";

export type PostInspectionSufficiencyDecision =
  | "READY_FOR_FULL_EXTRACTION"
  | "READY_WITH_WARNINGS"
  | "NEEDS_DEEP_RESEARCH_LIGHT"
  | "NEEDS_SOURCE_REPLACEMENT"
  | "NEEDS_MANUAL_PDF_REVIEW"
  | "BLOCK_INSUFFICIENT_REAL_EVIDENCE";

export type PostInspectionSourceSufficiencyRecommendation = {
  recommendation_id: string;
  priority: "high" | "medium" | "low";
  category:
    | "recover_or_replace_sources"
    | "run_deep_research_light"
    | "review_document_identity"
    | "add_method_or_theory_sources"
    | "add_variable_or_instrument_sources"
    | "recover_secondary_references";
  rationale: string;
  suggested_focus: string[];
  source_ids: string[];
};

export type PostInspectionSourceSufficiencyReportV1 = {
  artifact_type: "post_inspection_source_sufficiency";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  decision: PostInspectionSufficiencyDecision;
  selected_source_count: number;
  inspected_source_count: number;
  usable_source_count: number;
  direct_usable_source_count: number;
  contextual_or_partial_source_count: number;
  method_signal_source_count: number;
  theory_signal_source_count: number;
  variable_signal_source_count: number;
  equation_candidate_count: number;
  table_candidate_count: number;
  figure_candidate_count: number;
  secondary_reference_candidate_count: number;
  source_ids_ready_for_full_extraction: string[];
  source_ids_needing_replacement: string[];
  source_ids_needing_manual_review: string[];
  source_ids_for_deep_research_light: string[];
  missing_evidence_categories: string[];
  recommendations: PostInspectionSourceSufficiencyRecommendation[];
  reasons: string[];
  warnings: string[];
  blockers: string[];
};

type EvidencePlanningSubset = Pick<
  BlueprintLaunchEvidencePlanningResult,
  "sourceCards" | "replacementRecommendedSourceIds" | "identityBlockedSourceIds" | "sufficiencyWarnings"
>;

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function cardBySourceId(cards: BlueprintLaunchEvidencePlanningSourceCard[] | undefined) {
  return new Map((cards ?? []).map((card) => [card.sourceId, card]));
}

function isUsableInspection(item: BlueprintLaunchLimitedInspectionItem) {
  return item.status === "inspected" && item.textCharCount >= 500 && item.identityStatus !== "mismatch";
}

function sourceCardTopicFit(card: BlueprintLaunchEvidencePlanningSourceCard | undefined) {
  if (!card) {
    return "unknown";
  }
  if (card.topicRelevance === "directa" && card.proposalUsefulness !== "baja") {
    return "direct";
  }
  if (card.topicRelevance === "parcial" || card.proposalUsefulness === "media") {
    return "partial";
  }
  return "contextual";
}

function isDirectByPdfReview(
  sourceId: string,
  pdfRelevanceReview: PdfRelevanceReviewResultV1 | null | undefined,
) {
  const item = pdfRelevanceReview?.items.find((review) => review.source_id === sourceId);

  return (
    item?.relevance_class === "nuclear_direct" &&
    item.allowed_evidence_use === "central_claim_support" &&
    item.inspected_text_available
  );
}

function isContextualByPdfReview(
  sourceId: string,
  pdfRelevanceReview: PdfRelevanceReviewResultV1 | null | undefined,
) {
  const item = pdfRelevanceReview?.items.find((review) => review.source_id === sourceId);

  return Boolean(item && !isDirectByPdfReview(sourceId, pdfRelevanceReview));
}

function sourceIds(items: BlueprintLaunchLimitedInspectionItem[]) {
  return items.map((item) => item.sourceId);
}

function recommendation(input: PostInspectionSourceSufficiencyRecommendation) {
  return input;
}

export function buildPostInspectionSourceSufficiencyReport(input: {
  case_id?: string | null;
  selected_source_count: number;
  evidencePlanning?: EvidencePlanningSubset | null;
  limitedInspection: BlueprintLaunchLimitedSourceInspectionResult;
  pdfRelevanceReview?: PdfRelevanceReviewResultV1 | null;
  minUsableFullTextSources?: number | null;
  minDirectUsableSources?: number | null;
}): PostInspectionSourceSufficiencyReportV1 {
  const cards = cardBySourceId(input.evidencePlanning?.sourceCards);
  const minUsable = input.minUsableFullTextSources ?? 3;
  const minDirectUsable = input.minDirectUsableSources ?? 1;
  const items = input.limitedInspection.items;
  const usableItems = items.filter(isUsableInspection);
  const hasPdfRelevanceReview = Boolean(input.pdfRelevanceReview);
  const directUsableItems = usableItems.filter((item) =>
    hasPdfRelevanceReview
      ? isDirectByPdfReview(item.sourceId, input.pdfRelevanceReview)
      : sourceCardTopicFit(cards.get(item.sourceId)) === "direct",
  );
  const contextualOrPartialItems = usableItems.filter((item) =>
    hasPdfRelevanceReview
      ? isContextualByPdfReview(item.sourceId, input.pdfRelevanceReview)
      : sourceCardTopicFit(cards.get(item.sourceId)) !== "direct",
  );
  const methodSignalItems = usableItems.filter((item) => item.methodSignalCount > 0);
  const theorySignalItems = usableItems.filter((item) => item.theorySignalCount > 0);
  const variableSignalItems = usableItems.filter((item) => item.variableSignalCount > 0);
  const sourceIdsNeedingManualReview = unique([
    ...input.limitedInspection.sourceIdsNeedingManualReview,
    ...items
      .filter((item) => item.identityStatus === "mismatch" || item.identityStatus === "weak_match")
      .map((item) => item.sourceId),
    ...(input.evidencePlanning?.identityBlockedSourceIds ?? []),
  ]);
  const sourceIdsNeedingReplacement = unique([
    ...input.limitedInspection.sourceIdsNeedingReplacement,
    ...items
      .filter((item) => item.status !== "inspected" || item.textCharCount < 500)
      .map((item) => item.sourceId),
    ...(input.evidencePlanning?.replacementRecommendedSourceIds ?? []),
    ...(input.pdfRelevanceReview?.source_ids_needing_replacement ?? []),
  ]);
  const equationCandidateCount = items.reduce((sum, item) => sum + item.equationCandidateCount, 0);
  const tableCandidateCount = items.reduce((sum, item) => sum + item.tableCandidateCount, 0);
  const figureCandidateCount = items.reduce((sum, item) => sum + item.figureCandidateCount, 0);
  const secondaryReferenceCandidateCount = items.reduce(
    (sum, item) => sum + item.secondaryReferenceCandidateCount,
    0,
  );
  const missingEvidenceCategories: string[] = [];
  const reasons: string[] = [];
  const warnings = unique([
    ...input.limitedInspection.warnings,
    ...(input.evidencePlanning?.sufficiencyWarnings ?? []),
    ...(input.pdfRelevanceReview?.warnings ?? []),
    hasPdfRelevanceReview
      ? "La suficiencia usa revision de relevancia desde PDF/texto inspeccionado, no clasificacion metadata de Step 3."
      : "No se recibio revision PDF de relevancia; se uso compatibilidad antigua basada en hints de Step 3.",
    secondaryReferenceCandidateCount > 0
      ? `${secondaryReferenceCandidateCount} secondary reference candidate(s) detected during limited inspection; recover before using them as citations.`
      : null,
  ]);
  const recommendations: PostInspectionSourceSufficiencyRecommendation[] = [];

  if (usableItems.length === 0) {
    reasons.push("La inspeccion limitada no encontro fuentes con texto util e identidad aceptable.");
    recommendations.push(
      recommendation({
        recommendation_id: "replace-no-usable-sources",
        priority: "high",
        category: "recover_or_replace_sources",
        rationale: "No hay evidencia fuente-texto util para continuar a extraccion completa.",
        suggested_focus: ["full text", "source identity", "direct evidence"],
        source_ids: sourceIds(items),
      }),
    );
  }

  if (usableItems.length > 0 && usableItems.length < minUsable) {
    reasons.push(`Solo ${usableItems.length} fuente(s) util(es) tras inspeccion; minimo requerido: ${minUsable}.`);
    recommendations.push(
      recommendation({
        recommendation_id: "add-usable-full-text-sources",
        priority: "high",
        category: "recover_or_replace_sources",
        rationale: "La cobertura de texto completo util es insuficiente para sostener extraccion completa.",
        suggested_focus: ["usable full text", "direct topic fit", "complete PDF"],
        source_ids: sourceIdsNeedingReplacement,
      }),
    );
  }

  if (sourceIdsNeedingManualReview.length > 0) {
    reasons.push("Hay fuentes con identidad documental debil, sospechosa o bloqueada antes de extraccion completa.");
    recommendations.push(
      recommendation({
        recommendation_id: "review-document-identity",
        priority: "high",
        category: "review_document_identity",
        rationale: "No se debe usar una fuente como evidencia central si el PDF o texto no corresponde claramente al registro.",
        suggested_focus: ["DOI/title match", "publisher landing page", "manual PDF verification"],
        source_ids: sourceIdsNeedingManualReview,
      }),
    );
  }

  if (directUsableItems.length < minDirectUsable) {
    missingEvidenceCategories.push("direct_nuclear_sources");
    reasons.push(
      hasPdfRelevanceReview
        ? "No hay suficientes fuentes nucleares directas segun la revision de alto nivel del PDF/texto inspeccionado."
        : "No hay suficientes fuentes directas/nucleares con texto util tras inspeccion.",
    );
  }

  if (methodSignalItems.length === 0) {
    missingEvidenceCategories.push("method_or_study_design");
    reasons.push("No se detectaron senales suficientes de metodo, diseno, instrumento o protocolo.");
  }

  if (theorySignalItems.length === 0) {
    missingEvidenceCategories.push("theory_or_model");
    reasons.push("No se detectaron senales suficientes de teoria, marco conceptual, modelo o guia.");
  }

  if (variableSignalItems.length === 0) {
    missingEvidenceCategories.push("variables_or_indicators");
    reasons.push("No se detectaron senales suficientes de variables, indicadores, instrumentos o resultados.");
  }

  if (missingEvidenceCategories.length > 0) {
    recommendations.push(
      recommendation({
        recommendation_id: "run-deep-research-light",
        priority: "high",
        category: "run_deep_research_light",
        rationale:
          "Despues de inspeccionar texto real, aun faltan categorias academicas nucleares; conviene expandir busqueda con gaps reales.",
        suggested_focus: unique([
          ...missingEvidenceCategories,
          "methodology",
          "theoretical framework",
          "variables",
          secondaryReferenceCandidateCount > 0 ? "secondary references cited in inspected PDFs" : null,
        ]),
        source_ids: usableItems.map((item) => item.sourceId),
      }),
    );
  }

  if (secondaryReferenceCandidateCount > 0) {
    recommendations.push(
      recommendation({
        recommendation_id: "recover-secondary-references",
        priority: "medium",
        category: "recover_secondary_references",
        rationale:
          "Los textos inspeccionados citan referencias internas potencialmente utiles; deben recuperarse por OpenAlex/Crossref antes de usarse.",
        suggested_focus: ["cited references", "OpenAlex", "Crossref"],
        source_ids: usableItems.filter((item) => item.secondaryReferenceCandidateCount > 0).map((item) => item.sourceId),
      }),
    );
  }

  let decision: PostInspectionSufficiencyDecision = "READY_FOR_FULL_EXTRACTION";
  const blockers: string[] = [];

  if (usableItems.length === 0) {
    decision = "BLOCK_INSUFFICIENT_REAL_EVIDENCE";
    blockers.push("No usable inspected source text is available.");
  } else if (sourceIdsNeedingManualReview.length > 0) {
    decision = "NEEDS_MANUAL_PDF_REVIEW";
    blockers.push("One or more inspected sources require document identity review.");
  } else if (usableItems.length < minUsable) {
    decision = "NEEDS_SOURCE_REPLACEMENT";
    blockers.push("Usable inspected source count is below the configured minimum.");
  } else if (missingEvidenceCategories.length > 0) {
    decision = "NEEDS_DEEP_RESEARCH_LIGHT";
    blockers.push("Post-inspection evidence categories remain incomplete.");
  } else if (sourceIdsNeedingReplacement.length > 0 || warnings.length > 0) {
    decision = "READY_WITH_WARNINGS";
  }

  if (reasons.length === 0) {
    reasons.push("La inspeccion limitada encontro fuentes utiles y cobertura minima para extraccion completa.");
  }

  return {
    artifact_type: "post_inspection_source_sufficiency",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.case_id ?? null,
    decision,
    selected_source_count: input.selected_source_count,
    inspected_source_count: items.filter((item) => item.status === "inspected").length,
    usable_source_count: usableItems.length,
    direct_usable_source_count: directUsableItems.length,
    contextual_or_partial_source_count: contextualOrPartialItems.length,
    method_signal_source_count: methodSignalItems.length,
    theory_signal_source_count: theorySignalItems.length,
    variable_signal_source_count: variableSignalItems.length,
    equation_candidate_count: equationCandidateCount,
    table_candidate_count: tableCandidateCount,
    figure_candidate_count: figureCandidateCount,
    secondary_reference_candidate_count: secondaryReferenceCandidateCount,
    source_ids_ready_for_full_extraction: usableItems.map((item) => item.sourceId),
    source_ids_needing_replacement: sourceIdsNeedingReplacement,
    source_ids_needing_manual_review: sourceIdsNeedingManualReview,
    source_ids_for_deep_research_light:
      missingEvidenceCategories.length > 0 ? usableItems.map((item) => item.sourceId) : [],
    missing_evidence_categories: missingEvidenceCategories,
    recommendations,
    reasons: unique(reasons),
    warnings,
    blockers,
  };
}

export function shouldStopAfterPostInspectionSufficiency(input: {
  report: Pick<PostInspectionSourceSufficiencyReportV1, "decision">;
  allowBlocked: boolean;
}) {
  if (input.allowBlocked) {
    return false;
  }

  return !["READY_FOR_FULL_EXTRACTION", "READY_WITH_WARNINGS"].includes(input.report.decision);
}

export function renderPostInspectionSourceSufficiencyReport(report: PostInspectionSourceSufficiencyReportV1) {
  return [
    "# Post-Inspection Source Sufficiency",
    "",
    `- case_id: ${report.case_id ?? "unknown"}`,
    `- decision: ${report.decision}`,
    `- selected_source_count: ${report.selected_source_count}`,
    `- inspected_source_count: ${report.inspected_source_count}`,
    `- usable_source_count: ${report.usable_source_count}`,
    `- direct_usable_source_count: ${report.direct_usable_source_count}`,
    `- method_signal_source_count: ${report.method_signal_source_count}`,
    `- theory_signal_source_count: ${report.theory_signal_source_count}`,
    `- variable_signal_source_count: ${report.variable_signal_source_count}`,
    `- secondary_reference_candidate_count: ${report.secondary_reference_candidate_count}`,
    "",
    "## Missing Evidence Categories",
    ...(report.missing_evidence_categories.length
      ? report.missing_evidence_categories.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Reasons",
    ...report.reasons.map((reason) => `- ${reason}`),
    "",
    "## Recommendations",
    ...(report.recommendations.length
      ? report.recommendations.map((item, index) =>
          [
            `${index + 1}. ${item.category} (${item.priority})`,
            `   - rationale: ${item.rationale}`,
            `   - suggested_focus: ${item.suggested_focus.join("; ") || "none"}`,
            `   - source_ids: ${item.source_ids.join("; ") || "none"}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Blockers",
    ...(report.blockers.length ? report.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}
