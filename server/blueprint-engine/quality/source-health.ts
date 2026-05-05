import type {
  EvidenceEngineHandoffV1,
  EvidenceUnitHandoffRecord,
  JsonValue,
} from "@/server/blueprint-engine/contracts";

export type SourceHealth =
  | "usable_full_text"
  | "partial_full_text"
  | "metadata_only"
  | "unresolved"
  | "unextractable_pdf"
  | "wrong_document_suspected"
  | "unknown";

export type SourceTopicFit = "direct" | "adjacent" | "background" | "weak" | "unknown";

export type SourceAllowedEvidenceUse =
  | "direct_claim_support"
  | "cautious_support"
  | "context_only"
  | "gap_only"
  | "do_not_use";

export type SourceHealthInput = {
  source_id: string;
  title?: string | null;
  source_health?: SourceHealth | null;
  topic_fit?: SourceTopicFit | null;
  allowed_evidence_use?: SourceAllowedEvidenceUse | null;
  access_status?: string | null;
  access_kind?: string | null;
  has_complete_public_content?: boolean | null;
  materialization_status?: string | null;
  stored_kind?: string | null;
  source_input_mode?: string | null;
  resolver_family?: string | null;
  expected_kind?: string | null;
  text_char_count?: number | null;
  chunk_count?: number | null;
  direct_evidence_unit_count?: number | null;
  asset_count?: number | null;
  topic_relevance?: string | null;
  proposal_usefulness?: string | null;
  source_priority_reason?: string | null;
  warnings?: string[];
  risk_flags?: string[];
  quality_flags?: string[];
};

export type SourceHealthClassification = {
  source_id: string;
  source_health: SourceHealth;
  topic_fit: SourceTopicFit;
  allowed_evidence_use: SourceAllowedEvidenceUse;
  reasons: string[];
  warnings: string[];
};

