import { fingerprint } from "@/server/mvp/job-execution-context";
import { normalizeTitle } from "@/lib/text";
import type { ScientificQuery } from "@/lib/retrieval-query-composition";
import type { ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";

export const PROVIDER_QUERY_POLICY_VERSION = "source-provider-query.v1";
export const PROVIDER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ProviderQuery = {
  familyId: string;
  familyType: string;
  provider: "OPENALEX" | "CROSSREF";
  renderedQuery: string;
  filters: string[];
  page: number;
};

export type ExecutedProviderQuery = ProviderQuery & {
  queryHash: string;
  executedAt: string;
  resultCount: number;
  newCandidateCount: number;
  cacheHit: boolean;
  errorCategory: string | null;
};

export function providerQueryHash(planHash: string, query: ProviderQuery) {
  return fingerprint({ planHash, policy: PROVIDER_QUERY_POLICY_VERSION, ...query });
}

// Crossref's bibliographic field is free text, not OpenAlex's Boolean grammar.
// Only validated required scientific concepts are allowed to anchor this query.
export function renderCrossrefFamily(query: ScientificQuery, plan: ScientificConceptPlan) {
  const byId = new Map(plan.concepts.map(concept => [concept.id, concept]));
  const phrases = query.requiredConceptIds.map(id => {
    const concept = byId.get(id);
    if (!concept) return null;
    const english = concept.terms.find(term => term.language === "en" && ["VALIDATED_TRANSLATION", "ACADEMIC_EQUIVALENT"].includes(term.expansionType));
    const original = concept.terms.find(term => term.expansionType === "EXACT_ORIGINAL");
    return (english ?? original)?.value?.trim() ?? null;
  }).filter((value): value is string => Boolean(value));
  if (phrases.length !== query.requiredConceptIds.length || phrases.length < 2) throw new Error("CROSSREF_FAMILY_ANCHOR_MISSING");
  return phrases.join(" ").slice(0, 240);
}

export function selectProviderQueries(input: {
  batchKind: "initial" | "more";
  planHash: string;
  families: ScientificQuery[];
  fallbackQueries?: string[];
  filters: string[];
  prior: ExecutedProviderQuery[];
  maxOpenAlexQueries?: number;
}) {
  const families = input.families.length ? input.families.map(f => ({ id: f.id, family: f.family, query: f.query }))
    : (input.fallbackQueries ?? []).map((query, index) => ({ id: `legacy-${index + 1}`, family: "LEGACY", query }));
  const seen = new Set(input.prior.filter(q => q.errorCategory === null).map(q => q.queryHash));
  const make = (family: typeof families[number], page: number): ProviderQuery => ({ familyId: family.id,
    familyType: family.family, provider: "OPENALEX", renderedQuery: family.query, filters: input.filters, page });
  if (input.batchKind === "initial") return families.slice(0, Math.min(2, input.maxOpenAlexQueries ?? 2)).map(f => make(f, 1));
  const unused = families.map(f => make(f, 1)).filter(q => !seen.has(providerQueryHash(input.planHash, q)));
  if (unused.length) return unused.slice(0, input.maxOpenAlexQueries ?? 2);
  // A second page is a genuine coverage expansion, never a replay of page 1.
  return families.map(f => make(f, 2)).filter(q => !seen.has(providerQueryHash(input.planHash, q))).slice(0, input.maxOpenAlexQueries ?? 2);
}

export function normalizeScholarlyDoi(doi: string | null | undefined) {
  return doi?.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").toLowerCase() || null;
}

export type CandidateIdentity = { doi: string | null; openAlexId?: string | null; landingPageUrl?: string | null;
  title: string | null; year: number | null; authors: string[]; workType?: string | null };

function canonicalUrl(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

export const scholarlyVersionClass = (workType: string | null | undefined) => /preprint|posted-content/i.test(workType ?? "") ? "preprint"
  : /proceedings|conference/i.test(workType ?? "") ? "conference"
  : /correction|erratum|retraction/i.test(workType ?? "") ? "correction"
  : /standard/i.test(workType ?? "") ? "standard"
  : /(?:journal-)?article|review/i.test(workType ?? "") ? "journal" : "other";

export function sameScientificWork(a: CandidateIdentity, b: CandidateIdentity) {
  const leftVersion = scholarlyVersionClass(a.workType), rightVersion = scholarlyVersionClass(b.workType);
  if (leftVersion !== rightVersion && leftVersion !== "other" && rightVersion !== "other") return false;
  if (leftVersion !== rightVersion && (leftVersion !== "other" && leftVersion !== "journal" ||
      rightVersion !== "other" && rightVersion !== "journal")) return false;
  if (a.openAlexId && b.openAlexId && a.openAlexId === b.openAlexId) return true;
  const leftDoi = normalizeScholarlyDoi(a.doi), rightDoi = normalizeScholarlyDoi(b.doi);
  if (leftDoi && rightDoi) return leftDoi === rightDoi;
  if (leftDoi || rightDoi) return false; // Never infer a DOI-backed identity from weak title similarity.
  if (leftVersion !== rightVersion || leftVersion === "standard") return false;
  const leftUrl = canonicalUrl(a.landingPageUrl), rightUrl = canonicalUrl(b.landingPageUrl);
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;
  const title = normalizeTitle(a.title);
  const author = (names: string[]) => normalizeTitle(names[0] ?? "");
  return Boolean(title && title.length >= 20 && title === normalizeTitle(b.title) && a.year && a.year === b.year && author(a.authors) && author(a.authors) === author(b.authors));
}
