import type {
  AssetHandoffRecord,
  EvidenceEngineHandoffV1,
  EvidenceUnitHandoffRecord,
} from "@/server/blueprint-engine/contracts";
import { summarizeCitationSemantics } from "@/server/blueprint-engine/quality/citation-semantics";
import {
  summarizeSourceHealthFromHandoff,
  type SourceHealthClassification,
} from "@/server/blueprint-engine/quality/source-health";

export type EvidenceBudgetPolicyV1 = {
  policy_version: "evidence_budget.v1";
  max_sources_for_production: number;
  min_usable_full_text_sources_for_production: number;
  max_text_chars_per_source_for_prompting: number;
  max_chunks_per_source_for_prompting: number;
  max_evidence_units_total: number;
  max_evidence_units_per_section: number;
  max_evidence_units_per_source_per_section: number;
  max_asset_refs_total: number;
  max_pdf_pages_without_reduction: number;
  oversized_pdf_page_threshold: number;
  oversized_text_char_threshold: number;
  source_dominance_threshold: number;
  scanned_pdf_requires_ocr: boolean;
};

export type ReducedEvidencePackUnitV1 = {
  evidence_id: string;
  source_id: string;
  section_keys: string[];
  unit_type: EvidenceUnitHandoffRecord["unit_type"];
  citation_eligibility: EvidenceUnitHandoffRecord["citation_eligibility"];
  claim_scope: EvidenceUnitHandoffRecord["claim_scope"];
  evidence_use: "direct" | "cautious" | "context_only" | "gap_only" | "do_not_use";
  score: number;
  included_reason: string;
  original_text: string | null;
  summary_es: string | null;
  asset_key?: string | null;
  traceability: {
    original_evidence_id: string;
    source_id: string;
    asset_key?: string | null;
    quote_hash?: string | null;
  };
};

export type ReducedEvidencePackExcludedSummaryV1 = {
  evidence_id: string;
  source_id: string;
  section_keys: string[];
  reason: string;
  score: number;
};

export type ReducedEvidencePackV1 = {
  artifact_type: "reduced_evidence_pack";
  artifact_version: "v1";
  generated_at: string;
  handoff_id: string;
  project_id: string;
  immutable_snapshot_hash: string;
  policy: EvidenceBudgetPolicyV1;
  original_counts: {
    sources: number;
    evidence_units: number;
    asset_refs: number;
    true_source_backed_direct_quotes: number;
  };
  reduced_counts: {
    sources: number;
    evidence_units: number;
    asset_refs: number;
    section_keys: number;
    true_source_backed_direct_quotes: number;
  };
  source_distribution: Array<{
    source_id: string;
    original_evidence_unit_count: number;
    reduced_evidence_unit_count: number;
    reduced_share: number;
    source_health: string;
    topic_fit: string;
    allowed_evidence_use: string;
  }>;
  section_distribution: Array<{
    section_key: string;
    original_evidence_unit_count: number;
    reduced_evidence_unit_count: number;
    covered: boolean;
  }>;
  evidence_units: ReducedEvidencePackUnitV1[];
  asset_refs: Array<Pick<AssetHandoffRecord, "asset_key" | "source_id" | "asset_kind" | "title" | "caption" | "page_number">>;
  excluded_evidence_summary: ReducedEvidencePackExcludedSummaryV1[];
  warnings: string[];
};

export const DEFAULT_EVIDENCE_BUDGET_POLICY: EvidenceBudgetPolicyV1 = {
  policy_version: "evidence_budget.v1",
  max_sources_for_production: 8,
  min_usable_full_text_sources_for_production: 4,
  max_text_chars_per_source_for_prompting: 45_000,
  max_chunks_per_source_for_prompting: 18,
  max_evidence_units_total: 80,
  max_evidence_units_per_section: 8,
  max_evidence_units_per_source_per_section: 3,
  max_asset_refs_total: 12,
  max_pdf_pages_without_reduction: 50,
  oversized_pdf_page_threshold: 100,
  oversized_text_char_threshold: 120_000,
  source_dominance_threshold: 0.45,
  scanned_pdf_requires_ocr: true,
};

