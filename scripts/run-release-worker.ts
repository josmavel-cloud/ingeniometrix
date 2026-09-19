import { setTimeout as delay } from "node:timers/promises";

import { claimAndRunNextBlueprintJob } from "@/server/blueprint-v2/jobs/blueprint-job-service";

const once = process.argv.includes("--once");
const pollIntervalMs = Math.max(500, Number(process.env.BLUEPRINT_WORKER_POLL_MS ?? 2_000));
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

async function main() {
  do {
    const result = await claimAndRunNextBlueprintJob();
    if (result) {
      process.stdout.write(`${JSON.stringify({ event: "blueprint_job_stage", result })}\n`);
    }
    if (once) break;
    if (!result) await delay(pollIntervalMs);
  } while (!stopping);
}

main().catch((error) => {
  console.error("Release worker stopped unexpectedly.", error);
  process.exitCode = 1;
});
