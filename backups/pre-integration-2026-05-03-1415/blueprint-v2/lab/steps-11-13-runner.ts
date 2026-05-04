import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getConfiguredLlmProvider } from "@/llm";
import { buildLegacyBlueprintFromMaster } from "@/server/blueprint-v2/compose/blueprint-composition-engine";
import {
  deriveUniversityBlueprint,
  type UniversityBlueprintTemplateRuntimeOverride,
} from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";
import { applyAcademicDocumentEditorialPass } from "@/server/blueprint-v2/lab/academic-document-editorial-pass";
import { applyAcademicHeroImageGeneration } from "@/server/blueprint-v2/lab/academic-document-hero-image";
import { applyAcademicDocumentLayoutPass } from "@/server/blueprint-v2/lab/academic-document-layout-pass";
import { applyAcademicDocumentPublicSanitizationPass } from "@/server/blueprint-v2/lab/academic-document-public-sanitizer";
import {
  buildMasterAcademicDocument,
  buildUniversityAcademicDocument,
} from "@/server/blueprint-v2/lab/academic-document-compiler";
import { validateDocxPackage } from "@/server/blueprint-v2/lab/docx-qa-engine";
import {
  renderMasterDocx,
  renderUniversityDocx,
  type LabDocxRenderManifest,
} from "@/server/blueprint-v2/lab/docx-renderer";
import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { buildPackageQualitySummary } from "@/server/blueprint-v2/lab/package-quality-summary";
import {
  buildLabBlueprintTemplateContext,
  buildMasterTemplateLatamRuntimeFixture,
  getLabUniversityTemplateRuntime,
} from "@/server/blueprint-v2/lab/template-fixtures";
import type { MasterBlueprintSteps5To11LabResult } from "@/server/blueprint-v2/lab/types";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type {
  DocumentProvenanceReport,
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  PdfAssetRecord,
  UniversityBlueprintPackage,
} from "@/server/blueprint-v2/types";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import { validateMasterBlueprintPackage } from "@/server/blueprint-v2/validation/blueprint-validation-engine";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import { loadTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import { MASTER_TEMPLATE_LATAM_KEY } from "@/server/reporting/template-runtime/master-template";
import { resolveBlueprintTemplateRuntime } from "@/server/reporting/template-runtime/resolve-blueprint-template-runtime";

const LAB_RUN_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint-v2-lab",
  "steps-5-11",
);
const READONLY_EXTRACTED_ASSETS_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "extracted_assets",
  "run-2026-05-01T16-23-06-878Z",
);
const LAB_INSTITUTIONAL_EXAMPLE_TEMPLATE_KEYS = [
  "PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL",
] as const;

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    return await readJson<T>(filePath);
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function getLatestRunDir(caseName: string) {
  const caseDir = path.join(LAB_RUN_ROOT, caseName);
  const entries = await readdir(caseDir, { withFileTypes: true });
  const dirs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const fullPath = path.join(caseDir, entry.name);
        const stats = await stat(fullPath);
        return {
          name: entry.name,
          fullPath,
          mtimeMs: stats.mtimeMs,
        };
      }),
  );
  const latest = dirs
    .sort((left, right) => right.name.localeCompare(left.name) || right.mtimeMs - left.mtimeMs)
    .at(0);

  if (!latest) {
    throw new Error(`No hay runs locales para el caso ${caseName}.`);
  }

  return latest.fullPath;
}

function buildMatrixDraft(input: {
  drafts: MasterSectionDraft[];
  matrixArtifact: ConsistencyMatrixArtifact;
}): MasterSectionDraft {
  return {
    section_key: "consistency_matrix",
    title: "Matriz de consistencia",
    phase: "matrix",
    content: input.matrixArtifact.specific_rows
      .map(
        (row) =>
          `${row.row_id ?? `OE${row.index}`}. Interrogante: ${row.interrogante_especifica ?? "Por precisar"} | Objetivo: ${row.objetivo_especifico ?? "Por precisar"} | Hipotesis: ${row.hipotesis_especifica ?? "Por precisar"}`,
      )
      .join("\n"),
    content_kind: "table",
    support_level: "reference_supported",
    supported_source_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_source_ids)),
    ),
    supported_pdf_source_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_pdf_source_ids)),
    ),
    supported_web_source_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_web_source_ids)),
    ),
    supported_assumption_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.supported_assumption_ids)),
    ),
    evidence_snippet_ids: Array.from(
      new Set(input.drafts.flatMap((draft) => draft.evidence_snippet_ids)),
    ),
    warnings: input.matrixArtifact.validation.warnings,
    prompt:
      "Compuesta desde consistencyMatrixArtifact v3; renderizada como table_model horizontal en DOCX.",
  };
}

