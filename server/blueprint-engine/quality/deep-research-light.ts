import type {
  BlueprintLaunchEvidencePlanningResult,
  BlueprintLaunchLimitedInspectionItem,
  BlueprintLaunchLimitedSourceInspectionResult,
  BlueprintLaunchSelectedSourceBundle,
} from "@/blueprint_launch/server/local-playground-store";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";

export type DeepResearchLightQueryCategory =
  | "direct_nuclear_sources"
  | "method_or_study_design"
  | "theory_or_model"
  | "variables_or_indicators"
  | "secondary_reference_recovery";

export type DeepResearchLightQueryFamily = {
  family_id: string;
  category: DeepResearchLightQueryCategory;
  priority: "high" | "medium" | "low";
  purpose_es: string;
  rationale_es: string;
  source_ids: string[];
  queries: string[];
  expected_source_role: "primary_evidence" | "method_support" | "theory_support" | "measurement_support" | "recover_cited_source";
  selection_warning_es: string;
};

export type DeepResearchLightGapAnalysisV1 = {
  artifact_type: "deep_research_light_gap_analysis";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  intake_topic: string | null;
  trigger_decision: PostInspectionSourceSufficiencyReportV1["decision"];
  missing_evidence_categories: string[];
  inspected_source_count: number;
  usable_source_count: number;
  direct_usable_source_count: number;
  method_signal_source_count: number;
  theory_signal_source_count: number;
  variable_signal_source_count: number;
  secondary_reference_candidate_count: number;
  selected_sources: Array<{
    source_id: string;
    title: string;
    status: BlueprintLaunchLimitedInspectionItem["status"] | "not_inspected";
    identity_status: BlueprintLaunchLimitedInspectionItem["identityStatus"] | "not_inspected";
    text_char_count: number;
    method_signal_count: number;
    theory_signal_count: number;
    variable_signal_count: number;
    warnings: string[];
  }>;
  reasons_es: string[];
  warnings: string[];
  blockers: string[];
};

export type DeepResearchLightSearchPlanV1 = {
  artifact_type: "deep_research_light_search_plan";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  no_external_calls_made: true;
  query_families: DeepResearchLightQueryFamily[];
  recommended_candidate_search_command: string | null;
  source_selection_policy_es: string[];
  warnings: string[];
};

export type DeepResearchLightReferenceCandidate = {
  candidate_id: string;
  discovered_in_source_id: string;
  discovered_in_source_title: string | null;
  marker: string;
  title: string | null;
  year: number | null;
  doi: string | null;
  recommended_search_query: string;
  citable_status: "not_citable_until_recovered";
  reasons: string[];
  warnings: string[];
};

export type DeepResearchLightReferenceCandidatesV1 = {
  artifact_type: "deep_research_light_reference_candidates";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  candidate_count: number;
  candidates: DeepResearchLightReferenceCandidate[];
  warnings: string[];
};

export type DeepResearchLightArtifactsV1 = {
  gapAnalysis: DeepResearchLightGapAnalysisV1;
  searchPlan: DeepResearchLightSearchPlanV1;
  referenceCandidates: DeepResearchLightReferenceCandidatesV1;
};

function unique(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value?.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = normalize(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .replace(/[^a-z0-9./:-]+/g, " ")
    .trim();
}

function safeId(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "candidate";
}

function clip(value: string | null | undefined, max = 220) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function extractDoi(value: string) {
  const match = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i.exec(value);
  return match?.[0]?.replace(/[.,;)\]]+$/, "") ?? null;
}

