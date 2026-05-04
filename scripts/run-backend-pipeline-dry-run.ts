import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildBlueprintEngineInputFromCurrentLabAArtifact } from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import { inspectBlueprintInputForCurrentLabB } from "@/server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter";
import { blueprintEngineInputV1Schema } from "@/server/blueprint-engine/contracts";

const FIXTURE_DIR = path.join(process.cwd(), "fixtures", "intakes");
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts-local", "backend-pipeline-dry-runs");
const INTAKE_KEYS = [
  "topic",
  "problemContext",
  "researchLine",
  "academicConstraints",
  "targetPopulation",
  "availableData",
  "preferredMethodology",
  "advisorNotes",
] as const;
const REQUIRED_TOP_LEVEL_KEYS = [
  "case_id",
  "case_name",
  "project_id",
  "user_id",
  "project_context",
  "intake",
  "source_policy",
  "selected_reference_ids",
  "execution_options",
  "source_selection_checkpoint",
  "expected_focus",
  "expected_risks",
] as const;

type IntakeKey = (typeof INTAKE_KEYS)[number];
type IntakeFixture = {
  case_id: string;
  case_name: string;
  project_id: string;
  user_id: string;
  project_context: {
    title: string;
    degree_level: string;
    university: string;
    program: string;
    knowledge_area_label: string;
    template_key: string;
    country: string;
    language: string;
  };
  intake: Record<IntakeKey, string>;
  source_policy: {
    mode: string;
    max_selected_sources: number;
    min_selected_sources: number;
    providers: string[];
    allow_public_pdf_download: boolean;
    allow_web_fulltext_capture: boolean;
    require_complete_public_content: boolean;
  };
  selected_reference_ids: string[];
  execution_options: {
    run_steps: number[];
    force_rerun: boolean;
    use_llm: boolean;
    persist_debug_prompts: boolean;
    persist_full_text: boolean;
    persist_pdfs: boolean;
    cache_namespace: string;
    prompt_version: string;
  };
  source_selection_checkpoint: {
    required: boolean;
    selection_mode: string;
    future_options: string[];
    instructions_es: string;
    selected_reference_ids: string[];
    notes_es: string;
  };
  expected_focus: string[];
  expected_risks: string[];
};

type EvidenceEngineRunRequestPreview = {
  request_type: "evidence_engine_run_request_preview";
  request_version: "v1";
  dry_run_only: true;
  live_provider_calls_enabled: false;
  project_id: string;
  user_id: string;
  project_context: IntakeFixture["project_context"];
  intake: IntakeFixture["intake"];
  source_policy: IntakeFixture["source_policy"];
  selected_reference_ids: string[];
  execution_options: IntakeFixture["execution_options"];
};

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function sameMembers(actual: string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key as (typeof expected)[number]))
  );
}

function readFixture(filePath: string): IntakeFixture {
  return JSON.parse(readFileSync(filePath, "utf8")) as IntakeFixture;
}

function fixtureFiles() {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(FIXTURE_DIR, name));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const caseIndex = args.indexOf("--case");
  const all = args.includes("--all");

  if (caseIndex >= 0) {
    const caseId = args[caseIndex + 1];
    if (!caseId) {
      throw new Error("Missing value after --case.");
    }
    return { all: false, caseId };
  }

  return { all, caseId: null as string | null };
}

