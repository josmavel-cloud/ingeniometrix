import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildBlueprintEngineInputFromEvidenceHandoffV1,
} from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import {
  buildCurrentLabBImportPreviewFromBlueprintInput,
  inspectBlueprintInputForCurrentLabB,
} from "@/server/blueprint-engine/adapters/blueprint-input-to-current-lab-b-adapter";
import {
  blueprintEngineInputV1Schema,
  evidenceEngineHandoffV1Schema,
  type BlueprintEngineInputV1,
  type EvidenceEngineHandoffV1,
} from "@/server/blueprint-engine/contracts";

const DEFAULT_CASE_ID = "case-001-seismic-isolators-peruvian-buildings";
const DEFAULT_HANDOFF_PATH = path.join(
  process.cwd(),
  "artifacts-local",
  "evidence-selected-source-runs",
  DEFAULT_CASE_ID,
  "2026-05-04T13-20-37-881Z",
  "evidence-handoff-v1.json",
);
const DEFAULT_OUTPUT_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "lab-b-diagnostic-ingestion-runs",
);

type CliArgs = {
  handoffPath: string;
  caseId: string;
  outputRoot: string;
};

type CompanionArtifacts = {
  run_summary: Record<string, unknown> | null;
  step_2_access_resolution: Record<string, unknown> | null;
  step_3_evidence_planning: Record<string, unknown> | null;
  step_6_consolidated_evidence: Record<string, unknown> | null;
  quality_assessment_exists: boolean;
};

type DegradedInputWarnings = {
  source: "lab_b_diagnostic_ingestion";
  generated_at: string;
  usable_for_lab_b_diagnostic: boolean;
  usable_for_production: boolean;
  should_run_full_generation: false;
  should_render_docx: false;
  warnings: string[];
  blockers: string[];
  signals: {
    allow_blocked: boolean | null;
    production_valid: boolean | null;
    blocked_at_step: string | null;
    step_3_decision: string | null;
    quality_gate_status: string;
    readiness: string;
    low_source_count: boolean;
    metadata_or_abstract_only_source_count: number;
    unresolved_source_count: number;
    skipped_materialization_source_count: number | null;
    unsupported_claim_count: number | null;
    handoff_warning_count: number;
  };
};

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let handoffPath = DEFAULT_HANDOFF_PATH;
  let caseId = DEFAULT_CASE_ID;
  let outputRoot = DEFAULT_OUTPUT_ROOT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--handoff" && next) {
      handoffPath = path.isAbsolute(next) ? next : path.join(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--case" && next) {
      caseId = next;
      index += 1;
      continue;
    }

    if (arg === "--output-root" && next) {
      outputRoot = path.isAbsolute(next) ? next : path.join(process.cwd(), next);
      index += 1;
    }
  }

  return {
    handoffPath,
    caseId,
    outputRoot,
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return readJson<Record<string, unknown>>(filePath);
}

