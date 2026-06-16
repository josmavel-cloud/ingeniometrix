import { existsSync, readFileSync } from "node:fs";

import type { EvidencePackArtifact } from "@/blueprint_launch/server/local-playground-store";
import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import type { ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";

export type SecondaryReferenceRecoveryCandidate = {
  candidate_id: string;
  dedupe_key: string;
  discovered_in_source_id: string;
  discovered_in_source_title: string | null;
  discovered_from: "reference_list" | "inline_citation";
  marker: string;
  title: string | null;
  authors: string[];
  year: number | null;
  doi: string | null;
  evidence_id: string | null;
  snippet: string;
  recovery_status: "not_recovered";
  citable_status: "not_citable_until_recovered";
  recommended_search_query: string;
  reasons: string[];
  warnings: string[];
};

export type SecondaryReferenceRecoveryQueueV1 = {
  artifact_type: "secondary_reference_recovery_queue";
  artifact_version: "v1";
  generated_at: string;
  case_id: string | null;
  handoff_id: string | null;
  source_count_scanned: number;
  candidate_count: number;
  candidates: SecondaryReferenceRecoveryCandidate[];
  warnings: string[];
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
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

function clip(value: string | null | undefined, max = 420) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function safeId(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "secondary-reference";
}

function extractDoi(value: string) {
  const match = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i.exec(value);
  return match?.[0]?.replace(/[.,;)\]]+$/, "") ?? null;
}

function extractYear(value: string) {
  const match = /\b(19|20)\d{2}[a-z]?\b/i.exec(value);
  if (!match) return null;
  const parsed = Number.parseInt(match[0].slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitReferenceEntries(referenceText: string) {
  const normalized = referenceText.replace(/\r/g, "\n");
  const numbered = normalized
    .split(/\n(?=(?:\[\d{1,3}\]|\d{1,3}[.)])\s+)/g)
    .map((item) => clip(item, 900))
    .filter((item) => item.length > 30);
  if (numbered.length >= 2) return numbered;

  return normalized
    .split(/\n+/g)
    .map((item) => clip(item, 900))
    .filter((item) => /\b(19|20)\d{2}\b/.test(item) && item.length > 40);
}

function extractReferenceList(text: string) {
  const match = /(?:^|\n)\s*(references|bibliography|referencias|bibliografia)\s*(?:\n|$)/i.exec(text);
  if (!match || typeof match.index !== "number") return null;
  return text.slice(match.index).slice(0, 35_000);
}

function inferTitle(entry: string, doi: string | null) {
  const cleaned = entry
    .replace(/\bdoi\s*:\s*\S+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(doi ?? "", "")
    .replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s*/, "")
    .trim();
  const parts = cleaned.split(/\.\s+/).map((part) => part.trim()).filter(Boolean);
  const candidate = parts.find((part) => part.length >= 16 && !/\b(19|20)\d{2}\b/.test(part.slice(0, 12)));
  return candidate ? clip(candidate, 180) : null;
}

function inferAuthors(entry: string) {
  const beforeYear = entry.split(/\b(?:19|20)\d{2}[a-z]?\b/i)[0] ?? "";
  return beforeYear
    .replace(/^\s*(?:\[\d{1,3}\]|\d{1,3}[.)])\s*/, "")
    .split(/;| and | & /i)
    .map((item) => item.trim().replace(/[.,]+$/, ""))
    .filter((item) => item.length >= 2 && item.length <= 90)
    .slice(0, 6);
}

function buildCandidate(input: {
  sourceId: string;
  sourceTitle?: string | null;
  discoveredFrom: SecondaryReferenceRecoveryCandidate["discovered_from"];
  marker: string;
  snippet: string;
  evidenceId?: string | null;
}) {
  const doi = extractDoi(input.marker) ?? extractDoi(input.snippet);
  const year = extractYear(input.marker) ?? extractYear(input.snippet);
  const title = inferTitle(input.marker, doi) ?? inferTitle(input.snippet, doi);
  const authors = inferAuthors(input.marker);
  const dedupeKey = doi
    ? `doi:${normalize(doi)}`
    : `title_year:${normalize(title ?? input.marker).slice(0, 90)}:${year ?? "unknown"}`;
  const query = unique([title, authors[0], year ? String(year) : null, doi]).join(" ");

  return {
    candidate_id: `secondary-${safeId(dedupeKey)}`,
    dedupe_key: dedupeKey,
    discovered_in_source_id: input.sourceId,
    discovered_in_source_title: input.sourceTitle ?? null,
    discovered_from: input.discoveredFrom,
    marker: clip(input.marker, 180),
    title,
    authors,
    year,
    doi,
    evidence_id: input.evidenceId ?? null,
    snippet: clip(input.snippet, 360),
    recovery_status: "not_recovered" as const,
    citable_status: "not_citable_until_recovered" as const,
    recommended_search_query: query || clip(input.marker, 160),
    reasons: unique([
      input.discoveredFrom === "reference_list" ? "found_in_pdf_reference_list" : "found_as_inline_citation_marker",
      doi ? "doi_detected" : null,
      title ? "title_inferred" : null,
    ]),
    warnings: ["Secondary reference is not recovered or selected; do not cite as primary evidence."],
  };
}

