import { prisma } from "@/lib/prisma";
import {
  BRIDGE_CPR_INTAKE,
  DIVERSE_MVP_INTAKES,
  FINAL_VALIDATION_INTAKES,
  runAutonomousMvpBatch,
  runAutonomousMvpPipeline,
} from "@/server/mvp/autonomous-pipeline-service";

const CURRENT_PROJECT_ID = "a76a6ffa-ffc9-426a-b18a-cb02c550fa1b";

function arg(name: string) {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
}

function has(flag: string) {
  return process.argv.includes(`--${flag}`);
}

async function main() {
  const mode = arg("mode") ?? "current";
  const maxAttempts = Number(arg("max-attempts") ?? "5");
  const safeAttempts = Number.isFinite(maxAttempts) ? Math.max(1, Math.min(5, maxAttempts)) : 5;

  if (mode === "current") {
    const result = await runAutonomousMvpPipeline({
      projectId: arg("project") ?? CURRENT_PROJECT_ID,
      intake: BRIDGE_CPR_INTAKE,
      label: "bridge-cpr-current",
      maxAttempts: safeAttempts,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (mode === "batch5") {
    const results = await runAutonomousMvpBatch({ intakes: DIVERSE_MVP_INTAKES, label: "batch5", maxAttempts: safeAttempts });
    console.log(JSON.stringify({ ok: results.every((item) => item.ok), count: results.length, results }, null, 2));
    return;
  }

  if (mode === "final2") {
    const results = await runAutonomousMvpBatch({ intakes: FINAL_VALIDATION_INTAKES, label: "final2", maxAttempts: safeAttempts });
    console.log(JSON.stringify({ ok: results.every((item) => item.ok), count: results.length, results }, null, 2));
    return;
  }

  if (mode === "cleanup-validation") {
    const current = await runAutonomousMvpPipeline({ projectId: arg("project") ?? CURRENT_PROJECT_ID, intake: BRIDGE_CPR_INTAKE, label: "cleanup-current", maxAttempts: safeAttempts });
    const final = has("include-final2")
      ? await runAutonomousMvpBatch({ intakes: FINAL_VALIDATION_INTAKES, label: "cleanup-final2", maxAttempts: safeAttempts })
      : [];
    console.log(JSON.stringify({ ok: current.ok && final.every((item) => item.ok), cleanup_note: "Consolidated command path is npm run mvp:pipeline:full -- --mode=<current|batch5|final2|cleanup-validation>. No destructive temp-script deletion performed.", current, final }, null, 2));
    return;
  }

  if (mode === "all") {
    const current = await runAutonomousMvpPipeline({ projectId: arg("project") ?? CURRENT_PROJECT_ID, intake: BRIDGE_CPR_INTAKE, label: "all-current", maxAttempts: safeAttempts });
    const batch5 = await runAutonomousMvpBatch({ intakes: DIVERSE_MVP_INTAKES, label: "all-batch5", maxAttempts: safeAttempts });
    const final2 = await runAutonomousMvpBatch({ intakes: FINAL_VALIDATION_INTAKES, label: "all-final2", maxAttempts: safeAttempts });
    console.log(JSON.stringify({ ok: current.ok && batch5.every((item) => item.ok) && final2.every((item) => item.ok), current, batch5, final2 }, null, 2));
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
