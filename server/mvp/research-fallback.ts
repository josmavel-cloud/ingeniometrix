import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { Prisma, Provider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchCrossrefWorks, type CrossrefMessage } from "@/server/retrieval/crossref-client";
import { searchOpenAlexWorks } from "@/server/retrieval/openalex-client";
import { recordLlmUsage } from "@/server/llm-usage-registry";
import { currentApplicationBudget } from "./application-budget";
import { assessEvidenceCoverage, shouldExpandEvidence } from "./evidence-coverage";
import { citationChainLimits, parseCitationCandidates, parsePdfCitationLinks, resolveDiscoveryCandidate, type DiscoveryCandidate } from "./citation-chaining";
import { runMvpEvidenceMaterialization } from "./evidence-materialization-service";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import { RESEARCH_DISCOVERY_PROMPT as prompt } from "./prompts/research-discovery.v1";

export const DEEP_RESEARCH_LIMITS = { responses: 1, toolCalls: 3, outputTokens: 5000, wallMs: 120_000, maxSources: 5 } as const;
// At most four inference segments, each bounded by the documented 200k context.
// Reserve all tool calls as paid searches, even when they are open/find actions.
export const DEEP_RESEARCH_MAX_USD = ((DEEP_RESEARCH_LIMITS.toolCalls + 1) * 200_000 * 2 + DEEP_RESEARCH_LIMITS.outputTokens * 8) / 1e6 + DEEP_RESEARCH_LIMITS.toolCalls * 0.01;

export async function discoverWithDeepResearch(context: unknown, artifactDir: string, attribution: { projectId: string; runId: string }) {
  const budget = currentApplicationBudget();
  if (!budget) throw new Error("RESEARCH_BUDGET_REQUIRED");
  const reservation = budget.reserve("deep_research_discovery", prompt.model, DEEP_RESEARCH_MAX_USD);
  const client = new OpenAI({ maxRetries: 0, timeout: DEEP_RESEARCH_LIMITS.wallMs });
  const request = { model: prompt.model, input: `${prompt.systemPrompt}\n\n${prompt.userPromptTemplate.replace("{{context_json}}", JSON.stringify(context))}`, max_output_tokens: DEEP_RESEARCH_LIMITS.outputTokens, max_tool_calls: DEEP_RESEARCH_LIMITS.toolCalls, tools: [{ type: "web_search_preview" as const }], store: false };
  const started = Date.now();
  try {
    const result = await client.responses.create(request);
    const usage = result.usage;
    const toolCalls = result.output.filter((item) => item.type === "web_search_call").length;
    if (usage) {
      const cached = usage.input_tokens_details?.cached_tokens ?? 0;
      reservation.complete(((usage.input_tokens - cached) * 2 + cached * 0.5 + usage.output_tokens * 8) / 1e6 + toolCalls * 0.01, usage);
      await recordLlmUsage({ provider: "openai", model: result.model, operation: "deep_research_discovery", inputTokens: usage.input_tokens, cachedInputTokens: cached, outputTokens: usage.output_tokens, attribution: { ...attribution, promptVersion: prompt.version } });
    } else reservation.fail();
    await writeFile(path.join(artifactDir, "deep-research.json"), JSON.stringify({ prompt_registry: prompt, request, response: result, duration_ms: Date.now() - started, retry_policy: "none", tool_cost_estimate_usd: toolCalls * 0.01 }, null, 2));
    if (result.status !== "completed") throw new Error(`DEEP_RESEARCH_INCOMPLETE: ${result.status}`);
    // No prose is promoted. Only independently resolvable DOI candidates leave this adapter.
    return parseCitationCandidates(`References\n${result.output_text}`, "deep-research", 1, DEEP_RESEARCH_LIMITS.maxSources).map((c): DiscoveryCandidate => ({ ...c, parent_reference_id: null, discovery_method: "deep_research" }));
  } catch (error) {
    reservation.fail();
    await writeFile(path.join(artifactDir, "deep-research-failure.json"), JSON.stringify({ configured_model: prompt.model, prompt_version: prompt.version, error: String(error), duration_ms: Date.now() - started, usage: null, reserved_max_usd: DEEP_RESEARCH_MAX_USD }));
    throw error;
  }
}

export async function runEvidenceTiers<T>(input: { initial: T; assess: (value: T) => { status: string }; deterministic: (value: T) => Promise<T>; deep: (value: T) => Promise<T> }) {
  let value = input.initial;
  const tiers = ["selected_sources"];
  if (input.assess(value).status === "INSUFFICIENT") { value = await input.deterministic(value); tiers.push("deterministic_expansion"); }
  if (input.assess(value).status === "INSUFFICIENT") { value = await input.deep(value); tiers.push("deep_research_discovery"); }
  return { value, tiers, blocked: input.assess(value).status === "INSUFFICIENT" };
}