function methodologyFromMatrix(matrixArtifact: ConsistencyMatrixArtifact) {
  const method = matrixArtifact.methodology_block;
  return [
    method.tipo_investigacion,
    method.diseno_investigacion,
    method.ambito_estudio ? `Ambito: ${method.ambito_estudio}` : null,
    method.poblacion ? `Poblacion: ${method.poblacion}` : null,
    method.muestra ? `Muestra: ${method.muestra}` : null,
    method.tecnicas_recoleccion.length
      ? `Tecnicas: ${method.tecnicas_recoleccion.join("; ")}`
      : null,
    method.instrumentos.length ? `Instrumentos: ${method.instrumentos.join("; ")}` : null,
    method.plan_analisis ? `Plan de analisis: ${method.plan_analisis}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function alignBlueprintWithMatrix(input: {
  blueprint: ResearchBlueprintRecord;
  matrixArtifact: ConsistencyMatrixArtifact;
}) {
  const rows = input.matrixArtifact.specific_rows;
  const categories = input.matrixArtifact.variables_block.categorias;

  return {
    ...input.blueprint,
    general_objective:
      input.matrixArtifact.general_block.objetivo_general ?? input.blueprint.general_objective,
    research_questions: rows
      .map((row) => row.interrogante_especifica)
      .filter((item): item is string => Boolean(item)),
    specific_objectives: rows
      .map((row) => row.objetivo_especifico)
      .filter((item): item is string => Boolean(item)),
    hypotheses_or_guiding_questions: rows
      .map((row) => row.hipotesis_especifica)
      .filter((item): item is string => Boolean(item)),
    key_constructs_or_variables:
      categories.length > 0 ? categories : input.blueprint.key_constructs_or_variables,
    proposed_methodology:
      methodologyFromMatrix(input.matrixArtifact) || input.blueprint.proposed_methodology,
    population_and_sample:
      [
        input.matrixArtifact.methodology_block.poblacion,
        input.matrixArtifact.methodology_block.muestra,
      ]
        .filter(Boolean)
        .join(" ") || input.blueprint.population_and_sample,
    data_collection_techniques:
      input.matrixArtifact.methodology_block.tecnicas_recoleccion.length > 0
        ? input.matrixArtifact.methodology_block.tecnicas_recoleccion
        : input.blueprint.data_collection_techniques,
    analysis_plan:
      input.matrixArtifact.methodology_block.plan_analisis ?? input.blueprint.analysis_plan,
    consistency_matrix: input.matrixArtifact.legacy_rows,
    engine_warnings: Array.from(
      new Set([
        ...(input.blueprint.engine_warnings ?? []),
        ...input.matrixArtifact.validation.warnings,
      ]),
    ),
  } satisfies ResearchBlueprintRecord;
}

type ConsolidatedHandoffContext = {
  assetUsagePlan: Array<Record<string, unknown>>;
  sourcePriorities: Array<Record<string, unknown>>;
};

async function loadConsolidatedHandoffContext(): Promise<ConsolidatedHandoffContext> {
  const consolidated = await readJsonOrNull<{
    asset_usage_plan?: Array<Record<string, unknown>>;
    source_priorities?: Array<Record<string, unknown>>;
  }>(
    path.join(
      process.cwd(),
      "artifacts-local",
      "blueprint_launch",
      "consolidated_evidence",
      "latest-consolidated-evidence.json",
    ),
  );

  return {
    assetUsagePlan: consolidated?.asset_usage_plan ?? [],
    sourcePriorities: consolidated?.source_priorities ?? [],
  };
}

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSourceIdBridge(input: {
  evidenceLedger: EvidenceLedger;
  sourcePriorities: Array<Record<string, unknown>>;
}) {
  const byTitle = new Map(
    input.evidenceLedger.source_registry.map((source) => [
      normalizeTitle(source.title),
      source.source_id,
    ]),
  );
  const bridge = new Map<string, string>();

  for (const sourcePriority of input.sourcePriorities) {
    const upstreamSourceId = String(sourcePriority.source_id ?? "").trim();
    const title = normalizeTitle(String(sourcePriority.title ?? ""));
    const localSourceId = byTitle.get(title);

    if (upstreamSourceId && localSourceId) {
      bridge.set(upstreamSourceId, localSourceId);
    }
  }

  return bridge;
}

function normalizeAssetKind(kind: unknown): PdfAssetRecord["kind"] {
  if (kind === "image" || kind === "equation" || kind === "table") {
    return kind;
  }

  if (kind === "figure" || kind === "diagram") {
    return "image";
  }

  return "table";
}

function sourceIdToExtractedAssetDirName(sourceId: string) {
  return sourceId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mimeTypeFromFilePath(filePath: string | null) {
  const ext = path.extname(filePath ?? "").toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }

  if (ext === ".gif") {
    return "image/gif";
  }

  if (ext === ".bmp") {
    return "image/bmp";
  }

  return null;
}

async function resolveReadonlyExtractedImagePath(input: {
  assetKey: string;
  upstreamSourceId: string;
  kind: PdfAssetRecord["kind"];
}) {
  if (input.kind !== "image") {
    return null;
  }

  const sourceDir = path.join(
    READONLY_EXTRACTED_ASSETS_ROOT,
    sourceIdToExtractedAssetDirName(input.upstreamSourceId),
  );
  const assetKey = input.assetKey.toLowerCase();
  const supportedExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp"]);

  try {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .filter((entry) => supportedExts.has(path.extname(entry.name).toLowerCase()))
        .filter((entry) => entry.name.toLowerCase().includes(assetKey))
        .map(async (entry) => {
          const fullPath = path.join(sourceDir, entry.name);
          const stats = await stat(fullPath);
          return {
            fullPath,
            ext: path.extname(entry.name).toLowerCase(),
            size: stats.size,
          };
        }),
    );
    const viable = candidates.filter((candidate) => candidate.size > 2_000);

    return (
      viable
        .sort((left, right) => {
          const leftExtScore = left.ext === ".png" ? 2 : 1;
          const rightExtScore = right.ext === ".png" ? 2 : 1;
          return rightExtScore - leftExtScore || right.size - left.size;
        })
        .at(0)?.fullPath ?? null
    );
  } catch {
    return null;
  }
}

async function hydrateEvidenceLedgerFromAssetPlan(input: {
  evidenceLedger: EvidenceLedger;
  assetUsagePlan: Array<Record<string, unknown>>;
  sourceIdBridge: Map<string, string>;
}): Promise<EvidenceLedger> {
  if (input.assetUsagePlan.length === 0) {
    return input.evidenceLedger;
  }

  const seenHandoffKeys = new Set<string>();
  const handoffAssets = (
    await Promise.all(
      input.assetUsagePlan.map(async (asset): Promise<PdfAssetRecord | null> => {
      const assetKey = String(asset.asset_key ?? "").trim();
      const upstreamSourceId = String(asset.source_id ?? "").trim();
      const sourceId = input.sourceIdBridge.get(upstreamSourceId) ?? upstreamSourceId;
      const assetKind = normalizeAssetKind(asset.asset_kind);
      const dedupeKey = `${sourceId}|${assetKey}`;

      if (!assetKey || !sourceId || seenHandoffKeys.has(dedupeKey)) {
        return null;
      }

      seenHandoffKeys.add(dedupeKey);
      const explicitFilePath = typeof asset.file_path === "string" ? asset.file_path : null;
      const resolvedFilePath =
        explicitFilePath ??
        (await resolveReadonlyExtractedImagePath({
          assetKey,
          upstreamSourceId,
          kind: assetKind,
        }));

      return {
        source_id: sourceId,
        asset_key: assetKey,
        title: String(asset.title ?? asset.asset_key ?? "Asset del handoff previo"),
        kind: assetKind,
        caption: String(asset.usage_reason ?? "Asset planificado desde el handoff previo."),
        page_number: null,
        file_path: resolvedFilePath,
        mime_type: mimeTypeFromFilePath(resolvedFilePath),
        width_px: null,
        height_px: null,
        text_content: Array.isArray(asset.handling_notes)
          ? asset.handling_notes.map(String).join("\n")
          : null,
        extraction_origin: resolvedFilePath ? "pdf_native" : "llm_reconstructed",
        extracted: Boolean(resolvedFilePath),
      };
    })
    )
  ).filter((asset): asset is PdfAssetRecord => Boolean(asset));

  if (handoffAssets.length === 0) {
    return input.evidenceLedger;
  }

  const mergedAssets = [...input.evidenceLedger.assets];
  for (const handoffAsset of handoffAssets) {
    const existingIndex = mergedAssets.findIndex(
      (asset) =>
        asset.asset_key === handoffAsset.asset_key && asset.source_id === handoffAsset.source_id,
    );

    if (existingIndex >= 0) {
      const existingAsset = mergedAssets[existingIndex];
      mergedAssets[existingIndex] = {
        ...existingAsset,
        file_path: existingAsset.file_path ?? handoffAsset.file_path,
        mime_type: existingAsset.mime_type ?? handoffAsset.mime_type,
        text_content: existingAsset.text_content ?? handoffAsset.text_content,
        extraction_origin: existingAsset.file_path
          ? existingAsset.extraction_origin
          : handoffAsset.extraction_origin,
        extracted: existingAsset.extracted || handoffAsset.extracted,
      };
      continue;
    }

    mergedAssets.push(handoffAsset);
  }

  const assetsBySourceId = new Map<string, PdfAssetRecord[]>();
  for (const asset of mergedAssets) {
    assetsBySourceId.set(asset.source_id, [
      ...(assetsBySourceId.get(asset.source_id) ?? []),
      asset,
    ]);
  }

  return {
    ...input.evidenceLedger,
    assets: mergedAssets,
    evidence_packs: input.evidenceLedger.evidence_packs.map((pack) => ({
      ...pack,
      assets: Array.from(
        new Map(
          [...pack.assets, ...(assetsBySourceId.get(pack.source_id) ?? [])].map((asset) => [
            `${asset.source_id}|${asset.asset_key}`,
            asset,
          ]),
        ).values(),
      ),
    })),
    warnings: Array.from(
      new Set([
        ...input.evidenceLedger.warnings,
        `Assets hidratados desde handoff read-only previo: ${handoffAssets.length}.`,
        `Assets con archivo fisico resuelto: ${handoffAssets.filter((asset) => asset.file_path).length}.`,
      ]),
    ),
  };
}

export type Steps11To13Result = {
  caseName: string;
  runDir: string;
  executed_at: string;
  step11: {
    status: "pass" | "warn" | "blocked";
    validation_score_10: number;
    validation_passed: boolean;
    provenance_from_sources_pct: number;
    university_section_count: number;
    warnings: string[];
  };
  step12: LabDocxRenderManifest;
  step13: LabDocxRenderManifest;
};

async function deriveUniversityBlueprintForLab(input: {
  project: MasterBlueprintEngineProject;
  masterDrafts: MasterSectionDraft[];
}) {
  const runtimeResolution = await resolveLabInstitutionalRuntime(input.project);

  try {
    const universityBlueprint = await deriveUniversityBlueprint({
      project: input.project,
      masterDrafts: input.masterDrafts,
      templateRuntimeOverride: runtimeResolution.runtime,
    });

    return appendUniversityBlueprintWarnings(universityBlueprint, runtimeResolution.warnings);
  } catch (error) {
    const fallbackWarning = `No se pudo cargar/reducir la plantilla institucional desde BD; se uso fixture del lab: ${
      error instanceof Error ? error.message : "error desconocido"
    }`;
    const fallback = await deriveUniversityBlueprint({
      project: input.project,
      masterDrafts: input.masterDrafts,
      templateRuntimeOverride: getLabUniversityTemplateRuntime(input.project),
    });

    return {
      ...fallback,
      warnings: Array.from(
        new Set([...runtimeResolution.warnings, fallbackWarning, ...fallback.warnings]),
      ),
      reduction_plan: fallback.reduction_plan
        ? {
            ...fallback.reduction_plan,
            warnings: Array.from(
              new Set([
                ...runtimeResolution.warnings,
                fallbackWarning,
                ...fallback.reduction_plan.warnings,
              ]),
            ),
          }
        : fallback.reduction_plan,
    };
  }
}

async function loadMasterTemplateRuntimeForLab() {
  try {
    return await loadMasterTemplateRuntimeV2();
  } catch (error) {
    console.warn(
      `No se pudo cargar MASTER_TEMPLATE_LATAM desde BD; se usara fixture local del lab: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    );
    return buildMasterTemplateLatamRuntimeFixture();
  }
}

