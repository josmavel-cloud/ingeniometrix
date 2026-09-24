import { readFile, statfs } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
// Operator-local command, never a public metrics endpoint. No provider calls.
async function main() {
  const root = process.env.IMX_OPERATIONS_DIR || "artifacts-local/operations";
  const now = Date.now();
  const age = async (name: string) => { try { const data = JSON.parse(await readFile(path.join(root, name), "utf8")); return Math.round((now - Date.parse(data.at)) / 1000); } catch { return null; } };
  const groups = await prisma.blueprintJob.groupBy({ by: ["status"], _count: true });
  const since = new Date(now - 86400000);
  const authFailures = await prisma.auditLog.count({ where: { createdAt: { gt: since }, eventType: "LOGIN_FAILURE" } });
  const paymentEvents = await prisma.paymentEvent.groupBy({ by: ["status"], where: { createdAt: { gt: since } }, _count: true });
  // Signature failures never create commercial PaymentEvent rows. Do not present
  // their absence as zero failures; those counters need the structured log sink.
  const durations = await prisma.$queryRaw<Array<{ count: bigint; meanSeconds: number | null; maxSeconds: number | null }>>`
    SELECT count(*) AS count, avg(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")))::float8 AS "meanSeconds",
    max(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")))::float8 AS "maxSeconds"
    FROM "BlueprintJob" WHERE "completedAt" > ${since} AND "startedAt" IS NOT NULL`;
  const costs = await prisma.$queryRaw<Array<{ calls: bigint; unknownCalls: bigint; knownEstimatedUsd: number; committedUsd: number }>>`
    SELECT count(*) AS calls,
      count(*) FILTER (WHERE entry->>'estimate' IS NULL) AS "unknownCalls",
      coalesce(sum((entry->>'estimate')::numeric), 0)::float8 AS "knownEstimatedUsd",
      coalesce(sum(coalesce((entry->>'estimate')::numeric, (entry->>'maximum')::numeric)), 0)::float8 AS "committedUsd"
    FROM "BlueprintJobStage", LATERAL jsonb_array_elements("outputJson"->'entries') AS entry
    WHERE "stageKey" = 'control:cost'`;
  const disk = await statfs(root);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), database: "ok", workerHeartbeatAgeSeconds: await age("worker.json"), backupAgeSeconds: await age("backup.json"),
    diskAvailableBytes: Number(disk.bavail) * Number(disk.bsize), jobs: groups, authFailures24h: authFailures,
    paymentEventStates24h: paymentEvents, webhookSignatureFailures24h: "UNKNOWN_USE_STRUCTURED_LOGS",
    generationDuration24h: durations[0], lifetimeJobCost: costs[0] }, (_, value) => typeof value === "bigint" ? Number(value) : value));
}
main().catch(() => { console.error("OPERATIONS_HEALTH_UNAVAILABLE"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
