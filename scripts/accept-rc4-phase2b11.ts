// Operator-only staging acceptance. Plan and provider execution are separate so
// a human/agent reviews the persisted plan before any scholarly request.
import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { loadSearchInput, freezeSearchInput } from "@/server/retrieval/search-intent-service";
import { buildSearchMetadata, searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; }));
  const { mode, projectId, userId, requestId, model, planOperationId } = args;
  const semanticReview = args.review === "1";
  const allowTranslationRecovery = args.allowRecovery === "1";
  if (new URL(process.env.DATABASE_URL!).pathname !== "/imx_g5_staging" || process.env.APP_ORIGIN !== "https://staging.ingeniometrix.com" || process.env.IMX_PAYMENT_MODE !== "sandbox" || process.env.IMX_ENABLE_DEEP_RESEARCH === "1") throw new Error("STAGING_ONLY");
  if (!["inspect", "plan", "search"].includes(mode) || !projectId || !userId) throw new Error("INVALID_ARGUMENTS");
  const input = await loadSearchInput(userId, projectId);
  const searchIntentHash = fingerprint(input.intent);
  if (mode === "inspect") {
    console.log(JSON.stringify({ input, plannerInput: semanticPlannerInput(input.intent, searchIntentHash), searchIntentHash }));
    return;
  }
  if (!requestId || (mode === "plan" && !["gpt-5.4-nano", "gpt-5.4-mini"].includes(model))) throw new Error("INVALID_ACCEPTANCE_REQUEST");
  // These process-local settings never alter app runtime or env files.
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  if (mode === "plan") process.env.SOURCE_DISCOVERY_PLAN_MODEL = model;
  const actualFetch = global.fetch;
  let calls = 0;
  let openAlexCalls = 0, modelCalls = 0;
  const requests: Array<{ query?: string; httpStatus: number; latencyMs: number; resultCount?: number }> = [];
  global.fetch = async (request, init) => {
    const url = new URL(typeof request === "string" ? request : request instanceof URL ? request : request.url);
    const isModel = url.protocol === "https:" && url.hostname === "api.openai.com" && url.pathname === "/v1/responses";
    const isOpenAlex = url.protocol === "https:" && url.hostname === "api.openalex.org" && url.pathname === "/works";
    const allowed = mode === "plan" ? isModel : isOpenAlex || semanticReview && isModel;
    if (!allowed || isModel && ++modelCalls > (mode === "plan" && allowTranslationRecovery ? 2 : 1) || isOpenAlex && ++openAlexCalls > 4) throw new Error("ACCEPTANCE_NETWORK_BOUNDARY");
    calls++;
    const started = Date.now();
    const response = await actualFetch(request, { ...init, redirect: "error" });
    const record = { httpStatus: response.status, latencyMs: Date.now() - started,
      ...(isOpenAlex ? { query: url.searchParams.get("search") ?? undefined, resultCount: ((await response.clone().json()) as { results?: unknown[] }).results?.length } : {}) };
    requests.push(record);
    return response;
  };
  const started = Date.now();
  const purpose = mode === "plan" ? "rc4-query-composition-plan" : "rc4-openalex-only-acceptance";
  const result = await withPaidOperation({ userId, projectId, requestId, purpose, revision: searchIntentHash,
    inputs: { mode, model: model ?? null, planOperationId: planOperationId ?? null, searchIntentHash,
      ...(semanticReview ? { semanticReview: true } : {}), ...(allowTranslationRecovery ? { allowTranslationRecovery: true } : {}) } }, async () => {
    if (mode === "plan") {
      const trace = await freezeSearchInput(userId, input);
      return { searchIntentHash, trace, metadata: await buildSearchMetadata(input) };
    }
    return searchProjectReferencesV2(userId, projectId, input, { openAlexOnlyAcceptance: { planOperationId, maxQueries: 4, semanticReview } });
  });
  const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId, requestId } },
    select: { id: true, status: true, committedMicros: true, boundBreached: true, calls: { select: { model: true, actualModel: true, status: true, reservedMicros: true, estimatedMicros: true, usageJson: true } } } });
  console.log(JSON.stringify({ mode, calls, openAlexCalls, modelCalls, requests, durationMs: Date.now() - started, operation, result }));
}
main().catch(error => {
  // Never print provider error bodies, URLs carrying credentials, or stacks.
  const safe = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ACCEPTANCE_FAILED_SEE_PAID_OPERATION";
  console.error(JSON.stringify({ status: "FAILED", category: safe })); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