function writeJsonFile(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeTextFile(filePath: string, value: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asBooleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function loadCompanionArtifacts(handoffPath: string): CompanionArtifacts {
  const runFolder = path.dirname(handoffPath);

  return {
    run_summary: readJsonIfExists(path.join(runFolder, "run-summary.json")),
    step_2_access_resolution: readJsonIfExists(path.join(runFolder, "step-2-access-resolution.json")),
    step_3_evidence_planning: readJsonIfExists(path.join(runFolder, "step-3-evidence-planning.json")),
    step_6_consolidated_evidence: readJsonIfExists(path.join(runFolder, "step-6-consolidated-evidence.json")),
    quality_assessment_exists: existsSync(path.join(runFolder, "QUALITY_ASSESSMENT_DIAGNOSTIC_RUN.md")),
  };
}

function extractSourceAccessSignals(companion: CompanionArtifacts) {
  const step2 = companion.step_2_access_resolution;
  const sourceAccess = asRecord(step2?.source_access_resolution);
  const items = asArray(sourceAccess.items).map(asRecord);

  return {
    metadata_or_abstract_only_source_count: items.filter((item) =>
      asString(item.status) === "metadata_only" || asString(item.kind) === "abstract_only",
    ).length,
    unresolved_source_count: items.filter((item) => asString(item.status) === "unresolved").length,
  };
}

function extractSkippedMaterializationCount(companion: CompanionArtifacts) {
  const step6 = companion.step_6_consolidated_evidence;
  if (!step6) {
    return null;
  }

  return null;
}

function buildDegradedInputWarnings(input: {
  handoff: EvidenceEngineHandoffV1;
  companion: CompanionArtifacts;
}) {
  const runSummary = input.companion.run_summary;
  const step3 = input.companion.step_3_evidence_planning;
  const step6 = input.companion.step_6_consolidated_evidence;
  const accessSignals = extractSourceAccessSignals(input.companion);
  const allowBlocked = asBooleanOrNull(runSummary?.allow_blocked);
  const productionValid = asBooleanOrNull(runSummary?.production_valid);
  const blockedAtStep = asString(runSummary?.blocked_at_step, "");
  const step3Decision = asString(step3?.decision, "");
  const qualityGate = asRecord(step6?.quality_gate);
  const unsupportedClaimCount = step6 ? asArray(qualityGate.unsupported_claims).length : null;
  const skippedMaterialization = (() => {
    const runFolder = runSummary ? path.dirname(asString(runSummary.output_folder)) : null;
    void runFolder;
    return null;
  })();
  const warnings: string[] = [
    ...input.handoff.warnings,
    ...input.handoff.quality_gate.warnings,
  ];
  const blockers: string[] = [...input.handoff.quality_gate.blockers];

  if (allowBlocked === true) {
    warnings.push("Source run used --allow-blocked; downstream output is diagnostic only.");
  }

  if (productionValid === false) {
    warnings.push("Source run marked production_valid=false.");
  }

  if (input.handoff.quality_gate.status !== "pass") {
    warnings.push(`Evidence handoff quality_gate.status=${input.handoff.quality_gate.status}.`);
  }

  if (input.handoff.readiness !== "alta") {
    warnings.push(`Evidence handoff readiness=${input.handoff.readiness}.`);
  }

  if (input.handoff.source_registry.length <= 4) {
    warnings.push(`Low source count for production-quality generation: ${input.handoff.source_registry.length}.`);
  }

  if (accessSignals.metadata_or_abstract_only_source_count > 0) {
    warnings.push(
      `${accessSignals.metadata_or_abstract_only_source_count} source(s) were metadata/abstract-only in the companion Step 2 artifact.`,
    );
  }

  if (accessSignals.unresolved_source_count > 0) {
    warnings.push(
      `${accessSignals.unresolved_source_count} source(s) were unresolved in the companion Step 2 artifact.`,
    );
  }

  if (step3Decision === "BLOCK") {
    warnings.push("Companion Step 3 evidence planning decision was BLOCK.");
  }

  if (unsupportedClaimCount && unsupportedClaimCount > 0) {
    warnings.push(`${unsupportedClaimCount} unsupported claim warning(s) were present in Step 6.`);
  }

  return {
    source: "lab_b_diagnostic_ingestion",
    generated_at: new Date().toISOString(),
    usable_for_lab_b_diagnostic: true,
    usable_for_production: false,
    should_run_full_generation: false,
    should_render_docx: false,
    warnings: unique(warnings),
    blockers: unique(blockers),
    signals: {
      allow_blocked: allowBlocked,
      production_valid: productionValid,
      blocked_at_step: blockedAtStep || null,
      step_3_decision: step3Decision || null,
      quality_gate_status: input.handoff.quality_gate.status,
      readiness: input.handoff.readiness,
      low_source_count: input.handoff.source_registry.length <= 4,
      metadata_or_abstract_only_source_count: accessSignals.metadata_or_abstract_only_source_count,
      unresolved_source_count: accessSignals.unresolved_source_count,
      skipped_materialization_source_count: skippedMaterialization,
      unsupported_claim_count: unsupportedClaimCount,
      handoff_warning_count: input.handoff.warnings.length,
    },
  } satisfies DegradedInputWarnings;
}

function buildStep7TemplateImportContextPreview(input: {
  blueprintInput: BlueprintEngineInputV1;
  degradedWarnings: DegradedInputWarnings;
}) {
  const handoff = input.blueprintInput.evidence_handoff;

  return {
    preview_type: "step_7_template_import_context_preview",
    read_only: true,
    does_not_execute_lab_b: true,
    does_not_call_llm: true,
    expected_master_template_key: input.blueprintInput.templates.master_template_key,
    institutional_template_key: input.blueprintInput.templates.institutional_template_key,
    blueprint_run_id: input.blueprintInput.run_request.blueprint_run_id,
    project_id: input.blueprintInput.run_request.project_id,
    handoff_id: handoff.handoff_id,
    degraded_input_warning_count: input.degradedWarnings.warnings.length,
    should_surface_degraded_banner: true,
    target_steps: input.blueprintInput.run_request.target_steps,
    section_import_order: handoff.section_packets.map((packet) => ({
      section_key: packet.section_key,
      readiness: packet.readiness,
      evidence_id_count: packet.evidence_ids.length,
      source_id_count: packet.source_ids.length,
      asset_key_count: packet.asset_keys.length,
      missing_elements: packet.missing_elements,
      do_not_claim: packet.do_not_claim,
    })),
    source_priority_preview: handoff.source_registry.map((source) => ({
      source_id: source.source_id,
      title: source.title,
      selected_order: source.selected_order,
      eligible_for_formal_reference: source.eligible_for_formal_reference,
      has_pdf_ref: source.materialization_refs.pdf_refs.length > 0,
      has_chunk_refs: source.materialization_refs.chunk_refs.length > 0,
    })),
    traceability: {
      immutable_snapshot_hash: handoff.traceability.immutable_snapshot_hash,
      evidence_unit_count: handoff.evidence_units.length,
      source_artifact_ref_count: handoff.traceability.source_artifacts.length,
    },
  };
}

function buildStep8DryRunPlanPreview(input: {
  blueprintInput: BlueprintEngineInputV1;
  degradedWarnings: DegradedInputWarnings;
}) {
  const handoff = input.blueprintInput.evidence_handoff;

  return {
    preview_type: "step_8_deterministic_dry_run_plan_preview",
    read_only: true,
    does_not_execute_lab_b: true,
    does_not_call_llm: true,
    can_prepare_preview: true,
    should_execute_generation: false,
    reason_generation_is_skipped:
      "Diagnostic ingestion only: LLM generation and full Lab B steps are intentionally disabled.",
    planned_section_count: handoff.section_packets.length,
    section_plans: handoff.section_packets.map((packet) => ({
      section_key: packet.section_key,
      readiness: packet.readiness,
      input_evidence_ids: packet.evidence_ids.slice(0, 12),
      input_asset_keys: packet.asset_keys.slice(0, 12),
      warnings_to_preserve: unique([
        ...packet.missing_elements.map((item) => `missing: ${item}`),
        ...packet.do_not_claim.map((item) => `do_not_claim: ${item}`),
      ]),
      generation_allowed: false,
    })),
    global_guards: [
      "Do not call OpenAI.",
      "Do not run Lab B full section generation.",
      "Do not render DOCX.",
      "Preserve degraded-input warnings in any downstream diagnostic report.",
    ],
    degraded_input_warning_count: input.degradedWarnings.warnings.length,
  };
}

function renderReport(input: {
  summary: Record<string, unknown>;
  compatibility: unknown;
  degradedWarnings: DegradedInputWarnings;
}) {
  const summary = input.summary;
  const warnings = input.degradedWarnings.warnings;
  const blockers = input.degradedWarnings.blockers;

  return `# Lab B Diagnostic Ingestion Report

Run status: ${summary.status}

Case: ${summary.case_id}

Handoff: ${summary.handoff_id}

Project: ${summary.project_id}

## Verdict

- usable_for_lab_b_diagnostic: ${summary.usable_for_lab_b_diagnostic}
- usable_for_production: ${summary.usable_for_production}
- should_run_full_generation: ${summary.should_run_full_generation}
- should_render_docx: ${summary.should_render_docx}

This run is suitable only for backend diagnostic ingestion. It must not be treated as production-quality input.

## Counts

- Sources: ${summary.source_count}
- Evidence units: ${summary.evidence_unit_count}
- Section packets: ${summary.section_packet_count}
- Assets: ${summary.asset_count}
- Readiness: ${summary.readiness}
- Quality gate: ${summary.quality_gate_status}

## Preview Status

- can_proceed_to_step_7_preview: ${summary.can_proceed_to_step_7_preview}
- can_proceed_to_step_8_preview: ${summary.can_proceed_to_step_8_preview}

## Degraded Input Warnings

${warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join("\n") : "- None."}

## Blockers

${blockers.length > 0 ? blockers.map((blocker) => `- ${blocker}`).join("\n") : "- None."}

## Expected Lab B Risks

- Lab B may over-trust readiness if it ignores diagnostic warnings.
- Lab B may over-generate complete-looking sections from a small or weak source set.
- Lab B must preserve unsupported-claim and metadata-only warnings.
- Lab B must not proceed to full generation or DOCX rendering from this run.

## Output

${summary.output_folder}
`;
}

function main() {
  const args = parseArgs();
  const timestamp = timestampForPath();
  const outputFolder = path.join(args.outputRoot, args.caseId, timestamp);
  mkdirSync(outputFolder, { recursive: true });

  const rawHandoff = readJson<unknown>(args.handoffPath);
  const handoffValidation = evidenceEngineHandoffV1Schema.safeParse(rawHandoff);

  if (!handoffValidation.success) {
    const summary = {
      status: "blocked",
      case_id: args.caseId,
      handoff_path: args.handoffPath,
      usable_for_lab_b_diagnostic: false,
      usable_for_production: false,
      can_proceed_to_step_7_preview: false,
      can_proceed_to_step_8_preview: false,
      should_run_full_generation: false,
      should_render_docx: false,
      warnings: [],
      blockers: [
        "EvidenceEngineHandoffV1 validation failed.",
        ...handoffValidation.error.issues.slice(0, 20).map((issue) => issue.message),
      ],
      output_folder: outputFolder,
    };

    writeJsonFile(path.join(outputFolder, "evidence-handoff-v1.json"), rawHandoff);
    writeJsonFile(path.join(outputFolder, "diagnostic-ingestion-summary.json"), summary);
    writeTextFile(
      path.join(outputFolder, "LAB_B_DIAGNOSTIC_INGESTION_REPORT.md"),
      renderReport({
        summary,
        compatibility: null,
        degradedWarnings: {
          source: "lab_b_diagnostic_ingestion",
          generated_at: new Date().toISOString(),
          usable_for_lab_b_diagnostic: false,
          usable_for_production: false,
          should_run_full_generation: false,
          should_render_docx: false,
          warnings: [],
          blockers: summary.blockers,
          signals: {
            allow_blocked: null,
            production_valid: null,
            blocked_at_step: null,
            step_3_decision: null,
            quality_gate_status: "invalid",
            readiness: "invalid",
            low_source_count: true,
            metadata_or_abstract_only_source_count: 0,
            unresolved_source_count: 0,
            skipped_materialization_source_count: null,
            unsupported_claim_count: null,
            handoff_warning_count: 0,
          },
        },
      }),
    );
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  const handoff = handoffValidation.data as EvidenceEngineHandoffV1;
  const companion = loadCompanionArtifacts(args.handoffPath);
  const degradedWarnings = buildDegradedInputWarnings({ handoff, companion });
  const blueprintInput = buildBlueprintEngineInputFromEvidenceHandoffV1(handoff, {
    blueprintRunId: `lab-b-diagnostic-${handoff.handoff_id}-${timestamp}`,
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
  const inputValidation = blueprintEngineInputV1Schema.safeParse(blueprintInput);
  const compatibility = inputValidation.success
    ? inspectBlueprintInputForCurrentLabB(blueprintInput).compatibility
    : {
        can_proceed: false,
        warnings: [],
        blockers: [
          "BlueprintEngineInputV1 validation failed.",
          ...inputValidation.error.issues.slice(0, 20).map((issue) => issue.message),
        ],
        counts: {
          sources: 0,
          evidence_units: 0,
          section_packets: 0,
          weak_section_packets: 0,
          assets: 0,
          asset_usage_plan_items: 0,
        },
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
  const importPreview = inputValidation.success && compatibility.can_proceed
    ? buildCurrentLabBImportPreviewFromBlueprintInput(blueprintInput)
    : null;
  const step7Preview = inputValidation.success && compatibility.can_proceed
    ? buildStep7TemplateImportContextPreview({ blueprintInput, degradedWarnings })
    : null;
  const step8Preview = inputValidation.success && compatibility.can_proceed
    ? buildStep8DryRunPlanPreview({ blueprintInput, degradedWarnings })
    : null;
  const warnings = unique([
    ...degradedWarnings.warnings,
    ...compatibility.warnings,
  ]);
  const blockers = unique([
    ...degradedWarnings.blockers,
    ...compatibility.blockers,
  ]);
  const summary = {
    status: blockers.length > 0 ? "blocked" : "completed",
    case_id: args.caseId,
    handoff_id: handoff.handoff_id,
    project_id: handoff.project_id,
    source_count: handoff.source_registry.length,
    evidence_unit_count: handoff.evidence_units.length,
    section_packet_count: handoff.section_packets.length,
    asset_count: handoff.asset_registry.length,
    quality_gate_status: handoff.quality_gate.status,
    readiness: handoff.readiness,
    usable_for_lab_b_diagnostic: blockers.length === 0,
    usable_for_production: false,
    can_proceed_to_step_7_preview: Boolean(step7Preview),
    can_proceed_to_step_8_preview: Boolean(step8Preview),
    should_run_full_generation: false,
    should_render_docx: false,
    warnings,
    blockers,
    output_folder: outputFolder,
  };
  const labBImportPreview = {
    adapter_import_preview: importPreview,
    step_7_template_import_context_preview: step7Preview,
    step_8_deterministic_dry_run_plan_preview: step8Preview,
    skipped_actions: [
      "OpenAI calls",
      "Lab B full section generation",
      "Steps 9-13",
      "DOCX rendering",
      "production output",
    ],
  };

  writeJsonFile(path.join(outputFolder, "evidence-handoff-v1.json"), handoff);
  writeJsonFile(path.join(outputFolder, "blueprint-engine-input.json"), blueprintInput);
  writeJsonFile(path.join(outputFolder, "lab-b-compatibility-report.json"), compatibility);
  writeJsonFile(path.join(outputFolder, "lab-b-import-preview.json"), labBImportPreview);
  writeJsonFile(path.join(outputFolder, "degraded-input-warnings.json"), degradedWarnings);
  writeJsonFile(path.join(outputFolder, "diagnostic-ingestion-summary.json"), summary);
  writeTextFile(
    path.join(outputFolder, "LAB_B_DIAGNOSTIC_INGESTION_REPORT.md"),
    renderReport({ summary, compatibility, degradedWarnings }),
  );

  console.log(JSON.stringify(summary, null, 2));

  if (blockers.length > 0) {
    process.exitCode = 1;
  }
}

main();
