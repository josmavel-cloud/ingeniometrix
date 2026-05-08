import type {
  ConsolidatedEvidenceUnit,
} from "@/blueprint_launch/server/local-playground-store";
import {
  classifySourceHealth,
  type SourceAllowedEvidenceUse,
  type SourceHealth,
  type SourceHealthClassification,
  type SourceTopicFit,
} from "@/server/blueprint-engine/quality/source-health";
import type {
  SectionEvidenceBinding,
  SectionEvidenceSupportSummary,
} from "@/server/blueprint-v2/types";

export type SectionEvidenceBindingInput = {
  section_key: string;
  title?: string | null;
  content?: string | null;
  used_evidence_ids?: string[];
  used_source_ids?: string[];
  used_original_excerpt_ids?: string[];
  used_asset_keys?: string[];
  evidence_units?: ConsolidatedEvidenceUnit[];
  source_health?: Array<SourceHealthClassification | Record<string, unknown>>;
};

type SourceUseBucket = "direct" | "cautious" | "context" | "blocked";

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeSourceHealthRecord(
  value: SourceHealthClassification | Record<string, unknown>,
): SourceHealthClassification | null {
  const record = asRecord(value);
  const nested = asRecord(record.source_health_classification);
  const source = Object.keys(nested).length > 0 ? nested : record;
  const sourceId = asString(source.source_id ?? record.source_id);

  if (!sourceId) {
    return null;
  }

  return classifySourceHealth({
    source_id: sourceId,
    title: asString(source.title ?? record.title),
    source_health: asString(source.source_health) as SourceHealth,
    topic_fit: asString(source.topic_fit) as SourceTopicFit,
    allowed_evidence_use: asString(
      source.allowed_evidence_use,
    ) as SourceAllowedEvidenceUse,
    source_priority_reason: asString(record.reason),
    source_input_mode: asString(record.input_mode ?? record.inputMode),
    topic_relevance: asString(record.topic_relevance ?? record.topicRelevance),
    proposal_usefulness: asString(
      record.proposal_usefulness ?? record.proposalUsefulness,
    ),
    warnings: [
      ...asStringArray(source.warnings),
      ...asStringArray(record.warnings),
    ],
    risk_flags: asStringArray(record.risk_flags ?? record.riskFlags),
    quality_flags: asStringArray(record.quality_flags ?? record.qualityFlags),
  });
}

export function buildSourceHealthLookup(
  records: Array<SourceHealthClassification | Record<string, unknown>> = [],
) {
  const lookup = new Map<string, SourceHealthClassification>();

  for (const record of records) {
    const normalizedRecord = normalizeSourceHealthRecord(record);
    if (normalizedRecord) {
      lookup.set(normalizedRecord.source_id, normalizedRecord);
    }
  }

  return lookup;
}

function fallbackClassification(sourceId: string) {
  return classifySourceHealth({
    source_id: sourceId,
  });
}

function sourceBucket(classification: SourceHealthClassification): SourceUseBucket {
  if (classification.allowed_evidence_use === "direct_claim_support") {
    return "direct";
  }

  if (classification.allowed_evidence_use === "cautious_support") {
    return "cautious";
  }

  if (
    classification.allowed_evidence_use === "gap_only" ||
    classification.allowed_evidence_use === "do_not_use"
  ) {
    return "blocked";
  }

  return "context";
}

function unitBucket(
  unit: ConsolidatedEvidenceUnit,
  classification: SourceHealthClassification,
): SourceUseBucket {
  if (
    unit.unit_type === "metadata_context" ||
    unit.unit_type === "intake_context" ||
    unit.citation_eligibility === "context_only"
  ) {
    return "context";
  }

  if (unit.citation_eligibility === "asset_reference") {
    return sourceBucket(classification) === "direct" ? "cautious" : sourceBucket(classification);
  }

  return sourceBucket(classification);
}

function hasCentralTopicalClaim(input: {
  sectionKey: string;
  title?: string | null;
  content?: string | null;
}) {
  const text = normalized([input.sectionKey, input.title, input.content].join("\n"));
  const centralSection =
    /problem|introduction|antecedent|state_of_the_art|theoretical|framework|method|analysis|objective|question|justification|limitation/.test(
      text,
    );
  const centralTopic =
    /method|metodo|metodolog|model|modelo|techni|tecnic|system|sistema|control|performance|desempeno|evaluation|evaluacion|validation|validacion|analysis|analisis|framework|marco|objective|objetivo|problem|problema|variable|indicator|indicador/.test(
      text,
    );

  return centralSection && centralTopic;
}

function hasQuantitativeOrNormativeClaim(content: string | null | undefined) {
  const text = normalized(content);
  return (
    /\b\d+([.,]\d+)?\s*(%|por ciento|mm|cm|m|kn|mpa|hz|s|soles|usd|cad)\b/.test(text) ||
    /\b(reduce|aumenta|mejora|disminuye|incrementa|optimiza|garantiza|demuestra|cumple|norma|normativa|viable|rentable|costo|beneficio|eficiencia)\b/.test(
      text,
    )
  );
}

