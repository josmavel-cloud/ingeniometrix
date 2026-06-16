import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type {
  BlueprintLaunchLocalState,
  ConsolidatedEvidenceArtifact,
  ConsolidatedEvidenceUnit,
  ConsolidatedEvidenceProposalFrameworkCandidate,
  ConsolidatedEvidenceProposalMethodCandidate,
  ConsolidatedEvidenceSourcePriority,
  ConsolidatedEvidenceSectionInputPacket,
  ConsolidatedEvidenceSectionReadiness,
  ConsolidatedEvidenceWeakSectionCompletionPacket,
} from "@/blueprint_launch/server/local-playground-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import type {
  LoadedMasterBlueprintLabFixtureSet,
} from "@/server/blueprint-v2/lab/types";
import type { MasterTemplateRuntime } from "@/server/blueprint-v2/types";

type SectionReadinessLevel = "alta" | "media" | "baja" | "blocked" | "unknown";
type GenerationPriority = "early" | "middle" | "late";
type GenerationRole = "context" | "support" | "method" | "closure" | "final";

export type TemplateImportSectionAlignmentEntry = {
  section_key: string;
  template_title: string;
  readiness: SectionReadinessLevel;
  enough_to_draft: boolean;
  mapped_imported_section_keys: string[];
  imported_source_ids: string[];
  fixture_source_ids: string[];
  recommended_snippet_ids: string[];
  recommended_asset_keys: string[];
  method_relevance: "high" | "medium" | "low";
  framework_relevance: "high" | "medium" | "low";
  needs_local_assumptions: boolean;
  needs_followup_before_strong_draft: boolean;
  generation_priority: GenerationPriority;
  generation_role: GenerationRole;
  direct_excerpt_count: number;
  asset_reference_count: number;
  has_citable_original_excerpt: boolean;
  has_critical_assets_candidate: boolean;
  dominant_evidence_types: string[];
  dossier_summary: string | null;
  gap_labels: string[];
  notes: string[];
};

export type MasterTemplateImportContextArtifact = {
  artifact_type: "master_template_import_context";
  artifact_version: "v1";
  generated_at: string;
  source_snapshot: {
    source_lab: "blueprint_launch";
    lab_state_path: string;
    latest_debug_path: string;
    archived_debug_path: string | null;
    selected_sources_path: string;
    latest_consolidated_evidence_path: string | null;
    downstream_handoff_manifest_path: string | null;
    materialized_content_dir: string;
    extracted_assets_dir: string;
    resolved_materialized_run_id: string | null;
    resolved_assets_run_id: string | null;
    resolved_consolidated_run_id: string | null;
  };
  imported_project_context: {
    knowledge_area_label: string | null;
    topic: string;
    problem_context: string | null;
    research_line: string | null;
    target_population: string | null;
    preferred_methodology: string | null;
    academic_constraints: string | null;
    advisor_notes: string | null;
  };
  imported_evidence_context: {
    selected_source_count: number;
    complete_public_count: number;
    partial_public_count: number;
    materialized_pdf_count: number;
    materialized_web_count: number;
    pack_count: number;
    total_snippet_count: number;
    total_asset_count: number;
    equation_asset_count: number;
    table_asset_count: number;
    image_asset_count: number;
    evidence_unit_count: number;
    original_excerpt_count: number;
    asset_reference_count: number;
    interpreted_signal_count: number;
    context_only_count: number;
    section_dossier_count: number;
    overall_readiness: string | null;
    quality_gate_status: "pass" | "warn" | "block" | null;
    baseline_comparison_status: "pass" | "warn" | "regression" | null;
  };
  source_id_bridge: Array<{
    imported_source_id: string;
    fixture_source_id: string | null;
    title: string;
    materialized_source_available: boolean;
    materialized_primary_path: string | null;
    materialized_text_path: string | null;
    imported_asset_count: number;
    imported_direct_excerpt_count: number;
    has_pdf_materialization: boolean;
    top_section_keys: string[];
  }>;
  proposal_context: {
    method_candidate: ConsolidatedEvidenceProposalMethodCandidate | null;
    framework_candidate: ConsolidatedEvidenceProposalFrameworkCandidate | null;
    dominant_methods: string[];
    dominant_frameworks: string[];
    key_findings: string[];
    evidence_gaps: string[];
    followup_requirements: ConsolidatedEvidenceArtifact["followup_requirements"] | null;
  };
  section_input_packets: ConsolidatedEvidenceSectionInputPacket[];
  weak_section_completion_packets: ConsolidatedEvidenceWeakSectionCompletionPacket[];
  source_priorities: ConsolidatedEvidenceSourcePriority[];
  section_alignment_map: TemplateImportSectionAlignmentEntry[];
  global_generation_hints: {
    knowledge_area_label: string | null;
    methodology_mode_hint: string | null;
    framework_priority_hint: string | null;
    case_context_strength: "high" | "medium" | "low";
    local_regulatory_support: "high" | "medium" | "low";
    title_refinement_expected: boolean;
    abstract_should_be_late: boolean;
    keywords_should_be_late: boolean;
    matrix_should_be_late: boolean;
  };
  imported_handoff_summary: {
    ready_for_steps_7_11: boolean | null;
    quality_gate_status: "pass" | "warn" | "block" | null;
    baseline_comparison_status: "pass" | "warn" | "regression" | null;
    previous_lab_warnings: string[];
    handoff_notes: string[];
    traceability_warnings: string[];
    unsupported_claims: string[];
    read_only_input_paths: string[];
    next_lab_should_read: string[];
    next_lab_should_not_modify: string[];
  };
  checks: {
    mapped_section_count: number;
    unmapped_template_sections: string[];
    weak_sections: string[];
    blocked_sections: string[];
    missing_local_context: boolean;
    missing_regulatory_context: boolean;
    missing_technique_specific_support: boolean;
    selected_sources_match: boolean;
    stale_snapshot_detected: boolean;
  };
  warnings: string[];
};

