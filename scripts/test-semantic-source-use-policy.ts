import {
  buildReducedEvidencePackFromHandoff,
  type ReducedEvidencePackV1,
} from "@/server/blueprint-engine/quality/evidence-budget";
import {
  buildSemanticSourceUseReport,
  semanticSourceRoleForSource,
} from "@/server/blueprint-engine/quality/semantic-source-use-policy";
import type { EvidenceEngineHandoffV1, EvidenceUnitHandoffRecord } from "@/server/blueprint-engine/contracts";
import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: boolean, detail: string) {
  if (!condition) throw new Error(detail);
}

function source(source_id: string, raw: Record<string, unknown>) {
  return {
    source_id,
    reference_id: source_id,
    title: `${source_id} title`,
    authors: [],
    year: 2025,
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
      extracted_text_refs: ["text"],
      chunk_refs: ["chunk"],
      pdf_refs: ["pdf"],
      derived_asset_refs: [],
    },
  };
}

function unit(source_id: string, evidence_id: string, section_key: string): EvidenceUnitHandoffRecord {
  return {
    evidence_id,
    source_id,
    unit_type: "original_excerpt",
    section_keys: [section_key],
    label: evidence_id,
    original_text: `Source-backed evidence text for ${evidence_id} with enough detail to be used in a section.`,
    summary_es: `Resumen ${evidence_id}`,
    page_start: 1,
    page_end: 1,
    char_start: 0,
    char_end: 120,
    quote_hash: `hash-${evidence_id}`,
    original_language: "es",
    citation_eligibility: "direct_quote",
    confidence: 0.9,
    relevance_score: 0.9,
    claim_scope: "source_fact",
    asset_key: null,
    asset_ref: null,
    caption: null,
  };
}

function handoff(): EvidenceEngineHandoffV1 {
  const evidence_units = [
    unit("direct-a", "direct-a-1", "theoretical_framework"),
    unit("direct-a", "direct-a-2", "methodology"),
    unit("direct-b", "direct-b-1", "problem_statement"),
    unit("direct-b", "direct-b-2", "variables_indicators"),
    unit("adjacent-c", "adjacent-c-1", "theoretical_framework"),
    unit("adjacent-c", "adjacent-c-2", "methodology"),
    unit("adjacent-c", "adjacent-c-3", "state_of_the_art"),
    unit("metadata-d", "metadata-d-1", "theoretical_framework"),
  ];

  return {
    contract_version: "evidence_engine_handoff.v1",
    handoff_id: "handoff-test",
    evidence_run_id: "run-test",
    project_id: "project-test",
    artifact_hash: "artifact-hash",
    generated_at: "2026-01-01T00:00:00.000Z",
    project_context: {
      topic: "Neutral topic",
      problem_context: "Neutral problem",
      research_line: "Neutral line",
      methodology_preference: null,
      population_or_context: null,
      advisor_or_user_notes: null,
      constraints: null,
      retrieval_brief: null,
      normalized_problem_core: null,
      degree_level: "maestria",
      university: "Universidad",
      academic_program: "Programa",
      target_template_key: "upc",
    },
    proposal_context: {},
    source_registry: [
      source("direct-a", {
        source_health_classification: {
          source_id: "direct-a",
          source_health: "usable_full_text",
          topic_fit: "direct",
          allowed_evidence_use: "direct_claim_support",
        },
      }),
      source("direct-b", {
        source_health_classification: {
          source_id: "direct-b",
          source_health: "usable_full_text",
          topic_fit: "direct",
          allowed_evidence_use: "direct_claim_support",
        },
      }),
      source("adjacent-c", {
        source_health_classification: {
          source_id: "adjacent-c",
          source_health: "usable_full_text",
          topic_fit: "adjacent",
          allowed_evidence_use: "cautious_support",
        },
      }),
      source("metadata-d", {
        source_health_classification: {
          source_id: "metadata-d",
          source_health: "metadata_only",
          topic_fit: "weak",
          allowed_evidence_use: "context_only",
        },
      }),
    ],
    source_priorities: [],
    evidence_units,
    section_packets: [
      { section_key: "theoretical_framework", evidence_ids: ["direct-a-1", "adjacent-c-1", "metadata-d-1"], asset_keys: [], notes: [] },
      { section_key: "methodology", evidence_ids: ["direct-a-2", "adjacent-c-2"], asset_keys: [], notes: [] },
      { section_key: "problem_statement", evidence_ids: ["direct-b-1"], asset_keys: [], notes: [] },
      { section_key: "variables_indicators", evidence_ids: ["direct-b-2"], asset_keys: [], notes: [] },
    ],
    weak_section_packets: [],
    asset_registry: [],
    asset_usage_plan: [],
    assumptions: [],
    quality_gate: { status: "warn", warnings: [], blockers: [] },
    readiness: "media",
    warnings: [],
    traceability: { source_artifacts: [], immutable_snapshot_hash: "snapshot" },
    source_snapshot: [],
  } as unknown as EvidenceEngineHandoffV1;
}

