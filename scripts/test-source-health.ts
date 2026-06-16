import { buildBlueprintEngineInputFromEvidenceHandoffV1 } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import type {
  EvidenceEngineHandoffV1,
  EvidenceUnitHandoffRecord,
  JsonValue,
  SourceHandoffRecord,
} from "@/server/blueprint-engine/contracts";
import { evaluateBlueprintProductionSafety } from "@/server/blueprint-engine/quality/production-safety";
import {
  classifySourceHealth,
  summarizeSourceHealthFromHandoff,
} from "@/server/blueprint-engine/quality/source-health";

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function test(name: string, passed: boolean, details: string): TestResult {
  return { name, passed, details };
}

function source(sourceId: string, title: string, raw: Record<string, JsonValue> = {}): SourceHandoffRecord {
  return {
    source_id: sourceId,
    reference_id: sourceId,
    title,
    authors: [],
    year: null,
    venue: null,
    doi: null,
    landing_page_url: null,
    pdf_url: null,
    openalex_id: null,
    crossref_id: null,
    is_open_access: true,
    selected_order: 1,
    eligible_for_formal_reference: true,
    citation_metadata: {
      raw,
    },
    materialization_refs: {
      extracted_text_refs: [],
      chunk_refs: [],
      pdf_refs: [],
      derived_asset_refs: [],
    },
  };
}

function evidenceUnit(sourceId: string, evidenceId: string): EvidenceUnitHandoffRecord {
  return {
    evidence_id: evidenceId,
    source_id: sourceId,
    unit_type: "original_excerpt",
    section_keys: ["background"],
    label: "Extracto",
    original_text: "Texto extraido y respaldado por chunk de fuente recuperada.",
    summary_es: null,
    page_start: 1,
    page_end: 1,
    char_start: 10,
    char_end: 80,
    quote_hash: "quote-hash",
    original_language: "es",
    citation_eligibility: "direct_quote",
    confidence: 0.8,
    relevance_score: 0.8,
    claim_scope: "source_fact",
  };
}

