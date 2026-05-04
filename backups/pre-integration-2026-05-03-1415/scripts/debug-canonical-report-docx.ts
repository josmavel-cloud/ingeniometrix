import fs from "node:fs";
import path from "node:path";

import { generateTemplatePreviewBundle } from "@/server/reporting/reporting-engine";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const templateKey = readArg("--template-key");
  const templateVersionId = readArg("--template-version-id");
  const outputPath =
    readArg("--output") ??
    path.join(process.cwd(), "artifacts-local", "canonical-report-document.docx");
  const outputDir = path.join(
    path.dirname(outputPath),
    `${path.parse(outputPath).name}.bundle`,
  );

  if (!templateKey && !templateVersionId) {
    throw new Error("Usa --template-key o --template-version-id.");
  }

  const bundle = await generateTemplatePreviewBundle({
    templateKey: templateKey ?? undefined,
    templateVersionId: templateVersionId ?? undefined,
    outputDir,
  });

  let finalOutputPath = outputPath;
  try {
    if (path.resolve(bundle.paths.docx) !== path.resolve(outputPath)) {
      fs.copyFileSync(bundle.paths.docx, outputPath);
    }
  } catch {
    finalOutputPath = bundle.paths.docx;
  }

  console.log(
    JSON.stringify(
      {
        templateKey: bundle.templateKey,
        versionId: bundle.templateVersionId,
        outputPath: finalOutputPath,
        syntheticJsonPath: bundle.paths.syntheticJson,
        canonicalJsonPath: bundle.paths.canonicalJson,
        summaryJsonPath: bundle.paths.summaryJson,
        sectionCount: bundle.canonicalDocument.body.sections.length,
        annexCount: bundle.canonicalDocument.annexes.length,
        referenceCount: bundle.canonicalDocument.references.length,
        valid: bundle.validation.valid,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
