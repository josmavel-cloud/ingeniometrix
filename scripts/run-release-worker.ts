import { setTimeout as delay } from "node:timers/promises";

import { claimAndRunNextBlueprintJob } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { writeWorkerHeartbeat } from "@/server/operations/worker-health";
import { runNextReferenceDisplayJob } from "@/server/retrieval/reference-display-jobs";

const once = process.argv.includes("--once");
const pollIntervalMs = Math.max(500, Number(process.env.BLUEPRINT_WORKER_POLL_MS ?? 2_000));
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function main() {
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  if (process.env.IMX_OPERATIONS_DIR) {
    heartbeat = setInterval(() => { void writeWorkerHeartbeat(stopping ? "STOPPING" : "RUNNING").catch(() => console.error("worker_heartbeat_write_failed")); }, 30_000);
    heartbeat.unref();
  }
  try {
  do {
    await writeWorkerHeartbeat("RUNNING");
    const result = await claimAndRunNextBlueprintJob();
    if (result) {
      process.stdout.write(`${JSON.stringify({ event: "blueprint_job_stage", result })}\n`);
    }
    const display = await runNextReferenceDisplayJob();
    if (display) process.stdout.write(`${JSON.stringify({ event: "reference_display_job", ...display })}\n`);
    if (once) break;
    if (!result && !display) { await writeWorkerHeartbeat("IDLE"); await delay(pollIntervalMs); }
  } while (!stopping);
  } finally { clearInterval(heartbeat); await writeWorkerHeartbeat("STOPPING"); }
}

main().catch((error) => {
  console.error("Release worker stopped unexpectedly.", error);
  process.exitCode = 1;
});
