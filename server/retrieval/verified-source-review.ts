import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { semanticPlannerInput } from "@/lib/retrieval-semantic-plan";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { withPaidOperation } from "@/server/mvp/pre-job-budget";
import { loadSearchInput } from "./search-intent-service";
import { getLatestProjectReferenceSearchSnapshot } from "./reference-search-v2";
import { reviewCandidateBatch } from "./candidate-semantic-review";
import { candidateMetadataHash, type CandidateAssessment } from "./candidate-review-policy";

export const SOURCE_ASSESSMENT_EVENT = "VERIFIED_SOURCE_ASSESSMENT_V1";
export type VerifiedSourceAssessment = { referenceId: string; searchIntentHash: string; assessment: CandidateAssessment;
  identityResolved: true; provenance: string; metadataHash: string };
/** Called only after provider/document identity checks, never with browser metadata. */
export async function reviewVerifiedSource(userId: string, projectId: string, referenceId: string, provenance: string) {
  const search = await loadSearchInput(userId, projectId), intentHash = fingerprint(search.intent);
  const snapshot = await getLatestProjectReferenceSearchSnapshot(projectId);
  if (!snapshot || snapshot.stale || snapshot.inputTrace?.searchIntentHash !== intentHash || !snapshot.metadata.queryPack.conceptPlan) return null;
  const link = await prisma.projectReference.findUnique({ where: { projectId_referenceId: { projectId, referenceId } }, include: { reference: true } });
  if (!link) return null;
  const ref = link.reference;
  const candidate = { candidateId: referenceId, title: ref.title, abstract: ref.abstract, year: ref.year,
    authors: Array.isArray(ref.authorsJson) ? ref.authorsJson.filter((a): a is string => typeof a === "string") : [], venue: ref.venue, workType: ref.workType };
  const metadataHash = candidateMetadataHash(candidate);
  return withPaidOperation({ userId, projectId, requestId: `source-review:${fingerprint({ projectId, intentHash, referenceId, metadataHash })}`,
    purpose: "VERIFIED_SOURCE_REVIEW", revision: intentHash, inputs: { referenceId, metadataHash, provenance } }, async () => {
    const review = await reviewCandidateBatch(semanticPlannerInput(search.intent, intentHash), snapshot.metadata.queryPack.conceptPlan!,
      [candidate], getConfiguredLlmProvider(), snapshot.metadata.enrichment?.explicitExclusions);
    const assessment = review.assessments.get(referenceId);
    if (!assessment || fingerprint((await loadSearchInput(userId, projectId)).intent) !== intentHash) return null;
    const payload: VerifiedSourceAssessment = { referenceId, searchIntentHash: intentHash, assessment, identityResolved: true, provenance, metadataHash };
    await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: SOURCE_ASSESSMENT_EVENT,
      payloadJson: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue } });
    return payload;
  });
}
export function currentSourceAssessment(payload: VerifiedSourceAssessment, reference: { title: string; abstract: string | null; year: number | null }, intentHash: string | undefined) {
  return payload.searchIntentHash === intentHash && payload.metadataHash === candidateMetadataHash({
    candidateId: payload.referenceId, ...reference }) && payload.identityResolved === true ? payload.assessment : null;
}
