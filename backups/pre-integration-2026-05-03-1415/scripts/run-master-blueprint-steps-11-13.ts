import { loadEnvConfig } from "@next/env";

import { runMasterBlueprintSteps11To13 } from "@/server/blueprint-v2/lab/steps-11-13-runner";

type CliOptions = {
  caseName: string;
  runDir?: string;
  reuseCachedSemanticArtifacts: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    caseName: "blueprint-launch-latest",
    reuseCachedSemanticArtifacts: true,
  };

  for (const arg of argv) {
    if (arg.startsWith("--case=")) {
      options.caseName = arg.slice("--case=".length) || options.caseName;
      continue;
    }

    if (arg.startsWith("--run-dir=")) {
      options.runDir = arg.slice("--run-dir=".length) || undefined;
      continue;
    }

    if (arg === "--force-semantic") {
      options.reuseCachedSemanticArtifacts = false;
    }
  }

  return options;
}

async function main() {
  loadEnvConfig(process.cwd());

  const options = parseArgs(process.argv.slice(2));
  const result = await runMasterBlueprintSteps11To13({
    caseName: options.caseName,
    runDir: options.runDir,
    reuseCachedSemanticArtifacts: options.reuseCachedSemanticArtifacts,
  });

  console.log(
    JSON.stringify(
      {
        caseName: result.caseName,
        runDir: result.runDir,
        step11Status: result.step11.status,
        validationScore10: result.step11.validation_score_10,
        validationPassed: result.step11.validation_passed,
        masterDocx: result.step12.output_docx_path,
        masterDocxSize: result.step12.file_size_bytes,
        universityDocx: result.step13.output_docx_path,
        universityDocxSize: result.step13.file_size_bytes,
        masterWarnings: result.step12.warnings,
        universityWarnings: result.step13.warnings,
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
