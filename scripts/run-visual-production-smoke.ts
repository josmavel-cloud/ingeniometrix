import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const CONTAINER = "imx-b1-validation-20260918-a";
const PROJECT_ID = "adfc6589-84fa-4e6c-89d9-c2cbef685dec";

async function isolatedDatabaseUrl() {
  const { stdout } = await exec("docker", ["inspect", "--format", "{{json .Config.Env}}", CONTAINER], { timeout: 20_000, maxBuffer: 1024 * 1024 });
  const values = Object.fromEntries((JSON.parse(stdout) as string[]).map((item) => item.split(/=(.*)/s).slice(0, 2)));
  if (!values.POSTGRES_USER || !values.POSTGRES_PASSWORD || !values.POSTGRES_DB) throw new Error("ISOLATED_VALIDATION_DB_CREDENTIALS_MISSING");
  const url = new URL("postgresql://127.0.0.1:55434");
  url.username = values.POSTGRES_USER; url.password = values.POSTGRES_PASSWORD; url.pathname = `/${values.POSTGRES_DB}`;
  return url.toString();
}

async function main() {
  const databaseUrl = await isolatedDatabaseUrl(); process.env.DATABASE_URL = databaseUrl; process.env.DIRECT_DATABASE_URL = databaseUrl;
  const [{ prisma }, { getConfiguredLlmProvider }, { ApplicationBudget, withApplicationBudget }, { runMvpStep6BlueprintDocx }] = await Promise.all([
    import("@/lib/prisma"), import("@/llm"), import("@/server/mvp/application-budget"), import("@/server/mvp/step6-blueprint-docx-service"),
  ]);
  try {
    const project = await prisma.project.findUnique({ where: { id: PROJECT_ID }, select: { id: true, userId: true } });
    if (!project) throw new Error("ISOLATED_VALIDATION_PROJECT_MISSING");
    const budget = new ApplicationBudget(5, 2); const started = Date.now(); const runId = `release0-visual-production-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const result = await withApplicationBudget(budget, () => runMvpStep6BlueprintDocx({ userId: project.userId, projectId: project.id, runId, providerOverride: getConfiguredLlmProvider() }));
    const outputDir = path.join(process.cwd(), "artifacts-local", "release0-visual-acceptance", "production-smoke"); await mkdir(outputDir, { recursive: true });
    const summary = { mode: "fresh_production_step6_smoke_on_isolated_validation_database", run_id: runId, project_id: project.id, result, budget_entries: budget.entries, committed_usd: budget.committedUsd, duration_ms: Date.now() - started };
    await writeFile(path.join(outputDir, "result.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ status: result.status, run_id: runId, docx: result.docx_path, pdf: result.pdf_path, committed_usd: budget.committedUsd, duration_ms: summary.duration_ms }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
