import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  prepareUserProvidedSourcePdfManifest,
  type UserProvidedPdfPreparationResult,
} from "@/server/blueprint-engine/quality/user-provided-source-pdfs";

type CliArgs = {
  caseId: string | null;
  evidenceRunFolder: string | null;
  pdfFolder: string | null;
};

function parseArgs(args = process.argv.slice(2)): CliArgs {
  let caseId: string | null = null;
  let evidenceRunFolder: string | null = null;
  let pdfFolder: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--case" && next) {
      caseId = next;
      index += 1;
      continue;
    }

    if (arg === "--evidence-run-folder" && next) {
      evidenceRunFolder = next;
      index += 1;
      continue;
    }

    if (arg === "--pdf-folder" && next) {
      pdfFolder = next;
      index += 1;
    }
  }

  return { caseId, evidenceRunFolder, pdfFolder };
}

function renderReport(result: UserProvidedPdfPreparationResult) {
  const manifest = result.manifest;
  const lines = [
    "# User-Provided PDF Import Report",
    "",
    `Case ID: ${manifest.case_id}`,
    `Related evidence run folder: ${manifest.related_evidence_run_folder}`,
    `Created at: ${manifest.created_at}`,
    `Manifest path: ${result.manifest_path}`,
    "",
    "## Status",
    "",
    `Mapped entries: ${manifest.entries.length}`,
    `Unmatched PDF files: ${manifest.unmatched_pdf_files.length}`,
    `Warnings: ${manifest.warnings.length}`,
    `Blockers: ${manifest.blockers.length}`,
    "",
    "## Mapped PDFs",
    "",
  ];

  if (manifest.entries.length === 0) {
    lines.push("- None", "");
  } else {
    for (const entry of manifest.entries) {
      lines.push(
        `- ${entry.source_id}: ${entry.filename}`,
        `  - selected_reference_id: ${entry.selected_reference_id}`,
        `  - sha256: ${entry.sha256}`,
        `  - byte_size: ${entry.byte_size}`,
        `  - allowed_for_diagnostic: ${entry.allowed_for_diagnostic}`,
        `  - allowed_for_production: ${entry.allowed_for_production}`,
        "",
      );
    }
  }

  lines.push("## Unmatched Or Ambiguous PDFs", "");
  if (manifest.unmatched_pdf_files.length === 0) {
    lines.push("- None", "");
  } else {
    for (const entry of manifest.unmatched_pdf_files) {
      lines.push(
        `- ${entry.filename}`,
        `  - possible_source_ids: ${entry.possible_source_ids.join(", ") || "none"}`,
        `  - reviewer_note: ${entry.reviewer_note ?? ""}`,
        "",
      );
    }
  }

  if (result.assignment_template_path) {
    lines.push("## Assignment Template", "", result.assignment_template_path, "");
  }

  if (manifest.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of manifest.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  if (manifest.blockers.length > 0) {
    lines.push("## Blockers", "");
    for (const blocker of manifest.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  lines.push(
    "## Production Note",
    "",
    "These files are user-provided local inputs for diagnostic Evidence Engine processing. They remain allowed_for_production=false until a future explicit review workflow exists.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs();

  if (!args.caseId || !args.evidenceRunFolder || !args.pdfFolder) {
    throw new Error(
      "Usage: npx tsx scripts/prepare-user-provided-source-pdfs.ts --case <case_id> --evidence-run-folder <path> --pdf-folder <path>",
    );
  }

  const evidenceRunFolder = path.resolve(args.evidenceRunFolder);
  const pdfFolder = path.resolve(args.pdfFolder);

  if (!existsSync(evidenceRunFolder)) {
    throw new Error(`Evidence run folder does not exist: ${evidenceRunFolder}`);
  }

  if (!existsSync(pdfFolder)) {
    throw new Error(`PDF folder does not exist: ${pdfFolder}`);
  }

  const result = await prepareUserProvidedSourcePdfManifest({
    caseId: args.caseId,
    evidenceRunFolder,
    pdfFolder,
  });
  const reportPath = path.join(pdfFolder, "USER_PROVIDED_PDF_IMPORT_REPORT.md");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderReport(result), "utf8");

  console.log(
    JSON.stringify(
      {
        status: result.manifest.blockers.length > 0 ? "blocked" : "prepared",
        case_id: result.manifest.case_id,
        manifest_path: result.manifest_path,
        mapped_pdf_count: result.manifest.entries.length,
        unmatched_pdf_count: result.manifest.unmatched_pdf_files.length,
        assignment_template_path: result.assignment_template_path,
        warnings_count: result.manifest.warnings.length,
        blockers_count: result.manifest.blockers.length,
      },
      null,
      2,
    ),
  );
}

function isDirectCliRun() {
  return process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isDirectCliRun()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
