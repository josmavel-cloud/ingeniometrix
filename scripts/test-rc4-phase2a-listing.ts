import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { decideReferenceAdmission } from "@/server/retrieval/reference-admission";
import { listProjectReferences } from "@/server/retrieval/reference-service";
import { getLatestProjectReferenceSearchSnapshot, type ReferenceScoreBreakdown, type ProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";

if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) {
  throw new Error("Isolated validation database required");
}
global.fetch = async () => { throw new Error("NO_PROVIDER_OR_DOCUMENT_FETCH"); };

const positiveBreakdown: ReferenceScoreBreakdown = {
  label: "ALTO", necessaryMatches: ["feedback", "digital mathematics"], complementaryMatches: ["secondary school"],
  optionalMatches: [], recencyBand: "recent", recencyBonus: 0, matchedQuery: "feedback digital mathematics",
  matchedQueryStage: "necessary_only", coverageRatio: 1,
};
const negativeBreakdown: ReferenceScoreBreakdown = {
  label: "MINIMO", necessaryMatches: [], complementaryMatches: [], optionalMatches: [], recencyBand: "recent",
  recencyBonus: 2, matchedQuery: "feedback digital mathematics", matchedQueryStage: "optional_backup", coverageRatio: 0,
};

async function main() {
  const user = await prisma.user.create({ data: { email: `phase2a-${randomUUID()}@example.test` } });
  const referenceIds: string[] = [];
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Phase 2A isolated fixture", degreeLevel: "MAESTRIA" } });
    const positive = await prisma.reference.create({ data: {
      title: "Feedback in digital mathematics for secondary school",
      normalizedTitle: `positive-${randomUUID()}`, authorsJson: [], abstract: "A study of feedback in digital mathematics education.",
      rawOpenAlexJson: { language: "en" },
    } });
    const negative = await prisma.reference.create({ data: {
      title: "Antirabies vaccine response in domestic animals", normalizedTitle: `negative-${randomUUID()}`,
      authorsJson: [], abstract: "Veterinary vaccine study.", rawOpenAlexJson: { language: "en" },
    } });
    referenceIds.push(positive.id, negative.id);
    for (const reference of [positive, negative]) {
      await prisma.projectReference.create({ data: { projectId: project.id, referenceId: reference.id, sourceProvider: Provider.OPENALEX,
        relevanceScore: reference.id === positive.id ? 70 : 0, selected: reference.id === negative.id,
        selectedOrder: reference.id === negative.id ? 1 : null } });
    }
    const snapshot = {
      referenceSearchVersion: "v2", savedAt: new Date().toISOString(), searchQuery: "feedback digital mathematics",
      attemptedQueries: [], totalResults: 2, providerBreakdown: { openAlex: 2, crossref: 0 },
      baseSelectedReferenceIds: [negative.id],
      metadata: { planSource: "fallback", normalizedTopic: "feedback digital mathematics", intentSummary: "feedback digital mathematics",
        keywordGroups: { necessary: [], complementary: [], optional: [] }, queryPack: { necessaryOnly: [], complementaryBoosted: [], optionalBackups: [] },
        focusTerms: [], scoringRules: [] },
      references: [
        { referenceId: positive.id, relevanceScore: 70, scoreBreakdown: positiveBreakdown, suggestedSelectedOrder: null },
        { referenceId: negative.id, relevanceScore: 0, scoreBreakdown: negativeBreakdown, suggestedSelectedOrder: null },
      ],
    } satisfies ProjectReferenceSearchSnapshot;
    const audit = await prisma.auditLog.create({ data: { userId: user.id, projectId: project.id, eventType: "SEARCH_COMPLETED",
      actorType: "SYSTEM", payloadJson: { referenceSearchVersion: "v2", searchSnapshot: snapshot } } });
    const originalAudit = JSON.stringify(audit.payloadJson);
    const listed = await listProjectReferences(user.id, project.id, { languageOverride: "es" });
    assert.equal(listed.length, 2);
    assert.equal(listed.find((item) => item.reference.id === positive.id)?.recommendationState, "RECOMMENDED");
    assert.equal(listed.find((item) => item.reference.id === negative.id)?.recommendationState, "SELECTED");
    assert.equal(listed.find((item) => item.reference.id === negative.id)?.admission.state, "REJECTED_OFF_TOPIC");
    assert.equal(listed.find((item) => item.reference.id === negative.id)?.selected, true);
    assert.equal((await getLatestProjectReferenceSearchSnapshot(project.id))?.references.length, 2);
    const persistedAudit = await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } });
    assert.equal(JSON.stringify(persistedAudit.payloadJson), originalAudit);
    const persistedLinks = await prisma.projectReference.findMany({ where: { projectId: project.id } });
    assert.equal(persistedLinks.find((item) => item.referenceId === negative.id)?.selected, true);
    assert.equal(decideReferenceAdmission({ title: negative.title, abstract: negative.abstract, score: 0, breakdown: negativeBreakdown }).state, "REJECTED_OFF_TOPIC");
    console.log("PASS Phase 2A listing: legacy snapshot filtered contextually, manual selection and audit unchanged, no provider/LLM/document calls");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.reference.deleteMany({ where: { id: { in: referenceIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
