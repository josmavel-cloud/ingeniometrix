import { timingSafeEqual } from "node:crypto";

export type OperationalState = "healthy" | "stale" | "unknown";

export type OperationalHealth = {
  status: "healthy" | "degraded";
  workerHeartbeat: OperationalState;
  backupAge: OperationalState;
  storage: "healthy" | "low" | "unknown";
};

type HeartbeatRecord = { at?: unknown; state?: unknown } | null;
type BackupRecord = { at?: unknown; status?: unknown } | null;
type DiskStats = { bavail: number; blocks: number; bsize: number } | null;

const WORKER_MAX_AGE_MS = 120_000;
const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1_000;
const MIN_FREE_DISK_RATIO = 0.15;

function ageIsFresh(at: unknown, nowMs: number, maxAgeMs: number): boolean {
  if (typeof at !== "string") return false;
  const timestamp = Date.parse(at);
  const age = nowMs - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= maxAgeMs;
}

export function evaluateOperationalHealth(input: {
  nowMs: number;
  worker: HeartbeatRecord;
  backup: BackupRecord;
  disk: DiskStats;
}): OperationalHealth {
  const workerHeartbeat: OperationalState =
    input.worker &&
    (input.worker.state === "IDLE" || input.worker.state === "RUNNING") &&
    ageIsFresh(input.worker.at, input.nowMs, WORKER_MAX_AGE_MS)
      ? "healthy"
      : input.worker
        ? "stale"
        : "unknown";

  const backupAge: OperationalState =
    input.backup?.status === "SUCCESS" &&
    ageIsFresh(input.backup.at, input.nowMs, BACKUP_MAX_AGE_MS)
      ? "healthy"
      : input.backup
        ? "stale"
        : "unknown";

  let storage: OperationalHealth["storage"] = "unknown";
  if (
    input.disk &&
    Number.isFinite(input.disk.bavail) &&
    Number.isFinite(input.disk.blocks) &&
    Number.isFinite(input.disk.bsize) &&
    input.disk.blocks > 0 &&
    input.disk.bsize > 0
  ) {
    storage = input.disk.bavail / input.disk.blocks >= MIN_FREE_DISK_RATIO ? "healthy" : "low";
  }

  const status =
    workerHeartbeat === "healthy" && backupAge === "healthy" && storage === "healthy"
      ? "healthy"
      : "degraded";

  return { status, workerHeartbeat, backupAge, storage };
}

export function isMonitoringAuthorized(authorization: string | null, expectedToken: string | undefined): boolean {
  if (!expectedToken || expectedToken.length < 32 || !authorization) return false;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return false;
  const presented = Buffer.from(match[1]);
  const expected = Buffer.from(expectedToken);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
