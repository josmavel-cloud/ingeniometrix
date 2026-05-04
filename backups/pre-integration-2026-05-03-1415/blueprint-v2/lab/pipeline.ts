import { getConfiguredLlmProvider } from "@/llm";
import { buildLegacyBlueprintFromMaster } from "@/server/blueprint-v2/compose/blueprint-composition-engine";
import { buildMasterBlueprintSyntheticOverview } from "@/server/blueprint-v2/lab/overview";
import { buildPackageQualitySummary } from "@/server/blueprint-v2/lab/package-quality-summary";
import { buildMasterTemplateImportContextArtifact } from "@/server/blueprint-v2/lab/template-import-context";
import { buildTemplateQualityContractArtifact } from "@/server/blueprint-v2/lab/template-quality-contract";
import { buildTemplateRuntimeInspectionArtifact } from "@/server/blueprint-v2/lab/template-runtime-inspector";
import { deriveUniversityBlueprint } from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";
import { planMasterTemplateSectionPromptsForLab } from "@/server/blueprint-v2/lab/prompt-planning-hybrid";
import {
  buildConsistencyMatrixArtifactFromSections,
  buildConsistencyMatrixArtifactFromSectionsWithLlm,
  type ConsistencyMatrixArtifact,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import { runSectionGenerationEngine } from "@/server/blueprint-v2/sections/section-generation-engine";
import {
  buildLabBlueprintTemplateContext,
  getLabUniversityTemplateRuntime,
} from "@/server/blueprint-v2/lab/template-fixtures";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type { LoadedMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/types";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import { validateMasterBlueprintPackage } from "@/server/blueprint-v2/validation/blueprint-validation-engine";
import {
  MASTER_BLUEPRINT_LAB_STEPS,
  MASTER_BLUEPRINT_LAB_STEP_KEYS,
} from "@/lib/labs/master-blueprint/steps";
import type {
  MasterBlueprintLabArtifacts,
  MasterBlueprintLabExecutionResponse,
  MasterBlueprintLabStepKey,
  MasterBlueprintLabStepRun,
} from "@/lib/labs/master-blueprint/types";
import type {
  ConsistencyMatrixRow,
  DocumentProvenanceReport,
  MasterSectionDraft,
  MasterTemplateRuntime,
  SectionPromptPlan,
} from "@/server/blueprint-v2/types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

function buildReferencesWorkingSet(drafts: MasterSectionDraft[]) {
  return {
    reference_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.used_reference_ids ?? [])),
    ),
    asset_keys: Array.from(new Set(drafts.flatMap((draft) => draft.used_asset_keys ?? []))),
    section_usage: drafts.map((draft) => ({
      section_key: draft.section_key,
      reference_ids: draft.used_reference_ids ?? [],
      asset_keys: draft.used_asset_keys ?? [],
    })),
  };
}

type PipelineState = {
  masterTemplate?: MasterTemplateRuntime;
  templateImportContext?: Record<string, unknown>;
  templateRuntimeInspection?: Record<string, unknown>;
  templateQualityContract?: Record<string, unknown>;
  promptPlan?: SectionPromptPlan;
  sectionDrafts?: MasterSectionDraft[];
  matrixDraft?: MasterSectionDraft;
  draftsWithMatrix?: MasterSectionDraft[];
  consistencyMatrix?: ConsistencyMatrixRow[];
  consistencyMatrixArtifact?: ConsistencyMatrixArtifact;
  blueprintComposition?: Record<string, unknown>;
  legacyBlueprint?: ResearchBlueprintRecord;
  provenanceReport?: DocumentProvenanceReport;
  validationReport?: Awaited<
    ReturnType<typeof validateMasterBlueprintPackage>
  >["validationReport"];
  packageQualitySummary?: ReturnType<typeof buildPackageQualitySummary>;
  coherenceReport?: Awaited<
    ReturnType<typeof validateMasterBlueprintPackage>
  >["coherenceReport"];
  universityBlueprint?: Awaited<ReturnType<typeof deriveUniversityBlueprint>>;
  masterDocxRender?: Record<string, unknown>;
  universityDocxRender?: Record<string, unknown>;
};

