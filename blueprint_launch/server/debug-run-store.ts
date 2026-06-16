import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  type ConsolidatedEvidenceArtifact,
  type EvidencePackArtifact,
  type BlueprintLaunchLocalState,
  type BlueprintLaunchSourceAccessResolutionResult,
  type BlueprintLaunchSourceIntakeGateResult,
  type BlueprintLaunchSelectedSourceBundle,
  readBlueprintLaunchLocalState,
} from "./local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export type BlueprintLaunchDebugSnapshot = {
  savedAt: string;
  eventType:
    | "INTAKE_SAVED"
    | "SEARCH_COMPLETED"
    | "REFERENCES_SAVED"
    | "STEP2_RESOLVED"
    | "STEP3_PLANNED"
    | "STEP4_MATERIALIZED"
    | "STEP5_EXTRACTED"
    | "STEP6_CONSOLIDATED";
  knowledgeAreaLabel: string | null;
  intakeStatus: string | null;
  intakeCompletedFields: number;
  intakeTotalFields: number;
  derivedSearchQuery: string | null;
  plannerStatus: "llm" | "fallback" | "pending";
  plannerErrorStage: string | null;
  plannerErrorMessage: string | null;
  normalizedTopic: string | null;
  intentSummary: string | null;
  subdomain: string | null;
  primarySystem: string | null;
  primaryPhenomenon: string | null;
  primaryGoal: string | null;
  keywordGroups: {
    necessary: string[];
    complementary: string[];
    optional: string[];
  };
  search: {
    searchQuery: string | null;
    attemptedQueryCount: number;
    totalResults: number;
    selectedCount: number;
    pdfAccessibleCount: number;
  };
  sourceAccessResolution: {
    completePublicCount: number;
    partialPublicCount: number;
    metadataOnlyCount: number;
    unresolvedCount: number;
    llmPromptCount: number;
    previewItems: Array<{
      sourceId: string;
      title: string;
      status: string;
      kind: string;
      languageDetected: string | null;
      resolvedVia: string;
      resolvedContentUrl: string | null;
      candidateCount: number;
      warningCount: number;
    }>;
  } | null;
  sourceIntakeGate: BlueprintLaunchSourceIntakeGateResult | null;
  evidenceCompletion: {
    decision: "RUN" | "SKIP";
    reason: string;
    cardCount: number;
    completedFromAbstractCount: number;
    completedFromMetadataCount: number;
    usableCount: number;
    weakSupportCount: number;
    offTopicCount: number;
    methodologySupportCount: number;
    frameworkSupportCount: number;
    previewCards: Array<{
      referenceId: string;
      title: string;
      applicabilityToProject: string;
      usefulnessLabel: string;
      supportsSectionKeys: string[];
      methodologyHints: string[];
      frameworkHints: string[];
      decisionValue: string;
    }>;
  } | null;
  contentMaterialization: {
    attemptedCount: number;
    materializedCount: number;
    pdfCount: number;
    webCount: number;
    failedCount: number;
    skippedCount: number;
    previewItems: Array<{
      sourceId: string;
      title: string;
      materializationStatus: string;
      storedKind: string;
      localPrimaryPath: string | null;
      localTextPath: string | null;
    }>;
  } | null;
  sourceSignalExtraction: {
    extractionMode: "rule_based" | "llm_structured" | "hybrid";
    llmStatus: "llm" | "fallback" | "skipped" | "hybrid";
    llmPromptCount: number;
    llmCallCount: number;
    runDir: string | null;
    readyForStep6: boolean;
    sourceCount: number;
    textExtractionCount: number;
    totalTextCharCount: number;
    pdfInputCount: number;
    webInputCount: number;
    abstractOnlyCount: number;
    totalSnippetCount: number;
    totalAssetCount: number;
    equationAssetCount: number;
    tableAssetCount: number;
    imageAssetCount: number;
    warningCount: number;
    warnings: string[];
    previewSources: Array<{
      sourceId: string;
      title: string;
      inputMode: string;
      primaryPath: string | null;
      secondaryPath: string | null;
      extractedTextPath: string | null;
      pageCount: number | null;
      textCharCount: number;
      detectedLanguage: string | null;
      sourceOverview: string | null;
      topicRelevance: string;
      proposalUsefulness: string;
      supportsSectionKeys: string[];
      methodologyHints: string[];
      frameworkHints: string[];
      problemSignal: string | null;
      methodSignal: string | null;
      contextSignal: string | null;
      findingSignal: string | null;
      limitationSignal: string | null;
      futureLineSignal: string | null;
      pdfSectionsAvailable: string[];
      snippetCount: number;
      assetCount: number;
      equationAssetCount: number;
      tableAssetCount: number;
      imageAssetCount: number;
      warnings: string[];
    }>;
  } | null;
  consolidatedEvidenceArtifact: {
    consolidationMode: ConsolidatedEvidenceArtifact["consolidation_mode"];
    overallReadiness: string;
    readySectionCount: number;
    partialSectionCount: number;
    lowSectionCount: number;
    dominantMethods: string[];
    dominantFrameworks: string[];
    evidenceGapCount: number;
    proposalDirectionCount: number;
    blockingRequirementCount: number;
    recommendedRequirementCount: number;
    proposalMethodCandidate: {
      methodFamily: string | null;
      researchDesign: string | null;
      scopeStatus: string;
      supportLevel: string;
      techniques: string[];
    } | null;
    proposalFrameworkCandidate: {
      coreFramework: string | null;
      supportingFrameworks: string[];
    } | null;
    weakSectionCompletionCount: number;
    previewWeakSections: Array<{
      sectionKey: string;
      draftabilityStatus: string;
      evidenceBackedPointCount: number;
      inferenceBridgeCount: number;
      assumptionCount: number;
      missingEvidence: string[];
    }>;
    previewSections: Array<{
      sectionKey: string;
      readiness: string;
      enoughToDraft: boolean;
      sourceCount: number;
      snippetCount: number;
      assetCount: number;
      missingElements: string[];
    }>;
  } | null;
  evidencePacksArtifact: {
    extractionMode: EvidencePackArtifact["extraction_mode"];
    packCount: number;
    warningCount: number;
    previewPacks: Array<{
      sourceId: string;
      problemSignal: string | null;
      methodSignal: string | null;
      contextSignal: string | null;
      findingSignal: string | null;
    }>;
  } | null;
  bundle: {
    selectedCount: number;
    pdfLinkedCount: number;
  } | null;
  archivePath: string;
  step1: {
    projectTitle: string | null;
    university: string | null;
    program: string | null;
    templateKey: string | null;
    llmStatus: "llm" | "fallback" | "pending";
    canonicalTopicEs: string | null;
    problemCoreEs: string | null;
    methodPreferenceEs: string | null;
    targetScopeEs: string | null;
    retrievalBriefEn: string | null;
    detectedMixedLanguageFields: string[];
    preservedTerms: string[];
    changeNotes: string[];
    llmPromptLabels: string[];
  } | null;
  tokenUsage: {
    startedDate: string;
    pricingVersion: string;
    pricingSourceUrl: string;
    fxRateUsdToCad: number;
    fxPublishedDate: string;
    fxSourceUrl: string;
    today: {
      calls: number;
      totalTokens: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      costUsd: number;
      costCad: number;
    };
    cumulative: {
      calls: number;
      totalTokens: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      costUsd: number;
      costCad: number;
    };
    baselineHistorical: {
      active: boolean;
      startDate: string | null;
      endDate: string | null;
      costUsd: number;
      costCad: number;
      totalTokens: number | null;
      notes: string | null;
    };
    effectiveTotals: {
      trackedTokensOnly: number;
      totalTokensIncludingBaseline: number | null;
      trackedCostCad: number;
      totalProjectCostCad: number;
      trackedCostUsd: number;
      totalProjectCostUsd: number;
    };
  };
};

