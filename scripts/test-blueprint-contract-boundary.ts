import {
  blueprintEngineInputV1Schema,
  evidenceEngineHandoffV1Schema,
} from "@/server/blueprint-engine/contracts";
import {
  adaptCurrentLabAArtifactToEvidenceHandoffV1,
  buildBlueprintEngineInputFromEvidenceHandoffV1,
  loadCurrentLabAEvidenceArtifact,
} from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

function result(name: string, passed: boolean, detail: string): TestResult {
  return { name, passed, detail };
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const results: TestResult[] = [];
  const loaded = loadCurrentLabAEvidenceArtifact();
  const originalArtifactSnapshot = JSON.parse(JSON.stringify(loaded.artifact)) as unknown;
  const originalArtifactJson = JSON.stringify(loaded.artifact);

  const handoff = adaptCurrentLabAArtifactToEvidenceHandoffV1(loaded.artifact, {
    sourceArtifactPath: loaded.artifact_path,
    rawJson: loaded.raw_json,
  });
  const secondHandoff = adaptCurrentLabAArtifactToEvidenceHandoffV1(loaded.artifact, {
    sourceArtifactPath: loaded.artifact_path,
    rawJson: loaded.raw_json,
  });
  const handoffValidation = evidenceEngineHandoffV1Schema.safeParse(handoff);

  const blueprintInput = buildBlueprintEngineInputFromEvidenceHandoffV1(handoff);
  const blueprintValidation = blueprintEngineInputV1Schema.safeParse(blueprintInput);
  const requiredSteps = [7, 8, 9, 10, 11, 12, 13] as const;
  const selectedSteps = new Set(blueprintInput.run_request.target_steps);
  const sourceArtifactUnchanged =
    JSON.stringify(loaded.artifact) === originalArtifactJson &&
    sameJson(loaded.artifact, originalArtifactSnapshot);

  results.push(
    result(
      "adapt current Lab A artifact to EvidenceEngineHandoffV1",
      handoff.handoff_version === "evidence_engine_handoff.v1" && handoff.handoff_id.length > 0,
      handoff.handoff_id,
    ),
    result(
      "EvidenceEngineHandoffV1 validates with Zod",
      handoffValidation.success,
      handoffValidation.success ? "schema ok" : handoffValidation.error.issues[0]?.message ?? "schema failed",
    ),
    result(
      "BlueprintEngineInputV1 builds from handoff",
      blueprintInput.schema_version === "blueprint_engine_input.v1",
      blueprintInput.schema_version,
    ),
    result(
      "BlueprintEngineInputV1 validates with Zod",
      blueprintValidation.success,
      blueprintValidation.success
        ? "schema ok"
        : blueprintValidation.error.issues[0]?.message ?? "schema failed",
    ),
    result(
      "immutable snapshot hash is stable for same artifact",
      handoff.traceability.immutable_snapshot_hash ===
        secondHandoff.traceability.immutable_snapshot_hash &&
        handoff.traceability.immutable_snapshot_hash === loaded.immutable_snapshot_hash,
      handoff.traceability.immutable_snapshot_hash.slice(0, 12),
    ),
    result(
      "adapter does not mutate source artifact object",
      sourceArtifactUnchanged,
      sourceArtifactUnchanged ? "artifact object unchanged" : "artifact object changed",
    ),
    result(
      "source count is above zero",
      handoff.source_registry.length > 0,
      `${handoff.source_registry.length}`,
    ),
    result(
      "evidence unit count is above zero",
      handoff.evidence_units.length > 0,
      `${handoff.evidence_units.length}`,
    ),
    result(
      "section packet count is above zero",
      handoff.section_packets.length > 0,
      `${handoff.section_packets.length}`,
    ),
    result(
      "quality gate warn status is contract-valid",
      handoff.quality_gate.status === "warn" && handoffValidation.success,
      handoff.quality_gate.status,
    ),
    result(
      "asset registry and asset usage counts need not match",
      Array.isArray(handoff.asset_registry) && Array.isArray(handoff.asset_usage_plan),
      `asset_registry=${handoff.asset_registry.length}; asset_usage_plan=${handoff.asset_usage_plan.length}`,
    ),
    result(
      "selected target steps include 7 through 13",
      requiredSteps.every((step) => selectedSteps.has(step)),
      blueprintInput.run_request.target_steps.join(","),
    ),
  );

  const failed = results.filter((item) => !item.passed);

  for (const item of results) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name} :: ${item.detail}`);
  }

  console.log(`SUMMARY passed=${results.length - failed.length} failed=${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
