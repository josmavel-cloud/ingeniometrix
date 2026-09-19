// Evaluation-only editorial closure. Reuses THIS B3 design, never historical B2 outputs.
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { infographicFingerprint } from "@/server/mvp/final-infographic";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";
import type { MvpStep6BlueprintPackage } from "@/server/mvp/step6-blueprint-docx-types";

async function main() {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    const db = new URL(process.env[key] ?? "");
    if (db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/imx_b1") throw new Error("Isolated validation DB required");
  }
  const root = path.join(process.cwd(), "artifacts-local/release0-scientific-validation/b3");
  const sourceDir = path.resolve(process.argv[2]);
  if (!sourceDir.startsWith(root + path.sep)) throw new Error("B3 acceptance input required");
  const report = JSON.parse(await readFile(path.join(sourceDir, "case-result.json"), "utf8"));
  if (!["engineering", "qualitative"].includes(report.case_key)) throw new Error("Positive fixture required");
  let priorCost = 0;
  async function budgets(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    if (entries.some((e) => e.name === "run-start.json") && !entries.some((e) => e.name === "application-budget.json")) throw new Error("An acceptance run is still active; do not overlap paid runs");
    for (const entry of entries) {
      if (entry.isDirectory()) { if (entry.name !== "provider-calls") await budgets(path.join(dir, entry.name)); }
      else if (entry.name === "application-budget.json") priorCost += JSON.parse(await readFile(path.join(dir, entry.name), "utf8")).committed_usd;
    }
  }
  await budgets(root);
  const budget = new ApplicationBudget(0.8);
  if (priorCost + budget.hardCapUsd > 5) throw new Error("Total acceptance cap would be exceeded");
  const pkg: MvpStep6BlueprintPackage = JSON.parse(await readFile(path.join(report.artifacts.canonical_dir, "step6-blueprint-package.json"), "utf8"));
  const project = await prisma.project.findUniqueOrThrow({ where: { id: report.project_id } });
  if (pkg.project_id !== project.id || pkg.blueprint_version_id !== report.blueprint_version_id) throw new Error("B3 source version mismatch");
  const exportOnly = process.argv.includes("--export-only") || process.argv.includes("--delivery");
  const suffix = process.argv.includes("--delivery") ? "-delivery" : exportOnly ? "-export" : process.argv.includes("--repair-budget") ? "-rc2" : "";
  const dir = path.join(root, "final", report.case_key + suffix); await mkdir(dir);
  const auditDir = path.join(dir, "provider-calls"); await mkdir(auditDir, { recursive: true });
  for (const file of await readdir(path.join(sourceDir, "provider-calls"))) await copyFile(path.join(sourceDir, "provider-calls", file), path.join(auditDir, file));
  process.env.IMX_LLM_AUDIT_DIR = auditDir; process.env.IMX_LLM_RUN_BUDGET_USD = "0.8"; process.env.LLM_REQUEST_MAX_RETRIES = "0";
  const provider = getConfiguredLlmProvider();
  const checkpoints: unknown[] = [];
  const compactCache = new Map<string, { value: any; file: string; words: number }>();
  if (report.case_key === "engineering" && suffix && !exportOnly) {
    for (const attempt of ["engineering", "engineering-rc"]) for (const file of await readdir(path.join(root, "final", attempt, "provider-calls")).catch(() => [])) {
      const recordPath = path.join(root, "final", attempt, "provider-calls", file);
      const record = JSON.parse(await readFile(recordPath, "utf8"));
      const phase = record.request.text?.format?.name?.replace(/^b3_/, "");
      if (!phase?.startsWith("compact_") || !record.response.output_text) continue;
      const value = JSON.parse(record.response.output_text), words = value.paragraphs.map((p: any) => p.text).join(" ").split(/\s+/).length;
      if (!compactCache.has(phase) || compactCache.get(phase)!.words > words) compactCache.set(phase, { value, file: recordPath, words });
    }
  }
  const injected = { ...provider, generateStructuredObject: async <T>(request: Parameters<typeof provider.generateStructuredObject>[0]): Promise<T> => {
    const phase = request.schemaName.replace(/^b3_/, "");
    if (exportOnly && phase.startsWith("compact_")) {
      const file = path.join(report.artifacts.canonical_dir, "scientific-plan", `${phase.replace(/^compact_/, "")}.json`);
      checkpoints.push({ phase, source: file, provider_call_executed: false, reason: "Deterministic re-export, same previously reviewed complete section" });
      return { paragraphs: JSON.parse(await readFile(file, "utf8")).paragraphs } as T;
    }
    if (compactCache.has(phase)) { const cached = compactCache.get(phase)!; checkpoints.push({ phase, source: cached.file, provider_call_executed: false, reason: "Already paid B3 compaction; original evidence pairs revalidated" }); return structuredClone(cached.value) as T; }
    if (!exportOnly && (phase.startsWith("compact_") || phase === "cross_section_review")) return provider.generateStructuredObject<T>(request);
    const file = path.join(report.artifacts.canonical_dir, "scientific-plan", `${phase === "consistency_matrix" ? "consistency-matrix" : phase}.json`);
    const text = await readFile(file, "utf8");
    checkpoints.push({ phase, source: file, sha256: createHash("sha256").update(text).digest("hex"), provider_call_executed: false });
    return JSON.parse(text) as T;
  } };
  const runId = `${report.run_id}-final${suffix}`;
  const fingerprint = infographicFingerprint(pkg.scientific_plan!.definition, pkg.scientific_plan!.design, pkg.title_plan.title);
  const qualityRejectionReason = report.case_key === "engineering" ? "Inspeccion visual B3: imagen contiene identificadores internos C2/C3; se conserva el original para auditoria y se utiliza grafico limpio sin otra llamada pagada." : undefined;
  const started = Date.now();
  try {
    const result = await withApplicationBudget(budget, () => runMvpStep6BlueprintDocx({ userId: project.userId, projectId: project.id, runId: `${runId}-step6`, providerOverride: injected, heroReuse: { projectId: project.id, fingerprint, plan: pkg.hero_image, qualityRejectionReason } }));
    for (const file of ["final-thesis-plan.docx", "final-thesis-plan.pdf", "bibliography.bib", "bibliography.ris", "evidence-log.json"]) await copyFile(path.join(result.artifact_dir, file), path.join(dir, file));
    await copyFile(report.artifacts.evidence_ledger, path.join(dir, "evidence-ledger.json"));
    const prompts = await readFile(path.join(result.artifact_dir, "scientific-plan/PROMPTS_USED.md"), "utf8");
    await writeFile(path.join(dir, "PROMPTS_USED.md"), prompts + "\n## Checkpoints de esta evaluacion B3, no regenerados\n\n```json\n" + JSON.stringify(checkpoints, null, 2) + "\n```\n\nImagen reutilizada sin nueva llamada; diseno/titulo identicos y fingerprint comprobado. Inventario previo: " + report.artifacts.prompts_used + "\n");
    await writeFile(path.join(dir, "case-result.json"), JSON.stringify({ ...report, source_b3_case: sourceDir, run_id: runId, blueprint_version_id: result.blueprint_version_id, final_step6: result, backend_duration_ms_finalization: Date.now() - started, finalization_committed_usd: budget.committedUsd, artifacts: { ...report.artifacts, canonical_dir: result.artifact_dir, docx: path.join(dir, "final-thesis-plan.docx"), pdf: path.join(dir, "final-thesis-plan.pdf"), evidence_ledger: path.join(dir, "evidence-ledger.json"), evidence_log: path.join(dir, "evidence-log.json"), prompts_used: path.join(dir, "PROMPTS_USED.md") } }, null, 2));
    console.log(JSON.stringify({ status: result.status, dir, version: result.blueprint_version_id, committed_usd: budget.committedUsd }));
  } finally {
    await writeFile(path.join(dir, "application-budget.json"), JSON.stringify({ cap_usd: budget.hardCapUsd, committed_usd: budget.committedUsd, entries: budget.entries, checkpoints }, null, 2));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