const DEBUG_DIR = path.join(process.cwd(), "artifacts-local", "blueprint_launch", "debug_runs");
const LATEST_DEBUG_FILE = path.join(DEBUG_DIR, "latest-debug.json");
const TOTAL_INTAKE_FIELDS = 8;

function buildTimestampToken(value: string) {
  return value.replace(/[:.]/g, "-");
}

function countCompletedFields(state: BlueprintLaunchLocalState) {
  const intake = state.savedIntake?.intake;

  if (!intake) {
    return 0;
  }

  return [
    intake.topic,
    intake.problemContext,
    intake.researchLine,
    intake.academicConstraints,
    intake.targetPopulation,
    intake.availableData,
    intake.preferredMethodology,
    intake.advisorNotes,
  ].filter((value) => typeof value === "string" && value.trim().length > 0).length;
}

function renderKeywordGroup(values: Array<{ label: string; variants: string[] }>) {
  return values.map((group) => `${group.label}: ${group.variants.join(" or ")}`);
}

function buildSourceAccessSummary(
  sourceAccessResolution: BlueprintLaunchSourceAccessResolutionResult | null,
) {
  if (!sourceAccessResolution) {
    return null;
  }

  return {
    completePublicCount: sourceAccessResolution.completePublicCount,
    partialPublicCount: sourceAccessResolution.partialPublicCount,
    metadataOnlyCount: sourceAccessResolution.metadataOnlyCount,
    unresolvedCount: sourceAccessResolution.unresolvedCount,
    previewItems: sourceAccessResolution.items.map((item) => ({
      sourceId: item.sourceId,
      title: item.title,
      status: item.status,
      kind: item.kind,
      languageDetected: item.languageDetected,
      resolvedVia: item.resolvedVia,
      resolvedContentUrl: item.resolvedContentUrl,
      candidateCount: item.candidateSummary.length,
      warningCount: item.warnings.length,
    })),
    llmPromptCount: sourceAccessResolution.llmPromptCount,
  };
}

