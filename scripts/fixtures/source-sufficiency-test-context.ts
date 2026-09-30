import { prisma } from "@/lib/prisma";
import { fingerprint } from "@/server/mvp/job-execution-context";
import { loadSearchInput, freezeSearchInput } from "@/server/retrieval/search-intent-service";
import { candidateMetadataHash } from "@/server/retrieval/candidate-review-policy";
import { SOURCE_SUFFICIENCY_POLICY } from "@/lib/source-sufficiency-policy";
/** Synthetic DB-test evidence. No provider execution or real project input. */
export async function fixtureSourceAssessments(userId: string, projectId: string, referenceIds: string[], exploratoryId?: string) {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/imx_b4_validation_rc4") throw new Error("ISOLATED_DB_REQUIRED");
  const input = await loadSearchInput(userId, projectId), inputTrace = await freezeSearchInput(userId, input);
  const rows = await prisma.reference.findMany({ where: { id: { in: referenceIds } } });
  const searchIntentHash = fingerprint(input.intent);
  await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "SEARCH_COMPLETED",
    payloadJson: { referenceSearchVersion: "v2", searchSnapshot: { referenceSearchVersion: "v2", savedAt: new Date().toISOString(), inputTrace: JSON.parse(JSON.stringify(inputTrace)),
      metadata: {}, references: [], candidateAdmissions: [] } } } });
  for (const row of rows) {
    const metadataHash = candidateMetadataHash({ candidateId: row.id, title: row.title, abstract: row.abstract, year: row.year });
    await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "VERIFIED_SOURCE_ASSESSMENT_V1", payloadJson: {
      referenceId: row.id, searchIntentHash, metadataHash, identityResolved: true, provenance: "isolated-synthetic-fixture",
      assessment: { candidateId: row.id, searchIntentHash, metadataHash, policyVersion: "candidate-semantic-review.v2",
        relevance: row.id === exploratoryId ? "PARTIALLY_RELEVANT" : "RELEVANT", role: "DIRECT", confidence: "HIGH", origin: "DETERMINISTIC",
        rationale: "Isolated test evidence", evidence: [{ field: "title", quote: row.title }], matchedIntentDimensions: ["topic"], mismatches: [] } } } });
  }
  await prisma.auditLog.create({ data: { userId, projectId, actorType: "SYSTEM", eventType: "SOURCE_SUFFICIENCY_COMPLETED",
    payloadJson: { searchIntentHash, fallbackExhausted: true, policyVersion: SOURCE_SUFFICIENCY_POLICY } } });
}
