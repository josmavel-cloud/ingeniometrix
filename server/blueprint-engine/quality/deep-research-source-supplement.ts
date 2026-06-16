import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  RapidDeepResearchCandidateSource,
  RapidDeepResearchEvidenceCandidate,
  RapidDeepResearchFallbackArtifactsV1,
  RapidDeepResearchResultV1,
} from "@/server/blueprint-engine/quality/rapid-deep-research-fallback";

export type SourceSelectionCandidateSource = {
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
  candidate_markers?: string[];
  selection_history?: string;
  query_variants?: string[];
  replacement_for_source_ids?: string[];
  replacement_rationale?: string[];
  citable_status?: "candidate_only_not_citable_yet";
  supplemental_source?: "rapid_deep_research_fallback";
  evidence_candidate_id?: string;
  evidence_need_id?: string;
  gap_addressed?: string;
  confidence?: "high" | "medium" | "low";
  must_pass_source_selection?: true;
  must_pass_pdf_or_source_inspection?: true;
  must_pass_evidence_engine?: true;
};

export type CandidateSourcesArtifactLike = {
  case_id?: string | null;
  generated_at?: string;
  search_mode?: string;
  search_snapshot_summary?: unknown;
  candidates?: SourceSelectionCandidateSource[];
  [key: string]: unknown;
};

export type CandidateSourcesSupplementArtifactV1 = {
  artifact_type: "candidate_sources_supplement";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  source: "rapid_deep_research_fallback";
  source_artifacts: {
    originating_evidence_run_folder?: string | null;
    deep_research_evidence_candidates?: string | null;
    rapid_deep_research_candidate_sources?: string | null;
  };
  selection_policy: {
    citable_status: "candidate_only_not_citable_yet";
    must_pass_source_selection: true;
    must_pass_pdf_or_source_inspection: true;
    must_pass_evidence_engine: true;
    allowed_for_diagnostic_selection: true;
    allowed_for_direct_citation: false;
  };
  base_candidate_count: number;
  supplement_candidate_count: number;
  skipped_duplicate_count: number;
  candidates: SourceSelectionCandidateSource[];
  warnings: string[];
};

export type PublishedDeepResearchSupplementRun = {
  case_id: string;
  run_id: string;
  run_folder: string;
  candidate_count: number;
  supplement_candidate_count: number;
  source_selection_template_path: string;
  candidate_sources_summary_path: string;
  warnings: string[];
};

const DEFAULT_CANDIDATE_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-candidate-search-runs",
);

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
    .replace(/[^a-z0-9./:-]+/g, " ")
    .trim();
}

function normalizeUrl(value: string | null | undefined) {
  return normalize(value).replace(/[?#].*$/, "").replace(/\/+$/, "");
}

function safeId(value: string | null | undefined) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "supplemental-candidate";
}

function clip(value: string | null | undefined, max = 700) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean)));
}

function dedupeKeys(candidate: SourceSelectionCandidateSource) {
  return unique([
    candidate.candidate_id ? `id:${normalize(candidate.candidate_id)}` : null,
    candidate.doi ? `doi:${normalize(candidate.doi)}` : null,
    candidate.openalex_id ? `openalex:${normalize(candidate.openalex_id)}` : null,
    candidate.crossref_id ? `crossref:${normalize(candidate.crossref_id)}` : null,
    candidate.title ? `title:${normalize(candidate.title)}` : null,
    candidate.landing_page_url ? `url:${normalizeUrl(candidate.landing_page_url)}` : null,
    candidate.pdf_url ? `url:${normalizeUrl(candidate.pdf_url)}` : null,
  ]);
}

function primaryKey(candidate: SourceSelectionCandidateSource) {
  return dedupeKeys(candidate)[0] ?? `candidate:${safeId(candidate.candidate_id)}`;
}

function confidenceScore(value: "high" | "medium" | "low" | undefined) {
  if (value === "high") return 62;
  if (value === "medium") return 48;
  return 34;
}

