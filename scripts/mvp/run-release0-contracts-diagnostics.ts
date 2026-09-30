import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  RELEASE0_BACKEND_CONTRACT_VERSION,
  RELEASE0_CORE_PRISMA_MODELS,
  RELEASE0_STEP_CONTRACTS,
  RELEASE0_STEP_RUN_REQUIRED_FIELDS,
  getRelease0PipelineMap,
  type Release0StepContract,
} from "@/server/mvp/release0-contracts";

type Check = {
  key: string;
  passed: boolean;
  detail: string;
  severity: "critical" | "important" | "minor";
};

type Gap = {
  key: string;
  severity: "critical" | "important" | "minor";
  step_id: string | null;
  detail: string;
  recommended_action: string;
};

type PackageJson = {
  scripts?: Record<string, string>;
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function fileExists(relativePath: string) {
  try {
    await access(path.join(process.cwd(), relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readText(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

function hasModel(schema: string, modelName: string) {
  return new RegExp(`model\\s+${modelName}\\s+\\{`, "m").test(schema);
}

function getModelBody(schema: string, modelName: string) {
  const modelStart = schema.search(new RegExp(`model\\s+${modelName}\\s+\\{`, "m"));
  if (modelStart < 0) return "";
  const openIndex = schema.indexOf("{", modelStart);
  if (openIndex < 0) return "";

  let depth = 0;
  for (let index = openIndex; index < schema.length; index += 1) {
    const char = schema[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return schema.slice(openIndex + 1, index);
    }
  }

  return "";
}

function hasModelField(modelBody: string, fieldName: string) {
  return new RegExp(`^\\s*${fieldName}\\s+`, "m").test(modelBody);
}

function parsePackageJson(raw: string): PackageJson {
  const parsed = JSON.parse(raw) as PackageJson;
  return {
    scripts: parsed.scripts ?? {},
  };
}

function pushGapForCheck(gaps: Gap[], check: Check, stepId: string | null, recommendedAction: string) {
  if (check.passed) return;
  gaps.push({
    key: check.key,
    severity: check.severity,
    step_id: stepId,
    detail: check.detail,
    recommended_action: recommendedAction,
  });
}

function addKnownGaps(step: Release0StepContract, gaps: Gap[]) {
  if (step.implementationStatus === "planned_for_release0") {
    gaps.push({
      key: `${step.id}_planned_not_closed`,
      severity: "critical",
      step_id: step.id,
      detail: `${step.name} todavia no tiene servicio productivo Release 0 cerrado.`,
      recommended_action: "Implementar servicio de cierre, MvpStepRun, manifest y diagnostico antes de declarar Release 0.",
    });
  }

  if (step.implementationStatus === "implemented_with_contract_gap") {
    gaps.push({
      key: `${step.id}_contract_gap`,
      severity: "important",
      step_id: step.id,
      detail: `${step.name} funciona, pero no esta alineado completamente al contrato canonico.`,
      recommended_action: "Resolver la brecha marcada en cleanupFlags antes del hardening final.",
    });
  }

  for (const flag of step.cleanupFlags) {
    gaps.push({
      key: flag.key,
      severity: flag.priority === "cleanup_now" ? "important" : "minor",
      step_id: step.id,
      detail: flag.reason,
      recommended_action: flag.priority === "cleanup_now"
        ? "Resolver en la fase de cierre del step correspondiente."
        : "Mantener visible y revisar despues de validar el flujo E2E.",
    });
  }
}

async function evaluateStepEntrypoints(step: Release0StepContract, packageScripts: Record<string, string>) {
  const serviceChecks: Check[] = await Promise.all(step.entrypoints.services.map(async (item) => ({
    key: `${step.id}:service:${item}`,
    passed: await fileExists(item),
    detail: item,
    severity: "critical" as const,
  })));
  const apiChecks: Check[] = await Promise.all(step.entrypoints.apiRoutes.map(async (item) => ({
    key: `${step.id}:api:${item}`,
    passed: await fileExists(item),
    detail: item,
    severity: "important" as const,
  })));
  const diagnosticChecks: Check[] = await Promise.all(step.entrypoints.diagnostics.map(async (item) => ({
    key: `${step.id}:diagnostic:${item}`,
    passed: await fileExists(item),
    detail: item,
    severity: "important" as const,
  })));
  const scriptChecks: Check[] = step.entrypoints.packageScripts.map((scriptName) => ({
    key: `${step.id}:package_script:${scriptName}`,
    passed: Boolean(packageScripts[scriptName]),
    detail: packageScripts[scriptName] ?? "missing",
    severity: "important",
  }));

  return [...serviceChecks, ...apiChecks, ...diagnosticChecks, ...scriptChecks];
}

function evaluateContinuity() {
  const checks: Check[] = [];
  const produced = new Set<string>(["Project", "Intake", "Reference", "ProjectReference", "BlueprintVersion"]);

  for (const step of RELEASE0_STEP_CONTRACTS) {
    const missing = step.consumes.filter((item) => !produced.has(item));
    checks.push({
      key: `${step.id}:consumes_declared_previous_outputs`,
      passed: missing.length === 0,
      detail: missing.length === 0 ? "all consumes resolved" : `missing upstream outputs: ${missing.join(", ")}`,
      severity: "critical",
    });

    for (const artifact of step.produces) {
      produced.add(artifact.key);
    }
    for (const persistence of step.persistence) {
      produced.add(persistence.model);
    }
  }

  return checks;
}

function evaluateContractShape() {
  const ids = RELEASE0_STEP_CONTRACTS.map((step) => step.id);
  const canonicalKeys = RELEASE0_STEP_CONTRACTS.map((step) => step.canonicalStepKey);
  const order = RELEASE0_STEP_CONTRACTS.map((step) => step.order);
  const uniqueIds = new Set(ids);
  const uniqueCanonicalKeys = new Set(canonicalKeys);

  return [
    {
      key: "release0_contract_has_seven_steps",
      passed: RELEASE0_STEP_CONTRACTS.length === 7,
      detail: `${RELEASE0_STEP_CONTRACTS.length} steps`,
      severity: "critical" as const,
    },
    {
      key: "release0_contract_unique_step_ids",
      passed: uniqueIds.size === ids.length,
      detail: ids.join(", "),
      severity: "critical" as const,
    },
    {
      key: "release0_contract_unique_canonical_keys",
      passed: uniqueCanonicalKeys.size === canonicalKeys.length,
      detail: canonicalKeys.join(", "),
      severity: "critical" as const,
    },
    {
      key: "release0_contract_order_is_canonical",
      passed: order.every((item, index) => item === index + 1),
      detail: order.join(" -> "),
      severity: "critical" as const,
    },
  ];
}

function evaluatePrismaSchema(schema: string) {
  const modelChecks: Check[] = RELEASE0_CORE_PRISMA_MODELS.map((modelName) => ({
    key: `prisma_model:${modelName}`,
    passed: hasModel(schema, modelName),
    detail: modelName,
    severity: "critical",
  }));
  const mvpStepRunBody = getModelBody(schema, "MvpStepRun");
  const fieldChecks: Check[] = RELEASE0_STEP_RUN_REQUIRED_FIELDS.map((fieldName) => ({
    key: `mvp_step_run_field:${fieldName}`,
    passed: hasModelField(mvpStepRunBody, fieldName),
    detail: fieldName,
    severity: "critical",
  }));

  return [...modelChecks, ...fieldChecks];
}

function buildMarkdownReport(input: {
  runId: string;
  generatedAt: string;
  baselineOk: boolean;
  readyForRelease0Close: boolean;
  checks: Check[];
  gaps: Gap[];
}) {
  const failedChecks = input.checks.filter((check) => !check.passed);
  const lines = [
    "# Release 0 Backend Contract Diagnostic",
    "",
    `- run_id: ${input.runId}`,
    `- generated_at: ${input.generatedAt}`,
    `- contract_version: ${RELEASE0_BACKEND_CONTRACT_VERSION}`,
    `- baseline_ok: ${String(input.baselineOk)}`,
    `- ready_for_release0_close: ${String(input.readyForRelease0Close)}`,
    `- failed_checks: ${String(failedChecks.length)}`,
    `- production_gaps: ${String(input.gaps.length)}`,
    "",
    "## Canonical Steps",
    "",
    ...RELEASE0_STEP_CONTRACTS.map((step) =>
      `${step.order}. ${step.name} (${step.canonicalStepKey}) - ${step.implementationStatus}`,
    ),
    "",
    "## Production Gaps",
    "",
    ...(input.gaps.length === 0
      ? ["No production gaps detected."]
      : input.gaps.map((gap) => `- [${gap.severity}] ${gap.key}: ${gap.detail}`)),
    "",
    "## Failed Static Checks",
    "",
    ...(failedChecks.length === 0
      ? ["No failed static checks."]
      : failedChecks.map((check) => `- [${check.severity}] ${check.key}: ${check.detail}`)),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

async function runDiagnostic() {
  const runId = readArg("run-id") ?? `release0-contracts-${nowStamp()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-release0-contracts", runId);
  await mkdir(artifactDir, { recursive: true });

  const [packageJson, prismaSchema] = await Promise.all([
    readText("package.json").then(parsePackageJson),
    readText("prisma/schema.prisma"),
  ]);
  const packageScripts = packageJson.scripts ?? {};

  const contractChecks = evaluateContractShape();
  const prismaChecks = evaluatePrismaSchema(prismaSchema);
  const continuityChecks = evaluateContinuity();
  const stepEntrypointChecks = (
    await Promise.all(RELEASE0_STEP_CONTRACTS.map((step) => evaluateStepEntrypoints(step, packageScripts)))
  ).flat();
  const checks = [...contractChecks, ...prismaChecks, ...continuityChecks, ...stepEntrypointChecks];
  const gaps: Gap[] = [];

  for (const step of RELEASE0_STEP_CONTRACTS) {
    addKnownGaps(step, gaps);
  }

  for (const check of checks) {
    const stepId = RELEASE0_STEP_CONTRACTS.find((step) => check.key.startsWith(`${step.id}:`))?.id ?? null;
    pushGapForCheck(gaps, check, stepId, "Restaurar el archivo/script/modelo esperado o actualizar el contrato si el cambio fue intencional.");
  }

  const criticalStaticFailures = checks.filter((check) => !check.passed && check.severity === "critical");
  const baselineOk = criticalStaticFailures.length === 0;
  const readyForRelease0Close = baselineOk && gaps.every((gap) => gap.severity !== "critical" && gap.severity !== "important");
  const generatedAt = new Date().toISOString();
  const report = {
    artifact_type: "mvp_release0_backend_contract_diagnostic",
    artifact_version: "v1",
    contract_version: RELEASE0_BACKEND_CONTRACT_VERSION,
    run_id: runId,
    generated_at: generatedAt,
    baseline_ok: baselineOk,
    ready_for_release0_close: readyForRelease0Close,
    summary: {
      step_count: RELEASE0_STEP_CONTRACTS.length,
      check_count: checks.length,
      failed_check_count: checks.filter((check) => !check.passed).length,
      critical_static_failure_count: criticalStaticFailures.length,
      production_gap_count: gaps.length,
      critical_gap_count: gaps.filter((gap) => gap.severity === "critical").length,
      important_gap_count: gaps.filter((gap) => gap.severity === "important").length,
      minor_gap_count: gaps.filter((gap) => gap.severity === "minor").length,
    },
    pipeline_map: getRelease0PipelineMap(),
    checks,
    production_gaps: gaps,
    next_actions: [
      "Separar Step 4 como run/diagnostico canonico o documentar formalmente su fusion con Step 3.",
      "Reparar calidad productiva de Step 6 antes de exportar.",
      "Implementar Step 7 como servicio de paquete final con MvpStepRun, manifest y hashes.",
      "Agregar comando E2E release0 cuando Step 6 y Step 7 esten cerrados.",
    ],
  };
  const reportPath = path.join(artifactDir, "release0-contract-diagnostic.json");
  const markdownPath = path.join(artifactDir, "release0-contract-diagnostic.md");

  await Promise.all([
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(
      markdownPath,
      buildMarkdownReport({
        runId,
        generatedAt,
        baselineOk,
        readyForRelease0Close,
        checks,
        gaps,
      }),
      "utf8",
    ),
  ]);

  console.log(JSON.stringify({
    baseline_ok: baselineOk,
    ready_for_release0_close: readyForRelease0Close,
    report_path: reportPath,
    markdown_path: markdownPath,
    summary: report.summary,
    production_gaps: gaps.map((gap) => ({
      key: gap.key,
      severity: gap.severity,
      step_id: gap.step_id,
    })),
  }, null, 2));

  if (!baselineOk) {
    process.exitCode = 1;
  }
}

runDiagnostic().catch((error) => {
  console.error(JSON.stringify({
    baseline_ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
