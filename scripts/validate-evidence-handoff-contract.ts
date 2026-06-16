import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { evidenceEngineHandoffV1Schema } from "@/server/blueprint-engine/contracts";
import type {
  ArtifactRef,
  AssetHandoffRecord,
  EvidenceClaimScope,
  EvidenceEngineHandoffV1,
  EvidenceUnitHandoffRecord,
  EvidenceUnitType,
  JsonValue,
  SectionPacketHandoffRecord,
  SourceHandoffRecord,
} from "@/server/blueprint-engine/contracts";

const artifactPath = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
  "consolidated_evidence",
  "latest-consolidated-evidence.json",
);

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

function asNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function localJsonArtifactRef(refId: string, uri: string, raw?: string): ArtifactRef {
  return {
    ref_id: refId,
    uri,
    storage_kind: "local_file",
    content_type: "application/json",
    byte_size: raw ? Buffer.byteLength(raw, "utf8") : null,
    sha256: raw ? sha256(raw) : null,
  };
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

  if (candidate === "context_only") return "not_citable";
  return "not_citable";
}

function claimScopeFor(unitType: EvidenceUnitType): EvidenceClaimScope {
  if (unitType === "original_excerpt") return "source_fact";
  if (unitType === "table" || unitType === "image" || unitType === "equation") {
    return "method_context";
  }
  if (unitType === "interpreted_signal") return "background_context";
  return "do_not_claim";
}

function readinessFrom(artifact: Record<string, unknown>): EvidenceEngineHandoffV1["readiness"] {
  const qualityGate = asRecord(artifact.quality_gate);
  if (qualityGate.status === "blocked" || qualityGate.ready_for_steps_7_11 === false) {
    return "blocked";
  }

  const readinessValues = asArray(artifact.section_readiness_map)
    .map((entry) => asRecord(entry).readiness)
    .filter((value): value is string => typeof value === "string");

  if (readinessValues.includes("baja")) return "baja";
  if (readinessValues.includes("media")) return "media";
  return "alta";
}

