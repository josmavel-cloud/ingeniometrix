import {
  blueprintEngineInputV1Schema,
  type ArtifactRef,
  type BlueprintEngineInputV1,
  type EvidenceEngineHandoffV1,
} from "@/server/blueprint-engine/contracts";
import { summarizeCitationSemantics } from "@/server/blueprint-engine/quality/citation-semantics";
import { summarizeSourceHealthFromHandoff } from "@/server/blueprint-engine/quality/source-health";

export type CompatibilityModeReport = {
  schema_compatible: boolean;
  diagnostic_compatible: boolean;
  production_eligible: boolean;
  production_ineligibility_reasons: string[];
  warnings: string[];
};

export type ProductionSafetySignals = {
  diagnostic_only?: boolean | null;
  production_valid?: boolean | null;
  degraded_handoff?: boolean | null;
  allow_blocked_upstream?: boolean | null;
  upstream_step_3_decision?: string | null;
  consistency_matrix_status?: string | null;
  materialized_source_count?: number | null;
  min_materialized_source_count?: number | null;
  metadata_or_abstract_only_source_count?: number | null;
  unresolved_source_count?: number | null;
  unresolved_or_metadata_only_used_as_production_evidence?: boolean | null;
  usable_full_text_source_count?: number | null;
  min_usable_full_text_source_count?: number | null;
  metadata_only_source_used_as_direct_evidence?: boolean | null;
  unresolved_source_used_as_production_evidence?: boolean | null;
  adjacent_source_count?: number | null;
  adjacent_source_used_as_direct_evidence?: boolean | null;
  true_source_backed_direct_quote_count?: number | null;
  min_true_source_backed_direct_quote_count?: number | null;
};

export type ProductionSafetyEvaluationOptions = {
  signals?: ProductionSafetySignals;
  structural_blockers?: string[];
  structural_warnings?: string[];
};

export type ProductionSafetyEvaluation = CompatibilityModeReport & {
  quality_gate_status: string | null;
  readiness: string | null;
  counts: {
    sources: number;
    evidence_units: number;
    section_packets: number;
    assets: number;
    materialized_sources_from_handoff_refs: number | null;
    materialized_sources_from_signals: number | null;
    metadata_or_abstract_only_sources: number | null;
    unresolved_sources: number | null;
    usable_full_text_sources: number | null;
    metadata_only_sources: number | null;
    adjacent_sources: number | null;
    unextractable_pdf_sources: number | null;
    wrong_document_suspected_sources: number | null;
    reported_direct_quote_count: number;
    true_source_backed_direct_quote_count: number;
    metadata_context_count: number;
    intake_context_count: number;
  };
  signals: Required<ProductionSafetySignals>;
};

export type FreshRunAssetRef = {
  asset_key: string;
  source_id?: string | null;
  uri?: string | null;
  source_run_id?: string | null;
  source_handoff_id?: string | null;
  deterministic?: boolean | null;
  template_asset?: boolean | null;
  text_marker?: string | null;
};

export type FreshRunIsolationInput = {
  handoff: EvidenceEngineHandoffV1;
  production_mode?: boolean;
  artifact_refs?: ArtifactRef[];
  asset_refs?: FreshRunAssetRef[];
  text_blobs?: Array<{
    label: string;
    text: string;
  }>;
  allowed_topic_markers?: string[];
  forbidden_topic_markers?: string[];
};

export type FreshRunIsolationReport = {
  passed: boolean;
  warnings: string[];
  blockers: string[];
  current_handoff_id: string;
  current_run_id: string;
  checked_artifact_ref_count: number;
  checked_asset_ref_count: number;
  mutable_latest_path_count: number;
  stale_marker_count: number;
  untraced_asset_ref_count: number;
};

export type PublicAppendixPolicyReport = {
  passed: boolean;
  violations: string[];
  warnings: string[];
};

