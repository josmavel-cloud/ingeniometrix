import { randomUUID } from "node:crypto";

import { Prisma, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { logAuditEvent } from "@/server/audit/audit-service";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { buildOpenAlexAbstract, fetchOpenAlexWork, fetchOpenAlexWorksCiting, type OpenAlexWork } from "@/server/retrieval/openalex-client";

export type BibliographicMapWork = {
  openalex_id: string | null;
  doi: string | null;
  title: string;
  year: number | null;
  venue: string | null;
  citation_count: number;
  type: string | null;
  abstract_available: boolean;
  concepts: string[];
  keywords: string[];
  topics: string[];
};

export type BibliographicMapSource = BibliographicMapWork & {
  reference_id: string;
  relevance_score: number;
  cross_references: {
    cited_by_sample: BibliographicMapWork[];
    referenced_works_sample: BibliographicMapWork[];
    related_works_sample: BibliographicMapWork[];
  };
};

export type BibliographicMapResult = {
  project_id: string;
  run_id: string;
  discovery: {
    status: string;
    batch_kind: string | null;
    candidate_source_count: number;
    search_query: string | null;
    attempted_queries: string[];
  };
  sources: BibliographicMapSource[];
  field_map: {
    recurring_concepts: string[];
    recurring_keywords: string[];
    recurring_topics: string[];
    central_authors: string[];
    central_venues: string[];
    methods_detected: string[];
    saturation_signals: string[];
    gap_signals: string[];
  };
  selection_guidance: {
    recommended_reference_ids: string[];
    warnings: string[];
    next_action_es: string;
  };
  api_usage: {
    run_id: string;
    report: Awaited<ReturnType<typeof buildMvpApiUsageReport>>;
  };
};

type RawOpenAlexLike = {
  id?: string | null;
  doi?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  type?: string | null;
  cited_by_count?: number | null;
  primary_location?: { source?: { display_name?: string | null } | null } | null;
  best_oa_location?: unknown;
  abstract_inverted_index?: Record<string, number[]>;
  concepts?: unknown[];
  keywords?: unknown[];
  topics?: unknown[];
  primary_topic?: unknown;
  referenced_works?: string[];
  related_works?: string[];
  authorships?: Array<{ author?: { display_name?: string | null } | null }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNoisyOpenAlexSignal(value: string) {
  const normalized = normalizeTitle(value);
  return normalized === "stock firearms";
}

function extractNames(values: unknown, keys: string[]) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim() && !isNoisyOpenAlexSignal(value)) return value.trim();
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

function extractSignals(raw: unknown) {
  const record = asRecord(raw) as RawOpenAlexLike | null;
  if (!record) return { concepts: [], keywords: [], topics: [] };
  const primaryTopic = asRecord(record.primary_topic);
  return {
    concepts: extractNames(record.concepts, ["display_name", "name"]).slice(0, 8),
    keywords: extractNames(record.keywords, ["display_name", "keyword", "name"]).slice(0, 8),
    topics: [
      typeof primaryTopic?.display_name === "string" && !isNoisyOpenAlexSignal(primaryTopic.display_name)
        ? primaryTopic.display_name
        : null,
      ...extractNames(record.topics, ["display_name", "name"]),
    ].filter((value): value is string => Boolean(value)).slice(0, 8),
  };
}

function tally(values: string[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const normalized = normalizeTitle(value);
    if (!normalized) continue;
    const current = counts.get(normalized) ?? { label: value, count: 0 };
    current.count += 1;
    counts.set(normalized, current);
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((item) => item.label);
}

function workToMapWork(work: OpenAlexWork | RawOpenAlexLike | null | undefined): BibliographicMapWork | null {
  if (!work) return null;
  const title = "display_name" in work ? work.display_name?.trim() : null;
  if (!title) return null;
  const signals = extractSignals(work);
  return {
    openalex_id: work.id ?? null,
    doi: work.doi?.replace("https://doi.org/", "") ?? null,
    title,
    year: work.publication_year ?? null,
    venue: work.primary_location?.source?.display_name ?? null,
    citation_count: work.cited_by_count ?? 0,
    type: work.type ?? null,
    abstract_available: Boolean(buildOpenAlexAbstract(work.abstract_inverted_index)?.trim()),
    concepts: signals.concepts,
    keywords: signals.keywords,
    topics: signals.topics,
  };
}

function rawToIds(raw: unknown, field: "referenced_works" | "related_works") {
  const record = asRecord(raw) as RawOpenAlexLike | null;
  return Array.isArray(record?.[field]) ? record[field]!.filter((item): item is string => typeof item === "string") : [];
}

function rawToAuthors(raw: unknown) {
  const record = asRecord(raw) as RawOpenAlexLike | null;
  return (record?.authorships ?? [])
    .map((item) => item.author?.display_name?.trim())
    .filter((value): value is string => Boolean(value));
}

async function fetchWorkSamples(ids: string[], limit: number) {
  const samples: BibliographicMapWork[] = [];
  for (const id of ids.slice(0, limit)) {
    try {
      const work = await fetchOpenAlexWork(id);
      const mapped = workToMapWork(work);
      if (mapped) samples.push(mapped);
    } catch {
      // Keep map generation best-effort; bad OpenAlex ids should not block Step 3.
    }
  }
  return samples;
}

function detectMethods(text: string) {
  const normalized = normalizeTitle(text);
  const candidates = [
    "systematic review",
    "scoping review",
    "meta analysis",
    "case study",
    "mixed methods",
    "regression",
    "machine learning",
    "deep learning",
    "monte carlo",
    "FORM",
    "finite element",
    "survey",
    "interview",
    "quasi experimental",
    "randomized controlled trial",
    "difference in differences",
    "structural equation model",
    "bibliometric",
    "simulation",
  ];
  return candidates.filter((candidate) => normalizeTitle(candidate).split(" ").every((term) => normalized.includes(term)));
}

function inferSaturationSignals(sources: BibliographicMapSource[]) {
  const reviewCount = sources.filter((source) => normalizeTitle(source.type).includes("review") || normalizeTitle(source.title).includes("review")).length;
  const highCitationCount = sources.filter((source) => source.citation_count >= 100).length;
  const relatedCount = sources.reduce((total, source) => total + source.cross_references.related_works_sample.length, 0);
  const signals: string[] = [];
  if (reviewCount > 0) signals.push(`${reviewCount} review(s) detectada(s): posible campo consolidado o saturado.`);
  if (highCitationCount >= 2) signals.push(`${highCitationCount} fuentes con 100+ citas: hay base academica fuerte.`);
  if (relatedCount >= sources.length) signals.push("OpenAlex devuelve related works suficientes: hay vecindario bibliografico explorable.");
  if (signals.length === 0) signals.push("No hay señales fuertes de saturacion; revisar con Deep Research o busqueda ampliada si el asesor exige novedad.");
  return signals;
}

function inferGapSignals(sources: BibliographicMapSource[]) {
  const noFullAbstract = sources.filter((source) => !source.abstract_available).length;
  const recentCount = sources.filter((source) => source.year && source.year >= new Date().getFullYear() - 5).length;
  const signals: string[] = [];
  if (recentCount <= 1) signals.push("Pocas fuentes recientes en el top inicial: explorar variantes o subtema emergente.");
  if (noFullAbstract > 0) signals.push(`${noFullAbstract} fuente(s) sin abstract util en metadata: puede requerir reemplazo o upload manual.`);
  if (sources.length < 5) signals.push("Menos de 5 fuentes candidatas persistidas: el intake puede estar demasiado estrecho o mal formulado.");
  signals.push("Los gaps son señales de trabajo para Paso 7/Deep Research; no deben citarse como evidencia final sin verificacion.");
  return signals;
}

export async function runMvpBibliographicMap(input: {
  userId: string;
  projectId: string;
  desiredTotal?: number;
}): Promise<BibliographicMapResult> {
  const runId = `mvp-bibliographic-map-${randomUUID()}`;
  const usageBefore = await captureMvpApiUsageSnapshot();
  const discovery = await runMvpSourceDiscovery(input.userId, input.projectId, {
    desiredTotal: input.desiredTotal ?? 5,
    batchKind: "initial",
  });
  const projectReferences = await prisma.projectReference.findMany({
    where: { projectId: input.projectId },
    include: { reference: true },
    orderBy: [{ relevanceScore: "desc" }, { createdAt: "asc" }],
    take: input.desiredTotal ?? 5,
  });
  const sources: BibliographicMapSource[] = [];

  for (const projectReference of projectReferences) {
    const raw = projectReference.reference.rawOpenAlexJson as RawOpenAlexLike | null;
    const base = workToMapWork(raw) ?? {
      openalex_id: projectReference.reference.openAlexId,
      doi: projectReference.reference.doi,
      title: projectReference.reference.title,
      year: projectReference.reference.year,
      venue: projectReference.reference.venue,
      citation_count: projectReference.reference.citationCount ?? 0,
      type: projectReference.reference.workType,
      abstract_available: Boolean(projectReference.reference.abstract?.trim()),
      ...extractSignals(projectReference.reference.rawOpenAlexJson),
    };
    const [referencedWorksSample, relatedWorksSample, citingWorks] = await Promise.all([
      fetchWorkSamples(rawToIds(raw, "referenced_works"), 3),
      fetchWorkSamples(rawToIds(raw, "related_works"), 3),
      projectReference.reference.openAlexId
        ? fetchOpenAlexWorksCiting(projectReference.reference.openAlexId, { perPage: 3 }).then((works) =>
            works.map(workToMapWork).filter((work): work is BibliographicMapWork => Boolean(work)),
          )
        : Promise.resolve([]),
    ]);

    sources.push({
      ...base,
      reference_id: projectReference.referenceId,
      relevance_score: projectReference.relevanceScore ?? 0,
      cross_references: {
        cited_by_sample: citingWorks,
        referenced_works_sample: referencedWorksSample,
        related_works_sample: relatedWorksSample,
      },
    });
  }

  const allWorks = sources.flatMap((source) => [
    source,
    ...source.cross_references.cited_by_sample,
    ...source.cross_references.referenced_works_sample,
    ...source.cross_references.related_works_sample,
  ]);
  const methodText = allWorks
    .map((work) => [work.title, work.keywords.join(" "), work.concepts.join(" "), work.topics.join(" ")].join(" "))
    .join(" \n");
  const centralAuthors = tally(projectReferences.flatMap((item) => rawToAuthors(item.reference.rawOpenAlexJson))).slice(0, 12);
  const centralVenues = tally(allWorks.map((work) => work.venue).filter((value): value is string => Boolean(value))).slice(0, 10);
  const recommendedReferenceIds = sources
    .filter((source) => source.relevance_score >= 50)
    .slice(0, 5)
    .map((source) => source.reference_id);
  const warnings = [
    sources.length < 5 ? "Paso 3 recupero menos de 5 fuentes; considerar pedir 5 mas o reabrir Paso 2." : null,
    recommendedReferenceIds.length < 3 ? "Menos de 3 fuentes superan el umbral sugerido; requiere revision humana cuidadosa." : null,
  ].filter((value): value is string => Boolean(value));

  const result: BibliographicMapResult = {
    project_id: input.projectId,
    run_id: runId,
    discovery: {
      status: discovery.status,
      batch_kind: discovery.batch_kind,
      candidate_source_count: discovery.candidate_source_count,
      search_query: discovery.search?.searchQuery ?? null,
      attempted_queries: discovery.search?.attemptedQueries ?? [],
    },
    sources,
    field_map: {
      recurring_concepts: tally(allWorks.flatMap((work) => work.concepts)).slice(0, 15),
      recurring_keywords: tally(allWorks.flatMap((work) => work.keywords)).slice(0, 15),
      recurring_topics: tally(allWorks.flatMap((work) => work.topics)).slice(0, 15),
      central_authors: centralAuthors,
      central_venues: centralVenues,
      methods_detected: tally(detectMethods(methodText)).slice(0, 10),
      saturation_signals: inferSaturationSignals(sources),
      gap_signals: inferGapSignals(sources),
    },
    selection_guidance: {
      recommended_reference_ids: recommendedReferenceIds.length > 0 ? recommendedReferenceIds : sources.slice(0, 3).map((source) => source.reference_id),
      warnings,
      next_action_es:
        "Revisa el mapa bibliografico, elige fuentes candidatas y decide si pedir 5 mas antes de inspeccion/source health.",
    },
    api_usage: {
      run_id: runId,
      report: await buildMvpApiUsageReport({
        before: usageBefore,
        label: "mvp_bibliographic_map",
        filter: { projectId: input.projectId },
      }),
    },
  };

  await logAuditEvent({
    eventType: "MVP_BIBLIOGRAPHIC_MAP_COMPLETED",
    actorType: "SYSTEM",
    provider: Provider.OPENALEX,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: result as unknown as Prisma.InputJsonValue,
  });

  return result;
}