function candidatesFromText(input: {
  sourceId: string;
  sourceTitle?: string | null;
  text: string;
}) {
  const candidates: SecondaryReferenceRecoveryCandidate[] = [];
  const referenceList = extractReferenceList(input.text);
  if (referenceList) {
    for (const entry of splitReferenceEntries(referenceList)) {
      candidates.push(
        buildCandidate({
          sourceId: input.sourceId,
          sourceTitle: input.sourceTitle,
          discoveredFrom: "reference_list",
          marker: entry,
          snippet: entry,
        }),
      );
    }
  }

  const inlinePatterns = [
    /\(([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'. -]{2,80},\s*(?:19|20)\d{2}[a-z]?)\)/g,
    /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'.-]{2,40}\s+et\s+al\.,?\s*(?:19|20)\d{2}[a-z]?)\b/g,
  ];
  for (const pattern of inlinePatterns) {
    for (const match of input.text.slice(0, 120_000).matchAll(pattern)) {
      const marker = match[1] ?? match[0];
      candidates.push(
        buildCandidate({
          sourceId: input.sourceId,
          sourceTitle: input.sourceTitle,
          discoveredFrom: "inline_citation",
          marker,
          snippet: clip(input.text.slice(Math.max((match.index ?? 0) - 120, 0), (match.index ?? 0) + 240), 360),
        }),
      );
    }
  }
  return candidates;
}

export function buildSecondaryReferenceRecoveryQueue(input: {
  case_id?: string | null;
  handoff?: EvidenceEngineHandoffV1 | null;
  evidencePacksArtifact?: EvidencePackArtifact | null;
  reducedEvidencePack?: ReducedEvidencePackV1 | null;
}): SecondaryReferenceRecoveryQueueV1 {
  const candidates: SecondaryReferenceRecoveryCandidate[] = [];
  const sourceTitles = new Map<string, string | null>();
  for (const source of input.handoff?.source_registry ?? []) {
    sourceTitles.set(source.source_id, source.title);
  }

  for (const pack of input.evidencePacksArtifact?.packs ?? []) {
    sourceTitles.set(pack.source_id, sourceTitles.get(pack.source_id) ?? null);
    if (pack.source_text_path && existsSync(pack.source_text_path)) {
      const text = readFileSync(pack.source_text_path, "utf8");
      candidates.push(
        ...candidatesFromText({
          sourceId: pack.source_id,
          sourceTitle: sourceTitles.get(pack.source_id) ?? null,
          text,
        }),
      );
    }
  }

  for (const unit of input.reducedEvidencePack?.evidence_units ?? []) {
    const text = unit.original_text || unit.summary_es || "";
    if (!text) continue;
    candidates.push(
      ...candidatesFromText({
        sourceId: unit.source_id,
        sourceTitle: sourceTitles.get(unit.source_id) ?? null,
        text,
      }).map((candidate) => ({
        ...candidate,
        evidence_id: unit.evidence_id,
      })),
    );
  }

  const selectedSourceIds = new Set(input.handoff?.source_registry.map((source) => source.source_id) ?? []);
  const seen = new Set<string>();
  const deduped = candidates
    .filter((candidate) => !selectedSourceIds.has(candidate.dedupe_key))
    .filter((candidate) => {
      if (seen.has(candidate.dedupe_key)) return false;
      seen.add(candidate.dedupe_key);
      return true;
    })
    .slice(0, 120);

  return {
    artifact_type: "secondary_reference_recovery_queue",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    case_id: input.case_id ?? null,
    handoff_id: input.handoff?.handoff_id ?? null,
    source_count_scanned: new Set([
      ...(input.evidencePacksArtifact?.packs.map((pack) => pack.source_id) ?? []),
      ...(input.reducedEvidencePack?.evidence_units.map((unit) => unit.source_id) ?? []),
    ]).size,
    candidate_count: deduped.length,
    candidates: deduped,
    warnings:
      deduped.length > 0
        ? [
            "secondary_reference_recovery_candidates_detected",
            "Candidates are queued for future retrieval/source selection and remain not citable until recovered.",
          ]
        : [],
  };
}

export function renderSecondaryReferenceRecoveryQueueReport(queue: SecondaryReferenceRecoveryQueueV1) {
  return [
    "# Secondary Reference Recovery Queue",
    "",
    `- case_id: ${queue.case_id ?? "unknown"}`,
    `- handoff_id: ${queue.handoff_id ?? "none"}`,
    `- source_count_scanned: ${queue.source_count_scanned}`,
    `- candidate_count: ${queue.candidate_count}`,
    "- policy: candidates are not citable until recovered, selected, and validated",
    "",
    "## Candidates",
    ...(queue.candidates.length
      ? queue.candidates.slice(0, 40).map((candidate, index) =>
          [
            `${index + 1}. ${candidate.title ?? candidate.marker}`,
            `   - discovered_in_source_id: ${candidate.discovered_in_source_id}`,
            `   - discovered_from: ${candidate.discovered_from}`,
            `   - doi: ${candidate.doi ?? "not_detected"}`,
            `   - year: ${candidate.year ?? "unknown"}`,
            `   - recommended_search_query: ${candidate.recommended_search_query}`,
            `   - citable_status: ${candidate.citable_status}`,
          ].join("\n"),
        )
      : ["- none"]),
    "",
    "## Warnings",
    ...(queue.warnings.length ? queue.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
  ].join("\n");
}
