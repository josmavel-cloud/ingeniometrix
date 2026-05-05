import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getConfiguredLlmProvider } from "@/llm";
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
import {
  evaluateBlueprintProductionSafety,
  type ProductionSafetyEvaluation,
  validatePublicAppendixPolicyText,
} from "@/server/blueprint-engine/quality/production-safety";
import {
  applyReducedEvidencePackToHandoff,
  buildReducedEvidencePackFromHandoff,
  type ReducedEvidencePackV1,
} from "@/server/blueprint-engine/quality/evidence-budget";
import {
  buildFreshRunIsolationReport,
  buildStaleContentScanReport,
  collectStaleGuardSummary,
  type FreshRunIsolationReport,
  type StaleContentScanReport,
} from "@/server/blueprint-engine/quality/fresh-run-isolation";
import {
  buildCoarseStepTelemetry,
  buildRunTelemetryArtifact,
} from "@/server/blueprint-engine/quality/run-telemetry";
import { buildMethodSelectionForHandoff } from "@/server/blueprint-engine/quality/method-selection";
import {
  buildQualityDashboard,
  renderProductionReadinessReport,
} from "@/server/blueprint-engine/quality/production-readiness-dashboard";
import { buildLegacyBlueprintFromMaster } from "@/server/blueprint-v2/compose/blueprint-composition-engine";
import { deriveUniversityBlueprint } from "@/server/blueprint-v2/derivation/university-blueprint-derivation-engine";
import { buildEvidenceLedger } from "@/server/blueprint-v2/evidence/evidence-ledger-engine";
import {
  buildMasterAcademicDocument,
  buildUniversityAcademicDocument,
} from "@/server/blueprint-v2/lab/academic-document-compiler";
import { applyAcademicDocumentEditorialPass } from "@/server/blueprint-v2/lab/academic-document-editorial-pass";
import { applyAcademicHeroImageGeneration } from "@/server/blueprint-v2/lab/academic-document-hero-image";
import { applyAcademicDocumentLayoutPass } from "@/server/blueprint-v2/lab/academic-document-layout-pass";
import { applyAcademicDocumentPublicSanitizationPass } from "@/server/blueprint-v2/lab/academic-document-public-sanitizer";
import { validateDocxPackage } from "@/server/blueprint-v2/lab/docx-qa-engine";
import {
  renderMasterDocx,
  renderUniversityDocx,
} from "@/server/blueprint-v2/lab/docx-renderer";
import { buildPackageQualitySummary } from "@/server/blueprint-v2/lab/package-quality-summary";
import { planMasterTemplateSectionPromptsForLab } from "@/server/blueprint-v2/lab/prompt-planning-hybrid";
import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";
import type {
  MasterTemplateImportContextArtifact,
  TemplateImportSectionAlignmentEntry,
} from "@/server/blueprint-v2/lab/template-import-context";
import {
  buildLabBlueprintTemplateContext,
  buildMasterTemplateLatamRuntimeFixture,
  getLabUniversityTemplateRuntime,
} from "@/server/blueprint-v2/lab/template-fixtures";
import type {
  LoadedMasterBlueprintLabFixtureSet,
  MasterBlueprintSteps5To11LabResult,
} from "@/server/blueprint-v2/lab/types";
import {
  buildConsistencyMatrixArtifactFromSections,
  buildConsistencyMatrixArtifactFromSectionsWithLlm,
  type ConsistencyMatrixArtifact,
} from "@/server/blueprint-v2/sections/consistency-matrix-engine";
import {
  generateSectionDraftsForKeys,
  runSectionGenerationEngine,
} from "@/server/blueprint-v2/sections/section-generation-engine";
import { loadMasterTemplateRuntimeV2 } from "@/server/blueprint-v2/template/master-template-runtime";
import type {
  AssumptionInput,
  BlueprintSourceRecord,
  ConsistencyMatrixRow,
  DocumentProvenanceReport,
  EvidenceLedger,
  EvidenceSnippet,
  ExtractedEvidencePack,
  MasterBlueprintEngineProject,
  MasterBlueprintValidationReport,
  MasterSectionDraft,
  MasterTemplateRuntime,
  PdfAssetRecord,
  PdfDownloadRecord,
  PdfDownloadResult,
  SourceIntakeGateResult,
  UniversityBlueprintPackage,
} from "@/server/blueprint-v2/types";
import { buildDocumentProvenanceReport } from "@/server/blueprint-v2/validation/blueprint-provenance-engine";
import { validateMasterBlueprintPackage } from "@/server/blueprint-v2/validation/blueprint-validation-engine";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import { readLlmUsageRegistry, type LlmUsageTotals } from "@/server/llm-usage-registry";

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
  "lab-b-full-diagnostic-docx-runs",
);

type CliOptions = {
  handoffPath: string;
  caseId: string;
  outputRoot: string;
  allowDegradedHandoff: boolean;
  allowStaleContent: boolean;
  skipHeroImage: boolean;
  renderDocx: boolean;
  maxSections: number | null;
};

type IntakeFixture = {
  case_id?: string;
  case_name?: string;
  project_id?: string;
  user_id?: string;
  project_context?: {
    title?: string;
    degree_level?: string;
    university?: string;
    program?: string;
    knowledge_area_label?: string;
    template_key?: string;
    country?: string;
    language?: string;
  };
  intake?: {
    topic?: string;
    problemContext?: string;
    researchLine?: string;
    academicConstraints?: string;
    targetPopulation?: string;
    availableData?: string;
    preferredMethodology?: string;
    advisorNotes?: string;
  };
  source_policy?: {
    min_selected_sources?: number;
    max_selected_sources?: number;
  };
};

type CompanionArtifacts = {
  run_summary: Record<string, unknown> | null;
  intake_fixture: IntakeFixture | null;
  selected_source_bundle: Record<string, unknown> | null;
  source_selection: Record<string, unknown> | null;
  step_2_access_resolution: Record<string, unknown> | null;
  step_3_evidence_planning: Record<string, unknown> | null;
  step_4_materialization_manifest: Record<string, unknown> | null;
  step_5_signal_extraction_summary: Record<string, unknown> | null;
  step_6_consolidated_evidence: Record<string, unknown> | null;
  quality_assessment_exists: boolean;
};

type DegradedInputWarnings = {
  source: "lab_b_full_diagnostic_docx";
  generated_at: string;
  diagnostic_only: true;
  degraded_handoff: true;
  allow_blocked_upstream: boolean;
  usable_for_lab_b_diagnostic: boolean;
  usable_for_production: false;
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
    materialized_source_count: number | null;
    unsupported_claim_count: number | null;
    metadata_or_intake_direct_quote_count: number;
    adjacent_energy_dissipator_source_count: number;
    handoff_warning_count: number;
  };
};

type FullDiagnosticSummary = {
  status: "completed" | "blocked" | "failed";
  case_id: string;
  handoff_id: string | null;
  project_id: string | null;
  schema_compatible: boolean;
  diagnostic_compatible: boolean;
  production_eligible: boolean;
  diagnostic_only: true;
  production_valid: false;
  degraded_handoff: true;
  allow_degraded_handoff: boolean;
  production_ineligibility_reasons: string[];
  fresh_run_isolation_passed: boolean;
  fresh_run_isolation_warnings: string[];
  stale_content_detected: boolean;
  stale_content_blockers: string[];
  stale_content_warnings: string[];
  stale_asset_ref_count: number;
  stale_source_ref_count: number;
  stale_topic_marker_count: number;
  mutable_latest_path_count: number;
  completed_steps: string[];
  quality_gate_status: string | null;
  source_count: number;
  evidence_unit_count: number;
  section_count: number;
  generated_docx_count: number;
  master_docx_path: string | null;
  institutional_docx_path: string | null;
  openai_called: boolean;
  token_cost_usage: {
    before: LlmUsageTotals | null;
    after: LlmUsageTotals | null;
    delta: LlmUsageTotals | null;
  };
  warnings: string[];
  blockers: string[];
  output_folder: string;
};

