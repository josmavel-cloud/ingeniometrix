import { readFile, statfs } from "node:fs/promises";
import path from "node:path";
import { evaluateOperationalHealth, isMonitoringAuthorized } from "@/server/operations/operational-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readRecord<T>(file: string): Promise<T | null> {
  try {
    const contents = await readFile(file, "utf8");
    if (contents.length > 4096) return null;
    return JSON.parse(contents) as T;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isMonitoringAuthorized(request.headers.get("authorization"), process.env.IMX_MONITORING_TOKEN)) {
    return Response.json({ status: "unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store", Vary: "Authorization" },
    });
  }

  const operationsRoot = process.env.IMX_OPERATIONS_DIR || "artifacts-local/operations";
  const storageRoot = process.env.IMX_PRIVATE_STORAGE_ROOT || "artifacts-local";
  const [worker, backup, disk] = await Promise.all([
    readRecord<{ at?: unknown; state?: unknown }>(path.join(operationsRoot, "worker.json")),
    readRecord<{ at?: unknown; status?: unknown }>(path.join(operationsRoot, "backup.json")),
    statfs(storageRoot).catch(() => null),
  ]);

  const health = evaluateOperationalHealth({
    nowMs: Date.now(),
    worker,
    backup,
    disk: disk ? { bavail: disk.bavail, blocks: disk.blocks, bsize: disk.bsize } : null,
  });

  return Response.json(health, {
    status: health.status === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store", Vary: "Authorization" },
  });
}