function evidenceCandidateToSourceCandidate(input: {
  candidate: RapidDeepResearchEvidenceCandidate;
  rank: number;
}): SourceSelectionCandidateSource {
  const reference = input.candidate.reference;
  const title = clip(reference.title, 260) || "Fuente candidata sin titulo";
  const doi = clip(reference.doi, 160) || null;
  const url = clip(reference.url, 420) || null;
  const sourceId = `dr-supp-${safeId(
    input.candidate.evidence_candidate_id || doi || url || title,
  )}`;

  return {
    candidate_id: sourceId,
    title,
    authors: reference.authors ?? [],
    year: Number.isFinite(reference.year) ? reference.year : null,
    venue: clip(reference.venue, 180) || null,
    doi,
    openalex_id: null,
    crossref_id: doi,
    abstract: unique([
      clip(input.candidate.candidate_evidence.excerpt_or_summary, 520),
      clip(input.candidate.why_relevant, 520),
    ]).join(" "),
    landing_page_url: url,
    pdf_url: null,
    open_access_status: url ? "reference_url_unverified" : "metadata_only",
    relevance_score: confidenceScore(input.candidate.confidence),
    rank: input.rank,
    provider: "openai_deep_research",
    reasons: unique([
      `Cubre vacio: ${input.candidate.evidence_need_id}.`,
      input.candidate.gap_addressed,
      input.candidate.why_relevant,
      "Candidato suplementario encontrado por fallback rapido; requiere seleccion humana.",
    ]),
    warnings: unique([
      ...input.candidate.warnings,
      "candidate_only_not_citable_yet",
      "candidate_pending_local_verification",
      "source_selection_required",
      "requires_local_pdf_or_source_inspection",
      "evidence_engine_required_before_citation",
      "deep_research_fallback_candidate",
    ]),
    candidate_markers: ["new_candidate", "possible_replacement"],
    selection_history: "not_previously_seen",
    query_variants: ["rapid-deep-research-fallback"],
    replacement_rationale: unique([
      input.candidate.gap_addressed,
      "Puede cubrir un vacio detectado despues de inspeccion limitada, pero aun no es evidencia citable.",
    ]),
    citable_status: "candidate_only_not_citable_yet",
    supplemental_source: "rapid_deep_research_fallback",
    evidence_candidate_id: input.candidate.evidence_candidate_id,
    evidence_need_id: input.candidate.evidence_need_id,
    gap_addressed: input.candidate.gap_addressed,
    confidence: input.candidate.confidence,
    must_pass_source_selection: true,
    must_pass_pdf_or_source_inspection: true,
    must_pass_evidence_engine: true,
  };
}

function rapidCandidateToSourceCandidate(input: {
  candidate: RapidDeepResearchCandidateSource;
  rank: number;
}): SourceSelectionCandidateSource {
  const doi = clip(input.candidate.doi, 160) || null;
  const url = clip(input.candidate.url, 420) || null;
  const title = clip(input.candidate.title, 260) || "Fuente candidata sin titulo";

  return {
    candidate_id: input.candidate.candidate_id.startsWith("dr-supp-")
      ? input.candidate.candidate_id
      : `dr-supp-${safeId(input.candidate.candidate_id || doi || url || title)}`,
    title,
    authors: input.candidate.authors ?? [],
    year: Number.isFinite(input.candidate.year) ? input.candidate.year : null,
    venue: null,
    doi,
    openalex_id: null,
    crossref_id: doi,
    abstract: unique([input.candidate.evidence_note_es, input.candidate.why_relevant_es]).join(" "),
    landing_page_url: url,
    pdf_url: null,
    open_access_status: url ? "reference_url_unverified" : "metadata_only",
    relevance_score: confidenceScore(input.candidate.confidence),
    rank: input.rank,
    provider: "openai_deep_research",
    reasons: unique([
      `Cubre vacios: ${input.candidate.gap_covered.join(", ")}.`,
      input.candidate.why_relevant_es,
      "Candidato suplementario encontrado por fallback rapido; requiere seleccion humana.",
    ]),
    warnings: unique([
      ...input.candidate.warnings,
      "candidate_only_not_citable_yet",
      "candidate_pending_local_verification",
      "source_selection_required",
      "requires_local_pdf_or_source_inspection",
      "evidence_engine_required_before_citation",
      "deep_research_fallback_candidate",
    ]),
    candidate_markers: ["new_candidate", "possible_replacement"],
    selection_history: "not_previously_seen",
    query_variants: ["rapid-deep-research-fallback"],
    replacement_rationale: unique([
      input.candidate.evidence_note_es,
      "Puede cubrir un vacio detectado despues de inspeccion limitada, pero aun no es evidencia citable.",
    ]),
    citable_status: "candidate_only_not_citable_yet",
    supplemental_source: "rapid_deep_research_fallback",
    evidence_need_id: input.candidate.gap_covered[0] ?? undefined,
    confidence: input.candidate.confidence,
    must_pass_source_selection: true,
    must_pass_pdf_or_source_inspection: true,
    must_pass_evidence_engine: true,
  };
}

