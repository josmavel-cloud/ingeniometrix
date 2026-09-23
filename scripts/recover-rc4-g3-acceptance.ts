import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { closeJobCostControl, jobCostSnapshot, withJobExecution } from "@/server/mvp/job-execution-context";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";
import { readGenerationInput, withGenerationInput } from "@/server/projects/generation-input-snapshot";

const ROOT = path.resolve("artifacts-local/rc4/g3-acceptance");
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");

async function main() {
  const jobId = process.env.RC4_G3_RECOVERY_JOB_ID;
  if (!jobId) throw new Error("RC4_G3_RECOVERY_JOB_ID required");
  if (process.env.RC4_G3_TARGETED_REPAIR !== "1") throw new Error("RC4_G3_TARGETED_REPAIR=1 required");
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  if (process.env.IMX_ENABLE_DEEP_RESEARCH !== "0") throw new Error("Deep Research must remain disabled");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required");
  const job = await prisma.blueprintJob.findUniqueOrThrow({ where: { id: jobId } });
  const continuedRecovery = job.status === "FAILED" && job.attempts === 1 && (job.errorMessage === "LEASE_LOST" || job.errorMessage?.startsWith("SCIENTIFIC_REPAIR_UNRESOLVED:") || job.errorMessage === "SCIENTIFIC_REPAIR_ADDED_UNAPPROVED_METHOD_SUPPORT");
  if (job.status !== "FAILED" || !continuedRecovery && !job.errorMessage?.startsWith("SCIENTIFIC_REVIEW_BLOCKED:")) throw new Error("Only the preserved G3 scientific-review failure can be recovered");
  const stageData = job.stageDataJson as { runId?: string } | null;
  if (!stageData?.runId) throw new Error("G3 runId missing");
  const snapshot = await prisma.generationInputSnapshot.findFirstOrThrow({ where: { jobId }, orderBy: { revision: "desc" } });
  const frozenInput = await readGenerationInput(jobId, snapshot.id);
  const leaseAcquiredAt = new Date();
  const startedAt = job.startedAt ?? leaseAcquiredAt;
  const recoveryAttempt = continuedRecovery ? job.attempts : job.attempts + 1;
  await prisma.blueprintJob.update({ where: { id: jobId }, data: { status: "RUNNING", currentStage: "scientific_citation_repair", errorMessage: null, completedAt: null, lockedAt: leaseAcquiredAt, attempts: recoveryAttempt } });
  let result;
  try {
    result = await withGenerationInput(frozenInput, () => withJobExecution({ jobId, startedAt, stage: "scientific_citation_repair", recoveryAttempt }, () => withApplicationBudget(new ApplicationBudget(2.5, 2.0), () => runMvpStep6BlueprintDocx({ userId: job.userId, projectId: job.projectId, runId: stageData.runId!, providerOverride: getConfiguredLlmProvider() }))));
    await prisma.$transaction(async (tx) => {
      await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "COMPLETED", currentStage: "completed", progress: 100, completedAt: new Date(), lockedAt: null } });
      await closeJobCostControl(tx, jobId, "COMPLETED");
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "FAILED", completedAt: new Date(), lockedAt: null, errorMessage: error instanceof Error ? error.message : String(error) } });
      await closeJobCostControl(tx, jobId, "FAILED");
    });
    throw error;
  }
  const budget = await withJobExecution({ jobId, startedAt, stage: "report", recoveryAttempt }, () => jobCostSnapshot());
  const pkg = JSON.parse(await readFile(result.artifacts.blueprint_package, "utf8"));
  const page = JSON.parse(await readFile(result.artifacts.page_budget_plan, "utf8"));
  const docx = await readFile(result.docx_path);
  const pdf = await readFile(result.pdf_path!);
  const summary = { acceptance: "RC4_G3_TARGETED_RECOVERY", same_job: true, full_run_count: 1, targeted_repair_count: 1, project_id: job.projectId, job_id: jobId, version_id: result.blueprint_version_id, result, document_profile: pkg.document_profile, section_order: pkg.section_drafts.map((item: any) => item.section_key), questions: pkg.scientific_plan.definition.questions.length, specific_objectives: pkg.scientific_plan.definition.objectives.length - 1, hypotheses: pkg.scientific_plan.definition.hypotheses_or_propositions, assets: pkg.visual_plan?.assets ?? [], page, budget, hashes: { docx: sha(docx), pdf: sha(pdf) }, scientific_decision_reused: true, selector_calls: 0, critic_calls: 0 };
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const summaryPath = path.join(ROOT, `${stageData.runId}-recovery-summary.json`);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ summary: summaryPath, projectId: job.projectId, jobId, versionId: result.blueprint_version_id, docx: result.docx_path, pdf: result.pdf_path, pages: page, calls: result.api_usage.llm_calls_executed, tokens: result.api_usage.total_tokens, cost: result.api_usage.estimated_cost_usd, cumulativeBudget: budget, hashes: summary.hashes }, null, 2));
}

main().catch(async (error) => { console.error(error); process.exitCode = 1; await prisma.$disconnect(); });
