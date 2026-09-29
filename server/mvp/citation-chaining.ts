import { fetchCrossrefWorkByDoi } from "@/server/retrieval/crossref-client";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export type DiscoveryCandidate = { status: "DISCOVERY_CANDIDATE"; doi: string | null; title: string | null; parent_reference_id: string | null; depth: number; discovery_method: "citation_chain" | "crossref_search" | "openalex_search" | "deep_research"; discovered_url?: string; resolved_metadata?: unknown };
export function citationChainLimits() {
  const bounded = (key: string, fallback: number, max: number) => Math.max(0, Math.min(max, Number.parseInt(process.env[key] ?? String(fallback), 10) || 0));
  return { depth: bounded("IMX_CITATION_CHAIN_DEPTH", 1, 1), perSource: bounded("IMX_CHAIN_CANDIDATES_PER_SOURCE", 10, 10), additional: bounded("IMX_ADDITIONAL_INSPECTED_SOURCES", 10, 10) };
}
export function parseCitationCandidates(text: string, parentId: string, depth = 1, limit = 10): DiscoveryCandidate[] {
  const limits = citationChainLimits();
  if (depth > limits.depth) return [];
  const headings = [...text.matchAll(/(?:^|\n)\s*(?:\d+[.)]?\s*)?(?:references|bibliograf[ií]a|referencias)(?:\s+bibliogr[aá]ficas)?\s*(?:\n|$)/gim)];
  if (!headings.length) return [];
  const bibliography = text.slice(headings.at(-1)!.index! + headings.at(-1)![0].length);
  const dois = [...new Set((bibliography.match(/10\.\d{4,9}\/[^\s<>"\]]+/gi) ?? []).map((doi) => doi.replace(/[.,;:)]+$/, "").toLowerCase()))];
  return dois.slice(0, Math.min(limit, limits.perSource)).map((doi) => ({ status: "DISCOVERY_CANDIDATE", doi, title: null, parent_reference_id: parentId, depth, discovery_method: "citation_chain" }));
}
export async function resolveDiscoveryCandidate(candidate: DiscoveryCandidate) {
  if (!candidate.doi) return null;
  const metadata = await fetchCrossrefWorkByDoi(candidate.doi);
  if (!metadata?.DOI || metadata.DOI.toLowerCase() !== candidate.doi.toLowerCase() || !metadata.title?.[0]) return null;
  return { ...candidate, title: metadata.title[0], resolved_metadata: metadata }; // Still not evidence.
}
export async function parsePdfCitationLinks(pdfPath: string, parentId: string): Promise<DiscoveryCandidate[]> {
  const limits = citationChainLimits();
  if (!limits.depth || !limits.perSource) return [];
  const cached = path.join(homedir(), ".cache/ingeniometrix/step5-pdf-layout-venv/bin/python");
  const python = process.env.IMX_STEP5_PDF_LAYOUT_PYTHON?.trim() || (existsSync(cached) ? cached : "python3");
  const { stdout } = await promisify(execFile)(python, [path.join(process.cwd(), "scripts/mvp/python/pdf_citation_links.py"), pdfPath, String(limits.perSource)], { timeout: 30_000, maxBuffer: 1_000_000 });
  return (JSON.parse(stdout) as Array<{ doi: string; url: string }>).map((c) => ({ status: "DISCOVERY_CANDIDATE", doi: c.doi, title: null, parent_reference_id: parentId, depth: 1, discovery_method: "citation_chain", discovered_url: c.url }));
}
export function canPromoteCandidate(input: { identityResolved: boolean; inspected: boolean; evidenceLevel: string; excerptVerified: boolean }) {
  return input.identityResolved && input.inspected && ["ABSTRACT_AVAILABLE", "FULL_TEXT_MATERIALIZED"].includes(input.evidenceLevel) && input.excerptVerified;
}