type ScoredUnit = {
  unit: EvidenceUnitHandoffRecord;
  score: number;
  evidenceUse: ReducedEvidencePackUnitV1["evidence_use"];
  health: SourceHealthClassification;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function textLength(unit: EvidenceUnitHandoffRecord) {
  return (unit.original_text ?? unit.summary_es ?? unit.caption ?? "").length;
}

function sourceEvidenceUse(
  source: SourceHealthClassification | undefined,
): ReducedEvidencePackUnitV1["evidence_use"] {
  if (!source) return "context_only";
  if (source.allowed_evidence_use === "direct_claim_support") return "direct";
  if (source.allowed_evidence_use === "cautious_support") return "cautious";
  if (source.allowed_evidence_use === "gap_only") return "gap_only";
  if (source.allowed_evidence_use === "do_not_use") return "do_not_use";
  return "context_only";
}

function scoreEvidenceUnit(
  unit: EvidenceUnitHandoffRecord,
  source: SourceHealthClassification,
) {
  let score = 0;

  if (unit.unit_type === "original_excerpt" && unit.citation_eligibility === "direct_quote") {
    score += 100;
  } else if (unit.unit_type === "original_excerpt") {
    score += 78;
  } else if (unit.citation_eligibility === "paraphrase_only") {
    score += 62;
  } else if (unit.citation_eligibility === "asset_reference" || unit.asset_key) {
    score += 58;
  } else if (unit.unit_type === "interpreted_signal") {
    score += 44;
  } else {
    score += 12;
  }

  score += Math.max(0, Math.min(1, unit.confidence)) * 8;
  score += Math.max(0, Math.min(1, unit.relevance_score)) * 12;

  if (unit.quote_hash) score += 8;
  if (unit.original_text && unit.original_text.length >= 120) score += 4;
  if (source.allowed_evidence_use === "direct_claim_support") score += 10;
  if (source.allowed_evidence_use === "cautious_support") score -= 8;
  if (source.allowed_evidence_use === "context_only") score -= 35;
  if (source.allowed_evidence_use === "gap_only") score -= 65;
  if (source.allowed_evidence_use === "do_not_use") score -= 100;
  if (source.topic_fit === "adjacent") score -= 18;
  if (source.source_health === "metadata_only") score -= 50;
  if (source.source_health === "unresolved") score -= 75;
  if (source.source_health === "unextractable_pdf") score -= 65;

  return Math.max(0, Math.round(score));
}

function makeScoredUnits(
  handoff: EvidenceEngineHandoffV1,
): { units: ScoredUnit[]; sourceHealthById: Map<string, SourceHealthClassification> } {
  const sourceHealth = summarizeSourceHealthFromHandoff(handoff).sources;
  const sourceHealthById = new Map(sourceHealth.map((source) => [source.source_id, source]));
  const fallback = (sourceId: string): SourceHealthClassification => ({
    source_id: sourceId,
    source_health: "unknown",
    topic_fit: "unknown",
    allowed_evidence_use: "context_only",
    reasons: ["fallback_unknown_source_health"],
    warnings: [],
  });
  const units = handoff.evidence_units.map((unit) => {
    const health = sourceHealthById.get(unit.source_id) ?? fallback(unit.source_id);
    return {
      unit,
      health,
      score: scoreEvidenceUnit(unit, health),
      evidenceUse: sourceEvidenceUse(health),
    };
  });

  return { units, sourceHealthById };
}

function unitSort(left: ScoredUnit, right: ScoredUnit) {
  return right.score - left.score || right.unit.confidence - left.unit.confidence;
}

function countBy<T>(values: T[], key: (value: T) => string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const itemKey = key(value);
    counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1);
  }
  return counts;
}

function includeUnit(input: {
  selected: Map<string, ScoredUnit>;
  candidate: ScoredUnit;
  policy: EvidenceBudgetPolicyV1;
  sourceCounts: Map<string, number>;
  sectionSourceCounts: Map<string, number>;
  maxUnitsPerSource: number;
  forceSectionCoverage?: boolean;
}) {
  const { candidate, selected, policy, sourceCounts, sectionSourceCounts } = input;
  const unit = candidate.unit;

  if (selected.has(unit.evidence_id)) {
    return false;
  }

  if (
    !input.forceSectionCoverage &&
    (candidate.evidenceUse === "context_only" ||
      candidate.evidenceUse === "gap_only" ||
      candidate.evidenceUse === "do_not_use")
  ) {
    return false;
  }

  if (selected.size >= policy.max_evidence_units_total) {
    return false;
  }

  const sourceCount = sourceCounts.get(unit.source_id) ?? 0;
  if (!input.forceSectionCoverage && sourceCount >= input.maxUnitsPerSource) {
    return false;
  }

  for (const sectionKey of unit.section_keys.length > 0 ? unit.section_keys : ["unmapped"]) {
    const sectionSourceKey = `${sectionKey}::${unit.source_id}`;
    if (
      !input.forceSectionCoverage &&
      (sectionSourceCounts.get(sectionSourceKey) ?? 0) >=
        policy.max_evidence_units_per_source_per_section
    ) {
      return false;
    }
  }

  selected.set(unit.evidence_id, candidate);
  sourceCounts.set(unit.source_id, sourceCount + 1);
  for (const sectionKey of unit.section_keys.length > 0 ? unit.section_keys : ["unmapped"]) {
    const sectionSourceKey = `${sectionKey}::${unit.source_id}`;
    sectionSourceCounts.set(sectionSourceKey, (sectionSourceCounts.get(sectionSourceKey) ?? 0) + 1);
  }

  return true;
}

