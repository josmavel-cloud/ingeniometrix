import type {
  ArtifactRef,
  EvidenceEngineHandoffV1,
} from "@/server/blueprint-engine/contracts";
import type {
  AcademicDocument,
  AssetPlacement,
  EquationLayoutPlan,
  FigureLayoutPlan,
} from "@/server/blueprint-v2/lab/academic-document-model";

type FindingSeverity = "warning" | "blocker";

export type FreshRunIsolationFinding = {
  severity: FindingSeverity;
  kind:
    | "mutable_latest_path"
    | "foreign_run_path"
    | "foreign_handoff_or_run_id"
    | "stale_source_ref"
    | "stale_evidence_ref"
    | "stale_asset_ref"
    | "stale_topic_marker"
    | "untraced_asset_uri";
  label: string;
  value: string;
};

export type FreshRunIsolationReport = {
  artifact_type: "fresh_run_isolation_report";
  artifact_version: "v1";
  generated_at: string;
  mode: "diagnostic" | "production";
  passed: boolean;
  stale_content_detected: boolean;
  severe_stale_content_detected: boolean;
  current_handoff_id: string;
  current_evidence_run_id: string;
  immutable_snapshot_hash: string;
  current_source_ids: string[];
  current_evidence_ids: string[];
  current_asset_keys: string[];
  mutable_latest_path_count: number;
  stale_source_ref_count: number;
  stale_evidence_ref_count: number;
  stale_asset_ref_count: number;
  stale_topic_marker_count: number;
  foreign_run_path_count: number;
  untraced_asset_ref_count: number;
  checked_artifact_ref_count: number;
  checked_source_ref_count: number;
  checked_evidence_ref_count: number;
  checked_asset_ref_count: number;
  checked_public_text_field_count: number;
  warnings: string[];
  blockers: string[];
  findings: FreshRunIsolationFinding[];
};

export type StaleContentScanReport = {
  artifact_type: "stale_content_scan_report";
  artifact_version: "v1";
  generated_at: string;
  passed: boolean;
  stale_content_detected: boolean;
  severe_stale_content_detected: boolean;
  stale_topic_marker_count: number;
  stale_source_ref_count: number;
  stale_evidence_ref_count: number;
  stale_asset_ref_count: number;
  mutable_latest_path_count: number;
  foreign_run_path_count: number;
  checked_public_text_field_count: number;
  warnings: string[];
  blockers: string[];
  findings: FreshRunIsolationFinding[];
};

export type FreshRunIsolationInput = {
  handoff: EvidenceEngineHandoffV1;
  mode?: "diagnostic" | "production";
  artifact_refs?: ArtifactRef[];
  academic_documents?: Array<{
    label: string;
    document: AcademicDocument;
  }>;
  text_blobs?: Array<{
    label: string;
    text: string;
    public_facing?: boolean;
  }>;
  current_output_folder?: string | null;
  known_stale_markers?: string[];
};

type Scope = {
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  originalExcerptIds: Set<string>;
  assetKeys: Set<string>;
  currentMarkers: string[];
  currentTopicText: string;
};

const LEGACY_STALE_TOPIC_MARKERS = [
  "adaptive reuse",
  "mass timber",
  "mass-timber",
  "mass timber overbuild",
  "mass-timber overbuild",
  "overbuild",
  "office-to-residential",
  "toronto",
  "canada",
  "zoning",
  "fire egress",
  "glulam",
  "clt",
  "reutilizacion adaptativa y sostenibilidad urbana",
  "reutilización adaptativa y sostenibilidad urbana",
  "vacancia subutilizacion y valor del parque edificado",
  "vacancia, subutilizacion y valor del parque edificado",
  "vacancia, subutilización y valor del parque edificado",
  "criterios de decision para compatibilidad de nuevo uso",
  "criterios de decisión para compatibilidad de nuevo uso",
];

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function isMutableLatestWarning(value: string) {
  return value.toLowerCase().startsWith("mutable_latest_path:");
}

