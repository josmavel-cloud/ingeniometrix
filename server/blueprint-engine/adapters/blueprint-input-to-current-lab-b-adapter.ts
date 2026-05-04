import {
  blueprintEngineInputV1Schema,
  type BlueprintEngineInputV1,
  type BlueprintEngineStepNumber,
  type EvidenceEngineHandoffV1,
  type EvidenceHandoffQualityStatus,
  type EvidenceHandoffReadiness,
} from "@/server/blueprint-engine/contracts";

export type CurrentLabBCompatibilityCounts = {
  sources: number;
  evidence_units: number;
  section_packets: number;
  weak_section_packets: number;
  assets: number;
  asset_usage_plan_items: number;
};

export type CurrentLabBCompatibilityReport = {
  can_proceed: boolean;
  warnings: string[];
  blockers: string[];
  counts: CurrentLabBCompatibilityCounts;
  quality_gate_status: EvidenceHandoffQualityStatus | "invalid";
  readiness: EvidenceHandoffReadiness | "invalid";
  target_steps: BlueprintEngineStepNumber[];
  templates: {
    master_template_key: string | null;
    master_template_version_id: string | null;
    institutional_template_key: string | null;
    institutional_template_version_id: string | null;
  };
};

export type CurrentLabBImportPreview = {
  preview_type: "current_lab_b_import_preview";
  preview_version: "v1";
  read_only: true;
  does_not_execute_lab_b: true;
  blueprint_run_id: string | null;
  evidence_handoff_id: string;
  project_id: string;
  project_context: {
    topic: string;
    degree_level: string;
    country_context: string;
    university: string | null;
    program: string | null;
  };
  templates: CurrentLabBCompatibilityReport["templates"];
  step_7_inputs: {
    expected_master_template_key: "MASTER_TEMPLATE_LATAM";
    source_snapshot_ref_count: number;
    source_priority_count: number;
    section_packet_count: number;
    weak_section_packet_count: number;
    evidence_unit_count: number;
    asset_registry_count: number;
    asset_usage_plan_item_count: number;
    proposal_context_keys: string[];
    top_section_keys: string[];
  };
  quality_gate_status: EvidenceHandoffQualityStatus;
  readiness: EvidenceHandoffReadiness;
  traceability: {
    immutable_snapshot_hash: string;
    source_artifact_ref_count: number;
  };
};

export type CurrentLabBBlueprintInputInspection = {
  compatibility: CurrentLabBCompatibilityReport;
  import_preview: CurrentLabBImportPreview | null;
};

function emptyCounts(): CurrentLabBCompatibilityCounts {
  return {
    sources: 0,
    evidence_units: 0,
    section_packets: 0,
    weak_section_packets: 0,
    assets: 0,
    asset_usage_plan_items: 0,
  };
}

function countHandoffFields(handoff: EvidenceEngineHandoffV1): CurrentLabBCompatibilityCounts {
  return {
    sources: handoff.source_registry.length,
    evidence_units: handoff.evidence_units.length,
    section_packets: handoff.section_packets.length,
    weak_section_packets: handoff.weak_section_packets.length,
    assets: handoff.asset_registry.length,
    asset_usage_plan_items: handoff.asset_usage_plan.length,
  };
}

function templateSummary(input: BlueprintEngineInputV1): CurrentLabBCompatibilityReport["templates"] {
  return {
    master_template_key: input.templates.master_template_key,
    master_template_version_id: input.templates.master_template_version_id,
    institutional_template_key: input.templates.institutional_template_key ?? null,
    institutional_template_version_id: input.templates.institutional_template_version_id ?? null,
  };
}

function proposalContextKeys(handoff: EvidenceEngineHandoffV1): string[] {
  return Object.entries(handoff.proposal_context)
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== null;
    })
    .map(([key]) => key);
}

