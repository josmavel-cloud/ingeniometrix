import { access } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { loadLatestMasterBlueprintLabRun } from "@/server/blueprint-v2/lab/artifact-reader";
import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";

type SmokeOptions = {
  caseName: string;
  skipDb: boolean;
};

function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {
    caseName: "blueprint-launch-latest",
    skipDb: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--case=")) {
      options.caseName = arg.slice("--case=".length) || options.caseName;
      continue;
    }

    if (arg === "--skip-db") {
      options.skipDb = true;
    }
  }

  return options;
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Smoke test failed: ${message}`);
  }
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

async function runDbSmoke() {
  const masterRuntime = await loadMasterTemplateRuntimeV2();
  assertSmoke(
    masterRuntime.template_key === "MASTER_TEMPLATE_LATAM",
    "Master runtime key must be MASTER_TEMPLATE_LATAM.",
  );
  assertSmoke(
    masterRuntime.template_version_id,
    "Master runtime must expose a template version id.",
  );

  const problem = masterRuntime.sections.find(
    (section) => section.semantic_key === "problem_statement",
  );
  const objectives = masterRuntime.sections.find(
    (section) => section.semantic_key === "objectives",
  );
  const variables = masterRuntime.sections.filter((section) =>
    section.semantic_key.includes("variables") ||
    section.semantic_key.includes("categories"),
  );

  assertSmoke(problem?.title === "Planteamiento del problema", "Problem title must be canonical.");
  assertSmoke(objectives?.level === 1, "Objectives container must remain visible at level 1.");
  assertSmoke(
    variables.length === 1 && variables[0]?.semantic_key === "variables_or_categories",
    "Variables/categories must be represented as one canonical master section.",
  );

  const pucpRuntime = await loadTemplateVersionRuntime({
    templateKey: "PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL",
  });
  assertSmoke(
    pucpRuntime.templateKey === "PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL",
    "PUCP institutional runtime must load from DB.",
  );

  return {
    masterTemplateKey: masterRuntime.template_key,
    masterTemplateVersionId: masterRuntime.template_version_id,
    masterSectionCount: masterRuntime.sections.length,
    institutionalTemplateKey: pucpRuntime.templateKey,
    institutionalTemplateVersionId: pucpRuntime.versionId,
  };
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseArgs(process.argv.slice(2));

  const fixtures = await loadMasterBlueprintLabFixtureSet({
    caseName: options.caseName,
  });
  assertSmoke(fixtures.project?.intake, "fixture project intake must exist.");
  assertSmoke(
    fixtures.sourceGate.selected_sources.length > 0,
    "fixture must include selected sources.",
  );
  assertSmoke(
    fixtures.evidenceLedger.snippets.length > 0,
    "fixture evidence ledger must include snippets.",
  );

  const latest = await loadLatestMasterBlueprintLabRun({
    caseName: options.caseName,
  });
  const runDir = latest.artifactRun?.runDir;
  assertSmoke(runDir, "latest lab response must include artifact run directory.");
  const promptPlan = asRecord(latest.artifacts.promptPlan);
  const sectionDrafts = asRecord(latest.artifacts.sectionDrafts);
  const draftList = asArray(sectionDrafts.drafts);
  const masterQa = asRecord(latest.artifacts.masterDocxQaReport);
  const universityQa = asRecord(latest.artifacts.universityDocxQaReport);
  const masterManifest = asRecord(latest.artifacts.masterDocxRender);
  const universityManifest = asRecord(latest.artifacts.universityDocxRender);
  const masterDocxPath = String(masterManifest.output_docx_path ?? "");
  const universityDocxPath = String(universityManifest.output_docx_path ?? "");

  assertSmoke(
    asArray(promptPlan.generation_plan).length > 0,
    "latest artifact must include a generation plan.",
  );
  assertSmoke(draftList.length > 0, "latest artifact must include section drafts.");
  assertSmoke(masterQa.passed === true, "master DOCX QA must pass in latest artifact.");
  assertSmoke(universityQa.passed === true, "university DOCX QA must pass in latest artifact.");
  assertSmoke(masterDocxPath && (await fileExists(masterDocxPath)), "master DOCX file must exist.");
  assertSmoke(
    universityDocxPath && (await fileExists(universityDocxPath)),
    "university DOCX file must exist.",
  );

  const dbSmoke = options.skipDb ? null : await runDbSmoke();

  console.log(
    JSON.stringify(
      {
        status: "pass",
        caseName: options.caseName,
        runDir,
        dbChecked: !options.skipDb,
        fixtures: {
          selectedSources: fixtures.sourceGate.selected_sources.length,
          snippets: fixtures.evidenceLedger.snippets.length,
          assets: fixtures.evidenceLedger.assets.length,
        },
        artifacts: {
          generationPlanItems: asArray(promptPlan.generation_plan).length,
          drafts: draftList.length,
          masterDocx: path.relative(process.cwd(), masterDocxPath),
          universityDocx: path.relative(process.cwd(), universityDocxPath),
          masterQaScore: masterQa.score_100 ?? null,
          universityQaScore: universityQa.score_100 ?? null,
        },
        db: dbSmoke,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
