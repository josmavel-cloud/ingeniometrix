import type { DeepResearchLightArtifactsV1 } from "@/server/blueprint-engine/quality/deep-research-light";
import type { RapidDeepResearchFallbackDecisionV1 } from "@/server/blueprint-engine/quality/rapid-deep-research-fallback-decision";
import type { PostInspectionSourceSufficiencyReportV1 } from "@/server/blueprint-engine/quality/source-post-inspection-sufficiency";

export type EvidenceGapActionType =
  | "continue_full_extraction"
  | "upload_or_review_user_provided_pdfs"
  | "return_to_source_selection"
  | "run_rapid_deep_research_fallback"
  | "select_deep_research_supplement_sources"
  | "recover_secondary_references"
  | "stop_and_replace_sources";

export type EvidenceGapActionPriority = "high" | "medium" | "low";

export type EvidenceGapAction = {
  action_id: string;
  action_type: EvidenceGapActionType;
  priority: EvidenceGapActionPriority;
  title_es: string;
  rationale_es: string;
  instructions_es: string[];
  source_ids: string[];
  blocks_full_extraction: boolean;
  related_artifacts: string[];
  command_hint: string | null;
  ui_path: string | null;
};

export type EvidenceGapActionPlanV1 = {
  artifact_type: "evidence_gap_action_plan";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  status:
    | "ready_for_full_extraction"
    | "ready_with_warnings"
    | "needs_manual_pdf_or_identity_review"
    | "needs_source_replacement"
    | "needs_deep_research_fallback"
    | "deep_research_supplement_ready_for_selection"
    | "blocked_no_usable_evidence";
  recommended_next_action_es: string;
  can_continue_full_extraction: boolean;
  should_return_to_source_selection: boolean;
  should_upload_user_pdfs: boolean;
  should_run_rapid_deep_research: boolean;
  should_recover_secondary_references: boolean;
  post_inspection: {
    decision: PostInspectionSourceSufficiencyReportV1["decision"];
    selected_source_count: number;
    inspected_source_count: number;
    usable_source_count: number;
    direct_usable_source_count: number;
    method_signal_source_count: number;
    theory_signal_source_count: number;
    variable_signal_source_count: number;
    missing_evidence_categories: string[];
    secondary_reference_candidate_count: number;
    source_ids_ready_for_full_extraction: string[];
    source_ids_needing_replacement: string[];
    source_ids_needing_manual_review: string[];
  };
  rapid_deep_research: {
    requested_by_cli: boolean;
    decision: RapidDeepResearchFallbackDecisionV1["decision"];
    eligible_to_call_llm: boolean;
    reason_code: RapidDeepResearchFallbackDecisionV1["reason_code"];
    query_family_count: number;
    supplement_run_folder: string | null;
    supplement_candidate_count: number | null;
  };
  actions: EvidenceGapAction[];
  warnings: string[];
  blockers: string[];
  policy: {
    post_inspection_only: true;
    no_citation_without_evidence_engine: true;
    human_source_selection_required: true;
    user_provided_pdfs_not_production_approved_by_default: true;
  };
};