function buildDebugSnapshot(params: {
  state: BlueprintLaunchLocalState;
  tokenUsage: Awaited<ReturnType<typeof readLlmUsageRegistry>>;
  eventType: BlueprintLaunchDebugSnapshot["eventType"];
  bundle?: BlueprintLaunchSelectedSourceBundle | null;
  archivePath: string;
}): BlueprintLaunchDebugSnapshot {
  const { state, tokenUsage, eventType, bundle, archivePath } = params;
  const metadata = state.searchSnapshot?.metadata;
  const references = state.searchSnapshot?.references ?? [];
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayTotals = tokenUsage.byDate[todayDate] ?? {
    calls: 0,
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    costCad: 0,
  };

  return {
    savedAt: new Date().toISOString(),
    eventType,
    step1: state.projectSnapshot && state.intakeImprovementResult && state.projectGlobalContext
      ? {
          projectTitle: state.projectSnapshot.projectTitle,
          university: state.projectSnapshot.university,
          program: state.projectSnapshot.program,
          templateKey: state.projectSnapshot.templateKey,
          llmStatus: state.intakeImprovementResult.llmStatus,
          canonicalTopicEs: state.projectGlobalContext.canonicalTopicEs,
          problemCoreEs: state.projectGlobalContext.problemCoreEs,
          methodPreferenceEs: state.projectGlobalContext.methodPreferenceEs,
          targetScopeEs: state.projectGlobalContext.targetScopeEs,
          retrievalBriefEn: state.projectGlobalContext.retrievalBriefEn,
          detectedMixedLanguageFields:
            state.intakeImprovementResult.detectedMixedLanguageFields,
          preservedTerms: state.intakeImprovementResult.preservedTerms,
          changeNotes: state.intakeImprovementResult.changeNotes,
          llmPromptLabels: state.intakeImprovementResult.llmPrompts.map((prompt) => prompt.label),
        }
      : null,
    tokenUsage: {
      startedDate: tokenUsage.startedDate,
      pricingVersion: tokenUsage.pricingVersion,
      pricingSourceUrl: tokenUsage.pricingSourceUrl,
      fxRateUsdToCad: tokenUsage.fxRateUsdToCad,
      fxPublishedDate: tokenUsage.fxPublishedDate,
      fxSourceUrl: tokenUsage.fxSourceUrl,
      today: todayTotals,
      cumulative: tokenUsage.cumulative,
      baselineHistorical: {
        active: tokenUsage.baselineHistorical.active,
        startDate: tokenUsage.baselineHistorical.startDate,
        endDate: tokenUsage.baselineHistorical.endDate,
        costUsd: tokenUsage.baselineHistorical.costUsd,
        costCad: tokenUsage.baselineHistorical.costCad,
        totalTokens: tokenUsage.baselineHistorical.totalTokens,
        notes: tokenUsage.baselineHistorical.notes,
      },
      effectiveTotals: {
        trackedTokensOnly: tokenUsage.cumulative.totalTokens,
        totalTokensIncludingBaseline:
          tokenUsage.baselineHistorical.totalTokens === null
            ? null
            : tokenUsage.baselineHistorical.totalTokens + tokenUsage.cumulative.totalTokens,
        trackedCostCad: tokenUsage.cumulative.costCad,
        totalProjectCostCad:
          tokenUsage.baselineHistorical.costCad + tokenUsage.cumulative.costCad,
        trackedCostUsd: tokenUsage.cumulative.costUsd,
        totalProjectCostUsd:
          tokenUsage.baselineHistorical.costUsd + tokenUsage.cumulative.costUsd,
      },
    },
    knowledgeAreaLabel: state.savedIntake?.projectContext.knowledgeAreaLabel ?? null,
    intakeStatus: state.savedIntake?.status ?? null,
    intakeCompletedFields: countCompletedFields(state),
    intakeTotalFields: TOTAL_INTAKE_FIELDS,
    derivedSearchQuery: state.savedIntake?.derivedSearchQuery ?? null,
    plannerStatus: metadata?.plannerStatus ?? "pending",
    plannerErrorStage: metadata?.plannerErrorStage ?? null,
    plannerErrorMessage: metadata?.plannerErrorMessage ?? null,
    normalizedTopic: metadata?.normalizedTopic ?? null,
    intentSummary: metadata?.intentSummary ?? null,
    subdomain: metadata?.subdomain ?? null,
    primarySystem: metadata?.primarySystem ?? null,
    primaryPhenomenon: metadata?.primaryPhenomenon ?? null,
    primaryGoal: metadata?.primaryGoal ?? null,
    keywordGroups: {
      necessary: metadata ? renderKeywordGroup(metadata.keywordGroups.necessary) : [],
      complementary: metadata ? renderKeywordGroup(metadata.keywordGroups.complementary) : [],
      optional: metadata ? renderKeywordGroup(metadata.keywordGroups.optional) : [],
    },
    search: {
      searchQuery: state.searchSnapshot?.searchQuery ?? null,
      attemptedQueryCount: state.searchSnapshot?.attemptedQueries.length ?? 0,
      totalResults: state.searchSnapshot?.totalResults ?? 0,
      selectedCount: references.filter((item) => item.selected).length,
      pdfAccessibleCount: references.filter((item) => item.reference.pdfAccessible).length,
    },
    sourceAccessResolution: buildSourceAccessSummary(state.sourceAccessResolution),
    sourceIntakeGate: state.sourceIntakeGate ?? null,
    evidenceCompletion: state.evidenceCompletion
      ? {
          decision: state.evidenceCompletion.decision,
          reason: state.evidenceCompletion.reason,
          cardCount: state.evidenceCompletion.cards.length,
          completedFromAbstractCount: state.evidenceCompletion.completedFromAbstractCount,
          completedFromMetadataCount: state.evidenceCompletion.completedFromMetadataCount,
          usableCount: state.evidenceCompletion.usableCount,
          weakSupportCount: state.evidenceCompletion.weakSupportCount,
          offTopicCount: state.evidenceCompletion.offTopicCount,
          methodologySupportCount: state.evidenceCompletion.methodologySupportCount,
          frameworkSupportCount: state.evidenceCompletion.frameworkSupportCount,
          previewCards: state.evidenceCompletion.cards.slice(0, 3).map((card) => ({
            referenceId: card.referenceId,
            title: card.title,
            applicabilityToProject: card.applicabilityToProject,
            usefulnessLabel: card.usefulnessLabel,
            supportsSectionKeys: card.supportsSectionKeys,
            methodologyHints: card.methodologyHints,
            frameworkHints: card.frameworkHints,
            decisionValue: card.decisionValue,
          })),
        }
      : null,
    contentMaterialization: state.contentMaterialization
      ? {
          attemptedCount: state.contentMaterialization.attemptedCount,
          materializedCount: state.contentMaterialization.materializedCount,
          pdfCount: state.contentMaterialization.pdfCount,
          webCount: state.contentMaterialization.webCount,
          failedCount: state.contentMaterialization.failedCount,
          skippedCount: state.contentMaterialization.skippedCount,
          previewItems: state.contentMaterialization.items.slice(0, 4).map((item) => ({
            sourceId: item.sourceId,
            title: item.title,
            materializationStatus: item.materializationStatus,
            storedKind: item.storedKind,
            localPrimaryPath: item.localPrimaryPath,
            localTextPath: item.localTextPath,
          })),
        }
      : null,
    sourceSignalExtraction: state.sourceSignalExtraction
      ? {
          extractionMode: state.sourceSignalExtraction.extractionMode,
          llmStatus: state.sourceSignalExtraction.llmStatus,
          llmPromptCount: state.sourceSignalExtraction.llmPromptCount,
          llmCallCount: state.sourceSignalExtraction.llmCallCount,
          runDir: state.sourceSignalExtraction.runDir,
          readyForStep6: state.sourceSignalExtraction.readyForStep6,
          sourceCount: state.sourceSignalExtraction.sourceCount,
          textExtractionCount: state.sourceSignalExtraction.textExtractionCount,
          totalTextCharCount: state.sourceSignalExtraction.totalTextCharCount,
          pdfInputCount: state.sourceSignalExtraction.pdfInputCount,
          webInputCount: state.sourceSignalExtraction.webInputCount,
          abstractOnlyCount: state.sourceSignalExtraction.abstractOnlyCount,
          totalSnippetCount: state.sourceSignalExtraction.totalSnippetCount,
          totalAssetCount: state.sourceSignalExtraction.totalAssetCount,
          equationAssetCount: state.sourceSignalExtraction.equationAssetCount,
          tableAssetCount: state.sourceSignalExtraction.tableAssetCount,
          imageAssetCount: state.sourceSignalExtraction.imageAssetCount,
          warningCount: state.sourceSignalExtraction.warnings.length,
          warnings: state.sourceSignalExtraction.warnings,
          previewSources: state.sourceSignalExtraction.sources.slice(0, 4).map((source) => ({
            sourceId: source.sourceId,
            title: source.title,
            inputMode: source.inputMode,
            primaryPath: source.primaryPath,
            secondaryPath: source.secondaryPath,
            extractedTextPath: source.extractedTextPath,
            pageCount: source.pageCount,
            textCharCount: source.textCharCount,
            detectedLanguage: source.detectedLanguage,
            sourceOverview: source.sourceOverview,
            topicRelevance: source.topicRelevance,
            proposalUsefulness: source.proposalUsefulness,
            supportsSectionKeys: source.supportsSectionKeys,
            methodologyHints: source.methodologyHints,
            frameworkHints: source.frameworkHints,
            problemSignal: source.problemSignal,
            methodSignal: source.methodSignal,
            contextSignal: source.contextSignal,
            findingSignal: source.findingSignal,
            limitationSignal: source.limitationSignal,
            futureLineSignal: source.futureLineSignal,
            pdfSectionsAvailable: source.pdfSectionsAvailable,
            snippetCount: source.snippetCount,
            assetCount: source.assetCount,
            equationAssetCount: source.equationAssetCount,
            tableAssetCount: source.tableAssetCount,
            imageAssetCount: source.imageAssetCount,
            warnings: source.warnings,
          })),
        }
      : null,
    consolidatedEvidenceArtifact: state.consolidatedEvidenceArtifact
      ? {
          consolidationMode: state.consolidatedEvidenceArtifact.consolidation_mode,
          overallReadiness: state.consolidatedEvidenceArtifact.coverage_map.overall_readiness,
          readySectionCount: state.consolidatedEvidenceArtifact.coverage_map.ready_section_count,
          partialSectionCount: state.consolidatedEvidenceArtifact.coverage_map.partial_section_count,
          lowSectionCount: state.consolidatedEvidenceArtifact.coverage_map.low_section_count,
          dominantMethods: state.consolidatedEvidenceArtifact.dominant_methods.slice(0, 5),
          dominantFrameworks: state.consolidatedEvidenceArtifact.dominant_frameworks.slice(0, 5),
          evidenceGapCount: state.consolidatedEvidenceArtifact.evidence_gaps.length,
          proposalDirectionCount: state.consolidatedEvidenceArtifact.proposal_directions.length,
          blockingRequirementCount:
            state.consolidatedEvidenceArtifact.followup_requirements.blocking.length,
          recommendedRequirementCount:
            state.consolidatedEvidenceArtifact.followup_requirements.recommended.length,
          proposalMethodCandidate: {
            methodFamily:
              state.consolidatedEvidenceArtifact.proposal_method_candidate.method_family,
            researchDesign:
              state.consolidatedEvidenceArtifact.proposal_method_candidate.research_design,
            scopeStatus:
              state.consolidatedEvidenceArtifact.proposal_method_candidate.application_scope_status,
            supportLevel:
              state.consolidatedEvidenceArtifact.proposal_method_candidate.evidence_support_level,
            techniques:
              state.consolidatedEvidenceArtifact.proposal_method_candidate.candidate_techniques.slice(
                0,
                5,
              ),
          },
          proposalFrameworkCandidate: {
            coreFramework:
              state.consolidatedEvidenceArtifact.proposal_framework_candidate.core_framework,
            supportingFrameworks:
              state.consolidatedEvidenceArtifact.proposal_framework_candidate.supporting_frameworks.slice(
                0,
                5,
              ),
          },
          weakSectionCompletionCount:
            state.consolidatedEvidenceArtifact.weak_section_completion_packets.length,
          previewWeakSections: state.consolidatedEvidenceArtifact.weak_section_completion_packets
            .slice(0, 4)
            .map((packet) => ({
              sectionKey: packet.section_key,
              draftabilityStatus: packet.draftability_status,
              evidenceBackedPointCount: packet.evidence_backed_points.length,
              inferenceBridgeCount: packet.inference_bridges.length,
              assumptionCount: packet.assumptions_needed.length,
              missingEvidence: packet.missing_evidence,
            })),
          previewSections: state.consolidatedEvidenceArtifact.section_readiness_map
            .slice(0, 6)
            .map((section) => ({
              sectionKey: section.section_key,
              readiness: section.readiness,
              enoughToDraft: section.enough_to_draft,
              sourceCount: section.source_count,
              snippetCount: section.snippet_count,
              assetCount: section.asset_count,
              missingElements: section.missing_elements,
            })),
        }
      : null,
    evidencePacksArtifact: state.evidencePacksArtifact
      ? {
          extractionMode: state.evidencePacksArtifact.extraction_mode,
          packCount: state.evidencePacksArtifact.packs.length,
          warningCount: state.evidencePacksArtifact.warnings.length,
          previewPacks: state.evidencePacksArtifact.packs.slice(0, 3).map((pack) => ({
            sourceId: pack.source_id,
            problemSignal: pack.problem_signal,
            methodSignal: pack.method_signal,
            contextSignal: pack.context_signal,
            findingSignal: pack.finding_signal,
          })),
        }
      : null,
    bundle: bundle
      ? {
          selectedCount: bundle.selectedCount,
          pdfLinkedCount: bundle.pdfLinkedCount,
        }
      : state.selectedSourcesBundle
        ? {
            selectedCount: state.selectedSourcesBundle.selectedCount,
            pdfLinkedCount: state.selectedSourcesBundle.pdfLinkedCount,
          }
        : null,
    archivePath,
  };
}

export async function recordBlueprintLaunchDebugSnapshot(params: {
  eventType: BlueprintLaunchDebugSnapshot["eventType"];
  bundle?: BlueprintLaunchSelectedSourceBundle | null;
}) {
  const [state, tokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLlmUsageRegistry(),
  ]);
  const savedAt = new Date().toISOString();
  const archivePath = path.join(
    DEBUG_DIR,
    `debug-${buildTimestampToken(savedAt)}-${params.eventType.toLowerCase()}.json`,
  );
  const snapshot = buildDebugSnapshot({
    state,
    tokenUsage,
    eventType: params.eventType,
    bundle: params.bundle ?? null,
    archivePath,
  });

  await mkdir(DEBUG_DIR, { recursive: true });
  await writeFile(archivePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(LATEST_DEBUG_FILE, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  return snapshot;
}

export async function readLatestBlueprintLaunchDebugSnapshot() {
  try {
    const raw = await readFile(LATEST_DEBUG_FILE, "utf8");
    return JSON.parse(raw) as BlueprintLaunchDebugSnapshot;
  } catch {
    return null;
  }
}
