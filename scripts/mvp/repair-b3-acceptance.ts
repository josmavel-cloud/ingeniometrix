// Bounded evaluation repair of THIS B3 run, never a production recovery mechanism.
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";

async function main() {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    const db = new URL(process.env[key] ?? "");
    if (db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/imx_b1") throw new Error("Isolated validation DB required");
  }
  const originalDir = path.resolve(process.argv[2]);
  if (!originalDir.startsWith(path.join(process.cwd(), "artifacts-local/release0-scientific-validation/b3/"))) throw new Error("B3 acceptance input required");
  const start = JSON.parse(await readFile(path.join(originalDir, "run-start.json"), "utf8"));
  const project = await prisma.project.findUniqueOrThrow({ where: { id: start.project_id } });
  const originalBudget = JSON.parse(await readFile(path.join(originalDir, "application-budget.json"), "utf8"));
  const closure = process.argv.includes("--closure");
  const priorRepair = closure ? JSON.parse(await readFile(path.join(originalDir, "repair/application-budget.json"), "utf8")) : { committed_usd: 0 };
  const cap = closure ? 1.3 : 1.9;
  if (originalBudget.committed_usd + priorRepair.committed_usd + cap + 2.4 > 5) throw new Error("Total acceptance budget would exceed USD 5");
  const dir = path.join(originalDir, closure ? "closure" : "repair"); await mkdir(dir, { recursive: true });
  const auditDir = path.join(dir, "provider-calls"); await mkdir(auditDir, { recursive: true });
  const priorCalls = path.join(originalDir, closure ? "repair/provider-calls" : "provider-calls");
  for (const file of await readdir(priorCalls)) await copyFile(path.join(priorCalls, file), path.join(auditDir, file));
  process.env.IMX_LLM_AUDIT_DIR = auditDir;
  process.env.IMX_LLM_RUN_BUDGET_USD = String(cap);
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  const provider = getConfiguredLlmProvider();
  const checkpoints = new Set(closure ? ["research_questions", "objectives_and_optional_hypotheses", "conceptual_framework", "research_design", "methodology", "consistency_matrix"] : ["evidence_synthesis", "problem_definition", "research_questions", "objectives_and_optional_hypotheses", "conceptual_framework"]);
  const reuse: unknown[] = [];
  const injected = { ...provider, generateStructuredObject: async <T>(request: Parameters<typeof provider.generateStructuredObject>[0]): Promise<T> => {
    const phase = request.schemaName.replace(/^b3_/, "");
    if (!checkpoints.has(phase)) return provider.generateStructuredObject<T>(request);
    const file = path.join(process.cwd(), "artifacts-local/mvp-step6-blueprint-docx", project.id, `${start.run_id}${closure ? "-repair" : ""}-step6`, "scientific-plan", `${phase === "consistency_matrix" ? "consistency-matrix" : phase}.json`);
    const content = await readFile(file, "utf8");
    reuse.push({ phase, source: file, sha256: createHash("sha256").update(content).digest("hex"), originally_generated_prompt: phase === "consistency_matrix" ? "ingeniometrix-consistency-matrix-v1" : closure && ["research_design", "methodology"].includes(phase) ? "ingeniometrix-scientific-plan-v2" : "ingeniometrix-scientific-plan-v1", provider_call_executed_in_repair: false });
    return JSON.parse(content) as T;
  } };
  const runId = `${start.run_id}-${closure ? "closure" : "repair"}`;
  const budget = new ApplicationBudget(cap);
  const started = Date.now();
  try {
    const result = await withApplicationBudget(budget, () => runMvpStep6BlueprintDocx({ projectId: project.id, userId: project.userId, runId: `${runId}-step6`, providerOverride: injected }));
    for (const file of ["final-thesis-plan.docx", "final-thesis-plan.pdf", "bibliography.bib", "bibliography.ris", "evidence-log.json"]) await copyFile(path.join(result.artifact_dir, file), path.join(dir, file));
    const ledger = await prisma.projectEvidenceLedger.findFirstOrThrow({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
    await writeFile(path.join(dir, "evidence-ledger.json"), JSON.stringify(ledger.ledgerJson, null, 2));
    const prompts = await readFile(path.join(result.artifact_dir, "scientific-plan/PROMPTS_USED.md"), "utf8");
    await writeFile(path.join(dir, "PROMPTS_USED.md"), prompts + "\n## Checkpoints B3 v1 conservados (sin nueva llamada)\n\n```json\n" + JSON.stringify(reuse, null, 2) + "\n```\n\nLas solicitudes originales y nuevas completas se conservan en provider-calls. Imagen: step6-hero-image.png.json en canonical_dir.\n");
    const report = { case_key: "engineering", run_id: runId, project_id: project.id, blueprint_version_id: result.blueprint_version_id, source_b3_case: originalDir, technical_execution: result.status, scientific_inspection: "PENDING", backend_duration_ms_repair: Date.now() - started, original_committed_usd: originalBudget.committed_usd, repair_committed_usd: budget.committedUsd, step6: result, artifacts: { docx: path.join(dir, "final-thesis-plan.docx"), pdf: path.join(dir, "final-thesis-plan.pdf"), evidence_ledger: path.join(dir, "evidence-ledger.json"), evidence_log: path.join(dir, "evidence-log.json"), prompts_used: path.join(dir, "PROMPTS_USED.md"), canonical_dir: result.artifact_dir }, continuity: { step5_step_run_id: ledger.stepRunId } };
    await writeFile(path.join(dir, "case-result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: result.status, dir, version: result.blueprint_version_id, repair_committed_usd: budget.committedUsd }));
  } finally {
    await writeFile(path.join(dir, "application-budget.json"), JSON.stringify({ cap_usd: budget.hardCapUsd, committed_usd: budget.committedUsd, entries: budget.entries, checkpoints: reuse }, null, 2));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