function includedReason(unit: ScoredUnit) {
  if (unit.evidenceUse === "direct") return "strong_direct_source_backed_evidence";
  if (unit.evidenceUse === "cautious") return "cautious_or_adjacent_context_retained";
  if (unit.evidenceUse === "context_only") return "context_only_evidence_retained_for_coverage";
  return "gap_marker_retained_for_traceability";
}

function excludedReason(unit: ScoredUnit, selected: Map<string, ScoredUnit>) {
  if (selected.has(unit.unit.evidence_id)) return "included";
  if (unit.evidenceUse === "do_not_use") return "source_marked_do_not_use";
  if (unit.evidenceUse === "gap_only") return "source_gap_only_or_unresolved";
  if (unit.evidenceUse === "context_only") return "metadata_or_context_only_demoted";
  if (unit.health.topic_fit === "adjacent") return "adjacent_source_limited";
  return "evidence_budget_limit";
}

export function buildReducedEvidencePackFromHandoff(
  handoff: EvidenceEngineHandoffV1,
  options: { policy?: Partial<EvidenceBudgetPolicyV1>; generatedAt?: string } = {},
): ReducedEvidencePackV1 {
  const policy = {
    ...DEFAULT_EVIDENCE_BUDGET_POLICY,
    ...(options.policy ?? {}),
    policy_version: "evidence_budget.v1" as const,
  };
  const { units, sourceHealthById } = makeScoredUnits(handoff);
  const selected = new Map<string, ScoredUnit>();
  const sourceCounts = new Map<string, number>();
  const sectionSourceCounts = new Map<string, number>();
  const sourceIds = new Set(handoff.source_registry.map((source) => source.source_id));
  const maxUnitsPerSource = Math.max(
    1,
    sourceIds.size <= 1
      ? policy.max_evidence_units_total
      : Math.ceil(policy.max_evidence_units_total * policy.source_dominance_threshold),
  );
  const scoredById = new Map(units.map((unit) => [unit.unit.evidence_id, unit]));
  const sectionKeys = unique(handoff.section_packets.map((packet) => packet.section_key));

  for (const sectionKey of sectionKeys) {
    const candidateIds = new Set(
      handoff.section_packets
        .filter((packet) => packet.section_key === sectionKey)
        .flatMap((packet) => packet.evidence_ids),
    );
    const sectionCandidates = units
      .filter((unit) =>
        candidateIds.has(unit.unit.evidence_id) || unit.unit.section_keys.includes(sectionKey),
      )
      .sort(unitSort);
    for (const candidate of sectionCandidates) {
      if (
        includeUnit({
          selected,
          candidate,
          policy,
          sourceCounts,
          sectionSourceCounts,
          maxUnitsPerSource,
          forceSectionCoverage: true,
        })
      ) {
        break;
      }
    }
  }

  for (const sectionKey of sectionKeys) {
    const sectionCandidates = units
      .filter((unit) => unit.unit.section_keys.includes(sectionKey))
      .sort(unitSort);
    const includedForSection = () =>
      Array.from(selected.values()).filter((entry) => entry.unit.section_keys.includes(sectionKey))
        .length;

    for (const candidate of sectionCandidates) {
      if (includedForSection() >= policy.max_evidence_units_per_section) break;
      includeUnit({
        selected,
        candidate,
        policy,
        sourceCounts,
        sectionSourceCounts,
        maxUnitsPerSource,
      });
    }
  }

  for (const candidate of [...units].sort(unitSort)) {
    includeUnit({
      selected,
      candidate,
      policy,
      sourceCounts,
      sectionSourceCounts,
      maxUnitsPerSource,
    });
  }

  const selectedUnits = Array.from(selected.values()).sort(unitSort);
  const selectedEvidenceIds = new Set(selectedUnits.map((unit) => unit.unit.evidence_id));
  const selectedAssetKeys = unique(selectedUnits.map((unit) => unit.unit.asset_key ?? undefined));
  const selectedAssets = handoff.asset_registry
    .filter((asset) => selectedAssetKeys.includes(asset.asset_key))
    .slice(0, policy.max_asset_refs_total);
  const selectedAssetKeySet = new Set(selectedAssets.map((asset) => asset.asset_key));
  const citationSummary = summarizeCitationSemantics(selectedUnits.map((unit) => unit.unit));
  const originalCitationSummary = summarizeCitationSemantics(handoff.evidence_units);
  const originalSourceCounts = countBy(handoff.evidence_units, (unit) => unit.source_id);
  const selectedSourceCounts = countBy(selectedUnits, (unit) => unit.unit.source_id);
  const selectedSectionKeys = new Set(selectedUnits.flatMap((unit) => unit.unit.section_keys));
  const warnings: string[] = [];

  for (const source of handoff.source_registry) {
    const sourceUnits = handoff.evidence_units.filter((unit) => unit.source_id === source.source_id);
    const chars = sourceUnits.reduce((sum, unit) => sum + textLength(unit), 0);
    const maxPage = Math.max(
      0,
      ...handoff.asset_registry
        .filter((asset) => asset.source_id === source.source_id)
        .map((asset) => asset.page_number ?? 0),
    );
    const health = sourceHealthById.get(source.source_id);
    const reducedCount = selectedSourceCounts.get(source.source_id) ?? 0;
    const reducedShare = selectedUnits.length > 0 ? reducedCount / selectedUnits.length : 0;

    if (chars > policy.oversized_text_char_threshold) {
      warnings.push(
        `oversized_pdf_warning: source ${source.source_id} has ${chars} text chars and was reduced for prompting.`,
      );
    }
    if (maxPage > policy.oversized_pdf_page_threshold) {
      warnings.push(
        `oversized_pdf_warning: source ${source.source_id} has evidence beyond page ${maxPage}.`,
      );
    } else if (maxPage > policy.max_pdf_pages_without_reduction) {
      warnings.push(
        `oversized_pdf_warning: source ${source.source_id} exceeds max_pdf_pages_without_reduction.`,
      );
    }
    if (reducedShare > policy.source_dominance_threshold && selectedUnits.length > 1) {
      warnings.push(
        `source_dominance_warning: source ${source.source_id} represents ${round3(reducedShare)} of the reduced pack.`,
      );
    }
    if (health?.source_health === "unextractable_pdf" && policy.scanned_pdf_requires_ocr) {
      warnings.push(`scanned_pdf_requires_ocr: source ${source.source_id} has no extractable PDF text.`);
    }
  }

  if (
    units.some(
      (unit) =>
        (unit.evidenceUse === "context_only" || unit.unit.unit_type === "context_only") &&
        !selectedEvidenceIds.has(unit.unit.evidence_id),
    )
  ) {
    warnings.push("metadata_only_evidence_reduced: context-only or metadata evidence was demoted.");
  }
  if (
    units.some(
      (unit) =>
        unit.health.topic_fit === "adjacent" && !selectedEvidenceIds.has(unit.unit.evidence_id),
    )
  ) {
    warnings.push("adjacent_source_limited: adjacent evidence was limited to cautious/contextual use.");
  }
  if (
    selectedUnits.length === 0 ||
    selectedSectionKeys.size < Math.min(sectionKeys.length, Math.max(1, Math.floor(sectionKeys.length * 0.6)))
  ) {
    warnings.push("insufficient_evidence_after_reduction: reduced evidence pack has weak section coverage.");
  }

  const reducedEvidenceUnits = selectedUnits.map((entry) => ({
    evidence_id: entry.unit.evidence_id,
    source_id: entry.unit.source_id,
    section_keys: entry.unit.section_keys,
    unit_type: entry.unit.unit_type,
    citation_eligibility: entry.unit.citation_eligibility,
    claim_scope: entry.unit.claim_scope,
    evidence_use: entry.evidenceUse,
    score: entry.score,
    included_reason: includedReason(entry),
    original_text: entry.unit.original_text,
    summary_es: entry.unit.summary_es,
    asset_key: selectedAssetKeySet.has(entry.unit.asset_key ?? "") ? entry.unit.asset_key : null,
    traceability: {
      original_evidence_id: entry.unit.evidence_id,
      source_id: entry.unit.source_id,
      asset_key: entry.unit.asset_key ?? null,
      quote_hash: entry.unit.quote_hash ?? null,
    },
  }));

  return {
    artifact_type: "reduced_evidence_pack",
    artifact_version: "v1",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    handoff_id: handoff.handoff_id,
    project_id: handoff.project_id,
    immutable_snapshot_hash: handoff.traceability.immutable_snapshot_hash,
    policy,
    original_counts: {
      sources: handoff.source_registry.length,
      evidence_units: handoff.evidence_units.length,
      asset_refs: handoff.asset_registry.length,
      true_source_backed_direct_quotes:
        originalCitationSummary.true_source_backed_direct_quote_count,
    },
    reduced_counts: {
      sources: new Set(reducedEvidenceUnits.map((unit) => unit.source_id)).size,
      evidence_units: reducedEvidenceUnits.length,
      asset_refs: selectedAssets.length,
      section_keys: selectedSectionKeys.size,
      true_source_backed_direct_quotes:
        citationSummary.true_source_backed_direct_quote_count,
    },
    source_distribution: handoff.source_registry.map((source) => {
      const health = sourceHealthById.get(source.source_id);
      const reducedCount = selectedSourceCounts.get(source.source_id) ?? 0;
      return {
        source_id: source.source_id,
        original_evidence_unit_count: originalSourceCounts.get(source.source_id) ?? 0,
        reduced_evidence_unit_count: reducedCount,
        reduced_share: selectedUnits.length > 0 ? round3(reducedCount / selectedUnits.length) : 0,
        source_health: health?.source_health ?? "unknown",
        topic_fit: health?.topic_fit ?? "unknown",
        allowed_evidence_use: health?.allowed_evidence_use ?? "context_only",
      };
    }),
    section_distribution: sectionKeys.map((sectionKey) => {
      const originalCount = handoff.evidence_units.filter((unit) =>
        unit.section_keys.includes(sectionKey),
      ).length;
      const reducedCount = reducedEvidenceUnits.filter((unit) =>
        unit.section_keys.includes(sectionKey),
      ).length;
      return {
        section_key: sectionKey,
        original_evidence_unit_count: originalCount,
        reduced_evidence_unit_count: reducedCount,
        covered: reducedCount > 0,
      };
    }),
    evidence_units: reducedEvidenceUnits,
    asset_refs: selectedAssets.map((asset) => ({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      asset_kind: asset.asset_kind,
      title: asset.title,
      caption: asset.caption,
      page_number: asset.page_number,
    })),
    excluded_evidence_summary: units
      .filter((unit) => !selectedEvidenceIds.has(unit.unit.evidence_id))
      .sort(unitSort)
      .slice(0, 250)
      .map((unit) => ({
        evidence_id: unit.unit.evidence_id,
        source_id: unit.unit.source_id,
        section_keys: unit.unit.section_keys,
        reason: excludedReason(unit, selected),
        score: unit.score,
      })),
    warnings: unique(warnings),
  };
}

