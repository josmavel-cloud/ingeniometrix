import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { syntheticIntake, syntheticProjectData } from "@/blueprint_launch/fixtures/synthetic-intake";
import { consolidateBlueprintLaunchEvidence } from "@/blueprint_launch/server/consolidated-evidence";
import {
  applySelectionState,
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchConsolidatedEvidenceArtifact,
  saveBlueprintLaunchContentMaterialization,
  saveBlueprintLaunchEvidencePacksArtifact,
  saveBlueprintLaunchEvidencePlanning,
  saveBlueprintLaunchSearchSnapshot,
  saveBlueprintLaunchSelectedSourcesBundle,
  saveBlueprintLaunchSourceAccessResolution,
  saveBlueprintLaunchSourceIntakeGate,
  saveBlueprintLaunchSourceSignalExtraction,
  saveBlueprintLaunchStep1State,
  type BlueprintLaunchReferenceListItem,
  type BlueprintLaunchSavedIntakeOriginalSnapshot,
} from "@/blueprint_launch/server/local-playground-store";
import { searchBlueprintLaunchReferences } from "@/blueprint_launch/server/local-reference-search";
import {
  buildBlueprintLaunchSelectedSourcesBundle,
  writeBlueprintLaunchSelectedSourcesBundle,
} from "@/blueprint_launch/server/selected-source-bundle";
import { materializeBlueprintLaunchSourceContent } from "@/blueprint_launch/server/source-content-materialization";
import { planBlueprintLaunchEvidence } from "@/blueprint_launch/server/source-evidence-planning";
import { evaluateBlueprintLaunchSourceIntakeGate } from "@/blueprint_launch/server/source-intake-gate";
import { resolveBlueprintLaunchSourceAccess } from "@/blueprint_launch/server/source-access-resolution";
import { extractBlueprintLaunchSourceSignals } from "@/blueprint_launch/server/source-signal-extraction";
import {
  buildBlueprintLaunchProjectGlobalContext,
  buildBlueprintLaunchProjectSnapshot,
  improveBlueprintLaunchIntake,
} from "@/blueprint_launch/server/step1-intake-context";
import { MAX_SELECTED_REFERENCES, MIN_SELECTED_REFERENCES } from "@/lib/research-workflow";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";
import { resolveProjectStatusFromIntake } from "@/server/projects/project-validation";

