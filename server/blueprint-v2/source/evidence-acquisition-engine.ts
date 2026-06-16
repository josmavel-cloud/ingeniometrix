import { normalizeTitle } from "@/lib/text";
import { buildReferenceSearchPlan } from "@/server/retrieval/search-query-planner";
import { searchOpenAlexWorks } from "@/server/retrieval/openalex-client";
import { searchCrossrefWorks } from "@/server/retrieval/crossref-client";
import { extractAccessSignals } from "@/server/retrieval/reference-access";
import type {
  BlueprintSourceRecord,
  EvidenceAcquisitionResult,
  MasterBlueprintEngineProject,
  SourceAcquisitionDecision,
  SourceIntakeGateResult,
} from "@/server/blueprint-v2/types";
import {
  buildDeterministicSourceId,
  buildSourceOverlapScore,
  clipText,
  uniqueByNormalizedTitle,
} from "@/server/blueprint-v2/utils";

const TARGET_SOURCE_COUNT = 5;

type RankedCandidate = {
  source: BlueprintSourceRecord;
  score: number;
};

function createSourceRecord(input: {
  origin: "provider_expansion" | "websearch_source";
  title: string;
  doi?: string | null;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  abstract?: string | null;
  landingPageUrl?: string | null;
  pdfUrl?: string | null;
  query?: string | null;
  snippet?: string | null;
  citationCount?: number | null;
  rawOpenAlexJson?: unknown | null;
  rawCrossrefJson?: unknown | null;
  eligibleForFormalReference?: boolean;
}) {
  return {
    source_id: buildDeterministicSourceId({
      origin: input.origin,
      doi: input.doi ?? null,
      title: input.title,
      url: input.landingPageUrl ?? input.pdfUrl ?? null,
    }),
    reference_id: null,
    origin: input.origin,
    label:
      input.origin === "provider_expansion"
        ? "Fuente complementada por providers"
        : "Fuente complementada por web search",
    title: input.title,
    normalized_title: normalizeTitle(input.title),
    doi: input.doi ?? null,
    authors: input.authors ?? [],
    year: input.year ?? null,
    venue: input.venue ?? null,
    abstract: input.abstract ?? null,
    landing_page_url: input.landingPageUrl ?? null,
    pdf_url: input.pdfUrl ?? null,
    query: input.query ?? null,
    snippet: input.snippet ?? null,
    selected_order: null,
    citation_count: input.citationCount ?? null,
    is_open_access: Boolean(input.pdfUrl || input.landingPageUrl || input.doi),
    raw_openalex_json: input.rawOpenAlexJson ?? null,
    raw_crossref_json: input.rawCrossrefJson ?? null,
    eligible_for_formal_reference: input.eligibleForFormalReference ?? true,
  } satisfies BlueprintSourceRecord;
}

async function searchProviders(project: MasterBlueprintEngineProject) {
  const plan = await buildReferenceSearchPlan({
    activeLanguage: project.language,
    topic: project.intake.topic,
    problemContext: project.intake.problemContext,
    targetPopulation: project.intake.targetPopulation,
    preferredMethodology: project.intake.preferredMethodology,
    program: project.program,
    researchLine: project.intake.researchLine,
  });
  const rankedCandidates: RankedCandidate[] = [];

  for (const query of plan.searchQueries.slice(0, 4)) {
    const [openAlexResults, crossrefResults] = await Promise.allSettled([
      searchOpenAlexWorks(query),
      searchCrossrefWorks(query),
    ]);

    if (openAlexResults.status === "fulfilled") {
      for (const result of openAlexResults.value) {
        if (!result.title?.trim()) {
          continue;
        }

        const access = extractAccessSignals({
          rawOpenAlexJson: result.rawOpenAlexJson,
          rawCrossrefJson: null,
          landingPageUrl: result.landingPageUrl,
          doi: result.doi,
        });
        const source = createSourceRecord({
          origin: "provider_expansion",
          title: result.title,
          doi: result.doi,
          authors: result.authors,
          year: result.year,
          venue: result.venue,
          abstract: result.abstract,
          landingPageUrl: result.landingPageUrl,
          pdfUrl: access.pdfUrl,
          query,
          citationCount: result.citationCount ?? 0,
          rawOpenAlexJson: result.rawOpenAlexJson,
          eligibleForFormalReference: false,
        });
        rankedCandidates.push({
          source,
          score: buildSourceOverlapScore({
            topicSeed: project.intake.topic,
            intakeContext: [
              project.intake.problemContext,
              project.intake.targetPopulation,
              project.intake.preferredMethodology,
            ]
              .filter(Boolean)
              .join(" "),
            title: source.title,
            abstract: source.abstract,
            year: source.year,
            hasPdf: Boolean(source.pdf_url),
          }),
        });
      }
    }

    if (crossrefResults.status === "fulfilled") {
      for (const result of crossrefResults.value) {
        if (!result.title?.trim()) {
          continue;
        }

        const access = extractAccessSignals({
          rawOpenAlexJson: result.rawOpenAlexJson,
          rawCrossrefJson: result.rawCrossrefJson,
          landingPageUrl: result.landingPageUrl,
          doi: result.doi,
        });
        const source = createSourceRecord({
          origin: "provider_expansion",
          title: result.title,
          doi: result.doi,
          authors: result.authors,
          year: result.year,
          venue: result.venue,
          abstract: result.abstract,
          landingPageUrl: result.landingPageUrl,
          pdfUrl: access.pdfUrl,
          query,
          citationCount: result.citationCount ?? 0,
          rawCrossrefJson: result.rawCrossrefJson,
          eligibleForFormalReference: false,
        });
        rankedCandidates.push({
          source,
          score: buildSourceOverlapScore({
            topicSeed: project.intake.topic,
            intakeContext: [
              project.intake.problemContext,
              project.intake.targetPopulation,
              project.intake.preferredMethodology,
            ]
              .filter(Boolean)
              .join(" "),
            title: source.title,
            abstract: source.abstract,
            year: source.year,
            hasPdf: Boolean(source.pdf_url),
          }),
        });
      }
    }
  }

  const uniqueRanked = uniqueByNormalizedTitle(
    rankedCandidates
      .sort((left, right) => right.score - left.score)
      .map((item) => item.source),
  );

  return uniqueRanked;
}

