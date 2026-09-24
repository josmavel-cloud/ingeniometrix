import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateMonitorResponses, runStagingMonitor } from "./g5-staging-monitor.mjs";

const nowMs = Date.parse("2026-09-24T16:00:00.000Z");
const fresh = new Date(nowMs - 60_000).toISOString();
const healthy = {
  nowMs,
  worker: { at: fresh, state: "IDLE" },
  backup: { at: fresh, status: "SUCCESS" },
  disk: { bavail: 20, blocks: 100, bsize: 4096 },
};

const { evaluateOperationalHealth, isMonitoringAuthorized } = await import("../server/operations/operational-health.ts");
assert.deepEqual(evaluateOperationalHealth(healthy), {
  status: "healthy", workerHeartbeat: "healthy", backupAge: "healthy", storage: "healthy",
});
assert.equal(evaluateOperationalHealth({
  ...healthy,
  backup: { at: new Date(nowMs - 27 * 60 * 60 * 1000).toISOString(), status: "SUCCESS" },
}).backupAge, "stale", "stale backup fixture is detected");
assert.equal(evaluateOperationalHealth({
  ...healthy,
  worker: { at: new Date(nowMs - 121_000).toISOString(), state: "IDLE" },
}).workerHeartbeat, "stale", "stale worker fixture is detected");
assert.equal(evaluateOperationalHealth({ ...healthy, worker: null }).workerHeartbeat, "unknown");
assert.equal(evaluateOperationalHealth({ ...healthy, disk: { bavail: 10, blocks: 100, bsize: 4096 } }).storage, "low");

const token = "a".repeat(48);
assert.equal(isMonitoringAuthorized(`Bearer ${token}`, token), true);
assert.equal(isMonitoringAuthorized(`Bearer ${"b".repeat(48)}`, token), false);
assert.equal(isMonitoringAuthorized(`Bearer ${token}`, undefined), false);

const good = { web: { status: 200 }, readiness: { status: 200, body: { status: "ready" } }, operational: { status: 200, body: { status: "healthy", workerHeartbeat: "healthy", backupAge: "healthy", storage: "healthy" } } };
assert.equal(evaluateMonitorResponses(good).healthy, true, "healthy external state is detected");
assert.deepEqual(evaluateMonitorResponses({ ...good, web: { status: 503 } }).failures, ["staging_web"], "outage is detected");
assert.equal(evaluateMonitorResponses(good).healthy, true, "recovery is detected");
assert.equal(evaluateMonitorResponses({ ...good, operational: { status: 503, body: { status: "degraded", workerHeartbeat: "stale", backupAge: "healthy", storage: "healthy" } } }).healthy, false);

const observed = [];
const run = async (phase) => runStagingMonitor({
  token,
  web: "https://web.invalid",
  backend: "https://api.invalid",
  fetchJson: async (url) => {
    observed.push(url);
    if (url === "https://web.invalid") return { status: phase === "outage" ? 503 : 200, body: null };
    if (url.endsWith("/ready")) return { status: 200, body: { status: "ready" } };
    return { status: 200, body: good.operational.body };
  },
});
assert.equal((await run("healthy")).assessment.healthy, true);
assert.equal((await run("outage")).assessment.healthy, false);
assert.equal((await run("recovery")).assessment.healthy, true);
assert.equal(observed.length, 9);

const testRoot = await mkdtemp(join(tmpdir(), "imx-g5-health-"));
const operationsRoot = join(testRoot, "operations");
const testToken = "test-only-monitor-token-".padEnd(48, "x");
const previous = {
  token: process.env.IMX_MONITORING_TOKEN,
  operations: process.env.IMX_OPERATIONS_DIR,
  storage: process.env.IMX_PRIVATE_STORAGE_ROOT,
};
try {
  await mkdir(operationsRoot, { mode: 0o700 });
  process.env.IMX_MONITORING_TOKEN = testToken;
  process.env.IMX_OPERATIONS_DIR = operationsRoot;
  process.env.IMX_PRIVATE_STORAGE_ROOT = testRoot;
  const { GET } = await import("../app/api/health/operational/route.ts");
  const request = (authorization) => new Request("http://localhost/api/health/operational", {
    headers: authorization ? { authorization } : {},
  });

  const runtimeNow = Date.now();
  const runtimeWorker = { at: new Date(runtimeNow - 60_000).toISOString(), state: "IDLE" };
  const runtimeBackup = { at: new Date(runtimeNow - 60_000).toISOString(), status: "SUCCESS" };
  await writeFile(join(operationsRoot, "worker.json"), JSON.stringify(runtimeWorker));
  await writeFile(join(operationsRoot, "backup.json"), JSON.stringify(runtimeBackup));
  assert.equal((await GET(request(null))).status, 401, "missing token is rejected");
  const authorized = await GET(request(`Bearer ${testToken}`));
  assert.equal(authorized.status, 200, "authorized healthy route responds successfully");
  assert.deepEqual(await authorized.json(), {
    status: "healthy", workerHeartbeat: "healthy", backupAge: "healthy", storage: "healthy",
  });

  await writeFile(join(operationsRoot, "backup.json"), JSON.stringify({
    at: new Date(runtimeNow - 27 * 60 * 60 * 1000).toISOString(), status: "SUCCESS",
  }));
  const staleBackup = await GET(request(`Bearer ${testToken}`));
  assert.equal(staleBackup.status, 503, "stale backup makes the aggregate unhealthy");
  assert.equal((await staleBackup.json()).backupAge, "stale");

  await writeFile(join(operationsRoot, "backup.json"), JSON.stringify(runtimeBackup));
  await writeFile(join(operationsRoot, "worker.json"), JSON.stringify({
    at: new Date(runtimeNow - 121_000).toISOString(), state: "IDLE",
  }));
  const staleWorker = await GET(request(`Bearer ${testToken}`));
  assert.equal(staleWorker.status, 503, "stale worker makes the aggregate unhealthy");
  assert.equal((await staleWorker.json()).workerHeartbeat, "stale");
} finally {
  if (previous.token === undefined) delete process.env.IMX_MONITORING_TOKEN;
  else process.env.IMX_MONITORING_TOKEN = previous.token;
  if (previous.operations === undefined) delete process.env.IMX_OPERATIONS_DIR;
  else process.env.IMX_OPERATIONS_DIR = previous.operations;
  if (previous.storage === undefined) delete process.env.IMX_PRIVATE_STORAGE_ROOT;
  else process.env.IMX_PRIVATE_STORAGE_ROOT = previous.storage;
  await rm(testRoot, { recursive: true, force: true });
}
console.log("G5 operational-health tests passed");
