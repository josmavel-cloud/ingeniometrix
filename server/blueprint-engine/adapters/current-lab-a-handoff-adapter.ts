import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  ArtifactRef,
  AssetHandoffKind,
  AssetHandoffRecord,
  BlueprintCitationStyle,
  BlueprintEngineGenerationOptionsV1,
  BlueprintEngineInputV1,
  BlueprintEngineStepNumber,
  BlueprintExecutionMode,
  BlueprintModelPolicy,
  EvidenceClaimScope,
  EvidenceEngineHandoffV1,
  EvidenceHandoffQualityStatus,
  EvidenceHandoffReadiness,
  EvidenceUnitHandoffRecord,
  EvidenceUnitType,
  JsonValue,
  SectionPacketHandoffRecord,
  SourceHandoffRecord,
} from "@/server/blueprint-engine/contracts";
import {
  citationCategoryToContractEligibility,
  classifyEvidenceCitation,
  summarizeCitationSemantics,
  type CitationSemanticsInput,
} from "@/server/blueprint-engine/quality/citation-semantics";
import {
  classifySourceHealth,
  summarizeSourceHealth,
  type SourceHealthClassification,
} from "@/server/blueprint-engine/quality/source-health";

const DEFAULT_LAB_A_ARTIFACT_PATH = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "consolidated_evidence",
  "latest-consolidated-evidence.json",
);

const DEFAULT_TARGET_STEPS: BlueprintEngineStepNumber[] = [7, 8, 9, 10, 11, 12, 13];

export type CurrentLabAConsolidatedEvidenceArtifact = Record<string, unknown>;

export type LoadedCurrentLabAEvidenceArtifact = {
  artifact: CurrentLabAConsolidatedEvidenceArtifact;
  artifact_path: string;
  raw_json: string;
  canonical_json: string;
  immutable_snapshot_hash: string;
};

export type LoadCurrentLabAEvidenceArtifactOptions = {
  artifactPath?: string;
};

export type CurrentLabAHandoffAdapterOptions = LoadCurrentLabAEvidenceArtifactOptions & {
  sourceArtifactPath?: string;
  rawJson?: string;
};