function loadLocalEnv() {
  if (!existsSync(".env")) {
    return;
  }

  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rawValueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function selectReferenceIds(input: {
  availableReferenceIds: string[];
  previousSelectedReferenceIds: string[];
}) {
  const available = new Set(input.availableReferenceIds);
  const desiredCount = Math.min(
    MAX_SELECTED_REFERENCES,
    Math.max(input.previousSelectedReferenceIds.length, MIN_SELECTED_REFERENCES),
  );
  const selected = input.previousSelectedReferenceIds.filter((id) => available.has(id));

  for (const id of input.availableReferenceIds) {
    if (selected.length >= desiredCount) {
      break;
    }
    if (!selected.includes(id)) {
      selected.push(id);
    }
  }

  return selected;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadComparisonBaselineArtifactPath() {
  const latestPath = path.join(
    process.cwd(),
    "artifacts-local",
    "blueprint_launch",
    "consolidated_evidence",
    "latest-consolidated-evidence.json",
  );
  const latest = existsSync(latestPath)
    ? readJsonFile<{
        artifact_path?: string | null;
        quality_comparison?: {
          status?: string;
          baseline?: { artifact_path?: string | null } | null;
        };
      }>(latestPath)
    : null;

  if (
    latest?.quality_comparison?.status === "regression" &&
    latest.quality_comparison.baseline?.artifact_path &&
    existsSync(latest.quality_comparison.baseline.artifact_path)
  ) {
    return latest.quality_comparison.baseline.artifact_path;
  }

  return latest?.artifact_path && existsSync(latest.artifact_path) ? latest.artifact_path : null;
}

function loadBaselineSourceIds() {
  const baselinePath = loadComparisonBaselineArtifactPath();
  if (!baselinePath) {
    return [];
  }

  const artifact = readJsonFile<{
    source_priorities?: Array<{ source_id?: string }>;
    evidence_units?: Array<{ source_id?: string }>;
  }>(baselinePath);
  const sourcePriorityIds =
    artifact?.source_priorities
      ?.map((source) => source.source_id)
      .filter((value): value is string => Boolean(value && value !== "intake")) ?? [];

  if (sourcePriorityIds.length > 0) {
    return [...new Set(sourcePriorityIds)];
  }

  return [
    ...new Set(
      artifact?.evidence_units
        ?.map((unit) => unit.source_id)
        .filter((value): value is string => Boolean(value && value !== "intake")) ?? [],
    ),
  ];
}

function loadHistoricalSelectedSourcesForIds(sourceIds: string[]) {
  if (sourceIds.length === 0) {
    return null;
  }

  const selectedSourcesDir = path.join(
    process.cwd(),
    "artifacts-local",
    "blueprint_launch",
    "selected_sources",
  );

  if (!existsSync(selectedSourcesDir)) {
    return null;
  }

  const sourceIdSet = new Set(sourceIds);
  const files = readdirSync(selectedSourcesDir)
    .filter((fileName) => fileName.startsWith("selected-sources-") && fileName.endsWith(".json"))
    .sort()
    .reverse();

  for (const fileName of files) {
    const filePath = path.join(selectedSourcesDir, fileName);
    const bundle = readJsonFile<{
      sources?: Array<{
        selectedOrder?: number | null;
        relevanceScore?: number | null;
        scoreLabel?: string | null;
        reference?: {
          id: string;
          title: string;
          translatedTitle: string | null;
          doi: string | null;
          year: number | null;
          venue: string | null;
          abstract: string | null;
          translatedAbstract: string | null;
          landingPageUrl: string | null;
          authorsJson: string[];
          sourceLanguage: string | null;
          displayLanguage: string;
          hasAutoTranslation: boolean;
          pdfUrl: string | null;
          pdfAccessible: boolean;
        };
      }>;
    }>(filePath);
    const bundleIds = new Set(
      bundle?.sources?.map((source) => source.reference?.id).filter(Boolean) ?? [],
    );

    if (sourceIds.every((id) => bundleIds.has(id))) {
      return bundle?.sources ?? null;
    }
  }

  return null;
}

function logStep(step: string, detail: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${detail}`);
}

function normalizeScoreLabel(value: string | null | undefined): "ALTO" | "MEDIO" | "BAJO" | "MINIMO" {
  return value === "ALTO" || value === "MEDIO" || value === "BAJO" || value === "MINIMO"
    ? value
    : "MEDIO";
}

async function main() {
  loadLocalEnv();

  const initialState = await readBlueprintLaunchLocalState();
  const originalIntake =
    initialState.savedIntakeOriginal?.intake ??
    initialState.savedIntake?.intake ??
    syntheticIntake;
  const knowledgeAreaLabel =
    initialState.savedIntakeOriginal?.projectContext.knowledgeAreaLabel ??
    initialState.savedIntake?.projectContext.knowledgeAreaLabel ??
    syntheticProjectData.knowledgeAreaLabel;
  const stateSelectedReferenceIds =
    initialState.searchSnapshot?.references
      .filter((item) => item.selected)
      .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
      .map((item) => item.reference.id) ?? [];
  const baselineSourceIds = loadBaselineSourceIds();
  const previousSelectedReferenceIds =
    baselineSourceIds.length > 0 ? baselineSourceIds : stateSelectedReferenceIds;

  logStep("Paso 1", "mejorando intake y contexto global");
  const project = {
    ...syntheticProjectData,
    knowledgeAreaLabel,
  };
  const projectSnapshot = buildBlueprintLaunchProjectSnapshot(project);
  const originalSnapshot: BlueprintLaunchSavedIntakeOriginalSnapshot = {
    savedAt: new Date().toISOString(),
    status: resolveProjectStatusFromIntake(originalIntake),
    intake: originalIntake,
    projectContext: {
      knowledgeAreaLabel,
    },
  };
  const intakeImprovementResult = await improveBlueprintLaunchIntake({
    project,
    intake: originalIntake,
  });
  const savedIntake = {
    savedAt: new Date().toISOString(),
    status: resolveProjectStatusFromIntake(intakeImprovementResult.intakeImprovedEs),
    intake: intakeImprovementResult.intakeImprovedEs,
    derivedSearchQuery: null,
    projectContext: {
      knowledgeAreaLabel,
    },
  };
  const projectGlobalContext = buildBlueprintLaunchProjectGlobalContext({
    projectSnapshot,
    intakeOriginal: originalIntake,
    intakeImprovementResult,
  });

  await saveBlueprintLaunchStep1State({
    projectSnapshot,
    savedIntakeOriginal: originalSnapshot,
    intakeImprovementResult,
    projectGlobalContext,
    savedIntake,
    preserveExistingArtifacts: false,
  });

  logStep("Busqueda", "recuperando fuentes y preservando seleccion comparable");
  const searchSnapshot = await searchBlueprintLaunchReferences({
    intake: savedIntake.intake,
    knowledgeAreaLabel,
    desiredTotal: MAX_SELECTED_REFERENCES,
  });
  const historicalSources = loadHistoricalSelectedSourcesForIds(previousSelectedReferenceIds);
  const historicalReferences: BlueprintLaunchReferenceListItem[] =
    historicalSources?.filter((source) => Boolean(source.reference)).map((source, index) => ({
      id: `historical-${index + 1}-${source.reference?.id ?? index}`,
      selected: false,
      selectedOrder: null,
      relevanceScore: source.relevanceScore ?? 0,
      scoreBreakdown: {
        label: normalizeScoreLabel(source.scoreLabel),
        necessaryMatches: [],
        complementaryMatches: [],
        optionalMatches: [],
        recencyBand: "baseline historico",
        recencyBonus: 0,
        matchedQuery: searchSnapshot.searchQuery,
        matchedQueryStage: "necessary_only" as const,
      },
      reference: source.reference as BlueprintLaunchReferenceListItem["reference"],
    })) ?? [];
  const liveReferenceIds = new Set(searchSnapshot.references.map((item) => item.reference.id));
  const mergedReferences = [
    ...historicalReferences.filter((item) => item.reference && !liveReferenceIds.has(item.reference.id)),
    ...searchSnapshot.references,
  ];
  const comparableSearchSnapshot = {
    ...searchSnapshot,
    totalResults: mergedReferences.length,
    references: mergedReferences,
  };
  const selectedReferenceIds = selectReferenceIds({
    availableReferenceIds: comparableSearchSnapshot.references.map((item) => item.reference.id),
    previousSelectedReferenceIds,
  });
  const selectedSearchSnapshot = {
    ...comparableSearchSnapshot,
    references: applySelectionState(comparableSearchSnapshot.references, selectedReferenceIds),
  };
  await saveBlueprintLaunchSearchSnapshot(selectedSearchSnapshot);

  logStep("Paso 2", "resolviendo acceso completo con exploracion concurrente segura");
  const bundle = await buildBlueprintLaunchSelectedSourcesBundle();
  const sourceAccessResolution = await resolveBlueprintLaunchSourceAccess({
    bundle,
    projectGlobalContext,
  });
  const sourceIntakeGate = evaluateBlueprintLaunchSourceIntakeGate(
    selectedSearchSnapshot.references,
    sourceAccessResolution,
  );
  await writeBlueprintLaunchSelectedSourcesBundle(bundle);
  await saveBlueprintLaunchSelectedSourcesBundle(bundle);
  await saveBlueprintLaunchSourceAccessResolution(sourceAccessResolution);
  await saveBlueprintLaunchSourceIntakeGate(sourceIntakeGate);

  logStep("Paso 3", "planificando evidencia con salidas trazables");
  const stateAfterStep2 = await readBlueprintLaunchLocalState();
  if (
    !stateAfterStep2.savedIntake ||
    !stateAfterStep2.selectedSourcesBundle ||
    !stateAfterStep2.sourceAccessResolution ||
    !stateAfterStep2.sourceIntakeGate
  ) {
    throw new Error("Estado incompleto despues del Paso 2.");
  }
  const evidencePlanning = await planBlueprintLaunchEvidence({
    savedIntake: stateAfterStep2.savedIntake,
    projectGlobalContext: stateAfterStep2.projectGlobalContext,
    bundle: stateAfterStep2.selectedSourcesBundle,
    sourceAccessResolution: stateAfterStep2.sourceAccessResolution,
    sourceIntakeGate: stateAfterStep2.sourceIntakeGate,
    state: stateAfterStep2,
  });
  await saveBlueprintLaunchEvidencePlanning(evidencePlanning);

  logStep("Paso 4", "materializando PDFs/textos completos");
  const stateAfterStep3 = await readBlueprintLaunchLocalState();
  if (
    !stateAfterStep3.selectedSourcesBundle ||
    !stateAfterStep3.sourceAccessResolution ||
    !stateAfterStep3.evidencePlanning
  ) {
    throw new Error("Estado incompleto despues del Paso 3.");
  }
  const contentMaterialization = await materializeBlueprintLaunchSourceContent({
    bundle: stateAfterStep3.selectedSourcesBundle,
    sourceAccessResolution: stateAfterStep3.sourceAccessResolution,
    evidencePlanning: stateAfterStep3.evidencePlanning,
  });
  await saveBlueprintLaunchContentMaterialization(contentMaterialization);

  logStep("Paso 5", "extrayendo senales, texto original y assets");
  const stateAfterStep4 = await readBlueprintLaunchLocalState();
  if (
    !stateAfterStep4.savedIntake ||
    !stateAfterStep4.selectedSourcesBundle ||
    !stateAfterStep4.sourceAccessResolution ||
    !stateAfterStep4.contentMaterialization
  ) {
    throw new Error("Estado incompleto despues del Paso 4.");
  }
  const { evidencePacksArtifact, sourceSignalExtraction } = await extractBlueprintLaunchSourceSignals({
    projectTitle: syntheticProjectData.title,
    savedIntake: stateAfterStep4.savedIntake,
    bundle: stateAfterStep4.selectedSourcesBundle,
    sourceAccessResolution: stateAfterStep4.sourceAccessResolution,
    contentMaterialization: stateAfterStep4.contentMaterialization,
    evidenceCompletion: stateAfterStep4.evidenceCompletion,
  });
  await saveBlueprintLaunchSourceSignalExtraction(sourceSignalExtraction);
  await saveBlueprintLaunchEvidencePacksArtifact(evidencePacksArtifact);

  logStep("Paso 6", "consolidando con prompts compactados e indice rehidratable");
  const consolidatedEvidenceArtifact = await consolidateBlueprintLaunchEvidence({
    projectTitle: syntheticProjectData.title,
    savedIntake: stateAfterStep4.savedIntake,
    sourceSignalExtraction,
    evidencePacksArtifact,
  });
  await saveBlueprintLaunchConsolidatedEvidenceArtifact(consolidatedEvidenceArtifact);

  const tokenUsage = await readLlmUsageRegistry();
  const comparison = consolidatedEvidenceArtifact.quality_comparison;

  console.log(
    JSON.stringify(
      {
        selectedReferenceIds,
        step4: {
          materializedCount: contentMaterialization.materializedCount,
          pdfCount: contentMaterialization.pdfCount,
          failedCount: contentMaterialization.failedCount,
          skippedCount: contentMaterialization.skippedCount,
        },
        step5: {
          sourceCount: sourceSignalExtraction.sourceCount,
          textChars: sourceSignalExtraction.totalTextCharCount,
          snippets: sourceSignalExtraction.totalSnippetCount,
          assets: sourceSignalExtraction.totalAssetCount,
        },
        step6: {
          artifactPath: consolidatedEvidenceArtifact.artifact_path,
          qualityGate: consolidatedEvidenceArtifact.quality_gate?.status,
          readiness: consolidatedEvidenceArtifact.coverage_map.overall_readiness,
          evidenceUnits: consolidatedEvidenceArtifact.evidence_units?.length ?? 0,
          comparisonStatus: comparison?.status ?? null,
          deltas: comparison?.deltas ?? null,
          comparisonWarnings: comparison?.warnings ?? [],
        },
        tokenUsage: {
          cumulativeTokens: tokenUsage.cumulative.totalTokens,
          cumulativeCostCad: tokenUsage.cumulative.costCad,
          totalProjectCostCad: tokenUsage.baselineHistorical.costCad + tokenUsage.cumulative.costCad,
        },
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
