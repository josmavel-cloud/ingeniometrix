import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildDeepResearchCandidateSourceSupplement,
  mergeCandidateSourcesWithSupplement,
  publishDeepResearchCandidateSupplementRun,
  type CandidateSourcesArtifactLike,
} from "@/server/blueprint-engine/quality/deep-research-source-supplement";
import type { RapidDeepResearchFallbackArtifactsV1 } from "@/server/blueprint-engine/quality/rapid-deep-research-fallback";

async function main() {
  const base: CandidateSourcesArtifactLike = {
    case_id: "neutral-case",
    generated_at: "2026-01-01T00:00:00.000Z",
    candidates: [
      {
        candidate_id: "base-001",
        title: "Neutral baseline source",
        authors: ["A. Author"],
        year: 2024,
        venue: "Neutral Journal",
        doi: "10.1000/base",
        landing_page_url: "https://example.test/base",
        open_access_status: "landing_page_only",
        relevance_score: 55,
        rank: 1,
        provider: "openalex",
        reasons: ["Base source."],
        warnings: [],
      },
    ],
  };
  const evidenceCandidates: RapidDeepResearchFallbackArtifactsV1["evidenceCandidates"] = {
    artifact_type: "deep_research_evidence_candidates",
    artifact_version: "v1",
    generated_at: "2026-01-01T00:00:00.000Z",
    case_id: "neutral-case",
    evidence_candidate_count: 2,
    warnings: [],
    candidates: [
      {
        evidence_candidate_id: "dr-ev-001",
        evidence_need_id: "method_or_study_design",
        gap_addressed: "Missing source-backed study design support.",
        candidate_evidence: {
          evidence_type: "method_definition",
          claim_or_use: "Potential support after local verification.",
          excerpt_or_summary: "A neutral summary with a method signal.",
          exact_quote_if_available: null,
          page_or_section_if_available: null,
        },
        reference: {
          title: "Neutral method source",
          authors: ["B. Researcher"],
          year: 2023,
          venue: "Methods Review",
          doi: "10.1000/method",
          url: "https://example.test/method",
          source_type: "journal_article",
        },
        why_relevant: "It may cover the missing method support.",
        confidence: "medium",
        validation_status: "candidate_pending_local_verification",
        must_pass_source_selection: true,
        must_pass_pdf_or_source_inspection: true,
        must_pass_evidence_engine: true,
        warnings: [],
      },
      {
        evidence_candidate_id: "dr-ev-duplicate",
        evidence_need_id: "direct_nuclear_sources",
        gap_addressed: "Duplicate of the base source.",
        candidate_evidence: {
          evidence_type: "empirical_finding",
          claim_or_use: "Should be skipped as duplicate.",
          excerpt_or_summary: "Duplicate source.",
          exact_quote_if_available: null,
          page_or_section_if_available: null,
        },
        reference: {
          title: "Neutral baseline source",
          authors: ["A. Author"],
          year: 2024,
          venue: "Neutral Journal",
          doi: "10.1000/base",
          url: "https://example.test/base",
          source_type: "journal_article",
        },
        why_relevant: "Duplicate.",
        confidence: "low",
        validation_status: "candidate_pending_local_verification",
        must_pass_source_selection: true,
        must_pass_pdf_or_source_inspection: true,
        must_pass_evidence_engine: true,
        warnings: [],
      },
    ],
  };

  const supplement = buildDeepResearchCandidateSourceSupplement({
    caseId: "neutral-case",
    baseCandidateSources: base,
    deepResearchEvidenceCandidates: evidenceCandidates,
    originatingEvidenceRunFolder: "neutral-run-folder",
  });

  assert.equal(supplement.artifact_type, "candidate_sources_supplement");
  assert.equal(supplement.supplement_candidate_count, 1);
  assert.equal(supplement.skipped_duplicate_count, 1);
  assert.equal(supplement.selection_policy.allowed_for_direct_citation, false);
  assert.equal(supplement.candidates[0]?.citable_status, "candidate_only_not_citable_yet");
  assert.equal(supplement.candidates[0]?.must_pass_source_selection, true);
  assert.equal(supplement.candidates[0]?.must_pass_pdf_or_source_inspection, true);
  assert.equal(supplement.candidates[0]?.must_pass_evidence_engine, true);

  const merged = mergeCandidateSourcesWithSupplement({ base, supplement });
  assert.equal(merged.candidates?.length, 2);
  assert(merged.candidates?.some((candidate) => candidate.provider === "openai_deep_research"));

  const serialized = JSON.stringify(supplement);
  for (const staleTerm of ["adaptive reuse", "seismic isolators", "shaking table"]) {
    assert.equal(
      serialized.toLowerCase().includes(staleTerm),
      false,
      `Supplement must not include unrelated stale term: ${staleTerm}`,
    );
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), "imx-dr-supplement-"));
  const baseRun = path.join(tmp, "candidate-runs", "neutral-case", "base-run");
  const evidenceRun = path.join(tmp, "evidence-runs", "neutral-case", "evidence-run");
  await writeFile(path.join(baseRun, "candidate-sources.json"), JSON.stringify(base, null, 2), {
    flag: "wx",
  }).catch(async () => {
    await import("node:fs/promises").then((fs) => fs.mkdir(baseRun, { recursive: true }));
    await writeFile(path.join(baseRun, "candidate-sources.json"), JSON.stringify(base, null, 2));
  });
  await import("node:fs/promises").then(async (fs) => {
    await fs.mkdir(baseRun, { recursive: true });
    await fs.mkdir(evidenceRun, { recursive: true });
    await fs.writeFile(path.join(baseRun, "intake-fixture.json"), JSON.stringify({ case_id: "neutral-case" }));
    await fs.writeFile(
      path.join(baseRun, "normalized-intake-context.json"),
      JSON.stringify({ normalized_at: "2026-01-01T00:00:00.000Z" }),
    );
  });
  const published = await publishDeepResearchCandidateSupplementRun({
    caseId: "neutral-case",
    baseCandidateRunFolder: baseRun,
    evidenceRunFolder: evidenceRun,
    baseCandidateSources: base,
    supplement,
    candidateRoot: path.join(tmp, "published-candidate-runs"),
  });
  const publishedCandidateSources = JSON.parse(
    await readFile(path.join(published.run_folder, "candidate-sources.json"), "utf8"),
  ) as CandidateSourcesArtifactLike;
  const publishedTemplate = JSON.parse(
    await readFile(path.join(published.run_folder, "source-selection-template.json"), "utf8"),
  ) as { candidates?: Array<{ candidate_id: string; citable_status?: string | null }> };

  assert.equal(published.candidate_count, 2);
  assert.equal(published.supplement_candidate_count, 1);
  assert.equal(publishedCandidateSources.candidates?.length, 2);
  assert(
    publishedTemplate.candidates?.some(
      (candidate) => candidate.citable_status === "candidate_only_not_citable_yet",
    ),
  );

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "deep_research_candidates_become_non_citable_supplement_candidates",
          "duplicate_candidates_are_skipped",
          "merged_candidate_list_contains_base_and_supplement",
          "published_run_can_be_loaded_by_source_selection_ui",
          "stale_terms_not_introduced",
        ],
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
