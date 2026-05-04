import {
  blueprintEngineInputV1Schema,
  evidenceEngineHandoffV1Schema,
} from "@/server/blueprint-engine/contracts";
import { buildBlueprintEngineInputFromCurrentLabAArtifact } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";

function main() {
  const blueprintInput = buildBlueprintEngineInputFromCurrentLabAArtifact();
  const handoffResult = evidenceEngineHandoffV1Schema.safeParse(blueprintInput.evidence_handoff);

  if (!handoffResult.success) {
    console.error("EvidenceEngineHandoffV1 validation failed.");
    console.error(handoffResult.error.issues.slice(0, 20));
    process.exit(1);
  }

  const blueprintInputResult = blueprintEngineInputV1Schema.safeParse(blueprintInput);

  if (!blueprintInputResult.success) {
    console.error("BlueprintEngineInputV1 validation failed.");
    console.error(blueprintInputResult.error.issues.slice(0, 20));
    process.exit(1);
  }

  const input = blueprintInputResult.data;
  const handoff = handoffResult.data;

  console.log(
    JSON.stringify(
      {
        blueprint_input_schema_version: input.schema_version,
        evidence_handoff_id: handoff.handoff_id,
        project_id: input.run_request.project_id,
        readiness: handoff.readiness,
        quality_gate_status: handoff.quality_gate.status,
        source_count: handoff.source_registry.length,
        evidence_unit_count: handoff.evidence_units.length,
        section_packet_count: handoff.section_packets.length,
        weak_section_packet_count: handoff.weak_section_packets.length,
        asset_count: handoff.asset_registry.length,
        selected_target_steps: input.run_request.target_steps,
        master_template_key: input.templates.master_template_key,
        institutional_template_key: input.templates.institutional_template_key,
        immutable_snapshot_hash_prefix: handoff.traceability.immutable_snapshot_hash.slice(0, 12),
      },
      null,
      2,
    ),
  );
}

main();