function extractYear(value: string) {
  const match = /\b(19|20)\d{2}[a-z]?\b/i.exec(value);
  if (!match) return null;
  const parsed = Number.parseInt(match[0].slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferTitle(entry: string, doi: string | null) {
  const cleaned = entry
    .replace(/\bdoi\s*:\s*\S+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(doi ?? "", "")
    .replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s*/, "")
    .trim();
  const parts = cleaned.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.find((part) => part.length >= 16 && !/\b(19|20)\d{2}\b/.test(part.slice(0, 12)));
  return candidate ? clip(candidate, 180) : null;
}

function currentTopicTerms(input: {
  bundle: BlueprintLaunchSelectedSourceBundle;
  intake?: Record<string, unknown> | null;
  evidencePlanning?: BlueprintLaunchEvidencePlanningResult | null;
}) {
  const intakeValues = input.intake
    ? Object.values(input.intake).filter((value): value is string => typeof value === "string")
    : [];
  const selectedTitles = input.bundle.sources.map((source) => source.reference.title);
  const planningHints = [
    ...(input.evidencePlanning?.sourceCards.flatMap((card) => [
      ...card.methodologyHints,
      ...card.frameworkHints,
      ...card.extractionFocus,
    ]) ?? []),
  ];
  const text = unique([
    input.bundle.intakeTopic,
    input.bundle.searchQuery,
    ...intakeValues,
    ...selectedTitles,
    ...planningHints,
  ]).join(" ");
  const stop = new Set([
    "about",
    "academic",
    "analisis",
    "analysis",
    "context",
    "contexto",
    "current",
    "datos",
    "degree",
    "diseno",
    "estudio",
    "fuente",
    "fuentes",
    "investigacion",
    "metodo",
    "method",
    "methodology",
    "para",
    "problema",
    "research",
    "source",
    "study",
    "tesis",
    "topic",
  ]);

  return unique(
    normalize(text)
      .split(/[^a-z0-9./:-]+/)
      .filter((term) => term.length >= 4 && !stop.has(term))
      .slice(0, 24),
  );
}

function buildQueries(input: {
  category: DeepResearchLightQueryCategory;
  topicTerms: string[];
  missingCategories: string[];
  secondaryCandidates: DeepResearchLightReferenceCandidate[];
}) {
  const core = input.topicTerms.slice(0, 8);
  const narrowCore = input.topicTerms.slice(0, 5);

  if (input.category === "method_or_study_design") {
    return unique([
      [...core, "methodology", "study design"].join(" "),
      [...narrowCore, "protocol", "instrument", "validation"].join(" "),
      [...narrowCore, "metodologia", "diseno", "validacion"].join(" "),
    ]).slice(0, 4);
  }

  if (input.category === "theory_or_model") {
    return unique([
      [...core, "theory", "model", "framework"].join(" "),
      [...narrowCore, "conceptual framework", "theoretical framework"].join(" "),
      [...narrowCore, "teoria", "modelo", "marco conceptual"].join(" "),
    ]).slice(0, 4);
  }

  if (input.category === "variables_or_indicators") {
    return unique([
      [...core, "variables", "indicators", "outcomes"].join(" "),
      [...narrowCore, "measurement", "instrument", "scale"].join(" "),
      [...narrowCore, "variables", "indicadores", "instrumentos"].join(" "),
    ]).slice(0, 4);
  }

  if (input.category === "secondary_reference_recovery") {
    return unique(input.secondaryCandidates.map((candidate) => candidate.recommended_search_query)).slice(0, 8);
  }

  return unique([
    [...core, "evidence"].join(" "),
    [...narrowCore, "systematic review"].join(" "),
    [...narrowCore, "empirical study"].join(" "),
  ]).slice(0, 4);
}

function familyForCategory(input: {
  category: DeepResearchLightQueryCategory;
  topicTerms: string[];
  sourceIds: string[];
  secondaryCandidates: DeepResearchLightReferenceCandidate[];
}): DeepResearchLightQueryFamily {
  const labels: Record<
    DeepResearchLightQueryCategory,
    Pick<DeepResearchLightQueryFamily, "purpose_es" | "rationale_es" | "expected_source_role" | "selection_warning_es">
  > = {
    direct_nuclear_sources: {
      purpose_es: "Recuperar fuentes nucleares directamente alineadas con el objeto, problema y alcance del intake actual.",
      rationale_es: "La cobertura directa con texto util aun no es suficiente para sostener afirmaciones centrales.",
      expected_source_role: "primary_evidence",
      selection_warning_es: "Seleccionar solo si la fuente trata el tema actual de forma directa y tiene texto completo verificable.",
    },
    method_or_study_design: {
      purpose_es: "Recuperar fuentes que definan metodo, diseno, protocolo, instrumento o estrategia de estudio.",
      rationale_es: "La inspeccion limitada no encontro suficiente soporte metodologico en las fuentes actuales.",
      expected_source_role: "method_support",
      selection_warning_es: "No usar como prueba de metodo si solo aparece en metadata o resumen sin texto fuente recuperado.",
    },
    theory_or_model: {
      purpose_es: "Recuperar fuentes de teoria, modelo, marco conceptual, guia o base analitica.",
      rationale_es: "La base teorica/modelo necesita soporte fuente-texto antes de redactar marco teorico fuerte.",
      expected_source_role: "theory_support",
      selection_warning_es: "No convertir teoria/modelo en resultado; debe quedar como base conceptual o requerimiento pendiente.",
    },
    variables_or_indicators: {
      purpose_es: "Recuperar fuentes sobre variables, indicadores, instrumentos, medidas o criterios de evaluacion.",
      rationale_es: "Las fuentes inspeccionadas no cubren suficientemente variables o indicadores verificables.",
      expected_source_role: "measurement_support",
      selection_warning_es: "No inventar variables, unidades, escalas o instrumentos si no quedan respaldados por fuentes.",
    },
    secondary_reference_recovery: {
      purpose_es: "Recuperar referencias citadas por los PDFs inspeccionados para que puedan evaluarse como fuentes independientes.",
      rationale_es: "Las referencias secundarias detectadas no son citables hasta recuperarse, seleccionarse y validarse.",
      expected_source_role: "recover_cited_source",
      selection_warning_es: "Una referencia citada dentro de un PDF no debe citarse en el producto hasta recuperarse como fuente propia.",
    },
  };
  const base = labels[input.category];

  return {
    family_id: `deep-light-${input.category}`,
    category: input.category,
    priority: input.category === "secondary_reference_recovery" ? "medium" : "high",
    purpose_es: base.purpose_es,
    rationale_es: base.rationale_es,
    source_ids: input.sourceIds,
    queries: buildQueries({
      category: input.category,
      topicTerms: input.topicTerms,
      missingCategories: [],
      secondaryCandidates: input.secondaryCandidates,
    }),
    expected_source_role: base.expected_source_role,
    selection_warning_es: base.selection_warning_es,
  };
}

function buildReferenceCandidates(input: {
  caseId?: string | null;
  items: BlueprintLaunchLimitedInspectionItem[];
}): DeepResearchLightReferenceCandidatesV1 {
  const candidates: DeepResearchLightReferenceCandidate[] = [];
  const seen = new Set<string>();

  for (const item of input.items) {
    for (const marker of item.secondaryReferenceCandidates ?? []) {
      const doi = extractDoi(marker);
      const year = extractYear(marker);
      const title = inferTitle(marker, doi);
      const key = doi ? `doi:${normalize(doi)}` : `marker:${normalize(title ?? marker).slice(0, 90)}:${year ?? "unknown"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const query = unique([title, year ? String(year) : null, doi]).join(" ") || clip(marker, 150);

      candidates.push({
        candidate_id: `deep-ref-${safeId(key)}`,
        discovered_in_source_id: item.sourceId,
        discovered_in_source_title: item.title,
        marker: clip(marker, 260),
        title,
        year,
        doi,
        recommended_search_query: query,
        citable_status: "not_citable_until_recovered",
        reasons: unique([
          "found_during_limited_source_inspection",
          doi ? "doi_detected" : null,
          title ? "title_inferred" : null,
        ]),
        warnings: ["Reference is not citable until recovered, selected, and validated as an independent source."],
      });
    }
  }

  return {
    artifact_type: "deep_research_light_reference_candidates",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.caseId ?? null,
    candidate_count: candidates.length,
    candidates: candidates.slice(0, 80),
    warnings:
      candidates.length > 0
        ? ["secondary_references_detected_not_citable_until_recovered"]
        : [],
  };
}

function isDeepResearchLightQueryCategory(value: string): value is DeepResearchLightQueryCategory {
  return [
    "direct_nuclear_sources",
    "method_or_study_design",
    "theory_or_model",
    "variables_or_indicators",
    "secondary_reference_recovery",
  ].includes(value);
}

export function shouldBuildDeepResearchLightArtifacts(input: {
  postInspectionSufficiency: Pick<
    PostInspectionSourceSufficiencyReportV1,
    "decision" | "missing_evidence_categories" | "secondary_reference_candidate_count"
  >;
}) {
  return (
    input.postInspectionSufficiency.decision === "NEEDS_DEEP_RESEARCH_LIGHT" ||
    input.postInspectionSufficiency.missing_evidence_categories.length > 0 ||
    input.postInspectionSufficiency.secondary_reference_candidate_count > 0
  );
}

export function buildDeepResearchLightArtifacts(input: {
  caseId?: string | null;
  intake?: Record<string, unknown> | null;
  bundle: BlueprintLaunchSelectedSourceBundle;
  evidencePlanning?: BlueprintLaunchEvidencePlanningResult | null;
  limitedInspection: BlueprintLaunchLimitedSourceInspectionResult;
  postInspectionSufficiency: PostInspectionSourceSufficiencyReportV1;
  referenceCandidateOutputPath?: string | null;
}): DeepResearchLightArtifactsV1 {
  const now = new Date().toISOString();
  const itemsBySourceId = new Map(input.limitedInspection.items.map((item) => [item.sourceId, item]));
  const topicTerms = currentTopicTerms({
    bundle: input.bundle,
    intake: input.intake,
    evidencePlanning: input.evidencePlanning ?? null,
  });
  const referenceCandidates = buildReferenceCandidates({
    caseId: input.caseId,
    items: input.limitedInspection.items,
  });
  const missingCategories = input.postInspectionSufficiency.missing_evidence_categories;
  const categories = unique([
    input.postInspectionSufficiency.decision === "NEEDS_SOURCE_REPLACEMENT" ||
    input.postInspectionSufficiency.source_ids_needing_replacement.length > 0
      ? "direct_nuclear_sources"
      : null,
    ...missingCategories,
    referenceCandidates.candidate_count > 0 ? "secondary_reference_recovery" : null,
  ]).filter(isDeepResearchLightQueryCategory);
  const sourceIdsForDeepResearch = unique([
    ...input.postInspectionSufficiency.source_ids_for_deep_research_light,
    ...input.limitedInspection.sourceIdsForDeepResearchLight,
  ]);
  const queryFamilies = categories.map((category) =>
    familyForCategory({
      category,
      topicTerms,
      sourceIds:
        category === "secondary_reference_recovery"
          ? unique(referenceCandidates.candidates.map((candidate) => candidate.discovered_in_source_id))
          : sourceIdsForDeepResearch,
      secondaryCandidates: referenceCandidates.candidates,
    }),
  ).filter((family) => family.queries.length > 0);

  const gapAnalysis: DeepResearchLightGapAnalysisV1 = {
    artifact_type: "deep_research_light_gap_analysis",
    artifact_version: "v1",
    generated_at: now,
    case_id: input.caseId ?? null,
    intake_topic: input.bundle.intakeTopic ?? null,
    trigger_decision: input.postInspectionSufficiency.decision,
    missing_evidence_categories: missingCategories,
    inspected_source_count: input.postInspectionSufficiency.inspected_source_count,
    usable_source_count: input.postInspectionSufficiency.usable_source_count,
    direct_usable_source_count: input.postInspectionSufficiency.direct_usable_source_count,
    method_signal_source_count: input.postInspectionSufficiency.method_signal_source_count,
    theory_signal_source_count: input.postInspectionSufficiency.theory_signal_source_count,
    variable_signal_source_count: input.postInspectionSufficiency.variable_signal_source_count,
    secondary_reference_candidate_count: referenceCandidates.candidate_count,
    selected_sources: input.bundle.sources.map((source) => {
      const item = itemsBySourceId.get(source.reference.id);
      return {
        source_id: source.reference.id,
        title: source.reference.title,
        status: item?.status ?? "not_inspected",
        identity_status: item?.identityStatus ?? "not_inspected",
        text_char_count: item?.textCharCount ?? 0,
        method_signal_count: item?.methodSignalCount ?? 0,
        theory_signal_count: item?.theorySignalCount ?? 0,
        variable_signal_count: item?.variableSignalCount ?? 0,
        warnings: item?.warnings ?? [],
      };
    }),
    reasons_es: [
      ...input.postInspectionSufficiency.reasons,
      referenceCandidates.candidate_count > 0
        ? "Se detectaron referencias citadas por las fuentes inspeccionadas; deben recuperarse antes de citarlas."
        : null,
    ].filter((item): item is string => Boolean(item)),
    warnings: unique([
      ...input.postInspectionSufficiency.warnings,
      ...referenceCandidates.warnings,
      "Deep Research light solo prepara busquedas; no convierte referencias secundarias en evidencia.",
    ]),
    blockers: input.postInspectionSufficiency.blockers,
  };
  const searchPlan: DeepResearchLightSearchPlanV1 = {
    artifact_type: "deep_research_light_search_plan",
    artifact_version: "v1",
    generated_at: now,
    case_id: input.caseId ?? null,
    no_external_calls_made: true,
    query_families: queryFamilies,
    recommended_candidate_search_command: input.referenceCandidateOutputPath
      ? `npx tsx scripts/run-evidence-candidate-search.ts --case ${input.caseId ?? "[case_id]"} --expand --max-candidates 15 --secondary-reference-queue ${input.referenceCandidateOutputPath}`
      : `npx tsx scripts/run-evidence-candidate-search.ts --case ${input.caseId ?? "[case_id]"} --expand --max-candidates 15`,
    source_selection_policy_es: [
      "Priorizar fuentes con texto completo o PDF verificable.",
      "No citar referencias secundarias hasta recuperarlas como fuentes independientes.",
      "Mantener separadas fuentes nucleares, metodologicas, teoricas/modelo y variables/indicadores.",
      "Rechazar fuentes metadata-only si se necesitan para soporte directo.",
    ],
    warnings: gapAnalysis.warnings,
  };

  return {
    gapAnalysis,
    searchPlan,
    referenceCandidates,
  };
}

export function renderDeepResearchLightReport(input: DeepResearchLightArtifactsV1) {
  const { gapAnalysis, searchPlan, referenceCandidates } = input;
  return [
    "# Deep Research Light Fallback",
    "",
    `- case_id: ${gapAnalysis.case_id ?? "unknown"}`,
    `- trigger_decision: ${gapAnalysis.trigger_decision}`,
    `- usable_source_count: ${gapAnalysis.usable_source_count}`,
    `- direct_usable_source_count: ${gapAnalysis.direct_usable_source_count}`,
    `- missing_evidence_categories: ${gapAnalysis.missing_evidence_categories.join("; ") || "none"}`,
    `- secondary_reference_candidate_count: ${referenceCandidates.candidate_count}`,
    `- no_external_calls_made: ${searchPlan.no_external_calls_made}`,
    "",
    "## Search Families",
    ...(searchPlan.query_families.length
      ? searchPlan.query_families.map((family, index) =>
          [
            `${index + 1}. ${family.category} (${family.priority})`,
            `   - purpose: ${family.purpose_es}`,
            `   - expected_source_role: ${family.expected_source_role}`,
            `   - source_ids: ${family.source_ids.join("; ") || "none"}`,
            `   - queries: ${family.queries.join(" | ")}`,
            `   - warning: ${family.selection_warning_es}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Secondary Reference Candidates",
    ...(referenceCandidates.candidates.length
      ? referenceCandidates.candidates.slice(0, 30).map((candidate, index) =>
          [
            `${index + 1}. ${candidate.title ?? candidate.marker}`,
            `   - discovered_in_source_id: ${candidate.discovered_in_source_id}`,
            `   - doi: ${candidate.doi ?? "not_detected"}`,
            `   - year: ${candidate.year ?? "unknown"}`,
            `   - recommended_search_query: ${candidate.recommended_search_query}`,
            `   - citable_status: ${candidate.citable_status}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Next Command",
    "",
    searchPlan.recommended_candidate_search_command ?? "n/a",
    "",
    "## Warnings",
    ...(gapAnalysis.warnings.length ? gapAnalysis.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ].join("\n");
}
