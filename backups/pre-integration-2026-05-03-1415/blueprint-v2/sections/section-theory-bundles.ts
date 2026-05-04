import type { ConsolidatedEvidenceArtifact } from "@/blueprint_launch/server/local-playground-store";
import type { EvidenceLedger } from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

import {
  buildEvidenceUnitMap,
  createContentHash,
  sanitizeRecoveredText,
  type SectionEvidenceHydrationPlanItem,
  type TheoryBundle,
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

function resolveFocusMode(sectionKey: string): TheoryBundle["focus_mode"] {
  switch (sectionKey) {
    case "research_antecedents":
      return "antecedents";
    case "state_of_the_art":
      return "state_of_art";
    case "theoretical_bases":
      return "bases";
    default:
      return "framework";
  }
}

function buildReferenceIds(input: {
  evidenceLedger: EvidenceLedger;
  sourceIds: string[];
}) {
  return Array.from(
    new Set(
      input.sourceIds
        .map((sourceId) =>
          input.evidenceLedger.source_registry.find(
            (source) => source.source_id === sourceId,
          ),
        )
        .flatMap((source) => (source?.reference_id ? [source.reference_id] : [])),
    ),
  ).slice(0, 3);
}

export function buildTheoryBundle(input: {
  sectionKey: string;
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
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
  const focusMode = resolveFocusMode(input.sectionKey);

  const coreConstructs = dedupeTexts(
    [
      ...units.map((unit) => unit.label),
      ...relatedSnippets.map((snippet) => snippet.label),
      ...units.map((unit) => unit.summary_es),
    ],
    4,
  );
  const frameworkCandidates = dedupeTexts(
    [
      ...units.map((unit) => unit.summary_es),
      ...relatedSnippets.map((snippet) => snippet.text),
    ],
    3,
  ).map((text) => clipText(text, 160) ?? text);
  const supportingDefinitions = dedupeTexts(
    [
      ...units.map((unit) => unit.original_text),
      ...units.map((unit) => unit.summary_es),
    ],
    3,
  ).map((text) => clipText(text, 180) ?? text);
  const comparativePrecedents = dedupeTexts(
    [
      ...relatedSnippets.map((snippet) => snippet.text),
      ...units.map((unit) => unit.summary_es),
    ],
    3,
  ).map((text) => clipText(text, 180) ?? text);
  const fieldGaps = dedupeTexts(input.hydrationItem?.key_gaps ?? [], 2).map(
    (text) => clipText(text, 180) ?? text,
  );
  const priorityQuotes = dedupeTexts(
    units.map((unit) => unit.original_text ?? unit.summary_es),
    3,
  ).map((text) => clipText(text, 260) ?? text);
  const priorityReferenceIds = buildReferenceIds({
    evidenceLedger: input.evidenceLedger,
    sourceIds: input.hydrationItem?.priority_source_ids ?? [],
  });
  const bundleHash = createContentHash(
    input.sectionKey,
    focusMode,
    ...evidenceIds,
    ...coreConstructs,
    ...frameworkCandidates,
    ...supportingDefinitions,
    ...comparativePrecedents,
    ...fieldGaps,
    ...priorityReferenceIds,
  );

  return {
    section_key: input.sectionKey,
    focus_mode: focusMode,
    core_constructs: coreConstructs,
    framework_candidates: frameworkCandidates,
    supporting_definitions: supportingDefinitions,
    comparative_precedents: comparativePrecedents,
    field_gaps: fieldGaps,
    priority_quotes: priorityQuotes,
    priority_reference_ids: priorityReferenceIds,
    evidence_ids: evidenceIds,
    bundle_hash: bundleHash,
  } satisfies TheoryBundle;
}
