import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/text";
import { sourceRelevanceTier } from "./source-relevance-tier";
import { candidateMetadataHash } from "./candidate-review-policy";
import { normalizeScholarlyDoi, sameScientificWork } from "./provider-query-policy";
import type { ProjectReferenceSearchSnapshot } from "./reference-search-v2";
import type { CrossrefMessage } from "./crossref-client";
type CachedSource = { doi: string | null; openAlexId: string | null; title: string; abstract: string | null;
  authors: string[]; year: number | null; venue: string | null; workType: string | null; landingPageUrl: string | null;
  rawOpenAlexJson?: unknown; rawCrossrefJson?: CrossrefMessage | null };
/** Reuse independently observed metadata and its existing grounded review.
 * Called on an explicit search, never on GET. No new provider or review call. */
export async function recoverExploratoryCache(userId: string, projectId: string, snapshot: ProjectReferenceSearchSnapshot) {
  const rows = await prisma.auditLog.findMany({ where: { projectId, userId, eventType: "SOURCE_PROVIDER_QUERY_COMPLETED",
    payloadJson: { path: ["queryPlanHash"], equals: snapshot.queryPlanHash ?? "" } }, orderBy: { createdAt: "desc" }, take: 20 });
  const cached = rows.flatMap(row => ((row.payloadJson as { results?: CachedSource[] } | null)?.results ?? []));
  const additions: ProjectReferenceSearchSnapshot["references"] = [];
  for (const entry of (snapshot.candidateAdmissions ?? []).slice(0, 100)) {
    const assessment = entry.scoreBreakdown.candidateAssessment;
    const source = cached.find(item => item.title === entry.title && (entry.doi ? normalizeScholarlyDoi(item.doi) === normalizeScholarlyDoi(entry.doi) : entry.candidateKey === `openalex:${item.openAlexId}`));
    if (!source || sourceRelevanceTier(assessment, Boolean(source.doi || source.openAlexId)) !== "EXPLORATORY") continue;
    const abstract = source.rawCrossrefJson?.abstract ?? source.abstract;
    if (candidateMetadataHash({ candidateId: entry.candidateKey, title: source.title, abstract, year: source.year }) !== assessment?.metadataHash) continue;
    const referenceId = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
      if (!await tx.project.count({ where: { id: projectId, userId } })) throw new Error("PROJECT_NOT_FOUND");
      const doi = normalizeScholarlyDoi(source.doi);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reference:${doi ?? source.openAlexId}`}))`;
      const ref = await tx.reference.findFirst({ where: { OR: [...(doi ? [{ doi }] : []), ...(source.openAlexId ? [{ openAlexId: source.openAlexId }] : [])] } });
      if (ref && !sameScientificWork(source, { ...ref, authors: Array.isArray(ref.authorsJson) ? ref.authorsJson.filter((v): v is string => typeof v === "string") : [] })) return null;
      const saved = ref ?? await tx.reference.create({ data: { doi, openAlexId: source.openAlexId, title: source.title, normalizedTitle: normalizeTitle(source.title),
        abstract, authorsJson: source.authors, year: source.year, venue: source.venue, workType: source.workType, landingPageUrl: source.landingPageUrl,
        rawOpenAlexJson: (source.rawOpenAlexJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        rawCrossrefJson: (source.rawCrossrefJson ?? Prisma.JsonNull) as Prisma.InputJsonValue } });
      // Never overwrite existing canonical metadata to fit an old assessment.
      if (candidateMetadataHash({ candidateId: saved.id, title: saved.title, abstract: saved.abstract, year: saved.year }) !== assessment.metadataHash) return null;
      await tx.projectReference.upsert({ where: { projectId_referenceId: { projectId, referenceId: saved.id } }, update: {},
        create: { projectId, referenceId: saved.id, sourceProvider: source.rawOpenAlexJson ? "OPENALEX" : "CROSSREF", selected: false } });
      return saved.id;
    });
    if (referenceId && !snapshot.references.some(item => item.referenceId === referenceId)) additions.push({ referenceId,
      relevanceScore: entry.relevanceScore, scoreBreakdown: entry.scoreBreakdown, admission: entry.admission, suggestedSelectedOrder: null });
  }
  if (!additions.length) return snapshot;
  const next = { ...snapshot, savedAt: new Date().toISOString(), references: [...snapshot.references, ...additions] };
  await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "SEARCH_COMPLETED",
    payloadJson: JSON.parse(JSON.stringify({ referenceSearchVersion: "v2", cacheRecovery: "EXPLORATORY_PRESENTATION", searchSnapshot: next })) } });
  return next;
}