export function buildDeepResearchCandidateSourceSupplement(input: {
  caseId: string | null;
  baseCandidateSources?: CandidateSourcesArtifactLike | null;
  deepResearchEvidenceCandidates?: RapidDeepResearchFallbackArtifactsV1["evidenceCandidates"] | null;
  rapidCandidateSources?: RapidDeepResearchFallbackArtifactsV1["candidateSources"] | null;
  originatingEvidenceRunFolder?: string | null;
  sourceArtifactPaths?: {
    deepResearchEvidenceCandidates?: string | null;
    rapidCandidateSources?: string | null;
  };
}): CandidateSourcesSupplementArtifactV1 {
  const baseCandidates = input.baseCandidateSources?.candidates ?? [];
  const baseKeys = new Set(baseCandidates.flatMap(dedupeKeys));
  const sourceCandidates =
    input.deepResearchEvidenceCandidates?.candidates.length
      ? input.deepResearchEvidenceCandidates.candidates.map((candidate, index) =>
          evidenceCandidateToSourceCandidate({ candidate, rank: baseCandidates.length + index + 1 }),
        )
      : (input.rapidCandidateSources?.candidates ?? []).map((candidate, index) =>
          rapidCandidateToSourceCandidate({ candidate, rank: baseCandidates.length + index + 1 }),
        );
  const accepted: SourceSelectionCandidateSource[] = [];
  let skippedDuplicateCount = 0;

  for (const candidate of sourceCandidates) {
    const keys = dedupeKeys(candidate);
    if (keys.some((key) => baseKeys.has(key))) {
      skippedDuplicateCount += 1;
      continue;
    }

    for (const key of keys) baseKeys.add(key);
    accepted.push(candidate);
  }

  return {
    artifact_type: "candidate_sources_supplement",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.caseId,
    source: "rapid_deep_research_fallback",
    source_artifacts: {
      originating_evidence_run_folder: input.originatingEvidenceRunFolder ?? null,
      deep_research_evidence_candidates:
        input.sourceArtifactPaths?.deepResearchEvidenceCandidates ?? null,
      rapid_deep_research_candidate_sources: input.sourceArtifactPaths?.rapidCandidateSources ?? null,
    },
    selection_policy: {
      citable_status: "candidate_only_not_citable_yet",
      must_pass_source_selection: true,
      must_pass_pdf_or_source_inspection: true,
      must_pass_evidence_engine: true,
      allowed_for_diagnostic_selection: true,
      allowed_for_direct_citation: false,
    },
    base_candidate_count: baseCandidates.length,
    supplement_candidate_count: accepted.length,
    skipped_duplicate_count: skippedDuplicateCount,
    candidates: accepted,
    warnings: unique([
      "Deep Research supplement candidates are discovery-only.",
      "They are not citable until selected by a human and processed by Evidence Engine.",
      ...(input.deepResearchEvidenceCandidates?.warnings ?? []),
      ...(input.rapidCandidateSources?.warnings ?? []),
    ]),
  };
}