const BLUEPRINT_LAUNCH_ROOT = path.join(
  process.cwd(),
  "artifacts-local",
  "blueprint_launch",
);
const LAB_STATE_PATH = path.join(BLUEPRINT_LAUNCH_ROOT, "lab-state.json");
const LATEST_DEBUG_PATH = path.join(
  BLUEPRINT_LAUNCH_ROOT,
  "debug_runs",
  "latest-debug.json",
);
const REQUESTED_ARCHIVED_DEBUG_PATH = path.join(
  BLUEPRINT_LAUNCH_ROOT,
  "debug_runs",
  "debug-2026-04-27T17-11-19-928Z-references_saved.json",
);
const SELECTED_SOURCES_PATH = path.join(
  BLUEPRINT_LAUNCH_ROOT,
  "selected_sources",
  "latest-selected-sources.json",
);
const LATEST_CONSOLIDATED_EVIDENCE_PATH = path.join(
  BLUEPRINT_LAUNCH_ROOT,
  "consolidated_evidence",
  "latest-consolidated-evidence.json",
);
const MATERIALIZED_CONTENT_ROOT = path.join(
  BLUEPRINT_LAUNCH_ROOT,
  "materialized_content",
);
const EXTRACTED_ASSETS_ROOT = path.join(
  BLUEPRINT_LAUNCH_ROOT,
  "extracted_assets",
);

const TEMPLATE_SECTION_IMPORT_MAP: Record<
  string,
  {
    importedKeys: string[];
    generation_role: GenerationRole;
    generation_priority: GenerationPriority;
  }
