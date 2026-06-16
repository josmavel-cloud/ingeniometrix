import { getConfiguredLlmProvider } from "@/llm";
import { buildLegacyBlueprintFromMaster } from "@/server/blueprint-v2/compose/blueprint-composition-engine";
import { deriveUniversityBlueprint } from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";
import { buildEvidenceLedger } from "@/server/blueprint-v2/evidence/evidence-ledger-engine";
import { planMasterTemplateSectionPromptsForLab } from "@/server/blueprint-v2/lab/prompt-planning-hybrid";
import { buildPackageQualitySummary } from "@/server/blueprint-v2/lab/package-quality-summary";
import { buildMasterTemplateImportContextArtifact } from "@/server/blueprint-v2/lab/template-import-context";
import type {
  EvidenceLedger,
  MasterSectionDraft,
} from "@/server/blueprint-v2/types";
import { buildConsistencyMatrixFromSections } from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import { runSectionGenerationEngine } from "@/server/blueprint-v2/sections/section-generation-engine";
import {
  buildLabBlueprintTemplateContext,
  getLabUniversityTemplateRuntime,
} from "@/server/blueprint-v2/lab/template-fixtures";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type {
  LoadedMasterBlueprintLabFixtureSet,
  MasterBlueprintSteps5To11LabResult,
} from "@/server/blueprint-v2/lab/types";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import { validateMasterBlueprintPackage } from "@/server/blueprint-v2/validation/blueprint-validation-engine";

function buildMatrixDraft(drafts: MasterSectionDraft[]): MasterSectionDraft {
  const consistencyMatrix = buildConsistencyMatrixFromSections(drafts);

  return {
    section_key: "consistency_matrix",
    title: "Matriz de consistencia",
    phase: "matrix",
    content: consistencyMatrix
      .map(
        (row, index) =>
          `${index + 1}. Objetivo: ${row.objective} | Pregunta: ${row.question} | Metodo: ${row.method} | Tecnica: ${row.technique}`,
      )
      .join("\n"),
    content_kind: "table",
    support_level: "reference_supported",
    supported_source_ids: Array.from(new Set(drafts.flatMap((draft) => draft.supported_source_ids))),
    supported_pdf_source_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.supported_pdf_source_ids)),
    ),
    supported_web_source_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.supported_web_source_ids)),
    ),
    supported_assumption_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.supported_assumption_ids)),
    ),
    evidence_snippet_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.evidence_snippet_ids)),
    ),
    warnings: [],
    prompt:
      "Generada al final del lab a partir de objetivos, preguntas, metodologia y tecnicas ya consolidadas.",
  };
}

function getAssumptionSnippets(evidenceLedger: EvidenceLedger) {
  return evidenceLedger.snippets.filter((snippet) => snippet.origin === "assumption_backed");
}

function compareLedgerShape(left: EvidenceLedger, right: EvidenceLedger) {
  const leftSourceIds = left.source_registry.map((source) => source.source_id).sort();
  const rightSourceIds = right.source_registry.map((source) => source.source_id).sort();
  const leftPackIds = left.evidence_packs.map((pack) => pack.source_id).sort();
  const rightPackIds = right.evidence_packs.map((pack) => pack.source_id).sort();
  const leftAssumptionIds = left.assumptions.map((assumption) => assumption.assumption_id).sort();
  const rightAssumptionIds = right.assumptions.map((assumption) => assumption.assumption_id).sort();

  return JSON.stringify({
    leftSourceIds,
    leftPackIds,
    leftAssumptionIds,
    leftSnippetCount: left.snippets.length,
    leftWarningCount: left.warnings.length,
  }) ===
    JSON.stringify({
      leftSourceIds: rightSourceIds,
      leftPackIds: rightPackIds,
      leftAssumptionIds: rightAssumptionIds,
      leftSnippetCount: right.snippets.length,
      leftWarningCount: right.warnings.length,
    });
}