function validateMinimumCurrentLabBFields(input: BlueprintEngineInputV1) {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const handoff = input.evidence_handoff;
  const counts = countHandoffFields(handoff);

  if (!handoff.project_context.topic) {
    blockers.push("Missing project_context.topic.");
  }

  if (counts.sources === 0) {
    blockers.push("Missing source_registry records.");
  }

  if (counts.evidence_units === 0) {
    blockers.push("Missing evidence_units records.");
  }

  if (counts.section_packets === 0) {
    blockers.push("Missing section_packets records.");
  }

  if (handoff.source_priorities.length === 0) {
    blockers.push("Missing source_priorities records.");
  }

  if (proposalContextKeys(handoff).length === 0) {
    blockers.push("Missing proposal_context content.");
  }

  if (!handoff.quality_gate.status) {
    blockers.push("Missing quality_gate.status.");
  }

  if (counts.assets === 0 && counts.asset_usage_plan_items === 0) {
    blockers.push("Missing both asset_registry and asset_usage_plan records.");
  }

  if (!handoff.traceability.immutable_snapshot_hash) {
    blockers.push("Missing traceability.immutable_snapshot_hash.");
  }

  if (handoff.traceability.source_artifacts.length === 0) {
    blockers.push("Missing traceability.source_artifacts refs.");
  }

  if (!input.run_request.target_steps.includes(7)) {
    blockers.push("Current Lab B import preview requires target step 7.");
  }

  if (handoff.quality_gate.status === "warn") {
    warnings.push("quality_gate.status is warn; this is compatible but should remain visible.");
  }

  if (handoff.readiness !== "alta") {
    warnings.push(`handoff readiness is ${handoff.readiness}.`);
  }

  if (counts.assets !== counts.asset_usage_plan_items) {
    warnings.push(
      `asset_registry count (${counts.assets}) differs from asset_usage_plan count (${counts.asset_usage_plan_items}); this is allowed because registry entries may be deduplicated.`,
    );
  }

  if (!input.templates.institutional_template_key) {
    warnings.push("No institutional template key is selected yet.");
  }

  return { warnings, blockers, counts };
}

export function validateBlueprintInputCompatibilityWithCurrentLabB(
  input: BlueprintEngineInputV1,
): CurrentLabBCompatibilityReport {
  const schemaResult = blueprintEngineInputV1Schema.safeParse(input);

  if (!schemaResult.success) {
    return {
      can_proceed: false,
      warnings: [],
      blockers: [
        "BlueprintEngineInputV1 schema validation failed.",
        ...schemaResult.error.issues.slice(0, 10).map((issue) => issue.message),
      ],
      counts: emptyCounts(),
      quality_gate_status: "invalid",
      readiness: "invalid",
      target_steps: [],
      templates: {
        master_template_key: null,
        master_template_version_id: null,
        institutional_template_key: null,
        institutional_template_version_id: null,
      },
    };
  }

  const { warnings, blockers, counts } = validateMinimumCurrentLabBFields(input);

  return {
    can_proceed: blockers.length === 0,
    warnings,
    blockers,
    counts,
    quality_gate_status: input.evidence_handoff.quality_gate.status,
    readiness: input.evidence_handoff.readiness,
    target_steps: input.run_request.target_steps,
    templates: templateSummary(input),
  };
}

export function buildCurrentLabBImportPreviewFromBlueprintInput(
  input: BlueprintEngineInputV1,
): CurrentLabBImportPreview {
  const schemaResult = blueprintEngineInputV1Schema.safeParse(input);

  if (!schemaResult.success) {
    throw new Error("Cannot build current Lab B import preview from invalid BlueprintEngineInputV1.");
  }

  const handoff = input.evidence_handoff;
  const counts = countHandoffFields(handoff);
  const topSectionKeys = handoff.section_packets.slice(0, 12).map((packet) => packet.section_key);

  return {
    preview_type: "current_lab_b_import_preview",
    preview_version: "v1",
    read_only: true,
    does_not_execute_lab_b: true,
    blueprint_run_id: input.run_request.blueprint_run_id ?? null,
    evidence_handoff_id: handoff.handoff_id,
    project_id: input.run_request.project_id,
    project_context: {
      topic: input.project_context.topic,
      degree_level: input.project_context.degree_level,
      country_context: input.project_context.country_context,
      university: input.project_context.university,
      program: input.project_context.program,
    },
    templates: templateSummary(input),
    step_7_inputs: {
      expected_master_template_key: "MASTER_TEMPLATE_LATAM",
      source_snapshot_ref_count: handoff.source_snapshot.length,
      source_priority_count: handoff.source_priorities.length,
      section_packet_count: counts.section_packets,
      weak_section_packet_count: counts.weak_section_packets,
      evidence_unit_count: counts.evidence_units,
      asset_registry_count: counts.assets,
      asset_usage_plan_item_count: counts.asset_usage_plan_items,
      proposal_context_keys: proposalContextKeys(handoff),
      top_section_keys: topSectionKeys,
    },
    quality_gate_status: handoff.quality_gate.status,
    readiness: handoff.readiness,
    traceability: {
      immutable_snapshot_hash: handoff.traceability.immutable_snapshot_hash,
      source_artifact_ref_count: handoff.traceability.source_artifacts.length,
    },
  };
}

export function inspectBlueprintInputForCurrentLabB(
  input: BlueprintEngineInputV1,
): CurrentLabBBlueprintInputInspection {
  const compatibility = validateBlueprintInputCompatibilityWithCurrentLabB(input);

  return {
    compatibility,
    import_preview: compatibility.can_proceed
      ? buildCurrentLabBImportPreviewFromBlueprintInput(input)
      : null,
  };
}

