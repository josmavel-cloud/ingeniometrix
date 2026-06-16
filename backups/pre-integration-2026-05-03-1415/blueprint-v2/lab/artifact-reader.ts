import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { buildPackageQualitySummary } from "@/server/blueprint-v2/lab/package-quality-summary";
import {
  buildConsistencyMatrixArtifactFromSections,
  type ConsistencyMatrixArtifact,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import type {
  MasterBlueprintLabExecutionResponse,
  MasterBlueprintLabStepRun,
} from "@/lib/labs/master-blueprint/types";
import type { MasterBlueprintSteps5To11LabResult } from "@/server/blueprint-v2/lab/types";
import type {
  EvidenceLedger,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";

const LAB_RUN_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint-v2-lab",
  "steps-5-11",
);

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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

  return latest;
}

function buildReferencesWorkingSet(drafts: MasterSectionDraft[]) {
  return {
    reference_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.used_reference_ids ?? [])),
    ),
    asset_keys: Array.from(
      new Set(drafts.flatMap((draft) => draft.used_asset_keys ?? [])),
    ),
    section_usage: drafts.map((draft) => ({
      section_key: draft.section_key,
      reference_ids: draft.used_reference_ids ?? [],
      asset_keys: draft.used_asset_keys ?? [],
    })),
  };
}

function buildReadOnlySteps(input: {
  promptPlan: SectionPromptPlan | null;
  drafts: MasterSectionDraft[];
  validationReport: MasterBlueprintValidationReport | null;
  blueprintComposition: unknown | null;
  masterDocxRender: unknown | null;
  universityReductionPlan: unknown | null;
  universityDocxRender: unknown | null;
}): MasterBlueprintLabStepRun[] {
  const reductionWarnings =
    input.universityReductionPlan &&
    typeof input.universityReductionPlan === "object" &&
    Array.isArray((input.universityReductionPlan as { warnings?: unknown }).warnings)
      ? ((input.universityReductionPlan as { warnings: string[] }).warnings ?? [])
      : [];

  return [
    {
      key: "master_template_runtime",
      status: "executed",
      durationMs: null,
      executedAt: null,
      artifactCount: 1,
      warnings: ["Cargado desde artifact local read-only."],
      error: null,
    },
    {
      key: "prompt_planning",
      status: input.promptPlan ? "executed" : "pending",
      durationMs: null,
      executedAt: null,
      artifactCount: input.promptPlan?.generation_plan.length ?? 0,
      warnings: [],
      error: null,
    },
    {
      key: "section_generation",
      status: input.drafts.length > 0 ? "executed" : "pending",
      durationMs: null,
      executedAt: null,
      artifactCount: input.drafts.length,
      warnings: input.drafts.flatMap((draft) => draft.warnings ?? []).slice(0, 12),
      error: null,
    },
    {
      key: "consistency_matrix",
      status: "executed",
      durationMs: null,
      executedAt: null,
      artifactCount: 1,
      warnings: [],
      error: null,
    },
    {
      key: "blueprint_composition",
      status: input.blueprintComposition ? "executed" : "pending",
      durationMs: null,
      executedAt: null,
      artifactCount: input.blueprintComposition ? 1 : 0,
      warnings: [],
      error: null,
    },
    {
      key: "legacy_blueprint_composition",
      status: "executed",
      durationMs: null,
      executedAt: null,
      artifactCount: 1,
      warnings: [],
      error: null,
    },
    {
      key: "validation",
      status: input.validationReport ? "executed" : "pending",
      durationMs: null,
      executedAt: null,
      artifactCount: input.validationReport ? 1 : 0,
      warnings: input.validationReport?.warnings ?? [],
      error: null,
    },
    {
      key: "provenance",
      status: "executed",
      durationMs: null,
      executedAt: null,
      artifactCount: 1,
      warnings: [],
      error: null,
    },
    {
      key: "university_derivation",
      status: "executed",
      durationMs: null,
      executedAt: null,
      artifactCount: input.universityReductionPlan ? 2 : 1,
      warnings: reductionWarnings,
      error: null,
    },
    {
      key: "master_docx_render",
      status: input.masterDocxRender ? "executed" : "pending",
      durationMs: null,
      executedAt: null,
      artifactCount: input.masterDocxRender ? 1 : 0,
      warnings: [],
      error: null,
    },
    {
      key: "university_docx_render",
      status: input.universityDocxRender ? "executed" : "pending",
      durationMs: null,
      executedAt: null,
      artifactCount: input.universityDocxRender ? 1 : 0,
      warnings: [],
      error: null,
    },
  ];
}

