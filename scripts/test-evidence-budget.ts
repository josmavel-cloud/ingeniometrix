import {
  buildReducedEvidencePackFromHandoff,
  type EvidenceBudgetPolicyV1,
} from "@/server/blueprint-engine/quality/evidence-budget";
import type { EvidenceEngineHandoffV1, EvidenceUnitHandoffRecord } from "@/server/blueprint-engine/contracts";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

function source(
  source_id: string,
  title: string,
  raw: Record<string, unknown> = {},
) {
  return {
    source_id,
    reference_id: source_id,
    title,
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
    citation_metadata: { raw: raw as never },
    materialization_refs: {
      extracted_text_refs: [],
      chunk_refs: [],
      pdf_refs: [],
      derived_asset_refs: [],
    },
  };
}

function unit(input: Partial<EvidenceUnitHandoffRecord> & { evidence_id: string; source_id: string; section_keys: string[] }): EvidenceUnitHandoffRecord {
  return {
    evidence_id: input.evidence_id,
    source_id: input.source_id,
    unit_type: input.unit_type ?? "original_excerpt",
    section_keys: input.section_keys,
    label: input.label ?? input.evidence_id,
    original_text: input.original_text ?? "Texto fuente suficientemente largo para ser considerado evidencia directa y trazable.",
    summary_es: input.summary_es ?? "Resumen de evidencia.",
    page_start: input.page_start ?? 1,
    page_end: input.page_end ?? 1,
    char_start: input.char_start ?? 10,
    char_end: input.char_end ?? 100,
    quote_hash: input.quote_hash ?? `hash-${input.evidence_id}`,
    original_language: "es",
    citation_eligibility: input.citation_eligibility ?? "direct_quote",
    confidence: input.confidence ?? 0.9,
    relevance_score: input.relevance_score ?? 0.9,
    claim_scope: input.claim_scope ?? "source_fact",
    asset_key: input.asset_key ?? null,
    asset_ref: null,
    caption: input.caption ?? null,
  };
}

