import { loadBlueprintTemplateContext } from "@/server/blueprint/blueprint-engine";
import { getConfiguredLlmProvider } from "@/llm";
import { pushBlueprintRunStage } from "@/server/blueprint-v2/orchestrator/blueprint-run-manager";
import { buildLegacyBlueprintFromMaster } from "@/server/blueprint-v2/compose/blueprint-composition-engine";
import { deriveUniversityBlueprint } from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";
import { buildEvidenceLedger } from "@/server/blueprint-v2/evidence/evidence-ledger-engine";
import { runEvidenceExtractionEngine } from "@/server/blueprint-v2/evidence/evidence-extraction-engine";
import { runPdfAvailabilityAndDownloadEngine } from "@/server/blueprint-v2/evidence/pdf-availability-and-download-engine";
import { planMasterTemplateSectionPrompts } from "@/server/blueprint-v2/prompts/section-prompt-planner";
import {
  buildConsistencyMatrixArtifactFromSections,
  buildConsistencyMatrixArtifactFromSectionsWithLlm,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import { runSectionGenerationEngine } from "@/server/blueprint-v2/sections/section-generation-engine";
import { runEvidenceAcquisitionEngine } from "@/server/blueprint-v2/source/evidence-acquisition-engine";
import { runSourceIntakeGate } from "@/server/blueprint-v2/source/source-intake-gate";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type {
  AssumptionInput,
  BlueprintRunManifest,
  MasterBlueprintEngineProject,
  MasterBlueprintPackage,
  MasterSectionDraft,
} from "@/server/blueprint-v2/types";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import { validateMasterBlueprintPackage } from "@/server/blueprint-v2/validation/blueprint-validation-engine";

export function buildAssumptionInputs(project: MasterBlueprintEngineProject): AssumptionInput[] {
  const assumptions: AssumptionInput[] = [];

  if (!project.intake.researchLine?.trim()) {
    assumptions.push({
      assumption_id: "assumption:research_line",
      statement:
        "La linea de investigacion se aproxima a partir del tema, el programa y la evidencia recuperada.",
      reason: "El intake no explicito una linea de investigacion definitiva.",
      section_keys: ["introduction", "problem_statement", "general_objective"],
    });
  }

  if (!project.intake.preferredMethodology?.trim()) {
    assumptions.push({
      assumption_id: "assumption:methodology",
      statement:
        "La metodologia se formulara de manera prudente segun los tipos de datos disponibles y los antecedentes recuperados.",
      reason: "El intake no fijo una metodologia preferida.",
      section_keys: ["methodology", "analysis_plan", "consistency_matrix"],
    });
  }

  if (!project.intake.targetPopulation?.trim()) {
    assumptions.push({
      assumption_id: "assumption:population",
      statement:
        "La poblacion y el contexto se delimitan inicialmente a partir del problema y los antecedentes mas cercanos al dominio del proyecto.",
      reason: "La poblacion objetivo no fue explicitada de forma suficiente.",
      section_keys: ["problem_statement", "population_and_sample", "scope_and_limitations"],
    });
  }

  assumptions.push({
    assumption_id: "assumption:websearch_support",
    statement:
      "Las fuentes recuperadas por web search solo aportan contexto complementario y no sustituyen la trazabilidad academica formal.",
    reason: "El engine puede complementar vacios de cobertura con hallazgos web de acceso publico.",
    section_keys: ["introduction", "problem_statement", "justification"],
  });

  return assumptions;
}

export async function runMasterBlueprintEngine(input: {
  manifest: BlueprintRunManifest;
  project: MasterBlueprintEngineProject;
}): Promise<{
  blueprintPackage: MasterBlueprintPackage;
  coherenceReport: Awaited<
    ReturnType<typeof validateMasterBlueprintPackage>
  >["coherenceReport"];
}> {
  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "gating_sources",
    label: "Validando intake y fuentes base",
    progress: 12,
  });
  const sourceGate = runSourceIntakeGate(input.project);
  const assumptions = buildAssumptionInputs(input.project);

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "acquiring_evidence",
    label: "Complementando evidencia bibliografica",
    progress: 24,
  });
  const acquisition = await runEvidenceAcquisitionEngine({
    project: input.project,
    sourceGate,
  });

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "downloading_pdfs",
    label: "Descargando PDFs publicos",
    progress: 34,
  });
  const pdfDownloads = await runPdfAvailabilityAndDownloadEngine({
    manifest: input.manifest,
    sourceRegistry: acquisition.source_registry,
  });

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "extracting_evidence",
    label: "Extrayendo evidencia estructurada",
    progress: 44,
  });
  const extraction = await runEvidenceExtractionEngine({
    sourceRegistry: acquisition.source_registry,
    pdfDownloads,
    assumptions,
  });
  const evidenceLedger = buildEvidenceLedger({
    sourceRegistry: acquisition.source_registry,
    evidencePacks: extraction.evidencePacks,
    assumptions,
    assumptionSnippets: extraction.assumptionSnippets,
    warnings: [...acquisition.warnings, ...pdfDownloads.warnings, ...extraction.warnings],
  });

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "planning_sections",
    label: "Cargando MasterTemplate y planificando prompts",
    progress: 54,
  });
  const masterTemplate = await loadMasterTemplateRuntimeV2();
  input.manifest.master_template_version_id = masterTemplate.template_version_id;
  const promptPlan = planMasterTemplateSectionPrompts({
    project: input.project,
    masterTemplate,
    evidenceLedger,
  });

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "generating_sections",
    label: "Generando secciones del MasterTemplate",
    progress: 68,
  });
  const drafts = await runSectionGenerationEngine({
    project: input.project,
    masterTemplate,
    evidenceLedger,
    promptPlan,
  });

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "building_matrix",
    label: "Construyendo matriz de consistencia",
    progress: 76,
  });
  const consistencyMatrixArtifact =
    await buildConsistencyMatrixArtifactFromSectionsWithLlm({
      drafts,
      provider: getConfiguredLlmProvider(),
      language: input.project.language,
    }).catch(() =>
      buildConsistencyMatrixArtifactFromSections(drafts, {
        language: input.project.language,
      }),
    );
  const consistencyMatrix = consistencyMatrixArtifact.legacy_rows;
  const matrixIsEnglish = input.project.language === "en";
  const matrixLabels = matrixIsEnglish
    ? {
        title: "Consistency matrix",
        question: "Question",
        objective: "Objective",
        hypothesis: "Hypothesis",
        method: "Method",
        technique: "Technique",
        missing: "To be specified",
        prompt:
          "Generated at the end of the run from the already consolidated objectives, questions, methodology, variables/categories, and techniques.",
      }
    : {
        title: "Matriz de consistencia",
        question: "Interrogante",
        objective: "Objetivo",
        hypothesis: "Hipotesis",
        method: "Metodo",
        technique: "Tecnica",
        missing: "Por precisar",
        prompt:
          "Generada al final del run a partir de objetivos, preguntas, metodologia, variables/categorias y tecnicas ya consolidadas.",
      };
  const matrixDraft: MasterSectionDraft = {
    section_key: "consistency_matrix",
    title: matrixLabels.title,
    phase: "matrix",
    content: consistencyMatrixArtifact.specific_rows
      .map(
        (row) =>
          `${row.row_id ?? `OE${row.index}`}. ${matrixLabels.question}: ${
            row.interrogante_especifica ?? matrixLabels.missing
          } | ${matrixLabels.objective}: ${
            row.objetivo_especifico ?? matrixLabels.missing
          } | ${matrixLabels.hypothesis}: ${
            row.hipotesis_especifica ?? matrixLabels.missing
          } | ${matrixLabels.method}: ${
            row.metodo_vinculado ?? matrixLabels.missing
          } | ${matrixLabels.technique}: ${
            row.tecnica ?? matrixLabels.missing
          }`,
      )
      .join("\n"),
    content_kind: "table",
    support_level: "reference_supported",
    supported_source_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.supported_source_ids)),
    ),
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
    warnings: consistencyMatrixArtifact.validation.warnings,
    prompt: matrixLabels.prompt,
  };
  const draftsWithMatrix = [
    ...drafts,
    matrixDraft,
  ];

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "composing_blueprint",
    label: "Componiendo blueprint maestro",
    progress: 84,
  });
  const templateContext = await loadBlueprintTemplateContext(input.project);
  const { legacyBlueprint } = buildLegacyBlueprintFromMaster({
    projectTitle: input.project.title,
    projectTemplateKey: input.project.templateKey,
    projectDegreeLevel: input.project.degreeLevel,
    projectUniversity: input.project.university,
    projectProgram: input.project.program,
    researchLine: input.project.intake.researchLine,
    drafts: draftsWithMatrix,
    evidenceLedger,
    consistencyMatrix,
    templateContext,
    sourceGate,
  });

  const provenanceReport = buildDocumentProvenanceReport(draftsWithMatrix);

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "validating_blueprint",
    label: "Validando trazabilidad y coherencia",
    progress: 90,
  });
  const { validationReport, coherenceReport } = await validateMasterBlueprintPackage({
    project: input.project,
    masterTemplate,
    evidenceLedger,
    drafts: draftsWithMatrix,
    legacyBlueprint,
    provenanceReport,
    pdfDownloadedCount: pdfDownloads.records.filter((record) => record.status === "downloaded")
      .length,
  });

  await pushBlueprintRunStage({
    manifest: input.manifest,
    stageKey: "deriving_university_blueprint",
    label: "Derivando blueprint universitario",
    progress: 96,
  });
  const universityBlueprint = await deriveUniversityBlueprint({
    project: input.project,
    masterDrafts: draftsWithMatrix,
  });

  return {
    blueprintPackage: {
      manifest: input.manifest,
      source_gate: sourceGate,
      acquisition,
      pdf_downloads: pdfDownloads,
      evidence_ledger: evidenceLedger,
      master_template: masterTemplate,
      section_prompt_plan: promptPlan,
      master_section_drafts: draftsWithMatrix,
      consistency_matrix: consistencyMatrix,
      consistency_matrix_artifact: consistencyMatrixArtifact,
      provenance_report: provenanceReport,
      validation_report: validationReport,
      legacy_blueprint: legacyBlueprint,
      university_blueprint: universityBlueprint,
    },
    coherenceReport,
  };
}
