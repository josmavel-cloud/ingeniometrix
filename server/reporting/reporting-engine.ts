import fs from "node:fs";
import path from "node:path";

import type { CanonicalReportDocument } from "@/server/reporting/canonical-report-types";
import { buildCanonicalReportFromBlueprint } from "@/server/reporting/blueprint-report/build-canonical-report-from-blueprint";
import { buildCanonicalReportFromTemplateVersion } from "@/server/reporting/canonical-report/build-canonical-report-from-template-version";
import { writeCanonicalReportDocxFile } from "@/server/reporting/docx/render-canonical-report-docx";
import { getArtifactsRoot } from "@/server/reporting/template-ingestion/local-artifacts";
import type { SyntheticTemplateDocument } from "@/server/reporting/synthetic-document-types";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildDefaultOutputDir(templateKey: string, versionId: string) {
  return path.join(
    getArtifactsRoot(),
    "reporting-engine",
    slugify(templateKey),
    versionId,
  );
}

function writeJsonFile(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

export type ReportingPreviewBundle = {
  templateKey: string;
  templateVersionId: string;
  outputDir: string;
  syntheticDocument: SyntheticTemplateDocument;
  canonicalDocument: CanonicalReportDocument;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  paths: {
    syntheticJson: string;
    canonicalJson: string;
    summaryJson: string;
    docx: string;
  };
};

export type BlueprintReportingBundle = {
  projectId: string;
  blueprintVersionId: string;
  templateKey: string;
  templateVersionId: string;
  outputDir: string;
  canonicalDocument: CanonicalReportDocument;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  paths: {
    canonicalJson: string;
    summaryJson: string;
    docx: string;
  };
};

export async function generateTemplatePreviewBundle(input: {
  templateVersionId?: string;
  templateKey?: string;
  outputDir?: string;
  variantSeed?: number;
}) {
  const result = await buildCanonicalReportFromTemplateVersion({
    templateKey: input.templateKey,
    templateVersionId: input.templateVersionId,
    variantSeed: input.variantSeed,
  });

  const outputDir =
    input.outputDir ??
    buildDefaultOutputDir(result.runtime.templateKey, result.runtime.versionId);

  fs.mkdirSync(outputDir, { recursive: true });

  const syntheticJson = writeJsonFile(
    path.join(outputDir, "synthetic-template-document.json"),
    result.syntheticDocument,
  );
  const canonicalJson = writeJsonFile(
    path.join(outputDir, "canonical-report-document.json"),
    result.canonicalDocument,
  );

  const docxPath = path.join(outputDir, "preview.docx");
  await writeCanonicalReportDocxFile({
    document: result.canonicalDocument,
    outputPath: docxPath,
  });

  const summary = {
    templateKey: result.runtime.templateKey,
    templateVersionId: result.runtime.versionId,
    variantSeed: input.variantSeed ?? 1,
    outputDir,
    syntheticDocumentId: result.syntheticDocument.derived_from_template_version_id,
    canonicalDocumentId: result.canonicalDocument.document_id,
    sectionCount: result.canonicalDocument.body.sections.length,
    annexCount: result.canonicalDocument.annexes.length,
    referenceCount: result.canonicalDocument.references.length,
    validation: result.validation,
    paths: {
      syntheticJson,
      canonicalJson,
      docx: docxPath,
    },
  };

  const summaryJson = writeJsonFile(path.join(outputDir, "summary.json"), summary);

  return {
    templateKey: result.runtime.templateKey,
    templateVersionId: result.runtime.versionId,
    outputDir,
    syntheticDocument: result.syntheticDocument,
    canonicalDocument: result.canonicalDocument,
    validation: result.validation,
    paths: {
      syntheticJson,
      canonicalJson,
      summaryJson,
      docx: docxPath,
    },
  } satisfies ReportingPreviewBundle;
}

export async function generateBlueprintReportBundle(input: {
  projectId: string;
  blueprintVersionId: string;
  templateVersionId?: string;
  templateKey?: string;
  outputDir?: string;
}) {
  const result = await buildCanonicalReportFromBlueprint({
    projectId: input.projectId,
    blueprintVersionId: input.blueprintVersionId,
    templateVersionId: input.templateVersionId,
    templateKey: input.templateKey,
  });

  const outputDir =
    input.outputDir ??
    path.join(
      getArtifactsRoot(),
      "reporting-blueprint-engine",
      slugify(result.runtime.templateKey),
      result.runtime.versionId,
      result.blueprintVersion.id,
    );

  fs.mkdirSync(outputDir, { recursive: true });

  const canonicalJson = writeJsonFile(
    path.join(outputDir, "canonical-report-document.json"),
    result.canonicalDocument,
  );

  const docxPath = path.join(outputDir, "preview.docx");
  await writeCanonicalReportDocxFile({
    document: result.canonicalDocument,
    outputPath: docxPath,
  });

  const summary = {
    projectId: input.projectId,
    blueprintVersionId: result.blueprintVersion.id,
    templateKey: result.runtime.templateKey,
    templateVersionId: result.runtime.versionId,
    outputDir,
    canonicalDocumentId: result.canonicalDocument.document_id,
    sectionCount: result.canonicalDocument.body.sections.length,
    annexCount: result.canonicalDocument.annexes.length,
    referenceCount: result.canonicalDocument.references.length,
    validation: result.validation,
    paths: {
      canonicalJson,
      docx: docxPath,
    },
  };

  const summaryJson = writeJsonFile(path.join(outputDir, "summary.json"), summary);

  return {
    projectId: input.projectId,
    blueprintVersionId: result.blueprintVersion.id,
    templateKey: result.runtime.templateKey,
    templateVersionId: result.runtime.versionId,
    outputDir,
    canonicalDocument: result.canonicalDocument,
    validation: result.validation,
    paths: {
      canonicalJson,
      summaryJson,
      docx: docxPath,
    },
  } satisfies BlueprintReportingBundle;
}
