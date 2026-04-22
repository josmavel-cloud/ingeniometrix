import { buildSyntheticDocumentFromTemplateVersion } from "@/server/reporting/synthetic-document/build-synthetic-document-from-template-version";

import { buildCanonicalReportFromSynthetic } from "./build-canonical-report-from-synthetic";

export async function buildCanonicalReportFromTemplateVersion(input: {
  templateVersionId?: string;
  templateKey?: string;
  variantSeed?: number;
}) {
  const syntheticResult = await buildSyntheticDocumentFromTemplateVersion(input);
  const canonicalDocument = buildCanonicalReportFromSynthetic({
    runtime: syntheticResult.runtime,
    document: syntheticResult.document,
  });

  return {
    runtime: syntheticResult.runtime,
    syntheticDocument: syntheticResult.document,
    validation: syntheticResult.validation,
    canonicalDocument,
  };
}
