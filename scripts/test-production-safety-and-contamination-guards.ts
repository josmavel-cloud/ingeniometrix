import { readFileSync } from "node:fs";
import path from "node:path";

import { buildBlueprintEngineInputFromEvidenceHandoffV1 } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import { inspectBlueprintInputForCurrentLabB } from "@/server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter";
import {
  evidenceEngineHandoffV1Schema,
  type EvidenceEngineHandoffV1,
} from "@/server/blueprint-engine/contracts";
import {
  evaluateBlueprintProductionSafety,
  validateFreshRunIsolation,
  validatePublicAppendixPolicyText,
} from "@/server/blueprint-engine/quality/production-safety";

const DEFAULT_HANDOFF_PATH = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-selected-source-runs",
  "case-001-seismic-isolators-peruvian-buildings",
  "2026-05-04T13-20-37-881Z",
  "evidence-handoff-v1.json",
);

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

function assertResult(name: string, condition: boolean, details: string): TestResult {
  return {
    name,
    passed: condition,
    details,
  };
}

function loadDiagnosticHandoff(): EvidenceEngineHandoffV1 {
  const raw = JSON.parse(readFileSync(DEFAULT_HANDOFF_PATH, "utf8")) as unknown;
  const parsed = evidenceEngineHandoffV1Schema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(
      `Diagnostic handoff fixture failed schema validation: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return parsed.data as EvidenceEngineHandoffV1;
}

function runTests() {
  const handoff = loadDiagnosticHandoff();
  const blueprintInput = buildBlueprintEngineInputFromEvidenceHandoffV1(handoff, {
    blueprintRunId: "test-production-safety-diagnostic-fixture",
    executionMode: "dry_run",
    targetSteps: [7, 8],
    generationOptions: {
      allow_llm: false,
      require_llm_for_sections: false,
      model_policy: "cost_optimized",
      use_prompt_cache: false,
      reuse_cached_artifacts: true,
      max_cost_cad: 0,
    },
  });
  const compatibility = inspectBlueprintInputForCurrentLabB(blueprintInput).compatibility;
  const safety = evaluateBlueprintProductionSafety(blueprintInput, {
    structural_blockers: compatibility.blockers,
    structural_warnings: compatibility.warnings,
    signals: {
      diagnostic_only: true,
      production_valid: false,
      degraded_handoff: true,
      allow_blocked_upstream: true,
      upstream_step_3_decision: "BLOCK",
      consistency_matrix_status: "blocked",
      materialized_source_count: 2,
      min_materialized_source_count: 4,
      metadata_or_abstract_only_source_count: 1,
      unresolved_source_count: 1,
    },
  });
  const staleAssetReport = validateFreshRunIsolation({
    handoff,
    production_mode: false,
    asset_refs: [
      {
        asset_key: "fake-stale-method-figure",
        source_id: "fake-source",
        uri: "C:\\old-run\\evidence-handoff-stale123456\\method-figure.png",
        source_run_id: "evidence-run-stale123456",
        source_handoff_id: "evidence-handoff-stale123456",
      },
    ],
  });
  const appendixPolicy = validatePublicAppendixPolicyText(
    [
      "Anexo tecnico interno",
      "C:\\projects\\ingeniometrix\\artifacts-local\\debug\\run-summary.json",
      "immutable_snapshot_hash: abc123",
      "raw prompt trace and provider debug log",
    ].join("\n"),
  );

  return [
    assertResult(
      "degraded handoff compatibility split",
      safety.schema_compatible === true &&
        safety.diagnostic_compatible === true &&
        safety.production_eligible === false,
      `schema=${safety.schema_compatible}, diagnostic=${safety.diagnostic_compatible}, production=${safety.production_eligible}`,
    ),
    assertResult(
      "production ineligibility reasons include blocked/degraded signals",
      safety.production_ineligibility_reasons.some((reason) => /step 3/i.test(reason)) &&
        safety.production_ineligibility_reasons.some((reason) => /production_valid=false/i.test(reason)) &&
        safety.production_ineligibility_reasons.some((reason) => /consistency matrix/i.test(reason)),
      safety.production_ineligibility_reasons.join(" | "),
    ),
    assertResult(
      "fake stale asset ref triggers fresh-run isolation warning",
      staleAssetReport.warnings.length > 0 && staleAssetReport.stale_marker_count > 0,
      `warnings=${staleAssetReport.warnings.length}, stale_markers=${staleAssetReport.stale_marker_count}`,
    ),
    assertResult(
      "public appendix policy rejects backend/developer traceability",
      appendixPolicy.passed === false && appendixPolicy.violations.length > 0,
      appendixPolicy.violations.join(" | "),
    ),
  ];
}

function main() {
  const results = runTests();
  const failed = results.filter((result) => !result.passed);

  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name} :: ${result.details}`);
  }

  console.log(`\n${results.length - failed.length}/${results.length} production safety checks passed.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main();
