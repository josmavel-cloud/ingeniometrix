import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildSecondaryReferenceRecoveryQueue } from "@/server/blueprint-engine/quality/secondary-reference-recovery";

type TestResult = { name: string; passed: boolean; detail?: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runTest(name: string, fn: () => Promise<void> | void): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const tempDir = path.join(process.cwd(), "artifacts-local", "test-secondary-reference-recovery");
  mkdirSync(tempDir, { recursive: true });
  const textPath = path.join(tempDir, "source-text.txt");
  writeFileSync(
    textPath,
    [
      "Body text cites (Rivera, 2021) only as a secondary marker.",
      "",
      "References",
      "[1] Garcia, M. and Perez, L. (2020). Control strategy for experimental platforms. Journal of Methods. doi:10.1234/example.2020.001",
      "[2] Smith, J. (2019). Validation protocol for applied research. Research Methods Press.",
    ].join("\n"),
    "utf8",
  );

  const results = await Promise.all([
    runTest("PDF reference-list candidates are queued and not citable", () => {
      const queue = buildSecondaryReferenceRecoveryQueue({
        case_id: "synthetic-neutral-case",
        evidencePacksArtifact: {
          artifact_type: "evidence_packs",
          artifact_version: "v1",
          generated_at: new Date().toISOString(),
          extraction_mode: "rule_based",
          project_context: { project_title: "Neutral", intake_topic: "Neutral" },
          packs: [
            {
              source_id: "source-1",
              source_text_path: textPath,
              source_chunks_path: null,
              problem_signal: null,
              method_signal: null,
              context_signal: null,
              finding_signal: null,
              limitation_signal: null,
              future_line_signal: null,
              abstract_summary: null,
              pdf_summary: null,
              pdf_sections: {
                abstract: null,
                methodology: null,
                results: null,
                conclusions: null,
                limitations: null,
                future_work: null,
              },
              snippets: [],
              assets: [],
            },
          ],
          warnings: [],
        } as any,
      });
      assert(queue.candidate_count >= 2, `candidate_count=${queue.candidate_count}`);
      assert(
        queue.candidates.every((candidate) => candidate.citable_status === "not_citable_until_recovered"),
        "candidate became citable too early",
      );
      assert(queue.candidates.some((candidate) => candidate.doi === "10.1234/example.2020.001"), "DOI candidate missing");
    }),
    runTest("secondary references are deduplicated by DOI/title-year", () => {
      const queue = buildSecondaryReferenceRecoveryQueue({
        evidencePacksArtifact: {
          artifact_type: "evidence_packs",
          artifact_version: "v1",
          generated_at: new Date().toISOString(),
          extraction_mode: "rule_based",
          project_context: { project_title: "Neutral", intake_topic: "Neutral" },
          packs: [
            {
              source_id: "source-1",
              source_text_path: textPath,
              source_chunks_path: null,
              problem_signal: null,
              method_signal: null,
              context_signal: null,
              finding_signal: null,
              limitation_signal: null,
              future_line_signal: null,
              abstract_summary: null,
              pdf_summary: null,
              pdf_sections: {
                abstract: null,
                methodology: null,
                results: null,
                conclusions: null,
                limitations: null,
                future_work: null,
              },
              snippets: [],
              assets: [],
            },
            {
              source_id: "source-2",
              source_text_path: textPath,
              source_chunks_path: null,
              problem_signal: null,
              method_signal: null,
              context_signal: null,
              finding_signal: null,
              limitation_signal: null,
              future_line_signal: null,
              abstract_summary: null,
              pdf_summary: null,
              pdf_sections: {
                abstract: null,
                methodology: null,
                results: null,
                conclusions: null,
                limitations: null,
                future_work: null,
              },
              snippets: [],
              assets: [],
            },
          ],
          warnings: [],
        } as any,
      });
      const doiCount = queue.candidates.filter((candidate) => candidate.doi === "10.1234/example.2020.001").length;
      assert(doiCount === 1, `doiCount=${doiCount}`);
    }),
  ]);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` :: ${result.detail}` : ""}`);
  }
  if (results.some((result) => !result.passed)) process.exit(1);
}

main();
