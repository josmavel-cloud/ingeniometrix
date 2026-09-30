import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const webUrl = process.env.STAGING_WEB_URL || "https://staging.ingeniometrix.com/";
const backendOrigin = process.env.STAGING_BACKEND_ORIGIN || "https://pepe-thinkpad-t470s.tailbcdf27.ts.net:10000";

export function evaluateMonitorResponses({ web, readiness, operational }) {
  const failures = [];
  if (!web || web.status < 200 || web.status >= 400) failures.push("staging_web");
  if (!readiness || readiness.status !== 200 || readiness.body?.status !== "ready") failures.push("backend_readiness");
  if (!operational || operational.status !== 200 || operational.body?.status !== "healthy") failures.push("operational_health");
  for (const key of ["workerHeartbeat", "backupAge", "storage"]) {
    if (operational?.body?.[key] !== "healthy") failures.push(key);
  }
  return { healthy: failures.length === 0, failures };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  let body = null;
  try { body = await response.json(); } catch { /* status is still reported safely */ }
  return { status: response.status, body };
}

export async function runStagingMonitor({ token, fetchJson = getJson, web = webUrl, backend = backendOrigin }) {
  const [webResult, readiness, operational] = await Promise.all([
    fetchJson(web),
    fetchJson(`${backend}/api/health/ready`),
    fetchJson(`${backend}/api/health/operational`, { Authorization: `Bearer ${token || ""}` }),
  ]);
  return {
    results: { web: webResult.status, readiness: readiness.status, operational: operational.status },
    assessment: evaluateMonitorResponses({ web: webResult, readiness, operational }),
    operational: operational.body,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runStagingMonitor({ token: process.env.STAGING_MONITOR_TOKEN });
  console.log(JSON.stringify({
    http: result.results,
    operational: result.operational
      ? {
          status: result.operational.status,
          workerHeartbeat: result.operational.workerHeartbeat,
          backupAge: result.operational.backupAge,
          storage: result.operational.storage,
        }
      : null,
  }));
  if (!result.assessment.healthy) {
    console.error(`Staging health check failed: ${result.assessment.failures.join(",")}`);
    process.exitCode = 1;
  }
}