function handoff(): EvidenceEngineHandoffV1 {
  const evidence_units = [
    unit({ evidence_id: "a-1", source_id: "source-a", section_keys: ["problem_statement"] }),
    unit({ evidence_id: "a-2", source_id: "source-a", section_keys: ["problem_statement"] }),
    unit({ evidence_id: "a-3", source_id: "source-a", section_keys: ["methodology"] }),
    unit({ evidence_id: "a-4", source_id: "source-a", section_keys: ["methodology"] }),
    unit({ evidence_id: "b-meta", source_id: "source-b", section_keys: ["problem_statement"], unit_type: "context_only", citation_eligibility: "not_citable", claim_scope: "do_not_claim", quote_hash: null, char_start: null }),
    unit({ evidence_id: "c-adjacent", source_id: "source-c", section_keys: ["theoretical_framework"], citation_eligibility: "paraphrase_only", claim_scope: "background_context" }),
    unit({ evidence_id: "d-method", source_id: "source-d", section_keys: ["methodology"] }),
  ];

  return {
    handoff_id: "evidence-handoff-test",
    handoff_version: "evidence_engine_handoff.v1",
    project_id: "project-test",
    evidence_run_id: "evidence-run-test",
    created_at: new Date(0).toISOString(),
    source_engine: "EvidenceEngine",
    source_engine_version: "test",
    artifact_hash: "hash",
    readiness: "media",
    quality_gate: { status: "warn", warnings: [], blockers: [] },
    warnings: [],
    source_snapshot: [],
    project_context: {
      language: "es",
      country_context: "PE",
      degree_level: "maestria",
      master_template_key: "MASTER_TEMPLATE_LATAM",
      topic: "Tema de prueba",
    },
    source_registry: [
      source("source-a", "Fuente dominante", {
        source_health_classification: { source_id: "source-a", source_health: "usable_full_text", topic_fit: "direct", allowed_evidence_use: "direct_claim_support" },
      }),
      source("source-b", "Fuente metadata", {
        source_health_classification: { source_id: "source-b", source_health: "metadata_only", topic_fit: "weak", allowed_evidence_use: "context_only" },
      }),
      source("source-c", "Fuente adyacente", {
        source_health_classification: { source_id: "source-c", source_health: "usable_full_text", topic_fit: "adjacent", allowed_evidence_use: "cautious_support" },
      }),
      source("source-d", "Fuente metodologica", {
        source_health_classification: { source_id: "source-d", source_health: "usable_full_text", topic_fit: "direct", allowed_evidence_use: "direct_claim_support" },
      }),
    ],
    evidence_units,
    section_packets: ["problem_statement", "methodology", "theoretical_framework"].map((section_key) => ({
      section_key,
      readiness: "media",
      summary: null,
      source_ids: evidence_units.filter((item) => item.section_keys.includes(section_key)).map((item) => item.source_id),
      snippet_ids: [],
      evidence_ids: evidence_units.filter((item) => item.section_keys.includes(section_key)).map((item) => item.evidence_id),
      asset_keys: [],
      key_points: [],
      open_questions: [],
      missing_elements: [],
      do_not_claim: [],
      assumptions_allowed: [],
      recommended_chunk_refs: [],
      required_original_fragments: [],
    })),
    weak_section_packets: [],
    source_priorities: [
      { source_id: "source-a", source_health_classification: { source_id: "source-a", source_health: "usable_full_text", topic_fit: "direct", allowed_evidence_use: "direct_claim_support" } },
      { source_id: "source-b", source_health_classification: { source_id: "source-b", source_health: "metadata_only", topic_fit: "weak", allowed_evidence_use: "context_only" } },
      { source_id: "source-c", source_health_classification: { source_id: "source-c", source_health: "usable_full_text", topic_fit: "adjacent", allowed_evidence_use: "cautious_support" } },
      { source_id: "source-d", source_health_classification: { source_id: "source-d", source_health: "usable_full_text", topic_fit: "direct", allowed_evidence_use: "direct_claim_support" } },
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

const smallPolicy: Partial<EvidenceBudgetPolicyV1> = {
  max_evidence_units_total: 4,
  max_evidence_units_per_section: 2,
  max_evidence_units_per_source_per_section: 1,
  source_dominance_threshold: 0.5,
};

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
    runTest("preserves direct source-backed evidence before metadata/context", () => {
      const pack = buildReducedEvidencePackFromHandoff(handoff(), { policy: smallPolicy });
      assert(pack.evidence_units.some((item) => item.evidence_id === "a-1"), "direct evidence should be retained");
      assert(!pack.evidence_units.some((item) => item.evidence_id === "b-meta"), "metadata evidence should be reduced first");
    }),
    runTest("preserves section coverage", () => {
      const pack = buildReducedEvidencePackFromHandoff(handoff(), { policy: smallPolicy });
      const covered = new Set(pack.evidence_units.flatMap((item) => item.section_keys));
      assert(covered.has("problem_statement"), "problem_statement should be covered");
      assert(covered.has("methodology"), "methodology should be covered");
      assert(covered.has("theoretical_framework"), "theoretical_framework should be covered");
    }),
    runTest("prevents one source from dominating", () => {
      const pack = buildReducedEvidencePackFromHandoff(handoff(), { policy: smallPolicy });
      const sourceACount = pack.source_distribution.find((item) => item.source_id === "source-a")?.reduced_evidence_unit_count ?? 0;
      assert(sourceACount <= 2, `source-a retained ${sourceACount}, expected <= 2`);
    }),
    runTest("limits adjacent evidence to cautious/contextual use", () => {
      const pack = buildReducedEvidencePackFromHandoff(handoff(), { policy: smallPolicy });
      const adjacent = pack.evidence_units.find((item) => item.source_id === "source-c");
      assert(adjacent?.evidence_use === "cautious", "adjacent evidence should be cautious when retained");
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
