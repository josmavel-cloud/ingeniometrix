import type {
  ConsolidatedEvidenceUnit,
} from "@/blueprint_launch/server/local-playground-store";
import { evaluateSectionEvidenceBinding } from "@/server/blueprint-engine/quality/section-evidence-binding";
import { buildCitationReferenceLayerForDiagnostics } from "@/server/blueprint-v2/lab/academic-document-compiler";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import type { MasterSectionDraft } from "@/server/blueprint-v2/types";

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function result(name: string, passed: boolean, details: string): TestResult {
  return { name, passed, details };
}

function evidenceUnit(
  sourceId: string,
  evidenceId: string,
  overrides: Partial<ConsolidatedEvidenceUnit> = {},
): ConsolidatedEvidenceUnit {
  return {
    evidence_id: evidenceId,
    source_id: sourceId,
    source_title: `Source ${sourceId}`,
    unit_type: "original_excerpt",
    section_keys: ["problem_statement"],
    label: "Extracto original",
    original_text: "Texto original recuperado desde una fuente con chunks verificables.",
    summary_es: null,
    page_start: 1,
    page_end: 1,
    char_start: 10,
    char_end: 120,
    quote_hash: "quote-hash",
    asset_key: null,
    asset_path: null,
    caption: null,
    original_language: "es",
    citation_eligibility: "direct_quote",
    confidence: 0.85,
    relevance_score: 0.8,
    ...overrides,
  };
}

const directUnit = evidenceUnit("source-direct", "ev-direct-llm-chunk-1");
const adjacentUnit = evidenceUnit("source-adjacent", "ev-adjacent-llm-chunk-1");
const metadataUnit = evidenceUnit("source-metadata", "ev-metadata-title", {
  unit_type: "metadata_context",
  citation_eligibility: "context_only",
  original_text: null,
  summary_es: "Titulo o abstract sin texto completo recuperado.",
  quote_hash: null,
  page_start: null,
  page_end: null,
  char_start: null,
  char_end: null,
});

const sourceHealth = [
  {
    source_id: "source-direct",
    source_health: "usable_full_text",
    topic_fit: "direct",
    allowed_evidence_use: "direct_claim_support",
  },
  {
    source_id: "source-adjacent",
    source_health: "usable_full_text",
    topic_fit: "adjacent",
    allowed_evidence_use: "cautious_support",
    warnings: [
      "Energy dissipator source is adjacent/background for seismic isolator claims.",
    ],
  },
  {
    source_id: "source-metadata",
    source_health: "metadata_only",
    topic_fit: "direct",
    allowed_evidence_use: "context_only",
  },
];

function draft(sectionKey: string, binding: ReturnType<typeof evaluateSectionEvidenceBinding>): MasterSectionDraft {
  return {
    section_key: sectionKey,
    title: "Planteamiento del problema",
    phase: "framing",
    content:
      "El aislamiento sismico debe evaluarse con evidencia recuperada y con alcance pendiente de validacion.",
    content_kind: "rich_text",
    support_level: "reference_supported",
    supported_source_ids: binding.used_source_ids,
    supported_pdf_source_ids: [],
    supported_web_source_ids: [],
    supported_assumption_ids: [],
    evidence_snippet_ids: [],
    used_evidence_ids: binding.used_evidence_ids,
    used_original_excerpt_ids: binding.used_original_excerpt_ids,
    used_asset_keys: binding.used_asset_keys,
    section_evidence_binding: binding,
    evidence_support_summary: binding.evidence_support_summary,
    unsupported_or_cautious_claim_warnings:
      binding.unsupported_or_cautious_claim_warnings,
    quality_checks: {
      min_words_pass: true,
      max_words_pass: true,
      required_structure_pass: true,
      critical_assets_pass: true,
      claims_guard_pass: binding.guard_failures.length === 0,
      language_pass: true,
      format_contamination_pass: true,
      citation_deferred_pass: true,
      punctuation_pass: true,
      research_logic_shape_pass: true,
    },
    warnings: binding.unsupported_or_cautious_claim_warnings,
    prompt: "synthetic",
  };
}

