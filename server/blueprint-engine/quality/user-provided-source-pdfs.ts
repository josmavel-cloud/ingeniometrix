import { existsSync, readFileSync } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export type UserProvidedSourcePdfEntryV1 = {
  source_id: string;
  selected_reference_id: string;
  original_source_url: string | null;
  local_pdf_path: string;
  filename: string;
  sha256: string;
  byte_size: number;
  mime_type: "application/pdf";
  reviewer_note: string | null;
  acquisition_mode: "user_provided_file";
  provenance_status: "user_provided_pdf";
  allowed_for_diagnostic: true;
  allowed_for_production: false;
};

export type UserProvidedSourcePdfAssignmentTemplateEntry = {
  filename: string;
  local_pdf_path: string;
  sha256: string;
  byte_size: number;
  mime_type: "application/pdf";
  possible_source_ids: string[];
  required_source_id: string | null;
  reviewer_note: string | null;
};

export type UserProvidedSourcePdfAssignmentTemplateV1 = {
  template_type: "user_provided_source_pdf_assignment_template";
  template_version: "v1";
  case_id: string;
  related_evidence_run_folder: string;
  created_at: string;
  instructions: string[];
  selected_sources: UserProvidedPdfSelectedSource[];
  entries: UserProvidedSourcePdfAssignmentTemplateEntry[];
};

export type UserProvidedSourcePdfManifestV1 = {
  manifest_type: "user_provided_source_pdfs";
  manifest_version: "v1";
  case_id: string;
  related_evidence_run_folder: string;
  created_at: string;
  entries: UserProvidedSourcePdfEntryV1[];
  assignment_template_path?: string | null;
  unmatched_pdf_files: UserProvidedSourcePdfAssignmentTemplateEntry[];
  warnings: string[];
  blockers: string[];
};

export type UserProvidedPdfSelectedSource = {
  source_id: string;
  selected_reference_id: string;
  selected_order: number | null;
  title: string;
  doi: string | null;
  original_source_url: string | null;
};

export type UserProvidedPdfInspection = {
  local_pdf_path: string;
  filename: string;
  valid_pdf: boolean;
  sha256: string;
  byte_size: number;
  mime_type: "application/pdf" | "application/octet-stream";
  validation_checks: string[];
  warnings: string[];
};

export type UserProvidedPdfPreparationResult = {
  manifest: UserProvidedSourcePdfManifestV1;
  assignment_template: UserProvidedSourcePdfAssignmentTemplateV1 | null;
  manifest_path: string;
  assignment_template_path: string | null;
};

type SelectedSourceBundleLike = {
  sources?: Array<{
    selectedOrder?: number | null;
    reference?: {
      id?: string | null;
      title?: string | null;
      doi?: string | null;
      landingPageUrl?: string | null;
      pdfUrl?: string | null;
    };
  }>;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: string | null | undefined) {
  return normalize(value).replace(/\s+/g, "");
}

function sourceIdTail(sourceId: string) {
  const trimmed = sourceId.trim();
  const parts = trimmed.split(/[/?#]/).filter(Boolean);
  return parts[parts.length - 1] ?? trimmed;
}

function titleTokens(title: string) {
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "para",
    "con",
    "una",
    "uno",
    "del",
    "las",
    "los",
    "por",
    "sobre",
    "de",
    "la",
    "el",
    "en",
  ]);

  return normalize(title)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token))
    .slice(0, 12);
}

function scorePdfSourceMatch(fileName: string, source: UserProvidedPdfSelectedSource) {
  const fileCompact = compact(fileName);
  const fileText = normalize(fileName);
  const idTail = compact(sourceIdTail(source.source_id));
  const selectedTail = compact(sourceIdTail(source.selected_reference_id));
  const doi = compact(source.doi);
  const title = titleTokens(source.title);
  let score = 0;
  const reasons: string[] = [];

  if (idTail && fileCompact.includes(idTail)) {
    score += 120;
    reasons.push("source_id_tail");
  }

  if (selectedTail && selectedTail !== idTail && fileCompact.includes(selectedTail)) {
    score += 100;
    reasons.push("selected_reference_id_tail");
  }

  if (doi && fileCompact.includes(doi)) {
    score += 110;
    reasons.push("doi");
  }

  const titleMatches = title.filter((token) => fileText.includes(token));
  if (titleMatches.length >= 3) {
    score += 25 + titleMatches.length * 8;
    reasons.push(`title_tokens:${titleMatches.length}`);
  }

  const selectedOrderPrefix =
    source.selected_order !== null ? String(source.selected_order).padStart(2, "0") : null;
  if (selectedOrderPrefix && fileName.startsWith(`${selectedOrderPrefix}-`)) {
    score += 20;
    reasons.push("selected_order_prefix");
  }

  return { source, score, reasons };
}

