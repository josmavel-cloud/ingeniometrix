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
    path.join(process.cwd(), "artifacts-local", "canonical-report-document.json");
  const outputDir = path.dirname(outputPath);

  if (!templateKey && !templateVersionId) {
    throw new Error("Usa --template-key o --template-version-id.");
  }

  const bundle = await generateTemplatePreviewBundle({
    templateKey: templateKey ?? undefined,
    templateVersionId: templateVersionId ?? undefined,
    outputDir,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(bundle.paths.canonicalJson, outputPath);

  console.log(
    JSON.stringify(
      {
        templateKey: bundle.templateKey,
        versionId: bundle.templateVersionId,
        canonicalDocumentId: bundle.canonicalDocument.document_id,
        sectionCount: bundle.canonicalDocument.body.sections.length,
        annexCount: bundle.canonicalDocument.annexes.length,
        referenceCount: bundle.canonicalDocument.references.length,
        syntheticJsonPath: bundle.paths.syntheticJson,
        summaryJsonPath: bundle.paths.summaryJson,
        outputPath,
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
