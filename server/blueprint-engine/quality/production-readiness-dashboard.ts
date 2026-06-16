import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import { summarizeCitationSemantics } from "@/server/blueprint-engine/quality/citation-semantics";
import type { ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";
import type {
  FreshRunIsolationReport,
  StaleContentScanReport,
} from "@/server/blueprint-engine/quality/fresh-run-isolation";
import type { ProductionSafetyEvaluation } from "@/server/blueprint-engine/quality/production-safety";
import type { RunTelemetryArtifact } from "@/server/blueprint-engine/quality/run-telemetry";
import { summarizeSourceHealthFromHandoff } from "@/server/blueprint-engine/quality/source-health";
import type { EvidenceGapActionPlanV1 } from "@/server/blueprint-engine/quality/evidence-gap-action-plan";

export type QualityDashboard = {
  artifact_type: "quality_dashboard";
  artifact_version: "v1";
  generated_at: string;
  run_id: string;
  case_id: string | null;
  handoff_id: string | null;
  production_eligibility: {
    schema_compatible: boolean;
    diagnostic_compatible: boolean;
    production_eligible: boolean;
    reasons: string[];
  };
  evidence_health: {
    source_count: number;
    evidence_unit_count: number;
    reduced_evidence_unit_count: number | null;
    reduced_pack_present: boolean;
    reduced_pack_warnings: string[];
  };
  citation_health: {
    reported_direct_quote_count: number;
    true_source_backed_direct_quote_count: number;
    metadata_context_count: number;
    intake_context_count: number;
    warnings: string[];
  };
  source_health: ReturnType<typeof summarizeSourceHealthFromHandoff>;
  section_evidence_binding: {
    sections_with_evidence_ids: number | null;
    sections_with_original_excerpts: number | null;
    sections_with_only_contextual_support: number | null;
    sections_with_adjacent_source_warnings: number | null;
    section_evidence_binding_score: number | null;
  };
  editorial_quality: {
    package_score_100: number | null;
    max_word_failure_count: number | null;
    claims_guard_failure_count: number | null;
  };
  docx_qa: {
    master_score_100: number | null;
    institutional_score_100: number | null;
    master_passed: boolean | null;
    institutional_passed: boolean | null;
  };
  stale_content_scan: {
    passed: boolean | null;
    stale_content_detected: boolean | null;
    mutable_latest_path_count: number | null;
    blockers: string[];
    warnings: string[];
  };
  cost_summary: {
    openai_called: boolean;
    call_count: number;
    total_tokens: number;
    estimated_cost_usd: number;
    estimated_cost_cad: number;
  };
  runtime_summary: {
    duration_ms: number | null;
  };
  evidence_gap_action_plan: {
    present: boolean;
    status: EvidenceGapActionPlanV1["status"] | null;
    recommended_next_action_es: string | null;
    can_continue_full_extraction: boolean | null;
    should_return_to_source_selection: boolean | null;
    should_upload_user_pdfs: boolean | null;
    should_run_rapid_deep_research: boolean | null;
    should_recover_secondary_references: boolean | null;
    action_count: number;
  };
  remaining_blockers: string[];
  remaining_warnings: string[];
  next_recommended_action: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function provenanceBindingSummary(value: unknown): QualityDashboard["section_evidence_binding"] {
  const record = asRecord(value);
  return {
    sections_with_evidence_ids: asNumber(record.sections_with_evidence_ids),
    sections_with_original_excerpts: asNumber(record.sections_with_original_excerpts),
    sections_with_only_contextual_support: asNumber(record.sections_with_only_contextual_support),
    sections_with_adjacent_source_warnings: asNumber(record.sections_with_adjacent_source_warnings),
    section_evidence_binding_score: asNumber(record.section_evidence_binding_score),
  };
}

function editorialSummary(value: unknown): QualityDashboard["editorial_quality"] {
  const record = asRecord(value);
  const gates = asRecord(record.gates);
  return {
    package_score_100: asNumber(record.overall_package_score_100),
    max_word_failure_count: asNumber(gates.max_word_failure_count),
    claims_guard_failure_count: asNumber(gates.claims_guard_failure_count),
  };
}

function qaSummary(value: unknown) {
  const record = asRecord(value);
  return {
    score: asNumber(record.score_100),
    passed: asBoolean(record.passed),
  };
}

function nextAction(input: {
  productionEligible: boolean;
  blockers: string[];
  reducedPack?: ReducedEvidencePackV1 | null;
  evidenceGapActionPlan?: EvidenceGapActionPlanV1 | null;
}) {
  if (input.evidenceGapActionPlan) {
    return input.evidenceGapActionPlan.recommended_next_action_es;
  }

  if (input.productionEligible) {
    return "Production gates pass; review final deliverables and run production-mode execution with immutable artifact refs.";
  }

  const joined = input.blockers.join("\n").toLowerCase();
  if (/usable full-text|materialized source|metadata|unresolved|source count/.test(joined)) {
    return "Add stronger usable full-text sources, rerun source selection and Evidence Engine without --allow-blocked.";
  }
  if (/adjacent|claim/.test(joined)) {
    return "Replace or relabel adjacent/context-only evidence before allowing central claims.";
  }
  if (/latest|mutable/.test(joined)) {
    return "Replace mutable latest refs with immutable handoff ids and artifact refs before production.";
  }
  if (input.reducedPack?.warnings.some((warning) => /insufficient/.test(warning))) {
    return "Improve evidence coverage before downstream generation; reduced pack is too thin.";
  }
  return "Resolve production blockers listed in this dashboard, then rerun the diagnostic pipeline.";
}

export function buildQualityDashboard(input: {
  run_id: string;
  case_id?: string | null;
  handoff?: EvidenceEngineHandoffV1 | null;
  production_safety?: ProductionSafetyEvaluation | null;
  reduced_evidence_pack?: ReducedEvidencePackV1 | null;
  run_telemetry?: RunTelemetryArtifact | null;
  provenance_report?: unknown;
  package_quality_summary?: unknown;
  master_docx_qa?: unknown;
  institutional_docx_qa?: unknown;
  fresh_run_isolation?: FreshRunIsolationReport | null;
  stale_content_scan?: StaleContentScanReport | null;
  evidence_gap_action_plan?: EvidenceGapActionPlanV1 | null;
  warnings?: string[];
  blockers?: string[];
}): QualityDashboard {
  const handoff = input.handoff ?? null;
  const citationHealth = handoff
    ? summarizeCitationSemantics(handoff.evidence_units)
    : {
        reported_direct_quote_count: 0,
        true_source_backed_direct_quote_count: 0,
        metadata_context_count: 0,
        intake_context_count: 0,
        citation_semantics_warnings: [],
      };
  const sourceHealth = handoff
    ? summarizeSourceHealthFromHandoff(handoff)
    : summarizeSourceHealthFromHandoff({
        handoff_id: "empty",
        handoff_version: "evidence_engine_handoff.v1",
        project_id: "empty",
        evidence_run_id: "empty",
        created_at: new Date(0).toISOString(),
        source_engine: "EvidenceEngine",
        source_engine_version: "empty",
        artifact_hash: "empty",
        readiness: "blocked",
        quality_gate: { status: "blocked", warnings: [], blockers: [] },
        warnings: [],
        source_snapshot: [],
        project_context: {
          language: "es",
          country_context: "PE",
          degree_level: "maestria",
          master_template_key: "MASTER_TEMPLATE_LATAM",
          topic: "",
        },
        source_registry: [],
        evidence_units: [],
        section_packets: [],
        weak_section_packets: [],
        source_priorities: [],
        asset_registry: [],
        asset_usage_plan: [],
        materialized_content_refs: [],
        chunk_index_refs: [],
        proposal_context: {
          method_candidate: null,
          framework_candidate: null,
          dominant_methods: [],
          dominant_frameworks: [],
          key_findings: [],
          evidence_gaps: [],
          followup_requirements: null,
          gap_resolution_plan: null,
        },
        assumptions: [],
        traceability: { source_artifacts: [], immutable_snapshot_hash: "" },
      });
  const masterQa = qaSummary(input.master_docx_qa);
  const institutionalQa = qaSummary(input.institutional_docx_qa);
  const blockers = unique([
    ...(input.blockers ?? []),
    ...(input.production_safety?.production_ineligibility_reasons ?? []),
  ]);
  const warnings = unique([
    ...(input.warnings ?? []),
    ...(input.production_safety?.warnings ?? []),
    ...(input.reduced_evidence_pack?.warnings ?? []),
    ...asStringArray(asRecord(input.stale_content_scan).warnings),
  ]);
  const stale = input.stale_content_scan ?? null;
  const productionEligible = input.production_safety?.production_eligible ?? false;

  return {
    artifact_type: "quality_dashboard",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    run_id: input.run_id,
    case_id: input.case_id ?? null,
    handoff_id: handoff?.handoff_id ?? null,
    production_eligibility: {
      schema_compatible: input.production_safety?.schema_compatible ?? Boolean(handoff),
      diagnostic_compatible: input.production_safety?.diagnostic_compatible ?? Boolean(handoff),
      production_eligible: productionEligible,
      reasons: input.production_safety?.production_ineligibility_reasons ?? [],
    },
    evidence_health: {
      source_count: handoff?.source_registry.length ?? 0,
      evidence_unit_count: handoff?.evidence_units.length ?? 0,
      reduced_evidence_unit_count:
        input.reduced_evidence_pack?.reduced_counts.evidence_units ?? null,
      reduced_pack_present: Boolean(input.reduced_evidence_pack),
      reduced_pack_warnings: input.reduced_evidence_pack?.warnings ?? [],
    },
    citation_health: {
      reported_direct_quote_count: citationHealth.reported_direct_quote_count,
      true_source_backed_direct_quote_count:
        citationHealth.true_source_backed_direct_quote_count,
      metadata_context_count: citationHealth.metadata_context_count,
      intake_context_count: citationHealth.intake_context_count,
      warnings: citationHealth.citation_semantics_warnings,
    },
    source_health: sourceHealth,
    section_evidence_binding: provenanceBindingSummary(input.provenance_report),
    editorial_quality: editorialSummary(input.package_quality_summary),
    docx_qa: {
      master_score_100: masterQa.score,
      institutional_score_100: institutionalQa.score,
      master_passed: masterQa.passed,
      institutional_passed: institutionalQa.passed,
    },
    stale_content_scan: {
      passed: stale?.passed ?? null,
      stale_content_detected: stale?.stale_content_detected ?? null,
      mutable_latest_path_count: stale?.mutable_latest_path_count ?? null,
      blockers: stale?.blockers ?? [],
      warnings: stale?.warnings ?? [],
    },
    cost_summary: {
      openai_called: input.run_telemetry?.openai_called ?? false,
      call_count: input.run_telemetry?.call_count ?? 0,
      total_tokens: input.run_telemetry?.total_tokens ?? 0,
      estimated_cost_usd: input.run_telemetry?.estimated_cost_usd ?? 0,
      estimated_cost_cad: input.run_telemetry?.estimated_cost_cad ?? 0,
    },
    runtime_summary: {
      duration_ms: input.run_telemetry?.duration_ms ?? null,
    },
    evidence_gap_action_plan: {
      present: Boolean(input.evidence_gap_action_plan),
      status: input.evidence_gap_action_plan?.status ?? null,
      recommended_next_action_es: input.evidence_gap_action_plan?.recommended_next_action_es ?? null,
      can_continue_full_extraction: input.evidence_gap_action_plan?.can_continue_full_extraction ?? null,
      should_return_to_source_selection: input.evidence_gap_action_plan?.should_return_to_source_selection ?? null,
      should_upload_user_pdfs: input.evidence_gap_action_plan?.should_upload_user_pdfs ?? null,
      should_run_rapid_deep_research: input.evidence_gap_action_plan?.should_run_rapid_deep_research ?? null,
      should_recover_secondary_references: input.evidence_gap_action_plan?.should_recover_secondary_references ?? null,
      action_count: input.evidence_gap_action_plan?.actions.length ?? 0,
    },
    remaining_blockers: blockers,
    remaining_warnings: warnings,
    next_recommended_action: nextAction({
      productionEligible,
      blockers,
      reducedPack: input.reduced_evidence_pack,
      evidenceGapActionPlan: input.evidence_gap_action_plan ?? null,
    }),
  };
}

export function renderProductionReadinessReport(dashboard: QualityDashboard) {
  const lines = [
    "# Production Readiness Report",
    "",
    `Run: ${dashboard.run_id}`,
    `Case: ${dashboard.case_id ?? "unknown"}`,
    `Handoff: ${dashboard.handoff_id ?? "none"}`,
    "",
    "## Readiness",
    "",
    `- schema readiness: ${dashboard.production_eligibility.schema_compatible ? "pass" : "blocked"}`,
    `- diagnostic readiness: ${dashboard.production_eligibility.diagnostic_compatible ? "pass" : "blocked"}`,
    `- production readiness: ${dashboard.production_eligibility.production_eligible ? "pass" : "blocked"}`,
    `- DOCX readiness: ${
      dashboard.docx_qa.master_passed === true && dashboard.docx_qa.institutional_passed === true
        ? "pass"
        : dashboard.docx_qa.master_passed === null && dashboard.docx_qa.institutional_passed === null
          ? "not evaluated"
          : "blocked"
    }`,
    `- evidence readiness: ${dashboard.source_health.usable_full_text_source_count} usable full-text source(s)`,
    `- cost readiness: ${dashboard.cost_summary.estimated_cost_cad.toFixed(6)} CAD estimated`,
    `- evidence gap action status: ${dashboard.evidence_gap_action_plan.status ?? "not evaluated"}`,
    "",
    "## Evidence Budget",
    "",
    `- full evidence units: ${dashboard.evidence_health.evidence_unit_count}`,
    `- reduced evidence units: ${dashboard.evidence_health.reduced_evidence_unit_count ?? "not generated"}`,
    `- true source-backed direct quotes: ${dashboard.citation_health.true_source_backed_direct_quote_count}`,
    "",
    "## Evidence Gap Action Plan",
    "",
    dashboard.evidence_gap_action_plan.present
      ? `- status: ${dashboard.evidence_gap_action_plan.status}`
      : "- not generated for this run",
    dashboard.evidence_gap_action_plan.recommended_next_action_es
      ? `- recommended_next_action_es: ${dashboard.evidence_gap_action_plan.recommended_next_action_es}`
      : "- recommended_next_action_es: n/a",
    `- can_continue_full_extraction: ${dashboard.evidence_gap_action_plan.can_continue_full_extraction ?? "n/a"}`,
    `- should_return_to_source_selection: ${dashboard.evidence_gap_action_plan.should_return_to_source_selection ?? "n/a"}`,
    `- should_upload_user_pdfs: ${dashboard.evidence_gap_action_plan.should_upload_user_pdfs ?? "n/a"}`,
    `- should_run_rapid_deep_research: ${dashboard.evidence_gap_action_plan.should_run_rapid_deep_research ?? "n/a"}`,
    `- should_recover_secondary_references: ${dashboard.evidence_gap_action_plan.should_recover_secondary_references ?? "n/a"}`,
    "",
    "## Blockers",
    "",
    ...(dashboard.remaining_blockers.length > 0
      ? dashboard.remaining_blockers.map((blocker) => `- ${blocker}`)
      : ["- None."]),
    "",
    "## Warnings",
    "",
    ...(dashboard.remaining_warnings.length > 0
      ? dashboard.remaining_warnings.slice(0, 40).map((warning) => `- ${warning}`)
      : ["- None."]),
    "",
    "## Required Before Production",
    "",
    ...(dashboard.production_eligibility.production_eligible
      ? ["- Review final artifacts, then rerun with production-mode immutable refs."]
      : [
          "- Add stronger sources and rerun without --allow-blocked when evidence readiness is the blocker.",
          "- Resolve metadata-only, unresolved, scanned, or adjacent-source risks before central claims.",
          "- Remove mutable latest refs from any production path.",
          "- Keep internal telemetry/debug artifacts outside public DOCX appendices.",
        ]),
    "",
    `Next recommended action: ${dashboard.next_recommended_action}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}
