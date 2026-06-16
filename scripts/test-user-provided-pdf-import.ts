import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseArgs } from "./run-evidence-selected-sources-steps-2-6";
import {
  buildUserProvidedPdfProductionWarnings,
  inspectUserProvidedPdfFile,
  prepareUserProvidedSourcePdfManifest,
} from "@/server/blueprint-engine/quality/user-provided-source-pdfs";
import { classifySourceHealth } from "@/server/blueprint-engine/quality/source-health";

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function test(name: string, passed: boolean, details: string): TestResult {
  return { name, passed, details };
}

function fakePdfBytes() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "utf8"),
    Buffer.alloc(12_000, 0x20),
    Buffer.from("\n%%EOF\n", "utf8"),
  ]);
}

async function writeSelectedBundle(runFolder: string) {
  await mkdir(runFolder, { recursive: true });
  await writeFile(
    path.join(runFolder, "selected-source-bundle.json"),
    `${JSON.stringify(
      {
        savedAt: "2026-05-05T00:00:00.000Z",
        selectedCount: 2,
        sources: [
          {
            selectedOrder: 1,
            reference: {
              id: "https://openalex.org/W100000001",
              title: "Neutral Method Study With Local Evidence",
              doi: "10.0000/example.one",
              landingPageUrl: "https://example.test/one",
              pdfUrl: "https://example.test/one.pdf",
            },
          },
          {
            selectedOrder: 2,
            reference: {
              id: "https://openalex.org/W100000002",
              title: "Second Neutral Method Study",
              doi: "10.0000/example.two",
              landingPageUrl: "https://example.test/two",
              pdfUrl: "https://example.test/two.pdf",
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function runTests() {
  const root = path.join(
    process.cwd(),
    "artifacts-local",
    "test-user-provided-pdf-import",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  const evidenceRunFolder = path.join(root, "evidence-run");
  const pdfFolder = path.join(root, "pdfs");
  const ambiguousPdfFolder = path.join(root, "ambiguous-pdfs");
  await writeSelectedBundle(evidenceRunFolder);
  await mkdir(pdfFolder, { recursive: true });
  await mkdir(ambiguousPdfFolder, { recursive: true });
  await writeFile(
    path.join(pdfFolder, "01-W100000001-neutral-method-study.pdf"),
    fakePdfBytes(),
  );
  await writeFile(path.join(ambiguousPdfFolder, "downloaded-document.pdf"), fakePdfBytes());

  const inspection = await inspectUserProvidedPdfFile(
    path.join(pdfFolder, "01-W100000001-neutral-method-study.pdf"),
  );
  const manifestResult = await prepareUserProvidedSourcePdfManifest({
    caseId: "synthetic-neutral-case",
    evidenceRunFolder,
    pdfFolder,
    createdAt: "2026-05-05T00:00:00.000Z",
  });
  const ambiguousResult = await prepareUserProvidedSourcePdfManifest({
    caseId: "synthetic-neutral-case",
    evidenceRunFolder,
    pdfFolder: ambiguousPdfFolder,
    createdAt: "2026-05-05T00:00:00.000Z",
  });
  const parsedArgs = parseArgs([
    "--case",
    "synthetic-neutral-case",
    "--user-provided-pdf-manifest",
    manifestResult.manifest_path,
  ]);
  const localPdfHealth = classifySourceHealth({
    source_id: "https://openalex.org/W100000001",
    materialization_status: "downloaded",
    stored_kind: "pdf",
    text_char_count: 20_000,
    chunk_count: 8,
    topic_relevance: "directa",
    warnings: ["PDF local proporcionado por usuario; permitido para diagnostico."],
  });
  const productionWarnings = buildUserProvidedPdfProductionWarnings(manifestResult.manifest);
  const manifestOnDisk = JSON.parse(readFileSync(manifestResult.manifest_path, "utf8")) as {
    entries: Array<{ sha256: string; allowed_for_production: boolean }>;
  };

  return [
    test(
      "valid local PDF creates manifest entry with checksum",
      inspection.valid_pdf &&
        manifestResult.manifest.entries.length === 1 &&
        manifestOnDisk.entries[0]?.sha256 === inspection.sha256,
      `entries=${manifestResult.manifest.entries.length}, sha=${inspection.sha256.slice(0, 12)}`,
    ),
    test(
      "ambiguous filenames create assignment template instead of unsafe guessing",
      ambiguousResult.manifest.entries.length === 0 &&
        ambiguousResult.assignment_template !== null &&
        existsSync(ambiguousResult.assignment_template_path ?? ""),
      `entries=${ambiguousResult.manifest.entries.length}, template=${ambiguousResult.assignment_template_path}`,
    ),
    test(
      "runner accepts user-provided manifest argument",
      parsedArgs.userProvidedPdfManifest === manifestResult.manifest_path,
      JSON.stringify(parsedArgs),
    ),
    test(
      "source health can classify extracted local PDF as usable full text",
      localPdfHealth.source_health === "usable_full_text",
      `${localPdfHealth.source_health}; ${localPdfHealth.reasons.join(",")}`,
    ),
    test(
      "production eligibility remains cautious for user-provided PDF without review flag",
      productionWarnings.length > 0 && manifestResult.manifest.entries[0]?.allowed_for_production === false,
      productionWarnings.join(" | "),
    ),
  ];
}

async function main() {
  const results = await runTests();
  const failed = results.filter((result) => !result.passed);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name} :: ${result.details}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} user-provided PDF import checks passed.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