function adaptSources(sourcePriorities: unknown[]): SourceHandoffRecord[] {
  return sourcePriorities.map((entry, index) => {
    const source = asRecord(entry);
    const sourceId = asString(source.source_id, `source-${index + 1}`);

    return {
      source_id: sourceId,
      reference_id: sourceId,
      title: asString(source.title, sourceId),
      authors: [],
      year: null,
      venue: null,
      doi: null,
      landing_page_url: sourceId.startsWith("http") ? sourceId : null,
      pdf_url: null,
      openalex_id: sourceId.includes("openalex.org") ? sourceId : null,
      crossref_id: null,
      is_open_access: false,
      selected_order: index + 1,
      eligible_for_formal_reference: true,
      citation_metadata: {
        raw: toJsonValue(source),
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

function adaptEvidenceUnits(evidenceUnits: unknown[]): EvidenceUnitHandoffRecord[] {
  return evidenceUnits.map((entry, index) => {
    const unit = asRecord(entry);
    const unitType = normalizeUnitType(unit.unit_type ?? unit.type);

    return {
      evidence_id: asString(unit.evidence_id, `evidence-${index + 1}`),
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
      asset_ref: null,
      caption: asNullableString(unit.caption),
      original_language: asNullableString(unit.original_language),
      citation_eligibility: normalizeCitationEligibility(unit.citation_eligibility),
      confidence: asNumber(unit.confidence, 0),
      relevance_score: asNumber(unit.relevance_score, 0),
      claim_scope: claimScopeFor(unitType),
    };
  });
}

function adaptSectionPackets(sectionDossiers: unknown[]): SectionPacketHandoffRecord[] {
  return sectionDossiers.map((entry, index) => {
    const dossier = asRecord(entry);
    const evidenceIds = asStringArray(dossier.evidence_unit_ids);
    const usefulAssets = asArray(dossier.useful_assets)
      .map((asset) => asRecord(asset).asset_key)
      .filter((assetKey): assetKey is string => typeof assetKey === "string");

    return {
      section_key: asString(dossier.section_key, `section-${index + 1}`),
      readiness:
        dossier.readiness === "media" || dossier.readiness === "baja" || dossier.readiness === "blocked"
          ? dossier.readiness
          : "alta",
      summary: asNullableString(dossier.drafting_strategy ?? dossier.section_label_es),
      source_ids: asStringArray(dossier.primary_source_ids),
      snippet_ids: [],
      evidence_ids: evidenceIds,
      asset_keys: usefulAssets,
      key_points: asStringArray(dossier.citation_plan),
      open_questions: [],
      missing_elements: asStringArray(dossier.missing_evidence),
      do_not_claim: asStringArray(dossier.do_not_claim),
      assumptions_allowed: asStringArray(dossier.assumptions_allowed),
      recommended_chunk_refs: [],
      required_original_fragments: evidenceIds,
    };
  });
}

function adaptAssets(assetUsagePlan: unknown[]): AssetHandoffRecord[] {
  return assetUsagePlan.map((entry, index) => {
    const asset = asRecord(entry);
    const kind = asString(asset.asset_kind, "image");

    return {
      asset_key: asString(asset.asset_key, `asset-${index + 1}`),
      source_id: asString(asset.source_id, "unknown-source"),
      asset_kind:
        kind === "figure" || kind === "table" || kind === "equation" || kind === "image"
          ? kind
          : "image",
      title: null,
      caption: null,
      page_number: null,
      text_content: null,
      file_ref: null,
      mime_type: null,
      width_px: null,
      height_px: null,
      content_hash: null,
      extraction_origin: "pdf_native",
      citation_eligibility: "asset_reference",
      recommended_section_keys: asString(asset.section_key) ? [asString(asset.section_key)] : [],
      usage_reason: asNullableString(asset.usage_reason),
      handling_notes: asStringArray(asset.handling_notes),
    };
  });
}

function adaptConsolidatedEvidence(raw: string): EvidenceEngineHandoffV1 {
  const artifact = asRecord(JSON.parse(raw));
  const projectContext = asRecord(artifact.project_context);
  const qualityGate = asRecord(artifact.quality_gate);
  const manifest = asRecord(artifact.downstream_handoff_manifest);
  const artifactHash = sha256(raw);
  const generatedAt = asString(artifact.generated_at, new Date(0).toISOString());
  const topic = asString(
    projectContext.intake_topic ?? projectContext.project_title,
    "Proyecto sin topico declarado",
  );
  const warnings = [
    ...asStringArray(artifact.warnings),
    ...asStringArray(qualityGate.traceability_warnings),
    ...asArray(qualityGate.checks)
      .map((check) => asRecord(check))
      .filter((check) => check.status === "warn")
      .map((check) => asString(check.message))
      .filter(Boolean),
  ];
  const blockers =
    qualityGate.status === "blocked"
      ? asStringArray(qualityGate.unsupported_claims)
      : [];

  return {
    handoff_id: `evidence-handoff-${artifactHash.slice(0, 12)}`,
    handoff_version: "evidence_engine_handoff.v1",
    project_id: `project-${sha256(topic).slice(0, 12)}`,
    evidence_run_id: asString(artifact.run_dir, artifactHash.slice(0, 12)),
    created_at: generatedAt,
    source_engine: "EvidenceEngine",
    source_engine_version: asString(artifact.artifact_version, "unknown"),
    artifact_hash: artifactHash,
    readiness: readinessFrom(artifact),
    quality_gate: {
      status:
        qualityGate.status === "pass" ||
        qualityGate.status === "warn" ||
        qualityGate.status === "blocked"
          ? qualityGate.status
          : "warn",
      warnings,
      blockers,
    },
    warnings,
    source_snapshot: [
      localJsonArtifactRef("latest-consolidated-evidence", artifactPath, raw),
      ...[
        manifest.consolidated_evidence_artifact_path,
        manifest.latest_consolidated_evidence_artifact_path,
      ]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((uri, index) => localJsonArtifactRef(`manifest-artifact-${index + 1}`, uri)),
    ],
    project_context: {
      language: "es",
      country_context: "PE",
      degree_level: "posgrado",
      target_template_key: null,
      master_template_key: "MASTER_TEMPLATE_LATAM",
      topic,
      problem_context: null,
      research_line: null,
      methodology_preference: null,
      population_or_context: null,
      constraints: null,
      academic_program: null,
      university: null,
      advisor_or_user_notes: null,
      normalized_problem_core: asNullableString(projectContext.project_title),
      retrieval_brief: asNullableString(artifact.summary),
    },
    source_registry: adaptSources(asArray(artifact.source_priorities)),
    evidence_units: adaptEvidenceUnits(asArray(artifact.evidence_units)),
    section_packets: adaptSectionPackets(asArray(artifact.section_dossiers)),
    weak_section_packets: adaptSectionPackets(asArray(artifact.weak_section_completion_packets)),
    source_priorities: asArray(artifact.source_priorities).map(toJsonValue),
    asset_registry: adaptAssets(asArray(artifact.asset_usage_plan)),
    asset_usage_plan: asArray(artifact.asset_usage_plan).map(toJsonValue),
    materialized_content_refs: asStringArray(manifest.read_only_input_paths).map((uri, index) =>
      localJsonArtifactRef(`readonly-input-${index + 1}`, uri),
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
      context_preservation_contract: toJsonValue(artifact.context_preservation_contract),
    },
    assumptions: asStringArray(qualityGate.handoff_notes).map((statement, index) => ({
      assumption_id: `handoff-note-${index + 1}`,
      statement,
      reason: "Imported from consolidated evidence quality gate handoff notes.",
      section_keys: [],
    })),
    traceability: {
      source_artifacts: [localJsonArtifactRef("latest-consolidated-evidence", artifactPath, raw)],
      immutable_snapshot_hash: artifactHash,
    },
  };
}

function main() {
  const raw = readFileSync(artifactPath, "utf8");
  const handoff = adaptConsolidatedEvidence(raw);
  const result = evidenceEngineHandoffV1Schema.safeParse(handoff);

  if (!result.success) {
    console.error("Evidence handoff contract validation failed.");
    console.error(result.error.issues.slice(0, 20));
    process.exit(1);
  }

  const report = {
    handoff_id: result.data.handoff_id,
    project_id: result.data.project_id,
    readiness: result.data.readiness,
    quality_gate_status: result.data.quality_gate.status,
    source_count: result.data.source_registry.length,
    evidence_unit_count: result.data.evidence_units.length,
    section_packet_count: result.data.section_packets.length,
    asset_count: result.data.asset_registry.length,
    warnings_count: result.data.warnings.length,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
