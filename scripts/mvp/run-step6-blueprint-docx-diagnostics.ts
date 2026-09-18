import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { MVP_STEP5_KEY } from "@/server/mvp/evidence-materialization-types";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";
import { MVP_STEP6_KEY } from "@/server/mvp/step6-blueprint-docx-types";
import { asStepRunJson, findLatestMvpStepRun } from "@/server/mvp/step-run-service";

const DEFAULT_USER_EMAIL = "mvp-step3-source-selection-diagnostics@ingeniometrix.local";

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function loadLocalEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  let raw = "";
  try {
    raw = await readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || process.env[key]) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function fileExists(filePath: string | null | undefined) {
  if (!filePath) return false;
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string | null | undefined): Promise<Record<string, unknown> | null> {
  if (!filePath) return null;
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function checkPassed(report: Record<string, unknown> | null, key: string) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const check = checks.find((item): item is Record<string, unknown> =>
    Boolean(item && typeof item === "object" && "key" in item && item.key === key),
  );
  return {
    passed: check?.passed === true,
    detail: typeof check?.detail === "string" ? check.detail : "missing",
  };
}

async function findProject(input: { userId: string; projectId?: string }) {
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        userId: input.userId,
      },
      include: {
        intake: true,
        projectReferences: {
          where: { selected: true },
          include: { reference: true },
          orderBy: { selectedOrder: "asc" },
        },
      },
    });
    if (!project) {
      throw new Error(`Project ${input.projectId} was not found for this user.`);
    }
    return project;
  }

  const recentProjects = await prisma.project.findMany({
    where: { userId: input.userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        include: { reference: true },
        orderBy: { selectedOrder: "asc" },
      },
    },
  });

  const project = recentProjects.find((candidate) => candidate.intake && candidate.projectReferences.length > 0);
  if (!project) {
    throw new Error("No project with intake and selected sources was found.");
  }
  return project;
}

