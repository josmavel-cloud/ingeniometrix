import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type {
  BlueprintLaunchSelectedSourceBundle,
  BlueprintLaunchSourceAccessResolutionResult,
  BlueprintLaunchSourceIntakeGateResult,
} from "@/blueprint_launch/server/local-playground-store";
import {
  buildRunSummaryBase,
  parseArgs,
  writeBlockedGateArtifacts,
} from "./run-evidence-selected-sources-steps-2-6";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

async function main() {
  const parsed = parseArgs([
    "--case",
    "case-001-seismic-isolators-peruvian-buildings",
    "--run-folder",
    "synthetic-run",
    "--allow-blocked",
  ]);

  assert(parsed.allowBlocked === true, "--allow-blocked was not recognized.");
  assert(
    parsed.caseId === "case-001-seismic-isolators-peruvian-buildings",
    "--case parsing changed unexpectedly.",
  );
  assert(parsed.runFolder === "synthetic-run", "--run-folder parsing changed unexpectedly.");

  const outputFolder = path.join(
    process.cwd(),
    "artifacts-local",
    "test-selected-source-runner-block-gate",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(outputFolder, { recursive: true });

  const selectedSourceBundle: BlueprintLaunchSelectedSourceBundle = {
    savedAt: new Date().toISOString(),
    manifestPath: path.join(outputFolder, "selected-source-bundle.json"),
    selectedCount: 2,
    pdfLinkedCount: 0,
    searchQuery: "aisladores sismicos Peru",
    intakeTopic: "Uso de aisladores sismicos en edificios peruanos",
    sources: [
      {
        selectedOrder: 1,
        relevanceScore: 17.2,
        scoreLabel: "BAJO",
        reference: {
          id: "10.14483/udistrital.jour.tecnura.2012.4.a08",
          title: "Uso de aisladores de base en puentes de concreto simplemente apoyados",
          translatedTitle: null,
          doi: "10.14483/udistrital.jour.tecnura.2012.4.a08",
          year: 2012,
          venue: "Tecnura",
          abstract: "Articulo sobre aisladores de base.",
          translatedAbstract: null,
          landingPageUrl: "https://revistas.udistrital.edu.co/index.php/Tecnura/article/view/6856",
          authorsJson: ["Autor Uno"],
          sourceLanguage: "es",
          displayLanguage: "es",
          hasAutoTranslation: false,
          pdfUrl: null,
          pdfAccessible: false,
        },
      },
      {
        selectedOrder: 2,
        relevanceScore: 12.5,
        scoreLabel: "MINIMO",
        reference: {
          id: "weak-source-no-public-content",
          title: "Fuente debil sin contenido publico completo",
          translatedTitle: null,
          doi: null,
          year: 2020,
          venue: "Repositorio",
          abstract: "Metadata incompleta.",
          translatedAbstract: null,
          landingPageUrl: "https://example.test/source",
          authorsJson: ["Autor Dos"],
          sourceLanguage: "es",
          displayLanguage: "es",
          hasAutoTranslation: false,
          pdfUrl: null,
          pdfAccessible: false,
        },
      },
    ],
  };
  const sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult = {
    savedAt: new Date().toISOString(),
    summary: "Synthetic access resolution.",
    completePublicCount: 1,
    partialPublicCount: 0,
    metadataOnlyCount: 1,
    unresolvedCount: 0,
    llmPromptCount: 0,
    llmPrompts: [],
    items: [
      {
        sourceId: "10.14483/udistrital.jour.tecnura.2012.4.a08",
        title: "Uso de aisladores de base en puentes de concreto simplemente apoyados",
        status: "complete_public",
        kind: "pdf",
        resolvedContentUrl:
          "https://autoevaluacionyacreditacion.udistrital.edu.co/documentos/Resolucion-MEN.pdf",
        finalUrl:
          "https://autoevaluacionyacreditacion.udistrital.edu.co/documentos/Resolucion-MEN.pdf",
        resolvedVia: "html_candidate_follow",
        languageDetected: "es",
        confidence: 0.82,
        hasCompletePublicContent: true,
        candidateSummary: [
          {
            url: "https://autoevaluacionyacreditacion.udistrital.edu.co/documentos/Resolucion-MEN.pdf",
            label: "administrative_pdf",
            score: 18,
            origin: "anchor",
          },
        ],
        attempts: [],
        warnings: ["Synthetic warning: possible wrong PDF."],
      },
      {
        sourceId: "weak-source-no-public-content",
        title: "Fuente debil sin contenido publico completo",
        status: "metadata_only",
        kind: "abstract_only",
        resolvedContentUrl: null,
        finalUrl: "https://example.test/source",
        resolvedVia: "landing_partial",
        languageDetected: "es",
        confidence: 0.4,
        hasCompletePublicContent: false,
        candidateSummary: [],
        attempts: [],
        warnings: ["No complete public content."],
      },
    ],
  };
  const sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult = {
    savedAt: new Date().toISOString(),
    decision: "BLOCK",
    summary: "Gate bloqueado.",
    nextStepRecommendation: "Volver a busqueda y seleccion antes de seguir al paso 3.",
    selectedCount: 2,
    highOrMediumCount: 0,
    abstractCount: 2,
    doiOrLandingCount: 2,
    completePublicContentCount: 1,
    partialPublicContentCount: 0,
    averageRelevanceScore: 14.85,
    warnings: ["El score promedio de relevancia es bajo para continuar con confianza."],
    blockingReasons: [
      "Hay menos de 3 fuentes seleccionadas.",
      "Menos de 2 fuentes quedaron con score ALTO o MEDIO.",
    ],
  };
  const summary = buildRunSummaryBase({
    runId: "synthetic-block-gate",
    caseId: "case-001-seismic-isolators-peruvian-buildings",
    sourceCandidateRunFolder: "synthetic-run",
    outputFolder,
  });
  summary.selected_source_count = selectedSourceBundle.selectedCount;
  summary.selected_reference_ids = selectedSourceBundle.sources.map((source) => source.reference.id);
  summary.completed_steps.push("step_2_source_access_resolution");
  summary.access_resolved_count = 2;

  await writeBlockedGateArtifacts({
    summary,
    blockedAtStep: "step_2_source_access_resolution",
    selectedSourceBundle,
    sourceAccessResolution,
    sourceIntakeGate,
    candidateSources: {
      case_id: "case-001-seismic-isolators-peruvian-buildings",
      candidates: selectedSourceBundle.sources.map((source) => ({
        candidate_id: source.reference.id,
        title: source.reference.title,
        year: source.reference.year,
        doi: source.reference.doi,
        relevance_score: source.relevanceScore,
        warnings: [],
      })),
    },
    sourceSelection: {
      case_id: "case-001-seismic-isolators-peruvian-buildings",
      selection_status: "completed",
      selected_reference_ids: summary.selected_reference_ids,
      source_policy: {
        min_selected_sources: 4,
        max_selected_sources: 6,
      },
    },
  });

  const runSummaryPath = path.join(outputFolder, "run-summary.json");
  const replacementReportJsonPath = path.join(outputFolder, "source-replacement-report.json");
  const replacementReportMarkdownPath = path.join(outputFolder, "source-replacement-report.md");

  assert(existsSync(runSummaryPath), "run-summary.json was not written.");
  assert(existsSync(replacementReportJsonPath), "source-replacement-report.json was not written.");
  assert(existsSync(replacementReportMarkdownPath), "source-replacement-report.md was not written.");

  const writtenSummary = readJson<{
    status: string;
    blocked_by_gate: boolean;
    blocked_at_step: string | null;
    allow_blocked: boolean;
    production_valid: boolean;
  }>(runSummaryPath);

  assert(writtenSummary.status === "blocked", "BLOCK gate did not produce blocked status.");
  assert(writtenSummary.blocked_by_gate === true, "blocked_by_gate was not true.");
  assert(
    writtenSummary.blocked_at_step === "step_2_source_access_resolution",
    "blocked_at_step was not recorded.",
  );
  assert(writtenSummary.allow_blocked === false, "blocked run should not mark allow_blocked.");
  assert(writtenSummary.production_valid === false, "blocked run should not be production valid.");
  assert(
    !existsSync(path.join(outputFolder, "step-4-materialization-manifest.json")),
    "Step 4 artifact should not exist for a blocked run.",
  );
  assert(
    !existsSync(path.join(outputFolder, "step-5-signal-extraction-summary.json")),
    "Step 5 artifact should not exist for a blocked run.",
  );
  assert(
    !existsSync(path.join(outputFolder, "step-6-consolidated-evidence.json")),
    "Step 6 artifact should not exist for a blocked run.",
  );

  const replacementReport = readJson<{
    needs_more_sources: boolean;
    low_relevance_source_ids: string[];
    wrong_pdf_risk_source_ids: string[];
  }>(replacementReportJsonPath);

  assert(replacementReport.needs_more_sources === true, "Replacement report missed weak set signal.");
  assert(
    replacementReport.low_relevance_source_ids.length > 0,
    "Replacement report missed low relevance sources.",
  );
  assert(
    replacementReport.wrong_pdf_risk_source_ids.includes(
      "10.14483/udistrital.jour.tecnura.2012.4.a08",
    ),
    "Replacement report missed wrong PDF risk.",
  );

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        output_folder: outputFolder,
        checked: [
          "allow-blocked parsing",
          "blocked summary",
          "blocked gate fields",
          "replacement reports",
          "no step 4/5/6 artifacts",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
