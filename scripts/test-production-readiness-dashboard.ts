import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildBlueprintEngineInputFromEvidenceHandoffV1 } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import { buildReducedEvidencePackFromHandoff } from "@/server/blueprint-engine/quality/evidence-budget";
import {
  buildQualityDashboard,
  renderProductionReadinessReport,
} from "@/server/blueprint-engine/quality/production-readiness-dashboard";
import { evaluateBlueprintProductionSafety } from "@/server/blueprint-engine/quality/production-safety";
import { buildRunTelemetryArtifact } from "@/server/blueprint-engine/quality/run-telemetry";
import { buildDiagnosticRunComparison } from "@/scripts/compare-diagnostic-runs";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

function handoff(): EvidenceEngineHandoffV1 {
  return {
    handoff_id: "evidence-handoff-dashboard-test",
    handoff_version: "evidence_engine_handoff.v1",
    project_id: "project-dashboard-test",
    evidence_run_id: "evidence-run-dashboard-test",
    created_at: new Date(0).toISOString(),
    source_engine: "EvidenceEngine",
    source_engine_version: "test",
    artifact_hash: "hash",
    readiness: "media",
    quality_gate: {
      status: "warn",
      warnings: ["diagnostic_only=true", "production_valid=false", "Step 3 decision BLOCK"],
      blockers: [],
    },
    warnings: ["degraded_handoff=true", "allow_blocked upstream"],
    source_snapshot: [],
    project_context: {
      language: "es",
      country_context: "PE",
      degree_level: "maestria",
      master_template_key: "MASTER_TEMPLATE_LATAM",
      topic: "Tema dashboard",
    },
    source_registry: [
      {
        source_id: "source-metadata",
        reference_id: "source-metadata",
        title: "Fuente metadata",
        authors: [],
        year: 2024,
        venue: null,
        doi: null,
        landing_page_url: null,
        pdf_url: null,
        openalex_id: null,
        crossref_id: null,
        is_open_access: true,
        selected_order: 1,
        eligible_for_formal_reference: true,
        citation_metadata: { raw: {} },
        materialization_refs: {
          extracted_text_refs: [],
          chunk_refs: [],
          pdf_refs: [],
          derived_asset_refs: [],
        },
      },
    ],
    evidence_units: [
      {
        evidence_id: "metadata-context",
        source_id: "source-metadata",
        unit_type: "context_only",
        section_keys: ["problem_statement"],
        label: "metadata title",
        original_text: "Titulo de fuente usado solo como contexto.",
        summary_es: null,
        page_start: null,
        page_end: null,
        char_start: null,
        char_end: null,
        quote_hash: null,
        original_language: "es",
        citation_eligibility: "not_citable",
        confidence: 0.4,
        relevance_score: 0.3,
        claim_scope: "do_not_claim",
      },
    ],
    section_packets: [
      {
        section_key: "problem_statement",
        readiness: "baja",
        summary: null,
        source_ids: ["source-metadata"],
        snippet_ids: [],
        evidence_ids: ["metadata-context"],
        asset_keys: [],
        key_points: [],
        open_questions: [],
        missing_elements: [],
        do_not_claim: [],
        assumptions_allowed: [],
        recommended_chunk_refs: [],
        required_original_fragments: [],
      },
    ],
    weak_section_packets: [],
    source_priorities: [
      {
        source_id: "source-metadata",
        source_health_classification: {
          source_id: "source-metadata",
          source_health: "metadata_only",
          topic_fit: "weak",
          allowed_evidence_use: "context_only",
        },
      },
    ],
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
    traceability: { source_artifacts: [], immutable_snapshot_hash: "snapshot" },
  };
}

async function runTest(name: string, fn: () => void): Promise<TestResult> {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const results = await Promise.all([
    runTest("production readiness report keeps degraded handoff ineligible", () => {
      const h = handoff();
      const input = buildBlueprintEngineInputFromEvidenceHandoffV1(h);
      const safety = evaluateBlueprintProductionSafety(input, {
        signals: {
          diagnostic_only: true,
          production_valid: false,
          degraded_handoff: true,
          allow_blocked_upstream: true,
          upstream_step_3_decision: "BLOCK",
          usable_full_text_source_count: 0,
          min_usable_full_text_source_count: 4,
        },
      });
      const reducedPack = buildReducedEvidencePackFromHandoff(h);
      const telemetry = buildRunTelemetryArtifact({
        run_id: "run-dashboard",
        pipeline_stage: "blueprint_engine",
        handoff: h,
        usage_delta: { calls: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, totalTokens: 15, costUsd: 0.01, costCad: 0.014 },
        production_eligible: safety.production_eligible,
        diagnostic_compatible: safety.diagnostic_compatible,
      });
      const dashboard = buildQualityDashboard({
        run_id: "run-dashboard",
        handoff: h,
        production_safety: safety,
        reduced_evidence_pack: reducedPack,
        run_telemetry: telemetry,
        warnings: ["warning"],
        blockers: [],
      });
      const report = renderProductionReadinessReport(dashboard);
      assert(!dashboard.production_eligibility.production_eligible, "dashboard should block production");
      assert(report.includes("production readiness: blocked"), "report should state production blocked");
      assert(report.includes("Add stronger sources"), "report should include source remediation guidance");
    }),
    runTest("run comparison detects cost/runtime/QA deltas", () => {
      const root = path.join(process.cwd(), "artifacts-local", "test-run-comparison");
      const previous = path.join(root, "previous");
      const current = path.join(root, "current");
      mkdirSync(previous, { recursive: true });
      mkdirSync(current, { recursive: true });
      writeFileSync(path.join(previous, "full-diagnostic-summary.json"), JSON.stringify({ production_eligible: false, warnings: [], blockers: [], source_count: 4, evidence_unit_count: 70 }, null, 2));
      writeFileSync(path.join(current, "full-diagnostic-summary.json"), JSON.stringify({ production_eligible: false, warnings: ["w"], blockers: [], source_count: 4, evidence_unit_count: 70 }, null, 2));
      writeFileSync(path.join(previous, "run-telemetry.json"), JSON.stringify({ call_count: 10, total_tokens: 1000, estimated_cost_usd: 0.1, estimated_cost_cad: 0.14, duration_ms: 1000 }, null, 2));
      writeFileSync(path.join(current, "run-telemetry.json"), JSON.stringify({ call_count: 8, total_tokens: 800, estimated_cost_usd: 0.08, estimated_cost_cad: 0.11, duration_ms: 900 }, null, 2));
      writeFileSync(path.join(previous, "121-master-docx-qa-report.json"), JSON.stringify({ score_100: 96 }, null, 2));
      writeFileSync(path.join(current, "121-master-docx-qa-report.json"), JSON.stringify({ score_100: 100 }, null, 2));
      writeFileSync(path.join(previous, "131-university-docx-qa-report.json"), JSON.stringify({ score_100: 96 }, null, 2));
      writeFileSync(path.join(current, "131-university-docx-qa-report.json"), JSON.stringify({ score_100: 100 }, null, 2));
      const comparison = buildDiagnosticRunComparison({
        previousRunFolder: previous,
        currentRunFolder: current,
      });
      assert(comparison.deltas.estimated_cost_usd === -0.02, `cost delta was ${comparison.deltas.estimated_cost_usd}`);
      assert(comparison.deltas.duration_ms === -100, `runtime delta was ${comparison.deltas.duration_ms}`);
      assert(comparison.deltas.master_docx_qa_score === 4, `QA delta was ${comparison.deltas.master_docx_qa_score}`);
    }),
  ]);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main();
