import { prisma } from "@/lib/prisma";
import { generationCostReport } from "@/server/mvp/generation-cost-report";

const jobId = process.argv[2];
if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("Provide a BlueprintJob UUID");
const row = await prisma.blueprintJobStage.findUnique({ where: { jobId_stageKey: { jobId, stageKey: "control:cost" } }, select: { outputJson: true } });
if (!row) throw new Error("No persisted cost record for this job");
const checkpoints = await prisma.blueprintJobStage.findMany({ where: { jobId, stageKey: { startsWith: "checkpoint:DESIGN_MINI_RESEARCH_" } }, select: { outputJson: true } });
const operationIds = [...new Set(checkpoints.map(item => (item.outputJson as { value?: { operation?: { operationId?: string } } } | null)?.value?.operation?.operationId).filter((id): id is string => Boolean(id)))];
const calls = operationIds.length ? await prisma.paidOperationCall.findMany({ where: { operationId: { in: operationIds } }, select: { operationId: true, estimatedMicros: true, reservedMicros: true, usageJson: true } }) : [];
const miniOperations = operationIds.map(operationId => {
  const rows = calls.filter(call => call.operationId === operationId);
  const usage = rows.find(call => call.usageJson)?.usageJson as { inputTokens?: number; outputTokens?: number; reasoningTokens?: number } | null;
  return { operationId, estimatedCostUsd: rows.every(call => call.estimatedMicros !== null) ? rows.reduce((sum, call) => sum + (call.estimatedMicros ?? 0), 0) / 1_000_000 : null,
    reservedCostUsd: rows.reduce((sum, call) => sum + call.reservedMicros, 0) / 1_000_000, usage };
});
console.log(JSON.stringify({ jobId, ...generationCostReport(row.outputJson as Parameters<typeof generationCostReport>[0], miniOperations) }, null, 2));
await prisma.$disconnect();
