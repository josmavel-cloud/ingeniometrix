// Operator-only review of persisted 2C candidates. Never invokes retrieval.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { prepareCandidateReview, type ReviewCandidate } from "@/server/retrieval/candidate-review-policy";
import { reviewCandidateBatch } from "@/server/retrieval/candidate-semantic-review";

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const i = arg.indexOf("="); return [arg.slice(0, i), arg.slice(i + 1)];
  }));
  const { mode, projectId, userId, requestId } = args;
  if (!projectId || !userId || !["inspect", "review"].includes(mode) ||
      new URL(process.env.DATABASE_URL!).pathname !== "/imx_g5_staging" ||
      process.env.APP_ORIGIN !== "https://staging.ingeniometrix.com" ||
      process.env.IMX_PAYMENT_MODE !== "sandbox" || process.env.IMX_ENABLE_DEEP_RESEARCH === "1") throw new Error("STAGING_ONLY");
  const input = await loadSearchInput(userId, projectId);
  const hash = fingerprint(input.intent);
  const current = await getLatestProjectReferenceSearchSnapshot(projectId);
  if (!current || current.inputTrace?.searchIntentHash !== hash || current.stale || current.batchKind !== "more" ||
      current.semanticReview?.status !== "DEGRADED") throw new Error("FAILED_2C_SNAPSHOT_UNAVAILABLE");
  const audits = await prisma.auditLog.findMany({ where: { projectId, eventType: "SEARCH_COMPLETED" }, orderBy: { createdAt: "desc" }, take: 2 });
  const earlier = (audits[1]?.payloadJson as { searchSnapshot?: typeof current } | null)?.searchSnapshot;
  if (!earlier || earlier.inputTrace?.searchIntentHash !== hash) throw new Error("PRIOR_ACCEPTED_SNAPSHOT_UNAVAILABLE");
  const addedReferenceIds = current.references.map(row => row.referenceId)
    .filter(id => !earlier.references.some(row => row.referenceId === id));
  if (addedReferenceIds.length !== 5) throw new Error("OWNER_REVIEWED_SHORTLIST_CHANGED");
  const references = await prisma.reference.findMany({ where: { id: { in: addedReferenceIds } },
    select: { id: true, title: true, abstract: true, year: true, authorsJson: true, venue: true, doi: true } });
  const newAdmissions = current.candidateAdmissions?.filter(row => !earlier.candidateAdmissions?.some(old => old.candidateKey === row.candidateKey)) ?? [];
  const five = references.map(ref => {
    const match = newAdmissions.find(row => row.doi && row.doi.toLowerCase() === ref.doi?.toLowerCase());
    if (!match) throw new Error("NEW_RECOMMENDATION_IDENTITY_MISSING");
    return { candidateId: match.candidateKey, title: ref.title, abstract: ref.abstract, year: ref.year,
      authors: Array.isArray(ref.authorsJson) ? ref.authorsJson.filter((value): value is string => typeof value === "string") : [], venue: ref.venue } satisfies ReviewCandidate;
  });
  const remaining = (earlier.candidateAdmissions ?? []).filter(row => row.inspectionMetadata?.abstract && row.title &&
    row.admission.state !== "REJECTED_OFF_TOPIC" && !five.some(item => item.candidateId === row.candidateKey))
    .sort((a, b) => Number(b.admission.state === "NEEDS_INSPECTION") - Number(a.admission.state === "NEEDS_INSPECTION") ||
      b.relevanceScore - a.relevanceScore || a.candidateKey.localeCompare(b.candidateKey))
    .slice(0, 25).map(row => ({ candidateId: row.candidateKey, title: row.title, abstract: row.inspectionMetadata!.abstract,
      year: row.year, authors: row.inspectionMetadata!.authors, venue: row.inspectionMetadata!.venue } satisfies ReviewCandidate));
  const candidates = [...five, ...remaining];
  const plan = current.metadata.enrichment?.scientificConceptPlan;
  if (!plan) throw new Error("ACCEPTED_CONCEPT_PLAN_UNAVAILABLE");
  const forced = new Set(five.map(item => item.candidateId));
  const prepared = prepareCandidateReview(candidates, plan, current.metadata.enrichment?.explicitExclusions, forced);
  if (prepared.batches.length !== 1 || prepared.batch.length > 30 || five.some(item => !prepared.batch.some(row => row.candidateId === item.candidateId && row.reviewTask === "RELEVANCE_AND_ROLE")))
    throw new Error("REVIEW_BATCH_POLICY_INVALID");
  await access("/app/artifacts-local/llm-usage", constants.W_OK);
  if (mode === "inspect") {
    console.log(JSON.stringify({ mode, searchIntentHash: hash, candidates: candidates.length, requested: prepared.batch.length,
      newRecommendations: five.map(item => ({ candidateId: item.candidateId, title: item.title, abstractAvailable: Boolean(item.abstract) })),
      priorFailure: current.semanticReview?.failureCategory, writableUsageRegistry: true, providerCalls: 0 }));
    return;
  }
  if (!requestId || !/^[a-zA-Z0-9:_-]{8,160}$/.test(requestId)) throw new Error("REQUEST_ID_REQUIRED");
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  const actualFetch = global.fetch;
  let modelCalls = 0;
  global.fetch = async (request, init) => {
    const url = new URL(typeof request === "string" ? request : request instanceof URL ? request : request.url);
    if (url.protocol !== "https:" || url.hostname !== "api.openai.com" || url.pathname !== "/v1/responses" || ++modelCalls > 1)
      throw new Error("REVIEW_ONLY_NETWORK_BOUNDARY");
    return actualFetch(request, { ...init, redirect: "error" });
  };
  try {
    const result = await withPaidOperation({ userId, projectId, requestId,
      purpose: "rc4-phase2c-review-only-acceptance", revision: hash,
      inputs: { candidateIds: prepared.batch.map(row => row.candidateId), searchIntentHash: hash } }, async () => {
      const review = await reviewCandidateBatch(semanticPlannerInput(input.intent, hash), plan, candidates,
        { generateStructuredObject: request => {
          if (request.schemaName !== "candidate_semantic_review_v2") throw new Error("REVIEW_SCHEMA_FORBIDDEN");
          return getConfiguredLlmProvider().generateStructuredObject(request);
        } }, current.metadata.enrichment?.explicitExclusions, forced);
      return { trace: review.trace, assessments: [...review.assessments.values()].filter(item =>
        prepared.batch.some(row => row.candidateId === item.candidateId)).map(item => ({ candidateId: item.candidateId,
          relevance: item.relevance, role: item.role, confidence: item.confidence, origin: item.origin,
          rationale: item.rationale, supportingEvidenceIds: item.supportingEvidenceIds ?? [],
          mismatchEvidenceIds: item.mismatchEvidenceIds ?? [] })) };
    });
    const operation = await prisma.paidOperation.findUniqueOrThrow({ where: { userId_requestId: { userId, requestId } },
      select: { id: true, status: true, committedMicros: true, calls: { select: { model: true, actualModel: true, status: true,
        estimatedMicros: true, usageJson: true, createdAt: true, completedAt: true } } } });
    console.log(JSON.stringify({ mode, modelCalls, operation, trace: result.trace,
      five: five.map(item => ({ title: item.title, review: result.assessments.find(row => row.candidateId === item.candidateId) ?? null })),
      classifications: result.assessments.reduce((out, item) => { out[item.relevance] = (out[item.relevance] ?? 0) + 1; return out; }, {} as Record<string, number>),
      roles: result.assessments.reduce((out, item) => { out[item.role] = (out[item.role] ?? 0) + 1; return out; }, {} as Record<string, number>) }));
  } finally { global.fetch = actualFetch; }
}
main().catch(error => { console.error(JSON.stringify({ status: "FAILED", category: error instanceof Error && /^[A-Z_]+$/.test(error.message)
  ? error.message : "REVIEW_ACCEPTANCE_FAILED_SEE_OPERATION" })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
