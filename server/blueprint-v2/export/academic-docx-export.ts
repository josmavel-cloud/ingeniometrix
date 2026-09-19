import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import JSZip from "jszip";

import type { BlueprintVersion, Intake, Project, ProjectReference, Reference } from "@prisma/client";

import { normalizeLanguageCode } from "@/lib/language";
import { prisma } from "@/lib/prisma";
import { applyAcademicHeroImageGeneration } from "@/server/blueprint-v2/lab/academic-document-hero-image";
import { applyAcademicDocumentPublicSanitizationPass } from "@/server/blueprint-v2/lab/academic-document-public-sanitizer";
import {
  buildMasterAcademicDocument,
  normalizeEnglishAcademicDocument,
  buildUniversityAcademicDocument,
} from "@/server/blueprint-v2/lab/academic-document-compiler";
import {
  renderMasterDocx,
  renderUniversityDocx,
} from "@/server/blueprint-v2/lab/docx-renderer";
import {
  buildConsistencyMatrixArtifactFromSections,
  type ConsistencyMatrixArtifact,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type {
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterBlueprintPackage,
  MasterBlueprintValidationReport,
} from "@/server/blueprint-v2/types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

type ProjectForExport = Project & {
  intake: Intake | null;
  projectReferences: Array<ProjectReference & { reference: Reference }>;
};

type BlueprintVersionForExport = BlueprintVersion & {
  project: ProjectForExport;
};

function asObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isMasterBlueprintPackage(value: unknown): value is MasterBlueprintPackage {
  const record = asObjectRecord(value);

  return Boolean(
    record?.manifest &&
      record?.evidence_ledger &&
      record?.master_template &&
      Array.isArray(record?.master_section_drafts) &&
      record?.legacy_blueprint &&
      record?.university_blueprint,
  );
}

function resolveBlueprintPackage(blueprintJson: unknown) {
  const record = asObjectRecord(blueprintJson);
  const packageCandidate = record?.master_blueprint_engine;

  return isMasterBlueprintPackage(packageCandidate) ? packageCandidate : null;
}

function buildMatrixArtifact(
  packageJson: MasterBlueprintPackage,
  language?: string | null,
) {
  const candidate = asObjectRecord(
    (packageJson as MasterBlueprintPackage & {
      consistency_matrix_artifact?: unknown;
    }).consistency_matrix_artifact,
  );

  if (candidate?.artifact_type === "consistency_matrix") {
    return candidate as unknown as ConsistencyMatrixArtifact;
  }

  return buildConsistencyMatrixArtifactFromSections(packageJson.master_section_drafts, {
    language,
  });
}

function buildRunDir(input: {
  runId: string;
  projectId: string;
  versionId: string;
}) {
  return path.join(
    process.cwd(),
    "artifacts-local",
    "project-docx-exports",
    input.projectId,
    input.versionId,
    input.runId,
  );
}

function withEffectiveLanguage(
  project: ProjectForExport,
  languageOverride?: string | null,
): MasterBlueprintEngineProject {
  if (!project.intake) {
    throw new Error("El proyecto no tiene intake para renderizar DOCX academico.");
  }

  const effectiveLanguage =
    normalizeLanguageCode(languageOverride) ?? normalizeLanguageCode(project.language) ?? "es";

  return {
    ...project,
    language: effectiveLanguage,
    intake: project.intake,
  };
}

function resolveOutputName(input: {
  project: ProjectForExport;
  version: BlueprintVersion;
  variant: "master" | "university";
}) {
  const titleSeed = `${input.project.title || "ingeniometrix"}-${input.variant}-v${input.version.versionNumber}`;

  return `${titleSeed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()}.docx`;
}

function normalizeEnglishDocxXml(value: string) {
  return value
    .replace(/retroalimentaci(?:o|\u00f3|o\u0301|\u00c3\u00b3)n/gi, "feedback")
    .replace(/investigaci(?:o|\u00f3|o\u0301|\u00c3\u00b3)n/gi, "research")
    .replace(/acad(?:e|\u00e9|e\u0301|\u00c3\u00a9)mica/gi, "academic")
    .replace(/acad(?:e|\u00e9|e\u0301|\u00c3\u00a9)mico/gi, "academic")
    .replace(/maestr(?:i|\u00ed|i\u0301|\u00c3\u00ad)a/gi, "master's program")
    .replace(/Per(?:u|\u00fa|u\u0301|\u00c3\u00ba)/g, "Peru")
    .replace(/plan de tesis institucional/gi, "institutional thesis plan")
    .replace(/planteamiento del problema/gi, "problem statement")
    .replace(/matriz de consistencia/gi, "consistency matrix")
    .replace(/presupuesto preliminar/gi, "preliminary budget")
    .replace(/cronograma de investigaci(?:o|\u00f3|o\u0301|\u00c3\u00b3)n/gi, "research schedule")
    .replace(/elaboraci(?:o|\u00f3|o\u0301|\u00c3\u00b3)n propia/gi, "own elaboration")
    .replace(/cotizaciones de proveedor/gi, "vendor quotations");
}

async function enforceDocxLanguageOutput(input: {
  docxPath: string;
  language: string;
}) {
  if (input.language !== "en") {
    return false;
  }

  const zip = await JSZip.loadAsync(await readFile(input.docxPath));
  let touched = false;

  for (const fileName of Object.keys(zip.files)) {
    if (!fileName.startsWith("word/") || !fileName.endsWith(".xml")) {
      continue;
    }

    const file = zip.file(fileName);
    if (!file) {
      continue;
    }

    const current = await file.async("string");
    const next = normalizeEnglishDocxXml(current);
    if (next === current) {
      continue;
    }

    zip.file(fileName, next);
    touched = true;
  }

  if (!touched) {
    return false;
  }

  await writeFile(input.docxPath, await zip.generateAsync({ type: "nodebuffer" }));
  return true;
}

export async function renderBlueprintV2AcademicDocxBuffer(input: {
  userId: string;
  projectId: string;
  blueprintVersionId: string;
  languageOverride?: string | null;
  variant?: "master" | "university";
}) {
  const blueprintVersion = await prisma.blueprintVersion.findFirst({
    where: {
      id: input.blueprintVersionId,
      projectId: input.projectId,
      project: {
        userId: input.userId,
      },
    },
    include: {
      project: {
        include: {
          intake: true,
          projectReferences: {
            orderBy: { selectedOrder: "asc" },
            include: { reference: true },
          },
        },
      },
    },
  }) as BlueprintVersionForExport | null;

  if (!blueprintVersion) {
    throw new Error("Version de blueprint no encontrada.");
  }

  const packageJson = resolveBlueprintPackage(blueprintVersion.blueprintJson);

  if (!packageJson) {
    return null;
  }

  const project = withEffectiveLanguage(blueprintVersion.project, input.languageOverride);
  const matrixArtifact = buildMatrixArtifact(packageJson, project.language);
  const evidenceLedger = packageJson.evidence_ledger as EvidenceLedger;
  const validationReport = packageJson.validation_report as MasterBlueprintValidationReport;
  const legacyBlueprint = {
    ...(packageJson.legacy_blueprint as ResearchBlueprintRecord),
    language: project.language,
  } as ResearchBlueprintRecord;
  const variant = input.variant ?? "university";
  const runDir = buildRunDir({
    runId: packageJson.manifest.run_id,
    projectId: input.projectId,
    versionId: input.blueprintVersionId,
  });
  await mkdir(runDir, { recursive: true });

  const baseDocument =
    variant === "master"
      ? buildMasterAcademicDocument({
          project,
          masterTemplate: packageJson.master_template,
          drafts: packageJson.master_section_drafts,
          matrixArtifact,
          evidenceLedger,
          legacyBlueprint,
          consolidatedAssetUsagePlan: [],
        })
      : buildUniversityAcademicDocument({
          project,
          universityBlueprint: packageJson.university_blueprint,
          matrixArtifact,
          evidenceLedger,
          legacyBlueprint,
          consolidatedAssetUsagePlan: [],
        });
  const sanitizedDocument = applyAcademicDocumentPublicSanitizationPass(baseDocument);
  const localizedDocument =
    project.language === "en"
      ? normalizeEnglishAcademicDocument(sanitizedDocument)
      : sanitizedDocument;
  const academicDocumentWithHero = await applyAcademicHeroImageGeneration({
    runDir,
    document: localizedDocument,
  });
  const academicDocument =
    project.language === "en"
      ? normalizeEnglishAcademicDocument(academicDocumentWithHero)
      : academicDocumentWithHero;
  const outputPath = path.join(
    runDir,
    resolveOutputName({
      project,
      version: blueprintVersion,
      variant,
    }),
  );
  const manifest =
    variant === "master"
      ? await renderMasterDocx({
          project,
          masterTemplate: packageJson.master_template,
          drafts: packageJson.master_section_drafts,
          matrixArtifact,
          evidenceLedger,
          validationReport,
          legacyBlueprint,
          consolidatedAssetUsagePlan: [],
          academicDocumentOverride: academicDocument,
          outputPath,
          runDir,
        })
      : await renderUniversityDocx({
          project,
          universityBlueprint: packageJson.university_blueprint,
          matrixArtifact,
          evidenceLedger,
          validationReport,
          legacyBlueprint,
          consolidatedAssetUsagePlan: [],
          academicDocumentOverride: academicDocument,
          outputPath,
          runDir,
        });
  const docxLanguagePatched = await enforceDocxLanguageOutput({
    docxPath: manifest.output_docx_path,
    language: project.language,
  });
  const fileSizeBytes = (await stat(manifest.output_docx_path)).size;
  const finalManifest = {
    ...manifest,
    file_size_bytes: fileSizeBytes,
    language_post_render_patch: docxLanguagePatched,
  };

  await writeFile(
    path.join(runDir, `${variant}-docx-manifest.json`),
    `${JSON.stringify(finalManifest, null, 2)}\n`,
    "utf8",
  );

  return {
    buffer: await readFile(finalManifest.output_docx_path),
    filename: finalManifest.output_docx_file_name,
    manifest: finalManifest,
  };
}