function decodeDuckDuckGoUrl(url: string) {
  try {
    const parsed = new URL(url);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url;
  } catch {
    return url;
  }
}

async function searchWeb(query: string) {
  const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "user-agent": "Ingeniometrix/0.1",
      accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error("DuckDuckGo no respondio correctamente.");
  }

  const html = await response.text();
  const resultPattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>|<a class="result__url"[\s\S]*?<\/a>[\s\S]*?<a class="result__snippet"[^>]*>)([\s\S]*?)<\/a>/gi;
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  let match: RegExpExecArray | null = null;

  while ((match = resultPattern.exec(html)) && results.length < 6) {
    const rawUrl = decodeDuckDuckGoUrl(match[1]);
    const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snippet = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    if (!title || !rawUrl) {
      continue;
    }

    results.push({ title, url: rawUrl, snippet });
  }

  return results;
}

function toWebSourceRecord(item: { title: string; url: string; snippet: string }, query: string) {
  return createSourceRecord({
    origin: "websearch_source",
    title: item.title,
    landingPageUrl: item.url,
    pdfUrl: item.url.toLowerCase().endsWith(".pdf") ? item.url : null,
    query,
    snippet: clipText(item.snippet, 400),
    eligibleForFormalReference: false,
  });
}

export async function runEvidenceAcquisitionEngine(input: {
  project: MasterBlueprintEngineProject;
  sourceGate: SourceIntakeGateResult;
}): Promise<EvidenceAcquisitionResult> {
  const warnings = [...input.sourceGate.coverage_warnings];
  const decisions: SourceAcquisitionDecision[] = [];
  const registry = [...input.sourceGate.selected_sources];
  const existingKeys = new Set(
    registry.map((source) => `${source.doi ?? ""}|${source.normalized_title}`),
  );

  const targetSourceCount = Math.max(TARGET_SOURCE_COUNT, input.sourceGate.minimum_required_sources);
  const providerExpansionSources =
    registry.length < targetSourceCount || input.sourceGate.coverage_warnings.length > 0
      ? await searchProviders(input.project).catch((error) => {
          warnings.push(
            `La expansion automatica con OpenAlex/Crossref no pudo completarse: ${error instanceof Error ? error.message : "sin detalle"}.`,
          );
          return [] as BlueprintSourceRecord[];
        })
      : [];

  for (const source of providerExpansionSources) {
    const dedupKey = `${source.doi ?? ""}|${source.normalized_title}`;
    const accepted = !existingKeys.has(dedupKey) && registry.length < targetSourceCount;
    decisions.push({
      source_id: source.source_id,
      accepted,
      reason: accepted
        ? "La fuente provider complementa el set inicial y mejora cobertura tematica."
        : "La fuente provider fue descartada por duplicidad o por sobrepasar el target de cobertura.",
      origin: source.origin,
      query: source.query,
    });

    if (!accepted) {
      continue;
    }

    existingKeys.add(dedupKey);
    registry.push(source);
  }

  const websearchSources: BlueprintSourceRecord[] = [];
  if (registry.length < input.sourceGate.minimum_required_sources || input.sourceGate.coverage_warnings.length > 0) {
    const plan = await buildReferenceSearchPlan({
      activeLanguage: input.project.language,
      topic: input.project.intake.topic,
      problemContext: input.project.intake.problemContext,
      targetPopulation: input.project.intake.targetPopulation,
      preferredMethodology: input.project.intake.preferredMethodology,
      program: input.project.program,
      researchLine: input.project.intake.researchLine,
    }).catch(() => ({
      searchQueries: [input.project.intake.topic],
    }));

    for (const query of plan.searchQueries.slice(0, 2)) {
      const results = await searchWeb(query).catch((error) => {
        warnings.push(
          `El web search complementario fallo para "${query}": ${error instanceof Error ? error.message : "sin detalle"}.`,
        );
        return [];
      });

      for (const result of results) {
        const source = toWebSourceRecord(result, query);
        const dedupKey = `${source.doi ?? ""}|${source.normalized_title}`;
        const accepted = !existingKeys.has(dedupKey) && websearchSources.length < 3;

        decisions.push({
          source_id: source.source_id,
          accepted,
          reason: accepted
            ? "La fuente web aporta contexto complementario cuando el set academico no alcanza el minimo operativo."
            : "La fuente web fue descartada por duplicidad o baja necesidad de cobertura adicional.",
          origin: source.origin,
          query,
        });

        if (!accepted) {
          continue;
        }

        existingKeys.add(dedupKey);
        websearchSources.push(source);
        registry.push(source);
      }
    }
  }

  return {
    target_source_count: targetSourceCount,
    source_registry: registry,
    provider_expansion_sources: registry.filter((source) => source.origin === "provider_expansion"),
    websearch_sources: websearchSources,
    decisions,
    warnings,
  };
}