async function resolveLabInstitutionalRuntime(
  project: MasterBlueprintEngineProject,
): Promise<{
  runtime: UniversityBlueprintTemplateRuntimeOverride;
  warnings: string[];
}> {
  const warnings: string[] = [];

  try {
    const resolved = await resolveBlueprintTemplateRuntime({
      projectTemplateKey: project.templateKey,
      projectUniversity: project.university,
      projectDegreeLevel: project.degreeLevel,
      projectProgram: project.program,
    });

    if (resolved.runtime.templateKey !== MASTER_TEMPLATE_LATAM_KEY) {
      return {
        runtime: resolved.runtime,
        warnings: resolved.resolution.guidanceNotes,
      };
    }

    warnings.push(
      `El resolver institucional encontro solo ${MASTER_TEMPLATE_LATAM_KEY} para ${project.templateKey}/${project.university}; el lab buscara una plantilla institucional completa de ejemplo desde BD.`,
    );
  } catch (error) {
    warnings.push(
      `No se pudo resolver plantilla institucional primaria desde BD: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    );
  }

  for (const templateKey of LAB_INSTITUTIONAL_EXAMPLE_TEMPLATE_KEYS) {
    try {
      const runtime = await loadTemplateVersionRuntime({ templateKey });

      warnings.push(
        `Se uso ${runtime.templateName} (${runtime.templateKey}) como plantilla institucional completa de ejemplo desde BD para este lab.`,
      );

      return {
        runtime,
        warnings,
      };
    } catch (error) {
      warnings.push(
        `No se pudo cargar plantilla institucional de ejemplo ${templateKey}: ${
          error instanceof Error ? error.message : "error desconocido"
        }`,
      );
    }
  }

  warnings.push(
    "No se encontro plantilla institucional completa en BD; se usara fixture sintetico del lab.",
  );

  return {
    runtime: getLabUniversityTemplateRuntime(project),
    warnings,
  };
}

function appendUniversityBlueprintWarnings(
  blueprint: UniversityBlueprintPackage,
  warnings: string[],
) {
  if (warnings.length === 0) {
    return blueprint;
  }

  return {
    ...blueprint,
    warnings: Array.from(new Set([...warnings, ...blueprint.warnings])),
    reduction_plan: blueprint.reduction_plan
      ? {
          ...blueprint.reduction_plan,
          warnings: Array.from(new Set([...warnings, ...blueprint.reduction_plan.warnings])),
        }
      : blueprint.reduction_plan,
  } satisfies UniversityBlueprintPackage;
}

export async function runMasterBlueprintSteps11To13(input: {
  caseName?: string;
  runDir?: string;
  reuseCachedSemanticArtifacts?: boolean;
}) {
  const caseName = input.caseName ?? "blueprint-launch-latest";
  const reuseCachedSemanticArtifacts = input.reuseCachedSemanticArtifacts ?? true;
  const runDir = input.runDir ?? (await getLatestRunDir(caseName));
  const fixtures = await loadMasterBlueprintLabFixtureSet({ caseName });
  const [
    originalDrafts,
    matrixArtifact,
    result,
    cachedLegacyBlueprint,
    cachedProvenanceReport,
    cachedValidationReport,
    cachedCoherenceReport,
    cachedUniversityBlueprint,
  ] = await Promise.all([
    readJson<MasterSectionDraft[]>(path.join(runDir, "20-master-section-drafts.json")),
    readJson<ConsistencyMatrixArtifact>(
      path.join(runDir, "31-consistency-matrix-artifact.json"),
    ),
    readJsonOrNull<MasterBlueprintSteps5To11LabResult>(
      path.join(runDir, "80-lab-result.json"),
    ),
    readJsonOrNull<ResearchBlueprintRecord>(path.join(runDir, "40-legacy-blueprint.json")),
    readJsonOrNull<DocumentProvenanceReport>(path.join(runDir, "50-provenance-report.json")),
    readJsonOrNull<MasterBlueprintValidationReport>(
      path.join(runDir, "60-validation-report.json"),
    ),
    readJsonOrNull<MasterBlueprintSteps5To11LabResult["coherence_report"]>(
      path.join(runDir, "61-coherence-report.json"),
    ),
    readJsonOrNull<UniversityBlueprintPackage>(path.join(runDir, "70-university-blueprint.json")),
  ]);
  const sourceDrafts = originalDrafts.filter(
    (draft) => draft.section_key !== "consistency_matrix",
  );
  const matrixDraft = buildMatrixDraft({ drafts: sourceDrafts, matrixArtifact });
  const draftsWithMatrix = [...sourceDrafts, matrixDraft];
  const consolidatedHandoff = await loadConsolidatedHandoffContext();
  const sourceIdBridge = buildSourceIdBridge({
    evidenceLedger: fixtures.evidenceLedger,
    sourcePriorities: consolidatedHandoff.sourcePriorities,
  });
  const evidenceLedger = await hydrateEvidenceLedgerFromAssetPlan({
    evidenceLedger: fixtures.evidenceLedger,
    assetUsagePlan: consolidatedHandoff.assetUsagePlan,
    sourceIdBridge,
  });
  const masterTemplate = await loadMasterTemplateRuntimeForLab();
  const templateContext = buildLabBlueprintTemplateContext(fixtures.project);
  const { legacyBlueprint: composedBlueprint, referenceInsights } = buildLegacyBlueprintFromMaster({
    projectTitle: fixtures.project.title,
    projectTemplateKey: fixtures.project.templateKey,
    projectDegreeLevel: fixtures.project.degreeLevel,
    projectUniversity: fixtures.project.university,
    projectProgram: fixtures.project.program,
    researchLine: fixtures.project.intake.researchLine,
    drafts: draftsWithMatrix,
    evidenceLedger,
    consistencyMatrix: matrixArtifact.legacy_rows,
    templateContext,
    sourceGate: fixtures.sourceGate,
  });
  const legacyBlueprint = alignBlueprintWithMatrix({
    blueprint:
      reuseCachedSemanticArtifacts && cachedLegacyBlueprint
        ? cachedLegacyBlueprint
        : composedBlueprint,
    matrixArtifact,
  });
  const provenanceReport =
    reuseCachedSemanticArtifacts && cachedProvenanceReport
      ? cachedProvenanceReport
      : buildDocumentProvenanceReport(draftsWithMatrix);
  const validation =
    reuseCachedSemanticArtifacts && cachedValidationReport && cachedCoherenceReport
      ? {
          validationReport: cachedValidationReport,
          coherenceReport: cachedCoherenceReport,
        }
      : await validateMasterBlueprintPackage({
          project: fixtures.project,
          masterTemplate,
          evidenceLedger,
          drafts: draftsWithMatrix,
          legacyBlueprint,
          provenanceReport,
          pdfDownloadedCount: fixtures.pdfDownloads.records.filter(
            (record) => record.status === "downloaded",
          ).length,
        });
  const cachedUniversityBlueprintHasReductionPlan =
    cachedUniversityBlueprint?.reduction_plan?.artifact_version === "v1";
  const universityBlueprint =
    reuseCachedSemanticArtifacts && cachedUniversityBlueprint && cachedUniversityBlueprintHasReductionPlan
      ? cachedUniversityBlueprint
      : await deriveUniversityBlueprintForLab({
          project: fixtures.project,
          masterDrafts: draftsWithMatrix,
        });
  const packageQualitySummary = buildPackageQualitySummary({
    caseName,
    runDir,
    promptPlan: result?.section_prompt_plan ?? null,
    drafts: draftsWithMatrix,
    evidenceLedger,
    validationReport: validation.validationReport,
    execution: {
      llm_enabled: true,
      llm_policy: "required",
      provider_name: process.env.LLM_PROVIDER?.trim() || "openai",
      model_name: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
      fallback_sections_count: draftsWithMatrix.filter((draft) => draft.fallback_cause).length,
    },
  });
  let editorialProvider: ReturnType<typeof getConfiguredLlmProvider> | null = null;
  try {
    editorialProvider = getConfiguredLlmProvider();
  } catch {
    editorialProvider = null;
  }
  const masterAcademicDocument = await applyAcademicHeroImageGeneration({
    runDir,
    document: await applyAcademicDocumentLayoutPass({
      document: applyAcademicDocumentPublicSanitizationPass(
        await applyAcademicDocumentEditorialPass({
          document: buildMasterAcademicDocument({
            project: fixtures.project,
            masterTemplate,
            drafts: draftsWithMatrix,
            matrixArtifact,
            evidenceLedger,
            legacyBlueprint,
            consolidatedAssetUsagePlan: consolidatedHandoff.assetUsagePlan,
          }),
          provider: editorialProvider,
        }),
      ),
      provider: editorialProvider,
    }),
  });
  const universityAcademicDocument = await applyAcademicHeroImageGeneration({
    runDir,
    document: await applyAcademicDocumentLayoutPass({
      document: applyAcademicDocumentPublicSanitizationPass(
        await applyAcademicDocumentEditorialPass({
          document: buildUniversityAcademicDocument({
            project: fixtures.project,
            universityBlueprint,
            matrixArtifact,
            evidenceLedger,
            legacyBlueprint,
            consolidatedAssetUsagePlan: consolidatedHandoff.assetUsagePlan,
          }),
          provider: editorialProvider,
        }),
      ),
      provider: editorialProvider,
    }),
  });
  const masterAcademicModelPath = path.join(runDir, "115-master-academic-document-model.json");
  const universityAcademicModelPath = path.join(
    runDir,
    "135-university-academic-document-model.json",
  );
  const masterDocxManifest = await renderMasterDocx({
    project: fixtures.project,
    masterTemplate,
    drafts: draftsWithMatrix,
    matrixArtifact,
    evidenceLedger,
    validationReport: validation.validationReport,
    legacyBlueprint,
    consolidatedAssetUsagePlan: consolidatedHandoff.assetUsagePlan,
    academicDocumentOverride: masterAcademicDocument,
    outputPath: path.join(runDir, "12-master-docx-preview.docx"),
    runDir,
  });
  const universityDocxManifest = await renderUniversityDocx({
    project: fixtures.project,
    universityBlueprint,
    matrixArtifact,
    evidenceLedger,
    validationReport: validation.validationReport,
    legacyBlueprint,
    consolidatedAssetUsagePlan: consolidatedHandoff.assetUsagePlan,
    academicDocumentOverride: universityAcademicDocument,
    outputPath: path.join(runDir, "13-university-docx-preview.docx"),
    runDir,
  });
  const [masterDocxQaReport, universityDocxQaReport] = await Promise.all([
    validateDocxPackage({
      docxPath: masterDocxManifest.output_docx_path,
      minTableCount: 4,
      minSectionCount: 3,
      forbiddenSourceTitles: evidenceLedger.source_registry.map((source) => source.title),
    }),
    validateDocxPackage({
      docxPath: universityDocxManifest.output_docx_path,
      minTableCount: 3,
      minSectionCount: 3,
      forbiddenSourceTitles: evidenceLedger.source_registry.map((source) => source.title),
    }),
  ]);
  const masterDocxQaPath = path.join(runDir, "121-master-docx-qa-report.json");
  const universityDocxQaPath = path.join(runDir, "131-university-docx-qa-report.json");
  masterDocxManifest.academic_model_path = masterAcademicModelPath;
  masterDocxManifest.qa_report_path = masterDocxQaPath;
  masterDocxManifest.qa_passed = masterDocxQaReport.passed;
  masterDocxManifest.qa_score_100 = masterDocxQaReport.score_100;
  universityDocxManifest.academic_model_path = universityAcademicModelPath;
  universityDocxManifest.qa_report_path = universityDocxQaPath;
  universityDocxManifest.qa_passed = universityDocxQaReport.passed;
  universityDocxManifest.qa_score_100 = universityDocxQaReport.score_100;
  const step11Status =
    validation.validationReport.quality_report.hard_failures.length > 0
      ? "warn"
      : matrixArtifact.can_continue_step_11
        ? "pass"
        : "blocked";

  await Promise.all([
    writeJson(path.join(runDir, "20-master-section-drafts.json"), draftsWithMatrix),
    writeJson(path.join(runDir, "40-legacy-blueprint.json"), legacyBlueprint),
    writeJson(path.join(runDir, "50-provenance-report.json"), provenanceReport),
    writeJson(path.join(runDir, "60-validation-report.json"), validation.validationReport),
    writeJson(path.join(runDir, "61-coherence-report.json"), validation.coherenceReport),
    writeJson(path.join(runDir, "70-university-blueprint.json"), universityBlueprint),
    writeJson(
      path.join(runDir, "71-university-reduction-plan.json"),
      universityBlueprint.reduction_plan ?? null,
    ),
    writeJson(path.join(runDir, "90-package-quality-summary.json"), packageQualitySummary),
    writeJson(path.join(runDir, "110-blueprint-composition-artifact.json"), {
      artifact_type: "blueprint_composition",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      status: step11Status,
      legacyBlueprint,
      referenceInsights,
      validationReport: validation.validationReport,
      provenanceReport,
      universityBlueprint,
      universityReductionPlan: universityBlueprint.reduction_plan ?? null,
      consistencyMatrixArtifact: matrixArtifact,
      warnings: [
        ...matrixArtifact.validation.warnings,
        ...validation.validationReport.warnings,
        ...universityBlueprint.warnings,
      ],
    }),
    writeJson(masterAcademicModelPath, masterAcademicDocument),
    writeJson(path.join(runDir, "120-master-docx-manifest.json"), masterDocxManifest),
    writeJson(masterDocxQaPath, masterDocxQaReport),
    writeJson(path.join(runDir, "130-university-docx-manifest.json"), universityDocxManifest),
    writeJson(universityDocxQaPath, universityDocxQaReport),
    writeJson(universityAcademicModelPath, universityAcademicDocument),
  ]);

  if (result) {
    const updatedResult = {
      ...result,
      master_section_drafts: draftsWithMatrix,
      consistency_matrix: matrixArtifact.legacy_rows,
      provenance_report: provenanceReport,
      validation_report: validation.validationReport,
      package_quality_summary: packageQualitySummary,
      coherence_report: validation.coherenceReport,
      legacy_blueprint: legacyBlueprint,
      university_blueprint: universityBlueprint,
      evidence_ledger: evidenceLedger,
    };
    await writeJson(path.join(runDir, "80-lab-result.json"), updatedResult);
  }

  const summary: Steps11To13Result = {
    caseName,
    runDir,
    executed_at: new Date().toISOString(),
    step11: {
      status: step11Status,
      validation_score_10: validation.validationReport.quality_report.score_10,
      validation_passed: validation.validationReport.quality_report.passed,
      provenance_from_sources_pct: provenanceReport.from_sources_pct,
      university_section_count: universityBlueprint.sections.length,
      warnings: [
        ...matrixArtifact.validation.warnings,
        ...validation.validationReport.quality_report.soft_warnings,
        ...universityBlueprint.warnings,
      ].slice(0, 12),
    },
    step12: masterDocxManifest,
    step13: universityDocxManifest,
  };

  await writeJson(path.join(runDir, "140-steps-11-13-summary.json"), summary);

  return summary;
}