function minimalHandoff(): EvidenceEngineHandoffV1 {
  return {
    handoff_id: "evidence-handoff-source-health-test",
    handoff_version: "evidence_engine_handoff.v1",
    project_id: "project-source-health-test",
    evidence_run_id: "evidence-run-source-health-test",
    created_at: "2026-05-04T00:00:00.000Z",
    source_engine: "EvidenceEngine",
    source_engine_version: "test",
    artifact_hash: "hash-source-health-test",
    readiness: "media",
    quality_gate: {
      status: "warn",
      warnings: [],
      blockers: [],
    },
    warnings: [],
    source_snapshot: [],
    project_context: {
      language: "es",
      country_context: "PE",
      degree_level: "posgrado",
      master_template_key: "MASTER_TEMPLATE_LATAM",
      topic: "Uso de aisladores sismicos en edificios peruanos",
    },
    source_registry: [
      source("source-usable", "Direct isolated building source"),
      source("source-metadata", "Metadata-only standard source"),
      source("source-adjacent", "Performance Analysis of Energy Dissipators Implemented in Buildings"),
    ],
    evidence_units: [
      evidenceUnit("source-usable", "snippet:source-usable-llm-chunk-p1-c1"),
      evidenceUnit("source-metadata", "snippet:source-metadata-title"),
      evidenceUnit("source-adjacent", "snippet:source-adjacent-llm-chunk-p2-c2"),
    ],
    section_packets: [
      {
        section_key: "background",
        readiness: "media",
        summary: null,
        source_ids: ["source-usable"],
        snippet_ids: [],
        evidence_ids: ["snippet:source-usable-llm-chunk-p1-c1"],
        asset_keys: [],
        key_points: [],
        open_questions: [],
        missing_elements: [],
        do_not_claim: [],
        assumptions_allowed: [],
        recommended_chunk_refs: [],
        required_original_fragments: ["snippet:source-usable-llm-chunk-p1-c1"],
      },
    ],
    weak_section_packets: [],
    source_priorities: [
      {
        source_id: "source-usable",
        reason: "relevancia=directa; utilidad=alta; input=pdf; snippets=1; assets=0",
      },
      {
        source_id: "source-metadata",
        reason: "relevancia=directa; utilidad=media; input=abstract_metadata; snippets=1; assets=0",
      },
      {
        source_id: "source-adjacent",
        reason:
          "relevancia=parcial; utilidad=media; input=pdf; snippets=1; riesgo=disipadores no aisladores",
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
    traceability: {
      source_artifacts: [],
      immutable_snapshot_hash: "hash-source-health-test",
    },
  };
}

function runTests() {
  const usable = classifySourceHealth({
    source_id: "usable",
    materialization_status: "downloaded",
    stored_kind: "pdf",
    text_char_count: 12_000,
    chunk_count: 6,
    has_complete_public_content: true,
    topic_relevance: "directa",
  });
  const metadata = classifySourceHealth({
    source_id: "metadata",
    access_status: "metadata_only",
    access_kind: "abstract_only",
    source_input_mode: "abstract_metadata",
    topic_relevance: "directa",
  });
  const unresolved = classifySourceHealth({
    source_id: "unresolved",
    access_status: "unresolved",
    warnings: ["acceso no resuelto"],
  });
  const scanned = classifySourceHealth({
    source_id: "scanned",
    materialization_status: "downloaded",
    stored_kind: "pdf",
    access_kind: "pdf",
    text_char_count: 0,
    chunk_count: 0,
    topic_relevance: "directa",
  });
  const adjacent = classifySourceHealth({
    source_id: "adjacent",
    materialization_status: "downloaded",
    stored_kind: "pdf",
    text_char_count: 3_000,
    chunk_count: 2,
    topic_relevance: "directa",
    warnings: ["No trata directamente aislamiento sismico; es un caso de energy dissipators."],
  });
  const handoff = minimalHandoff();
  const summary = summarizeSourceHealthFromHandoff(handoff);
  const blueprintInput = buildBlueprintEngineInputFromEvidenceHandoffV1(handoff, {
    blueprintRunId: "source-health-production-test",
    executionMode: "dry_run",
    targetSteps: [7],
  });
  const safety = evaluateBlueprintProductionSafety(blueprintInput, {
    signals: {
      min_usable_full_text_source_count: 4,
      min_materialized_source_count: 1,
    },
  });

  return [
    test(
      "materialized source with chunks is usable full text",
      usable.source_health === "usable_full_text" &&
        usable.topic_fit === "direct" &&
        usable.allowed_evidence_use === "direct_claim_support",
      JSON.stringify(usable),
    ),
    test(
      "metadata-only source is context-only",
      metadata.source_health === "metadata_only" && metadata.allowed_evidence_use === "context_only",
      JSON.stringify(metadata),
    ),
    test(
      "unresolved source is gap-only or do-not-use",
      unresolved.source_health === "unresolved" &&
        ["gap_only", "do_not_use"].includes(unresolved.allowed_evidence_use),
      JSON.stringify(unresolved),
    ),
    test(
      "downloaded PDF with zero chunks is unextractable",
      scanned.source_health === "unextractable_pdf",
      JSON.stringify(scanned),
    ),
    test(
      "adjacent-topic warning limits source use",
      adjacent.topic_fit === "adjacent" &&
        ["cautious_support", "context_only"].includes(adjacent.allowed_evidence_use),
      JSON.stringify(adjacent),
    ),
    test(
      "handoff source health summary exposes counts",
      summary.usable_full_text_source_count === 2 &&
        summary.metadata_only_source_count === 1 &&
        summary.adjacent_source_count === 1 &&
        summary.metadata_only_source_used_as_direct_evidence === true,
      JSON.stringify({
        usable: summary.usable_full_text_source_count,
        metadata: summary.metadata_only_source_count,
        adjacent: summary.adjacent_source_count,
        metadataDirect: summary.metadata_only_source_used_as_direct_evidence,
      }),
    ),
    test(
      "production eligibility fails below usable full-text minimum",
      safety.production_eligible === false &&
        safety.production_ineligibility_reasons.some((reason) =>
          reason.includes("Usable full-text source count"),
        ),
      safety.production_ineligibility_reasons.join(" | "),
    ),
  ];
}

function main() {
  const results = runTests();
  const failed = results.filter((entry) => !entry.passed);

  for (const entry of results) {
    console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name} :: ${entry.details}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} source health checks passed.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
