import type { ConsolidatedEvidenceArtifact } from "@/blueprint_launch/server/local-playground-store";
import type { EvidenceLedger, MasterBlueprintEngineProject } from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

import {
  buildEvidenceUnitMap,
  createContentHash,
  sanitizeRecoveredText,
  type MethodBundle,
  type MethodScopeGuidanceItem,
  type SectionEvidenceHydrationPlanItem,
  uniqueEvidenceUnits,
} from "@/server/blueprint-v2/sections/section-generation-shared";

function dedupeTexts(values: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = sanitizeRecoveredText(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

export function buildMethodBundle(input: {
  sectionKey: string;
  project: MasterBlueprintEngineProject;
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
  methodGuidance: MethodScopeGuidanceItem | null;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  evidenceLedger: EvidenceLedger;
}) {
  const evidenceUnitMap = buildEvidenceUnitMap(input.consolidatedEvidence);
  const evidenceIds = Array.from(
    new Set([
      ...(input.hydrationItem?.priority_original_excerpt_ids ?? []),
      ...(input.hydrationItem?.priority_evidence_ids ?? []),
    ]),
  ).slice(0, 6);
  const units = uniqueEvidenceUnits(
    evidenceIds.map((evidenceId) => evidenceUnitMap.get(evidenceId)),
  );
  const relatedSnippets = (input.hydrationItem?.priority_snippet_ids ?? [])
    .map((snippetId) =>
      input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId),
    )
    .filter((snippet): snippet is NonNullable<typeof snippet> => Boolean(snippet))
    .slice(0, 4);

  const studyType = dedupeTexts(
    [
      input.project.intake.preferredMethodology,
      ...(input.methodGuidance?.supporting_method_signals ?? []),
      ...relatedSnippets.map((snippet) => snippet.text),
    ],
    3,
  ).map((text) => clipText(text, 150) ?? text);
  const designType = dedupeTexts(
    [
      ...(input.methodGuidance?.expected_elements ?? []),
      ...units.map((unit) => unit.summary_es),
    ],
    3,
  ).map((text) => clipText(text, 150) ?? text);
  const unitOfAnalysis = dedupeTexts(
    [
      input.project.intake.targetPopulation,
      input.project.intake.problemContext,
    ],
    2,
  ).map((text) => clipText(text, 180) ?? text);
  const dataSupport = dedupeTexts(
    [
      input.project.intake.availableData,
      ...relatedSnippets.map((snippet) => snippet.text),
      ...units.map((unit) => unit.summary_es),
    ],
    3,
  ).map((text) => clipText(text, 180) ?? text);
  const analysisStrategy = dedupeTexts(
    [
      ...(input.methodGuidance?.supporting_method_signals ?? []),
      ...(input.methodGuidance?.expected_elements ?? []),
      ...units.map((unit) => unit.label),
    ],
    3,
  ).map((text) => clipText(text, 160) ?? text);
  const criteriaOrCategories = dedupeTexts(
    [
      ...(input.methodGuidance?.expected_elements ?? []),
      ...(input.hydrationItem?.required_structure ?? []),
      ...relatedSnippets.map((snippet) => snippet.label),
    ],
    4,
  );
  const limitsAndConditions = dedupeTexts(
    [
      ...(input.hydrationItem?.key_gaps ?? []),
      ...(input.methodGuidance?.avoid ?? []),
    ],
    3,
  ).map((text) => clipText(text, 180) ?? text);
  const priorityQuotes = dedupeTexts(
    units.map((unit) => unit.original_text ?? unit.summary_es),
    3,
  ).map((text) => clipText(text, 260) ?? text);
  const bundleHash = createContentHash(
    input.sectionKey,
    ...studyType,
    ...designType,
    ...unitOfAnalysis,
    ...dataSupport,
    ...analysisStrategy,
    ...criteriaOrCategories,
    ...limitsAndConditions,
    ...priorityQuotes,
    ...evidenceIds,
  );

  return {
    section_key: input.sectionKey,
    study_type: studyType,
    design_type: designType,
    unit_of_analysis: unitOfAnalysis,
    data_support: dataSupport,
    analysis_strategy: analysisStrategy,
    criteria_or_categories: criteriaOrCategories,
    limits_and_conditions: limitsAndConditions,
    priority_quotes: priorityQuotes,
    evidence_ids: evidenceIds,
    bundle_hash: bundleHash,
  } satisfies MethodBundle;
}