function runTest(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function docWithSources(sectionKey: string, sourceIds: string[]): AcademicDocument {
  return {
    sections: [
      {
        section_key: sectionKey,
        source_ids: sourceIds,
        citation_anchors: [],
        warnings: [],
        blocks: [],
      },
    ],
  } as unknown as AcademicDocument;
}

const results = [
  runTest("classifies adjacent source separately from direct method sources", () => {
    const role = semanticSourceRoleForSource({
      source: {
        source_id: "adjacent-c",
        source_health: "usable_full_text",
        topic_fit: "adjacent",
        allowed_evidence_use: "cautious_support",
        reasons: [],
        warnings: [],
      },
    });
    assert(role.role === "adjacent_source", `expected adjacent_source, got ${role.role}`);
  }),
  runTest("reduced evidence pack limits adjacent source share", () => {
    const pack: ReducedEvidencePackV1 = buildReducedEvidencePackFromHandoff(handoff(), {
      policy: {
        max_evidence_units_total: 6,
        max_adjacent_evidence_units_total: 1,
        max_contextual_evidence_units_total: 0,
      },
    });
    const adjacentCount = pack.evidence_units.filter((unit) => unit.source_id === "adjacent-c").length;
    const metadataCount = pack.evidence_units.filter((unit) => unit.source_id === "metadata-d").length;
    assert(adjacentCount <= 1, `expected <=1 adjacent unit, got ${adjacentCount}`);
    assert(metadataCount === 0, `metadata/context evidence should be removed, got ${metadataCount}`);
  }),
  runTest("semantic source report flags adjacent source in internal draft separately from public DOCX", () => {
    const h = handoff();
    const pack = buildReducedEvidencePackFromHandoff(h, {
      policy: { max_evidence_units_total: 6, max_adjacent_evidence_units_total: 2 },
    });
    const report = buildSemanticSourceUseReport({
      handoff: h,
      reducedEvidencePack: pack,
      methodContract: {
        source_ids: ["direct-a"],
      } as never,
      drafts: [
        {
          section_key: "theoretical_framework",
          supported_source_ids: ["direct-a", "adjacent-c"],
          supported_pdf_source_ids: [],
        } as never,
      ],
      academicDocuments: [docWithSources("theoretical_framework", ["direct-a"])],
    });
    assert(report.public_docx_central_section_adjacent_source_count === 0, "public DOCX should not show adjacent central violation");
    assert(report.draft_generation_central_section_adjacent_source_count > 0, "expected internal draft adjacent finding");
    assert(report.central_section_adjacent_source_count === 0, "legacy public guard count should reflect public DOCX only");
    assert(report.warnings.some((warning) => warning.includes("draft_generation_source_use")), report.warnings.join(" | "));
    assert(!report.warnings.some((warning) => warning.includes("public_docx_source_use")), report.warnings.join(" | "));
  }),
  runTest("semantic source report fails public DOCX central section when adjacent source remains visible", () => {
    const h = handoff();
    const pack = buildReducedEvidencePackFromHandoff(h, {
      policy: { max_evidence_units_total: 6, max_adjacent_evidence_units_total: 2 },
    });
    const report = buildSemanticSourceUseReport({
      handoff: h,
      reducedEvidencePack: pack,
      methodContract: { source_ids: ["direct-a"] } as never,
      academicDocuments: [docWithSources("theoretical_framework", ["direct-a", "adjacent-c"])],
    });
    assert(report.public_docx_central_section_adjacent_source_count === 1, JSON.stringify(report));
    assert(report.central_section_adjacent_source_count === 1, JSON.stringify(report));
    assert(report.warnings.some((warning) => warning.includes("public_docx_source_use")), report.warnings.join(" | "));
  }),
  runTest("semantic source report allows adjacent source in public context section", () => {
    const h = handoff();
    const pack = buildReducedEvidencePackFromHandoff(h, {
      policy: { max_evidence_units_total: 6, max_adjacent_evidence_units_total: 2 },
    });
    const report = buildSemanticSourceUseReport({
      handoff: h,
      reducedEvidencePack: pack,
      methodContract: { source_ids: ["direct-a"] } as never,
      academicDocuments: [docWithSources("state_of_the_art", ["adjacent-c"])],
    });
    const contextFinding = report.public_docx_source_use_findings.find(
      (finding) => finding.section_key === "state_of_the_art" && finding.source_id === "adjacent-c",
    );
    assert(report.public_docx_central_section_adjacent_source_count === 0, JSON.stringify(report));
    assert(contextFinding?.finding === "cautious", JSON.stringify(contextFinding));
  }),
];

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  process.exitCode = 1;
}
