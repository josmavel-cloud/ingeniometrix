import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SOURCE_SELECTION_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-candidate-search-runs",
);

export type CandidateSourceForSelection = {
  candidate_id: string;
  title: string;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  openalex_id?: string | null;
  crossref_id?: string | null;
  abstract?: string | null;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  open_access_status?: string | null;
  relevance_score?: number | null;
  rank?: number;
  provider?: string;
  reasons?: string[];
  warnings?: string[];
};

export type CandidateSourcesArtifact = {
  case_id?: string;
  generated_at?: string;
  candidates?: CandidateSourceForSelection[];
};

export type SourceSelectionPayload = {
  case_id: string;
  run_folder: string;
  selection_status: "completed";
  selected_reference_ids: string[];
  rejected_reference_ids: string[];
  undecided_reference_ids: string[];
  reviewer_notes: string;
  candidate_notes: Record<string, string>;
  created_at: string;
  updated_at: string;
  instructions_es: string;
  source_policy: unknown;
};

export function resolveRunDir(caseId: string, runId: string) {
  if (!caseId || !runId || caseId.includes("..") || runId.includes("..")) {
    throw new Error("Run invalido.");
  }

  const root = path.resolve(SOURCE_SELECTION_ROOT);
  const runDir = path.resolve(root, caseId, runId);

  if (!runDir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Ruta fuera del directorio permitido.");
  }

  return runDir;
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function readOptionalJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return null;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export async function listCandidateRuns() {
  const cases = await readdir(SOURCE_SELECTION_ROOT, { withFileTypes: true }).catch(() => []);
  const result = [];

  for (const caseEntry of cases.filter((entry) => entry.isDirectory())) {
    const caseId = caseEntry.name;
    const caseDir = path.join(SOURCE_SELECTION_ROOT, caseId);
    const runs = await readdir(caseDir, { withFileTypes: true }).catch(() => []);

    for (const runEntry of runs.filter((entry) => entry.isDirectory())) {
      const runId = runEntry.name;
      const runDir = resolveRunDir(caseId, runId);
      const stats = await stat(runDir);
      const runSummary = await readOptionalJsonFile<Record<string, unknown>>(
        path.join(runDir, "run-summary.json"),
      );
      const selection = await readOptionalJsonFile<Record<string, unknown>>(
        path.join(runDir, "source-selection.json"),
      );

      result.push({
        case_id: caseId,
        case_name:
          typeof runSummary?.case_name === "string" ? runSummary.case_name : caseId,
        run_id: runId,
        run_folder: runDir,
        candidate_count:
          typeof runSummary?.candidate_count === "number" ? runSummary.candidate_count : null,
        status: typeof runSummary?.status === "string" ? runSummary.status : null,
        selection_status:
          typeof selection?.selection_status === "string" ? selection.selection_status : "pending",
        updated_at: stats.mtime.toISOString(),
      });
    }
  }

  return result.sort(
    (left, right) =>
      right.updated_at.localeCompare(left.updated_at) ||
      right.case_id.localeCompare(left.case_id),
  );
}

