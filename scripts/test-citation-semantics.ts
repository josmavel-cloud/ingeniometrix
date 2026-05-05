import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { adaptCurrentLabAArtifactToEvidenceHandoffV1 } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import { evidenceEngineHandoffV1Schema } from "@/server/blueprint-engine/contracts";
import {
  citationCategoryToContractEligibility,
  citationCategoryToLabAEligibility,
  classifyEvidenceCitation,
  summarizeCitationSemantics,
  type CitationSemanticsInput,
} from "@/server/blueprint-engine/quality/citation-semantics";

const DIAGNOSTIC_STEP_6_ARTIFACT_PATH = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-selected-source-runs",
  "case-001-seismic-isolators-peruvian-buildings",
  "2026-05-04T13-20-37-881Z",
  "step-6-consolidated-evidence.json",
);

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function result(name: string, passed: boolean, details: string): TestResult {
  return { name, passed, details };
}

function trueSourceQuote(overrides: Partial<CitationSemanticsInput> = {}): CitationSemanticsInput {
  return {
    evidence_id: "snippet:source-a-llm-chunk-source-a-p12-c3-abcdef12",
    source_id: "source-a",
    unit_type: "original_excerpt",
    extraction_kind: "llm_selected_original",
    label: "extracto_original",
    original_text: "Este fragmento procede del texto extraido de una fuente recuperada.",
    source_chunk_id: "source-a-p12-c3",
    quote_hash: "quote-hash-1",
    citation_eligibility: "direct_quote",
    page_start: 12,
    char_start: 2400,
    ...overrides,
  };
}

function runSyntheticTests(): TestResult[] {
  const metadataSnippet = trueSourceQuote({
    evidence_id: "snippet:source-a-title",
    extraction_kind: "metadata",
    label: "Titulo de la fuente",
    source_chunk_id: null,
    page_start: null,
    char_start: null,
  });
  const intakeSnippet = trueSourceQuote({
    evidence_id: "snippet:source-a-intake",
    extraction_kind: "intake_context",
    label: "Tema del intake",
    source_chunk_id: null,
    page_start: null,
    char_start: null,
  });
  const chunkBackedSnippet = trueSourceQuote();
  const metadataOnlySourceSnippet = trueSourceQuote({
    source_id: "metadata-only-source",
    source_input_mode: "abstract_metadata",
  });
  const summary = summarizeCitationSemantics([
    metadataSnippet,
    intakeSnippet,
    chunkBackedSnippet,
    metadataOnlySourceSnippet,
  ]);

  return [
    result(
      "metadata snippet is not a direct quote",
      classifyEvidenceCitation(metadataSnippet) === "metadata_context" &&
        citationCategoryToContractEligibility(classifyEvidenceCitation(metadataSnippet)) ===
          "not_citable" &&
        citationCategoryToLabAEligibility(classifyEvidenceCitation(metadataSnippet)) ===
          "context_only",
      `category=${classifyEvidenceCitation(metadataSnippet)}`,
    ),
    result(
      "intake snippet is context only",
      classifyEvidenceCitation(intakeSnippet) === "intake_context" &&
        citationCategoryToLabAEligibility(classifyEvidenceCitation(intakeSnippet)) ===
          "context_only",
      `category=${classifyEvidenceCitation(intakeSnippet)}`,
    ),
    result(
      "chunk-backed source excerpt can be a direct quote",
      classifyEvidenceCitation(chunkBackedSnippet) === "direct_quote_from_source_text" &&
        citationCategoryToContractEligibility(classifyEvidenceCitation(chunkBackedSnippet)) ===
          "direct_quote",
      `category=${classifyEvidenceCitation(chunkBackedSnippet)}`,
    ),
    result(
      "metadata-only source cannot satisfy direct quote support",
      classifyEvidenceCitation(metadataOnlySourceSnippet) === "metadata_context" &&
        citationCategoryToContractEligibility(
          classifyEvidenceCitation(metadataOnlySourceSnippet),
        ) === "not_citable",
      `category=${classifyEvidenceCitation(metadataOnlySourceSnippet)}`,
    ),
    result(
      "direct quote count excludes metadata/intake/title snippets",
      summary.reported_direct_quote_count === 4 &&
        summary.true_source_backed_direct_quote_count === 1 &&
        summary.metadata_context_count === 2 &&
        summary.intake_context_count === 1 &&
        summary.citation_semantics_warnings.length > 0,
      JSON.stringify(summary),
    ),
  ];
}

function runDiagnosticArtifactTests(): TestResult[] {
  if (!existsSync(DIAGNOSTIC_STEP_6_ARTIFACT_PATH)) {
    return [
      result(
        "diagnostic artifact fixture is available",
        false,
        `missing ${DIAGNOSTIC_STEP_6_ARTIFACT_PATH}`,
      ),
    ];
  }

  const rawJson = readFileSync(DIAGNOSTIC_STEP_6_ARTIFACT_PATH, "utf8");
  const artifact = JSON.parse(rawJson) as Record<string, unknown>;
  const handoff = adaptCurrentLabAArtifactToEvidenceHandoffV1(artifact, {
    sourceArtifactPath: DIAGNOSTIC_STEP_6_ARTIFACT_PATH,
    rawJson,
  });
  const schemaResult = evidenceEngineHandoffV1Schema.safeParse(handoff);
  const contextPreservation = handoff.proposal_context.context_preservation_contract as
    | Record<string, unknown>
    | undefined;
  const reported = Number(contextPreservation?.reported_direct_quote_count ?? 0);
  const trueBacked = Number(contextPreservation?.true_source_backed_direct_quote_count ?? 0);
  const metadataCount = Number(contextPreservation?.metadata_context_count ?? 0);
  const intakeCount = Number(contextPreservation?.intake_context_count ?? 0);
  const downgradedContextUnits = handoff.evidence_units.filter(
    (unit) =>
      /(?:-title|-intake)$/.test(unit.evidence_id) &&
      unit.unit_type === "context_only" &&
      unit.citation_eligibility === "not_citable",
  );
  const directQuoteCount = handoff.evidence_units.filter(
    (unit) => unit.citation_eligibility === "direct_quote",
  ).length;

  return [
    result(
      "adapted diagnostic handoff remains schema-valid",
      schemaResult.success,
      schemaResult.success
        ? `handoff=${handoff.handoff_id}`
        : schemaResult.error.issues
            .slice(0, 5)
            .map((issue) => issue.message)
            .join("; "),
    ),
    result(
      "diagnostic metadata/intake direct quotes are downgraded",
      reported > trueBacked &&
        directQuoteCount === trueBacked &&
        metadataCount > 0 &&
        intakeCount > 0 &&
        downgradedContextUnits.length > 0,
      `reported=${reported}, true=${trueBacked}, metadata=${metadataCount}, intake=${intakeCount}, downgraded=${downgradedContextUnits.length}`,
    ),
  ];
}

function main() {
  const results = [...runSyntheticTests(), ...runDiagnosticArtifactTests()];
  const failed = results.filter((entry) => !entry.passed);

  for (const entry of results) {
    console.log(`${entry.passed ? "PASS" : "FAIL"} ${entry.name} :: ${entry.details}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} citation semantics checks passed.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