export async function loadLatestMasterBlueprintLabRun(input: {
  caseName?: string;
}): Promise<MasterBlueprintLabExecutionResponse> {
  const caseName = input.caseName || "blueprint-launch-latest";
  const latest = await getLatestRunDir(caseName);
  const [
    result,
    promptPlan,
    drafts,
    consistencyMatrix,
    persistedConsistencyMatrixArtifact,
    blueprintComposition,
    legacyBlueprint,
    provenanceReport,
    validationReport,
    universityBlueprint,
    universityReductionPlan,
    masterAcademicDocument,
    masterDocxRender,
    masterDocxQaReport,
    universityAcademicDocument,
    universityDocxRender,
    universityDocxQaReport,
    packageQualityArtifact,
  ] = await Promise.all([
    readJson<MasterBlueprintSteps5To11LabResult>(
      path.join(latest.fullPath, "80-lab-result.json"),
    ),
    readJson<SectionPromptPlan>(path.join(latest.fullPath, "10-section-prompt-plan.json")),
    readJson<MasterSectionDraft[]>(
      path.join(latest.fullPath, "20-master-section-drafts.json"),
    ),
    readJson<unknown>(path.join(latest.fullPath, "30-consistency-matrix.json")),
    readJson<ConsistencyMatrixArtifact>(
      path.join(latest.fullPath, "31-consistency-matrix-artifact.json"),
    ),
    readJson<unknown>(path.join(latest.fullPath, "110-blueprint-composition-artifact.json")),
    readJson<unknown>(path.join(latest.fullPath, "40-legacy-blueprint.json")),
    readJson<unknown>(path.join(latest.fullPath, "50-provenance-report.json")),
    readJson<MasterBlueprintValidationReport>(
      path.join(latest.fullPath, "60-validation-report.json"),
    ),
    readJson<unknown>(path.join(latest.fullPath, "70-university-blueprint.json")),
    readJson<unknown>(path.join(latest.fullPath, "71-university-reduction-plan.json")),
    readJson<unknown>(path.join(latest.fullPath, "115-master-academic-document-model.json")),
    readJson<unknown>(path.join(latest.fullPath, "120-master-docx-manifest.json")),
    readJson<unknown>(path.join(latest.fullPath, "121-master-docx-qa-report.json")),
    readJson<unknown>(path.join(latest.fullPath, "135-university-academic-document-model.json")),
    readJson<unknown>(path.join(latest.fullPath, "130-university-docx-manifest.json")),
    readJson<unknown>(path.join(latest.fullPath, "131-university-docx-qa-report.json")),
    readJson<ReturnType<typeof buildPackageQualitySummary>>(
      path.join(latest.fullPath, "90-package-quality-summary.json"),
    ),
  ]);

  if (!result && !drafts) {
    throw new Error(`El ultimo run ${latest.name} no contiene artifacts suficientes.`);
  }

  const resolvedDrafts = drafts ?? result?.master_section_drafts ?? [];
  const resolvedPromptPlan = promptPlan ?? result?.section_prompt_plan ?? null;
  const evidenceLedger =
    result?.evidence_ledger ??
    ({
      source_registry: [],
      evidence_packs: [],
      assets: [],
      assumptions: [],
      snippets: [],
      warnings: [],
    } satisfies EvidenceLedger);
  const resolvedValidationReport = validationReport ?? result?.validation_report ?? null;
  const consistencyMatrixArtifact =
    persistedConsistencyMatrixArtifact?.artifact_type === "consistency_matrix"
      ? persistedConsistencyMatrixArtifact
      : consistencyMatrix &&
          typeof consistencyMatrix === "object" &&
          !Array.isArray(consistencyMatrix) &&
          (consistencyMatrix as { artifact_type?: string }).artifact_type === "consistency_matrix"
        ? (consistencyMatrix as ConsistencyMatrixArtifact)
        : buildConsistencyMatrixArtifactFromSections(resolvedDrafts);
  const resolvedConsistencyMatrix = Array.isArray(consistencyMatrix)
    ? consistencyMatrix
    : consistencyMatrixArtifact.legacy_rows;
  const packageQualitySummary =
    packageQualityArtifact ??
    buildPackageQualitySummary({
      caseName,
      runDir: latest.fullPath,
      promptPlan: resolvedPromptPlan,
      drafts: resolvedDrafts,
      evidenceLedger,
      validationReport: resolvedValidationReport,
      execution: result?.execution,
    });

  return {
    fixtureCase: caseName,
    artifactRun: {
      runDir: latest.fullPath,
      runId: latest.name,
      loadedAt: new Date().toISOString(),
      readOnly: true,
    },
    executedThrough: "section_generation",
    execution: {
      llmEnabled: result?.execution.llm_enabled ?? false,
      llmPolicy: result?.execution.llm_policy ?? "disabled",
      providerName: result?.execution.provider_name ?? null,
      modelName: result?.execution.model_name ?? null,
    },
    steps: buildReadOnlySteps({
      promptPlan: resolvedPromptPlan,
      drafts: resolvedDrafts,
      validationReport: resolvedValidationReport,
      blueprintComposition,
      masterDocxRender,
      universityReductionPlan,
      universityDocxRender,
    }),
    artifacts: {
      masterTemplateRuntime: result?.master_template as unknown as Record<string, unknown>,
      promptPlan: resolvedPromptPlan as unknown as Record<string, unknown>,
      sectionDrafts: {
        drafts: resolvedDrafts,
        referencesWorkingSet: buildReferencesWorkingSet(resolvedDrafts),
      } as unknown as Record<string, unknown>,
      consistencyMatrix: { rows: resolvedConsistencyMatrix } as unknown as Record<string, unknown>,
      consistencyMatrixArtifact: consistencyMatrixArtifact as unknown as Record<string, unknown>,
      blueprintComposition: blueprintComposition as Record<string, unknown>,
      legacyBlueprint: legacyBlueprint as Record<string, unknown>,
      provenanceReport: provenanceReport as Record<string, unknown>,
      validationReport: resolvedValidationReport as unknown as Record<string, unknown>,
      universityBlueprint: universityBlueprint as Record<string, unknown>,
      universityReductionPlan: universityReductionPlan as Record<string, unknown>,
      masterAcademicDocument: masterAcademicDocument as Record<string, unknown>,
      masterDocxRender: masterDocxRender as Record<string, unknown>,
      masterDocxQaReport: masterDocxQaReport as Record<string, unknown>,
      universityAcademicDocument: universityAcademicDocument as Record<string, unknown>,
      universityDocxRender: universityDocxRender as Record<string, unknown>,
      universityDocxQaReport: universityDocxQaReport as Record<string, unknown>,
      coherenceReport: result?.coherence_report as unknown as Record<string, unknown>,
      packageQualitySummary: packageQualitySummary as unknown as Record<string, unknown>,
    },
    inspectors: {
      syntheticOverview: {
        caseName,
        fixtureDir: latest.fullPath,
        project: {
          title: result?.legacy_blueprint.project_title ?? caseName,
          university: result?.legacy_blueprint.university ?? null,
          program: result?.legacy_blueprint.program ?? null,
          degreeLevel: result?.legacy_blueprint.degree_level ?? null,
          templateKey: result?.legacy_blueprint.template_key ?? null,
        },
        intake: {
          problemSummary: result?.legacy_blueprint.problem_statement ?? null,
          objectiveSummary: result?.legacy_blueprint.general_objective ?? null,
          methodologyPreference: result?.legacy_blueprint.proposed_methodology ?? null,
          populationSummary: result?.legacy_blueprint.population_and_sample ?? null,
        },
        sourceMix: {
          total: evidenceLedger.source_registry.length,
          selected: evidenceLedger.source_registry.length,
          providerExpansion: 0,
          websearch: 0,
          formalReferences: evidenceLedger.source_registry.filter(
            (source) => source.eligible_for_formal_reference,
          ).length,
          pdfCandidates: evidenceLedger.source_registry.filter((source) => source.pdf_url).length,
        },
        pdfCoverage: {
          total: result?.pdf_downloads.records.length ?? 0,
          downloaded:
            result?.pdf_downloads.records.filter((record) => record.status === "downloaded")
              .length ?? 0,
          skipped:
            result?.pdf_downloads.records.filter((record) => record.status === "skipped")
              .length ?? 0,
          bytesDownloaded:
            result?.pdf_downloads.records.reduce(
              (sum, record) => sum + (record.file_size_bytes ?? 0),
              0,
            ) ?? 0,
          warnings: result?.pdf_downloads.warnings ?? [],
        },
        evidenceCoverage: {
          packs: evidenceLedger.evidence_packs.length,
          snippets: evidenceLedger.snippets.length,
          assets: evidenceLedger.assets.length,
          assumptions: evidenceLedger.assumptions.length,
          signals: {},
          snippetOrigins: {},
        },
        sectionHintCoverage: [],
        sourceCards: [],
      },
      project: result?.legacy_blueprint as unknown as Record<string, unknown>,
      intake: {} as Record<string, unknown>,
      sourceGate: result?.source_gate as unknown as Record<string, unknown>,
      acquisition: result?.acquisition as unknown as Record<string, unknown>,
      sourceRegistry: {
        source_registry: evidenceLedger.source_registry,
      },
      pdfDownloads: result?.pdf_downloads as unknown as Record<string, unknown>,
      evidencePacks: evidenceLedger.evidence_packs as unknown as Record<string, unknown>,
      evidenceLedger: evidenceLedger as unknown as Record<string, unknown>,
      assumptions: evidenceLedger.assumptions as unknown as Record<string, unknown>,
      snippets: evidenceLedger.snippets as unknown as Record<string, unknown>,
      repoPdfExamples: [],
      engineeringCase: null,
    },
  };
}
