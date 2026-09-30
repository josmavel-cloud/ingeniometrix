// Operator-only, staging-only MORE acceptance. No planner, translation, document,
// web discovery, Deep Research or thesis-generation request can pass this fence.
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { getLatestProjectReferenceSearchSnapshot, searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const index = arg.indexOf("="); return [arg.slice(0, index), arg.slice(index + 1)]; }));
  const { mode, projectId, userId, requestId } = args;
  if (new URL(process.env.DATABASE_URL!).pathname !== "/imx_g5_staging" || process.env.APP_ORIGIN !== "https://staging.ingeniometrix.com" ||
      process.env.IMX_PAYMENT_MODE !== "sandbox" || process.env.IMX_ENABLE_DEEP_RESEARCH === "1") throw new Error("STAGING_ONLY");
  if (!projectId || !userId || !["precheck", "more"].includes(mode)) throw new Error("INVALID_ACCEPTANCE_ARGUMENTS");
  const input = await loadSearchInput(userId, projectId);
  const prior = await getLatestProjectReferenceSearchSnapshot(projectId);
  const searchIntentHash = fingerprint(input.intent);
  if (!prior || prior.stale || prior.inputTrace?.searchIntentHash !== searchIntentHash ||
      !prior.metadata.queryPack.validation?.valid) throw new Error("ACCEPTED_PLAN_UNAVAILABLE_OR_STALE");
  const selectedBefore = (await prisma.projectReference.findMany({ where: { projectId, selected: true }, select: { referenceId: true } }))
    .map(row => row.referenceId).sort();
  if (mode === "precheck") {
    console.log(JSON.stringify({ mode, projectId, searchIntentHash, priorSavedAt: prior.savedAt,
      planHash: prior.queryPlanHash ?? null, plannedQueries: prior.metadata.queryPack.plannedQueries?.map(q => ({ id: q.id, family: q.family, query: q.query })) ?? [],
      previouslyAttempted: prior.attemptedQueries, selectedCount: selectedBefore.length }));
    return;
  }
  if (!requestId || !/^[a-zA-Z0-9:_-]{8,160}$/.test(requestId)) throw new Error("REQUEST_ID_REQUIRED");
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  const llm = getConfiguredLlmProvider();
  let reviewCalls = 0, openAlexCalls = 0, crossrefCalls = 0;
  const guardedProvider = { generateStructuredObject: <T>(request: Parameters<typeof llm.generateStructuredObject>[0]): Promise<T> => {
    if (request.schemaName !== "candidate_semantic_review_v2" || ++reviewCalls > 2) throw new Error("PLANNER_OR_UNBOUNDED_REVIEW_FORBIDDEN");
    return llm.generateStructuredObject<T>(request);
  } };
  const actualFetch = global.fetch;
  const observations: Array<{ provider: string; query: string; page: number; status: number; resultCount: number | null; latencyMs: number }> = [];
  global.fetch = async (request, init) => {
    const url = new URL(typeof request === "string" ? request : request instanceof URL ? request : request.url);
    const openAlex = url.protocol === "https:" && url.hostname === "api.openalex.org" && url.pathname === "/works";
    const crossref = url.protocol === "https:" && url.hostname === "api.crossref.org" && url.pathname === "/works";
    const model = url.protocol === "https:" && url.hostname === "api.openai.com" && url.pathname === "/v1/responses";
    if (!openAlex && !crossref && !model || openAlex && ++openAlexCalls > 2 || crossref && ++crossrefCalls > 1 || model && reviewCalls === 0)
      throw new Error("ACCEPTANCE_NETWORK_BOUNDARY");
    const start = Date.now();
    const response = await actualFetch(request, { ...init, redirect: "error" });
    if (openAlex || crossref) {
      const body = response.ok ? await response.clone().json() as { results?: unknown[]; message?: { items?: unknown[] } } : null;
      observations.push({ provider: openAlex ? "OPENALEX" : "CROSSREF", query: openAlex ? url.searchParams.get("search") ?? "" : url.searchParams.get("query.bibliographic") ?? "",
        page: Number(url.searchParams.get("page") ?? 1), status: response.status,
        resultCount: body ? (openAlex ? body.results : body.message?.items)?.length ?? null : null, latencyMs: Date.now() - start });
    }
    return response;
  };
  try {
    const result = await withPaidOperation({ userId, projectId, requestId, purpose: "rc4-phase2c-more-acceptance", revision: searchIntentHash,
      inputs: { batchKind: "more", priorSavedAt: prior.savedAt, searchIntentHash } }, () => searchProjectReferencesV2(userId, projectId, input,
      { batchKind: "more" }, guardedProvider));
    const oldIds = new Set(prior.references.map(item => item.referenceId));
    const newIds = result.searchSnapshot.references.map(item => item.referenceId).filter(id => !oldIds.has(id));
    const selectedAfter = (await prisma.projectReference.findMany({ where: { projectId, selected: true }, select: { referenceId: true } }))
      .map(row => row.referenceId).sort();
    const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId, requestId } },
      select: { id: true, status: true, committedMicros: true, calls: { select: { model: true, actualModel: true, status: true, estimatedMicros: true, usageJson: true } } } });
    const references = await prisma.reference.findMany({ where: { id: { in: newIds } }, select: { id: true, title: true, year: true, doi: true, abstract: true } });
    console.log(JSON.stringify({ mode, projectId, searchIntentHash, priorRecommendations: prior.references.length,
      plannerCalls: 0, translationRecoveryCalls: 0, openAlexCalls, crossrefCalls, reviewCalls, observations,
      resultState: result.searchSnapshot.resultState, queryPlanHash: result.searchSnapshot.queryPlanHash,
      executedQueries: result.searchSnapshot.executedQueries, cacheHits: result.searchSnapshot.cacheHits,
      cacheMisses: result.searchSnapshot.cacheMisses, newRecommendations: references,
      totalRecommendations: result.searchSnapshot.references.length, selectedBefore, selectedAfter,
      selectionPreserved: JSON.stringify(selectedBefore) === JSON.stringify(selectedAfter), operation }));
  } finally { global.fetch = actualFetch; }
}
main().catch(error => { console.error(JSON.stringify({ status: "FAILED", category: error instanceof Error && /^[A-Z_]+$/.test(error.message)
  ? error.message : "ACCEPTANCE_FAILED_SEE_OPERATION" })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
