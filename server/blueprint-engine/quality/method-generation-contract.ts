import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import type { ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";
import type {
  DisciplineMethodRequirement,
  MethodCandidate,
  MethodSelectionArtifactV1,
  MethodSelectionConfidence,
  MethodSelectionStatus,
  StudyStrategyCandidate,
  VariableIndicatorCandidate,
} from "@/server/blueprint-engine/quality/method-selection";
import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type { MasterSectionDraft } from "@/server/blueprint-v2/types";

export type MethodGenerationContractV1 = {
  artifact_type: "method_generation_contract";
  artifact_version: "v1";
  generated_at: string;
  source_artifact: "MethodSelectionArtifactV1";
  handoff_id: string;
  evidence_run_id: string | null;
  project_id: string;
  status: MethodSelectionStatus;
  confidence: MethodSelectionConfidence;
  production_ready: boolean;
  diagnostic_only: boolean;
  route: MethodSelectionArtifactV1["knowledge_area_route"]["route"];
  route_confidence: MethodSelectionArtifactV1["knowledge_area_route"]["confidence"];
  selected_strategy_label: string | null;
  selected_strategy_family: string | null;
  primary_method_label: string | null;
  method_summary_for_generation: string | null;
  title_method_component: string | null;
  theoretical_focus_terms: string[];
  technique_terms: string[];
  model_terms: string[];
  tool_terms: string[];
  variable_terms: string[];
  data_requirement_terms: string[];
  discipline_requirement_terms: string[];
  source_ids: string[];
  evidence_ids: string[];
  asset_keys: string[];
  missing_requirements: string[];
  equation_asset_keys: string[];
  renderable_equation_count: number;
  keyword_terms: string[];
  prompt_guidance: {
    title: string;
    abstract: string;
    theoretical_framework: string;
    methodology: string;
    consistency_matrix: string;
    keywords: string;
    hero: string;
  };
  claim_guardrails: string[];
  warnings: string[];
  blockers: string[];
};

export type SecondaryReferenceCandidate = {
  marker: string;
  evidence_id: string;
  source_id: string;
  snippet: string;
  status: "not_recovered_source";
  use_policy: "do_not_cite_as_primary_until_recovered";
};

export type SecondaryReferenceCandidatesReport = {
  artifact_type: "secondary_reference_candidates";
  artifact_version: "v1";
  generated_at: string;
  candidate_count: number;
  candidates: SecondaryReferenceCandidate[];
  warnings: string[];
};

export type SemanticConsistencyReportV1 = {
  artifact_type: "semantic_consistency_report";
  artifact_version: "v1";
  generated_at: string;
  passed: boolean;
  method_contract_applied: boolean;
  route: MethodGenerationContractV1["route"];
  primary_method_label: string | null;
  theoretical_framework_mentions_method: boolean | null;
  methodology_mentions_method: boolean | null;
  title_mentions_method: boolean | null;
  keywords_mentions_method: boolean | null;
  matrix_status: string | null;
  matrix_row_alignment_ok: boolean | null;
  matrix_can_continue_step_11: boolean | null;
  current_equation_asset_count: number;
  renderable_equation_count: number;
  secondary_reference_candidate_count: number;
  warnings: string[];
  blockers: string[];
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clip(value: string | null | undefined, max = 160) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function label(candidate: MethodCandidate | StudyStrategyCandidate | null | undefined) {
  return candidate?.label_es?.trim() || null;
}

function candidateLabels(items: MethodCandidate[], limit = 6) {
  return unique(items.map((item) => item.label_es)).slice(0, limit);
}

function variableLabels(items: VariableIndicatorCandidate[], limit = 8) {
  return unique(
    items.map((item) =>
      item.unit ? `${item.label_es} (${item.unit})` : item.label_es,
    ),
  ).slice(0, limit);
}

function requirementLabels(items: DisciplineMethodRequirement[], status?: DisciplineMethodRequirement["status"]) {
  return unique(
    items
      .filter((item) => (status ? item.status === status : true))
      .map((item) => item.label_es),
  ).slice(0, 10);
}

function requirementAssetKeys(items: DisciplineMethodRequirement[]) {
  return unique(items.flatMap((item) => item.asset_keys ?? []));
}

function renderableEquationCount(items: DisciplineMethodRequirement[]) {
  return items.filter((item) => item.equation_latex && item.status === "source_backed").length;
}

function sourceIdsFromArtifact(artifact: MethodSelectionArtifactV1) {
  return unique([
    ...(artifact.selected_strategy?.source_ids ?? []),
    ...(artifact.primary_method?.source_ids ?? []),
    ...artifact.alternative_methods.flatMap((item) => item.source_ids),
    ...artifact.theories.flatMap((item) => item.source_ids),
    ...artifact.techniques.flatMap((item) => item.source_ids),
    ...artifact.models.flatMap((item) => item.source_ids),
    ...artifact.tools_software.flatMap((item) => item.source_ids),
    ...artifact.variables_indicators.flatMap((item) => item.source_ids),
    ...artifact.data_requirements.flatMap((item) => item.source_ids),
    ...artifact.discipline_method_requirements.flatMap((item) => item.source_ids),
  ]);
}

function evidenceIdsFromArtifact(artifact: MethodSelectionArtifactV1) {
  return unique([
    ...(artifact.selected_strategy?.evidence_ids ?? []),
    ...(artifact.primary_method?.evidence_ids ?? []),
    ...artifact.alternative_methods.flatMap((item) => item.evidence_ids),
    ...artifact.theories.flatMap((item) => item.evidence_ids),
    ...artifact.techniques.flatMap((item) => item.evidence_ids),
    ...artifact.models.flatMap((item) => item.evidence_ids),
    ...artifact.tools_software.flatMap((item) => item.evidence_ids),
    ...artifact.variables_indicators.flatMap((item) => item.evidence_ids),
    ...artifact.data_requirements.flatMap((item) => item.evidence_ids),
    ...artifact.discipline_method_requirements.flatMap((item) => item.evidence_ids),
  ]);
}

export function buildMethodGenerationContract(
  artifact: MethodSelectionArtifactV1,
): MethodGenerationContractV1 {
  const primaryMethod = label(artifact.primary_method);
  const selectedStrategy = label(artifact.selected_strategy);
  const theories = candidateLabels(artifact.theories);
  const techniques = candidateLabels(artifact.techniques);
  const models = candidateLabels(artifact.models);
  const tools = candidateLabels(artifact.tools_software);
  const variables = variableLabels(artifact.variables_indicators);
  const dataRequirements = unique(artifact.data_requirements.map((item) => item.label_es)).slice(0, 8);
  const disciplineRequirements = requirementLabels(artifact.discipline_method_requirements);
  const missingRequirements = requirementLabels(artifact.discipline_method_requirements, "required_but_missing");
  const equationAssetKeys = requirementAssetKeys(
    artifact.discipline_method_requirements.filter((item) => item.requirement_type === "equation_or_formula"),
  );
  const methodSummary = unique([
    selectedStrategy,
    primaryMethod,
    techniques[0],
    models[0],
  ]).join("; ") || null;
  const titleMethod = primaryMethod || selectedStrategy || techniques[0] || models[0] || null;
  const keywordTerms = unique([
    titleMethod,
    selectedStrategy,
    theories[0],
    models[0],
    techniques[0],
    variables[0],
    tools[0],
  ]).slice(0, 7);
  const productionReady =
    artifact.evidence_quality_context.production_eligible &&
    artifact.status === "selected" &&
    ["high", "medium"].includes(artifact.scoring_summary.confidence);
  const diagnosticOnly = !productionReady || artifact.evidence_quality_context.degraded_handoff;
  const weakWarnings = unique([
    ...artifact.warnings,
    ...artifact.limitations,
    ...artifact.scoring_summary.weak_evidence_penalties,
    ...missingRequirements.map((item) => `Requisito metodológico pendiente: ${item}`),
  ]).slice(0, 20);
  const blockers = unique([
    ...artifact.blockers,
    ...(productionReady ? [] : ["method_contract_not_production_ready"]),
  ]);

  return {
    artifact_type: "method_generation_contract",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    source_artifact: "MethodSelectionArtifactV1",
    handoff_id: artifact.handoff_id,
    evidence_run_id: artifact.evidence_run_id ?? null,
    project_id: artifact.project_id,
    status: artifact.status,
    confidence: artifact.scoring_summary.confidence,
    production_ready: productionReady,
    diagnostic_only: diagnosticOnly,
    route: artifact.knowledge_area_route.route,
    route_confidence: artifact.knowledge_area_route.confidence,
    selected_strategy_label: selectedStrategy,
    selected_strategy_family: artifact.selected_strategy?.strategy_family ?? null,
    primary_method_label: primaryMethod,
    method_summary_for_generation: methodSummary,
    title_method_component: titleMethod,
    theoretical_focus_terms: theories,
    technique_terms: techniques,
    model_terms: models,
    tool_terms: tools,
    variable_terms: variables,
    data_requirement_terms: dataRequirements,
    discipline_requirement_terms: disciplineRequirements,
    source_ids: sourceIdsFromArtifact(artifact),
    evidence_ids: evidenceIdsFromArtifact(artifact),
    asset_keys: requirementAssetKeys(artifact.discipline_method_requirements),
    missing_requirements: missingRequirements,
    equation_asset_keys: equationAssetKeys,
    renderable_equation_count: renderableEquationCount(artifact.discipline_method_requirements),
    keyword_terms: keywordTerms,
    prompt_guidance: {
      title:
        artifact.section_integration_plan.title_guidance ||
        "El título debe reflejar problema, método o estrategia validada, alcance y objeto de estudio, sin prometer resultados.",
      abstract:
        artifact.section_integration_plan.abstract_guidance ||
        "El resumen debe declarar estrategia/método como plan metodológico, no como resultado ejecutado.",
      theoretical_framework:
        artifact.section_integration_plan.theoretical_framework_guidance ||
        "El marco teórico debe centrar teoría, modelo o marco conceptual detectado y declarar vacíos si faltan bases fuente-respaldadas.",
      methodology:
        artifact.section_integration_plan.methodology_guidance ||
        "La metodología debe distinguir método, teoría, técnica, modelo, herramientas, variables, datos y validación pendiente.",
      consistency_matrix:
        "La matriz debe mantener concordancia uno-a-uno entre pregunta, objetivo, hipótesis/supuesto, variable/categoría, método, técnica e instrumento.",
      keywords:
        artifact.section_integration_plan.keywords_guidance ||
        "Las palabras clave deben priorizar método/estrategia, objeto, contexto y variables o herramientas centrales respaldadas.",
      hero:
        artifact.section_integration_plan.hero_infographic_guidance ||
        "La carátula visual debe sintetizar tema, flujo metodológico, componentes y salida esperada sin resultados falsos.",
    },
    claim_guardrails: unique([
      artifact.generation_constraints.claim_ceiling,
      artifact.generation_constraints.planned_vs_executed_rule,
      artifact.generation_constraints.no_invented_requirements_rule,
      artifact.generation_constraints.source_support_rule,
      "No presentar requisitos faltantes como ya resueltos.",
      "No usar fuentes metadata-only o no resueltas como soporte metodológico fuerte.",
    ]).slice(0, 12),
    warnings: weakWarnings,
    blockers,
  };
}

export function methodContractMarkdownBlock(contract: MethodGenerationContractV1) {
  return [
    `Ruta metodológica: ${contract.route} (${contract.route_confidence})`,
    contract.selected_strategy_label ? `Estrategia: ${contract.selected_strategy_label}` : null,
    contract.primary_method_label ? `Método principal: ${contract.primary_method_label}` : null,
    contract.theoretical_focus_terms.length
      ? `Teoría/modelo base: ${contract.theoretical_focus_terms.slice(0, 3).join(" | ")}`
      : null,
    contract.technique_terms.length ? `Técnicas: ${contract.technique_terms.slice(0, 3).join(" | ")}` : null,
    contract.model_terms.length ? `Modelos: ${contract.model_terms.slice(0, 3).join(" | ")}` : null,
    contract.variable_terms.length ? `Variables/indicadores: ${contract.variable_terms.slice(0, 5).join(" | ")}` : null,
    contract.missing_requirements.length
      ? `Requisitos pendientes: ${contract.missing_requirements.slice(0, 5).join(" | ")}`
      : null,
    `Producción elegible desde método: ${contract.production_ready}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function currentEvidenceText(unit: ReducedEvidencePackV1["evidence_units"][number]) {
  return unit.original_text || unit.summary_es || "";
}

export function buildSecondaryReferenceCandidatesReport(
  reducedEvidencePack: ReducedEvidencePackV1,
): SecondaryReferenceCandidatesReport {
  const candidates: SecondaryReferenceCandidate[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\(([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'. -]{2,80},\s*(?:19|20)\d{2}[a-z]?)\)/g,
    /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'.-]{2,40}\s+et\s+al\.,?\s*(?:19|20)\d{2}[a-z]?)\b/g,
    /\[(\d{1,3}(?:\s*,\s*\d{1,3}){0,5})\]/g,
  ];

  for (const unit of reducedEvidencePack.evidence_units) {
    const text = currentEvidenceText(unit);
    if (!text) continue;
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const marker = clip(match[1] ?? match[0], 120);
        const key = `${unit.evidence_id}:${marker}`;
        if (!marker || seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          marker,
          evidence_id: unit.evidence_id,
          source_id: unit.source_id,
          snippet: clip(text, 260),
          status: "not_recovered_source",
          use_policy: "do_not_cite_as_primary_until_recovered",
        });
      }
    }
  }

  return {
    artifact_type: "secondary_reference_candidates",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    candidate_count: candidates.length,
    candidates: candidates.slice(0, 50),
    warnings:
      candidates.length > 0
        ? [
            "secondary_references_detected_inside_recovered_sources",
            "Do not cite secondary references as primary sources until they are recovered, selected, and validated.",
          ]
        : [],
  };
}

export function renderSecondaryReferenceCandidatesReport(report: SecondaryReferenceCandidatesReport) {
  return [
    "# Secondary Reference Candidates",
    "",
    `- candidate_count: ${report.candidate_count}`,
    "- policy: do not cite as primary until recovered, selected, and validated",
    "",
    "## Candidates",
    ...(report.candidates.length > 0
      ? report.candidates.map(
          (candidate, index) =>
            `${index + 1}. ${candidate.marker} | source_id=${candidate.source_id} | evidence_id=${candidate.evidence_id}\n   - snippet: ${candidate.snippet}`,
        )
      : ["- none"]),
    "",
    "## Warnings",
    report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "- none",
    "",
  ].join("\n");
}

function textIncludesAny(text: string, terms: string[]) {
  const normalized = normalize(text);
  return terms.some((term) => {
    const termNormalized = normalize(term);
    if (termNormalized.length < 5) return false;
    if (normalized.includes(termNormalized)) return true;
    const tokens = termNormalized
      .split(/\s+/)
      .filter((token) => token.length >= 5);
    if (tokens.length === 0) return false;
    const matched = tokens.filter((token) => normalized.includes(token)).length;
    return matched >= Math.min(2, tokens.length);
  });
}

function documentTextForSection(document: AcademicDocument, sectionKeyPatterns: RegExp[]) {
  return document.sections
    .filter((section) =>
      sectionKeyPatterns.some((pattern) => pattern.test(`${section.section_key} ${section.title}`)),
    )
    .flatMap((section) =>
      section.blocks.map((block) =>
        block.block_type === "table" ? block.rows.flat().join(" ") : block.text,
      ),
    )
    .join(" ");
}

export function buildSemanticConsistencyReport(input: {
  handoff: EvidenceEngineHandoffV1;
  reducedEvidencePack: ReducedEvidencePackV1;
  methodContract: MethodGenerationContractV1;
  matrixArtifact?: ConsistencyMatrixArtifact | null;
  drafts?: MasterSectionDraft[];
  academicDocuments?: AcademicDocument[];
  secondaryReferenceReport?: SecondaryReferenceCandidatesReport | null;
}): SemanticConsistencyReportV1 {
  const terms = unique([
    input.methodContract.primary_method_label,
    input.methodContract.selected_strategy_label,
    ...input.methodContract.theoretical_focus_terms,
    ...input.methodContract.technique_terms,
    ...input.methodContract.model_terms,
  ]);
  const currentEquationAssetCount = input.handoff.asset_registry.filter((asset) => asset.asset_kind === "equation").length;
  const document = input.academicDocuments?.[0] ?? null;
  const renderedEquationImageCount =
    document?.layout_plan.equations.filter((equation) =>
      Boolean(
        equation.file_path ||
          (equation as { generated_image_path?: string | null }).generated_image_path ||
          (equation as { professional_render_available?: boolean }).professional_render_available,
      ),
    ).length ?? 0;
  const effectiveRenderableEquationCount = Math.max(
    input.methodContract.renderable_equation_count,
    renderedEquationImageCount,
  );
  const title = document?.metadata.title ?? "";
  const keywords = document?.metadata.keywords_line ?? "";
  const theoreticalText = document ? documentTextForSection(document, [/theoretical/i, /teor/i, /framework/i, /marco/i]) : "";
  const methodologyText = document ? documentTextForSection(document, [/method/i, /metod/i, /design/i, /dise/i]) : "";
  const titleMentionsMethod = document ? textIncludesAny(title, terms) : null;
  const keywordsMentionsMethod = document ? textIncludesAny(keywords, terms) : null;
  const theoreticalMentionsMethod = document ? textIncludesAny(theoreticalText, terms) : null;
  const methodologyMentionsMethod = document ? textIncludesAny(methodologyText, terms) : null;
  const warnings = unique([
    !titleMentionsMethod && document ? "title_does_not_reflect_selected_method_contract" : null,
    !keywordsMentionsMethod && document ? "keywords_do_not_reflect_selected_method_contract" : null,
    !theoreticalMentionsMethod && document ? "theoretical_framework_does_not_surface_method_or_theory_contract" : null,
    !methodologyMentionsMethod && document ? "methodology_does_not_surface_method_contract" : null,
    input.matrixArtifact && !input.matrixArtifact.validation.row_alignment_ok
      ? "consistency_matrix_row_alignment_not_ok"
      : null,
    input.methodContract.route === "engineering" &&
    currentEquationAssetCount > 0 &&
    effectiveRenderableEquationCount === 0
      ? "equation_assets_exist_but_no_source_backed_latex_rendered"
      : null,
    input.secondaryReferenceReport && input.secondaryReferenceReport.candidate_count > 0
      ? "secondary_reference_candidates_require_future_retrieval_before_use"
      : null,
  ]);
  const blockers = unique([
    input.matrixArtifact?.status === "blocked" ? "consistency_matrix_blocked" : null,
    input.methodContract.blockers.includes("method_contract_not_production_ready")
      ? "method_contract_not_production_ready"
      : null,
  ]);

  return {
    artifact_type: "semantic_consistency_report",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    passed: blockers.length === 0 && warnings.length === 0,
    method_contract_applied: true,
    route: input.methodContract.route,
    primary_method_label: input.methodContract.primary_method_label,
    theoretical_framework_mentions_method: theoreticalMentionsMethod,
    methodology_mentions_method: methodologyMentionsMethod,
    title_mentions_method: titleMentionsMethod,
    keywords_mentions_method: keywordsMentionsMethod,
    matrix_status: input.matrixArtifact?.status ?? null,
    matrix_row_alignment_ok: input.matrixArtifact?.validation.row_alignment_ok ?? null,
    matrix_can_continue_step_11: input.matrixArtifact?.can_continue_step_11 ?? null,
    current_equation_asset_count: currentEquationAssetCount,
    renderable_equation_count: effectiveRenderableEquationCount,
    secondary_reference_candidate_count: input.secondaryReferenceReport?.candidate_count ?? 0,
    warnings,
    blockers,
  };
}

export function renderSemanticConsistencyReport(report: SemanticConsistencyReportV1) {
  return [
    "# Semantic Consistency Report",
    "",
    `- passed: ${report.passed}`,
    `- route: ${report.route}`,
    `- primary_method_label: ${report.primary_method_label ?? "not_available"}`,
    `- title_mentions_method: ${report.title_mentions_method ?? "not_checked"}`,
    `- keywords_mentions_method: ${report.keywords_mentions_method ?? "not_checked"}`,
    `- theoretical_framework_mentions_method: ${report.theoretical_framework_mentions_method ?? "not_checked"}`,
    `- methodology_mentions_method: ${report.methodology_mentions_method ?? "not_checked"}`,
    `- matrix_status: ${report.matrix_status ?? "not_available"}`,
    `- matrix_row_alignment_ok: ${report.matrix_row_alignment_ok ?? "not_available"}`,
    `- current_equation_asset_count: ${report.current_equation_asset_count}`,
    `- renderable_equation_count: ${report.renderable_equation_count}`,
    `- secondary_reference_candidate_count: ${report.secondary_reference_candidate_count}`,
    "",
    "## Warnings",
    report.warnings.length ? report.warnings.map((item) => `- ${item}`).join("\n") : "- none",
    "",
    "## Blockers",
    report.blockers.length ? report.blockers.map((item) => `- ${item}`).join("\n") : "- none",
    "",
  ].join("\n");
}