function findDeterministicSourceMatch(
  fileName: string,
  selectedSources: UserProvidedPdfSelectedSource[],
) {
  const scored = selectedSources
    .map((source) => scorePdfSourceMatch(fileName, source))
    .sort((left, right) => right.score - left.score);
  const top = scored[0];
  const second = scored[1];

  if (!top || top.score < 80) {
    return {
      source: null,
      possibleSourceIds: scored.filter((item) => item.score > 0).map((item) => item.source.source_id),
      reason: "no_safe_match",
    };
  }

  if (second && second.score >= top.score - 20) {
    return {
      source: null,
      possibleSourceIds: scored
        .filter((item) => item.score >= Math.max(1, top.score - 20))
        .map((item) => item.source.source_id),
      reason: "ambiguous_match",
    };
  }

  return {
    source: top.source,
    possibleSourceIds: [top.source.source_id],
    reason: top.reasons.join(","),
  };
}

export async function inspectUserProvidedPdfFile(filePath: string): Promise<UserProvidedPdfInspection> {
  const localPdfPath = path.resolve(filePath);
  const buffer = readFileSync(localPdfPath);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const checks: string[] = [];
  const warnings: string[] = [];

  if (buffer.subarray(0, 5).toString("utf8") === "%PDF-") {
    checks.push("magic_bytes_pdf");
  } else {
    warnings.push("File does not start with PDF magic bytes.");
  }

  if (buffer.byteLength > 0) {
    checks.push("non_empty_file");
  }

  return {
    local_pdf_path: localPdfPath,
    filename: path.basename(localPdfPath),
    valid_pdf: checks.includes("magic_bytes_pdf"),
    sha256: hash,
    byte_size: buffer.byteLength,
    mime_type: checks.includes("magic_bytes_pdf") ? "application/pdf" : "application/octet-stream",
    validation_checks: checks,
    warnings,
  };
}

export async function inspectUserProvidedPdfEntryFile(entry: UserProvidedSourcePdfEntryV1) {
  const inspection = await inspectUserProvidedPdfFile(entry.local_pdf_path);
  const warnings = [...inspection.warnings];

  if (inspection.sha256 !== entry.sha256) {
    warnings.push("Local PDF checksum does not match manifest sha256.");
  }

  return {
    ...inspection,
    sha256_matches_manifest: inspection.sha256 === entry.sha256,
    valid_for_import:
      inspection.valid_pdf &&
      inspection.sha256 === entry.sha256 &&
      inspection.byte_size === entry.byte_size,
    warnings,
  };
}

export function loadUserProvidedSourcePdfManifest(
  manifestPath: string,
): UserProvidedSourcePdfManifestV1 {
  const resolved = path.resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(resolved, "utf8")) as UserProvidedSourcePdfManifestV1;

  if (manifest.manifest_type !== "user_provided_source_pdfs") {
    throw new Error(`Invalid user-provided PDF manifest type: ${manifest.manifest_type}`);
  }

  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({
      ...entry,
      local_pdf_path: path.resolve(path.dirname(resolved), entry.local_pdf_path),
    })),
  };
}

export function findUserProvidedPdfEntryForSource(
  manifest: UserProvidedSourcePdfManifestV1 | null | undefined,
  sourceId: string,
) {
  return (
    manifest?.entries.find(
      (entry) => entry.source_id === sourceId || entry.selected_reference_id === sourceId,
    ) ?? null
  );
}

export function buildUserProvidedPdfProductionWarnings(
  manifest: UserProvidedSourcePdfManifestV1 | null | undefined,
) {
  if (!manifest || manifest.entries.length === 0) {
    return [];
  }

  const diagnosticOnlyCount = manifest.entries.filter(
    (entry) => entry.allowed_for_diagnostic && entry.allowed_for_production === false,
  ).length;

  return diagnosticOnlyCount > 0
    ? [
        `${diagnosticOnlyCount} user-provided PDF(s) are allowed for diagnostics but not production until explicit review.`,
      ]
    : [];
}

export function readSelectedSourcesFromEvidenceRunFolder(
  evidenceRunFolder: string,
): UserProvidedPdfSelectedSource[] {
  const bundlePath = path.join(path.resolve(evidenceRunFolder), "selected-source-bundle.json");
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as SelectedSourceBundleLike;

  return (bundle.sources ?? []).map((source) => {
    const reference = source.reference ?? {};
    const sourceId = reference.id ?? "";
    return {
      source_id: sourceId,
      selected_reference_id: sourceId,
      selected_order: source.selectedOrder ?? null,
      title: reference.title ?? sourceId,
      doi: reference.doi ?? null,
      original_source_url: reference.pdfUrl ?? reference.landingPageUrl ?? null,
    };
  });
}