function emptyStaleGuardSummary() {
  return collectStaleGuardSummary({
    freshRunIsolation: null,
    staleContentScan: null,
  });
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    handoffPath: DEFAULT_HANDOFF_PATH,
    caseId: DEFAULT_CASE_ID,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    allowDegradedHandoff: false,
    allowStaleContent: false,
    skipHeroImage: false,
    renderDocx: true,
    maxSections: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--handoff" && next) {
      options.handoffPath = path.isAbsolute(next) ? next : path.join(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--case" && next) {
      options.caseId = next;
      index += 1;
      continue;
    }

    if (arg === "--output-root" && next) {
      options.outputRoot = path.isAbsolute(next) ? next : path.join(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--allow-degraded-handoff") {
      options.allowDegradedHandoff = true;
      continue;
    }

    if (arg === "--allow-stale-content") {
      options.allowStaleContent = true;
      continue;
    }

    if (arg === "--skip-hero-image") {
      options.skipHeroImage = true;
      continue;
    }

    if (arg === "--no-docx") {
      options.renderDocx = false;
      continue;
    }

    if (arg === "--max-sections" && next) {
      const parsed = Number.parseInt(next, 10);
      options.maxSections = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      index += 1;
    }
  }

  return options;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return readJson<T>(filePath);
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, value: string) {
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

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown) {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function asNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBooleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
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

function clip(value: string | null | undefined, max = 420) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }

  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function normalizeTitle(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function templateKeyForProject(value: string | null | undefined) {
  const key = (value ?? "").toUpperCase();
  if (key.includes("UPC")) return "UPC_POSGRADO";
  if (key.includes("UCV")) return "UCV_POSGRADO";
  if (key.includes("USMP")) return "USMP_POSGRADO";
  return "GENERIC_POSGRADO_PE";
}

function loadCompanionArtifacts(handoffPath: string): CompanionArtifacts {
  const runFolder = path.dirname(handoffPath);

  return {
    run_summary: readJsonIfExists<Record<string, unknown>>(path.join(runFolder, "run-summary.json")),
    intake_fixture: readJsonIfExists<IntakeFixture>(path.join(runFolder, "intake-fixture.json")),
    selected_source_bundle: readJsonIfExists<Record<string, unknown>>(
      path.join(runFolder, "selected-source-bundle.json"),
    ),
    source_selection: readJsonIfExists<Record<string, unknown>>(path.join(runFolder, "source-selection.json")),
    step_2_access_resolution: readJsonIfExists<Record<string, unknown>>(
      path.join(runFolder, "step-2-access-resolution.json"),
    ),
    step_3_evidence_planning: readJsonIfExists<Record<string, unknown>>(
      path.join(runFolder, "step-3-evidence-planning.json"),
    ),
    step_4_materialization_manifest: readJsonIfExists<Record<string, unknown>>(
      path.join(runFolder, "step-4-materialization-manifest.json"),
    ),
    step_5_signal_extraction_summary: readJsonIfExists<Record<string, unknown>>(
      path.join(runFolder, "step-5-signal-extraction-summary.json"),
    ),
    step_6_consolidated_evidence: readJsonIfExists<Record<string, unknown>>(
      path.join(runFolder, "step-6-consolidated-evidence.json"),
    ),
    quality_assessment_exists: existsSync(path.join(runFolder, "QUALITY_ASSESSMENT_DIAGNOSTIC_RUN.md")),
  };
}

function getSourceAccessItems(companion: CompanionArtifacts) {
  const access = asRecord(companion.step_2_access_resolution?.source_access_resolution);
  return asArray(access.items).map(asRecord);
}

function getMaterializationItems(companion: CompanionArtifacts) {
  return asArray(companion.step_4_materialization_manifest?.items).map(asRecord);
}

function getStep6QualityGate(companion: CompanionArtifacts) {
  return asRecord(companion.step_6_consolidated_evidence?.quality_gate);
}

function getSelectedReferenceIds(companion: CompanionArtifacts, handoff: EvidenceEngineHandoffV1) {
  return unique([
    ...asStringArray(companion.source_selection?.selected_reference_ids),
    ...asStringArray(companion.run_summary?.selected_reference_ids),
    ...handoff.source_registry.map((source) => source.reference_id ?? source.source_id),
  ]);
}

function buildSourceMetadataMap(companion: CompanionArtifacts) {
  const map = new Map<string, Record<string, unknown>>();
  const selectedSources = asArray(companion.selected_source_bundle?.sources).map(asRecord);

  for (const selectedSource of selectedSources) {
    const reference = asRecord(selectedSource.reference);
    const id = asString(reference.id);
    if (id) {
      map.set(id, {
        ...reference,
        selectedOrder: selectedSource.selectedOrder,
        relevanceScore: selectedSource.relevanceScore,
        scoreLabel: selectedSource.scoreLabel,
      });
    }
  }

  return map;
}

function buildSourceRegistry(
  handoff: EvidenceEngineHandoffV1,
  companion: CompanionArtifacts,
): BlueprintSourceRecord[] {
  const metadataById = buildSourceMetadataMap(companion);

  return handoff.source_registry.map((source, index) => {
    const reference = metadataById.get(source.reference_id ?? source.source_id) ?? {};
    const doi = source.doi ?? asNullableString(reference.doi);
    const authors = source.authors.length > 0
      ? source.authors
      : asStringArray(reference.authorsJson ?? reference.authors);
    const landingPageUrl =
      source.landing_page_url ?? asNullableString(reference.landingPageUrl) ?? null;
    const pdfUrl = source.pdf_url ?? asNullableString(reference.pdfUrl) ?? null;

    return {
      source_id: source.source_id,
      reference_id: source.reference_id ?? source.source_id,
      origin: "selected_source",
      label: `Fuente ${source.selected_order ?? index + 1}`,
      title: source.title,
      normalized_title: normalizeTitle(source.title),
      doi,
      authors,
      year: source.year ?? asNumberOrNull(reference.year),
      venue: source.venue ?? asNullableString(reference.venue),
      abstract: asNullableString(reference.abstract) ?? null,
      landing_page_url: landingPageUrl,
      pdf_url: pdfUrl,
      query: null,
      snippet: null,
      selected_order: source.selected_order ?? index + 1,
      citation_count: null,
      is_open_access: source.is_open_access || Boolean(pdfUrl),
      raw_openalex_json: null,
      raw_crossref_json: null,
      eligible_for_formal_reference: source.eligible_for_formal_reference,
    };
  });
}

function sourceHasPdfMaterialization(companion: CompanionArtifacts, sourceId: string) {
  return getMaterializationItems(companion).some(
    (item) => asString(item.sourceId) === sourceId && asString(item.storedKind) === "pdf",
  );
}

function originForEvidenceUnit(input: {
  evidenceId: string;
  label: string;
  unitType: string;
  sourceId: string;
  companion: CompanionArtifacts;
}): EvidenceSnippet["origin"] {
  const joined = `${input.evidenceId} ${input.label}`.toLowerCase();

  if (joined.includes("intake") || input.sourceId.startsWith("intake:")) {
    return "intake";
  }

  if (input.unitType === "context_only") {
    return "assumption_backed";
  }

  if (sourceHasPdfMaterialization(input.companion, input.sourceId)) {
    return "pdf";
  }

  return "source";
}

function buildEvidenceSnippets(
  handoff: EvidenceEngineHandoffV1,
  companion: CompanionArtifacts,
): EvidenceSnippet[] {
  return handoff.evidence_units
    .map((unit): EvidenceSnippet | null => {
      const text =
        unit.original_text ??
        unit.summary_es ??
        unit.caption ??
        (unit.asset_key ? `Asset ${unit.asset_key}` : null);

      if (!text?.trim()) {
        return null;
      }

      return {
        snippet_id: unit.evidence_id,
        source_id: unit.source_id,
        origin: originForEvidenceUnit({
          evidenceId: unit.evidence_id,
          label: unit.label,
          unitType: unit.unit_type,
          sourceId: unit.source_id,
          companion,
        }),
        label: unit.label,
        text,
        section_hint_keys: unit.section_keys,
        confidence: Math.max(0, Math.min(1, unit.confidence)),
      };
    })
    .filter((snippet): snippet is EvidenceSnippet => Boolean(snippet));
}

function normalizeAssetKind(kind: string): PdfAssetRecord["kind"] {
  if (kind === "table" || kind === "equation") {
    return kind;
  }

  return "image";
}

function absoluteLocalPath(uri: string | null | undefined) {
  if (!uri) {
    return null;
  }

  return path.isAbsolute(uri) ? uri : path.join(process.cwd(), uri);
}

function buildAssetRecords(handoff: EvidenceEngineHandoffV1): PdfAssetRecord[] {
  return handoff.asset_registry.map((asset) => {
    const filePath = absoluteLocalPath(asset.file_ref?.uri ?? null);
    return {
      source_id: asset.source_id,
      asset_key: asset.asset_key,
      title: asset.title ?? asset.asset_key,
      kind: normalizeAssetKind(asset.asset_kind),
      caption: asset.caption ?? asset.usage_reason,
      page_number: asset.page_number,
      file_path: filePath,
      mime_type: asset.mime_type,
      width_px: asset.width_px,
      height_px: asset.height_px,
      text_content: asset.text_content ?? asset.latex ?? asset.handling_notes.join("\n"),
      extraction_origin: filePath ? "pdf_native" : "llm_reconstructed",
      extracted: Boolean(filePath && existsSync(filePath)),
    };
  });
}

function bestEvidenceTextForSection(
  units: EvidenceEngineHandoffV1["evidence_units"],
  sectionKeys: string[],
) {
  const match = units.find((unit) =>
    unit.section_keys.some((sectionKey) => sectionKeys.includes(sectionKey)) &&
    Boolean(unit.summary_es ?? unit.original_text),
  );

  return clip(match?.summary_es ?? match?.original_text ?? null, 900);
}

function buildEvidencePacks(input: {
  handoff: EvidenceEngineHandoffV1;
  sourceRegistry: BlueprintSourceRecord[];
  snippets: EvidenceSnippet[];
  assets: PdfAssetRecord[];
}): ExtractedEvidencePack[] {
  return input.sourceRegistry.map((source) => {
    const units = input.handoff.evidence_units.filter((unit) => unit.source_id === source.source_id);
    const snippets = input.snippets.filter((snippet) => snippet.source_id === source.source_id);
    const assets = input.assets.filter((asset) => asset.source_id === source.source_id);

    return {
      source_id: source.source_id,
      problem_signal: bestEvidenceTextForSection(units, ["problem_statement", "background"]),
      method_signal: bestEvidenceTextForSection(units, ["methodology", "evaluation_criteria"]),
      context_signal: bestEvidenceTextForSection(units, ["case_context", "background"]),
      finding_signal: bestEvidenceTextForSection(units, ["findings_support", "evaluation_criteria"]),
      limitation_signal: bestEvidenceTextForSection(units, ["limitations"]),
      future_line_signal: bestEvidenceTextForSection(units, ["future_work"]),
      abstract_summary: clip(source.abstract, 900),
      pdf_summary: units.length > 0
        ? `Fuente importada desde EvidenceEngineHandoffV1 con ${units.length} unidades de evidencia.`
        : null,
      pdf_sections: {
        abstract: clip(source.abstract, 1200),
        methodology: bestEvidenceTextForSection(units, ["methodology"]),
        results: bestEvidenceTextForSection(units, ["findings_support"]),
        conclusions: bestEvidenceTextForSection(units, ["justification", "limitations"]),
        limitations: bestEvidenceTextForSection(units, ["limitations"]),
        future_work: bestEvidenceTextForSection(units, ["future_work"]),
      },
      snippets,
      assets,
    };
  });
}

function buildAssumptions(
  handoff: EvidenceEngineHandoffV1,
  degradedWarnings: DegradedInputWarnings,
): AssumptionInput[] {
  const imported = handoff.assumptions.map((assumption) => ({
    assumption_id: assumption.assumption_id,
    statement: assumption.statement,
    reason: assumption.reason,
    section_keys: assumption.section_keys,
  }));
  const diagnosticAssumptions: AssumptionInput[] = [
    {
      assumption_id: "diagnostic-degraded-handoff",
      statement:
        "Esta corrida usa un handoff degradado para diagnostico; toda redaccion debe declarar vacios, limitaciones y caracter no productivo.",
      reason: "Preservar el contexto de --allow-blocked y production_valid=false.",
      section_keys: [],
    },
    ...degradedWarnings.warnings.slice(0, 6).map((warning, index) => ({
      assumption_id: `diagnostic-warning-${index + 1}`,
      statement: warning,
      reason: "Advertencia importada para evitar sobreafirmaciones en Lab B.",
      section_keys: [],
    })),
  ];

  return [...imported, ...diagnosticAssumptions];
}

function buildAssumptionSnippets(assumptions: AssumptionInput[]): EvidenceSnippet[] {
  return assumptions.map((assumption) => ({
    snippet_id: `assumption-snippet:${assumption.assumption_id}`,
    source_id: null,
    origin: "assumption_backed",
    label: assumption.assumption_id,
    text: assumption.statement,
    section_hint_keys: assumption.section_keys,
    confidence: 0.5,
  }));
}

function buildPdfDownloads(companion: CompanionArtifacts): PdfDownloadResult {
  const records: PdfDownloadRecord[] = getMaterializationItems(companion).map((item) => {
    const storedKind = asString(item.storedKind);
    const status = asString(item.materializationStatus);
    return {
      source_id: asString(item.sourceId),
      title: asString(item.title),
      pdf_url: asNullableString(item.resolvedContentUrl),
      resolved_pdf_url: storedKind === "pdf" ? asNullableString(item.resolvedContentUrl) : null,
      access_strategy: storedKind === "pdf" ? "direct_pdf_url" : null,
      http_status: null,
      status: status === "downloaded" ? "downloaded" : status === "failed" ? "failed" : "skipped",
      reason: asStringArray(item.warnings).join(" | ") || null,
      stored_file_path: asNullableString(item.localPrimaryPath),
      file_size_bytes: asNumberOrNull(item.byteSize),
    };
  });

  return {
    records,
    warnings: unique(getMaterializationItems(companion).flatMap((item) => asStringArray(item.warnings))),
  };
}

function buildSourceGate(input: {
  companion: CompanionArtifacts;
  sourceRegistry: BlueprintSourceRecord[];
  degradedWarnings: DegradedInputWarnings;
}): SourceIntakeGateResult {
  const sourceIntakeGate = asRecord(input.companion.step_2_access_resolution?.source_intake_gate);
  const minSources =
    input.companion.intake_fixture?.source_policy?.min_selected_sources ??
    asNumberOrNull(sourceIntakeGate.minimum_required_sources) ??
    4;
  const selectedCount = input.sourceRegistry.length;

  return {
    minimum_required_sources: minSources,
    selected_source_count: selectedCount,
    missing_source_count: Math.max(0, minSources - selectedCount),
    fallback_required:
      input.degradedWarnings.signals.production_valid === false ||
      input.degradedWarnings.signals.step_3_decision === "BLOCK" ||
      input.degradedWarnings.signals.low_source_count,
    coverage_warnings: input.degradedWarnings.warnings,
    selected_sources: input.sourceRegistry,
  };
}

function buildProject(input: {
  handoff: EvidenceEngineHandoffV1;
  blueprintInput: BlueprintEngineInputV1;
  companion: CompanionArtifacts;
}): MasterBlueprintEngineProject {
  const fixture = input.companion.intake_fixture;
  const projectContext = fixture?.project_context;
  const intake = fixture?.intake;
  const projectId = fixture?.project_id ?? input.handoff.project_id;
  const now = new Date();
  const project = {
    id: projectId,
    userId: fixture?.user_id ?? input.blueprintInput.run_request.user_id,
    title:
      projectContext?.title ??
      input.handoff.project_context.normalized_problem_core ??
      input.handoff.project_context.topic,
    degreeLevel:
      projectContext?.degree_level ??
      input.handoff.project_context.degree_level ??
      "maestria",
    university:
      projectContext?.university ??
      input.handoff.project_context.university ??
      "Universidad por confirmar",
    program:
      projectContext?.program ??
      input.handoff.project_context.academic_program ??
      "Programa por confirmar",
    templateKey: templateKeyForProject(projectContext?.template_key ?? input.handoff.project_context.target_template_key),
    evidence_handoff_id: input.handoff.handoff_id,
    evidence_run_id: input.handoff.evidence_run_id,
    immutable_snapshot_hash: input.handoff.traceability.immutable_snapshot_hash,
    source_health_summary: [
      `${input.handoff.source_registry.length} fuentes seleccionadas`,
      `${input.handoff.source_registry.filter((source) => source.materialization_refs.extracted_text_refs.length > 0 || source.materialization_refs.chunk_refs.length > 0 || source.materialization_refs.pdf_refs.length > 0).length} fuentes materializadas`,
      `${input.handoff.quality_gate.status} en quality gate`,
    ].join("; "),
    createdAt: now,
    updatedAt: now,
    intake: {
      id: `${projectId}:intake`,
      projectId,
      topic: intake?.topic ?? input.handoff.project_context.topic,
      problemContext:
        intake?.problemContext ??
        input.handoff.project_context.problem_context ??
        input.handoff.project_context.retrieval_brief,
      researchLine: intake?.researchLine ?? input.handoff.project_context.research_line,
      academicConstraints: intake?.academicConstraints ?? input.handoff.project_context.constraints,
      targetPopulation: intake?.targetPopulation ?? input.handoff.project_context.population_or_context,
      availableData: intake?.availableData ?? null,
      preferredMethodology:
        intake?.preferredMethodology ?? input.handoff.project_context.methodology_preference,
      advisorNotes: intake?.advisorNotes ?? input.handoff.project_context.advisor_or_user_notes,
      searchQuery: null,
      createdAt: now,
      updatedAt: now,
    },
    projectReferences: [],
    blueprintVersions: [],
  };

  return project as unknown as MasterBlueprintEngineProject;
}

function buildEvidenceLedgerFromHandoff(input: {
  handoff: EvidenceEngineHandoffV1;
  sourceRegistry: BlueprintSourceRecord[];
  companion: CompanionArtifacts;
  degradedWarnings: DegradedInputWarnings;
}) {
  const snippets = buildEvidenceSnippets(input.handoff, input.companion);
  const assets = buildAssetRecords(input.handoff);
  const evidencePacks = buildEvidencePacks({
    handoff: input.handoff,
    sourceRegistry: input.sourceRegistry,
    snippets,
    assets,
  });
  const assumptions = buildAssumptions(input.handoff, input.degradedWarnings);
  const ledger = buildEvidenceLedger({
    sourceRegistry: input.sourceRegistry,
    evidencePacks,
    assumptions,
    assumptionSnippets: buildAssumptionSnippets(assumptions),
    warnings: input.degradedWarnings.warnings,
  });

  return {
    evidencePacks,
    ledger,
  };
}

function buildFixtureSet(input: {
  caseId: string;
  outputFolder: string;
  project: MasterBlueprintEngineProject;
  sourceRegistry: BlueprintSourceRecord[];
  companion: CompanionArtifacts;
  degradedWarnings: DegradedInputWarnings;
  evidencePacks: ExtractedEvidencePack[];
  evidenceLedger: EvidenceLedger;
}): LoadedMasterBlueprintLabFixtureSet {
  const sourceGate = buildSourceGate({
    companion: input.companion,
    sourceRegistry: input.sourceRegistry,
    degradedWarnings: input.degradedWarnings,
  });
  const pdfDownloads = buildPdfDownloads(input.companion);

  return {
    caseName: input.caseId,
    fixtureDir: input.outputFolder,
    project: input.project,
    sourceGate,
    acquisition: {
      target_source_count: input.sourceRegistry.length,
      source_registry: input.sourceRegistry,
      provider_expansion_sources: [],
      websearch_sources: [],
      decisions: input.sourceRegistry.map((source) => ({
        source_id: source.source_id,
        accepted: true,
        reason: "Seleccion humana importada desde EvidenceEngineHandoffV1 diagnostic run.",
        origin: "selected_source",
        query: null,
      })),
      warnings: input.degradedWarnings.warnings,
    },
    pdfDownloads,
    evidencePacks: input.evidencePacks,
    evidenceLedger: input.evidenceLedger,
  };
}

function countMetadataOrIntakeDirectQuotes(handoff: EvidenceEngineHandoffV1) {
  return handoff.evidence_units.filter((unit) => {
    const joined = `${unit.evidence_id} ${unit.label}`.toLowerCase();
    return unit.citation_eligibility === "direct_quote" &&
      (joined.includes("intake") || joined.includes("titulo") || joined.includes("title"));
  }).length;
}

function buildDegradedInputWarnings(input: {
  handoff: EvidenceEngineHandoffV1;
  companion: CompanionArtifacts;
}) {
  const accessItems = getSourceAccessItems(input.companion);
  const materializationItems = getMaterializationItems(input.companion);
  const step3Decision = asString(input.companion.step_3_evidence_planning?.decision, "");
  const qualityGate = getStep6QualityGate(input.companion);
  const unsupportedClaimCount = asArray(qualityGate.unsupported_claims).length;
  const allowBlocked = asBooleanOrNull(input.companion.run_summary?.allow_blocked);
  const productionValid = asBooleanOrNull(input.companion.run_summary?.production_valid);
  const metadataOnlyCount = accessItems.filter(
    (item) => asString(item.status) === "metadata_only" || asString(item.kind) === "abstract_only",
  ).length;
  const unresolvedSourceCount = accessItems.filter((item) => asString(item.status) === "unresolved").length;
  const materializedSourceCount = materializationItems.filter(
    (item) => asString(item.materializationStatus) === "downloaded",
  ).length;
  const adjacentEnergyDissipatorSourceCount = input.handoff.source_registry.filter((source) =>
    /dissipator|disipador/i.test(source.title),
  ).length;
  const warnings = unique([
    ...input.handoff.warnings,
    ...input.handoff.quality_gate.warnings,
    ...asStringArray(input.companion.run_summary?.warnings),
    ...asStringArray(input.companion.step_3_evidence_planning?.warnings),
    ...(allowBlocked === true
      ? ["Source run used --allow-blocked; downstream output is diagnostic only."]
      : []),
    ...(productionValid === false ? ["Source run marked production_valid=false."] : []),
    ...(input.handoff.quality_gate.status !== "pass"
      ? [`Evidence handoff quality_gate.status=${input.handoff.quality_gate.status}.`]
      : []),
    ...(input.handoff.source_registry.length <= 4
      ? [`Low source count for production-quality generation: ${input.handoff.source_registry.length}.`]
      : []),
    ...(metadataOnlyCount > 0
      ? [`${metadataOnlyCount} source(s) were metadata/abstract-only in Step 2.`]
      : []),
    ...(unresolvedSourceCount > 0
      ? [`${unresolvedSourceCount} source(s) were unresolved in Step 2.`]
      : []),
    ...(materializedSourceCount < input.handoff.source_registry.length
      ? [`Only ${materializedSourceCount} of ${input.handoff.source_registry.length} source(s) were materialized.`]
      : []),
    ...(step3Decision === "BLOCK" ? ["Companion Step 3 evidence planning decision was BLOCK."] : []),
    ...(unsupportedClaimCount > 0
      ? [`${unsupportedClaimCount} unsupported claim warning(s) were present in Step 6.`]
      : []),
    ...(countMetadataOrIntakeDirectQuotes(input.handoff) > 0
      ? [
          `${countMetadataOrIntakeDirectQuotes(input.handoff)} direct_quote unit(s) appear to be metadata/intake/title snippets; citation support may be inflated.`,
        ]
      : []),
    ...(adjacentEnergyDissipatorSourceCount > 0
      ? [
          `${adjacentEnergyDissipatorSourceCount} source(s) concern adjacent energy-dissipator evidence; do not use as direct isolator evidence.`,
        ]
      : []),
  ]);

  return {
    source: "lab_b_full_diagnostic_docx",
    generated_at: new Date().toISOString(),
    diagnostic_only: true,
    degraded_handoff: true,
    allow_blocked_upstream: allowBlocked === true,
    usable_for_lab_b_diagnostic: true,
    usable_for_production: false,
    warnings,
    blockers: unique(input.handoff.quality_gate.blockers),
    signals: {
      allow_blocked: allowBlocked,
      production_valid: productionValid,
      blocked_at_step: asNullableString(input.companion.run_summary?.blocked_at_step),
      step_3_decision: step3Decision || null,
      quality_gate_status: input.handoff.quality_gate.status,
      readiness: input.handoff.readiness,
      low_source_count: input.handoff.source_registry.length <= 4,
      metadata_or_abstract_only_source_count: metadataOnlyCount,
      unresolved_source_count: unresolvedSourceCount,
      materialized_source_count: materializationItems.length > 0 ? materializedSourceCount : null,
      unsupported_claim_count: unsupportedClaimCount || null,
      metadata_or_intake_direct_quote_count: countMetadataOrIntakeDirectQuotes(input.handoff),
      adjacent_energy_dissipator_source_count: adjacentEnergyDissipatorSourceCount,
      handoff_warning_count: input.handoff.warnings.length,
    },
  } satisfies DegradedInputWarnings;
}

const SECTION_IMPORT_MAP: Record<string, string[]> = {
  abstract: ["background", "problem_statement", "methodology", "findings_support", "limitations"],
  keywords: ["theoretical_framework", "technical_framework", "methodology"],
  introduction: ["background", "case_context"],
  problem_statement: ["problem_statement", "case_context"],
  research_questions: ["problem_statement", "methodology", "evaluation_criteria"],
  general_research_question: ["problem_statement", "methodology"],
  specific_research_questions: ["problem_statement", "evaluation_criteria", "methodology"],
  justification: ["justification", "problem_statement", "findings_support"],
  theoretical_justification: ["justification", "theoretical_framework"],
  practical_justification: ["justification", "findings_support"],
  methodological_justification: ["justification", "methodology", "evaluation_criteria"],
  objectives: ["problem_statement", "evaluation_criteria", "methodology"],
  general_objective: ["problem_statement", "methodology"],
  specific_objectives: ["problem_statement", "evaluation_criteria", "methodology"],
  hypotheses: ["methodology", "findings_support"],
  general_hypothesis: ["methodology", "findings_support"],
  specific_hypotheses: ["methodology", "findings_support", "evaluation_criteria"],
  theoretical_framework: ["theoretical_framework", "technical_framework", "background"],
  research_antecedents: ["theoretical_framework", "background"],
  state_of_the_art: ["theoretical_framework", "background", "findings_support"],
  theoretical_bases: ["technical_framework", "theoretical_framework"],
  terms_definition: ["technical_framework", "theoretical_framework"],
  consistency_matrix: ["problem_statement", "methodology", "evaluation_criteria"],
  variables_or_categories: ["evaluation_criteria", "technical_framework", "methodology"],
  variables_indicators: ["evaluation_criteria", "methodology"],
  categories_subcategories: ["evaluation_criteria", "methodology"],
  methodology: ["methodology", "evaluation_criteria", "technical_framework"],
  methodological_approach: ["methodology"],
  research_design: ["methodology", "evaluation_criteria"],
  population_and_sample: ["methodology", "case_context"],
  data_collection_techniques: ["methodology", "evaluation_criteria"],
  research_instruments: ["methodology", "evaluation_criteria"],
  research_procedure: ["methodology", "evaluation_criteria"],
  analysis_plan: ["methodology", "evaluation_criteria", "findings_support"],
  ethics: ["methodology", "limitations"],
  scope_and_limitations: ["limitations", "case_context"],
  schedule: ["methodology"],
  budget: ["methodology"],
  references: ["theoretical_framework", "technical_framework", "methodology"],
  annexes: ["technical_framework", "evaluation_criteria", "findings_support"],
};

function resolveMappedImportedKeys(sectionKey: string, handoff: EvidenceEngineHandoffV1) {
  const available = new Set(handoff.section_packets.map((packet) => packet.section_key));
  const mapped = SECTION_IMPORT_MAP[sectionKey] ?? [sectionKey];
  const exact = available.has(sectionKey) ? [sectionKey] : [];

  return unique([...exact, ...mapped.filter((key) => available.has(key))]);
}

function readinessRank(readiness: EvidenceEngineHandoffV1["readiness"]) {
  switch (readiness) {
    case "blocked":
      return 0;
    case "baja":
      return 1;
    case "media":
      return 2;
    case "alta":
      return 3;
  }
}

function resolveAlignmentReadiness(
  packets: EvidenceEngineHandoffV1["section_packets"],
  fallback: EvidenceEngineHandoffV1["readiness"],
) {
  if (packets.length === 0) {
    return fallback;
  }

  return packets
    .map((packet) => packet.readiness)
    .sort((left, right) => readinessRank(left) - readinessRank(right))[0];
}

function buildSectionAlignmentMap(input: {
  handoff: EvidenceEngineHandoffV1;
  masterTemplate: MasterTemplateRuntime;
}): TemplateImportSectionAlignmentEntry[] {
  const packetByKey = new Map(input.handoff.section_packets.map((packet) => [packet.section_key, packet]));
  const unitById = new Map(input.handoff.evidence_units.map((unit) => [unit.evidence_id, unit]));

  return input.masterTemplate.sections.map((section) => {
    const mappedKeys = resolveMappedImportedKeys(section.semantic_key, input.handoff);
    const packets = mappedKeys
      .map((key) => packetByKey.get(key))
      .filter((packet): packet is EvidenceEngineHandoffV1["section_packets"][number] => Boolean(packet));
    const evidenceUnits = packets
      .flatMap((packet) => packet.evidence_ids)
      .map((id) => unitById.get(id))
      .filter((unit): unit is EvidenceEngineHandoffV1["evidence_units"][number] => Boolean(unit));
    const sourceIds = unique(packets.flatMap((packet) => packet.source_ids));
    const snippetIds = unique(packets.flatMap((packet) => packet.snippet_ids));
    const assetKeys = unique(packets.flatMap((packet) => packet.asset_keys));
    const readiness = resolveAlignmentReadiness(packets, input.handoff.readiness);
    const missing = unique(packets.flatMap((packet) => packet.missing_elements));
    const doNotClaim = unique(packets.flatMap((packet) => packet.do_not_claim));
    const directExcerptCount = evidenceUnits.filter((unit) => unit.unit_type === "original_excerpt").length;
    const assetReferenceCount = evidenceUnits.filter((unit) =>
      ["table", "image", "equation"].includes(unit.unit_type),
    ).length;
    const generationRole =
      section.semantic_key === "abstract" || section.semantic_key === "keywords" || section.semantic_key === "references"
        ? "final"
        : section.semantic_key.includes("method") || section.semantic_key.includes("variables")
          ? "method"
          : section.semantic_key.includes("limitations") || section.semantic_key.includes("ethics")
            ? "closure"
            : section.semantic_key.includes("theoretical") || section.semantic_key.includes("framework")
              ? "support"
              : "context";
    const generationPriority =
      generationRole === "final"
        ? "late"
        : generationRole === "context"
          ? "early"
          : "middle";

    return {
      section_key: section.semantic_key,
      template_title: section.title,
      readiness,
      enough_to_draft: readiness !== "blocked" && (snippetIds.length > 0 || sourceIds.length > 0),
      mapped_imported_section_keys: mappedKeys,
      imported_source_ids: sourceIds,
      fixture_source_ids: sourceIds,
      recommended_snippet_ids: snippetIds.slice(0, 10),
      recommended_asset_keys: assetKeys.slice(0, 10),
      method_relevance:
        mappedKeys.includes("methodology") || mappedKeys.includes("evaluation_criteria") ? "high" : "medium",
      framework_relevance:
        mappedKeys.includes("theoretical_framework") || mappedKeys.includes("technical_framework")
          ? "high"
          : "medium",
      needs_local_assumptions: missing.length > 0 || input.handoff.quality_gate.status !== "pass",
      needs_followup_before_strong_draft:
        input.handoff.quality_gate.status !== "pass" || missing.length > 0 || doNotClaim.length > 0,
      generation_priority: generationPriority,
      generation_role: generationRole,
      direct_excerpt_count: directExcerptCount,
      asset_reference_count: assetReferenceCount,
      has_citable_original_excerpt: directExcerptCount > 0,
      has_critical_assets_candidate: assetKeys.length > 0,
      dominant_evidence_types: unique(evidenceUnits.map((unit) => unit.unit_type)),
      dossier_summary: packets[0]?.summary ?? null,
      gap_labels: unique([...missing, ...doNotClaim]).slice(0, 8),
      notes: unique([
        ...packets.flatMap((packet) => packet.open_questions),
        ...doNotClaim.map((item) => `No afirmar: ${item}`),
      ]).slice(0, 6),
    };
  });
}

function priorityForSourcePriority(value: unknown) {
  const record = asRecord(value);
  const priority = asString(record.priority, "media");
  if (priority === "alta" || priority === "media" || priority === "baja") {
    return priority;
  }

  return "media";
}

function sourcePriorityRecords(handoff: EvidenceEngineHandoffV1) {
  const sourcePriorities = handoff.source_priorities.length > 0
    ? handoff.source_priorities
    : handoff.source_registry.map((source) => ({
        source_id: source.source_id,
        title: source.title,
        priority: "media",
        reason: "Fallback priority generated from EvidenceEngineHandoffV1 source_registry.",
      }));

  return sourcePriorities.map((item) => {
    const record = asRecord(item);
    return {
      ...record,
      source_id: asString(record.source_id),
      title: asString(record.title),
      priority: priorityForSourcePriority(record),
      reason: asString(record.reason, "Imported from EvidenceEngineHandoffV1."),
    };
  });
}

function buildStep7ImportContext(input: {
  handoff: EvidenceEngineHandoffV1;
  blueprintInput: BlueprintEngineInputV1;
  masterTemplate: MasterTemplateRuntime;
  companion: CompanionArtifacts;
  degradedWarnings: DegradedInputWarnings;
}): MasterTemplateImportContextArtifact {
  const materializedPdfCount = getMaterializationItems(input.companion).filter(
    (item) => asString(item.storedKind) === "pdf",
  ).length;
  const accessItems = getSourceAccessItems(input.companion);
  const sectionAlignmentMap = buildSectionAlignmentMap({
    handoff: input.handoff,
    masterTemplate: input.masterTemplate,
  });
  const importedContext = {
    knowledge_area_label: input.companion.intake_fixture?.project_context?.knowledge_area_label ?? null,
    topic: input.handoff.project_context.topic,
    problem_context:
      input.companion.intake_fixture?.intake?.problemContext ??
      input.handoff.project_context.problem_context ??
      input.handoff.project_context.retrieval_brief ??
      null,
    research_line:
      input.companion.intake_fixture?.intake?.researchLine ??
      input.handoff.project_context.research_line ??
      null,
    target_population:
      input.companion.intake_fixture?.intake?.targetPopulation ??
      input.handoff.project_context.population_or_context ??
      null,
    preferred_methodology:
      input.companion.intake_fixture?.intake?.preferredMethodology ??
      input.handoff.project_context.methodology_preference ??
      null,
    academic_constraints:
      input.companion.intake_fixture?.intake?.academicConstraints ??
      input.handoff.project_context.constraints ??
      null,
    advisor_notes:
      input.companion.intake_fixture?.intake?.advisorNotes ??
      input.handoff.project_context.advisor_or_user_notes ??
      null,
  };

  return {
    artifact_type: "master_template_import_context",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    source_snapshot: {
      source_lab: "blueprint_launch",
      lab_state_path: "not-used:diagnostic-contract-input",
      latest_debug_path: "not-used:diagnostic-contract-input",
      archived_debug_path: null,
      selected_sources_path: "not-used:diagnostic-contract-input",
      latest_consolidated_evidence_path: null,
      downstream_handoff_manifest_path: input.handoff.traceability.source_artifacts[0]?.uri ?? null,
      materialized_content_dir: path.dirname(
        asString(getMaterializationItems(input.companion)[0]?.localPrimaryPath, ""),
      ),
      extracted_assets_dir: "not-used:diagnostic-contract-input",
      resolved_materialized_run_id: null,
      resolved_assets_run_id: null,
      resolved_consolidated_run_id: null,
    },
    imported_project_context: importedContext,
    imported_evidence_context: {
      selected_source_count: input.handoff.source_registry.length,
      complete_public_count: accessItems.filter((item) => asString(item.status) === "complete_public").length,
      partial_public_count: accessItems.filter((item) => asString(item.status) === "partial_public").length,
      materialized_pdf_count: materializedPdfCount,
      materialized_web_count: getMaterializationItems(input.companion).filter(
        (item) => asString(item.storedKind) === "html" || asString(item.storedKind) === "web",
      ).length,
      pack_count: input.handoff.source_registry.length,
      total_snippet_count: input.handoff.evidence_units.length,
      total_asset_count: input.handoff.asset_registry.length,
      equation_asset_count: input.handoff.asset_registry.filter((asset) => asset.asset_kind === "equation").length,
      table_asset_count: input.handoff.asset_registry.filter((asset) => asset.asset_kind === "table").length,
      image_asset_count: input.handoff.asset_registry.filter((asset) =>
        asset.asset_kind === "image" || asset.asset_kind === "figure",
      ).length,
      evidence_unit_count: input.handoff.evidence_units.length,
      original_excerpt_count: input.handoff.evidence_units.filter((unit) => unit.unit_type === "original_excerpt").length,
      asset_reference_count: input.handoff.evidence_units.filter((unit) =>
        ["table", "image", "equation"].includes(unit.unit_type),
      ).length,
      interpreted_signal_count: input.handoff.evidence_units.filter((unit) => unit.unit_type === "interpreted_signal").length,
      context_only_count: input.handoff.evidence_units.filter((unit) => unit.unit_type === "context_only").length,
      section_dossier_count: input.handoff.section_packets.length,
      overall_readiness: input.handoff.readiness,
      quality_gate_status: input.handoff.quality_gate.status === "blocked" ? "block" : input.handoff.quality_gate.status,
      baseline_comparison_status: "warn",
    },
    source_id_bridge: input.handoff.source_registry.map((source) => ({
      imported_source_id: source.source_id,
      fixture_source_id: source.source_id,
      title: source.title,
      materialized_source_available: sourceHasPdfMaterialization(input.companion, source.source_id),
      materialized_primary_path:
        asNullableString(
          getMaterializationItems(input.companion).find((item) => asString(item.sourceId) === source.source_id)
            ?.localPrimaryPath,
        ) ?? null,
      materialized_text_path:
        asNullableString(
          getMaterializationItems(input.companion).find((item) => asString(item.sourceId) === source.source_id)
            ?.localTextPath,
        ) ?? null,
      imported_asset_count: input.handoff.asset_registry.filter((asset) => asset.source_id === source.source_id).length,
      imported_direct_excerpt_count: input.handoff.evidence_units.filter(
        (unit) => unit.source_id === source.source_id && unit.citation_eligibility === "direct_quote",
      ).length,
      has_pdf_materialization: sourceHasPdfMaterialization(input.companion, source.source_id),
      top_section_keys: unique(
        input.handoff.evidence_units
          .filter((unit) => unit.source_id === source.source_id)
          .flatMap((unit) => unit.section_keys),
      ).slice(0, 6),
    })),
    proposal_context: {
      method_candidate: input.handoff.proposal_context.method_candidate as never,
      framework_candidate: input.handoff.proposal_context.framework_candidate as never,
      dominant_methods: input.handoff.proposal_context.dominant_methods as never,
      dominant_frameworks: input.handoff.proposal_context.dominant_frameworks as never,
      key_findings: input.handoff.proposal_context.key_findings as never,
      evidence_gaps: input.handoff.proposal_context.evidence_gaps,
      followup_requirements: input.handoff.proposal_context.followup_requirements as never,
    },
    section_input_packets: input.handoff.section_packets as never,
    weak_section_completion_packets: input.handoff.weak_section_packets as never,
    source_priorities: sourcePriorityRecords(input.handoff) as never,
    section_alignment_map: sectionAlignmentMap,
    global_generation_hints: {
      knowledge_area_label: importedContext.knowledge_area_label,
      methodology_mode_hint: asNullableString(asRecord(input.handoff.proposal_context.method_candidate).method_family),
      framework_priority_hint: asNullableString(asRecord(input.handoff.proposal_context.framework_candidate).core_framework),
      case_context_strength: "low",
      local_regulatory_support: "low",
      title_refinement_expected: true,
      abstract_should_be_late: true,
      keywords_should_be_late: true,
      matrix_should_be_late: true,
    },
    imported_handoff_summary: {
      ready_for_steps_7_11: true,
      quality_gate_status: input.handoff.quality_gate.status === "blocked" ? "block" : input.handoff.quality_gate.status,
      baseline_comparison_status: "warn",
      previous_lab_warnings: input.degradedWarnings.warnings,
      handoff_notes: [
        "diagnostic_only=true",
        "production_valid=false",
        "degraded_handoff=true",
      ],
      traceability_warnings: input.handoff.quality_gate.warnings,
      unsupported_claims: asStringArray(getStep6QualityGate(input.companion).unsupported_claims),
      read_only_input_paths: [
        ...input.handoff.traceability.source_artifacts.map((artifact) => artifact.uri),
        ...input.handoff.source_snapshot.map((artifact) => artifact.uri),
      ],
      next_lab_should_read: ["EvidenceEngineHandoffV1", "BlueprintEngineInputV1"],
      next_lab_should_not_modify: [
        "source artifacts",
        "candidate search artifacts",
        "Lab A runtime folders",
      ],
    },
    checks: {
      mapped_section_count: sectionAlignmentMap.filter((entry) => entry.mapped_imported_section_keys.length > 0).length,
      unmapped_template_sections: sectionAlignmentMap
        .filter((entry) => entry.mapped_imported_section_keys.length === 0)
        .map((entry) => entry.section_key),
      weak_sections: sectionAlignmentMap.filter((entry) => entry.readiness === "baja").map((entry) => entry.section_key),
      blocked_sections: sectionAlignmentMap
        .filter((entry) => entry.readiness === "blocked")
        .map((entry) => entry.section_key),
      missing_local_context: true,
      missing_regulatory_context: true,
      missing_technique_specific_support: false,
      selected_sources_match: true,
      stale_snapshot_detected: false,
    },
    warnings: input.degradedWarnings.warnings,
  };
}

async function loadMasterTemplateRuntimeForDiagnostic(warnings: string[]) {
  try {
    return await loadMasterTemplateRuntimeV2();
  } catch (error) {
    warnings.push(
      `No se pudo cargar MASTER_TEMPLATE_LATAM desde BD; se uso fixture local: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    );
    return buildMasterTemplateLatamRuntimeFixture();
  }
}

function buildMatrixDraft(input: {
  drafts: MasterSectionDraft[];
  matrixArtifact: ConsistencyMatrixArtifact;
}): MasterSectionDraft {
  return {
    section_key: "consistency_matrix",
    title: "Matriz de consistencia",
    phase: "matrix",
    content: input.matrixArtifact.specific_rows
      .map(
        (row) =>
          `${row.row_id ?? `OE${row.index}`}. Interrogante: ${row.interrogante_especifica ?? "Por precisar"} | Objetivo: ${row.objetivo_especifico ?? "Por precisar"} | Hipotesis: ${row.hipotesis_especifica ?? "Por precisar"}`,
      )
      .join("\n"),
    content_kind: "table",
    support_level: "reference_supported",
    supported_source_ids: unique(input.drafts.flatMap((draft) => draft.supported_source_ids)),
    supported_pdf_source_ids: unique(input.drafts.flatMap((draft) => draft.supported_pdf_source_ids)),
    supported_web_source_ids: unique(input.drafts.flatMap((draft) => draft.supported_web_source_ids)),
    supported_assumption_ids: unique(input.drafts.flatMap((draft) => draft.supported_assumption_ids)),
    evidence_snippet_ids: unique(input.drafts.flatMap((draft) => draft.evidence_snippet_ids)),
    warnings: input.matrixArtifact.validation.warnings,
    prompt:
      "Compuesta desde consistencyMatrixArtifact para corrida diagnostica full DOCX.",
  };
}

function zeroUsageDelta(): LlmUsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    costCad: 0,
  };
}

function diffUsage(after: LlmUsageTotals | null, before: LlmUsageTotals | null): LlmUsageTotals | null {
  if (!after || !before) {
    return null;
  }

  return {
    calls: after.calls - before.calls,
    inputTokens: after.inputTokens - before.inputTokens,
    cachedInputTokens: after.cachedInputTokens - before.cachedInputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    totalTokens: after.totalTokens - before.totalTokens,
    costUsd: Number((after.costUsd - before.costUsd).toFixed(6)),
    costCad: Number((after.costCad - before.costCad).toFixed(6)),
  };
}

function writeRunAnalyticsArtifacts(input: {
  outputFolder: string;
  runId: string;
  caseId: string;
  handoff: EvidenceEngineHandoffV1 | null;
  reducedEvidencePack?: ReducedEvidencePackV1 | null;
  productionSafety?: ProductionSafetyEvaluation | null;
  completedSteps: string[];
  startedAt: string;
  completedAt: string;
  usageDelta: LlmUsageTotals | null;
  modelNames?: string[];
  sectionCount?: number | null;
  docxQaScore?: number | null;
  masterQa?: Record<string, unknown> | null;
  universityQa?: Record<string, unknown> | null;
  provenanceReport?: unknown;
  packageQualitySummary?: unknown;
  freshRunIsolation?: FreshRunIsolationReport | null;
  staleContentScan?: StaleContentScanReport | null;
  warnings: string[];
  blockers: string[];
}) {
  const runTelemetry = buildRunTelemetryArtifact({
    run_id: input.runId,
    case_id: input.caseId,
    handoff: input.handoff,
    pipeline_stage: "blueprint_engine",
    started_at: input.startedAt,
    completed_at: input.completedAt,
    usage_delta: input.usageDelta,
    model_names: input.modelNames,
    reduced_evidence_pack: input.reducedEvidencePack,
    section_count: input.sectionCount,
    docx_qa_score: input.docxQaScore,
    production_eligible: input.productionSafety?.production_eligible ?? false,
    diagnostic_compatible: input.productionSafety?.diagnostic_compatible ?? false,
    warning_count: input.warnings.length,
    blocker_count: input.blockers.length,
  });
  const stepTelemetry = buildCoarseStepTelemetry({
    run_id: input.runId,
    completed_steps: input.completedSteps,
    pipeline_stage: "blueprint_engine",
    started_at: input.startedAt,
    completed_at: input.completedAt,
    usage_delta: input.usageDelta,
    source_count: input.handoff?.source_registry.length ?? null,
    usable_full_text_source_count:
      input.productionSafety?.counts.usable_full_text_sources ?? null,
    evidence_unit_count: input.handoff?.evidence_units.length ?? null,
    reduced_evidence_unit_count:
      input.reducedEvidencePack?.reduced_counts.evidence_units ?? null,
    direct_quote_count:
      input.productionSafety?.counts.true_source_backed_direct_quote_count ?? null,
    section_count: input.sectionCount ?? null,
    docx_qa_score: input.docxQaScore ?? null,
    production_eligible: input.productionSafety?.production_eligible ?? null,
    diagnostic_compatible: input.productionSafety?.diagnostic_compatible ?? null,
    warning_count: input.warnings.length,
    blocker_count: input.blockers.length,
    model_names: input.modelNames,
  });
  const dashboard = buildQualityDashboard({
    run_id: input.runId,
    case_id: input.caseId,
    handoff: input.handoff,
    production_safety: input.productionSafety ?? null,
    reduced_evidence_pack: input.reducedEvidencePack ?? null,
    run_telemetry: runTelemetry,
    provenance_report: input.provenanceReport,
    package_quality_summary: input.packageQualitySummary,
    master_docx_qa: input.masterQa,
    institutional_docx_qa: input.universityQa,
    fresh_run_isolation: input.freshRunIsolation ?? null,
    stale_content_scan: input.staleContentScan ?? null,
    warnings: input.warnings,
    blockers: input.blockers,
  });

  writeJson(path.join(input.outputFolder, "run-telemetry.json"), runTelemetry);
  writeJson(path.join(input.outputFolder, "step-telemetry.json"), stepTelemetry);
  writeJson(path.join(input.outputFolder, "quality-dashboard.json"), dashboard);
  writeText(
    path.join(input.outputFolder, "production-readiness-report.md"),
    renderProductionReadinessReport(dashboard),
  );
}

function legacyRowsFromMatrix(matrixArtifact: ConsistencyMatrixArtifact): ConsistencyMatrixRow[] {
  return matrixArtifact.legacy_rows;
}

function buildLabResult(input: {
  fixtures: LoadedMasterBlueprintLabFixtureSet;
  masterTemplate: MasterTemplateRuntime;
  promptPlan: MasterBlueprintSteps5To11LabResult["section_prompt_plan"];
  draftsWithMatrix: MasterSectionDraft[];
  consistencyMatrix: ConsistencyMatrixRow[];
  provenanceReport: DocumentProvenanceReport;
  validationReport: MasterBlueprintValidationReport;
  coherenceReport: MasterBlueprintSteps5To11LabResult["coherence_report"];
  legacyBlueprint: ResearchBlueprintRecord;
  universityBlueprint: UniversityBlueprintPackage;
  packageQualitySummary: ReturnType<typeof buildPackageQualitySummary>;
  providerName: string | null;
  modelName: string | null;
}): MasterBlueprintSteps5To11LabResult {
  return {
    fixture_case: input.fixtures.caseName,
    master_template_key: input.masterTemplate.template_key,
    execution: {
      llm_enabled: true,
      llm_policy: "required",
      provider_name: input.providerName,
      model_name: input.modelName,
      fallback_sections_count: input.draftsWithMatrix.filter((draft) => draft.fallback_cause).length,
    },
    source_gate: input.fixtures.sourceGate,
    acquisition: input.fixtures.acquisition,
    pdf_downloads: input.fixtures.pdfDownloads,
    evidence_ledger: input.fixtures.evidenceLedger,
    master_template: input.masterTemplate,
    section_prompt_plan: input.promptPlan,
    master_section_drafts: input.draftsWithMatrix,
    consistency_matrix: input.consistencyMatrix,
    provenance_report: input.provenanceReport,
    validation_report: input.validationReport,
    package_quality_summary: input.packageQualitySummary,
    coherence_report: input.coherenceReport,
    legacy_blueprint: input.legacyBlueprint,
    university_blueprint: input.universityBlueprint,
    fixture_checks: {
      evidence_pack_source_ids: input.fixtures.evidencePacks.map((pack) => pack.source_id),
      ledger_source_ids: input.fixtures.evidenceLedger.source_registry.map((source) => source.source_id),
      assumption_snippet_count: input.fixtures.evidenceLedger.snippets.filter(
        (snippet) => snippet.origin === "assumption_backed",
      ).length,
      rebuilt_ledger_matches_fixture: true,
    },
  };
}

function collectDraftWarnings(drafts: MasterSectionDraft[]) {
  return unique(
    drafts.flatMap((draft) => draft.warnings.map((warning) => `${draft.section_key}: ${warning}`)),
  );
}

function collectPublicAppendixText(document: AcademicDocument) {
  const annexKeys = new Set(document.editorial_plan.annex_section_keys);
  const sectionsText = document.sections
    .filter((section) => annexKeys.has(section.section_key) || section.section_key === "annexes")
    .flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) =>
        block.block_type === "table"
          ? [
              block.caption ?? "",
              ...block.rows.flat(),
            ]
          : [block.text],
      ),
      ...section.warnings,
    ]);

  return unique([
    document.layout_plan.public_annex_policy.include_internal_traceability
      ? "include_internal_traceability=true"
      : "",
    ...sectionsText,
  ]).join("\n");
}

function assessReportSignals(input: {
  handoff: EvidenceEngineHandoffV1;
  drafts: MasterSectionDraft[];
  validationReport: MasterBlueprintValidationReport | null;
  matrixArtifact: ConsistencyMatrixArtifact | null;
  masterQa: Record<string, unknown> | null;
  universityQa: Record<string, unknown> | null;
  degradedWarnings: DegradedInputWarnings;
}) {
  const allDraftText = input.drafts.map((draft) => draft.content).join("\n").toLowerCase();
  return {
    warning_propagation_ok:
      input.degradedWarnings.warnings.some((warning) => /production_valid=false/i.test(warning)) ||
      input.degradedWarnings.signals.production_valid === false,
    likely_overclaims:
      /demuestra|garantiza|concluyente|definitiv|superioridad general|viabilidad total/.test(allDraftText),
    sections_preserve_gaps_or_limitations:
      /limitacion|limitaciones|vacio|pendiente|validar|prudente/.test(allDraftText),
    citations_traceable:
      input.drafts.every((draft) => draft.section_key === "consistency_matrix" || draft.supported_source_ids.length > 0),
    metadata_only_overuse_risk:
      input.degradedWarnings.signals.metadata_or_intake_direct_quote_count > 0,
    adjacent_energy_dissipator_misuse_risk:
      input.degradedWarnings.signals.adjacent_energy_dissipator_source_count > 0 &&
      /disipador|dissipator/.test(allDraftText) &&
      /aislador|aislamiento/.test(allDraftText),
    matrix_status: input.matrixArtifact?.status ?? null,
    validation_passed: input.validationReport?.quality_report.passed ?? null,
    master_docx_qa_passed: typeof input.masterQa?.passed === "boolean" ? input.masterQa.passed : null,
    university_docx_qa_passed: typeof input.universityQa?.passed === "boolean" ? input.universityQa.passed : null,
  };
}

function renderDiagnosticReport(input: {
  summary: FullDiagnosticSummary;
  degradedWarnings: DegradedInputWarnings;
  labCompatibility: unknown;
  reportSignals: ReturnType<typeof assessReportSignals>;
  masterDocxPath: string | null;
  universityDocxPath: string | null;
  masterQa: Record<string, unknown> | null;
  universityQa: Record<string, unknown> | null;
}) {
  const warningLines = input.summary.warnings.length
    ? input.summary.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- None.";
  const blockerLines = input.summary.blockers.length
    ? input.summary.blockers.map((blocker) => `- ${blocker}`).join("\n")
    : "- None.";
  const formatQaScore = (qa: Record<string, unknown> | null) =>
    typeof qa?.score_100 === "number" ? String(qa.score_100) : "not_available";

  return `# Lab B Full Diagnostic DOCX Report

Run status: ${input.summary.status}

Case: ${input.summary.case_id}

Handoff: ${input.summary.handoff_id}

Project: ${input.summary.project_id}

## Input Handoff Quality

- schema_compatible: ${input.summary.schema_compatible}
- diagnostic_compatible: ${input.summary.diagnostic_compatible}
- production_eligible: ${input.summary.production_eligible}
- diagnostic_only: true
- production_valid: false
- degraded_handoff: true
- allow_blocked_upstream: ${input.degradedWarnings.allow_blocked_upstream}
- quality_gate_status: ${input.summary.quality_gate_status}
- sources: ${input.summary.source_count}
- evidence units: ${input.summary.evidence_unit_count}
- Step 3 decision: ${input.degradedWarnings.signals.step_3_decision ?? "unknown"}
- materialized sources: ${input.degradedWarnings.signals.materialized_source_count ?? "unknown"}
- fresh_run_isolation_passed: ${input.summary.fresh_run_isolation_passed}
- stale_content_detected: ${input.summary.stale_content_detected}
- mutable_latest_path_count: ${input.summary.mutable_latest_path_count}
- stale_source_ref_count: ${input.summary.stale_source_ref_count}
- stale_asset_ref_count: ${input.summary.stale_asset_ref_count}
- stale_topic_marker_count: ${input.summary.stale_topic_marker_count}

## Fresh-Run Isolation

- severe blockers: ${input.summary.stale_content_blockers.length}
- warnings: ${input.summary.stale_content_warnings.length}
- severe stale content blocks DOCX unless --allow-stale-content is explicitly passed.

## Production Ineligibility

${input.summary.production_ineligibility_reasons.length > 0 ? input.summary.production_ineligibility_reasons.map((reason) => `- ${reason}`).join("\n") : "- None."}

## Warning Propagation Check

- warning_propagation_ok: ${input.reportSignals.warning_propagation_ok}
- low source count warning surfaced: ${input.degradedWarnings.signals.low_source_count}
- metadata/intake quote risk surfaced: ${input.degradedWarnings.signals.metadata_or_intake_direct_quote_count > 0}
- unsupported claim warnings surfaced: ${Boolean(input.degradedWarnings.signals.unsupported_claim_count)}

## Semantic Diagnostic Checks

- likely_overclaims: ${input.reportSignals.likely_overclaims}
- sections_preserve_gaps_or_limitations: ${input.reportSignals.sections_preserve_gaps_or_limitations}
- citations_traceable: ${input.reportSignals.citations_traceable}
- metadata_only_overuse_risk: ${input.reportSignals.metadata_only_overuse_risk}
- adjacent_energy_dissipator_misuse_risk: ${input.reportSignals.adjacent_energy_dissipator_misuse_risk}
- consistency_matrix_status: ${input.reportSignals.matrix_status ?? "not_available"}
- validation_passed: ${input.reportSignals.validation_passed ?? "not_available"}

## DOCX Render Status

- generated_docx_count: ${input.summary.generated_docx_count}
- master_docx_path: ${input.masterDocxPath ?? "not_generated"}
- institutional_docx_path: ${input.universityDocxPath ?? "not_generated"}
- master_docx_qa_passed: ${input.reportSignals.master_docx_qa_passed ?? "not_available"}
- institutional_docx_qa_passed: ${input.reportSignals.university_docx_qa_passed ?? "not_available"}
- master_docx_qa_score: ${formatQaScore(input.masterQa)}
- institutional_docx_qa_score: ${formatQaScore(input.universityQa)}

## Warnings

${warningLines}

## Blockers

${blockerLines}

## Final Verdict

- usable_for_diagnostic_review: ${input.summary.status === "completed" && input.summary.generated_docx_count > 0}
- usable_for_production: false

Recommended next action: review both DOCX files as degraded diagnostic outputs, focusing on overclaims, limitations, citation traceability, and misuse of adjacent dissipator evidence before any production pathway is considered.
`;
}

async function runDiagnostic(options: CliOptions) {
  const timestamp = timestampForPath();
  const runStartedAt = new Date().toISOString();
  const outputFolder = path.join(options.outputRoot, options.caseId, timestamp);
  const warnings: string[] = [];
  const blockers: string[] = [];
  const completedSteps: string[] = [];
  mkdirSync(outputFolder, { recursive: true });

  const usageBefore = await readLlmUsageRegistry().then((registry) => registry.cumulative).catch(() => null);
  const rawHandoff = readJson<unknown>(options.handoffPath);
  writeJson(path.join(outputFolder, "evidence-handoff-v1.json"), rawHandoff);

  const handoffValidation = evidenceEngineHandoffV1Schema.safeParse(rawHandoff);
  if (!handoffValidation.success) {
    blockers.push("EvidenceEngineHandoffV1 validation failed.");
    blockers.push(...handoffValidation.error.issues.slice(0, 20).map((issue) => issue.message));
    const summary: FullDiagnosticSummary = {
      status: "blocked",
      case_id: options.caseId,
      handoff_id: null,
      project_id: null,
      schema_compatible: false,
      diagnostic_compatible: false,
      production_eligible: false,
      diagnostic_only: true,
      production_valid: false,
      degraded_handoff: true,
      allow_degraded_handoff: options.allowDegradedHandoff,
      production_ineligibility_reasons: [
        "EvidenceEngineHandoffV1 validation failed.",
      ],
      fresh_run_isolation_passed: false,
      fresh_run_isolation_warnings: [],
      ...emptyStaleGuardSummary(),
      completed_steps: [],
      quality_gate_status: null,
      source_count: 0,
      evidence_unit_count: 0,
      section_count: 0,
      generated_docx_count: 0,
      master_docx_path: null,
      institutional_docx_path: null,
      openai_called: false,
      token_cost_usage: { before: usageBefore, after: null, delta: null },
      warnings,
      blockers,
      output_folder: outputFolder,
    };
    writeRunAnalyticsArtifacts({
      outputFolder,
      runId: `lab-b-full-diagnostic-invalid-${timestamp}`,
      caseId: options.caseId,
      handoff: null,
      reducedEvidencePack: null,
      productionSafety: null,
      completedSteps,
      startedAt: runStartedAt,
      completedAt: new Date().toISOString(),
      usageDelta: zeroUsageDelta(),
      modelNames: [],
      sectionCount: 0,
      docxQaScore: null,
      freshRunIsolation: null,
      staleContentScan: null,
      warnings: unique(warnings),
      blockers: unique(blockers),
    });
    writeJson(path.join(outputFolder, "full-diagnostic-summary.json"), summary);
    writeText(
      path.join(outputFolder, "LAB_B_FULL_DIAGNOSTIC_DOCX_REPORT.md"),
      renderDiagnosticReport({
        summary,
        degradedWarnings: {
          source: "lab_b_full_diagnostic_docx",
          generated_at: new Date().toISOString(),
          diagnostic_only: true,
          degraded_handoff: true,
          allow_blocked_upstream: false,
          usable_for_lab_b_diagnostic: false,
          usable_for_production: false,
          warnings,
          blockers,
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
            materialized_source_count: null,
            unsupported_claim_count: null,
            metadata_or_intake_direct_quote_count: 0,
            adjacent_energy_dissipator_source_count: 0,
            handoff_warning_count: 0,
          },
        },
        labCompatibility: null,
        reportSignals: {
          warning_propagation_ok: false,
          likely_overclaims: false,
          sections_preserve_gaps_or_limitations: false,
          citations_traceable: false,
          metadata_only_overuse_risk: false,
          adjacent_energy_dissipator_misuse_risk: false,
          matrix_status: null,
          validation_passed: null,
          master_docx_qa_passed: null,
          university_docx_qa_passed: null,
        },
        masterDocxPath: null,
        universityDocxPath: null,
        masterQa: null,
        universityQa: null,
      }),
    );
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  const handoff = handoffValidation.data as EvidenceEngineHandoffV1;
  const reducedEvidencePack = buildReducedEvidencePackFromHandoff(handoff);
  const reducedHandoffForPrompting = applyReducedEvidencePackToHandoff(handoff, reducedEvidencePack);
  writeJson(path.join(outputFolder, "reduced-evidence-pack.json"), reducedEvidencePack);
  const companion = loadCompanionArtifacts(options.handoffPath);
  const degradedWarnings = buildDegradedInputWarnings({ handoff, companion });
  warnings.push(...degradedWarnings.warnings);
  blockers.push(...degradedWarnings.blockers);

  const degraded =
    degradedWarnings.signals.production_valid === false ||
    degradedWarnings.signals.allow_blocked === true ||
    handoff.quality_gate.status !== "pass" ||
    degradedWarnings.signals.step_3_decision === "BLOCK";

  if (degraded && !options.allowDegradedHandoff) {
    blockers.push("Refusing to run degraded handoff without --allow-degraded-handoff.");
  }

  const blueprintInput = buildBlueprintEngineInputFromEvidenceHandoffV1(handoff, {
    blueprintRunId: `lab-b-full-diagnostic-${handoff.handoff_id}-${timestamp}`,
    executionMode: "full",
    targetSteps: options.renderDocx ? [7, 8, 9, 10, 11, 12, 13] : [7, 8, 9, 10, 11],
    generationOptions: {
      allow_llm: true,
      require_llm_for_sections: true,
      model_policy: "default",
      use_prompt_cache: true,
      reuse_cached_artifacts: false,
    },
  });
  const blueprintValidation = blueprintEngineInputV1Schema.safeParse(blueprintInput);
  if (!blueprintValidation.success) {
    blockers.push("BlueprintEngineInputV1 validation failed.");
    blockers.push(...blueprintValidation.error.issues.slice(0, 20).map((issue) => issue.message));
  }
  writeJson(path.join(outputFolder, "blueprint-engine-input.json"), blueprintInput);
  writeJson(path.join(outputFolder, "degraded-input-warnings.json"), degradedWarnings);

  const compatibility = blueprintValidation.success
    ? inspectBlueprintInputForCurrentLabB(blueprintInput).compatibility
    : null;
  if (compatibility) {
    warnings.push(...compatibility.warnings);
    blockers.push(...compatibility.blockers);
    writeJson(path.join(outputFolder, "lab-b-compatibility-report.json"), compatibility);
    if (compatibility.can_proceed) {
      writeJson(
        path.join(outputFolder, "lab-b-import-preview.json"),
        buildCurrentLabBImportPreviewFromBlueprintInput(blueprintInput),
      );
    }
  }
  const productionSafety = blueprintValidation.success
    ? evaluateBlueprintProductionSafety(blueprintInput, {
        structural_blockers: compatibility?.blockers ?? [],
        structural_warnings: compatibility?.warnings ?? [],
        signals: {
          diagnostic_only: true,
          production_valid: false,
          degraded_handoff: true,
          allow_blocked_upstream: degradedWarnings.allow_blocked_upstream,
          upstream_step_3_decision: degradedWarnings.signals.step_3_decision,
          materialized_source_count: degradedWarnings.signals.materialized_source_count,
          min_materialized_source_count:
            asNumberOrNull(companion.intake_fixture?.source_policy?.min_selected_sources) ?? 4,
          metadata_or_abstract_only_source_count:
            degradedWarnings.signals.metadata_or_abstract_only_source_count,
          unresolved_source_count: degradedWarnings.signals.unresolved_source_count,
        },
      })
    : null;
  let freshRunIsolation: FreshRunIsolationReport | null = blueprintValidation.success
    ? buildFreshRunIsolationReport({
        handoff,
        mode: "diagnostic",
        artifact_refs: [
          ...handoff.traceability.source_artifacts,
          ...handoff.source_snapshot,
        ],
        current_output_folder: outputFolder,
      })
    : null;
  let staleContentScan: StaleContentScanReport | null = blueprintValidation.success
    ? buildStaleContentScanReport({
        handoff,
        mode: "diagnostic",
        artifact_refs: [
          ...handoff.traceability.source_artifacts,
          ...handoff.source_snapshot,
        ],
        current_output_folder: outputFolder,
      })
    : null;
  if (productionSafety) {
    warnings.push(...productionSafety.warnings);
  }
  if (freshRunIsolation) {
    warnings.push(...freshRunIsolation.warnings);
    if (freshRunIsolation.blockers.length > 0 && !options.allowStaleContent) {
      blockers.push(...freshRunIsolation.blockers);
    } else if (freshRunIsolation.blockers.length > 0) {
      warnings.push(
        `--allow-stale-content enabled; severe stale-content blockers were reported but not used to stop this diagnostic run.`,
        ...freshRunIsolation.blockers,
      );
    }
  }
  writeJson(path.join(outputFolder, "production-safety-report.json"), productionSafety);
  writeJson(path.join(outputFolder, "fresh-run-isolation-report.json"), freshRunIsolation);
  writeJson(path.join(outputFolder, "stale-content-scan-report.json"), staleContentScan);
  const methodSelection = await buildMethodSelectionForHandoff({
    handoff,
    reducedEvidencePack,
    options: {
      caseId: options.caseId,
      productionSafety,
      collectUsage: true,
    },
  });
  writeJson(
    path.join(outputFolder, "method-selection-evidence-context.json"),
    methodSelection.evidenceContext,
  );
  writeJson(
    path.join(outputFolder, "method-selection-artifact.json"),
    methodSelection.artifact,
  );
  writeJson(
    path.join(outputFolder, "method-selection-validation-report.json"),
    methodSelection.validationReport,
  );
  writeText(path.join(outputFolder, "method-selection-report.md"), methodSelection.reportMarkdown);
  completedSteps.push("method_selection_read_only");
  warnings.push(
    ...methodSelection.validationReport.validation_downgrades.map(
      (warning) => `method_selection:${warning}`,
    ),
    ...methodSelection.validationReport.warnings.map((warning) => `method_selection:${warning}`),
  );
  if (!methodSelection.validationReport.passed) {
    warnings.push("method_selection_validation_report_requires_review");
  }

  if (blockers.length > 0) {
    const summary: FullDiagnosticSummary = {
      status: "blocked",
      case_id: options.caseId,
      handoff_id: handoff.handoff_id,
      project_id: handoff.project_id,
      schema_compatible: productionSafety?.schema_compatible ?? false,
      diagnostic_compatible: productionSafety?.diagnostic_compatible ?? false,
      production_eligible: productionSafety?.production_eligible ?? false,
      diagnostic_only: true,
      production_valid: false,
      degraded_handoff: true,
      allow_degraded_handoff: options.allowDegradedHandoff,
      production_ineligibility_reasons: productionSafety?.production_ineligibility_reasons ?? [],
      fresh_run_isolation_passed: freshRunIsolation?.passed ?? false,
      fresh_run_isolation_warnings: freshRunIsolation?.warnings ?? [],
      ...collectStaleGuardSummary({
        freshRunIsolation,
        staleContentScan,
      }),
      completed_steps: completedSteps,
      quality_gate_status: handoff.quality_gate.status,
      source_count: handoff.source_registry.length,
      evidence_unit_count: handoff.evidence_units.length,
      section_count: 0,
      generated_docx_count: 0,
      master_docx_path: null,
      institutional_docx_path: null,
      openai_called: false,
      token_cost_usage: { before: usageBefore, after: null, delta: null },
      warnings: unique(warnings),
      blockers: unique(blockers),
      output_folder: outputFolder,
    };
    writeJson(path.join(outputFolder, "full-diagnostic-summary.json"), summary);
    writeText(
      path.join(outputFolder, "LAB_B_FULL_DIAGNOSTIC_DOCX_REPORT.md"),
      renderDiagnosticReport({
        summary,
        degradedWarnings,
        labCompatibility: compatibility,
        reportSignals: {
          warning_propagation_ok: true,
          likely_overclaims: false,
          sections_preserve_gaps_or_limitations: false,
          citations_traceable: false,
          metadata_only_overuse_risk: degradedWarnings.signals.metadata_or_intake_direct_quote_count > 0,
          adjacent_energy_dissipator_misuse_risk: degradedWarnings.signals.adjacent_energy_dissipator_source_count > 0,
          matrix_status: null,
          validation_passed: null,
          master_docx_qa_passed: null,
          university_docx_qa_passed: null,
        },
        masterDocxPath: null,
        universityDocxPath: null,
        masterQa: null,
        universityQa: null,
      }),
    );
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
    return;
  }

  const sourceRegistry = buildSourceRegistry(handoff, companion);
  const project = buildProject({ handoff, blueprintInput, companion });
  const ledgerBundle = buildEvidenceLedgerFromHandoff({
    handoff: reducedHandoffForPrompting,
    sourceRegistry,
    companion,
    degradedWarnings,
  });
  const fixtures = buildFixtureSet({
    caseId: options.caseId,
    outputFolder,
    project,
    sourceRegistry,
    companion,
    degradedWarnings,
    evidencePacks: ledgerBundle.evidencePacks,
    evidenceLedger: ledgerBundle.ledger,
  });

  let providerName: string | null = null;
  let modelName: string | null = null;
  const provider = getConfiguredLlmProvider();
  providerName = provider.name;
  modelName = process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";

  const masterTemplate = await loadMasterTemplateRuntimeForDiagnostic(warnings);
  const templateImportContext = buildStep7ImportContext({
    handoff,
    blueprintInput,
    masterTemplate,
    companion,
    degradedWarnings,
  });
  writeJson(path.join(outputFolder, "00-diagnostic-fixture-summary.json"), {
    case_id: options.caseId,
    selected_reference_ids: getSelectedReferenceIds(companion, handoff),
    source_count: sourceRegistry.length,
    evidence_pack_count: ledgerBundle.evidencePacks.length,
    evidence_snippet_count: ledgerBundle.ledger.snippets.length,
    full_evidence_unit_count: handoff.evidence_units.length,
    reduced_evidence_unit_count: reducedEvidencePack.reduced_counts.evidence_units,
    asset_count: ledgerBundle.ledger.assets.length,
    skip_hero_image: options.skipHeroImage,
    allow_stale_content: options.allowStaleContent,
    render_docx: options.renderDocx,
    max_sections: options.maxSections,
  });
  writeJson(path.join(outputFolder, "05-step-7-template-import-context.json"), templateImportContext);
  completedSteps.push("step_7_import_context");

  const promptPlan = await planMasterTemplateSectionPromptsForLab({
    project: fixtures.project,
    masterTemplate,
    evidenceLedger: fixtures.evidenceLedger,
    templateImportContext,
    allowLlm: true,
  });
  writeJson(path.join(outputFolder, "10-section-prompt-plan.json"), promptPlan);
  completedSteps.push("step_8_planning");

  const plannedSectionKeys = promptPlan.generation_plan
    .map((planItem) => (planItem.section_key === "consistency_matrix" ? null : planItem.section_key))
    .filter((sectionKey): sectionKey is string => Boolean(sectionKey));
  const sectionKeys = options.maxSections
    ? plannedSectionKeys.slice(0, options.maxSections)
    : plannedSectionKeys;
  const drafts = options.maxSections
    ? await generateSectionDraftsForKeys({
        project: fixtures.project,
        masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        promptPlan,
        templateImportContext,
        sectionKeys,
        llmRequired: true,
      })
    : await runSectionGenerationEngine({
        project: fixtures.project,
        masterTemplate,
        evidenceLedger: fixtures.evidenceLedger,
        promptPlan,
        templateImportContext,
        llmRequired: true,
      });
  writeJson(path.join(outputFolder, "20-master-section-drafts.json"), drafts);
  completedSteps.push("step_9_section_drafts");

  let matrixArtifact: ConsistencyMatrixArtifact;
  try {
    matrixArtifact = await buildConsistencyMatrixArtifactFromSectionsWithLlm({
      drafts,
      provider,
      model: process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini",
    });
  } catch (error) {
    warnings.push(
      `Step 10 LLM matrix alignment failed; deterministic matrix artifact used: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
    );
    matrixArtifact = buildConsistencyMatrixArtifactFromSections(drafts);
  }
  const consistencyMatrix = legacyRowsFromMatrix(matrixArtifact);
  writeJson(path.join(outputFolder, "30-consistency-matrix.json"), consistencyMatrix);
  writeJson(path.join(outputFolder, "31-consistency-matrix-artifact.json"), matrixArtifact);
  completedSteps.push("step_10_consistency_matrix");

  const matrixDraft = buildMatrixDraft({ drafts, matrixArtifact });
  const draftsWithMatrix = [...drafts, matrixDraft];
  const templateContext = buildLabBlueprintTemplateContext(fixtures.project);
  const { legacyBlueprint, referenceInsights } = buildLegacyBlueprintFromMaster({
    projectTitle: fixtures.project.title,
    projectTemplateKey: fixtures.project.templateKey,
    projectDegreeLevel: fixtures.project.degreeLevel,
    projectUniversity: fixtures.project.university,
    projectProgram: fixtures.project.program,
    researchLine: fixtures.project.intake.researchLine,
    drafts: draftsWithMatrix,
    evidenceLedger: fixtures.evidenceLedger,
    consistencyMatrix,
    templateContext,
    sourceGate: fixtures.sourceGate,
  });
  const provenanceReport = buildDocumentProvenanceReport(draftsWithMatrix);
  const validation = await validateMasterBlueprintPackage({
    project: fixtures.project,
    masterTemplate,
    evidenceLedger: fixtures.evidenceLedger,
    drafts: draftsWithMatrix,
    legacyBlueprint,
    provenanceReport,
    pdfDownloadedCount: fixtures.pdfDownloads.records.filter((record) => record.status === "downloaded").length,
  });
  const universityBlueprint = await deriveUniversityBlueprint({
    project: fixtures.project,
    masterDrafts: draftsWithMatrix,
    templateRuntimeOverride: getLabUniversityTemplateRuntime(fixtures.project),
  });
  const packageQualitySummary = buildPackageQualitySummary({
    caseName: options.caseId,
    runDir: outputFolder,
    promptPlan,
    drafts: draftsWithMatrix,
    evidenceLedger: fixtures.evidenceLedger,
    validationReport: validation.validationReport,
    execution: {
      llm_enabled: true,
      llm_policy: "required",
      provider_name: providerName,
      model_name: modelName,
      fallback_sections_count: draftsWithMatrix.filter((draft) => draft.fallback_cause).length,
    },
  });
  const labResult = buildLabResult({
    fixtures,
    masterTemplate,
    promptPlan,
    draftsWithMatrix,
    consistencyMatrix,
    provenanceReport,
    validationReport: validation.validationReport,
    coherenceReport: validation.coherenceReport,
    legacyBlueprint,
    universityBlueprint,
    packageQualitySummary,
    providerName,
    modelName,
  });
  writeJson(path.join(outputFolder, "20-master-section-drafts.json"), draftsWithMatrix);
  writeJson(path.join(outputFolder, "40-legacy-blueprint.json"), legacyBlueprint);
  writeJson(path.join(outputFolder, "50-provenance-report.json"), provenanceReport);
  writeJson(path.join(outputFolder, "60-validation-report.json"), validation.validationReport);
  writeJson(path.join(outputFolder, "61-coherence-report.json"), validation.coherenceReport);
  writeJson(path.join(outputFolder, "70-university-blueprint.json"), universityBlueprint);
  writeJson(path.join(outputFolder, "71-university-reduction-plan.json"), universityBlueprint.reduction_plan ?? null);
  writeJson(path.join(outputFolder, "80-lab-result.json"), labResult);
  writeJson(path.join(outputFolder, "90-package-quality-summary.json"), packageQualitySummary);
  writeJson(path.join(outputFolder, "110-blueprint-composition-artifact.json"), {
    artifact_type: "blueprint_composition",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    diagnostic_only: true,
    production_valid: false,
    degraded_handoff: true,
    status:
      validation.validationReport.quality_report.hard_failures.length > 0
        ? "warn"
        : matrixArtifact.can_continue_step_11
          ? "pass"
          : "blocked",
    legacyBlueprint,
    referenceInsights,
    validationReport: validation.validationReport,
    provenanceReport,
    universityBlueprint,
    universityReductionPlan: universityBlueprint.reduction_plan ?? null,
    consistencyMatrixArtifact: matrixArtifact,
    warnings: unique([
      ...warnings,
      ...matrixArtifact.validation.warnings,
      ...validation.validationReport.warnings,
      ...universityBlueprint.warnings,
    ]),
  });
  completedSteps.push("step_11_composition_provenance_validation");

  let masterDocxPath: string | null = null;
  let universityDocxPath: string | null = null;
  let generatedDocxCount = 0;
  let masterQa: Record<string, unknown> | null = null;
  let universityQa: Record<string, unknown> | null = null;

  if (options.renderDocx) {
    const editorialProvider = provider;
    let masterAcademicDocument = await applyAcademicDocumentLayoutPass({
      document: applyAcademicDocumentPublicSanitizationPass(
        await applyAcademicDocumentEditorialPass({
          document: buildMasterAcademicDocument({
            project: fixtures.project,
            masterTemplate,
            drafts: draftsWithMatrix,
            matrixArtifact,
            evidenceLedger: fixtures.evidenceLedger,
            legacyBlueprint,
            consolidatedAssetUsagePlan: handoff.asset_usage_plan as Array<Record<string, unknown>>,
          }),
          provider: editorialProvider,
        }),
      ),
      provider: editorialProvider,
    });
    let universityAcademicDocument = await applyAcademicDocumentLayoutPass({
      document: applyAcademicDocumentPublicSanitizationPass(
        await applyAcademicDocumentEditorialPass({
          document: buildUniversityAcademicDocument({
            project: fixtures.project,
            universityBlueprint,
            matrixArtifact,
            evidenceLedger: fixtures.evidenceLedger,
            legacyBlueprint,
            consolidatedAssetUsagePlan: handoff.asset_usage_plan as Array<Record<string, unknown>>,
          }),
          provider: editorialProvider,
        }),
      ),
      provider: editorialProvider,
    });

    if (!options.skipHeroImage) {
      masterAcademicDocument = await applyAcademicHeroImageGeneration({
        document: masterAcademicDocument,
        runDir: outputFolder,
      });
      universityAcademicDocument = await applyAcademicHeroImageGeneration({
        document: universityAcademicDocument,
        runDir: outputFolder,
      });
    }

    const masterAppendixPolicy = validatePublicAppendixPolicyText(
      collectPublicAppendixText(masterAcademicDocument),
    );
    const universityAppendixPolicy = validatePublicAppendixPolicyText(
      collectPublicAppendixText(universityAcademicDocument),
    );
    if (!masterAppendixPolicy.passed) {
      warnings.push(
        ...masterAppendixPolicy.violations.map((violation) => `Master DOCX public appendix policy: ${violation}`),
      );
    }
    if (!universityAppendixPolicy.passed) {
      warnings.push(
        ...universityAppendixPolicy.violations.map((violation) => `University DOCX public appendix policy: ${violation}`),
      );
    }
    writeJson(path.join(outputFolder, "116-master-public-appendix-policy-report.json"), masterAppendixPolicy);
    writeJson(
      path.join(outputFolder, "136-university-public-appendix-policy-report.json"),
      universityAppendixPolicy,
    );

    freshRunIsolation = buildFreshRunIsolationReport({
      handoff,
      mode: "diagnostic",
      artifact_refs: [
        ...handoff.traceability.source_artifacts,
        ...handoff.source_snapshot,
      ],
      academic_documents: [
        { label: "master_academic_document", document: masterAcademicDocument },
        { label: "university_academic_document", document: universityAcademicDocument },
      ],
      text_blobs: [
        {
          label: "step_7_template_import_context",
          text: JSON.stringify(templateImportContext),
          public_facing: false,
        },
      ],
      current_output_folder: outputFolder,
    });
    staleContentScan = buildStaleContentScanReport({
      handoff,
      mode: "diagnostic",
      artifact_refs: [
        ...handoff.traceability.source_artifacts,
        ...handoff.source_snapshot,
      ],
      academic_documents: [
        { label: "master_academic_document", document: masterAcademicDocument },
        { label: "university_academic_document", document: universityAcademicDocument },
      ],
      current_output_folder: outputFolder,
    });
    writeJson(path.join(outputFolder, "fresh-run-isolation-report.json"), freshRunIsolation);
    writeJson(path.join(outputFolder, "stale-content-scan-report.json"), staleContentScan);
    warnings.push(...freshRunIsolation.warnings, ...staleContentScan.warnings);
    const staleBlockers = unique([
      ...freshRunIsolation.blockers,
      ...staleContentScan.blockers,
    ]);

    writeJson(path.join(outputFolder, "115-master-academic-document-model.json"), masterAcademicDocument);
    writeJson(path.join(outputFolder, "135-university-academic-document-model.json"), universityAcademicDocument);

    if (staleBlockers.length > 0 && !options.allowStaleContent) {
      blockers.push(...staleBlockers);
      const usageAfterBlocked = await readLlmUsageRegistry().then((registry) => registry.cumulative).catch(() => null);
      const usageDeltaBlocked = diffUsage(usageAfterBlocked, usageBefore) ?? zeroUsageDelta();
      const summary: FullDiagnosticSummary = {
        status: "blocked",
        case_id: options.caseId,
        handoff_id: handoff.handoff_id,
        project_id: handoff.project_id,
        schema_compatible: productionSafety?.schema_compatible ?? false,
        diagnostic_compatible: productionSafety?.diagnostic_compatible ?? false,
        production_eligible: productionSafety?.production_eligible ?? false,
        diagnostic_only: true,
        production_valid: false,
        degraded_handoff: true,
        allow_degraded_handoff: options.allowDegradedHandoff,
        production_ineligibility_reasons: productionSafety?.production_ineligibility_reasons ?? [],
        fresh_run_isolation_passed: freshRunIsolation.passed,
        fresh_run_isolation_warnings: freshRunIsolation.warnings,
        ...collectStaleGuardSummary({
          freshRunIsolation,
          staleContentScan,
        }),
        completed_steps: completedSteps,
        quality_gate_status: handoff.quality_gate.status,
        source_count: handoff.source_registry.length,
        evidence_unit_count: handoff.evidence_units.length,
        section_count: draftsWithMatrix.length,
        generated_docx_count: 0,
        master_docx_path: null,
        institutional_docx_path: null,
        openai_called: usageDeltaBlocked.calls > 0,
        token_cost_usage: {
          before: usageBefore,
          after: usageAfterBlocked,
          delta: usageDeltaBlocked,
        },
        warnings: unique(warnings),
        blockers: unique(blockers),
        output_folder: outputFolder,
      };
      writeRunAnalyticsArtifacts({
        outputFolder,
        runId: blueprintInput.run_request.blueprint_run_id ?? `lab-b-full-diagnostic-${handoff.handoff_id}-${timestamp}`,
        caseId: options.caseId,
        handoff,
        reducedEvidencePack,
        productionSafety,
        completedSteps,
        startedAt: runStartedAt,
        completedAt: new Date().toISOString(),
        usageDelta: usageDeltaBlocked,
        modelNames: [modelName].filter((model): model is string => Boolean(model)),
        sectionCount: draftsWithMatrix.length,
        docxQaScore: null,
        masterQa: null,
        universityQa: null,
        provenanceReport,
        packageQualitySummary,
        freshRunIsolation,
        staleContentScan,
        warnings: unique(warnings),
        blockers: unique(blockers),
      });
      writeJson(path.join(outputFolder, "full-diagnostic-summary.json"), summary);
      writeText(
        path.join(outputFolder, "LAB_B_FULL_DIAGNOSTIC_DOCX_REPORT.md"),
        renderDiagnosticReport({
          summary,
          degradedWarnings,
          labCompatibility: compatibility,
          reportSignals: {
            warning_propagation_ok: true,
            likely_overclaims: true,
            sections_preserve_gaps_or_limitations: true,
            citations_traceable: true,
            metadata_only_overuse_risk: degradedWarnings.signals.metadata_or_intake_direct_quote_count > 0,
            adjacent_energy_dissipator_misuse_risk: degradedWarnings.signals.adjacent_energy_dissipator_source_count > 0,
            matrix_status: matrixArtifact.status,
            validation_passed: validation.validationReport.quality_report.passed,
            master_docx_qa_passed: null,
            university_docx_qa_passed: null,
          },
          masterDocxPath: null,
          universityDocxPath: null,
          masterQa: null,
          universityQa: null,
        }),
      );
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = 1;
      return;
    }

    if (staleBlockers.length > 0 && options.allowStaleContent) {
      warnings.push(
        "--allow-stale-content enabled; DOCX rendering continued despite severe stale-content findings.",
      );
    }

    masterDocxPath = path.join(outputFolder, "12-master-docx-preview.docx");
    const masterManifest = await renderMasterDocx({
      project: fixtures.project,
      masterTemplate,
      drafts: draftsWithMatrix,
      matrixArtifact,
      evidenceLedger: fixtures.evidenceLedger,
      validationReport: validation.validationReport,
      legacyBlueprint,
      consolidatedAssetUsagePlan: handoff.asset_usage_plan as Array<Record<string, unknown>>,
      academicDocumentOverride: masterAcademicDocument,
      outputPath: masterDocxPath,
      runDir: outputFolder,
    });
    masterQa = await validateDocxPackage({
      docxPath: masterManifest.output_docx_path,
      minTableCount: 4,
      minSectionCount: 3,
      forbiddenSourceTitles: fixtures.evidenceLedger.source_registry.map((source) => source.title),
    }) as unknown as Record<string, unknown>;
    masterManifest.academic_model_path = path.join(outputFolder, "115-master-academic-document-model.json");
    masterManifest.qa_report_path = path.join(outputFolder, "121-master-docx-qa-report.json");
    masterManifest.qa_passed = Boolean(masterQa.passed);
    masterManifest.qa_score_100 = typeof masterQa.score_100 === "number" ? masterQa.score_100 : undefined;
    writeJson(path.join(outputFolder, "120-master-docx-manifest.json"), masterManifest);
    writeJson(path.join(outputFolder, "121-master-docx-qa-report.json"), masterQa);
    generatedDocxCount += 1;
    completedSteps.push("step_12_master_docx");

    universityDocxPath = path.join(outputFolder, "13-university-docx-preview.docx");
    const universityManifest = await renderUniversityDocx({
      project: fixtures.project,
      universityBlueprint,
      matrixArtifact,
      evidenceLedger: fixtures.evidenceLedger,
      validationReport: validation.validationReport,
      legacyBlueprint,
      consolidatedAssetUsagePlan: handoff.asset_usage_plan as Array<Record<string, unknown>>,
      academicDocumentOverride: universityAcademicDocument,
      outputPath: universityDocxPath,
      runDir: outputFolder,
    });
    universityQa = await validateDocxPackage({
      docxPath: universityManifest.output_docx_path,
      minTableCount: 3,
      minSectionCount: 3,
      forbiddenSourceTitles: fixtures.evidenceLedger.source_registry.map((source) => source.title),
    }) as unknown as Record<string, unknown>;
    universityManifest.academic_model_path = path.join(outputFolder, "135-university-academic-document-model.json");
    universityManifest.qa_report_path = path.join(outputFolder, "131-university-docx-qa-report.json");
    universityManifest.qa_passed = Boolean(universityQa.passed);
    universityManifest.qa_score_100 =
      typeof universityQa.score_100 === "number" ? universityQa.score_100 : undefined;
    writeJson(path.join(outputFolder, "130-university-docx-manifest.json"), universityManifest);
    writeJson(path.join(outputFolder, "131-university-docx-qa-report.json"), universityQa);
    writeJson(path.join(outputFolder, "135-university-academic-document-model.json"), universityAcademicDocument);
    generatedDocxCount += 1;
    completedSteps.push("step_13_institutional_docx");
  }

  const usageAfter = await readLlmUsageRegistry().then((registry) => registry.cumulative).catch(() => null);
  const usageDelta = diffUsage(usageAfter, usageBefore) ?? zeroUsageDelta();
  const reportSignals = assessReportSignals({
    handoff,
    drafts: draftsWithMatrix,
    validationReport: validation.validationReport,
    matrixArtifact,
    masterQa,
    universityQa,
    degradedWarnings,
  });
  warnings.push(...collectDraftWarnings(draftsWithMatrix).slice(0, 20));
  warnings.push(...validation.validationReport.warnings);

  const summary: FullDiagnosticSummary = {
    status: "completed",
    case_id: options.caseId,
    handoff_id: handoff.handoff_id,
    project_id: handoff.project_id,
    schema_compatible: productionSafety?.schema_compatible ?? false,
    diagnostic_compatible: productionSafety?.diagnostic_compatible ?? false,
    production_eligible: productionSafety?.production_eligible ?? false,
    diagnostic_only: true,
    production_valid: false,
    degraded_handoff: true,
    allow_degraded_handoff: options.allowDegradedHandoff,
    production_ineligibility_reasons: productionSafety?.production_ineligibility_reasons ?? [],
    fresh_run_isolation_passed: freshRunIsolation?.passed ?? false,
    fresh_run_isolation_warnings: freshRunIsolation?.warnings ?? [],
    ...collectStaleGuardSummary({
      freshRunIsolation,
      staleContentScan,
    }),
    completed_steps: completedSteps,
    quality_gate_status: handoff.quality_gate.status,
    source_count: handoff.source_registry.length,
    evidence_unit_count: handoff.evidence_units.length,
    section_count: draftsWithMatrix.length,
    generated_docx_count: generatedDocxCount,
    master_docx_path: masterDocxPath,
    institutional_docx_path: universityDocxPath,
    openai_called: usageDelta.calls > 0,
    token_cost_usage: {
      before: usageBefore,
      after: usageAfter,
      delta: usageDelta,
    },
    warnings: unique(warnings),
    blockers: unique(blockers),
    output_folder: outputFolder,
  };

  const runCompletedAt = new Date().toISOString();
  const masterQaScore = typeof masterQa?.score_100 === "number" ? masterQa.score_100 : null;
  const universityQaScore = typeof universityQa?.score_100 === "number" ? universityQa.score_100 : null;
  writeRunAnalyticsArtifacts({
    outputFolder,
    runId: blueprintInput.run_request.blueprint_run_id ?? `lab-b-full-diagnostic-${handoff.handoff_id}-${timestamp}`,
    caseId: options.caseId,
    handoff,
    reducedEvidencePack,
    productionSafety,
    completedSteps,
    startedAt: runStartedAt,
    completedAt: runCompletedAt,
    usageDelta,
    modelNames: [modelName].filter((model): model is string => Boolean(model)),
    sectionCount: draftsWithMatrix.length,
    docxQaScore:
      masterQaScore !== null && universityQaScore !== null
        ? Math.min(masterQaScore, universityQaScore)
        : masterQaScore ?? universityQaScore,
    masterQa,
    universityQa,
    provenanceReport,
    packageQualitySummary,
    freshRunIsolation,
    staleContentScan,
    warnings: unique(warnings),
    blockers: unique(blockers),
  });
  writeJson(path.join(outputFolder, "full-diagnostic-summary.json"), summary);
  writeText(
    path.join(outputFolder, "LAB_B_FULL_DIAGNOSTIC_DOCX_REPORT.md"),
    renderDiagnosticReport({
      summary,
      degradedWarnings,
      labCompatibility: compatibility,
      reportSignals,
      masterDocxPath,
      universityDocxPath,
      masterQa,
      universityQa,
    }),
  );

  console.log(JSON.stringify(summary, null, 2));
}

runDiagnostic(parseArgs()).catch(async (error) => {
  const options = parseArgs();
  const timestamp = timestampForPath();
  const outputFolder = path.join(options.outputRoot, options.caseId, timestamp);
  mkdirSync(outputFolder, { recursive: true });
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const usageAfter = await readLlmUsageRegistry().then((registry) => registry.cumulative).catch(() => null);
  const summary: FullDiagnosticSummary = {
    status: "failed",
    case_id: options.caseId,
    handoff_id: null,
    project_id: null,
    schema_compatible: false,
    diagnostic_compatible: false,
    production_eligible: false,
    diagnostic_only: true,
    production_valid: false,
    degraded_handoff: true,
    allow_degraded_handoff: options.allowDegradedHandoff,
    production_ineligibility_reasons: [message],
    fresh_run_isolation_passed: false,
    fresh_run_isolation_warnings: [],
    ...emptyStaleGuardSummary(),
    completed_steps: [],
    quality_gate_status: null,
    source_count: 0,
    evidence_unit_count: 0,
    section_count: 0,
    generated_docx_count: 0,
    master_docx_path: null,
    institutional_docx_path: null,
    openai_called: false,
    token_cost_usage: {
      before: null,
      after: usageAfter,
      delta: null,
    },
    warnings: [],
    blockers: [message],
    output_folder: outputFolder,
  };
  writeJson(path.join(outputFolder, "full-diagnostic-summary.json"), summary);
  writeText(
    path.join(outputFolder, "LAB_B_FULL_DIAGNOSTIC_DOCX_REPORT.md"),
    `# Lab B Full Diagnostic DOCX Report\n\nRun failed before completion.\n\n\`\`\`\n${message}\n\`\`\`\n`,
  );
  console.error(message);
  process.exitCode = 1;
});
