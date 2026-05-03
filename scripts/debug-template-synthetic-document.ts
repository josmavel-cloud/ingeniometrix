import fs from "node:fs";
import path from "node:path";

import { buildSyntheticDocumentFromTemplateVersion } from "@/server/reporting/synthetic-document/build-synthetic-document-from-template-version";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const templateKey = readArg("--template-key");
  const templateVersionId = readArg("--template-version-id");
  const outputPath =
    readArg("--output") ??
    path.join(process.cwd(), "artifacts-local", "synthetic-template-document.json");

  if (!templateKey && !templateVersionId) {
    throw new Error("Usa --template-key o --template-version-id.");
  }

  const result = await buildSyntheticDocumentFromTemplateVersion({
    templateKey: templateKey ?? undefined,
    templateVersionId: templateVersionId ?? undefined,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(
    JSON.stringify(
      {
        templateKey: result.runtime.templateKey,
        versionId: result.runtime.versionId,
        valid: result.validation.valid,
        errorCount: result.validation.errors.length,
        warningCount: result.document.warnings.length,
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