export function applyReducedEvidencePackToHandoff(
  handoff: EvidenceEngineHandoffV1,
  reducedPack: ReducedEvidencePackV1,
): EvidenceEngineHandoffV1 {
  const evidenceIds = new Set(reducedPack.evidence_units.map((unit) => unit.evidence_id));
  const assetKeys = new Set(reducedPack.asset_refs.map((asset) => asset.asset_key));

  return {
    ...handoff,
    evidence_units: handoff.evidence_units.filter((unit) => evidenceIds.has(unit.evidence_id)),
    asset_registry: handoff.asset_registry.filter((asset) => assetKeys.has(asset.asset_key)),
    warnings: unique([
      ...handoff.warnings,
      ...reducedPack.warnings,
      `ReducedEvidencePackV1 applied for downstream prompting: ${reducedPack.reduced_counts.evidence_units}/${reducedPack.original_counts.evidence_units} evidence units retained.`,
    ]),
    proposal_context: {
      ...handoff.proposal_context,
      context_preservation_contract: {
        ...(typeof handoff.proposal_context.context_preservation_contract === "object" &&
        handoff.proposal_context.context_preservation_contract !== null &&
        !Array.isArray(handoff.proposal_context.context_preservation_contract)
          ? handoff.proposal_context.context_preservation_contract
          : {}),
        reduced_evidence_pack: {
          artifact_type: reducedPack.artifact_type,
          artifact_version: reducedPack.artifact_version,
          policy_version: reducedPack.policy.policy_version,
          original_counts: reducedPack.original_counts,
          reduced_counts: reducedPack.reduced_counts,
          warnings: reducedPack.warnings,
        },
      },
    },
  };
}
