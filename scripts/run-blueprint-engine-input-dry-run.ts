import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildBlueprintEngineInputFromCurrentLabAArtifact } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import {
  buildCurrentLabBImportPreviewFromBlueprintInput,
  inspectBlueprintInputForCurrentLabB,
} from "@/server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter";
import { blueprintEngineInputV1Schema } from "@/server/blueprint-engine/contracts";

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const timestamp = timestampForPath();
  const runId = `blueprint-engine-dry-run-${timestamp}`;
  const outputFolder = path.join(
    process.cwd(),
    "artifacts-local",
    "blueprint-engine-dry-runs",
    timestamp,
  );

  mkdirSync(outputFolder, { recursive: true });

  const blueprintInput = buildBlueprintEngineInputFromCurrentLabAArtifact({
    blueprintRunId: runId,
    executionMode: "dry_run",
  });
  const inputValidation = blueprintEngineInputV1Schema.safeParse(blueprintInput);

  if (!inputValidation.success) {
    const summary = {
      run_id: runId,
      status: "blocked",
      blockers: [
        "BlueprintEngineInputV1 schema validation failed.",
        ...inputValidation.error.issues.slice(0, 20).map((issue) => issue.message),
      ],
      output_folder_path: outputFolder,
    };

    writeJsonFile(path.join(outputFolder, "blueprint-engine-input.json"), blueprintInput);
    writeJsonFile(path.join(outputFolder, "lab-b-compatibility-report.json"), {
      can_proceed: false,
      blockers: summary.blockers,
    });
    writeJsonFile(path.join(outputFolder, "lab-b-import-preview.json"), null);
    writeJsonFile(path.join(outputFolder, "dry-run-summary.json"), summary);

    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const inspection = inspectBlueprintInputForCurrentLabB(blueprintInput);
  const compatibility = inspection.compatibility;

  if (!compatibility.can_proceed) {
    const summary = {
      run_id: runId,
      status: "blocked",
      project_id: blueprintInput.run_request.project_id,
      evidence_handoff_id: blueprintInput.evidence_handoff.handoff_id,
      blockers: compatibility.blockers,
      warnings: compatibility.warnings,
      output_folder_path: outputFolder,
    };

    writeJsonFile(path.join(outputFolder, "blueprint-engine-input.json"), blueprintInput);
    writeJsonFile(path.join(outputFolder, "lab-b-compatibility-report.json"), compatibility);
    writeJsonFile(path.join(outputFolder, "lab-b-import-preview.json"), null);
    writeJsonFile(path.join(outputFolder, "dry-run-summary.json"), summary);

    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const importPreview =
    inspection.import_preview ?? buildCurrentLabBImportPreviewFromBlueprintInput(blueprintInput);
  const handoff = blueprintInput.evidence_handoff;
  const topSectionKeys = importPreview.step_7_inputs.top_section_keys;
  const summary = {
    run_id: runId,
    project_id: blueprintInput.run_request.project_id,
    evidence_handoff_id: handoff.handoff_id,
    readiness: handoff.readiness,
    quality_gate_status: handoff.quality_gate.status,
    source_count: handoff.source_registry.length,
    evidence_unit_count: handoff.evidence_units.length,
    section_packet_count: handoff.section_packets.length,
    asset_registry_count: handoff.asset_registry.length,
    asset_usage_plan_count: handoff.asset_usage_plan.length,
    target_steps: blueprintInput.run_request.target_steps,
    master_template_key: blueprintInput.templates.master_template_key,
    institutional_template_key: blueprintInput.templates.institutional_template_key ?? null,
    top_section_keys: topSectionKeys,
    output_folder_path: outputFolder,
  };

  writeJsonFile(path.join(outputFolder, "blueprint-engine-input.json"), blueprintInput);
  writeJsonFile(path.join(outputFolder, "lab-b-compatibility-report.json"), compatibility);
  writeJsonFile(path.join(outputFolder, "lab-b-import-preview.json"), importPreview);
  writeJsonFile(path.join(outputFolder, "dry-run-summary.json"), summary);

  console.log(JSON.stringify(summary, null, 2));
}

main();