export async function ensureResearchCoverage(input: { userId: string; projectId: string; runId: string; intake: { topic: string; preferredMethodology: string | null }; ledger: MvpStep5EvidenceLedger; artifactDir: string }) {
  const limits = citationChainLimits();
  const audit: { candidates: DiscoveryCandidate[]; added_reference_ids: string[]; warnings: string[]; tiers: string[] } = { candidates: [], added_reference_ids: [], warnings: [], tiers: [] };
  const known = await prisma.projectReference.findMany({ where: { projectId: input.projectId }, include: { reference: true } });
  const knownDois = new Set(known.map((r) => r.reference.doi?.toLowerCase()).filter(Boolean));
  const chain: DiscoveryCandidate[] = [];
  for (const material of input.ledger.pdf_materializations) {
    if (material.status !== "materialized" || !material.fulltext_path) continue;
    const candidates = parseCitationCandidates(await readFile(material.fulltext_path, "utf8"), material.reference_id);
    if (candidates.length < limits.perSource && material.source_pdf_path) {
      try { candidates.push(...await parsePdfCitationLinks(material.source_pdf_path, material.reference_id)); }
      catch (error) { audit.warnings.push(`Citation hyperlinks unavailable: ${String(error)}`); }
    }
    chain.push(...[...new Map(candidates.map((c) => [c.doi, c])).values()].slice(0, limits.perSource));
  }
  audit.candidates.push(...chain);
  let remaining = limits.additional;
  async function inspectCandidates(candidates: DiscoveryCandidate[], previous: MvpStep5EvidenceLedger, tier: string) {
    let added = 0;
    const deadline = Date.now() + 120_000;
    for (const candidate of candidates.slice(0, limits.additional)) {
      if (remaining <= 0 || Date.now() >= deadline) break;
      if (!candidate.doi || knownDois.has(candidate.doi.toLowerCase())) continue;
      let resolved;
      try { resolved = await resolveDiscoveryCandidate(candidate); } catch (e) { audit.warnings.push(String(e)); continue; }
      if (!resolved) continue;
      knownDois.add(candidate.doi.toLowerCase());
      const metadata = resolved.resolved_metadata as CrossrefMessage;
      const reference = await prisma.reference.findFirst({ where: { doi: { equals: candidate.doi, mode: "insensitive" } } }) ?? await prisma.reference.create({ data: { doi: candidate.doi, title: resolved.title!, normalizedTitle: resolved.title!.toLowerCase(), authorsJson: (metadata.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")), abstract: metadata.abstract?.replace(/<[^>]+>/g, " ") ?? null, year: metadata.issued?.["date-parts"]?.[0]?.[0] ?? null, venue: metadata.publisher, landingPageUrl: metadata.URL, rawCrossrefJson: metadata as Prisma.InputJsonValue } });
      // Never overwrite a human selected/deselected link; supplementation is additive and labelled.
      if (known.some((r) => r.referenceId === reference.id)) continue;
      await prisma.projectReference.create({ data: { projectId: input.projectId, referenceId: reference.id, sourceProvider: Provider.CROSSREF, selected: true, selectedOrder: known.filter((r) => r.selected).length + audit.added_reference_ids.length + 1, selectionReason: JSON.stringify({ origin: "automatic_evidence_supplement", status: "DISCOVERY_CANDIDATE", tier, parent_reference_id: candidate.parent_reference_id, runId: input.runId }) } });
      audit.added_reference_ids.push(reference.id); added++; remaining--;
    }
    if (!added) return previous;
    const materialized = await runMvpEvidenceMaterialization({ userId: input.userId, projectId: input.projectId, runId: `${input.runId}-${tier}` });
    return JSON.parse(await readFile(materialized.artifacts.evidence_ledger, "utf8")) as MvpStep5EvidenceLedger;
  }
  try {
    const result = await runEvidenceTiers({ initial: input.ledger, assess: assessEvidenceCoverage,
      deterministic: async (ledger) => {
        const query = [input.intake.topic, input.intake.preferredMethodology].filter(Boolean).join(" ");
        const discovered: DiscoveryCandidate[] = [...chain];
        for (const [method, search] of [["openalex_search", searchOpenAlexWorks], ["crossref_search", searchCrossrefWorks]] as const) {
          try { discovered.push(...(await search(query)).slice(0, limits.additional).map((r): DiscoveryCandidate => ({ status: "DISCOVERY_CANDIDATE", doi: r.doi, title: r.title, parent_reference_id: null, depth: 0, discovery_method: method }))); }
          catch (error) { audit.warnings.push(`${method}: ${String(error)}`); }
        }
        audit.candidates.push(...discovered.filter((c) => c.discovery_method !== "citation_chain"));
        return inspectCandidates(discovered, ledger, "tier2");
      },
      deep: async (ledger) => {
        if (!remaining || !shouldExpandEvidence(assessEvidenceCoverage(ledger))) return ledger;
        const discovered = await discoverWithDeepResearch({ intake: input.intake, uncovered_dimensions: assessEvidenceCoverage(ledger).uncovered_dimensions, known_dois: [...knownDois], max_sources: Math.min(remaining, 5), preferred_sources: ["scholarly publishers", "university repositories", "official research institutions"] }, input.artifactDir, { projectId: input.projectId, runId: input.runId });
        audit.candidates.push(...discovered);
        return inspectCandidates(discovered, ledger, "tier3");
      },
    });
    audit.tiers = result.tiers;
    if (result.blocked) throw new Error("INSUFFICIENT_EVIDENCE_COVERAGE: agregar fuentes para dimensiones faltantes; no se genero plan.");
    return { changed: audit.added_reference_ids.length > 0, coverage: assessEvidenceCoverage(result.value), ledger: result.value };
  } finally {
    await writeFile(path.join(input.artifactDir, "research-discovery.json"), JSON.stringify({ project_id: input.projectId, run_id: input.runId, initial_coverage: assessEvidenceCoverage(input.ledger), limits, ...audit }, null, 2));
  }
}
