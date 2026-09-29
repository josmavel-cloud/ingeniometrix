import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpenAlexRequestError } from "@/server/retrieval/openalex-client";
import { recoverHistoricalFailedSearch, settleFailedSearch } from "@/server/retrieval/search-failure-state";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated test database required");
  global.fetch = async () => { throw new Error("NO_PROVIDER_CALLS"); };
  const user = await prisma.user.create({ data: { email: `openalex-state-${randomUUID()}@example.test` } });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, title: "Retryable source search", degreeLevel: "MAESTRIA" } });
    const searching = await prisma.project.update({ where: { id: project.id }, data: { status: ProjectStatus.SEARCHING } });
    await settleFailedSearch({ userId: user.id, projectId: project.id, searchingUpdatedAt: searching.updatedAt,
      error: new OpenAlexRequestError("OPENALEX_RATE_LIMIT_BURST", 429, { limit: null, remaining: null, resetSeconds: 2 }),
      searchIntentHash: "test-hash", attemptedQueries: ['("seismic response") AND ("masonry")'] });
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status, ProjectStatus.INTAKE_READY);
    const failure = await prisma.auditLog.findFirstOrThrow({ where: { projectId: project.id, eventType: "SEARCH_FAILED_RETRYABLE" } });
    assert.equal((failure.payloadJson as { failureCode: string }).failureCode, "OPENALEX_RATE_LIMIT_BURST");
    assert.ok(!JSON.stringify(failure.payloadJson).includes("api_key"));
    await settleFailedSearch({ userId: user.id, projectId: project.id, searchingUpdatedAt: searching.updatedAt,
      error: new Error("stale"), searchIntentHash: "test-hash", attemptedQueries: [] });
    assert.equal(await prisma.auditLog.count({ where: { projectId: project.id, eventType: "SEARCH_FAILED_RETRYABLE" } }), 1);
    const old = await prisma.paidOperation.create({ data: { userId: user.id, projectId: project.id,
      requestId: randomUUID(), purpose: "rc4-openalex-only-acceptance", revision: "test-hash",
      inputFingerprint: "test-hash", hardCapMicros: 1000, status: "FAILED" } });
    await prisma.project.update({ where: { id: project.id }, data: { status: ProjectStatus.SEARCHING } });
    assert.deepEqual(await recoverHistoricalFailedSearch({ userId: user.id, projectId: project.id,
      failedOperationId: old.id }), { recovered: true, status: ProjectStatus.INTAKE_READY });
    assert.deepEqual(await recoverHistoricalFailedSearch({ userId: user.id, projectId: project.id,
      failedOperationId: old.id }), { recovered: false, status: ProjectStatus.INTAKE_READY });
    assert.equal(await prisma.auditLog.count({ where: { projectId: project.id, eventType: "SEARCH_FAILED_RECOVERED" } }), 1);
    await assert.rejects(recoverHistoricalFailedSearch({ userId: randomUUID(), projectId: project.id,
      failedOperationId: old.id }), /FAILED_SEARCH_OPERATION_NOT_FOUND/);
    console.log("PASS retryable provider failure, fenced status recovery, immutable failed operation, idempotence and ownership; provider calls=0");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