function buildMatrixDraft(input: {
  drafts: MasterSectionDraft[];
  consistencyMatrixArtifact: ConsistencyMatrixArtifact;
}): MasterSectionDraft {
  return {
    section_key: "consistency_matrix",
    title: "Matriz de consistencia",
    phase: "matrix",
    content: input.consistencyMatrixArtifact.specific_rows.length > 0
      ? input.consistencyMatrixArtifact.specific_rows
          .map(
            (row) =>
              `${row.index}. Problema: ${
                row.interrogante_especifica ?? "Por precisar"
              } | Objetivo: ${
                row.objetivo_especifico ?? "Por precisar"
              } | Hipotesis: ${row.hipotesis_especifica ?? "No aplica / por precisar"}`,
          )
          .join("\n")
      : input.consistencyMatrixArtifact.legacy_rows
      .map(
        (row, index) =>
          `${index + 1}. Objetivo: ${row.objective} | Pregunta: ${row.question} | Metodo: ${row.method} | Tecnica: ${row.technique}`,
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
    warnings: [
      ...input.consistencyMatrixArtifact.validation.blocked_reasons,
      ...input.consistencyMatrixArtifact.validation.warnings,
    ],
    prompt: input.consistencyMatrixArtifact.llm_used
      ? "Generada por Step 10 con LLM barato desde drafts del paso 9 y validacion deterministica posterior."
      : "Generada de forma deterministica desde drafts del paso 9; no usa LLM ni inventa campos faltantes.",
  };
}

function countArtifact(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (value && typeof value === "object") {
    return 1;
  }

  return 0;
}

function buildArtifacts(state: PipelineState): MasterBlueprintLabArtifacts {
  return {
    masterTemplateRuntime: state.masterTemplate as unknown as Record<string, unknown>,
    templateImportContext: state.templateImportContext,
    templateRuntimeInspection: state.templateRuntimeInspection,
    templateQualityContract: state.templateQualityContract,
    promptPlan: state.promptPlan as unknown as Record<string, unknown>,
    sectionDrafts: state.draftsWithMatrix
      ? ({
          drafts: state.draftsWithMatrix,
          referencesWorkingSet: buildReferencesWorkingSet(state.draftsWithMatrix),
        } as unknown as Record<string, unknown>)
      : state.sectionDrafts
        ? ({
            drafts: state.sectionDrafts,
            referencesWorkingSet: buildReferencesWorkingSet(state.sectionDrafts),
          } as unknown as Record<string, unknown>)
        : undefined,
    consistencyMatrix: state.consistencyMatrix
      ? ({ rows: state.consistencyMatrix } as unknown as Record<string, unknown>)
      : undefined,
    consistencyMatrixArtifact: state.consistencyMatrixArtifact as unknown as Record<string, unknown>,
    blueprintComposition: state.blueprintComposition,
    legacyBlueprint: state.legacyBlueprint as unknown as Record<string, unknown>,
    validationReport: state.validationReport as unknown as Record<string, unknown>,
    packageQualitySummary: state.packageQualitySummary as unknown as Record<string, unknown>,
    provenanceReport: state.provenanceReport as unknown as Record<string, unknown>,
    universityBlueprint: state.universityBlueprint as unknown as Record<string, unknown>,
    masterDocxRender: state.masterDocxRender,
    universityDocxRender: state.universityDocxRender,
    coherenceReport: state.coherenceReport as unknown as Record<string, unknown>,
  };
}

function getStepArtifactCount(stepKey: MasterBlueprintLabStepKey, state: PipelineState) {
  switch (stepKey) {
    case "master_template_runtime":
      return state.masterTemplate ? state.masterTemplate.sections.length : 0;
    case "prompt_planning":
      return state.promptPlan ? state.promptPlan.prompt_manifest.length : 0;
    case "section_generation":
      return state.sectionDrafts ? state.sectionDrafts.length : 0;
    case "consistency_matrix":
      return state.consistencyMatrixArtifact
        ? state.consistencyMatrixArtifact.specific_rows.length
        : state.consistencyMatrix
          ? state.consistencyMatrix.length
          : 0;
    case "blueprint_composition":
      return countArtifact(state.blueprintComposition);
    case "legacy_blueprint_composition":
      return countArtifact(state.legacyBlueprint);
    case "validation":
      return countArtifact(state.validationReport);
    case "provenance":
      return state.provenanceReport ? state.provenanceReport.section_breakdown.length : 0;
    case "university_derivation":
      return state.universityBlueprint ? state.universityBlueprint.sections.length : 0;
    case "master_docx_render":
      return countArtifact(state.masterDocxRender);
    case "university_docx_render":
      return countArtifact(state.universityDocxRender);
    default:
      return 0;
  }
}

function getStepWarnings(stepKey: MasterBlueprintLabStepKey, state: PipelineState) {
  switch (stepKey) {
    case "master_template_runtime": {
      const importContext = state.templateImportContext as
        | {
            source_snapshot?: { source_lab?: string };
            checks?: {
              mapped_section_count?: number;
              weak_sections?: string[];
              blocked_sections?: string[];
            };
            warnings?: string[];
          }
        | undefined;
      const templateInspection = state.templateRuntimeInspection as
        | {
            master?: { identity?: { template_key?: string | null } };
            institutional?: {
              identity?: { template_key?: string | null };
              resolution?: { source?: string | null };
            };
            warnings?: string[];
          }
        | undefined;
      const templateQuality = state.templateQualityContract as
        | {
            overall_status?: string;
            can_continue_step_8?: boolean;
            can_continue_docx_steps?: boolean;
            blockers?: string[];
            warnings?: string[];
          }
        | undefined;

      return state.masterTemplate
        ? [
            `source_lab: ${importContext?.source_snapshot?.source_lab ?? "local"}`,
            `mapped_sections: ${importContext?.checks?.mapped_section_count ?? 0}`,
            `weak_sections: ${importContext?.checks?.weak_sections?.length ?? 0}`,
            `blocked_sections: ${importContext?.checks?.blocked_sections?.length ?? 0}`,
            `master_template_db: ${
              templateInspection?.master?.identity?.template_key ?? "sin inspeccion"
            }`,
            `institutional_template_db: ${
              templateInspection?.institutional?.identity?.template_key ?? "sin inspeccion"
            } / ${templateInspection?.institutional?.resolution?.source ?? "sin resolucion"}`,
            `template_quality: ${templateQuality?.overall_status ?? "sin contrato"}`,
            `can_continue_step_8: ${String(templateQuality?.can_continue_step_8 ?? false)}`,
            `can_continue_docx_steps: ${String(templateQuality?.can_continue_docx_steps ?? false)}`,
            ...(importContext?.warnings ?? []).slice(0, 3),
            ...(templateInspection?.warnings ?? []).slice(0, 2),
            ...(templateQuality?.blockers ?? []).slice(0, 2),
            ...(templateQuality?.warnings ?? []).slice(0, 2),
          ]
        : [];
    }
    case "prompt_planning": {
      const promptPlan = (state.promptPlan ?? {}) as SectionPromptPlan & {
        planner_mode?: string;
        llm_provider?: string | null;
        llm_model?: string | null;
        refined_intake_context?: {
          accepted_foreign_terms?: Array<{ term: string }>;
        };
        generation_waves?: Array<{ wave_key: string; section_keys: string[] }>;
        context_blueprints?: Array<{ context_key: string }>;
        asset_inclusion_plan?: Array<{ critical_asset_keys?: string[] }>;
        title_refinement_plan?: { enabled?: boolean };
        citation_plan?: { enabled?: boolean; style_target?: string | null };
        checks?: {
          weak_sections?: string[];
          blocked_sections?: string[];
          sections_requiring_followup?: string[];
        };
        global_observations?: string[];
        merge_warnings?: string[];
        refined_section_keys?: string[];
      };

      if (!state.promptPlan) {
        return [];
      }

      return [
        `planner_mode: ${promptPlan.planner_mode ?? "deterministic"}`,
        promptPlan.llm_provider
          ? `llm_provider: ${promptPlan.llm_provider} / ${promptPlan.llm_model ?? "sin modelo"}`
          : "llm_provider: disabled",
        `foreign_terms: ${promptPlan.refined_intake_context?.accepted_foreign_terms?.length ?? 0}`,
        `waves: ${promptPlan.generation_waves?.length ?? 0}`,
        `context_blueprints: ${promptPlan.context_blueprints?.length ?? 0}`,
        `critical_asset_plans: ${promptPlan.asset_inclusion_plan?.filter((item) => (item.critical_asset_keys?.length ?? 0) > 0).length ?? 0}`,
        `weak_sections: ${promptPlan.checks?.weak_sections?.length ?? 0}`,
        `blocked_sections: ${promptPlan.checks?.blocked_sections?.length ?? 0}`,
        promptPlan.title_refinement_plan?.enabled ? "title_refinement: enabled" : "title_refinement: disabled",
        promptPlan.citation_plan?.enabled
          ? `citation_plan: ${promptPlan.citation_plan.style_target ?? "sin estilo"}`
          : "citation_plan: disabled",
        ...(promptPlan.refined_section_keys?.length
          ? [`refined_sections: ${promptPlan.refined_section_keys.join(", ")}`]
          : []),
        ...(promptPlan.checks?.sections_requiring_followup?.length
          ? [
              `followup_sections: ${promptPlan.checks.sections_requiring_followup
                .slice(0, 4)
                .join(", ")}`,
            ]
          : []),
        ...(promptPlan.global_observations ?? []).slice(0, 2),
        ...(promptPlan.merge_warnings ?? []),
      ];
    }
    case "section_generation":
      return state.sectionDrafts?.flatMap((draft) => draft.warnings) ?? [];
    case "blueprint_composition":
      return [
        ...((state.blueprintComposition?.warnings as string[] | undefined) ?? []),
        ...(state.validationReport?.warnings ?? []),
        ...(state.universityBlueprint?.warnings ?? []),
      ];
    case "validation":
      return state.validationReport?.warnings ?? [];
    case "provenance":
      return state.provenanceReport
        ? [
            `Fuentes: ${state.provenanceReport.from_sources_pct}%`,
            `PDFs: ${state.provenanceReport.from_pdfs_pct}%`,
            `Web: ${state.provenanceReport.from_websearch_pct}%`,
            `Assumptions: ${state.provenanceReport.from_assumption_backed_pct}%`,
          ]
        : [];
    case "university_derivation":
      return state.universityBlueprint?.warnings ?? [];
    case "master_docx_render":
      return ((state.masterDocxRender?.warnings as string[] | undefined) ?? []);
    case "university_docx_render":
      return ((state.universityDocxRender?.warnings as string[] | undefined) ?? []);
    default:
      return [];
  }
}

async function executeStep(
  stepKey: MasterBlueprintLabStepKey,
  fixtures: LoadedMasterBlueprintLabFixtureSet,
  state: PipelineState,
  allowLlm = true,
) {
  switch (stepKey) {
    case "master_template_runtime":
      state.masterTemplate = await loadMasterTemplateRuntimeV2();
      state.templateImportContext = await buildMasterTemplateImportContextArtifact({
        fixtures,
        masterTemplate: state.masterTemplate,
      });
      const templateRuntimeInspection = await buildTemplateRuntimeInspectionArtifact(fixtures);
      state.templateRuntimeInspection = templateRuntimeInspection as unknown as Record<string, unknown>;
      state.templateQualityContract = buildTemplateQualityContractArtifact(
        templateRuntimeInspection,
      ) as unknown as Record<string, unknown>;
      return;
    case "prompt_planning":
      state.masterTemplate ??= await loadMasterTemplateRuntimeV2();
      state.templateImportContext ??= await buildMasterTemplateImportContextArtifact({
        fixtures,
        masterTemplate: state.masterTemplate,
      });
      state.promptPlan = await planMasterTemplateSectionPromptsForLab({
        project: fixtures.project,
        masterTemplate: state.masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        templateImportContext: state.templateImportContext,
        allowLlm,
      });
      return;
    case "section_generation":
      state.masterTemplate ??= await loadMasterTemplateRuntimeV2();
      state.templateImportContext ??= await buildMasterTemplateImportContextArtifact({
        fixtures,
        masterTemplate: state.masterTemplate,
      });
      state.promptPlan ??= await planMasterTemplateSectionPromptsForLab({
        project: fixtures.project,
        masterTemplate: state.masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        templateImportContext: state.templateImportContext,
        allowLlm,
      });
      state.sectionDrafts = await runSectionGenerationEngine({
        project: fixtures.project,
        masterTemplate: state.masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        promptPlan: state.promptPlan,
        templateImportContext: state.templateImportContext,
        llmRequired: allowLlm,
      });
      return;
    case "consistency_matrix":
      if (!state.sectionDrafts) {
        await executeStep("section_generation", fixtures, state, allowLlm);
      }
      state.consistencyMatrixArtifact = allowLlm
        ? await buildConsistencyMatrixArtifactFromSectionsWithLlm({
            drafts: state.sectionDrafts ?? [],
            provider: getConfiguredLlmProvider(),
            model: process.env.LLM_FAST_MODEL?.trim() || null,
          })
        : buildConsistencyMatrixArtifactFromSections(state.sectionDrafts ?? []);
      state.consistencyMatrix = state.consistencyMatrixArtifact.legacy_rows;
      state.matrixDraft = buildMatrixDraft({
        drafts: state.sectionDrafts ?? [],
        consistencyMatrixArtifact: state.consistencyMatrixArtifact,
      });
      state.draftsWithMatrix = [...(state.sectionDrafts ?? []), state.matrixDraft];
      return;
    case "blueprint_composition":
      if (!state.draftsWithMatrix || !state.consistencyMatrix) {
        await executeStep("consistency_matrix", fixtures, state, allowLlm);
      }
      state.legacyBlueprint = buildLegacyBlueprintFromMaster({
        projectTitle: fixtures.project.title,
        projectTemplateKey: fixtures.project.templateKey,
        projectDegreeLevel: fixtures.project.degreeLevel,
        projectUniversity: fixtures.project.university,
        projectProgram: fixtures.project.program,
        researchLine: fixtures.project.intake.researchLine,
        drafts: state.draftsWithMatrix ?? [],
        evidenceLedger: fixtures.evidenceLedger,
        consistencyMatrix: state.consistencyMatrix ?? [],
        templateContext: buildLabBlueprintTemplateContext(fixtures.project),
        sourceGate: fixtures.sourceGate,
      }).legacyBlueprint;
      state.provenanceReport = buildDocumentProvenanceReport(state.draftsWithMatrix ?? []);
      state.masterTemplate ??= await loadMasterTemplateRuntimeV2();
      const compositionValidation = await validateMasterBlueprintPackage({
        project: fixtures.project,
        masterTemplate: state.masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        drafts: state.draftsWithMatrix ?? [],
        legacyBlueprint: state.legacyBlueprint,
        provenanceReport: state.provenanceReport,
        pdfDownloadedCount: fixtures.pdfDownloads.records.filter(
          (record) => record.status === "downloaded",
        ).length,
      });
      state.validationReport = compositionValidation.validationReport;
      state.coherenceReport = compositionValidation.coherenceReport;
      state.universityBlueprint = await deriveUniversityBlueprint({
        project: fixtures.project,
        masterDrafts: state.draftsWithMatrix ?? [],
        templateRuntimeOverride: getLabUniversityTemplateRuntime(fixtures.project),
      });
      state.blueprintComposition = {
        artifact_type: "blueprint_composition",
        artifact_version: "v1",
        legacyBlueprint: state.legacyBlueprint,
        validationReport: state.validationReport,
        provenanceReport: state.provenanceReport,
        universityBlueprint: state.universityBlueprint,
        consistencyMatrixArtifact: state.consistencyMatrixArtifact,
      };
      return;
    case "legacy_blueprint_composition":
      if (!state.legacyBlueprint) {
        await executeStep("blueprint_composition", fixtures, state, allowLlm);
      }
      return;
    case "validation":
      if (!state.validationReport || !state.legacyBlueprint || !state.draftsWithMatrix) {
        await executeStep("blueprint_composition", fixtures, state, allowLlm);
      }
      if (state.validationReport && state.coherenceReport && state.packageQualitySummary) {
        return;
      }
      state.provenanceReport = buildDocumentProvenanceReport(state.draftsWithMatrix ?? []);
      state.masterTemplate ??= await loadMasterTemplateRuntimeV2();
      const validation = await validateMasterBlueprintPackage({
        project: fixtures.project,
        masterTemplate: state.masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        drafts: state.draftsWithMatrix ?? [],
        legacyBlueprint: state.legacyBlueprint!,
        provenanceReport: state.provenanceReport,
        pdfDownloadedCount: fixtures.pdfDownloads.records.filter(
          (record) => record.status === "downloaded",
        ).length,
      });
      state.validationReport = validation.validationReport;
      state.coherenceReport = validation.coherenceReport;
      state.packageQualitySummary = buildPackageQualitySummary({
        caseName: fixtures.caseName,
        promptPlan: state.promptPlan,
        drafts: state.draftsWithMatrix ?? [],
        evidenceLedger: fixtures.evidenceLedger,
        validationReport: state.validationReport,
        execution: {
          llm_enabled: allowLlm,
          llm_policy: allowLlm ? "required" : "disabled",
          provider_name: null,
          model_name: process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4",
          fallback_sections_count: (state.draftsWithMatrix ?? []).filter(
            (draft) => draft.fallback_cause,
          ).length,
        },
      });
      return;
    case "provenance":
      if (!state.draftsWithMatrix) {
        await executeStep("consistency_matrix", fixtures, state, allowLlm);
      }
      state.provenanceReport = buildDocumentProvenanceReport(state.draftsWithMatrix ?? []);
      return;
    case "university_derivation":
      if (!state.universityBlueprint) {
        await executeStep("blueprint_composition", fixtures, state, allowLlm);
      }
      return;
    case "master_docx_render":
      state.masterDocxRender = {
        status: "external_runner_required",
        note: "Usar scripts/run-master-blueprint-steps-11-13.ts para render DOCX persistente.",
      };
      return;
    case "university_docx_render":
      state.universityDocxRender = {
        status: "external_runner_required",
        note: "Usar scripts/run-master-blueprint-steps-11-13.ts para render DOCX persistente.",
      };
      return;
  }
}

export async function runMasterBlueprintLabThroughStep(input: {
  fixtures: LoadedMasterBlueprintLabFixtureSet;
  throughStep: MasterBlueprintLabStepKey;
  allowLlm?: boolean;
}): Promise<MasterBlueprintLabExecutionResponse> {
  const targetIndex = MASTER_BLUEPRINT_LAB_STEP_KEYS.indexOf(input.throughStep);

  if (targetIndex < 0) {
    throw new Error(`Paso de laboratorio no soportado: ${input.throughStep}`);
  }

  const state: PipelineState = {};
  const syntheticOverview = buildMasterBlueprintSyntheticOverview(input.fixtures);
  const steps: MasterBlueprintLabStepRun[] = MASTER_BLUEPRINT_LAB_STEPS.map((step, index) => ({
    key: step.key,
    status: index === 0 ? "ready" : "pending",
    durationMs: null,
    executedAt: null,
    artifactCount: 0,
    warnings: [],
    error: null,
  }));

  for (let index = 0; index <= targetIndex; index += 1) {
    const stepKey = MASTER_BLUEPRINT_LAB_STEP_KEYS[index];
    const startedAt = Date.now();

    try {
      await executeStep(stepKey, input.fixtures, state, input.allowLlm ?? true);
      steps[index] = {
        ...steps[index],
        status: "executed",
        durationMs: Date.now() - startedAt,
        executedAt: new Date().toISOString(),
        artifactCount: getStepArtifactCount(stepKey, state),
        warnings: getStepWarnings(stepKey, state),
      };

      if (steps[index + 1]) {
        steps[index + 1] = {
          ...steps[index + 1],
          status: steps[index + 1].status === "pending" ? "ready" : steps[index + 1].status,
        };
      }
    } catch (error) {
      steps[index] = {
        ...steps[index],
        status: "failed",
        durationMs: Date.now() - startedAt,
        executedAt: new Date().toISOString(),
        artifactCount: getStepArtifactCount(stepKey, state),
        warnings: getStepWarnings(stepKey, state),
        error: error instanceof Error ? error.message : "Fallo no identificado.",
      };
      break;
    }
  }

  let providerName: string | null = null;
  let modelName: string | null = null;
  if (input.allowLlm ?? true) {
    try {
      const provider = getConfiguredLlmProvider();
      providerName = provider.name;
      modelName = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
    } catch {
      providerName = null;
      modelName = null;
    }
  }

  return {
    fixtureCase: input.fixtures.caseName,
    executedThrough: input.throughStep,
    execution: {
      llmEnabled: input.allowLlm ?? true,
      llmPolicy: (input.allowLlm ?? true) ? "required" : "disabled",
      providerName,
      modelName,
    },
    steps,
    artifacts: buildArtifacts(state),
    inspectors: {
      syntheticOverview,
      project: input.fixtures.project as unknown as Record<string, unknown>,
      intake: input.fixtures.project.intake as unknown as Record<string, unknown>,
      sourceGate: input.fixtures.sourceGate as unknown as Record<string, unknown>,
      acquisition: input.fixtures.acquisition as unknown as Record<string, unknown>,
      sourceRegistry: {
        source_registry: input.fixtures.acquisition.source_registry,
      },
      pdfDownloads: input.fixtures.pdfDownloads as unknown as Record<string, unknown>,
      evidencePacks: input.fixtures.evidencePacks as unknown as Record<string, unknown>,
      evidenceLedger: input.fixtures.evidenceLedger as unknown as Record<string, unknown>,
      assumptions: input.fixtures.evidenceLedger.assumptions as unknown as Record<string, unknown>,
      snippets: input.fixtures.evidenceLedger.snippets as unknown as Record<string, unknown>,
      repoPdfExamples: [],
      engineeringCase: null,
    },
  };
}