> = {
  abstract: {
    importedKeys: ["background", "problem_statement", "methodology", "findings_support", "limitations"],
    generation_role: "final",
    generation_priority: "late",
  },
  keywords: {
    importedKeys: ["theoretical_framework", "technical_framework", "methodology"],
    generation_role: "final",
    generation_priority: "late",
  },
  introduction: {
    importedKeys: ["background", "case_context"],
    generation_role: "context",
    generation_priority: "early",
  },
  problem_statement: {
    importedKeys: ["problem_statement", "case_context"],
    generation_role: "context",
    generation_priority: "early",
  },
  research_questions: {
    importedKeys: ["problem_statement", "methodology"],
    generation_role: "context",
    generation_priority: "early",
  },
  general_research_question: {
    importedKeys: ["problem_statement", "methodology"],
    generation_role: "context",
    generation_priority: "early",
  },
  specific_research_questions: {
    importedKeys: ["problem_statement", "evaluation_criteria", "methodology"],
    generation_role: "context",
    generation_priority: "early",
  },
  justification: {
    importedKeys: ["justification", "problem_statement", "findings_support"],
    generation_role: "context",
    generation_priority: "early",
  },
  theoretical_justification: {
    importedKeys: ["justification", "theoretical_framework"],
    generation_role: "context",
    generation_priority: "early",
  },
  practical_justification: {
    importedKeys: ["justification", "findings_support"],
    generation_role: "context",
    generation_priority: "early",
  },
  methodological_justification: {
    importedKeys: ["justification", "methodology", "evaluation_criteria"],
    generation_role: "context",
    generation_priority: "early",
  },
  objectives: {
    importedKeys: ["problem_statement", "evaluation_criteria", "methodology"],
    generation_role: "context",
    generation_priority: "early",
  },
  general_objective: {
    importedKeys: ["problem_statement", "methodology"],
    generation_role: "context",
    generation_priority: "early",
  },
  specific_objectives: {
    importedKeys: ["problem_statement", "evaluation_criteria", "methodology"],
    generation_role: "context",
    generation_priority: "early",
  },
  hypotheses: {
    importedKeys: ["methodology", "findings_support"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  general_hypothesis: {
    importedKeys: ["methodology", "findings_support"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  specific_hypotheses: {
    importedKeys: ["methodology", "findings_support"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  theoretical_framework: {
    importedKeys: ["theoretical_framework", "technical_framework", "background"],
    generation_role: "support",
    generation_priority: "middle",
  },
  research_antecedents: {
    importedKeys: ["theoretical_framework", "background"],
    generation_role: "support",
    generation_priority: "middle",
  },
  state_of_the_art: {
    importedKeys: ["theoretical_framework", "background"],
    generation_role: "support",
    generation_priority: "middle",
  },
  theoretical_bases: {
    importedKeys: ["technical_framework", "theoretical_framework"],
    generation_role: "support",
    generation_priority: "middle",
  },
  terms_definition: {
    importedKeys: ["technical_framework", "theoretical_framework"],
    generation_role: "support",
    generation_priority: "middle",
  },
  consistency_matrix: {
    importedKeys: ["problem_statement", "methodology", "evaluation_criteria"],
    generation_role: "final",
    generation_priority: "late",
  },
  variables_or_categories: {
    importedKeys: ["evaluation_criteria", "technical_framework", "methodology"],
    generation_role: "method",
    generation_priority: "middle",
  },
  variables_indicators: {
    importedKeys: ["evaluation_criteria", "methodology"],
    generation_role: "method",
    generation_priority: "middle",
  },
  categories_subcategories: {
    importedKeys: ["evaluation_criteria", "methodology"],
    generation_role: "method",
    generation_priority: "middle",
  },
  methodology: {
    importedKeys: ["methodology", "evaluation_criteria", "technical_framework"],
    generation_role: "method",
    generation_priority: "middle",
  },
  methodological_approach: {
    importedKeys: ["methodology"],
    generation_role: "method",
    generation_priority: "middle",
  },
  research_design: {
    importedKeys: ["methodology", "evaluation_criteria"],
    generation_role: "method",
    generation_priority: "middle",
  },
  population_and_sample: {
    importedKeys: ["methodology", "case_context"],
    generation_role: "method",
    generation_priority: "middle",
  },
  data_collection_techniques: {
    importedKeys: ["methodology", "evaluation_criteria"],
    generation_role: "method",
    generation_priority: "middle",
  },
  research_instruments: {
    importedKeys: ["methodology", "evaluation_criteria"],
    generation_role: "method",
    generation_priority: "middle",
  },
  research_procedure: {
    importedKeys: ["methodology", "evaluation_criteria"],
    generation_role: "method",
    generation_priority: "middle",
  },
  analysis_plan: {
    importedKeys: ["methodology", "evaluation_criteria", "findings_support"],
    generation_role: "method",
    generation_priority: "middle",
  },
  ethics: {
    importedKeys: ["methodology", "limitations"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  scope_and_limitations: {
    importedKeys: ["limitations", "case_context"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  schedule: {
    importedKeys: ["methodology"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  budget: {
    importedKeys: ["methodology"],
    generation_role: "closure",
    generation_priority: "middle",
  },
  references: {
    importedKeys: ["theoretical_framework", "technical_framework", "methodology"],
    generation_role: "final",
    generation_priority: "late",
  },
  annexes: {
    importedKeys: ["technical_framework", "evaluation_criteria", "findings_support"],
    generation_role: "final",
    generation_priority: "late",
  },
};

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists<T>(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function resolveLatestRunDir(rootDir: string) {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const latest = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => path.join(rootDir, entry.name))
    .sort((left, right) => right.localeCompare(left))[0];

  return latest ?? rootDir;
}

function extractRunId(resolvedPath: string | null | undefined) {
  if (!resolvedPath) {
    return null;
  }

  const baseName = path.basename(resolvedPath);
  return baseName.startsWith("run-") ? baseName : null;
}

async function resolveArchivedDebugPath() {
  if (await pathExists(REQUESTED_ARCHIVED_DEBUG_PATH)) {
    return REQUESTED_ARCHIVED_DEBUG_PATH;
  }

  const debugDir = path.join(BLUEPRINT_LAUNCH_ROOT, "debug_runs");
  const entries = await readdir(debugDir, { withFileTypes: true }).catch(() => []);
  const matchingEntry = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.includes("2026-04-27T17-11-19-92") &&
        entry.name.endsWith("-references_saved.json"),
    )
    .map((entry) => path.join(debugDir, entry.name))
    .sort((left, right) => right.localeCompare(left))[0];

  return matchingEntry ?? null;
}

function rankReadiness(value: SectionReadinessLevel) {
  switch (value) {
    case "blocked":
      return 0;
    case "baja":
      return 1;
    case "media":
      return 2;
    case "alta":
      return 3;
    default:
      return -1;
  }
}

function clipList(values: string[] | undefined, max = 8) {
  return (values ?? []).slice(0, max);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function buildBridgeMap(input: {
  state: BlueprintLaunchLocalState;
  fixtures: LoadedMasterBlueprintLabFixtureSet;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
}) {
  const fixtureByReferenceId = new Map(
    input.fixtures.acquisition.source_registry
      .filter((source) => source.reference_id)
      .map((source) => [source.reference_id, source]),
  );
  const evidenceUnits =
    ((input.consolidatedEvidence as { evidence_units?: ConsolidatedEvidenceUnit[] } | null)
      ?.evidence_units ?? []) as ConsolidatedEvidenceUnit[];
  const materializedBySourceId = new Map(
    (input.state.contentMaterialization?.items ?? []).map((item) => [item.sourceId, item]),
  );

  return (input.state.selectedSourcesBundle?.sources ?? []).map((item) => ({
    imported_source_id: item.reference.id,
    fixture_source_id: fixtureByReferenceId.get(item.reference.id)?.source_id ?? null,
    title: item.reference.title,
    materialized_source_available: materializedBySourceId.has(item.reference.id),
    materialized_primary_path: materializedBySourceId.get(item.reference.id)?.localPrimaryPath ?? null,
    materialized_text_path: materializedBySourceId.get(item.reference.id)?.localTextPath ?? null,
    imported_asset_count: evidenceUnits.filter(
      (unit) =>
        unit.source_id === item.reference.id &&
        ["table", "equation", "image"].includes(unit.unit_type),
    ).length,
    imported_direct_excerpt_count: evidenceUnits.filter(
      (unit) => unit.source_id === item.reference.id && unit.unit_type === "original_excerpt",
    ).length,
    has_pdf_materialization:
      materializedBySourceId.get(item.reference.id)?.storedKind === "pdf" ||
      (materializedBySourceId.get(item.reference.id)?.localPrimaryPath ?? "")
        .toLowerCase()
        .endsWith(".pdf"),
    top_section_keys: clipList(
      Array.from(
        new Set(
          evidenceUnits
            .filter((unit) => unit.source_id === item.reference.id)
            .flatMap((unit) => unit.section_keys ?? []),
        ),
      ),
      6,
    ),
  }));
}

function getImportedSectionMaps(consolidatedEvidence: ConsolidatedEvidenceArtifact | null) {
  const readinessMap = new Map(
    (consolidatedEvidence?.section_readiness_map ?? []).map((entry) => [
      entry.section_key,
      entry,
    ]),
  );
  const packetMap = new Map(
    (consolidatedEvidence?.section_input_packets ?? []).map((entry) => [
      entry.section_key,
      entry,
    ]),
  );
  const weakMap = new Map(
    (consolidatedEvidence?.weak_section_completion_packets ?? []).map((entry) => [
      entry.section_key,
      entry,
    ]),
  );

  return {
    readinessMap,
    packetMap,
    weakMap,
  };
}

function buildSectionAlignmentEntry(input: {
  semanticKey: string;
  title: string;
  state: BlueprintLaunchLocalState;
  fixtures: LoadedMasterBlueprintLabFixtureSet;
  bridgeMap: ReturnType<typeof buildBridgeMap>;
  readinessMap: Map<string, ConsolidatedEvidenceSectionReadiness>;
  packetMap: Map<string, ConsolidatedEvidenceSectionInputPacket>;
  weakMap: Map<string, ConsolidatedEvidenceWeakSectionCompletionPacket>;
  evidenceUnits: ConsolidatedEvidenceUnit[];
}): TemplateImportSectionAlignmentEntry {
  const mapping =
    TEMPLATE_SECTION_IMPORT_MAP[input.semanticKey] ?? {
      importedKeys: [],
      generation_role: "support" as const,
      generation_priority: "middle" as const,
    };
  const mappedImportedKeys = mapping.importedKeys.filter(
    (key) =>
      input.readinessMap.has(key) ||
      input.packetMap.has(key) ||
      input.weakMap.has(key),
  );
  const mappedReadinessEntries = mappedImportedKeys
    .map((key) => input.readinessMap.get(key))
    .filter((entry): entry is ConsolidatedEvidenceSectionReadiness => Boolean(entry));
  const mappedPackets = mappedImportedKeys
    .map((key) => input.packetMap.get(key))
    .filter((entry): entry is ConsolidatedEvidenceSectionInputPacket => Boolean(entry));
  const mappedWeakPackets = mappedImportedKeys
    .map((key) => input.weakMap.get(key))
    .filter((entry): entry is ConsolidatedEvidenceWeakSectionCompletionPacket => Boolean(entry));
  const strongestMappedReadiness = mappedReadinessEntries.reduce<SectionReadinessLevel>(
    (current, entry) =>
      rankReadiness(entry.readiness) > rankReadiness(current)
        ? entry.readiness
        : current,
    "unknown",
  );
  const hasStrongMappedSupport = mappedReadinessEntries.some(
    (entry) => entry.enough_to_draft && rankReadiness(entry.readiness) >= rankReadiness("media"),
  );
  const readiness: SectionReadinessLevel =
    !hasStrongMappedSupport &&
    mappedWeakPackets.some((entry) => entry.draftability_status === "blocked_by_missing_evidence")
      ? "blocked"
      : strongestMappedReadiness;
  const importedSourceIds = unique(
    mappedPackets.flatMap((packet) => packet.source_ids).concat(
      mappedReadinessEntries.flatMap((entry) => entry.recommended_source_ids),
    ),
  );
  const bridgeByImportedId = new Map(
    input.bridgeMap.map((entry) => [entry.imported_source_id, entry.fixture_source_id]),
  );
  const fixtureSourceIds = importedSourceIds
    .map((sourceId) => bridgeByImportedId.get(sourceId) ?? null)
    .filter((sourceId): sourceId is string => Boolean(sourceId));
  const notes = unique([
    ...mappedPackets.map((packet) => packet.summary),
    ...mappedReadinessEntries.flatMap((entry) => entry.missing_elements),
    ...mappedWeakPackets.flatMap((entry) => entry.inference_bridges),
  ]);
  const alignedEvidenceUnits = input.evidenceUnits.filter((unit) =>
    (unit.section_keys ?? []).some((sectionKey) => mappedImportedKeys.includes(sectionKey)),
  );
  const directExcerptCount = alignedEvidenceUnits.filter(
    (unit) => unit.unit_type === "original_excerpt",
  ).length;
  const assetReferenceCount = alignedEvidenceUnits.filter((unit) =>
    ["table", "equation", "image"].includes(unit.unit_type),
  ).length;
  const dominantEvidenceTypes = Array.from(
    new Set(alignedEvidenceUnits.map((unit) => unit.unit_type).filter(Boolean)),
  );
  const gapLabels = clipList(
    unique([
      ...mappedReadinessEntries.flatMap((entry) => entry.missing_elements),
      ...mappedWeakPackets.flatMap((entry) => entry.missing_evidence),
      ...mappedPackets.flatMap((packet) => packet.open_questions),
    ]),
    6,
  );
  const enoughToDraft =
    mapping.generation_role === "final"
      ? false
      : readiness !== "blocked" &&
        (mappedReadinessEntries.some((entry) => entry.enough_to_draft) ||
          mappedWeakPackets.some((entry) => entry.draftability_status === "inferable_with_care"));
  const needsLocalAssumptions =
    mappedWeakPackets.some((entry) => entry.assumptions_needed.length > 0) ||
    notes.some((note) => note.toLowerCase().includes("contexto del proyecto"));
  const needsFollowupBeforeStrongDraft =
    readiness === "blocked" ||
    readiness === "baja" ||
    mappedReadinessEntries.some((entry) => entry.missing_elements.length > 0);
  const methodRelevance =
    input.semanticKey.includes("method") ||
    input.semanticKey.includes("analysis") ||
    input.semanticKey.includes("design") ||
    input.semanticKey.includes("population") ||
    input.semanticKey.includes("variables")
      ? "high"
      : mappedImportedKeys.includes("methodology") || mappedImportedKeys.includes("evaluation_criteria")
        ? "medium"
        : "low";
  const frameworkRelevance =
    input.semanticKey.includes("theoretical") ||
    input.semanticKey.includes("framework") ||
    input.semanticKey.includes("problem") ||
    input.semanticKey.includes("justification") ||
    input.semanticKey.includes("variables")
      ? "high"
      : mappedImportedKeys.includes("technical_framework") ||
          mappedImportedKeys.includes("evaluation_criteria")
        ? "medium"
        : "low";

  return {
    section_key: input.semanticKey,
    template_title: input.title,
    readiness,
    enough_to_draft: enoughToDraft,
    mapped_imported_section_keys: mappedImportedKeys,
    imported_source_ids: importedSourceIds,
    fixture_source_ids: unique(fixtureSourceIds),
    recommended_snippet_ids: clipList(unique(mappedPackets.flatMap((packet) => packet.snippet_ids)), 10),
    recommended_asset_keys: clipList(unique(mappedPackets.flatMap((packet) => packet.asset_keys)), 10),
    method_relevance: methodRelevance,
    framework_relevance: frameworkRelevance,
    needs_local_assumptions: needsLocalAssumptions,
    needs_followup_before_strong_draft: needsFollowupBeforeStrongDraft,
    generation_priority: mapping.generation_priority,
    generation_role: mapping.generation_role,
    direct_excerpt_count: directExcerptCount,
    asset_reference_count: assetReferenceCount,
    has_citable_original_excerpt: directExcerptCount > 0,
    has_critical_assets_candidate:
      assetReferenceCount > 0 || mappedPackets.some((packet) => packet.asset_keys.length > 0),
    dominant_evidence_types: dominantEvidenceTypes,
    dossier_summary: mappedPackets[0]?.summary ?? null,
    gap_labels: gapLabels,
    notes: clipList(notes, 6),
  };
}

async function resolveReadonlyHandoff(input: { state: BlueprintLaunchLocalState }) {
  const latestConsolidatedEvidencePath =
    input.state.consolidatedEvidenceArtifact?.latest_artifact_path ??
    ((await pathExists(LATEST_CONSOLIDATED_EVIDENCE_PATH))
      ? LATEST_CONSOLIDATED_EVIDENCE_PATH
      : null);
  const latestConsolidatedEvidence = await readJsonIfExists<ConsolidatedEvidenceArtifact>(
    latestConsolidatedEvidencePath,
  );
  const downstreamHandoffManifest =
    latestConsolidatedEvidence?.downstream_handoff_manifest ??
    input.state.consolidatedEvidenceArtifact?.downstream_handoff_manifest ??
    null;
  const materializedContentDir =
    input.state.contentMaterialization?.runDir ??
    (await resolveLatestRunDir(MATERIALIZED_CONTENT_ROOT));
  const extractedAssetsDir =
    input.state.sourceSignalExtraction?.runDir ??
    downstreamHandoffManifest?.source_signal_extraction_run_dir ??
    (await resolveLatestRunDir(EXTRACTED_ASSETS_ROOT));

  return {
    latestConsolidatedEvidencePath,
    latestConsolidatedEvidence,
    downstreamHandoffManifest,
    materializedContentDir,
    extractedAssetsDir,
  };
}

export async function buildMasterTemplateImportContextArtifact(input: {
  fixtures: LoadedMasterBlueprintLabFixtureSet;
  masterTemplate: MasterTemplateRuntime;
}): Promise<MasterTemplateImportContextArtifact> {
  const state = await readBlueprintLaunchLocalState();
  const archivedDebugPath = await resolveArchivedDebugPath();
  const readonlyHandoff = await resolveReadonlyHandoff({ state });
  const activeConsolidatedEvidence =
    readonlyHandoff.latestConsolidatedEvidence ?? state.consolidatedEvidenceArtifact;
  const warnings: string[] = [];

  if (!(await pathExists(REQUESTED_ARCHIVED_DEBUG_PATH))) {
    warnings.push(
      "La ruta archivada solicitada con sufijo 928Z no existe; el lab consumio el snapshot equivalente 927Z disponible en debug_runs.",
    );
  }

  if (!state.savedIntake || !activeConsolidatedEvidence || !state.evidencePacksArtifact) {
    return {
      artifact_type: "master_template_import_context",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      source_snapshot: {
        source_lab: "blueprint_launch",
        lab_state_path: LAB_STATE_PATH,
        latest_debug_path: LATEST_DEBUG_PATH,
        archived_debug_path: archivedDebugPath,
        selected_sources_path: SELECTED_SOURCES_PATH,
        latest_consolidated_evidence_path: readonlyHandoff.latestConsolidatedEvidencePath,
        downstream_handoff_manifest_path:
          readonlyHandoff.downstreamHandoffManifest?.consolidated_evidence_artifact_path ?? null,
        materialized_content_dir: readonlyHandoff.materializedContentDir,
        extracted_assets_dir: readonlyHandoff.extractedAssetsDir,
        resolved_materialized_run_id: extractRunId(readonlyHandoff.materializedContentDir),
        resolved_assets_run_id: extractRunId(readonlyHandoff.extractedAssetsDir),
        resolved_consolidated_run_id:
          extractRunId(readonlyHandoff.latestConsolidatedEvidence?.run_dir ?? null),
      },
      imported_project_context: {
        knowledge_area_label: null,
        topic: input.fixtures.project.intake.topic,
        problem_context: input.fixtures.project.intake.problemContext ?? null,
        research_line: input.fixtures.project.intake.researchLine ?? null,
        target_population: input.fixtures.project.intake.targetPopulation ?? null,
        preferred_methodology: input.fixtures.project.intake.preferredMethodology ?? null,
        academic_constraints: input.fixtures.project.intake.academicConstraints ?? null,
        advisor_notes: input.fixtures.project.intake.advisorNotes ?? null,
      },
      imported_evidence_context: {
        selected_source_count: 0,
        complete_public_count: 0,
        partial_public_count: 0,
        materialized_pdf_count: 0,
        materialized_web_count: 0,
        pack_count: 0,
        total_snippet_count: 0,
        total_asset_count: 0,
        equation_asset_count: 0,
        table_asset_count: 0,
        image_asset_count: 0,
        evidence_unit_count: 0,
        original_excerpt_count: 0,
        asset_reference_count: 0,
        interpreted_signal_count: 0,
        context_only_count: 0,
        section_dossier_count: 0,
        overall_readiness: null,
        quality_gate_status: null,
        baseline_comparison_status: null,
      },
      source_id_bridge: [],
      proposal_context: {
        method_candidate: null,
        framework_candidate: null,
        dominant_methods: [],
        dominant_frameworks: [],
        key_findings: [],
        evidence_gaps: [],
        followup_requirements: null,
      },
      section_input_packets: [],
      weak_section_completion_packets: [],
      source_priorities: [],
      section_alignment_map: input.masterTemplate.sections.map((section) => ({
        section_key: section.semantic_key,
        template_title: section.title,
        readiness: "unknown",
        enough_to_draft: false,
        mapped_imported_section_keys: [],
        imported_source_ids: [],
        fixture_source_ids: [],
        recommended_snippet_ids: [],
        recommended_asset_keys: [],
        method_relevance: "low",
        framework_relevance: "low",
        needs_local_assumptions: false,
        needs_followup_before_strong_draft: true,
        generation_priority: "middle",
        generation_role: "support",
        direct_excerpt_count: 0,
        asset_reference_count: 0,
        has_citable_original_excerpt: false,
        has_critical_assets_candidate: false,
        dominant_evidence_types: [],
        dossier_summary: null,
        gap_labels: [],
        notes: ["No se pudo leer el estado importado completo de blueprint_launch."],
      })),
      global_generation_hints: {
        knowledge_area_label: null,
        methodology_mode_hint: null,
        framework_priority_hint: null,
        case_context_strength: "low",
        local_regulatory_support: "low",
        title_refinement_expected: true,
        abstract_should_be_late: true,
        keywords_should_be_late: true,
        matrix_should_be_late: true,
      },
      imported_handoff_summary: {
        ready_for_steps_7_11: null,
        quality_gate_status: null,
        baseline_comparison_status: null,
        previous_lab_warnings: [],
        handoff_notes: [],
        traceability_warnings: [],
        unsupported_claims: [],
        read_only_input_paths: [],
        next_lab_should_read: [],
        next_lab_should_not_modify: [],
      },
      checks: {
        mapped_section_count: 0,
        unmapped_template_sections: input.masterTemplate.sections.map((section) => section.semantic_key),
        weak_sections: [],
        blocked_sections: [],
        missing_local_context: true,
        missing_regulatory_context: true,
        missing_technique_specific_support: true,
        selected_sources_match: false,
        stale_snapshot_detected: false,
      },
      warnings: [
        ...warnings,
        "El estado importado de blueprint_launch esta incompleto para contextualizar el paso 7.",
      ],
    };
  }

  const bridgeMap = buildBridgeMap({
    state,
    fixtures: input.fixtures,
    consolidatedEvidence: activeConsolidatedEvidence,
  });
  const { readinessMap, packetMap, weakMap } = getImportedSectionMaps(activeConsolidatedEvidence);
  const evidenceUnits =
    ((activeConsolidatedEvidence as { evidence_units?: ConsolidatedEvidenceUnit[] }).evidence_units ??
      []) as ConsolidatedEvidenceUnit[];
  const sectionAlignmentMap = input.masterTemplate.sections.map((section) =>
    buildSectionAlignmentEntry({
      semanticKey: section.semantic_key,
      title: section.title,
      state,
      fixtures: input.fixtures,
      bridgeMap,
      readinessMap,
      packetMap,
      weakMap,
      evidenceUnits,
    }),
  );
  const evidenceGaps = activeConsolidatedEvidence.evidence_gaps ?? [];
  const blockingFollowups = activeConsolidatedEvidence.followup_requirements?.blocking ?? [];
  const caseContextEntry = weakMap.get("case_context");
  const missingLocalContext =
    evidenceGaps.some((item) => /contexto local|contexto geografico|validacion local|caso local/i.test(item)) ||
    caseContextEntry?.draftability_status === "blocked_by_missing_evidence";
  const missingRegulatoryContext =
    blockingFollowups.some((item) => /zoning|building code|fire|egress|permisos|regulator/i.test(item));
  const missingTechniqueSpecificSupport =
    evidenceGaps.some((item) => /tecnica|metodo|method|validacion especifica|soporte tecnico/i.test(item)) ||
    blockingFollowups.some((item) => /tecnica|metodo|method|validacion especifica|soporte tecnico/i.test(item));
  const weakSections = sectionAlignmentMap
    .filter((entry) => entry.readiness === "baja")
    .map((entry) => entry.section_key);
  const blockedSections = sectionAlignmentMap
    .filter((entry) => entry.readiness === "blocked")
    .map((entry) => entry.section_key);
  const unmappedTemplateSections = sectionAlignmentMap
    .filter((entry) => entry.mapped_imported_section_keys.length === 0)
    .map((entry) => entry.section_key);
  const selectedSourceIds = new Set(
    (state.selectedSourcesBundle?.sources ?? []).map((item) => item.reference.id),
  );
  const prioritizedSourceIds = new Set(
    (activeConsolidatedEvidence.source_priorities ?? []).map((item) => item.source_id),
  );
  const selectedSourcesMatch =
    selectedSourceIds.size > 0 &&
    Array.from(selectedSourceIds).every((sourceId) => prioritizedSourceIds.has(sourceId));
  const staleSnapshotDetected =
    Boolean(readonlyHandoff.latestConsolidatedEvidence?.generated_at) &&
    readonlyHandoff.latestConsolidatedEvidence?.generated_at !==
      state.consolidatedEvidenceArtifact?.generated_at;
  const originalExcerptCount = evidenceUnits.filter(
    (unit) => unit.unit_type === "original_excerpt",
  ).length;
  const assetReferenceCount = evidenceUnits.filter((unit) =>
    ["table", "equation", "image"].includes(unit.unit_type),
  ).length;
  const interpretedSignalCount = evidenceUnits.filter(
    (unit) => unit.unit_type === "interpreted_signal",
  ).length;
  const contextOnlyCount = evidenceUnits.filter((unit) => unit.unit_type === "intake_context").length;

  return {
    artifact_type: "master_template_import_context",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    source_snapshot: {
      source_lab: "blueprint_launch",
      lab_state_path: LAB_STATE_PATH,
      latest_debug_path: LATEST_DEBUG_PATH,
      archived_debug_path: archivedDebugPath,
      selected_sources_path: SELECTED_SOURCES_PATH,
      latest_consolidated_evidence_path: readonlyHandoff.latestConsolidatedEvidencePath,
      downstream_handoff_manifest_path:
        readonlyHandoff.downstreamHandoffManifest?.consolidated_evidence_artifact_path ?? null,
      materialized_content_dir: readonlyHandoff.materializedContentDir,
      extracted_assets_dir: readonlyHandoff.extractedAssetsDir,
      resolved_materialized_run_id: extractRunId(readonlyHandoff.materializedContentDir),
      resolved_assets_run_id: extractRunId(readonlyHandoff.extractedAssetsDir),
      resolved_consolidated_run_id: extractRunId(activeConsolidatedEvidence.run_dir ?? null),
    },
    imported_project_context: {
      knowledge_area_label: state.savedIntake.projectContext.knowledgeAreaLabel ?? null,
      topic: state.savedIntake.intake.topic,
      problem_context: state.savedIntake.intake.problemContext ?? null,
      research_line: state.savedIntake.intake.researchLine ?? null,
      target_population: state.savedIntake.intake.targetPopulation ?? null,
      preferred_methodology: state.savedIntake.intake.preferredMethodology ?? null,
      academic_constraints: state.savedIntake.intake.academicConstraints ?? null,
      advisor_notes: state.savedIntake.intake.advisorNotes ?? null,
    },
    imported_evidence_context: {
      selected_source_count: state.selectedSourcesBundle?.selectedCount ?? 0,
      complete_public_count: state.sourceAccessResolution?.completePublicCount ?? 0,
      partial_public_count: state.sourceAccessResolution?.partialPublicCount ?? 0,
      materialized_pdf_count: state.contentMaterialization?.pdfCount ?? 0,
      materialized_web_count: state.contentMaterialization?.webCount ?? 0,
      pack_count: state.evidencePacksArtifact.packs.length,
      total_snippet_count: state.sourceSignalExtraction?.totalSnippetCount ?? 0,
      total_asset_count: state.sourceSignalExtraction?.totalAssetCount ?? 0,
      equation_asset_count: state.sourceSignalExtraction?.equationAssetCount ?? 0,
      table_asset_count: state.sourceSignalExtraction?.tableAssetCount ?? 0,
      image_asset_count: state.sourceSignalExtraction?.imageAssetCount ?? 0,
      evidence_unit_count: evidenceUnits.length,
      original_excerpt_count: originalExcerptCount,
      asset_reference_count: assetReferenceCount,
      interpreted_signal_count: interpretedSignalCount,
      context_only_count: contextOnlyCount,
      section_dossier_count: activeConsolidatedEvidence.section_input_packets?.length ?? 0,
      overall_readiness: activeConsolidatedEvidence.coverage_map?.overall_readiness ?? null,
      quality_gate_status: activeConsolidatedEvidence.quality_gate?.status ?? null,
      baseline_comparison_status: activeConsolidatedEvidence.quality_comparison?.status ?? null,
    },
    source_id_bridge: bridgeMap,
    proposal_context: {
      method_candidate: activeConsolidatedEvidence.proposal_method_candidate,
      framework_candidate: activeConsolidatedEvidence.proposal_framework_candidate,
      dominant_methods: activeConsolidatedEvidence.dominant_methods ?? [],
      dominant_frameworks: activeConsolidatedEvidence.dominant_frameworks ?? [],
      key_findings: activeConsolidatedEvidence.key_findings ?? [],
      evidence_gaps: evidenceGaps,
      followup_requirements: activeConsolidatedEvidence.followup_requirements ?? null,
    },
    section_input_packets: activeConsolidatedEvidence.section_input_packets ?? [],
    weak_section_completion_packets: activeConsolidatedEvidence.weak_section_completion_packets ?? [],
    source_priorities: activeConsolidatedEvidence.source_priorities ?? [],
    section_alignment_map: sectionAlignmentMap,
    global_generation_hints: {
      knowledge_area_label: state.savedIntake.projectContext.knowledgeAreaLabel ?? null,
      methodology_mode_hint:
        activeConsolidatedEvidence.proposal_method_candidate?.method_family ?? null,
      framework_priority_hint:
        activeConsolidatedEvidence.proposal_framework_candidate?.core_framework ?? null,
      case_context_strength: caseContextEntry?.draftability_status === "blocked_by_missing_evidence"
        ? "low"
        : missingLocalContext
        ? "low"
          : "medium",
      local_regulatory_support: missingRegulatoryContext ? "low" : "medium",
      title_refinement_expected: true,
      abstract_should_be_late: true,
      keywords_should_be_late: true,
      matrix_should_be_late: true,
    },
    imported_handoff_summary: {
      ready_for_steps_7_11: activeConsolidatedEvidence.quality_gate?.ready_for_steps_7_11 ?? null,
      quality_gate_status: activeConsolidatedEvidence.quality_gate?.status ?? null,
      baseline_comparison_status: activeConsolidatedEvidence.quality_comparison?.status ?? null,
      previous_lab_warnings: activeConsolidatedEvidence.warnings ?? [],
      handoff_notes: activeConsolidatedEvidence.quality_gate?.handoff_notes ?? [],
      traceability_warnings: activeConsolidatedEvidence.quality_gate?.traceability_warnings ?? [],
      unsupported_claims: activeConsolidatedEvidence.quality_gate?.unsupported_claims ?? [],
      read_only_input_paths:
        readonlyHandoff.downstreamHandoffManifest?.read_only_input_paths ??
        [
          LAB_STATE_PATH,
          readonlyHandoff.latestConsolidatedEvidencePath ?? "",
          readonlyHandoff.materializedContentDir,
          readonlyHandoff.extractedAssetsDir,
        ].filter(Boolean),
      next_lab_should_read: readonlyHandoff.downstreamHandoffManifest?.next_lab_should_read ?? [],
      next_lab_should_not_modify:
        readonlyHandoff.downstreamHandoffManifest?.next_lab_should_not_modify ?? [],
    },
    checks: {
      mapped_section_count: sectionAlignmentMap.filter(
        (entry) => entry.mapped_imported_section_keys.length > 0,
      ).length,
      unmapped_template_sections: unmappedTemplateSections,
      weak_sections: weakSections,
      blocked_sections: blockedSections,
      missing_local_context: missingLocalContext,
      missing_regulatory_context: missingRegulatoryContext,
      missing_technique_specific_support: missingTechniqueSpecificSupport,
      selected_sources_match: selectedSourcesMatch,
      stale_snapshot_detected: staleSnapshotDetected,
    },
    warnings: unique([
      ...warnings,
      ...(activeConsolidatedEvidence.warnings ?? []),
      ...(staleSnapshotDetected
        ? [
            "El consolidated evidence embebido en lab-state difiere del latest-consolidated-evidence.json; se priorizo el latest read-only.",
          ]
        : []),
      ...(!selectedSourcesMatch
        ? [
            "Las fuentes seleccionadas del estado no coinciden completamente con las prioridades del consolidado importado.",
          ]
        : []),
      ...(missingLocalContext
        ? ["El contexto local o geografico sigue debil o bloqueado en el estado importado del lab previo."]
        : []),
      ...(missingRegulatoryContext
        ? ["El soporte normativo local sigue incompleto para pasos 7-11."]
        : []),
      ...(missingTechniqueSpecificSupport
        ? ["La tecnica o enfoque central sigue necesitando validacion especifica externa al corpus importado."]
        : []),
    ]),
  };
}