function runTests() {
  const directBinding = evaluateSectionEvidenceBinding({
    section_key: "problem_statement",
    title: "Planteamiento del problema",
    content: "El aislamiento sismico se evalua como propuesta preliminar.",
    used_evidence_ids: [directUnit.evidence_id],
    used_source_ids: ["source-direct"],
    used_original_excerpt_ids: [directUnit.evidence_id],
    evidence_units: [directUnit, adjacentUnit, metadataUnit],
    source_health: sourceHealth,
  });
  const adjacentBinding = evaluateSectionEvidenceBinding({
    section_key: "theoretical_framework",
    title: "Marco teorico sobre aisladores sismicos",
    content:
      "El desempeno sismico de edificios con aisladores se mejora por transferencia de evidencia comparada.",
    used_evidence_ids: [adjacentUnit.evidence_id],
    used_source_ids: ["source-adjacent"],
    used_original_excerpt_ids: [adjacentUnit.evidence_id],
    evidence_units: [directUnit, adjacentUnit, metadataUnit],
    source_health: sourceHealth,
  });
  const metadataBinding = evaluateSectionEvidenceBinding({
    section_key: "analysis_plan",
    title: "Plan de analisis",
    content:
      "La propuesta reduce 30% la demanda y cumple normativa si se adopta en edificios peruanos.",
    used_evidence_ids: [metadataUnit.evidence_id],
    used_source_ids: ["source-metadata"],
    evidence_units: [directUnit, adjacentUnit, metadataUnit],
    source_health: sourceHealth,
  });
  const contextBinding = evaluateSectionEvidenceBinding({
    section_key: "general_research_question",
    title: "Pregunta general",
    content: "Como deberia evaluarse la pertinencia de aisladores en edificios peruanos?",
    used_evidence_ids: [metadataUnit.evidence_id],
    used_source_ids: ["source-metadata"],
    evidence_units: [directUnit, adjacentUnit, metadataUnit],
    source_health: sourceHealth,
  });
  const provenance = buildDocumentProvenanceReport([
    draft("problem_statement", directBinding),
    draft("theoretical_framework", adjacentBinding),
    draft("general_research_question", contextBinding),
  ]);
  const centralCitationLayer = buildCitationReferenceLayerForDiagnostics({
    sectionKey: "theoretical_framework",
    title: "Marco teórico",
    content:
      "La sección central debe citar únicamente fuentes directas cuando se discuten fundamentos.",
    sourceRegistry: [
      {
        source_id: "source-direct",
        title: "Direct source",
        authors: [],
        year: 2026,
        citation_label: "Direct, 2026",
        source_health: "usable_full_text",
        topic_fit: "direct",
        allowed_evidence_use: "direct_claim_support",
      },
      {
        source_id: "source-adjacent",
        title: "Adjacent source",
        authors: [],
        year: 2026,
        citation_label: "Adjacent, 2026",
        source_health: "usable_full_text",
        topic_fit: "adjacent",
        allowed_evidence_use: "cautious_support",
      },
    ] as never,
    sourceIds: ["source-direct", "source-adjacent"],
  });

  return [
    result(
      "section draft with valid evidence id is counted as evidence-bound",
      directBinding.used_evidence_ids.length === 1 &&
        directBinding.evidence_support_summary.direct_claim_support_count === 1 &&
        directBinding.support_tier === "direct_source_backed",
      JSON.stringify(directBinding.evidence_support_summary),
    ),
    result(
      "adjacent source used for central claim emits guard warning",
      adjacentBinding.guard_failures.some((warning) => /Adjacent/.test(warning)) &&
        adjacentBinding.evidence_support_summary.adjacent_source_count === 1,
      adjacentBinding.guard_failures.join(" | "),
    ),
    result(
      "metadata-only evidence for quantitative claim emits guard warning",
      metadataBinding.guard_failures.some((warning) => /Metadata-only/.test(warning)) &&
        metadataBinding.evidence_support_summary.metadata_only_count === 1,
      metadataBinding.guard_failures.join(" | "),
    ),
    result(
      "context-only section is marked weak or contextual",
      contextBinding.support_tier === "context_only" &&
        contextBinding.unsupported_or_cautious_claim_warnings.some((warning) =>
          /context\/intake\/metadata/.test(warning),
        ),
      `${contextBinding.support_tier}: ${contextBinding.unsupported_or_cautious_claim_warnings.join(" | ")}`,
    ),
    result(
      "provenance report counts evidence-bound sections",
      provenance.sections_with_evidence_ids === 3 &&
        provenance.sections_with_original_excerpts === 2 &&
        provenance.sections_with_only_contextual_support === 1 &&
        provenance.sections_with_adjacent_source_warnings === 1 &&
        typeof provenance.section_evidence_binding_score === "number",
      JSON.stringify({
        evidence: provenance.sections_with_evidence_ids,
        excerpts: provenance.sections_with_original_excerpts,
        contextOnly: provenance.sections_with_only_contextual_support,
        adjacent: provenance.sections_with_adjacent_source_warnings,
        score: provenance.section_evidence_binding_score,
      }),
    ),
    result(
      "central section compiler omits adjacent/context-only citation anchors",
      centralCitationLayer.citation_anchors.length === 1 &&
        centralCitationLayer.citation_anchors[0]?.source_ids[0] === "source-direct" &&
        centralCitationLayer.blocks.every(
          (block) =>
            !("citation_anchor_ids" in block) ||
            !block.citation_anchor_ids.some((anchorId) => /adjacent/i.test(anchorId)),
        ),
      JSON.stringify(centralCitationLayer.citation_anchors),
    ),
  ];
}

function main() {
  const results = runTests();
  const failed = results.filter((entry) => !entry.passed);

  for (const entry of results) {
    console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name} :: ${entry.details}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} section evidence binding checks passed.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