async function runDiagnostic() {
  await loadLocalEnvFile();

  const runId = `step6-blueprint-docx-diagnostics-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-step6-blueprint-docx-diagnostics", runId);
  await mkdir(artifactDir, { recursive: true });

  const email = readArg("email") ?? DEFAULT_USER_EMAIL;
  const projectId = readArg("project");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`User ${email} was not found.`);
  }

  const project = await findProject({ userId: user.id, projectId });
  const latestStep5 = await findLatestMvpStepRun({
    projectId: project.id,
    stepKey: MVP_STEP5_KEY,
  });
  if (!latestStep5) {
    throw new Error("Step 5 run was not found. Run Step 5 before Step 6 diagnostics.");
  }

  await logAuditEvent({
    eventType: "MVP_STEP6_DIAGNOSTIC_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({
      run_id: runId,
      artifact_dir: artifactDir,
      latest_step5_run_id: latestStep5.id,
    }),
  });

  const result = await runMvpStep6BlueprintDocx({
    userId: user.id,
    projectId: project.id,
    runId,
  });

  const latestStep6 = await findLatestMvpStepRun({
    projectId: project.id,
    stepKey: MVP_STEP6_KEY,
  });
  const blueprintVersion = await prisma.blueprintVersion.findFirst({
    where: {
      id: result.blueprint_version_id,
      projectId: project.id,
    },
  });
  const coherenceReport = await readJsonFile(result.artifacts.coherence_report);
  const pageBudgetReport = await readJsonFile(result.artifacts.page_budget_plan);
  const estimatedPages = typeof pageBudgetReport?.estimated_pages === "number" ? pageBudgetReport.estimated_pages : null;
  const maxPages = typeof pageBudgetReport?.max_pages === "number" ? pageBudgetReport.max_pages : null;

  const checks = [
    {
      key: "step5_handoff_exists",
      passed: Boolean(latestStep5.artifactManifestPath),
      detail: latestStep5.artifactManifestPath ?? "missing",
    },
    {
      key: "step6_run_completed",
      passed: latestStep6?.status === "COMPLETED" || latestStep6?.status === "PARTIALLY_COMPLETED",
      detail: latestStep6?.status ?? "missing",
    },
    {
      key: "docx_written",
      passed: await fileExists(result.docx_path),
      detail: result.docx_path,
    },
    {
      key: "section_plan_written",
      passed: await fileExists(result.artifacts.section_plan),
      detail: result.artifacts.section_plan,
    },
    {
      key: "section_drafts_written",
      passed: await fileExists(result.artifacts.section_drafts) && result.metrics.section_count >= 8,
      detail: `${result.metrics.section_count} sections`,
    },
    {
      key: "blueprint_version_created",
      passed: Boolean(blueprintVersion),
      detail: result.blueprint_version_id,
    },
    {
      key: "step7_contract_written",
      passed: await fileExists(result.artifacts.step7_export_contract),
      detail: result.artifacts.step7_export_contract,
    },
    {
      key: "usage_report_written",
      passed: await fileExists(result.artifacts.api_usage_report),
      detail: result.artifacts.api_usage_report,
    },
    {
      key: "academic_style_contract_written",
      passed: await fileExists(result.artifacts.style_contract),
      detail: result.artifacts.style_contract,
    },
    {
      key: "page_budget_plan_written",
      passed: await fileExists(result.artifacts.page_budget_plan),
      detail: result.artifacts.page_budget_plan,
    },
    {
      key: "title_plan_written",
      passed: await fileExists(result.artifacts.title_plan),
      detail: result.artifacts.title_plan,
    },
    {
      key: "section_generation_order_written",
      passed: await fileExists(result.artifacts.section_generation_order),
      detail: result.artifacts.section_generation_order,
    },
    {
      key: "citation_coordinate_plan_written",
      passed: await fileExists(result.artifacts.citation_coordinate_plan),
      detail: result.artifacts.citation_coordinate_plan,
    },
    {
      key: "cross_reference_plan_written",
      passed: await fileExists(result.artifacts.cross_reference_plan),
      detail: result.artifacts.cross_reference_plan,
    },
    {
      key: "asset_placement_plan_written",
      passed: await fileExists(result.artifacts.asset_placement_plan),
      detail: result.artifacts.asset_placement_plan,
    },
    {
      key: "editorial_report_written",
      passed: await fileExists(result.artifacts.editorial_report),
      detail: result.artifacts.editorial_report,
    },
    {
      key: "summary_hero_image_plan_written",
      passed: await fileExists(result.artifacts.summary_hero_image_plan),
      detail: result.artifacts.summary_hero_image_plan,
    },
    {
      key: "qa_no_dangling_public_fragments",
      ...checkPassed(coherenceReport, "no_dangling_public_fragments"),
    },
    {
      key: "qa_no_internal_metadata_in_public_text",
      ...checkPassed(coherenceReport, "no_internal_metadata_in_public_text"),
    },
    {
      key: "qa_no_visible_raw_latex_fallback",
      ...checkPassed(coherenceReport, "no_visible_raw_latex_fallback"),
    },
    {
      key: "qa_no_dangling_cross_reference_mentions",
      ...checkPassed(coherenceReport, "no_dangling_cross_reference_mentions"),
    },
    {
      key: "qa_page_budget_max_15",
      passed: estimatedPages != null && maxPages != null && estimatedPages <= maxPages && maxPages <= 15,
      detail: `${estimatedPages ?? "missing"}/${maxPages ?? "missing"} estimated pages`,
    },
  ];

  const failed = checks.filter((check) => !check.passed);
  const report = {
    artifact_type: "mvp_step6_blueprint_docx_diagnostic_report",
    artifact_version: "v1",
    run_id: runId,
    generated_at: new Date().toISOString(),
    project_id: project.id,
    step5_run_id: latestStep5.id,
    step6_run_id: result.step_run_id,
    blueprint_version_id: result.blueprint_version_id,
    docx_path: result.docx_path,
    passed: failed.length === 0,
    checks,
    warnings: result.warnings,
    result,
  };
  const reportPath = path.join(artifactDir, "step6-diagnostic-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await logAuditEvent({
    eventType: failed.length === 0 ? "MVP_STEP6_DIAGNOSTIC_COMPLETED" : "MVP_STEP6_DIAGNOSTIC_FAILED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: user.id,
    projectId: project.id,
    payloadJson: asStepRunJson({
      run_id: runId,
      report_path: reportPath,
      passed: failed.length === 0,
      failed_checks: failed.map((check) => check.key),
      docx_path: result.docx_path,
    }),
  });

  console.log(JSON.stringify({
    passed: failed.length === 0,
    report_path: reportPath,
    docx_path: result.docx_path,
    blueprint_version_id: result.blueprint_version_id,
    failed_checks: failed,
  }, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

runDiagnostic()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