export async function runMasterBlueprintSteps5To11Lab(input: {
  fixtures: LoadedMasterBlueprintLabFixtureSet;
  allowLlm?: boolean;
}): Promise<MasterBlueprintSteps5To11LabResult> {
  const allowLlm = input.allowLlm ?? true;
  let providerName: string | null = null;
  let modelName: string | null = null;

  if (allowLlm) {
    const provider = getConfiguredLlmProvider();
    providerName = provider.name;
    modelName = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
  }

  const masterTemplate = await loadMasterTemplateRuntimeV2();
  const templateImportContext = await buildMasterTemplateImportContextArtifact({
    fixtures: input.fixtures,
    masterTemplate,
  });
  const promptPlan = await planMasterTemplateSectionPromptsForLab({
    project: input.fixtures.project,
    masterTemplate,
    evidenceLedger: input.fixtures.evidenceLedger,
    templateImportContext,
    allowLlm,
  });
  const drafts = await runSectionGenerationEngine({
    project: input.fixtures.project,
    masterTemplate,
    evidenceLedger: input.fixtures.evidenceLedger,
    promptPlan,
    templateImportContext,
    llmRequired: allowLlm,
  });
  const matrixDraft = buildMatrixDraft(drafts);
  const draftsWithMatrix = [...drafts, matrixDraft];
  const consistencyMatrix = buildConsistencyMatrixFromSections(drafts);
  const templateContext = buildLabBlueprintTemplateContext(input.fixtures.project);
  const { legacyBlueprint } = buildLegacyBlueprintFromMaster({
    projectTitle: input.fixtures.project.title,
    projectTemplateKey: input.fixtures.project.templateKey,
    projectDegreeLevel: input.fixtures.project.degreeLevel,
    projectUniversity: input.fixtures.project.university,
    projectProgram: input.fixtures.project.program,
    researchLine: input.fixtures.project.intake.researchLine,
    drafts: draftsWithMatrix,
    evidenceLedger: input.fixtures.evidenceLedger,
    consistencyMatrix,
    templateContext,
    sourceGate: input.fixtures.sourceGate,
  });
  const provenanceReport = buildDocumentProvenanceReport(draftsWithMatrix);
  const { validationReport, coherenceReport } = await validateMasterBlueprintPackage({
    project: input.fixtures.project,
    masterTemplate,
    evidenceLedger: input.fixtures.evidenceLedger,
    drafts: draftsWithMatrix,
    legacyBlueprint,
    provenanceReport,
    pdfDownloadedCount: input.fixtures.pdfDownloads.records.filter(
      (record) => record.status === "downloaded",
    ).length,
  });
  const universityBlueprint = await deriveUniversityBlueprint({
    project: input.fixtures.project,
    masterDrafts: draftsWithMatrix,
    templateRuntimeOverride: getLabUniversityTemplateRuntime(input.fixtures.project),
  });
  const packageQualitySummary = buildPackageQualitySummary({
    caseName: input.fixtures.caseName,
    promptPlan,
    drafts: draftsWithMatrix,
    evidenceLedger: input.fixtures.evidenceLedger,
    validationReport,
    execution: {
      llm_enabled: allowLlm,
      llm_policy: allowLlm ? "required" : "disabled",
      provider_name: providerName,
      model_name: modelName,
      fallback_sections_count: draftsWithMatrix.filter((draft) => draft.fallback_cause).length,
    },
  });
  const rebuiltLedger = buildEvidenceLedger({
    sourceRegistry: input.fixtures.acquisition.source_registry,
    evidencePacks: input.fixtures.evidencePacks,
    assumptions: input.fixtures.evidenceLedger.assumptions,
    assumptionSnippets: getAssumptionSnippets(input.fixtures.evidenceLedger),
    warnings: input.fixtures.evidenceLedger.warnings,
  });

  return {
    fixture_case: input.fixtures.caseName,
    master_template_key: masterTemplate.template_key,
    execution: {
      llm_enabled: allowLlm,
      llm_policy: allowLlm ? "required" : "disabled",
      provider_name: providerName,
      model_name: modelName,
      fallback_sections_count: draftsWithMatrix.filter((draft) => draft.fallback_cause).length,
    },
    source_gate: input.fixtures.sourceGate,
    acquisition: input.fixtures.acquisition,
    pdf_downloads: input.fixtures.pdfDownloads,
    evidence_ledger: input.fixtures.evidenceLedger,
    master_template: masterTemplate,
    section_prompt_plan: promptPlan,
    master_section_drafts: draftsWithMatrix,
    consistency_matrix: consistencyMatrix,
    provenance_report: provenanceReport,
    validation_report: validationReport,
    package_quality_summary: packageQualitySummary,
    coherence_report: coherenceReport,
    legacy_blueprint: legacyBlueprint,
    university_blueprint: universityBlueprint,
    fixture_checks: {
      evidence_pack_source_ids: input.fixtures.evidencePacks.map((pack) => pack.source_id),
      ledger_source_ids: input.fixtures.evidenceLedger.source_registry.map(
        (source) => source.source_id,
      ),
      assumption_snippet_count: getAssumptionSnippets(input.fixtures.evidenceLedger).length,
      rebuilt_ledger_matches_fixture: compareLedgerShape(
        rebuiltLedger,
        input.fixtures.evidenceLedger,
      ),
    },
  };
}