const DEFAULT_MIN_MATERIALIZED_SOURCE_COUNT = 4;

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeStatus(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function warningsText(handoff: EvidenceEngineHandoffV1) {
  return unique([...handoff.warnings, ...handoff.quality_gate.warnings]).join("\n").toLowerCase();
}

function inferSignalsFromHandoff(handoff: EvidenceEngineHandoffV1): ProductionSafetySignals {
  const text = warningsText(handoff);

  return {
    diagnostic_only: /diagnostic[_ -]?only|diagnostico|solo diagnostico/.test(text) || null,
    production_valid:
      /production[_ -]?valid\s*[:=]\s*false|produccion[_ -]?valida\s*[:=]\s*false/.test(text)
        ? false
        : null,
    degraded_handoff: /degraded[_ -]?handoff|handoff degradado|degraded input/.test(text) || null,
    allow_blocked_upstream: /allow[_ -]?blocked|--allow-blocked|blocked upstream/.test(text) || null,
    upstream_step_3_decision: /step 3[^.\n]*block|paso 3[^.\n]*block/i.test(text) ? "BLOCK" : null,
    consistency_matrix_status: null,
    materialized_source_count: null,
    min_materialized_source_count: null,
    metadata_or_abstract_only_source_count: /metadata\/abstract-only|abstract-only|metadata-only/.test(text)
      ? 1
      : null,
    unresolved_source_count: /unresolved|no resuelt/.test(text) ? 1 : null,
    unresolved_or_metadata_only_used_as_production_evidence: null,
    usable_full_text_source_count: null,
    min_usable_full_text_source_count: null,
    metadata_only_source_used_as_direct_evidence: null,
    unresolved_source_used_as_production_evidence: null,
    adjacent_source_count: /adjacent|parcial|disipador|dissipator/.test(text) ? 1 : null,
    adjacent_source_used_as_direct_evidence: null,
    true_source_backed_direct_quote_count: null,
    min_true_source_backed_direct_quote_count: null,
  };
}

function mergeSignals(
  inferred: ProductionSafetySignals,
  explicit: ProductionSafetySignals | undefined,
): Required<ProductionSafetySignals> {
  return {
    diagnostic_only: explicit?.diagnostic_only ?? inferred.diagnostic_only ?? false,
    production_valid: explicit?.production_valid ?? inferred.production_valid ?? true,
    degraded_handoff: explicit?.degraded_handoff ?? inferred.degraded_handoff ?? false,
    allow_blocked_upstream:
      explicit?.allow_blocked_upstream ?? inferred.allow_blocked_upstream ?? false,
    upstream_step_3_decision:
      explicit?.upstream_step_3_decision ?? inferred.upstream_step_3_decision ?? null,
    consistency_matrix_status:
      explicit?.consistency_matrix_status ?? inferred.consistency_matrix_status ?? null,
    materialized_source_count:
      explicit?.materialized_source_count ?? inferred.materialized_source_count ?? null,
    min_materialized_source_count:
      explicit?.min_materialized_source_count ??
      inferred.min_materialized_source_count ??
      DEFAULT_MIN_MATERIALIZED_SOURCE_COUNT,
    metadata_or_abstract_only_source_count:
      explicit?.metadata_or_abstract_only_source_count ??
      inferred.metadata_or_abstract_only_source_count ??
      null,
    unresolved_source_count:
      explicit?.unresolved_source_count ?? inferred.unresolved_source_count ?? null,
    unresolved_or_metadata_only_used_as_production_evidence:
      explicit?.unresolved_or_metadata_only_used_as_production_evidence ??
      inferred.unresolved_or_metadata_only_used_as_production_evidence ??
      null,
    usable_full_text_source_count:
      explicit?.usable_full_text_source_count ??
      inferred.usable_full_text_source_count ??
      null,
    min_usable_full_text_source_count:
      explicit?.min_usable_full_text_source_count ??
      inferred.min_usable_full_text_source_count ??
      DEFAULT_MIN_MATERIALIZED_SOURCE_COUNT,
    metadata_only_source_used_as_direct_evidence:
      explicit?.metadata_only_source_used_as_direct_evidence ??
      inferred.metadata_only_source_used_as_direct_evidence ??
      null,
    unresolved_source_used_as_production_evidence:
      explicit?.unresolved_source_used_as_production_evidence ??
      inferred.unresolved_source_used_as_production_evidence ??
      null,
    adjacent_source_count:
      explicit?.adjacent_source_count ?? inferred.adjacent_source_count ?? null,
    adjacent_source_used_as_direct_evidence:
      explicit?.adjacent_source_used_as_direct_evidence ??
      inferred.adjacent_source_used_as_direct_evidence ??
      null,
    true_source_backed_direct_quote_count:
      explicit?.true_source_backed_direct_quote_count ??
      inferred.true_source_backed_direct_quote_count ??
      null,
    min_true_source_backed_direct_quote_count:
      explicit?.min_true_source_backed_direct_quote_count ??
      inferred.min_true_source_backed_direct_quote_count ??
      null,
  };
}

function countMaterializedSourcesFromHandoff(handoff: EvidenceEngineHandoffV1) {
  const count = handoff.source_registry.filter((source) => {
    const refs = source.materialization_refs;
    return refs.pdf_refs.length > 0 || refs.chunk_refs.length > 0 || refs.extracted_text_refs.length > 0;
  }).length;

  return count > 0 ? count : null;
}

function hasBlockedStatus(value: string | null | undefined) {
  const status = normalizeStatus(value);
  return status === "block" || status === "blocked";
}

export function evaluateBlueprintProductionSafety(
  input: BlueprintEngineInputV1,
  options: ProductionSafetyEvaluationOptions = {},
): ProductionSafetyEvaluation {
  const schemaResult = blueprintEngineInputV1Schema.safeParse(input);
  const structuralBlockers = options.structural_blockers ?? [];
  const structuralWarnings = options.structural_warnings ?? [];

  if (!schemaResult.success) {
    return {
      schema_compatible: false,
      diagnostic_compatible: false,
      production_eligible: false,
      production_ineligibility_reasons: [
        "BlueprintEngineInputV1 schema validation failed.",
        ...schemaResult.error.issues.slice(0, 10).map((issue) => issue.message),
      ],
      warnings: structuralWarnings,
      quality_gate_status: null,
      readiness: null,
      counts: {
        sources: 0,
        evidence_units: 0,
        section_packets: 0,
        assets: 0,
        materialized_sources_from_handoff_refs: null,
        materialized_sources_from_signals: null,
        metadata_or_abstract_only_sources: null,
        unresolved_sources: null,
        usable_full_text_sources: null,
        metadata_only_sources: null,
        adjacent_sources: null,
        unextractable_pdf_sources: null,
        wrong_document_suspected_sources: null,
        reported_direct_quote_count: 0,
        true_source_backed_direct_quote_count: 0,
        metadata_context_count: 0,
        intake_context_count: 0,
      },
      signals: mergeSignals({}, options.signals),
    };
  }

  const handoff = schemaResult.data.evidence_handoff as EvidenceEngineHandoffV1;
  const citationSummary = summarizeCitationSemantics(handoff.evidence_units);
  const sourceHealthSummary = summarizeSourceHealthFromHandoff(handoff);
  const signals = mergeSignals(inferSignalsFromHandoff(handoff), options.signals);
  const materializedFromRefs = countMaterializedSourcesFromHandoff(handoff);
  const materializedForEligibility = signals.materialized_source_count ?? materializedFromRefs;
  const minMaterialized =
    signals.min_materialized_source_count ?? DEFAULT_MIN_MATERIALIZED_SOURCE_COUNT;
  const usableFullTextForEligibility =
    signals.usable_full_text_source_count ??
    sourceHealthSummary.usable_full_text_source_count;
  const minUsableFullText =
    signals.min_usable_full_text_source_count ?? DEFAULT_MIN_MATERIALIZED_SOURCE_COUNT;
  const trueSourceBackedDirectQuoteCount =
    signals.true_source_backed_direct_quote_count ??
    citationSummary.true_source_backed_direct_quote_count;
  const reasons: string[] = [];
  const warnings: string[] = [
    ...structuralWarnings,
    ...citationSummary.citation_semantics_warnings,
    ...sourceHealthSummary.source_health_warnings,
  ];

  if (structuralBlockers.length > 0) {
    reasons.push(...structuralBlockers);
  }

  if (signals.diagnostic_only) {
    reasons.push("Input is marked diagnostic_only=true.");
  }

  if (signals.production_valid === false) {
    reasons.push("Input is marked production_valid=false.");
  }

  if (signals.degraded_handoff) {
    reasons.push("Input is marked degraded_handoff=true.");
  }

  if (signals.allow_blocked_upstream) {
    reasons.push("Input used or allows blocked upstream continuation.");
  }

  if (hasBlockedStatus(signals.upstream_step_3_decision)) {
    reasons.push("Upstream Step 3 evidence planning decision is BLOCK.");
  }

  if (hasBlockedStatus(handoff.quality_gate.status)) {
    reasons.push("Evidence handoff quality_gate.status is blocked.");
  }

  if (hasBlockedStatus(signals.consistency_matrix_status)) {
    reasons.push("Consistency matrix status is blocked.");
  }

  if (materializedForEligibility !== null && materializedForEligibility < minMaterialized) {
    reasons.push(
      `Materialized source count ${materializedForEligibility} is below production minimum ${minMaterialized}.`,
    );
  }

  if (usableFullTextForEligibility < minUsableFullText) {
    reasons.push(
      `Usable full-text source count ${usableFullTextForEligibility} is below production minimum ${minUsableFullText}.`,
    );
  }

  if (
    signals.metadata_or_abstract_only_source_count !== null &&
    signals.metadata_or_abstract_only_source_count > 0
  ) {
    reasons.push(
      `${signals.metadata_or_abstract_only_source_count} metadata/abstract-only source(s) require background-only handling before production.`,
    );
  }

  if (signals.unresolved_source_count !== null && signals.unresolved_source_count > 0) {
    reasons.push(`${signals.unresolved_source_count} unresolved source(s) are present.`);
  }

  if (signals.unresolved_or_metadata_only_used_as_production_evidence === true) {
    reasons.push("Unresolved or metadata-only sources are marked as production evidence.");
  }

  if (
    signals.metadata_only_source_used_as_direct_evidence === true ||
    sourceHealthSummary.metadata_only_source_used_as_direct_evidence
  ) {
    reasons.push("Metadata-only sources are used as direct evidence.");
  }

  if (
    signals.unresolved_source_used_as_production_evidence === true ||
    sourceHealthSummary.unresolved_source_used_as_production_evidence
  ) {
    reasons.push("Unresolved sources are used as production evidence.");
  }

  if (
    signals.adjacent_source_used_as_direct_evidence === true ||
    sourceHealthSummary.adjacent_source_used_as_direct_evidence
  ) {
    reasons.push("Adjacent/background sources are used as direct support for central claims.");
  }

  if (
    signals.min_true_source_backed_direct_quote_count !== null &&
    trueSourceBackedDirectQuoteCount < signals.min_true_source_backed_direct_quote_count
  ) {
    reasons.push(
      `True source-backed direct quote count ${trueSourceBackedDirectQuoteCount} is below production minimum ${signals.min_true_source_backed_direct_quote_count}.`,
    );
  }

  if (
    citationSummary.reported_direct_quote_count >
    citationSummary.true_source_backed_direct_quote_count
  ) {
    warnings.push(
      `Reported direct_quote count (${citationSummary.reported_direct_quote_count}) exceeds true source-backed direct quote count (${citationSummary.true_source_backed_direct_quote_count}); production gates use the true count.`,
    );
  }

  if (handoff.quality_gate.status === "warn") {
    warnings.push("Evidence handoff quality_gate.status is warn; production may continue only if all other gates pass.");
  }

  if (materializedForEligibility === null) {
    warnings.push("Materialized source count is unavailable; production gate could not evaluate source materialization floor.");
  }

  const diagnosticCompatible = schemaResult.success && structuralBlockers.length === 0;

  return {
    schema_compatible: true,
    diagnostic_compatible: diagnosticCompatible,
    production_eligible: diagnosticCompatible && reasons.length === 0,
    production_ineligibility_reasons: unique(reasons),
    warnings: unique(warnings),
    quality_gate_status: handoff.quality_gate.status,
    readiness: handoff.readiness,
    counts: {
      sources: handoff.source_registry.length,
      evidence_units: handoff.evidence_units.length,
      section_packets: handoff.section_packets.length,
      assets: handoff.asset_registry.length,
      materialized_sources_from_handoff_refs: materializedFromRefs,
      materialized_sources_from_signals: signals.materialized_source_count,
      metadata_or_abstract_only_sources: signals.metadata_or_abstract_only_source_count,
      unresolved_sources: signals.unresolved_source_count,
      usable_full_text_sources: usableFullTextForEligibility,
      metadata_only_sources: sourceHealthSummary.metadata_only_source_count,
      adjacent_sources: signals.adjacent_source_count ?? sourceHealthSummary.adjacent_source_count,
      unextractable_pdf_sources: sourceHealthSummary.unextractable_pdf_source_count,
      wrong_document_suspected_sources: sourceHealthSummary.wrong_document_suspected_source_count,
      reported_direct_quote_count: citationSummary.reported_direct_quote_count,
      true_source_backed_direct_quote_count: trueSourceBackedDirectQuoteCount,
      metadata_context_count: citationSummary.metadata_context_count,
      intake_context_count: citationSummary.intake_context_count,
    },
    signals,
  };
}

function refUri(ref: ArtifactRef | FreshRunAssetRef) {
  return "uri" in ref && typeof ref.uri === "string" ? ref.uri : "";
}

function isMutableLatestPath(uri: string) {
  return /(^|[\\/])latest([-.]|[\\/])|latest-[^\\/]+\.json$/i.test(uri);
}

function includesCurrentMarker(value: string, markers: string[]) {
  const normalized = value.toLowerCase();
  return markers.some((marker) => marker.length > 0 && normalized.includes(marker.toLowerCase()));
}

function collectForeignHandoffIds(text: string, currentHandoffId: string) {
  const matches = text.match(/evidence-handoff-[a-z0-9-]+/gi) ?? [];
  return matches.filter((match) => match !== currentHandoffId);
}

function collectForeignRunIds(text: string, currentRunId: string) {
  const matches = text.match(/(?:evidence-run|run)-[a-z0-9-:TZ.]+/gi) ?? [];
  return matches.filter((match) => match !== currentRunId);
}

export function validateFreshRunIsolation(input: FreshRunIsolationInput): FreshRunIsolationReport {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const handoff = input.handoff;
  const productionMode = input.production_mode === true;
  const currentMarkers = unique([
    handoff.handoff_id,
    handoff.evidence_run_id,
    handoff.traceability.immutable_snapshot_hash,
    handoff.artifact_hash,
    ...handoff.source_registry.map((source) => source.source_id),
  ]);
  const refs = input.artifact_refs ?? handoff.traceability.source_artifacts;
  const assetRefs: FreshRunAssetRef[] =
    input.asset_refs ??
    handoff.asset_registry.map((asset) => ({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      uri: asset.file_ref?.uri ?? null,
      deterministic: asset.extraction_origin === "provider_metadata",
    }));
  let mutableLatestPathCount = 0;
  let staleMarkerCount = 0;
  let untracedAssetRefCount = 0;

  for (const ref of refs) {
    const uri = refUri(ref);
    if (uri && isMutableLatestPath(uri)) {
      mutableLatestPathCount += 1;
      const message = `Mutable latest artifact path is not allowed for production execution: ${uri}`;
      if (productionMode) blockers.push(message);
      else warnings.push(message);
    }
  }

  for (const asset of assetRefs) {
    const uri = asset.uri ?? "";
    const deterministic = asset.deterministic === true || asset.template_asset === true;
    const declaredForeignRun = asset.source_run_id && asset.source_run_id !== handoff.evidence_run_id;
    const declaredForeignHandoff = asset.source_handoff_id && asset.source_handoff_id !== handoff.handoff_id;

    if (declaredForeignRun || declaredForeignHandoff) {
      staleMarkerCount += 1;
      const message = `Asset ${asset.asset_key} declares a stale run or handoff id.`;
      if (productionMode) blockers.push(message);
      else warnings.push(message);
      continue;
    }

    if (uri && isMutableLatestPath(uri)) {
      mutableLatestPathCount += 1;
      const message = `Asset ${asset.asset_key} uses mutable latest path: ${uri}`;
      if (productionMode) blockers.push(message);
      else warnings.push(message);
    }

    if (uri && !deterministic && !includesCurrentMarker(uri, currentMarkers)) {
      untracedAssetRefCount += 1;
      warnings.push(
        `Asset ${asset.asset_key} URI is not traceable to the current handoff/run markers; omit from production DOCX unless verified.`,
      );
    }

    const markerText = `${uri}\n${asset.text_marker ?? ""}`;
    const foreignHandoffs = collectForeignHandoffIds(markerText, handoff.handoff_id);
    const foreignRuns = collectForeignRunIds(markerText, handoff.evidence_run_id);
    if (foreignHandoffs.length > 0 || foreignRuns.length > 0) {
      staleMarkerCount += foreignHandoffs.length + foreignRuns.length;
      const message = `Asset ${asset.asset_key} contains stale run/handoff markers.`;
      if (productionMode) blockers.push(message);
      else warnings.push(message);
    }
  }

  for (const blob of input.text_blobs ?? []) {
    const foreignHandoffs = collectForeignHandoffIds(blob.text, handoff.handoff_id);
    const foreignRuns = collectForeignRunIds(blob.text, handoff.evidence_run_id);
    if (foreignHandoffs.length > 0 || foreignRuns.length > 0) {
      staleMarkerCount += foreignHandoffs.length + foreignRuns.length;
      const message = `Text blob ${blob.label} contains stale run/handoff markers.`;
      if (productionMode) blockers.push(message);
      else warnings.push(message);
    }

    for (const marker of input.forbidden_topic_markers ?? []) {
      if (marker && blob.text.toLowerCase().includes(marker.toLowerCase())) {
        warnings.push(`Text blob ${blob.label} contains forbidden unrelated topic marker: ${marker}`);
      }
    }
  }

  return {
    passed: blockers.length === 0,
    warnings: unique(warnings),
    blockers: unique(blockers),
    current_handoff_id: handoff.handoff_id,
    current_run_id: handoff.evidence_run_id,
    checked_artifact_ref_count: refs.length,
    checked_asset_ref_count: assetRefs.length,
    mutable_latest_path_count: mutableLatestPathCount,
    stale_marker_count: staleMarkerCount,
    untraced_asset_ref_count: untracedAssetRefCount,
  };
}

const PUBLIC_APPENDIX_FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "backend artifact path", pattern: /(?:[A-Za-z]:\\|\/)?(?:projects[\\/][^ \n]+[\\/])?artifacts-local[\\/]/i },
  { label: "server or script path", pattern: /(?:^|\s)(?:server|scripts)[\\/][^\s]+/i },
  { label: "run or handoff id", pattern: /\b(?:evidence-handoff|blueprint-run|lab-b-full-diagnostic|run)-[a-z0-9-]{8,}\b/i },
  { label: "hash/debug identifier", pattern: /\b(?:sha256|immutable_snapshot_hash|artifact_hash|prompt_hash)\b/i },
  { label: "provider debug log", pattern: /\b(?:raw_openalex_json|raw_crossref_json|provider debug|debug log|llm usage)\b/i },
  { label: "raw prompt trace", pattern: /\b(?:system prompt|developer prompt|raw prompt|prompt trace|debug prompt)\b/i },
  { label: "backend traceability dump", pattern: /\b(?:artifact_type|backend artifact|runtime backend|source_id|asset_key|file_path)\b/i },
  { label: "internal academic traceability annex", pattern: /\b(?:trazabilidad academica|control de trazabilidad)\b/i },
];

export function validatePublicAppendixPolicyText(text: string): PublicAppendixPolicyReport {
  const violations = PUBLIC_APPENDIX_FORBIDDEN_PATTERNS
    .filter((entry) => entry.pattern.test(text))
    .map((entry) => `Public appendix contains ${entry.label}.`);

  return {
    passed: violations.length === 0,
    violations: unique(violations),
    warnings: [],
  };
}

export function sanitizePublicAppendixText(text: string) {
  const report = validatePublicAppendixPolicyText(text);
  if (report.passed) {
    return text;
  }

  return "Detalle tecnico omitido del DOCX publico; revisar los artefactos JSON internos del run.";
}