export type SourceHealthSummary = {
  source_count: number;
  usable_full_text_source_count: number;
  partial_full_text_source_count: number;
  metadata_only_source_count: number;
  unresolved_source_count: number;
  unextractable_pdf_source_count: number;
  wrong_document_suspected_source_count: number;
  adjacent_source_count: number;
  weak_or_background_source_count: number;
  metadata_only_source_used_as_direct_evidence: boolean;
  unresolved_source_used_as_production_evidence: boolean;
  adjacent_source_used_as_direct_evidence: boolean;
  source_health_warnings: string[];
  sources: SourceHealthClassification[];
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

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function parseReasonValue(reason: string | null | undefined, key: string) {
  const match = new RegExp(`${key}=([^;]+)`, "i").exec(reason ?? "");
  return match?.[1]?.trim() ?? null;
}

function normalizedInput(input: SourceHealthInput) {
  const reason = input.source_priority_reason ?? "";
  const text = normalize(
    [
      input.source_id,
      input.title,
      input.access_status,
      input.access_kind,
      input.materialization_status,
      input.stored_kind,
      input.source_input_mode,
      input.resolver_family,
      input.expected_kind,
      input.topic_relevance,
      input.proposal_usefulness,
      reason,
      ...(input.warnings ?? []),
      ...(input.risk_flags ?? []),
      ...(input.quality_flags ?? []),
    ].join("\n"),
  );

  return {
    text,
    sourceInputMode: normalize(input.source_input_mode || parseReasonValue(reason, "input")),
    topicRelevance: normalize(input.topic_relevance || parseReasonValue(reason, "relevancia")),
    proposalUsefulness: normalize(input.proposal_usefulness || parseReasonValue(reason, "utilidad")),
    materializationStatus: normalize(input.materialization_status),
    storedKind: normalize(input.stored_kind),
    accessStatus: normalize(input.access_status),
    accessKind: normalize(input.access_kind),
    resolverFamily: normalize(input.resolver_family),
    textCharCount: input.text_char_count ?? 0,
    chunkCount: input.chunk_count ?? 0,
    directEvidenceUnitCount: input.direct_evidence_unit_count ?? 0,
  };
}

function inferHealth(input: SourceHealthInput): { health: SourceHealth; reasons: string[] } {
  if (input.source_health) {
    return { health: input.source_health, reasons: ["explicit_source_health"] };
  }

  const normalized = normalizedInput(input);
  const reasons: string[] = [];

  if (
    hasAny(normalized.text, [
      /wrong document/,
      /documento equivocado/,
      /wrong pdf/,
      /pdf equivocado/,
      /administrative pdf/,
      /pdf administrativo/,
    ])
  ) {
    reasons.push("wrong_document_marker");
    return { health: "wrong_document_suspected", reasons };
  }

  if (
    normalized.accessStatus === "unresolved" ||
    hasAny(normalized.text, [/unresolved/, /sin acceso util/, /acceso no resuelto/, /403/])
  ) {
    reasons.push("unresolved_access");
    return { health: "unresolved", reasons };
  }

  if (
    normalized.sourceInputMode === "abstract_metadata" ||
    normalized.sourceInputMode === "metadata" ||
    normalized.sourceInputMode === "abstract_only" ||
    normalized.accessStatus === "metadata_only" ||
    normalized.accessKind === "abstract_only" ||
    normalized.resolverFamily === "metadata_only"
  ) {
    reasons.push("metadata_or_abstract_only");
    return { health: "metadata_only", reasons };
  }

  if (
    (normalized.storedKind === "pdf" || normalized.accessKind === "pdf") &&
    normalized.materializationStatus !== "skipped" &&
    normalized.textCharCount === 0 &&
    normalized.chunkCount === 0
  ) {
    reasons.push("pdf_without_extractable_text_or_chunks");
    return { health: "unextractable_pdf", reasons };
  }

  if (normalized.chunkCount > 0 && normalized.textCharCount > 0) {
    reasons.push("chunk_backed_full_text");
    return { health: "usable_full_text", reasons };
  }

  if (
    normalized.directEvidenceUnitCount > 0 &&
    (normalized.sourceInputMode === "pdf" || normalized.storedKind === "pdf")
  ) {
    reasons.push("source_text_evidence_units_present");
    return { health: "usable_full_text", reasons };
  }

  if (
    normalized.textCharCount > 0 &&
    (normalized.materializationStatus === "downloaded" ||
      normalized.materializationStatus === "captured" ||
      normalized.sourceInputMode === "pdf" ||
      normalized.sourceInputMode === "web_text")
  ) {
    reasons.push("materialized_text_without_confirmed_chunks");
    return { health: "partial_full_text", reasons };
  }

  if (input.has_complete_public_content === true) {
    reasons.push("complete_public_content_without_materialization_detail");
    return { health: "partial_full_text", reasons };
  }

  return { health: "unknown", reasons: ["insufficient_source_health_signals"] };
}

function inferTopicFit(input: SourceHealthInput): { topicFit: SourceTopicFit; reasons: string[] } {
  if (input.topic_fit) {
    return { topicFit: input.topic_fit, reasons: ["explicit_topic_fit"] };
  }

  const normalized = normalizedInput(input);
  const reasons: string[] = [];

  if (
    hasAny(normalized.text, [
      /energy dissipator/,
      /dissipator/,
      /disipador/,
      /no trata directamente/,
      /desvio tematico/,
      /transferibilidad.*parcial/,
      /analogia regional/,
      /solo para exclusiones/,
    ])
  ) {
    reasons.push("adjacent_topic_warning");
    return { topicFit: "adjacent", reasons };
  }

  if (normalized.topicRelevance === "directa" || normalized.topicRelevance === "direct") {
    reasons.push("topic_relevance_direct");
    return { topicFit: "direct", reasons };
  }

  if (
    normalized.topicRelevance === "parcial" ||
    normalized.topicRelevance === "partial" ||
    normalized.proposalUsefulness === "media"
  ) {
    reasons.push("topic_relevance_partial");
    return { topicFit: "adjacent", reasons };
  }

  if (
    normalized.topicRelevance === "debil" ||
    normalized.topicRelevance === "weak" ||
    normalized.proposalUsefulness === "baja"
  ) {
    reasons.push("topic_relevance_weak");
    return { topicFit: "weak", reasons };
  }

  if (hasAny(normalized.text, [/background/, /antecedente/, /contextual/])) {
    reasons.push("background_marker");
    return { topicFit: "background", reasons };
  }

  return { topicFit: "unknown", reasons: ["insufficient_topic_fit_signals"] };
}

function inferAllowedUse(health: SourceHealth, topicFit: SourceTopicFit): SourceAllowedEvidenceUse {
  if (health === "wrong_document_suspected") return "do_not_use";
  if (health === "unresolved") return "gap_only";
  if (health === "unextractable_pdf") return "gap_only";
  if (health === "metadata_only") return "context_only";
  if (topicFit === "weak") return "context_only";
  if (topicFit === "background") return "context_only";
  if (topicFit === "adjacent") return "cautious_support";
  if (health === "usable_full_text" && topicFit === "direct") return "direct_claim_support";
  if (health === "partial_full_text") return "cautious_support";
  return "context_only";
}

export function classifySourceHealth(input: SourceHealthInput): SourceHealthClassification {
  const health = inferHealth(input);
  const topic = inferTopicFit(input);
  const allowedUse = input.allowed_evidence_use ?? inferAllowedUse(health.health, topic.topicFit);
  const warnings = [
    health.health === "metadata_only"
      ? `Source ${input.source_id} is metadata/abstract-only and must be context-only.`
      : null,
    health.health === "unresolved"
      ? `Source ${input.source_id} is unresolved and must not support production claims.`
      : null,
    health.health === "unextractable_pdf"
      ? `Source ${input.source_id} has a PDF but no extractable source text/chunks.`
      : null,
    health.health === "wrong_document_suspected"
      ? `Source ${input.source_id} may point to the wrong document.`
      : null,
    topic.topicFit === "adjacent"
      ? `Source ${input.source_id} is adjacent/background for the central topic and requires cautious use.`
      : null,
  ];

  return {
    source_id: input.source_id,
    source_health: health.health,
    topic_fit: topic.topicFit,
    allowed_evidence_use: allowedUse,
    reasons: unique([...health.reasons, ...topic.reasons]),
    warnings: unique(warnings),
  };
}

function isDirectEvidence(unit: EvidenceUnitHandoffRecord) {
  return unit.citation_eligibility === "direct_quote" || unit.claim_scope === "source_fact";
}

export function summarizeSourceHealth(
  classifications: SourceHealthClassification[],
  evidenceUnits: Array<{ source_id: string; citation_eligibility?: string; claim_scope?: string }> = [],
): SourceHealthSummary {
  const bySource = new Map(classifications.map((source) => [source.source_id, source]));
  const directEvidenceSources = new Set(
    evidenceUnits
      .filter(
        (unit) =>
          unit.citation_eligibility === "direct_quote" || unit.claim_scope === "source_fact",
      )
      .map((unit) => unit.source_id),
  );
  const metadataOnlyDirect = classifications.some(
    (source) =>
      source.source_health === "metadata_only" && directEvidenceSources.has(source.source_id),
  );
  const unresolvedDirect = classifications.some(
    (source) =>
      source.source_health === "unresolved" && directEvidenceSources.has(source.source_id),
  );
  const adjacentDirect = classifications.some(
    (source) =>
      source.topic_fit === "adjacent" &&
      source.allowed_evidence_use !== "direct_claim_support" &&
      directEvidenceSources.has(source.source_id),
  );

  return {
    source_count: classifications.length,
    usable_full_text_source_count: classifications.filter(
      (source) => source.source_health === "usable_full_text",
    ).length,
    partial_full_text_source_count: classifications.filter(
      (source) => source.source_health === "partial_full_text",
    ).length,
    metadata_only_source_count: classifications.filter(
      (source) => source.source_health === "metadata_only",
    ).length,
    unresolved_source_count: classifications.filter(
      (source) => source.source_health === "unresolved",
    ).length,
    unextractable_pdf_source_count: classifications.filter(
      (source) => source.source_health === "unextractable_pdf",
    ).length,
    wrong_document_suspected_source_count: classifications.filter(
      (source) => source.source_health === "wrong_document_suspected",
    ).length,
    adjacent_source_count: classifications.filter((source) => source.topic_fit === "adjacent")
      .length,
    weak_or_background_source_count: classifications.filter(
      (source) => source.topic_fit === "weak" || source.topic_fit === "background",
    ).length,
    metadata_only_source_used_as_direct_evidence: metadataOnlyDirect,
    unresolved_source_used_as_production_evidence: unresolvedDirect,
    adjacent_source_used_as_direct_evidence: adjacentDirect,
    source_health_warnings: unique(classifications.flatMap((source) => source.warnings)),
    sources: classifications,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourcePriorityRecordById(handoff: EvidenceEngineHandoffV1) {
  const records = new Map<string, Record<string, unknown>>();

  for (const entry of handoff.source_priorities) {
    const record = asRecord(entry);
    const sourceId = asString(record.source_id);
    if (sourceId) records.set(sourceId, record);
  }

  return records;
}

function rawSourceHealth(raw: JsonValue | undefined) {
  const record = asRecord(raw);
  return asRecord(record.source_health_classification ?? record.source_health);
}

export function summarizeSourceHealthFromHandoff(handoff: EvidenceEngineHandoffV1) {
  const priorities = sourcePriorityRecordById(handoff);
  const evidenceUnits = handoff.evidence_units;
  const classifications = handoff.source_registry.map((source) => {
    const priority = priorities.get(source.source_id) ?? {};
    const rawHealth = rawSourceHealth(source.citation_metadata.raw);
    const unitCount = evidenceUnits.filter((unit) => unit.source_id === source.source_id).length;
    const directCount = evidenceUnits.filter(
      (unit) => unit.source_id === source.source_id && isDirectEvidence(unit),
    ).length;
    const chunkLikeCount = evidenceUnits.filter(
      (unit) =>
        unit.source_id === source.source_id &&
        (unit.evidence_id.includes("chunk") || unit.char_start !== null || unit.quote_hash),
    ).length;

    return classifySourceHealth({
      source_id: source.source_id,
      title: source.title,
      source_health: asString(rawHealth.source_health) as SourceHealth,
      topic_fit: asString(rawHealth.topic_fit) as SourceTopicFit,
      allowed_evidence_use: asString(rawHealth.allowed_evidence_use) as SourceAllowedEvidenceUse,
      source_priority_reason: asString(priority.reason),
      source_input_mode: asString(priority.input_mode ?? priority.inputMode),
      topic_relevance: asString(priority.topic_relevance ?? priority.topicRelevance),
      proposal_usefulness: asString(priority.proposal_usefulness ?? priority.proposalUsefulness),
      text_char_count:
        asNumber(priority.text_char_count ?? priority.textCharCount) ??
        (chunkLikeCount > 0 ? 1 : null),
      chunk_count:
        asNumber(priority.chunk_count ?? priority.chunkCount) ??
        (chunkLikeCount > 0 ? chunkLikeCount : null),
      direct_evidence_unit_count: directCount,
      asset_count: handoff.asset_registry.filter((asset) => asset.source_id === source.source_id)
        .length,
      warnings: [
        ...handoff.warnings.filter((warning) => warning.includes(source.source_id)),
        ...asStringArray(priority.warnings),
      ],
      risk_flags: asStringArray(priority.risk_flags ?? priority.riskFlags),
      quality_flags: asStringArray(priority.quality_flags ?? priority.qualityFlags),
    });
  });

  return summarizeSourceHealth(classifications, handoff.evidence_units);
}