export function mergeCandidateSourcesWithSupplement(input: {
  base: CandidateSourcesArtifactLike;
  supplement?: CandidateSourcesSupplementArtifactV1 | null;
}): CandidateSourcesArtifactLike {
  const merged: SourceSelectionCandidateSource[] = [];
  const keyAlias = new Map<string, string>();

  function upsert(candidate: SourceSelectionCandidateSource) {
    const keys = dedupeKeys(candidate);
    const existingKey = keys.map((key) => keyAlias.get(key)).find(Boolean);
    const key = existingKey ?? primaryKey(candidate);
    if (!existingKey) merged.push(candidate);
    for (const candidateKey of keys) keyAlias.set(candidateKey, key);
  }

  for (const candidate of input.base.candidates ?? []) upsert(candidate);
  for (const candidate of input.supplement?.candidates ?? []) upsert(candidate);

  return {
    ...input.base,
    candidate_sources_supplement: input.supplement
      ? {
          artifact_type: input.supplement.artifact_type,
          artifact_version: input.supplement.artifact_version,
          source: input.supplement.source,
          supplement_candidate_count: input.supplement.supplement_candidate_count,
          skipped_duplicate_count: input.supplement.skipped_duplicate_count,
          selection_policy: input.supplement.selection_policy,
          warnings: input.supplement.warnings,
        }
      : null,
    candidate_counts: {
      ...(typeof input.base.candidate_counts === "object" && input.base.candidate_counts
        ? input.base.candidate_counts
        : {}),
      total: merged.length,
      supplemental: input.supplement?.candidates.length ?? 0,
    },
    candidates: merged.map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    })),
  };
}

export function buildSupplementSourceSelectionTemplate(input: {
  caseId: string | null;
  candidates: SourceSelectionCandidateSource[];
}) {
  return {
    case_id: input.caseId,
    selection_status: "pending",
    instructions_es:
      "Revise las fuentes candidatas, incluidas las suplementarias de Deep Research. Las suplementarias no son citables: deben pasar seleccion humana, inspeccion local y Evidence Engine antes de usarse.",
    selected_reference_ids: [],
    rejected_reference_ids: [],
    notes_es:
      "Las fuentes con supplemental_source=rapid_deep_research_fallback son solo candidatas de descubrimiento.",
    candidates: input.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      title: candidate.title,
      year: candidate.year ?? null,
      doi: candidate.doi ?? null,
      provider: candidate.provider ?? "unknown",
      rank: candidate.rank ?? null,
      citable_status: candidate.citable_status ?? null,
      supplemental_source: candidate.supplemental_source ?? null,
      candidate_markers: candidate.candidate_markers ?? [],
    })),
  };
}