function hasOnlyContextSupport(summary: SectionEvidenceSupportSummary) {
  return (
    summary.direct_claim_support_count === 0 &&
    summary.cautious_support_count === 0 &&
    summary.context_only_count > 0
  );
}

function supportTier(summary: SectionEvidenceSupportSummary): SectionEvidenceBinding["support_tier"] {
  if (summary.direct_claim_support_count > 0 && summary.cautious_support_count === 0) {
    return "direct_source_backed";
  }

  if (summary.direct_claim_support_count > 0 || summary.cautious_support_count > 0) {
    return "mixed_cautious";
  }

  if (summary.context_only_count > 0 || summary.metadata_only_count > 0) {
    return "context_only";
  }

  return "weak_or_unbound";
}

function bindingScore(summary: SectionEvidenceSupportSummary) {
  const raw =
    summary.direct_claim_support_count * 2 +
    summary.cautious_support_count -
    summary.context_only_count * 0.25 -
    summary.metadata_only_count * 0.5 -
    summary.adjacent_source_count * 0.5;

  return Number(Math.max(0, Math.min(1, raw / 6)).toFixed(3));
}

export function evaluateSectionEvidenceBinding(
  input: SectionEvidenceBindingInput,
): SectionEvidenceBinding {
  const sourceHealthLookup = buildSourceHealthLookup(input.source_health);
  const evidenceById = new Map(
    (input.evidence_units ?? []).map((unit) => [unit.evidence_id, unit]),
  );
  const usedEvidenceIds = unique(input.used_evidence_ids ?? []);
  const usedOriginalExcerptIds = unique(input.used_original_excerpt_ids ?? []);
  const usedAssetKeys = unique(input.used_asset_keys ?? []);
  const boundUnits = usedEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((unit): unit is ConsolidatedEvidenceUnit => Boolean(unit));
  const usedSourceIds = unique([
    ...(input.used_source_ids ?? []),
    ...boundUnits.map((unit) => unit.source_id),
  ]);
  const sourceClassifications = usedSourceIds.map(
    (sourceId) => sourceHealthLookup.get(sourceId) ?? fallbackClassification(sourceId),
  );
  const sourceClassificationById = new Map(
    sourceClassifications.map((classification) => [
      classification.source_id,
      classification,
    ]),
  );
  const unitBuckets = boundUnits.map((unit) =>
    unitBucket(
      unit,
      sourceClassificationById.get(unit.source_id) ?? fallbackClassification(unit.source_id),
    ),
  );
  const directClaimSupportCount = unitBuckets.filter((bucket) => bucket === "direct").length;
  const cautiousSupportCount = unitBuckets.filter((bucket) => bucket === "cautious").length;
  const contextOnlyCount =
    unitBuckets.filter((bucket) => bucket === "context" || bucket === "blocked").length +
    (boundUnits.length === 0 && usedSourceIds.length > 0
      ? sourceClassifications.filter(
          (classification) =>
            sourceBucket(classification) === "context" ||
            sourceBucket(classification) === "blocked",
        ).length
      : 0);
  const metadataOnlyCount = sourceClassifications.filter(
    (classification) => classification.source_health === "metadata_only",
  ).length;
  const adjacentSourceCount = sourceClassifications.filter(
    (classification) => classification.topic_fit === "adjacent",
  ).length;
  const summary: SectionEvidenceSupportSummary = {
    direct_claim_support_count: directClaimSupportCount,
    cautious_support_count: cautiousSupportCount,
    context_only_count: contextOnlyCount,
    metadata_only_count: metadataOnlyCount,
    adjacent_source_count: adjacentSourceCount,
  };
  const warnings: string[] = [];
  const guardFailures: string[] = [];
  const centralClaim = hasCentralTopicalClaim({
    sectionKey: input.section_key,
    title: input.title,
    content: input.content,
  });
  const quantitativeOrNormative = hasQuantitativeOrNormativeClaim(input.content);

  if (centralClaim && adjacentSourceCount > 0) {
    const message =
      "Adjacent/background source is present in a central topical or methodological section; keep it as cautious context, not direct claim support.";
    warnings.push(message);
    guardFailures.push(message);
  }

  if (metadataOnlyCount > 0 && quantitativeOrNormative) {
    const message =
      "Metadata-only/context-only source is present in a quantitative or normative claim section; it cannot support the claim directly.";
    warnings.push(message);
    guardFailures.push(message);
  }

  if (directClaimSupportCount === 0) {
    warnings.push(
      "Section has no direct source-backed evidence ids and must be treated as cautious or weak.",
    );
  }

  if (hasOnlyContextSupport(summary)) {
    warnings.push(
      "Section appears to rely only on context/intake/metadata evidence; claims should be labeled as assumptions or pending validation.",
    );
  }

  return {
    section_key: input.section_key,
    used_evidence_ids: usedEvidenceIds,
    used_source_ids: usedSourceIds,
    used_original_excerpt_ids: usedOriginalExcerptIds,
    used_asset_keys: usedAssetKeys,
    evidence_support_summary: summary,
    unsupported_or_cautious_claim_warnings: unique(warnings),
    guard_failures: unique(guardFailures),
    support_tier: supportTier(summary),
    section_evidence_binding_score: bindingScore(summary),
  };
}