function unique(values: Array<string | null | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const trimmed = value?.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function action(input: EvidenceGapAction): EvidenceGapAction {
  return {
    ...input,
    source_ids: unique(input.source_ids),
    related_artifacts: unique(input.related_artifacts),
    instructions_es: unique(input.instructions_es),
  };
}

function inferStatus(input: {
  postInspection: PostInspectionSourceSufficiencyReportV1;
  rapidDecision: RapidDeepResearchFallbackDecisionV1;
  supplementRunFolder?: string | null;
  supplementCandidateCount?: number | null;
}): EvidenceGapActionPlanV1["status"] {
  if (input.supplementRunFolder && (input.supplementCandidateCount ?? 0) > 0) {
    return "deep_research_supplement_ready_for_selection";
  }

  if (input.postInspection.inspected_source_count <= 0 || input.postInspection.usable_source_count <= 0) {
    return "blocked_no_usable_evidence";
  }

  if (input.postInspection.decision === "NEEDS_MANUAL_PDF_REVIEW") {
    return "needs_manual_pdf_or_identity_review";
  }

  if (input.postInspection.decision === "NEEDS_SOURCE_REPLACEMENT") {
    return "needs_source_replacement";
  }

  if (input.rapidDecision.decision === "run") {
    return "needs_deep_research_fallback";
  }

  if (input.postInspection.decision === "READY_WITH_WARNINGS") {
    return "ready_with_warnings";
  }

  return "ready_for_full_extraction";
}

function recommended(status: EvidenceGapActionPlanV1["status"]) {
  const messages: Record<EvidenceGapActionPlanV1["status"], string> = {
    ready_for_full_extraction:
      "Continuar con extraccion completa; las advertencias actuales no bloquean la ruta diagnostica.",
    ready_with_warnings:
      "Continuar con extraccion completa solo en modo diagnostico y revisar advertencias antes de produccion.",
    needs_manual_pdf_or_identity_review:
      "Resolver primero identidad/PDF: subir archivos proporcionados por el usuario o reemplazar fuentes dudosas.",
    needs_source_replacement:
      "Volver a seleccion de fuentes y reemplazar o ampliar fuentes con texto completo util.",
    needs_deep_research_fallback:
      "Ejecutar fallback rapido de Deep Research solo como descubrimiento de candidatos, luego volver a seleccion humana.",
    deep_research_supplement_ready_for_selection:
      "Abrir seleccion de fuentes y evaluar los candidatos suplementarios; no son citables hasta procesarlos por Evidence Engine.",
    blocked_no_usable_evidence:
      "No continuar; recuperar PDFs/fuentes con texto util o reemplazar la seleccion antes de generar evidencia.",
  };

  return messages[status];
}

export function buildEvidenceGapActionPlan(input: {
  caseId?: string | null;
  postInspectionSufficiency: PostInspectionSourceSufficiencyReportV1;
  rapidFallbackDecision: RapidDeepResearchFallbackDecisionV1;
  deepResearchLight?: DeepResearchLightArtifactsV1 | null;
  supplementRunFolder?: string | null;
  supplementCandidateCount?: number | null;
  sourceSelectionUiPath?: string | null;
}): EvidenceGapActionPlanV1 {
  const post = input.postInspectionSufficiency;
  const rapid = input.rapidFallbackDecision;
  const sourceSelectionUiPath = input.sourceSelectionUiPath ?? "/lab/evidence-source-selection";
  const actions: EvidenceGapAction[] = [];

  if (post.inspected_source_count <= 0 || post.usable_source_count <= 0) {
    actions.push(
      action({
        action_id: "recover-usable-source-text",
        action_type: "stop_and_replace_sources",
        priority: "high",
        title_es: "Recuperar evidencia fuente-texto util",
        rationale_es:
          "La inspeccion post-PDF no encontro texto util suficiente; no conviene cubrir este vacio con LLM.",
        instructions_es: [
          "Revisar si las fuentes seleccionadas tienen PDF o texto publico verificable.",
          "Subir PDFs proporcionados por el usuario cuando existan y esten permitidos.",
          "Si no hay texto util, volver al UI de seleccion y reemplazar fuentes.",
        ],
        source_ids: unique([...post.source_ids_needing_replacement, ...post.source_ids_needing_manual_review]),
        blocks_full_extraction: true,
        related_artifacts: ["post-inspection-source-sufficiency.json"],
        command_hint: null,
        ui_path: sourceSelectionUiPath,
      }),
    );
  }

  if (post.source_ids_needing_manual_review.length > 0 || post.decision === "NEEDS_MANUAL_PDF_REVIEW") {
    actions.push(
      action({
        action_id: "review-or-upload-user-provided-pdfs",
        action_type: "upload_or_review_user_provided_pdfs",
        priority: "high",
        title_es: "Revisar identidad documental o subir PDFs del usuario",
        rationale_es:
          "Hay fuentes con identidad debil, acceso bloqueado o PDF pendiente; deben validarse antes de usarse como evidencia.",
        instructions_es: [
          "Comparar titulo, DOI y pagina editorial contra el PDF local.",
          "Preparar manifest de PDFs proporcionados por el usuario si corresponde.",
          "No marcar estas fuentes como aprobadas para produccion sin revision humana futura.",
        ],
        source_ids: post.source_ids_needing_manual_review,
        blocks_full_extraction: true,
        related_artifacts: [
          "step-4a-limited-source-inspection.json",
          "step-4b-pdf-relevance-review.json",
          "post-inspection-source-sufficiency.json",
        ],
        command_hint:
          "npx tsx scripts/prepare-user-provided-source-pdfs.ts --case [case_id] --evidence-run-folder [run_folder] --pdf-folder [pdf_folder]",
        ui_path: null,
      }),
    );
  }

  if (post.decision === "NEEDS_SOURCE_REPLACEMENT" || post.source_ids_needing_replacement.length > 0) {
    actions.push(
      action({
        action_id: "return-to-source-selection",
        action_type: "return_to_source_selection",
        priority: "high",
        title_es: "Reemplazar o ampliar fuentes seleccionadas",
        rationale_es:
          "La cantidad de fuentes con texto completo util o ajuste directo no alcanza el minimo configurado.",
        instructions_es: [
          "Abrir el UI de seleccion de fuentes.",
          "Priorizar fuentes nucleares con PDF/texto completo verificable.",
          "Rechazar fuentes metadata-only cuando se necesitan para soporte directo.",
        ],
        source_ids: post.source_ids_needing_replacement,
        blocks_full_extraction: true,
        related_artifacts: ["source-replacement-report.json", "post-inspection-source-sufficiency.json"],
        command_hint: null,
        ui_path: sourceSelectionUiPath,
      }),
    );
  }

  if (post.secondary_reference_candidate_count > 0) {
    actions.push(
      action({
        action_id: "recover-secondary-references",
        action_type: "recover_secondary_references",
        priority: rapid.decision === "run" ? "high" : "medium",
        title_es: "Recuperar referencias secundarias como fuentes independientes",
        rationale_es:
          "Algunas fuentes inspeccionadas citan referencias que podrian ser relevantes, pero no son citables hasta recuperarse y validarse.",
        instructions_es: [
          "Usar la cola de referencias secundarias para buscarlas por DOI/titulo.",
          "Pasarlas por seleccion humana antes de usarlas.",
          "No citar informacion secundaria si la fuente original no fue recuperada.",
        ],
        source_ids: post.source_ids_ready_for_full_extraction,
        blocks_full_extraction: false,
        related_artifacts: ["deep-research-light-reference-candidates.json"],
        command_hint: input.deepResearchLight?.searchPlan.recommended_candidate_search_command ?? null,
        ui_path: sourceSelectionUiPath,
      }),
    );
  }

  if (rapid.decision === "run") {
    actions.push(
      action({
        action_id: "run-rapid-deep-research-fallback",
        action_type: "run_rapid_deep_research_fallback",
        priority: "high",
        title_es: "Ejecutar Deep Research rapido como descubrimiento de candidatos",
        rationale_es:
          "La evidencia post-inspeccion muestra vacios reales que pueden requerir nuevas fuentes candidatas.",
        instructions_es: [
          "Usar solo candidatos con referencia identificable.",
          "Regresar siempre al UI de seleccion humana.",
          "Procesar los candidatos seleccionados por Evidence Engine antes de citarlos.",
        ],
        source_ids: post.source_ids_for_deep_research_light,
        blocks_full_extraction: false,
        related_artifacts: [
          "rapid-deep-research-fallback-decision.json",
          "deep-research-light-search-plan.json",
        ],
        command_hint:
          "npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case [case_id] --rapid-deep-research-fallback",
        ui_path: null,
      }),
    );
  }

  if (input.supplementRunFolder && (input.supplementCandidateCount ?? 0) > 0) {
    actions.push(
      action({
        action_id: "select-deep-research-supplement-sources",
        action_type: "select_deep_research_supplement_sources",
        priority: "high",
        title_es: "Seleccionar fuentes suplementarias",
        rationale_es:
          "Deep Research produjo candidatos suplementarios. Aun no son evidencia: deben seleccionarse y procesarse localmente.",
        instructions_es: [
          "Abrir el UI de seleccion de fuentes.",
          "Seleccionar solo candidatos con tema, metodo o teoria claramente aplicables.",
          "Volver a correr Evidence Engine con las nuevas fuentes seleccionadas.",
        ],
        source_ids: [],
        blocks_full_extraction: false,
        related_artifacts: ["candidate-sources-supplement.json", "deep-research-source-selection-run.json"],
        command_hint: null,
        ui_path: sourceSelectionUiPath,
      }),
    );
  }

  if (actions.length === 0) {
    actions.push(
      action({
        action_id: "continue-full-extraction",
        action_type: "continue_full_extraction",
        priority: post.decision === "READY_WITH_WARNINGS" ? "medium" : "low",
        title_es: "Continuar a extraccion completa",
        rationale_es:
          "La inspeccion post-PDF encontro cobertura suficiente para continuar en la ruta configurada.",
        instructions_es: [
          "Mantener las advertencias visibles en reportes diagnosticos.",
          "No tratar advertencias como elegibilidad automatica de produccion.",
        ],
        source_ids: post.source_ids_ready_for_full_extraction,
        blocks_full_extraction: false,
        related_artifacts: ["post-inspection-source-sufficiency.json"],
        command_hint: null,
        ui_path: null,
      }),
    );
  }

  const status = inferStatus({
    postInspection: post,
    rapidDecision: rapid,
    supplementRunFolder: input.supplementRunFolder,
    supplementCandidateCount: input.supplementCandidateCount,
  });
  const shouldReturnToSelection = actions.some((item) =>
    ["return_to_source_selection", "select_deep_research_supplement_sources"].includes(item.action_type),
  );
  const shouldUploadUserPdfs = actions.some((item) => item.action_type === "upload_or_review_user_provided_pdfs");
  const shouldRunRapidDeepResearch = actions.some((item) => item.action_type === "run_rapid_deep_research_fallback");
  const shouldRecoverSecondary = actions.some((item) => item.action_type === "recover_secondary_references");

  return {
    artifact_type: "evidence_gap_action_plan",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.caseId ?? post.case_id ?? rapid.case_id ?? null,
    status,
    recommended_next_action_es: recommended(status),
    can_continue_full_extraction: !actions.some((item) => item.blocks_full_extraction),
    should_return_to_source_selection: shouldReturnToSelection,
    should_upload_user_pdfs: shouldUploadUserPdfs,
    should_run_rapid_deep_research: shouldRunRapidDeepResearch,
    should_recover_secondary_references: shouldRecoverSecondary,
    post_inspection: {
      decision: post.decision,
      selected_source_count: post.selected_source_count,
      inspected_source_count: post.inspected_source_count,
      usable_source_count: post.usable_source_count,
      direct_usable_source_count: post.direct_usable_source_count,
      method_signal_source_count: post.method_signal_source_count,
      theory_signal_source_count: post.theory_signal_source_count,
      variable_signal_source_count: post.variable_signal_source_count,
      missing_evidence_categories: post.missing_evidence_categories,
      secondary_reference_candidate_count: post.secondary_reference_candidate_count,
      source_ids_ready_for_full_extraction: post.source_ids_ready_for_full_extraction,
      source_ids_needing_replacement: post.source_ids_needing_replacement,
      source_ids_needing_manual_review: post.source_ids_needing_manual_review,
    },
    rapid_deep_research: {
      requested_by_cli: rapid.requested_by_cli,
      decision: rapid.decision,
      eligible_to_call_llm: rapid.eligible_to_call_llm,
      reason_code: rapid.reason_code,
      query_family_count: rapid.deep_research_light_query_family_count,
      supplement_run_folder: input.supplementRunFolder ?? null,
      supplement_candidate_count: input.supplementCandidateCount ?? null,
    },
    actions,
    warnings: unique([
      ...post.warnings,
      ...rapid.warnings,
      "Este plan no reemplaza seleccion humana ni procesamiento local de fuentes.",
    ]),
    blockers: unique([...post.blockers, ...rapid.blockers]),
    policy: {
      post_inspection_only: true,
      no_citation_without_evidence_engine: true,
      human_source_selection_required: true,
      user_provided_pdfs_not_production_approved_by_default: true,
    },
  };
}

export function renderEvidenceGapActionPlanReport(plan: EvidenceGapActionPlanV1) {
  return [
    "# Evidence Gap Action Plan",
    "",
    `- case_id: ${plan.case_id ?? "unknown"}`,
    `- status: ${plan.status}`,
    `- can_continue_full_extraction: ${plan.can_continue_full_extraction}`,
    `- recommended_next_action_es: ${plan.recommended_next_action_es}`,
    `- should_return_to_source_selection: ${plan.should_return_to_source_selection}`,
    `- should_upload_user_pdfs: ${plan.should_upload_user_pdfs}`,
    `- should_run_rapid_deep_research: ${plan.should_run_rapid_deep_research}`,
    `- should_recover_secondary_references: ${plan.should_recover_secondary_references}`,
    "",
    "## Post-Inspection Summary",
    `- decision: ${plan.post_inspection.decision}`,
    `- inspected_source_count: ${plan.post_inspection.inspected_source_count}`,
    `- usable_source_count: ${plan.post_inspection.usable_source_count}`,
    `- direct_usable_source_count: ${plan.post_inspection.direct_usable_source_count}`,
    `- method_signal_source_count: ${plan.post_inspection.method_signal_source_count}`,
    `- theory_signal_source_count: ${plan.post_inspection.theory_signal_source_count}`,
    `- variable_signal_source_count: ${plan.post_inspection.variable_signal_source_count}`,
    `- missing_evidence_categories: ${plan.post_inspection.missing_evidence_categories.join("; ") || "none"}`,
    `- secondary_reference_candidate_count: ${plan.post_inspection.secondary_reference_candidate_count}`,
    "",
    "## Rapid Deep Research",
    `- requested_by_cli: ${plan.rapid_deep_research.requested_by_cli}`,
    `- decision: ${plan.rapid_deep_research.decision}`,
    `- eligible_to_call_llm: ${plan.rapid_deep_research.eligible_to_call_llm}`,
    `- reason_code: ${plan.rapid_deep_research.reason_code}`,
    `- supplement_run_folder: ${plan.rapid_deep_research.supplement_run_folder ?? "none"}`,
    `- supplement_candidate_count: ${plan.rapid_deep_research.supplement_candidate_count ?? "unknown"}`,
    "",
    "## Actions",
    ...plan.actions.map((item, index) =>
      [
        `${index + 1}. ${item.title_es} (${item.priority})`,
        `   - action_type: ${item.action_type}`,
        `   - blocks_full_extraction: ${item.blocks_full_extraction}`,
        `   - rationale: ${item.rationale_es}`,
        `   - source_ids: ${item.source_ids.join("; ") || "none"}`,
        `   - ui_path: ${item.ui_path ?? "none"}`,
        `   - command_hint: ${item.command_hint ?? "none"}`,
        `   - artifacts: ${item.related_artifacts.join("; ") || "none"}`,
        ...item.instructions_es.map((instruction) => `   - ${instruction}`),
      ].join("\n"),
    ),
    "",
    "## Policy",
    "- La decision se basa en evidencia post-inspeccion.",
    "- Ninguna fuente suplementaria es citable hasta pasar seleccion humana y Evidence Engine.",
    "- Los PDFs proporcionados por usuario son diagnosticos por defecto, no aprobacion de produccion.",
    "",
    "## Warnings",
    ...(plan.warnings.length ? plan.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Blockers",
    ...(plan.blockers.length ? plan.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}
