import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { runMasterBlueprintSteps5To11Lab } from "@/server/blueprint-v2/lab/steps-5-11-runner";

type CliOptions = {
  caseName: string;
  fixtureDir?: string;
  outputDir?: string;
  offline: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    caseName: "blueprint-launch-latest",
    offline: false,
  };

  for (const arg of argv) {
    if (arg === "--offline") {
      options.offline = true;
      continue;
    }

    if (arg === "--allow-llm") {
      continue;
    }

    if (arg.startsWith("--case=")) {
      options.caseName = arg.slice("--case=".length) || options.caseName;
      continue;
    }

    if (arg.startsWith("--fixtures=")) {
      options.fixtureDir = arg.slice("--fixtures=".length) || undefined;
      continue;
    }

    if (arg.startsWith("--out=")) {
      options.outputDir = arg.slice("--out=".length) || undefined;
    }
  }

  return options;
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.offline) {
    process.env.LLM_PROVIDER = "lab-disabled";
  }

  const fixtures = await loadMasterBlueprintLabFixtureSet({
    caseName: options.caseName,
    fixtureDir: options.fixtureDir,
  });
  const outputDir =
    options.outputDir ||
    path.join(
      process.cwd(),
      "artifacts-local",
      "blueprint-v2-lab",
      "steps-5-11",
      fixtures.caseName,
      buildTimestamp(),
    );

  await mkdir(outputDir, { recursive: true });

  const result = await runMasterBlueprintSteps5To11Lab({
    fixtures,
    allowLlm: !options.offline,
  });

  await Promise.all([
    writeJson(path.join(outputDir, "00-fixture-summary.json"), {
      caseName: fixtures.caseName,
      fixtureDir: fixtures.fixtureDir,
      llmMode: options.offline ? "disabled" : "enabled",
      masterTemplateKey: result.master_template_key,
      rebuiltLedgerMatchesFixture: result.fixture_checks.rebuilt_ledger_matches_fixture,
      execution: result.execution,
    }),
    writeJson(path.join(outputDir, "10-section-prompt-plan.json"), result.section_prompt_plan),
    writeJson(path.join(outputDir, "20-master-section-drafts.json"), result.master_section_drafts),
    writeJson(path.join(outputDir, "30-consistency-matrix.json"), result.consistency_matrix),
    writeJson(path.join(outputDir, "40-legacy-blueprint.json"), result.legacy_blueprint),
    writeJson(path.join(outputDir, "50-provenance-report.json"), result.provenance_report),
    writeJson(path.join(outputDir, "60-validation-report.json"), result.validation_report),
    writeJson(path.join(outputDir, "70-university-blueprint.json"), result.university_blueprint),
    writeJson(path.join(outputDir, "80-lab-result.json"), result),
    writeJson(path.join(outputDir, "90-package-quality-summary.json"), result.package_quality_summary),
  ]);

  console.log(
    JSON.stringify(
      {
        caseName: fixtures.caseName,
        outputDir,
        masterTemplateKey: result.master_template_key,
        generatedDrafts: result.master_section_drafts.length,
        consistencyRows: result.consistency_matrix.length,
        validationPassed: result.validation_report.quality_report.passed,
        qualityScore: result.validation_report.quality_report.score_10,
        semanticRecommendation:
          result.validation_report.quality_report.semantic_review?.recommendation ?? "skipped",
        rebuiltLedgerMatchesFixture: result.fixture_checks.rebuilt_ledger_matches_fixture,
        llmMode: result.execution.llm_policy,
        providerName: result.execution.provider_name,
        fallbackSectionsCount: result.execution.fallback_sections_count,
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