function validateFixture(fixture: IntakeFixture) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const topLevelKeys = Object.keys(asRecord(fixture));

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!topLevelKeys.includes(key)) {
      blockers.push(`Missing top-level field: ${key}.`);
    }
  }

  const intakeKeys = Object.keys(asRecord(fixture.intake));
  if (!sameMembers(intakeKeys, INTAKE_KEYS)) {
    blockers.push(
      `Intake fields must exactly match Lab A-compatible fields: ${INTAKE_KEYS.join(", ")}.`,
    );
  }

  for (const key of INTAKE_KEYS) {
    if (typeof fixture.intake?.[key] !== "string" || fixture.intake[key].trim().length === 0) {
      blockers.push(`Missing or empty intake.${key}.`);
    }
  }

  const projectContext = asRecord(fixture.project_context);
  for (const key of [
    "title",
    "degree_level",
    "university",
    "program",
    "knowledge_area_label",
    "template_key",
    "country",
    "language",
  ]) {
    if (typeof projectContext[key] !== "string" || String(projectContext[key]).length === 0) {
      blockers.push(`Missing or empty project_context.${key}.`);
    }
  }

  const sourcePolicy = asRecord(fixture.source_policy);
  if (sourcePolicy.mode !== "auto_search") {
    warnings.push(`source_policy.mode is ${String(sourcePolicy.mode)}.`);
  }
  if (!Array.isArray(sourcePolicy.providers)) {
    blockers.push("source_policy.providers must be an array.");
  }
  const providers = stringArray(sourcePolicy.providers);
  if (providers && !["openalex", "crossref"].every((provider) => providers.includes(provider))) {
    warnings.push("source_policy.providers does not include both openalex and crossref.");
  }
  if (typeof sourcePolicy.max_selected_sources !== "number") {
    blockers.push("source_policy.max_selected_sources must be a number.");
  }
  if (typeof sourcePolicy.min_selected_sources !== "number") {
    blockers.push("source_policy.min_selected_sources must be a number.");
  }

  if (!Array.isArray(fixture.selected_reference_ids)) {
    blockers.push("selected_reference_ids must be an array.");
  }

  const executionOptions = asRecord(fixture.execution_options);
  if (JSON.stringify(executionOptions.run_steps) !== JSON.stringify([1, 2, 3, 4, 5, 6])) {
    blockers.push("execution_options.run_steps must be [1,2,3,4,5,6] for this harness.");
  }
  if (executionOptions.use_llm !== false) {
    blockers.push("execution_options.use_llm must be false for this dry-run fixture phase.");
  }
  for (const key of [
    "force_rerun",
    "persist_debug_prompts",
    "persist_full_text",
    "persist_pdfs",
  ]) {
    if (typeof executionOptions[key] !== "boolean") {
      blockers.push(`execution_options.${key} must be boolean.`);
    }
  }
  if (typeof executionOptions.cache_namespace !== "string") {
    blockers.push("execution_options.cache_namespace must be a string.");
  }
  if (typeof executionOptions.prompt_version !== "string") {
    blockers.push("execution_options.prompt_version must be a string.");
  }

  const checkpoint = asRecord(fixture.source_selection_checkpoint);
  if (checkpoint.required !== true) {
    blockers.push("source_selection_checkpoint.required must be true.");
  }
  if (checkpoint.selection_mode !== "manual_pending") {
    warnings.push(`source_selection_checkpoint.selection_mode is ${String(checkpoint.selection_mode)}.`);
  }
  if (!stringArray(checkpoint.future_options)) {
    blockers.push("source_selection_checkpoint.future_options must be a string array.");
  }
  if (typeof checkpoint.instructions_es !== "string" || checkpoint.instructions_es.length === 0) {
    blockers.push("source_selection_checkpoint.instructions_es is required.");
  }
  if (!Array.isArray(checkpoint.selected_reference_ids)) {
    blockers.push("source_selection_checkpoint.selected_reference_ids must be an array.");
  }
  if (typeof checkpoint.notes_es !== "string") {
    blockers.push("source_selection_checkpoint.notes_es must be a string.");
  }

  if (!Array.isArray(fixture.expected_focus)) {
    blockers.push("expected_focus must be an array.");
  }
  if (!Array.isArray(fixture.expected_risks)) {
    blockers.push("expected_risks must be an array.");
  }

  return {
    status: blockers.length === 0 ? "pass" : "fail",
    warnings,
    blockers,
  };
}

function buildEvidenceEngineRunRequestPreview(
  fixture: IntakeFixture,
): EvidenceEngineRunRequestPreview {
  return {
    request_type: "evidence_engine_run_request_preview",
    request_version: "v1",
    dry_run_only: true,
    live_provider_calls_enabled: false,
    project_id: fixture.project_id,
    user_id: fixture.user_id,
    project_context: fixture.project_context,
    intake: fixture.intake,
    source_policy: fixture.source_policy,
    selected_reference_ids: fixture.selected_reference_ids,
    execution_options: fixture.execution_options,
  };
}

function sourceSelectionStatus(fixture: IntakeFixture) {
  const checkpointIds = fixture.source_selection_checkpoint.selected_reference_ids;
  const topLevelIds = fixture.selected_reference_ids;

  if (checkpointIds.length > 0 || topLevelIds.length > 0) return "fixture_selected" as const;
  if (fixture.source_selection_checkpoint.required) return "pending" as const;
  return "auto_selected_for_test_only" as const;
}