export async function prepareUserProvidedSourcePdfManifest(input: {
  caseId: string;
  evidenceRunFolder: string;
  pdfFolder: string;
  createdAt?: string;
}): Promise<UserProvidedPdfPreparationResult> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const relatedEvidenceRunFolder = path.resolve(input.evidenceRunFolder);
  const pdfFolder = path.resolve(input.pdfFolder);
  const selectedSources = readSelectedSourcesFromEvidenceRunFolder(relatedEvidenceRunFolder);
  const dirEntries = await readdir(pdfFolder, { withFileTypes: true });
  const pdfFiles = dirEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().includes(".pdf"))
    .map((entry) => path.join(pdfFolder, entry.name));
  const entries: UserProvidedSourcePdfEntryV1[] = [];
  const unmatched: UserProvidedSourcePdfAssignmentTemplateEntry[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const matchedSourceIds = new Set<string>();

  if (selectedSources.length === 0) {
    blockers.push("No selected sources were found in selected-source-bundle.json.");
  }

  if (pdfFiles.length === 0) {
    blockers.push("No local PDF files were found in the provided folder.");
  }

  for (const pdfFile of pdfFiles) {
    const inspection = await inspectUserProvidedPdfFile(pdfFile);

    if (!inspection.valid_pdf) {
      unmatched.push({
        filename: inspection.filename,
        local_pdf_path: inspection.local_pdf_path,
        sha256: inspection.sha256,
        byte_size: inspection.byte_size,
        mime_type: "application/pdf",
        possible_source_ids: [],
        required_source_id: null,
        reviewer_note: "File failed PDF magic-byte validation.",
      });
      warnings.push(`${inspection.filename} did not pass PDF byte validation.`);
      continue;
    }

    const match = findDeterministicSourceMatch(inspection.filename, selectedSources);

    if (!match.source || matchedSourceIds.has(match.source.source_id)) {
      unmatched.push({
        filename: inspection.filename,
        local_pdf_path: inspection.local_pdf_path,
        sha256: inspection.sha256,
        byte_size: inspection.byte_size,
        mime_type: "application/pdf",
        possible_source_ids: match.possibleSourceIds,
        required_source_id: null,
        reviewer_note:
          match.reason === "ambiguous_match"
            ? "Ambiguous filename/source match; assign source_id manually."
            : "No safe filename/source match; assign source_id manually.",
      });
      warnings.push(`${inspection.filename} needs manual source_id assignment (${match.reason}).`);
      continue;
    }

    matchedSourceIds.add(match.source.source_id);
    entries.push({
      source_id: match.source.source_id,
      selected_reference_id: match.source.selected_reference_id,
      original_source_url: match.source.original_source_url,
      local_pdf_path: inspection.local_pdf_path,
      filename: inspection.filename,
      sha256: inspection.sha256,
      byte_size: inspection.byte_size,
      mime_type: "application/pdf",
      reviewer_note: null,
      acquisition_mode: "user_provided_file",
      provenance_status: "user_provided_pdf",
      allowed_for_diagnostic: true,
      allowed_for_production: false,
    });
  }

  const missingSources = selectedSources.filter((source) => !matchedSourceIds.has(source.source_id));
  if (missingSources.length > 0) {
    warnings.push(
      `Missing user-provided PDFs for selected source(s): ${missingSources
        .map((source) => source.source_id)
        .join(", ")}.`,
    );
  }

  const assignmentTemplate: UserProvidedSourcePdfAssignmentTemplateV1 | null =
    unmatched.length > 0 || missingSources.length > 0
      ? {
          template_type: "user_provided_source_pdf_assignment_template",
          template_version: "v1",
          case_id: input.caseId,
          related_evidence_run_folder: relatedEvidenceRunFolder,
          created_at: createdAt,
          instructions: [
            "Assign required_source_id only when the local PDF clearly corresponds to one selected source.",
            "Do not guess from filename order alone.",
            "Keep allowed_for_production=false until a future explicit production review exists.",
          ],
          selected_sources: selectedSources,
          entries: unmatched,
        }
      : null;

  const manifestPath = path.join(pdfFolder, "user-provided-source-pdfs.json");
  const assignmentTemplatePath = assignmentTemplate
    ? path.join(pdfFolder, "user-provided-source-pdfs.assignment-template.json")
    : null;
  const manifest: UserProvidedSourcePdfManifestV1 = {
    manifest_type: "user_provided_source_pdfs",
    manifest_version: "v1",
    case_id: input.caseId,
    related_evidence_run_folder: relatedEvidenceRunFolder,
    created_at: createdAt,
    entries,
    assignment_template_path: assignmentTemplatePath,
    unmatched_pdf_files: unmatched,
    warnings: unique(warnings),
    blockers: unique(blockers),
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (assignmentTemplate && assignmentTemplatePath) {
    await writeFile(assignmentTemplatePath, `${JSON.stringify(assignmentTemplate, null, 2)}\n`, "utf8");
  }

  for (const entry of entries) {
    if (!existsSync(entry.local_pdf_path)) {
      manifest.blockers.push(`Mapped local PDF does not exist: ${entry.local_pdf_path}`);
    } else {
      const fileStat = await stat(entry.local_pdf_path);
      if (fileStat.size !== entry.byte_size) {
        manifest.warnings.push(`Mapped local PDF size changed after manifest creation: ${entry.filename}`);
      }
    }
  }

  return {
    manifest,
    assignment_template: assignmentTemplate,
    manifest_path: manifestPath,
    assignment_template_path: assignmentTemplatePath,
  };
}