export type BuildBlueprintEngineInputOptions = CurrentLabAHandoffAdapterOptions & {
  blueprintRunId?: string;
  userId?: string;
  requestedAt?: string;
  targetSteps?: BlueprintEngineStepNumber[];
  executionMode?: BlueprintExecutionMode;
  masterTemplateVersionId?: string;
  institutionalTemplateKey?: string | null;
  institutionalTemplateVersionId?: string | null;
  citationStyle?: BlueprintCitationStyle | null;
  generationOptions?: BlueprintEngineGenerationOptionsV1;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function asNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toJsonValue(entry),
      ]),
    );
  }

  return null;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(stableStringify(value)).slice(0, 12)}`;
}

function localArtifactRef(input: {
  refId: string;
  uri: string;
  contentType?: string;
  raw?: string;
  canonicalJson?: string;
}): ArtifactRef {
  const hashInput = input.canonicalJson ?? input.raw;

  return {
    ref_id: input.refId,
    uri: input.uri,
    storage_kind: "local_file",
    content_type: input.contentType ?? "application/octet-stream",
    byte_size: input.raw ? Buffer.byteLength(input.raw, "utf8") : null,
    sha256: hashInput ? sha256(hashInput) : null,
  };
}

function normalizeReadiness(value: unknown): EvidenceHandoffReadiness | null {
  const candidate = asString(value).toLowerCase();
  if (candidate === "alta" || candidate === "high" || candidate === "ready") return "alta";
  if (candidate === "media" || candidate === "medium" || candidate === "partial") return "media";
  if (candidate === "baja" || candidate === "low") return "baja";
  if (candidate === "blocked" || candidate === "bloqueado") return "blocked";
  return null;
}

function normalizeQualityStatus(value: unknown): EvidenceHandoffQualityStatus {
  if (value === "pass" || value === "warn" || value === "blocked") return value;
  return "warn";
}

function normalizeUnitType(value: unknown): EvidenceUnitType {
  const candidate = asString(value, "context_only");
  if (
    candidate === "original_excerpt" ||
    candidate === "table" ||
    candidate === "image" ||
    candidate === "equation" ||
    candidate === "interpreted_signal" ||
    candidate === "context_only"
  ) {
    return candidate;
  }

  if (candidate === "asset_reference") return "image";
  if (candidate === "metadata_context" || candidate === "intake_context") return "context_only";
  return "context_only";
}

function normalizeCitationEligibility(value: unknown) {
  const candidate = asString(value, "not_citable");
  if (
    candidate === "direct_quote" ||
    candidate === "paraphrase_only" ||
    candidate === "asset_reference" ||
    candidate === "not_citable"
  ) {
    return candidate;
  }

  return "not_citable";
}

function normalizeAssetKind(value: unknown): AssetHandoffKind {
  const candidate = asString(value, "image");
  if (
    candidate === "figure" ||
    candidate === "image" ||
    candidate === "table" ||
    candidate === "equation"
  ) {
    return candidate;
  }

  return "image";
}

function claimScopeFor(unitType: EvidenceUnitType): EvidenceClaimScope {
  if (unitType === "original_excerpt") return "source_fact";
  if (unitType === "table" || unitType === "image" || unitType === "equation") {
    return "method_context";
  }
  if (unitType === "interpreted_signal") return "background_context";
  return "do_not_claim";
}

function resolveOverallReadiness(
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
): EvidenceHandoffReadiness {
  const coverage = asRecord(artifact.coverage_map);
  const coverageReadiness = normalizeReadiness(coverage.overall_readiness);
  if (coverageReadiness) return coverageReadiness;

  const qualityGate = asRecord(artifact.quality_gate);
  if (qualityGate.status === "blocked" || qualityGate.ready_for_steps_7_11 === false) {
    return "blocked";
  }

  const readinessValues = asArray(artifact.section_readiness_map)
    .map((entry) => normalizeReadiness(asRecord(entry).readiness))
    .filter((value): value is EvidenceHandoffReadiness => value !== null);

  if (readinessValues.includes("baja")) return "baja";
  if (readinessValues.includes("media")) return "media";
  return "alta";
}

function readinessForSection(
  sectionKey: string,
  packet: Record<string, unknown>,
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
): EvidenceHandoffReadiness {
  const packetReadiness = normalizeReadiness(packet.readiness);
  if (packetReadiness) return packetReadiness;

  const coverage = asRecord(artifact.coverage_map);
  if (asStringArray(coverage.section_keys_ready).includes(sectionKey)) return "alta";
  if (asStringArray(coverage.section_keys_partial).includes(sectionKey)) return "media";
  if (asStringArray(coverage.section_keys_low).includes(sectionKey)) return "baja";

  const readinessEntry = asArray(artifact.section_readiness_map)
    .map(asRecord)
    .find((entry) => entry.section_key === sectionKey);
  return normalizeReadiness(readinessEntry?.readiness) ?? resolveOverallReadiness(artifact);
}

function collectWarnings(artifact: CurrentLabAConsolidatedEvidenceArtifact): string[] {
  const qualityGate = asRecord(artifact.quality_gate);
  const checkWarnings = asArray(qualityGate.checks)
    .map(asRecord)
    .filter((check) => check.status === "warn")
    .map((check) => asString(check.message))
    .filter(Boolean);

  return [
    ...asStringArray(artifact.warnings),
    ...asStringArray(qualityGate.traceability_warnings),
    ...checkWarnings,
  ];
}

function collectBlockers(artifact: CurrentLabAConsolidatedEvidenceArtifact): string[] {
  const qualityGate = asRecord(artifact.quality_gate);
  if (qualityGate.status !== "blocked") return [];

  return [
    ...asStringArray(qualityGate.unsupported_claims),
    ...asArray(qualityGate.checks)
      .map(asRecord)
      .filter((check) => check.status === "blocked")
      .map((check) => asString(check.message))
      .filter(Boolean),
  ];
}

function sourceTitleById(artifact: CurrentLabAConsolidatedEvidenceArtifact): Map<string, string> {
  const titles = new Map<string, string>();

  for (const unit of asArray(artifact.evidence_units).map(asRecord)) {
    const sourceId = asString(unit.source_id);
    const title = asString(unit.source_title);
    if (sourceId && title && !titles.has(sourceId)) {
      titles.set(sourceId, title);
    }
  }

  return titles;
}

function sourceWarningsFor(
  sourceId: string,
  title: string,
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
) {
  const qualityGate = asRecord(artifact.quality_gate);
  const allWarnings = [
    ...asStringArray(artifact.warnings),
    ...asStringArray(qualityGate.traceability_warnings),
    ...asStringArray(qualityGate.unsupported_claims),
  ];
  const titleTokens = title
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 7)
    .slice(0, 6);

  return allWarnings.filter((warning) => {
    const lower = warning.toLowerCase();
    return lower.includes(sourceId.toLowerCase()) || titleTokens.some((token) => lower.includes(token));
  });
}

function parseSourcePriorityReason(reason: string, key: string) {
  const match = new RegExp(`${key}=([^;]+)`, "i").exec(reason);
  return match?.[1]?.trim() ?? null;
}

function sourceHealthClassificationsForArtifact(
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
) {
  const titleById = sourceTitleById(artifact);
  const classifications = new Map<string, SourceHealthClassification>();
  const units = asArray(artifact.evidence_units).map(asRecord);

  for (const entry of asArray(artifact.source_priorities).map(asRecord)) {
    const sourceId = asString(entry.source_id, stableId("source", entry));
    const title = asString(entry.title, titleById.get(sourceId) ?? sourceId);
    const reason = asString(entry.reason);
    const sourceUnits = units.filter((unit) => asString(unit.source_id) === sourceId);
    const chunkCount = sourceUnits.filter((unit) => {
      const evidenceId = asString(unit.evidence_id);
      return (
        evidenceId.includes("chunk") ||
        (unit.char_start !== null && unit.char_start !== undefined) ||
        (unit.quote_hash !== null && unit.quote_hash !== undefined)
      );
    }).length;
    const directEvidenceUnitCount = sourceUnits.filter(
      (unit) =>
        unit.citation_eligibility === "direct_quote" ||
        normalizeUnitType(unit.unit_type) === "original_excerpt",
    ).length;

    classifications.set(
      sourceId,
      classifySourceHealth({
        source_id: sourceId,
        title,
        source_priority_reason: reason,
        source_input_mode: asNullableString(entry.input_mode ?? entry.inputMode) ??
          parseSourcePriorityReason(reason, "input"),
        topic_relevance: asNullableString(entry.topic_relevance ?? entry.topicRelevance) ??
          parseSourcePriorityReason(reason, "relevancia"),
        proposal_usefulness:
          asNullableString(entry.proposal_usefulness ?? entry.proposalUsefulness) ??
          parseSourcePriorityReason(reason, "utilidad"),
        chunk_count: chunkCount,
        text_char_count: chunkCount > 0 ? 1 : null,
        direct_evidence_unit_count: directEvidenceUnitCount,
        asset_count: sourceUnits.filter((unit) => asString(unit.asset_key)).length,
        warnings: sourceWarningsFor(sourceId, title, artifact),
        risk_flags: asStringArray(entry.risk_flags ?? entry.riskFlags),
        quality_flags: asStringArray(entry.quality_flags ?? entry.qualityFlags),
      }),
    );
  }

  return classifications;
}

function sourceHealthSummaryForArtifact(artifact: CurrentLabAConsolidatedEvidenceArtifact) {
  const classifications = Array.from(sourceHealthClassificationsForArtifact(artifact).values());
  const evidenceUnits = asArray(artifact.evidence_units).map((entry) => {
    const unit = asRecord(entry);

    return {
      source_id: asString(unit.source_id),
      citation_eligibility: asString(unit.citation_eligibility),
      claim_scope:
        normalizeUnitType(unit.unit_type) === "original_excerpt" ? "source_fact" : "do_not_claim",
    };
  });

  return summarizeSourceHealth(classifications, evidenceUnits);
}

function citationSourceInputModeById(artifact: CurrentLabAConsolidatedEvidenceArtifact): Map<string, string> {
  const modes = new Map<string, string>();

  for (const entry of asArray(artifact.source_priorities).map(asRecord)) {
    const sourceId = asString(entry.source_id);
    const reason = asString(entry.reason).toLowerCase();
    const explicitMode = asString(entry.input_mode ?? entry.inputMode);
    const mode = explicitMode || /input=([a-z_]+)/.exec(reason)?.[1] || "";
    if (sourceId && mode) {
      modes.set(sourceId, mode);
    }
  }

  return modes;
}

function citationInputFromArtifactUnit(
  unit: Record<string, unknown>,
  sourceInputModes: Map<string, string>,
): CitationSemanticsInput {
  const sourceId = asString(unit.source_id, "unknown-source");

  return {
    evidence_id: asNullableString(unit.evidence_id),
    snippet_id: asNullableString(unit.snippet_id),
    source_id: sourceId,
    unit_type: asString(unit.unit_type ?? unit.type, "context_only"),
    extraction_kind: asNullableString(unit.extraction_kind),
    label: asNullableString(unit.label),
    original_text: asNullableString(unit.original_text ?? unit.text),
    source_chunk_id: asNullableString(unit.source_chunk_id),
    source_input_mode:
      sourceInputModes.get(sourceId) ??
      asNullableString(unit.source_input_mode ?? unit.input_mode ?? unit.inputMode),
    source_access_status: asNullableString(unit.source_access_status ?? unit.access_status),
    citation_eligibility: asNullableString(unit.citation_eligibility),
    page_start: asNullableInteger(unit.page_start ?? unit.page),
    char_start: asNullableInteger(unit.char_start),
    quote_hash: asNullableString(unit.quote_hash),
  };
}

function citationSemanticsSummaryForArtifact(artifact: CurrentLabAConsolidatedEvidenceArtifact) {
  const sourceInputModes = citationSourceInputModeById(artifact);
  const units = asArray(artifact.evidence_units).map((entry) =>
    citationInputFromArtifactUnit(asRecord(entry), sourceInputModes),
  );

  return summarizeCitationSemantics(units);
}

function adaptSources(artifact: CurrentLabAConsolidatedEvidenceArtifact): SourceHandoffRecord[] {
  const titleById = sourceTitleById(artifact);
  const sourceHealthById = sourceHealthClassificationsForArtifact(artifact);

  return asArray(artifact.source_priorities).map((entry, index) => {
    const source = asRecord(entry);
    const sourceId = asString(source.source_id, stableId("source", source));
    const title = asString(source.title, titleById.get(sourceId) ?? sourceId);
    const sourceHealth = sourceHealthById.get(sourceId);

    return {
      source_id: sourceId,
      reference_id: asNullableString(source.reference_id) ?? sourceId,
      title,
      authors: asStringArray(source.authors),
      year: asNullableInteger(source.year),
      venue: asNullableString(source.venue),
      doi: asNullableString(source.doi),
      landing_page_url: asNullableString(source.landing_page_url) ??
        (sourceId.startsWith("http") ? sourceId : null),
      pdf_url: asNullableString(source.pdf_url),
      openalex_id: asNullableString(source.openalex_id) ??
        (sourceId.includes("openalex.org") ? sourceId : null),
      crossref_id: asNullableString(source.crossref_id),
      is_open_access: Boolean(source.is_open_access),
      selected_order: asNullableInteger(source.selected_order) ?? index + 1,
      eligible_for_formal_reference: source.eligible_for_formal_reference !== false,
      citation_metadata: {
        citation_key: asNullableString(source.citation_key),
        apa7: asNullableString(source.apa7),
        bibtex: asNullableString(source.bibtex),
        ris: asNullableString(source.ris),
        raw: toJsonValue({
          ...source,
          source_health_classification: sourceHealth,
        }),
      },
      materialization_refs: {
        extracted_text_refs: [],
        chunk_refs: [],
        pdf_refs: [],
        derived_asset_refs: [],
      },
    };
  });
}

function adaptEvidenceUnits(
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
): EvidenceUnitHandoffRecord[] {
  const sourceInputModes = citationSourceInputModeById(artifact);

  return asArray(artifact.evidence_units).map((entry, index) => {
    const unit = asRecord(entry);
    const citationInput = citationInputFromArtifactUnit(unit, sourceInputModes);
    const citationCategory = classifyEvidenceCitation(citationInput);
    const unitType = normalizeUnitType(
      citationCategory === "metadata_context" || citationCategory === "intake_context"
        ? "context_only"
        : unit.unit_type ?? unit.type,
    );
    const assetPath = asNullableString(unit.asset_path);

    return {
      evidence_id: asString(unit.evidence_id, stableId("evidence", unit)),
      source_id: asString(unit.source_id, "unknown-source"),
      unit_type: unitType,
      section_keys: asStringArray(unit.section_keys),
      label: asString(unit.label, `evidence-${index + 1}`),
      original_text: asNullableString(unit.original_text ?? unit.text),
      summary_es: asNullableString(unit.summary_es),
      page_start: asNullableInteger(unit.page_start ?? unit.page),
      page_end: asNullableInteger(unit.page_end ?? unit.page),
      char_start: asNullableInteger(unit.char_start),
      char_end: asNullableInteger(unit.char_end),
      quote_hash: asNullableString(unit.quote_hash),
      asset_key: asNullableString(unit.asset_key),
      asset_ref: assetPath
        ? localArtifactRef({
            refId: asString(unit.asset_key, stableId("asset", assetPath)),
            uri: assetPath,
          })
        : null,
      caption: asNullableString(unit.caption),
      original_language: asNullableString(unit.original_language),
      citation_eligibility: normalizeCitationEligibility(
        citationCategoryToContractEligibility(citationCategory),
      ),
      confidence: asNumber(unit.confidence, 0),
      relevance_score: asNumber(unit.relevance_score, 0),
      claim_scope: claimScopeFor(unitType),
    };
  });
}

function adaptSectionPackets(
  packets: unknown[],
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
): SectionPacketHandoffRecord[] {
  return packets.map((entry, index) => {
    const packet = asRecord(entry);
    const sectionKey = asString(packet.section_key, stableId("section", packet));
    const snippetIds = asStringArray(packet.snippet_ids);
    const evidenceIds = asStringArray(packet.evidence_ids ?? packet.evidence_unit_ids);
    const requiredOriginalFragments = asStringArray(packet.required_original_fragments);

    return {
      section_key: sectionKey,
      readiness: readinessForSection(sectionKey, packet, artifact),
      summary: asNullableString(packet.summary ?? packet.drafting_strategy ?? packet.section_label_es),
      source_ids: asStringArray(packet.source_ids ?? packet.primary_source_ids),
      snippet_ids: snippetIds,
      evidence_ids: evidenceIds.length > 0 ? evidenceIds : snippetIds,
      asset_keys: asStringArray(packet.asset_keys),
      key_points: asStringArray(packet.key_points ?? packet.citation_plan),
      open_questions: asStringArray(packet.open_questions),
      missing_elements: asStringArray(packet.missing_elements ?? packet.missing_evidence),
      do_not_claim: asStringArray(packet.do_not_claim),
      assumptions_allowed: asStringArray(packet.assumptions_allowed),
      recommended_chunk_refs: asStringArray(packet.recommended_chunk_refs).map((uri, refIndex) =>
        localArtifactRef({
          refId: `${sectionKey}-chunk-${refIndex + 1}`,
          uri,
        }),
      ),
      required_original_fragments:
        requiredOriginalFragments.length > 0
          ? requiredOriginalFragments
          : evidenceIds.length > 0
            ? evidenceIds
            : snippetIds,
    };
  });
}

function adaptAssets(artifact: CurrentLabAConsolidatedEvidenceArtifact): AssetHandoffRecord[] {
  const assetsByKey = new Map<string, AssetHandoffRecord>();

  for (const [index, entry] of asArray(artifact.asset_usage_plan).entries()) {
    const asset = asRecord(entry);
    const assetKey = asString(asset.asset_key, stableId("asset", asset));
    const sectionKey = asString(asset.section_key);

    assetsByKey.set(assetKey, {
      asset_key: assetKey,
      source_id: asString(asset.source_id, "unknown-source"),
      asset_kind: normalizeAssetKind(asset.asset_kind),
      title: asNullableString(asset.title),
      caption: asNullableString(asset.caption),
      page_number: asNullableInteger(asset.page_number),
      text_content: asNullableString(asset.text_content),
      latex: asNullableString(asset.latex),
      file_ref: asNullableString(asset.asset_path ?? asset.file_path)
        ? localArtifactRef({
            refId: `${assetKey}-file`,
            uri: asString(asset.asset_path ?? asset.file_path),
          })
        : null,
      mime_type: asNullableString(asset.mime_type),
      width_px: asNullableInteger(asset.width_px),
      height_px: asNullableInteger(asset.height_px),
      content_hash: asNullableString(asset.content_hash),
      extraction_origin: "pdf_native",
      citation_eligibility: "asset_reference",
      recommended_section_keys: sectionKey ? [sectionKey] : [],
      usage_reason: asNullableString(asset.usage_reason),
      handling_notes: asStringArray(asset.handling_notes),
    });

    if (!assetKey) {
      assetsByKey.delete(`asset-${index + 1}`);
    }
  }

  return Array.from(assetsByKey.values());
}

function adaptProjectContext(artifact: CurrentLabAConsolidatedEvidenceArtifact) {
  const projectContext = asRecord(artifact.project_context);
  const topic = asString(
    projectContext.intake_topic ?? projectContext.topic ?? projectContext.project_title,
    "Proyecto sin topico declarado",
  );

  return {
    language: "es" as const,
    country_context: asString(projectContext.country_context, "PE"),
    degree_level: asString(projectContext.degree_level, "posgrado"),
    target_template_key: asNullableString(projectContext.target_template_key),
    master_template_key: "MASTER_TEMPLATE_LATAM" as const,
    topic,
    problem_context: asNullableString(projectContext.problem_context),
    research_line: asNullableString(projectContext.research_line),
    methodology_preference: asNullableString(
      projectContext.methodology_preference ?? projectContext.preferred_methodology,
    ),
    population_or_context: asNullableString(
      projectContext.population_or_context ?? projectContext.target_population,
    ),
    constraints: asNullableString(projectContext.constraints),
    academic_program: asNullableString(projectContext.academic_program ?? projectContext.program),
    university: asNullableString(projectContext.university),
    advisor_or_user_notes: asNullableString(projectContext.advisor_or_user_notes),
    normalized_problem_core: asNullableString(projectContext.project_title),
    retrieval_brief: asNullableString(artifact.summary),
  };
}

function sourceArtifactRefs(input: {
  artifactPath: string;
  rawJson?: string;
  canonicalJson: string;
  artifact: CurrentLabAConsolidatedEvidenceArtifact;
}): ArtifactRef[] {
  const manifest = asRecord(input.artifact.downstream_handoff_manifest);
  const refs = [
    localArtifactRef({
      refId: "current-lab-a-latest-consolidated-evidence",
      uri: input.artifactPath,
      contentType: "application/json",
      raw: input.rawJson,
      canonicalJson: input.canonicalJson,
    }),
  ];

  for (const [index, uri] of [
    input.artifact.artifact_path,
    input.artifact.latest_artifact_path,
    manifest.consolidated_evidence_artifact_path,
    manifest.latest_consolidated_evidence_artifact_path,
  ].entries()) {
    if (typeof uri === "string" && uri.length > 0) {
      refs.push(
        localArtifactRef({
          refId: `current-lab-a-source-artifact-${index + 1}`,
          uri,
          contentType: "application/json",
        }),
      );
    }
  }

  return refs;
}

export function loadCurrentLabAEvidenceArtifact(
  options: LoadCurrentLabAEvidenceArtifactOptions = {},
): LoadedCurrentLabAEvidenceArtifact {
  const artifactPath = options.artifactPath ?? DEFAULT_LAB_A_ARTIFACT_PATH;
  const rawJson = readFileSync(artifactPath, "utf8");
  const artifact = JSON.parse(rawJson) as CurrentLabAConsolidatedEvidenceArtifact;
  const canonicalJson = stableStringify(artifact);

  return {
    artifact,
    artifact_path: artifactPath,
    raw_json: rawJson,
    canonical_json: canonicalJson,
    immutable_snapshot_hash: sha256(canonicalJson),
  };
}

export function adaptCurrentLabAArtifactToEvidenceHandoffV1(
  artifact: CurrentLabAConsolidatedEvidenceArtifact,
  options: CurrentLabAHandoffAdapterOptions = {},
): EvidenceEngineHandoffV1 {
  const canonicalJson = stableStringify(artifact);
  const immutableSnapshotHash = sha256(canonicalJson);
  const artifactPath = options.sourceArtifactPath ?? options.artifactPath ?? DEFAULT_LAB_A_ARTIFACT_PATH;
  const projectContext = adaptProjectContext(artifact);
  const qualityGate = asRecord(artifact.quality_gate);
  const sourceHealthSummary = sourceHealthSummaryForArtifact(artifact);
  const citationSemanticsSummary = citationSemanticsSummaryForArtifact(artifact);
  const warnings = uniqueStrings([
    ...collectWarnings(artifact),
    ...citationSemanticsSummary.citation_semantics_warnings,
    ...sourceHealthSummary.source_health_warnings,
  ]);
  const sourceArtifacts = sourceArtifactRefs({
    artifactPath,
    rawJson: options.rawJson,
    canonicalJson,
    artifact,
  });
  const manifest = asRecord(artifact.downstream_handoff_manifest);
  const topic = projectContext.topic;

  return {
    handoff_id: asString(
      artifact.handoff_id,
      `evidence-handoff-${immutableSnapshotHash.slice(0, 12)}`,
    ),
    handoff_version: "evidence_engine_handoff.v1",
    project_id: asString(artifact.project_id, stableId("project", topic)),
    evidence_run_id: asString(
      artifact.evidence_run_id,
      asString(artifact.run_dir, stableId("evidence-run", immutableSnapshotHash)),
    ),
    created_at: asString(artifact.generated_at, new Date(0).toISOString()),
    source_engine: "EvidenceEngine",
    source_engine_version: asString(artifact.artifact_version, "current-lab-a"),
    artifact_hash: immutableSnapshotHash,
    readiness: resolveOverallReadiness(artifact),
    quality_gate: {
      status: normalizeQualityStatus(qualityGate.status),
      warnings,
      blockers: collectBlockers(artifact),
    },
    warnings,
    source_snapshot: sourceArtifacts,
    project_context: projectContext,
    source_registry: adaptSources(artifact),
    evidence_units: adaptEvidenceUnits(artifact),
    section_packets: adaptSectionPackets(asArray(artifact.section_input_packets), artifact),
    weak_section_packets: adaptSectionPackets(
      asArray(artifact.weak_section_completion_packets),
      artifact,
    ),
    source_priorities: asArray(artifact.source_priorities).map((entry) => {
      const record = asRecord(entry);
      const sourceId = asString(record.source_id, stableId("source", record));
      return toJsonValue({
        ...record,
        source_health_classification: sourceHealthSummary.sources.find(
          (source) => source.source_id === sourceId,
        ),
      });
    }),
    asset_registry: adaptAssets(artifact),
    asset_usage_plan: asArray(artifact.asset_usage_plan).map(toJsonValue),
    materialized_content_refs: asStringArray(manifest.read_only_input_paths).map((uri, index) =>
      localArtifactRef({
        refId: `current-lab-a-readonly-input-${index + 1}`,
        uri,
      }),
    ),
    chunk_index_refs: [],
    proposal_context: {
      method_candidate: toJsonValue(artifact.proposal_method_candidate),
      framework_candidate: toJsonValue(artifact.proposal_framework_candidate),
      dominant_methods: asArray(artifact.dominant_methods).map(toJsonValue),
      dominant_frameworks: asArray(artifact.dominant_frameworks).map(toJsonValue),
      key_findings: asArray(artifact.key_findings).map(toJsonValue),
      evidence_gaps: asStringArray(artifact.evidence_gaps),
      followup_requirements: toJsonValue(artifact.followup_requirements),
      gap_resolution_plan: toJsonValue(artifact.gap_resolution_plan),
      context_preservation_contract: toJsonValue({
        ...asRecord(artifact.context_preservation_contract),
        reported_direct_quote_count: citationSemanticsSummary.reported_direct_quote_count,
        true_source_backed_direct_quote_count:
          citationSemanticsSummary.true_source_backed_direct_quote_count,
        metadata_context_count: citationSemanticsSummary.metadata_context_count,
        intake_context_count: citationSemanticsSummary.intake_context_count,
        citation_semantics_warnings: citationSemanticsSummary.citation_semantics_warnings,
        source_health_summary: sourceHealthSummary,
        usable_full_text_source_count: sourceHealthSummary.usable_full_text_source_count,
        metadata_only_source_count: sourceHealthSummary.metadata_only_source_count,
        unresolved_source_count: sourceHealthSummary.unresolved_source_count,
        adjacent_source_count: sourceHealthSummary.adjacent_source_count,
        source_health_warnings: sourceHealthSummary.source_health_warnings,
      }),
    },
    assumptions: asStringArray(qualityGate.handoff_notes).map((statement, index) => ({
      assumption_id: `current-lab-a-handoff-note-${index + 1}`,
      statement,
      reason: "Imported from current Lab A quality gate handoff notes.",
      section_keys: [],
    })),
    traceability: {
      source_artifacts: sourceArtifacts,
      immutable_snapshot_hash: immutableSnapshotHash,
    },
  };
}

export function buildBlueprintEngineInputFromEvidenceHandoffV1(
  handoff: EvidenceEngineHandoffV1,
  options: BuildBlueprintEngineInputOptions = {},
): BlueprintEngineInputV1 {
  const generationOptions: BlueprintEngineGenerationOptionsV1 = options.generationOptions ?? {
    allow_llm: false,
    require_llm_for_sections: false,
    model_policy: "default" satisfies BlueprintModelPolicy,
    use_prompt_cache: true,
    reuse_cached_artifacts: true,
  };

  return {
    schema_version: "blueprint_engine_input.v1",
    run_request: {
      blueprint_run_id:
        options.blueprintRunId ?? `blueprint-run-${handoff.traceability.immutable_snapshot_hash.slice(0, 12)}`,
      project_id: handoff.project_id,
      user_id: options.userId ?? "integration-adapter",
      requested_at: options.requestedAt ?? handoff.created_at,
      target_steps: options.targetSteps ?? DEFAULT_TARGET_STEPS,
      execution_mode: options.executionMode ?? "dry_run",
      language: "es",
    },
    templates: {
      master_template_key: "MASTER_TEMPLATE_LATAM",
      master_template_version_id:
        options.masterTemplateVersionId ?? "current-master-template-version-unpinned",
      institutional_template_key: options.institutionalTemplateKey ?? null,
      institutional_template_version_id: options.institutionalTemplateVersionId ?? null,
      citation_style: options.citationStyle ?? null,
    },
    project_context: {
      topic: handoff.project_context.topic,
      problem_context: handoff.project_context.problem_context ?? null,
      research_line: handoff.project_context.research_line ?? null,
      methodology_preference: handoff.project_context.methodology_preference ?? null,
      population_or_context: handoff.project_context.population_or_context ?? null,
      constraints: handoff.project_context.constraints ?? null,
      degree_level: handoff.project_context.degree_level,
      university: handoff.project_context.university ?? null,
      program: handoff.project_context.academic_program ?? null,
      country_context: handoff.project_context.country_context,
    },
    evidence_handoff: handoff,
    generation_options: generationOptions,
  };
}

export function buildBlueprintEngineInputFromCurrentLabAArtifact(
  options: BuildBlueprintEngineInputOptions = {},
): BlueprintEngineInputV1 {
  const loaded = loadCurrentLabAEvidenceArtifact(options);
  const handoff = adaptCurrentLabAArtifactToEvidenceHandoffV1(loaded.artifact, {
    ...options,
    sourceArtifactPath: loaded.artifact_path,
    rawJson: loaded.raw_json,
  });

  return buildBlueprintEngineInputFromEvidenceHandoffV1(handoff, options);
}