function runFixture(filePath: string) {
  const fixture = readFixture(filePath);
  const timestamp = timestampForPath();
  const outputFolder = path.join(OUTPUT_ROOT, fixture.case_id, timestamp);
  mkdirSync(outputFolder, { recursive: true });

  const validation = validateFixture(fixture);
  const requestPreview =
    validation.status === "pass" ? buildEvidenceEngineRunRequestPreview(fixture) : null;
  const blueprintInput = buildBlueprintEngineInputFromCurrentLabAArtifact({
    blueprintRunId: `backend-pipeline-dry-run-${fixture.case_id}-${timestamp}`,
    executionMode: "dry_run",
  });
  const blueprintValidation = blueprintEngineInputV1Schema.safeParse(blueprintInput);
  const inspection = inspectBlueprintInputForCurrentLabB(blueprintInput);
  const compatibility = inspection.compatibility;
  const handoff = blueprintInput.evidence_handoff;
  const selectionStatus = sourceSelectionStatus(fixture);
  const warnings = [
    ...validation.warnings,
    ...compatibility.warnings,
    ...(selectionStatus === "pending"
      ? [
          "Source selection is pending. This is expected for dry-run fixtures and does not block sample handoff compatibility testing.",
        ]
      : []),
  ];
  const blockers = [
    ...validation.blockers,
    ...(blueprintValidation.success ? [] : ["Sample BlueprintEngineInputV1 failed validation."]),
    ...compatibility.blockers,
  ];
  const summary = {
    case_id: fixture.case_id,
    case_name: fixture.case_name,
    project_id: fixture.project_id,
    user_id: fixture.user_id,
    intake_validation_status: validation.status,
    evidence_engine_request_preview_status: requestPreview ? "pass" : "blocked",
    source_selection_required: fixture.source_selection_checkpoint.required,
    source_selection_mode: fixture.source_selection_checkpoint.selection_mode,
    source_selection_status: selectionStatus,
    sample_handoff_compatibility_status:
      blueprintValidation.success && compatibility.can_proceed ? "compatible" : "blocked",
    readiness: handoff.readiness,
    quality_gate_status: handoff.quality_gate.status,
    source_count: handoff.source_registry.length,
    evidence_unit_count: handoff.evidence_units.length,
    section_packet_count: handoff.section_packets.length,
    asset_registry_count: handoff.asset_registry.length,
    asset_usage_plan_count: handoff.asset_usage_plan.length,
    target_steps: blueprintInput.run_request.target_steps,
    warnings,
    blockers,
    output_folder: outputFolder,
  };

  writeJsonFile(path.join(outputFolder, "intake-fixture.json"), fixture);
  writeJsonFile(path.join(outputFolder, "evidence-engine-run-request-preview.json"), requestPreview);
  writeJsonFile(
    path.join(outputFolder, "source-selection-checkpoint.json"),
    fixture.source_selection_checkpoint,
  );
  writeJsonFile(path.join(outputFolder, "evidence-handoff-preview.json"), handoff);
  writeJsonFile(path.join(outputFolder, "blueprint-engine-input-preview.json"), blueprintInput);
  writeJsonFile(path.join(outputFolder, "lab-b-compatibility-report.json"), compatibility);
  writeJsonFile(path.join(outputFolder, "dry-run-summary.json"), summary);

  return summary;
}

function resolveTargetFiles() {
  const args = parseArgs();
  const files = fixtureFiles();

  const caseId = args.caseId;
  if (caseId !== null) {
    const selected = files.find((file) => {
      const name = path.basename(file, ".json");
      return name === caseId || name.startsWith(caseId);
    });

    if (!selected) {
      throw new Error(`No fixture found for --case ${caseId}.`);
    }

    return [selected];
  }

  if (args.all) return files;
  return files.slice(0, 1);
}

function main() {
  const files = resolveTargetFiles();
  const summaries = files.map(runFixture);
  const failed = summaries.filter((summary) => summary.blockers.length > 0);
  const compact = summaries.map((summary) => ({
    case_id: summary.case_id,
    intake: summary.intake_validation_status,
    source_selection: summary.source_selection_status,
    sample_handoff: summary.sample_handoff_compatibility_status,
    can_continue_after_human_selection:
      summary.intake_validation_status === "pass" &&
      summary.sample_handoff_compatibility_status === "compatible",
    warnings: summary.warnings.length,
    blockers: summary.blockers.length,
    output_folder: summary.output_folder,
  }));

  console.log(JSON.stringify({ cases: compact }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
