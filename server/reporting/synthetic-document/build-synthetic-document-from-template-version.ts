import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";

import { generateSyntheticContent } from "./generate-synthetic-content";
import { validateSyntheticDocument } from "./validate-synthetic-document";

export async function buildSyntheticDocumentFromTemplateVersion(input: {
  templateVersionId?: string;
  templateKey?: string;
  variantSeed?: number;
}) {
  const runtime = await loadTemplateVersionRuntime(input);
  const document = generateSyntheticContent(runtime, {
    variantSeed: input.variantSeed,
  });
  const validation = validateSyntheticDocument({
    runtime,
    document,
  });

  return {
    runtime,
    document: {
      ...document,
      warnings: Array.from(new Set([...document.warnings, ...validation.warnings])),
    },
    validation,
  };
}
