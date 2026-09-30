import { runStagingMonitor } from "./g5-staging-monitor.mjs";

const web = process.env.PRODUCTION_WEB_URL;
const backend = process.env.PRODUCTION_BACKEND_ORIGIN;
const token = process.env.PRODUCTION_MONITOR_TOKEN;
if (!web || !backend || !token) throw new Error("PRODUCTION_MONITOR_CONFIGURATION_MISSING");
for (const origin of [web, backend]) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin.replace(/\/$/, "")) {
    throw new Error("PRODUCTION_MONITOR_HTTPS_REQUIRED");
  }
}
const result = await runStagingMonitor({ token, web, backend });
console.log(JSON.stringify({ http: result.results, states: result.operational ? {
  status: result.operational.status, workerHeartbeat: result.operational.workerHeartbeat,
  backupAge: result.operational.backupAge, storage: result.operational.storage,
} : null }));
if (!result.assessment.healthy) {
  console.error(`Production monitor failed: ${result.assessment.failures.join(",")}`);
  process.exitCode = 1;
}