export function renderCandidateSourceSupplementSummary(input: {
  caseId: string | null;
  baseRunFolder?: string | null;
  evidenceRunFolder?: string | null;
  supplement: CandidateSourcesSupplementArtifactV1;
  mergedCandidates: SourceSelectionCandidateSource[];
  rapidResult?: RapidDeepResearchResultV1 | null;
}) {
  const lines = [
    "# Candidate source summary",
    "",
    `Case: ${input.caseId ?? "unknown"}`,
    "Search mode: rapid_deep_research_supplement",
    input.baseRunFolder ? `Base candidate run: ${input.baseRunFolder}` : "",
    input.evidenceRunFolder ? `Evidence run: ${input.evidenceRunFolder}` : "",
    `Supplement candidates: ${input.supplement.supplement_candidate_count}`,
    `Total candidates for selection: ${input.mergedCandidates.length}`,
    `Rapid Deep Research status: ${input.rapidResult?.status ?? "unknown"}`,
    "",
    "## Selection policy",
    "",
    "- These candidates are discovery-only.",
    "- They are not citable until human source selection, local source/PDF inspection, and Evidence Engine processing succeed.",
    "- They must not be used directly in Lab B generation.",
    "",
    "## Supplementary candidates",
    "",
  ].filter((line) => line !== "");

  if (input.supplement.candidates.length === 0) {
    lines.push("- none", "");
  }

  for (const candidate of input.supplement.candidates) {
    lines.push(
      `### ${candidate.rank ?? "?"}. ${candidate.title}`,
      "",
      `- Candidate id: ${candidate.candidate_id}`,
      `- DOI/link: ${candidate.doi ?? candidate.landing_page_url ?? "n/a"}`,
      `- Provider: ${candidate.provider ?? "unknown"}`,
      `- Citable status: ${candidate.citable_status ?? "candidate_only_not_citable_yet"}`,
      `- Why useful: ${(candidate.reasons ?? []).join(" ") || "Requires human review."}`,
      `- Warnings: ${(candidate.warnings ?? []).join(" ") || "None."}`,
      "",
    );
  }

  lines.push("## All candidates for UI", "");
  for (const candidate of input.mergedCandidates) {
    lines.push(
      `- ${candidate.rank ?? "?"}. ${candidate.title} (${candidate.candidate_id}; ${candidate.provider ?? "unknown"})`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copyIfProvided(source: string | null | undefined, destination: string) {
  if (!source) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination).catch(() => undefined);
}

export async function publishDeepResearchCandidateSupplementRun(input: {
  caseId: string;
  baseCandidateRunFolder: string;
  evidenceRunFolder: string;
  baseCandidateSources: CandidateSourcesArtifactLike;
  supplement: CandidateSourcesSupplementArtifactV1;
  rapidResult?: RapidDeepResearchResultV1 | null;
  candidateRoot?: string | null;
}) {
  const runId = `${timestampForPath()}-deep-research-supplement`;
  const root = input.candidateRoot ?? DEFAULT_CANDIDATE_ROOT;
  const runFolder = path.join(root, input.caseId, runId);
  const merged = mergeCandidateSourcesWithSupplement({
    base: {
      ...input.baseCandidateSources,
      generated_at: new Date().toISOString(),
      search_mode: "rapid_deep_research_supplement_source_selection",
      source_candidate_run_folder: input.baseCandidateRunFolder,
      evidence_selected_source_run_folder: input.evidenceRunFolder,
    },
    supplement: input.supplement,
  });
  const template = buildSupplementSourceSelectionTemplate({
    caseId: input.caseId,
    candidates: merged.candidates ?? [],
  });
  const summaryMarkdown = renderCandidateSourceSupplementSummary({
    caseId: input.caseId,
    baseRunFolder: input.baseCandidateRunFolder,
    evidenceRunFolder: input.evidenceRunFolder,
    supplement: input.supplement,
    mergedCandidates: merged.candidates ?? [],
    rapidResult: input.rapidResult,
  });
  const warnings = unique([
    ...input.supplement.warnings,
    "Supplement run created for human source selection; not evidence processing.",
  ]);

  await mkdir(runFolder, { recursive: true });
  await copyIfProvided(
    path.join(input.baseCandidateRunFolder, "intake-fixture.json"),
    path.join(runFolder, "intake-fixture.json"),
  );
  await copyIfProvided(
    path.join(input.baseCandidateRunFolder, "normalized-intake-context.json"),
    path.join(runFolder, "normalized-intake-context.json"),
  );
  await writeJson(path.join(runFolder, "candidate-sources.json"), merged);
  await writeJson(path.join(runFolder, "candidate-sources-supplement.json"), input.supplement);
  await writeJson(path.join(runFolder, "source-selection-template.json"), template);
  await writeFile(path.join(runFolder, "candidate-sources-summary.md"), summaryMarkdown, "utf8");

  const runSummary = {
    run_id: `evidence-candidate-search-${input.caseId}-${runId}`,
    case_id: input.caseId,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "completed",
    search_mode: "rapid_deep_research_supplement_source_selection",
    source_selection_required: true,
    source_selection_status: "pending",
    source_candidate_run_folder: input.baseCandidateRunFolder,
    evidence_selected_source_run_folder: input.evidenceRunFolder,
    candidate_count: merged.candidates?.length ?? 0,
    supplement_candidate_count: input.supplement.supplement_candidate_count,
    citable_status: "candidate_only_not_citable_yet",
    openai_called: input.rapidResult?.openai_called ?? null,
    warnings,
    output_folder: runFolder,
  };
  await writeJson(path.join(runFolder, "run-summary.json"), runSummary);

  return {
    case_id: input.caseId,
    run_id: runId,
    run_folder: runFolder,
    candidate_count: merged.candidates?.length ?? 0,
    supplement_candidate_count: input.supplement.supplement_candidate_count,
    source_selection_template_path: path.join(runFolder, "source-selection-template.json"),
    candidate_sources_summary_path: path.join(runFolder, "candidate-sources-summary.md"),
    warnings,
  } satisfies PublishedDeepResearchSupplementRun;
}