function publicSummaryWarnings(values: Array<string | null | undefined>) {
  return unique(values).filter((value) => !isMutableLatestWarning(value));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value: string | null | undefined) {
  return normalize(value).toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isMutableLatestPath(uri: string) {
  return /(^|[\\/])latest([-.]|[\\/])|latest-[^\\/]+\.json$/i.test(uri);
}

function isDeterministicTemplateAsset(assetKey: string) {
  return /^(ingeniometrix_|template_|deterministic_|fallback_|cover-hero|hero-|methodological-infographic|brand_)/i.test(
    assetKey,
  );
}

function containsCurrentMarker(value: string, markers: string[]) {
  const normalized = lower(value);
  return markers.some((marker) => marker.length > 0 && normalized.includes(marker.toLowerCase()));
}

function currentRunFolderFromHandoff(handoff: EvidenceEngineHandoffV1) {
  const runId = handoff.evidence_run_id;
  if (/[\\/]/.test(runId)) {
    return runId;
  }

  return null;
}

function pathIncludesDifferentRunFolder(input: {
  uri: string;
  currentOutputFolder?: string | null;
  currentEvidenceRunFolder?: string | null;
}) {
  const uri = input.uri.toLowerCase();
  if (!uri.includes("artifacts-local")) {
    return false;
  }

  const currentOutput = lower(input.currentOutputFolder).replace(/\//g, "\\");
  const currentEvidenceRun = lower(input.currentEvidenceRunFolder).replace(/\//g, "\\");
  const normalizedUri = uri.replace(/\//g, "\\");

  if (currentOutput && normalizedUri.includes(currentOutput)) {
    return false;
  }

  if (currentEvidenceRun && normalizedUri.includes(currentEvidenceRun)) {
    return false;
  }

  return /artifacts-local\\(?:lab-b-full-diagnostic-docx-runs|evidence-selected-source-runs|blueprint-v2-lab)\\/i.test(
    normalizedUri,
  );
}

function collectForeignIds(text: string, handoff: EvidenceEngineHandoffV1) {
  const handoffIds = text.match(/evidence-handoff-[a-z0-9-]+/gi) ?? [];
  const runIds = text.match(/\brun-\d{4}-\d{2}-\d{2}T[a-z0-9-]+/gi) ?? [];
  const foreignHandoffs = handoffIds.filter((id) => id !== handoff.handoff_id);
  const foreignRuns = runIds.filter((id) => !handoff.evidence_run_id.includes(id));

  return unique([...foreignHandoffs, ...foreignRuns]);
}

function buildScope(handoff: EvidenceEngineHandoffV1): Scope {
  const evidenceIds = new Set(handoff.evidence_units.map((unit) => unit.evidence_id));
  const assetKeys = new Set([
    ...handoff.asset_registry.map((asset) => asset.asset_key),
    ...handoff.evidence_units
      .map((unit) => unit.asset_key)
      .filter((assetKey): assetKey is string => Boolean(assetKey)),
  ]);
  const sourceIds = new Set(handoff.source_registry.map((source) => source.source_id));
  const originalExcerptIds = new Set(
    handoff.evidence_units
      .filter((unit) => unit.unit_type === "original_excerpt")
      .map((unit) => unit.evidence_id),
  );
  const currentTopicText = [
    handoff.project_context.topic,
    handoff.project_context.problem_context,
    handoff.project_context.research_line,
    handoff.project_context.methodology_preference,
    handoff.project_context.population_or_context,
    handoff.project_context.retrieval_brief,
    ...handoff.source_registry.map((source) => source.title),
  ]
    .map(normalize)
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return {
    sourceIds,
    evidenceIds,
    originalExcerptIds,
    assetKeys,
    currentTopicText,
    currentMarkers: unique([
      handoff.handoff_id,
      handoff.evidence_run_id,
      handoff.traceability.immutable_snapshot_hash,
      handoff.artifact_hash,
      ...handoff.source_registry.map((source) => source.source_id),
      ...handoff.asset_registry.map((asset) => asset.asset_key),
    ]),
  };
}

function pushFinding(input: {
  findings: FreshRunIsolationFinding[];
  severity: FindingSeverity;
  kind: FreshRunIsolationFinding["kind"];
  label: string;
  value: string;
}) {
  input.findings.push({
    severity: input.severity,
    kind: input.kind,
    label: input.label,
    value: input.value,
  });
}

function collectTextFields(value: unknown, label: string, output: Array<{ label: string; text: string }>) {
  if (typeof value === "string") {
    const text = normalize(value);
    if (text) {
      output.push({ label, text });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextFields(item, `${label}[${index}]`, output));
    return;
  }

  const record = asRecord(value);
  for (const [key, child] of Object.entries(record)) {
    collectTextFields(child, `${label}.${key}`, output);
  }
}

function collectAcademicDocumentText(document: AcademicDocument, label: string) {
  const fields: Array<{ label: string; text: string }> = [];
  collectTextFields(document.metadata, `${label}.metadata`, fields);
  collectTextFields(document.layout_plan.cover_visual, `${label}.cover_visual`, fields);
  collectTextFields(document.layout_plan.figures, `${label}.figures`, fields);
  collectTextFields(document.layout_plan.equations, `${label}.equations`, fields);
  collectTextFields(document.layout_plan.schedule_visual, `${label}.schedule_visual`, fields);
  collectTextFields(document.layout_plan.schedule_gantt_rows ?? [], `${label}.schedule_gantt_rows`, fields);
  collectTextFields(document.layout_plan.budget_rows ?? [], `${label}.budget_rows`, fields);
  collectTextFields(document.layout_plan.appendix_public_items ?? [], `${label}.appendix_public_items`, fields);
  for (const section of document.sections) {
    collectTextFields(
      {
        title: section.title,
        blocks: section.blocks,
        warnings: section.warnings,
      },
      `${label}.section.${section.section_key}`,
      fields,
    );
  }

  return fields;
}

function collectDocumentSourceRefs(document: AcademicDocument) {
  const refs: string[] = [];
  for (const section of document.sections) {
    refs.push(...section.source_ids);
    for (const anchor of section.citation_anchors) {
      refs.push(...anchor.source_ids);
    }
  }
  refs.push(...document.asset_placements.map((asset) => asset.source_id));
  refs.push(...document.layout_plan.figures.map((figure) => figure.source_id));
  refs.push(...document.layout_plan.equations.map((equation) => equation.source_id));
  return unique(refs);
}

function collectDocumentEvidenceRefs(document: AcademicDocument) {
  const refs: string[] = [];
  for (const section of document.sections) {
    refs.push(...(section.evidence_ids ?? []));
    refs.push(...(section.original_excerpt_ids ?? []));
    for (const anchor of section.citation_anchors) {
      refs.push(...(anchor.evidence_ids ?? []));
      refs.push(...(anchor.original_excerpt_ids ?? []));
    }
  }
  return unique(refs);
}

function collectDocumentAssetRefs(document: AcademicDocument) {
  const refs: Array<{
    asset_key: string;
    source_id?: string | null;
    uri?: string | null;
    label: string;
  }> = [];
  const addPlacement = (asset: AssetPlacement, label: string) => {
    refs.push({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      uri: asset.file_path,
      label,
    });
  };
  const addFigure = (figure: FigureLayoutPlan, label: string) => {
    refs.push({
      asset_key: figure.asset_key,
      source_id: figure.source_id,
      uri: figure.file_path,
      label,
    });
  };
  const addEquation = (equation: EquationLayoutPlan, label: string) => {
    refs.push({
      asset_key: equation.asset_key,
      source_id: equation.source_id,
      uri: null,
      label,
    });
  };

  document.asset_placements.forEach((asset) => addPlacement(asset, `${document.variant}.asset_placements`));
  document.layout_plan.figures.forEach((figure) => addFigure(figure, `${document.variant}.figures`));
  document.layout_plan.equations.forEach((equation) => addEquation(equation, `${document.variant}.equations`));

  const coverImagePath = document.layout_plan.cover_visual.image_path;
  if (coverImagePath) {
    refs.push({
      asset_key: `cover-hero-${document.variant}`,
      source_id: null,
      uri: coverImagePath,
      label: `${document.variant}.cover_visual`,
    });
  }

  return refs;
}

function staleMarkersForScope(input: FreshRunIsolationInput, scope: Scope) {
  return unique([...(input.known_stale_markers ?? []), ...LEGACY_STALE_TOPIC_MARKERS]).filter(
    (marker) => !scope.currentTopicText.includes(marker.toLowerCase()),
  );
}

export function buildFreshRunIsolationReport(
  input: FreshRunIsolationInput,
): FreshRunIsolationReport {
  const mode = input.mode ?? "diagnostic";
  const handoff = input.handoff;
  const scope = buildScope(handoff);
  const findings: FreshRunIsolationFinding[] = [];
  const artifactRefs = input.artifact_refs ?? [
    ...handoff.traceability.source_artifacts,
    ...handoff.source_snapshot,
  ];
  const textFields: Array<{ label: string; text: string }> = [
    ...(input.text_blobs ?? [])
      .filter((blob) => blob.public_facing !== false)
      .map((blob) => ({ label: blob.label, text: blob.text })),
  ];
  const sourceRefs: string[] = [];
  const evidenceRefs: string[] = [];
  const assetRefs: ReturnType<typeof collectDocumentAssetRefs> = [];

  for (const item of input.academic_documents ?? []) {
    textFields.push(...collectAcademicDocumentText(item.document, item.label));
    sourceRefs.push(...collectDocumentSourceRefs(item.document));
    evidenceRefs.push(...collectDocumentEvidenceRefs(item.document));
    assetRefs.push(...collectDocumentAssetRefs(item.document));
  }

  for (const asset of handoff.asset_registry) {
    assetRefs.push({
      asset_key: asset.asset_key,
      source_id: asset.source_id,
      uri: asset.file_ref?.uri ?? null,
      label: "handoff.asset_registry",
    });
  }

  const currentEvidenceRunFolder = currentRunFolderFromHandoff(handoff);

  for (const ref of artifactRefs) {
    const uri = ref.uri;
    if (isMutableLatestPath(uri)) {
      pushFinding({
        findings,
        severity: mode === "production" ? "blocker" : "warning",
        kind: "mutable_latest_path",
        label: ref.ref_id,
        value: uri,
      });
    }
  }

  for (const sourceId of unique(sourceRefs)) {
    if (!scope.sourceIds.has(sourceId)) {
      pushFinding({
        findings,
        severity: "blocker",
        kind: "stale_source_ref",
        label: "academic_document.source_id",
        value: sourceId,
      });
    }
  }

  for (const evidenceId of unique(evidenceRefs)) {
    if (!scope.evidenceIds.has(evidenceId) && !scope.originalExcerptIds.has(evidenceId)) {
      pushFinding({
        findings,
        severity: "blocker",
        kind: "stale_evidence_ref",
        label: "academic_document.evidence_id",
        value: evidenceId,
      });
    }
  }

  for (const asset of assetRefs) {
    const deterministic = isDeterministicTemplateAsset(asset.asset_key);
    if (!scope.assetKeys.has(asset.asset_key) && !deterministic) {
      pushFinding({
        findings,
        severity: "blocker",
        kind: "stale_asset_ref",
        label: asset.label,
        value: asset.asset_key,
      });
    }

    if (asset.source_id && !scope.sourceIds.has(asset.source_id)) {
      pushFinding({
        findings,
        severity: "blocker",
        kind: "stale_source_ref",
        label: `${asset.label}:${asset.asset_key}`,
        value: asset.source_id,
      });
    }

    const uri = asset.uri ?? "";
    if (!uri) {
      continue;
    }

    if (isMutableLatestPath(uri)) {
      pushFinding({
        findings,
        severity: mode === "production" ? "blocker" : "warning",
        kind: "mutable_latest_path",
        label: `${asset.label}:${asset.asset_key}`,
        value: uri,
      });
    }

    if (
      pathIncludesDifferentRunFolder({
        uri,
        currentOutputFolder: input.current_output_folder,
        currentEvidenceRunFolder,
      })
    ) {
      pushFinding({
        findings,
        severity: "blocker",
        kind: "foreign_run_path",
        label: `${asset.label}:${asset.asset_key}`,
        value: uri,
      });
    }

    if (!deterministic && !containsCurrentMarker(uri, scope.currentMarkers)) {
      pushFinding({
        findings,
        severity: "warning",
        kind: "untraced_asset_uri",
        label: `${asset.label}:${asset.asset_key}`,
        value: uri,
      });
    }
  }

  const staleMarkers = staleMarkersForScope(input, scope);
  for (const field of textFields) {
    const text = lower(field.text);
    const foreignIds = collectForeignIds(field.text, handoff);
    for (const id of foreignIds) {
      pushFinding({
        findings,
        severity: "blocker",
        kind: "foreign_handoff_or_run_id",
        label: field.label,
        value: id,
      });
    }

    for (const marker of staleMarkers) {
      if (text.includes(marker.toLowerCase())) {
        pushFinding({
          findings,
          severity: "blocker",
          kind: "stale_topic_marker",
          label: field.label,
          value: marker,
        });
      }
    }
  }

  const warnings = unique(
    findings
      .filter((finding) => finding.severity === "warning")
      .map((finding) => `${finding.kind}: ${finding.label} -> ${finding.value}`),
  );
  const blockers = unique(
    findings
      .filter((finding) => finding.severity === "blocker")
      .map((finding) => `${finding.kind}: ${finding.label} -> ${finding.value}`),
  );
  const countByKind = (kind: FreshRunIsolationFinding["kind"]) =>
    findings.filter((finding) => finding.kind === kind).length;

  return {
    artifact_type: "fresh_run_isolation_report",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    mode,
    passed: blockers.length === 0,
    stale_content_detected:
      findings.some((finding) => finding.kind !== "mutable_latest_path") || blockers.length > 0,
    severe_stale_content_detected: blockers.length > 0,
    current_handoff_id: handoff.handoff_id,
    current_evidence_run_id: handoff.evidence_run_id,
    immutable_snapshot_hash: handoff.traceability.immutable_snapshot_hash,
    current_source_ids: Array.from(scope.sourceIds),
    current_evidence_ids: Array.from(scope.evidenceIds),
    current_asset_keys: Array.from(scope.assetKeys),
    mutable_latest_path_count: countByKind("mutable_latest_path"),
    stale_source_ref_count: countByKind("stale_source_ref"),
    stale_evidence_ref_count: countByKind("stale_evidence_ref"),
    stale_asset_ref_count: countByKind("stale_asset_ref"),
    stale_topic_marker_count: countByKind("stale_topic_marker"),
    foreign_run_path_count: countByKind("foreign_run_path") + countByKind("foreign_handoff_or_run_id"),
    untraced_asset_ref_count: countByKind("untraced_asset_uri"),
    checked_artifact_ref_count: artifactRefs.length,
    checked_source_ref_count: unique(sourceRefs).length,
    checked_evidence_ref_count: unique(evidenceRefs).length,
    checked_asset_ref_count: assetRefs.length,
    checked_public_text_field_count: textFields.length,
    warnings,
    blockers,
    findings,
  };
}

export function buildStaleContentScanReport(
  input: FreshRunIsolationInput,
): StaleContentScanReport {
  const freshRunReport = buildFreshRunIsolationReport(input);

  return {
    artifact_type: "stale_content_scan_report",
    artifact_version: "v1",
    generated_at: freshRunReport.generated_at,
    passed: freshRunReport.passed,
    stale_content_detected: freshRunReport.stale_content_detected,
    severe_stale_content_detected: freshRunReport.severe_stale_content_detected,
    stale_topic_marker_count: freshRunReport.stale_topic_marker_count,
    stale_source_ref_count: freshRunReport.stale_source_ref_count,
    stale_evidence_ref_count: freshRunReport.stale_evidence_ref_count,
    stale_asset_ref_count: freshRunReport.stale_asset_ref_count,
    mutable_latest_path_count: freshRunReport.mutable_latest_path_count,
    foreign_run_path_count: freshRunReport.foreign_run_path_count,
    checked_public_text_field_count: freshRunReport.checked_public_text_field_count,
    warnings: freshRunReport.warnings,
    blockers: freshRunReport.blockers,
    findings: freshRunReport.findings.filter((finding) =>
      [
        "foreign_handoff_or_run_id",
        "stale_source_ref",
        "stale_evidence_ref",
        "stale_asset_ref",
        "stale_topic_marker",
        "foreign_run_path",
        "mutable_latest_path",
      ].includes(finding.kind),
    ),
  };
}

export function collectStaleGuardSummary(input: {
  freshRunIsolation: FreshRunIsolationReport | null;
  staleContentScan: StaleContentScanReport | null;
}) {
  return {
    stale_content_detected:
      Boolean(input.freshRunIsolation?.stale_content_detected) ||
      Boolean(input.staleContentScan?.stale_content_detected),
    stale_content_blockers: unique([
      ...(input.freshRunIsolation?.blockers ?? []),
      ...(input.staleContentScan?.blockers ?? []),
    ]),
    stale_content_warnings: publicSummaryWarnings([
      ...(input.freshRunIsolation?.warnings ?? []),
      ...(input.staleContentScan?.warnings ?? []),
    ]),
    stale_asset_ref_count:
      Math.max(
        input.freshRunIsolation?.stale_asset_ref_count ?? 0,
        input.staleContentScan?.stale_asset_ref_count ?? 0,
      ),
    stale_source_ref_count:
      Math.max(
        input.freshRunIsolation?.stale_source_ref_count ?? 0,
        input.staleContentScan?.stale_source_ref_count ?? 0,
      ),
    stale_topic_marker_count:
      Math.max(
        input.freshRunIsolation?.stale_topic_marker_count ?? 0,
        input.staleContentScan?.stale_topic_marker_count ?? 0,
      ),
    mutable_latest_path_count:
      Math.max(
        input.freshRunIsolation?.mutable_latest_path_count ?? 0,
        input.staleContentScan?.mutable_latest_path_count ?? 0,
      ),
  };
}
