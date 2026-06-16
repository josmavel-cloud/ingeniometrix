"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Database, FileJson, ImageIcon, Link2, ScrollText, Waypoints } from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";
import type { TemplateQualityContractArtifact } from "@/server/blueprint-v2/lab/template-quality-contract";
import type { TemplateRuntimeInspectionArtifact } from "@/server/blueprint-v2/lab/template-runtime-inspector";

type Step7ReaderProps = {
  snapshot: Step7Snapshot;
};

type Step7Snapshot = {
  fixtureCase: string;
  importedOverview: {
    project: {
      title: string;
      university: string | null;
      program: string | null;
      templateKey: string | null;
    };
    sourceMix: {
      total: number;
      selected: number;
    };
    pdfCoverage: {
      total: number;
      downloaded: number;
    };
  };
  sourceRegistry: {
    source_registry?: Array<{
      source_id: string;
      reference_id: string | null;
      origin: string;
      title: string;
      year: number | null;
      pdf_url?: string | null;
      landing_page_url?: string | null;
    }>;
  };
  pdfDownloads: {
    records?: Array<{
      source_id: string;
      status: string;
      stored_file_path?: string | null;
      resolved_pdf_url?: string | null;
    }>;
  };
  evidencePacks: Array<{
    source_id: string;
    snippets?: Array<{ snippet_id: string; label: string; text: string }>;
    assets?: Array<{
      asset_key: string;
      kind: "image" | "equation" | "table";
      title: string;
      caption: string | null;
      file_path: string | null;
      mime_type: string | null;
      text_content: string | null;
      page_number: number | null;
    }>;
  }>;
  evidenceLedger: {
    source_registry?: Array<{
      source_id: string;
      title: string;
    }>;
    snippets?: Array<{
      snippet_id: string;
      source_id: string | null;
      origin: string;
      label: string;
      text: string;
      section_hint_keys?: string[];
      confidence?: number;
    }>;
    assets?: Array<{
      source_id: string;
      asset_key: string;
      title: string;
      kind: "image" | "equation" | "table";
      caption: string | null;
      page_number: number | null;
      file_path: string | null;
      mime_type: string | null;
      text_content: string | null;
    }>;
    assumptions?: Array<{
      assumption_id: string;
      statement: string;
      section_keys?: string[];
    }>;
  };
  masterTemplateRuntime: {
    template_name?: string;
    template_key?: string;
    template_version_id?: string;
    required_section_keys?: string[];
    sections?: Array<{
      semantic_key?: string;
      title?: string;
    }>;
  };
  templateImportContext: {
    source_snapshot?: {
      source_lab?: string;
      lab_state_path?: string;
      latest_consolidated_evidence_path?: string | null;
      materialized_content_dir?: string;
      extracted_assets_dir?: string;
      resolved_materialized_run_id?: string | null;
      resolved_assets_run_id?: string | null;
      resolved_consolidated_run_id?: string | null;
    };
    imported_project_context?: {
      knowledge_area_label?: string | null;
      topic?: string;
      problem_context?: string | null;
      target_population?: string | null;
      preferred_methodology?: string | null;
    };
    imported_evidence_context?: {
      selected_source_count?: number;
      materialized_pdf_count?: number;
      materialized_web_count?: number;
      total_snippet_count?: number;
      total_asset_count?: number;
      evidence_unit_count?: number;
      original_excerpt_count?: number;
      asset_reference_count?: number;
      section_dossier_count?: number;
      overall_readiness?: string | null;
      quality_gate_status?: string | null;
      baseline_comparison_status?: string | null;
    };
    source_id_bridge?: Array<{
      imported_source_id: string;
      fixture_source_id: string | null;
      title: string;
      materialized_source_available?: boolean;
      imported_asset_count?: number;
      imported_direct_excerpt_count?: number;
      has_pdf_materialization?: boolean;
      top_section_keys?: string[];
    }>;
    proposal_context?: {
      method_candidate?: { method_family?: string | null };
      framework_candidate?: { core_framework?: string | null };
      dominant_methods?: string[];
      dominant_frameworks?: string[];
      evidence_gaps?: string[];
    };
    section_alignment_map?: Array<{
      section_key: string;
      template_title: string;
      readiness: string;
      enough_to_draft: boolean;
      mapped_imported_section_keys: string[];
      imported_source_ids: string[];
      recommended_snippet_ids: string[];
      recommended_asset_keys: string[];
      generation_priority: string;
      generation_role: string;
      direct_excerpt_count?: number;
      asset_reference_count?: number;
      has_citable_original_excerpt?: boolean;
      has_critical_assets_candidate?: boolean;
      dominant_evidence_types?: string[];
      dossier_summary?: string | null;
      gap_labels?: string[];
      notes?: string[];
    }>;
    imported_handoff_summary?: {
      ready_for_steps_7_11?: boolean | null;
      quality_gate_status?: string | null;
      baseline_comparison_status?: string | null;
      handoff_notes?: string[];
      traceability_warnings?: string[];
      previous_lab_warnings?: string[];
      read_only_input_paths?: string[];
      next_lab_should_read?: string[];
      next_lab_should_not_modify?: string[];
    };
    checks?: {
      mapped_section_count?: number;
      weak_sections?: string[];
      blocked_sections?: string[];
      missing_local_context?: boolean;
      missing_regulatory_context?: boolean;
      missing_mass_timber_support?: boolean;
      selected_sources_match?: boolean;
      stale_snapshot_detected?: boolean;
    };
    warnings?: string[];
  };
  templateRuntimeInspection?: TemplateRuntimeInspectionArtifact;
  templateQualityContract?: TemplateQualityContractArtifact;
};

function buildAssetPreviewUrl(asset: {
  file_path: string | null;
  mime_type?: string | null;
}) {
  if (!asset.file_path) {
    return null;
  }

  const searchParams = new URLSearchParams({
    path: asset.file_path,
  });

  if (asset.mime_type) {
    searchParams.set("mimeType", asset.mime_type);
  }

  return `/api/labs/master-blueprint/repo-asset?${searchParams.toString()}`;
}

function canRenderAssetAsImage(asset: {
  file_path: string | null;
  mime_type?: string | null;
}) {
  if (!asset.file_path) {
    return false;
  }

  if (asset.mime_type?.startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.file_path);
}

function StatCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {props.label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">{props.value}</p>
    </article>
  );
}

function Pill(props: { children: string }) {
  return (
    <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.72)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
      {props.children}
    </span>
  );
}

function TemplateRuntimeCard(props: {
  title: string;
  entry: TemplateRuntimeInspectionArtifact["master"];
}) {
  const entry = props.entry;

  return (
    <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            {entry.role} / {entry.status}
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
            {props.title}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill>{entry.resolution.source}</Pill>
          <Pill>{entry.identity.citation_style ?? "sin citas"}</Pill>
          <Pill>{entry.identity.review_status ?? "sin review"}</Pill>
        </div>
      </div>

      {entry.error ? (
        <p className="mt-4 rounded-[18px] border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-800">
          {entry.error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatCard label="Template key" value={entry.identity.template_key ?? "sin dato"} />
        <StatCard label="Version DB" value={entry.identity.version_id ?? "sin dato"} />
        <StatCard label="Documento" value={entry.identity.document_kind ?? "sin dato"} />
        <StatCard label="Perfil editorial" value={entry.element_rules.profile_key ?? "sin dato"} />
        <StatCard label="Secciones" value={`${entry.sections.total} / requeridas ${entry.sections.required}`} />
        <StatCard
          label="Semantic keys"
          value={`${entry.sections.semantic_key_count} / explicitas ${entry.sections.explicit_semantic_key_count}`}
        />
        <StatCard label="Sources DB" value={`${entry.db_payload.source_count}`} />
        <StatCard label="Assets DB" value={`${entry.db_payload.asset_count}`} />
      </div>

      <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
        <p><strong>nombre:</strong> {entry.identity.template_name ?? "sin dato"}</p>
        <p><strong>familia:</strong> {entry.identity.template_family ?? "sin dato"}</p>
        <p><strong>universidad:</strong> {entry.identity.university_name ?? "sin dato"}</p>
        <p><strong>programa:</strong> {entry.identity.program_name ?? "sin dato"}</p>
        <p><strong>metodologia:</strong> {entry.identity.methodology_mode ?? "sin dato"}</p>
        <p><strong>missing minimo:</strong> {entry.sections.missing_minimum_semantic_keys.join(", ") || "ninguno"}</p>
        <p><strong>logo:</strong> {entry.cover.primary_asset_key ?? entry.cover.normalized_logo_asset_key ?? "sin asset logo"}</p>
        <p><strong>campos portada:</strong> {entry.cover.field_count} / requeridos {entry.cover.required_field_count}</p>
      </div>

      <div className="mt-4 grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          Reglas editoriales efectivas
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {entry.element_rules.groups.map((group) => (
            <div
              className="rounded-[16px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-3 text-sm leading-6"
              key={group.group}
            >
              <p className="font-semibold text-[var(--color-ink)]">
                {group.group}: {group.complete ? "ok" : "incompleto"}
              </p>
              <p className="text-[var(--color-muted)]">{group.summary}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Assets del template
          </h3>
          <div className="mt-2 grid gap-2">
            {entry.assets.length > 0 ? (
              entry.assets.map((asset) => (
                <p
                  className="rounded-[16px] bg-[rgba(248,244,252,0.68)] p-3 text-xs leading-5 text-[var(--color-ink)]"
                  key={asset.id}
                >
                  <strong>{asset.asset_key}</strong> / {asset.kind} / {asset.mime_type ?? "sin mime"} /{" "}
                  {asset.stored_file_path ?? asset.file_name ?? "sin archivo"}
                </p>
              ))
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Sin assets registrados.</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Fuentes del template
          </h3>
          <div className="mt-2 grid gap-2">
            {entry.sources.length > 0 ? (
              entry.sources.map((source) => (
                <p
                  className="rounded-[16px] bg-[rgba(248,244,252,0.68)] p-3 text-xs leading-5 text-[var(--color-ink)]"
                  key={source.id}
                >
                  <strong>{source.source_id}</strong> / {source.source_type} /{" "}
                  {source.stored_file_path ?? source.file_name ?? "sin archivo"}
                </p>
              ))
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Sin fuentes registradas.</p>
            )}
          </div>
        </div>
      </div>

      {entry.warnings.length > 0 ? (
        <div className="mt-4 rounded-[18px] border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          <strong>warnings:</strong> {entry.warnings.slice(0, 6).join(" | ")}
        </div>
      ) : null}
    </article>
  );
}

function statusClass(status: "pass" | "warn" | "blocked" | string | undefined) {
  if (status === "pass") {
    return "border-emerald-100 bg-emerald-50 text-emerald-900";
  }

  if (status === "blocked") {
    return "border-red-100 bg-red-50 text-red-900";
  }

  return "border-amber-100 bg-amber-50 text-amber-900";
}

function TemplateQualityPanel(props: {
  contract: TemplateQualityContractArtifact;
}) {
  const { contract } = props;
  const topChecks = [
    ...contract.cross_template_checks,
    ...contract.master.checks.filter((check) => check.status !== "pass").slice(0, 4),
    ...contract.institutional.checks.filter((check) => check.status !== "pass").slice(0, 6),
  ];

  return (
    <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            template_quality_contract / {contract.overall_status}
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
            Contrato minimo de calidad
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusClass(contract.overall_status)}`}>
            {contract.overall_status}
          </span>
          <Pill>{`step 8: ${contract.can_continue_step_8 ? "si" : "no"}`}</Pill>
          <Pill>{`docx: ${contract.can_continue_docx_steps ? "si" : "no"}`}</Pill>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Master readiness" value={contract.master.status} />
        <StatCard label="Institutional readiness" value={contract.institutional.status} />
        <StatCard label="Blockers" value={`${contract.blockers.length}`} />
        <StatCard label="Warnings" value={`${contract.warnings.length}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Master
          </h3>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>template:</strong> {contract.master.template_key ?? "sin dato"}</p>
            <p><strong>version:</strong> {contract.master.template_version_id ?? "sin dato"}</p>
            <p><strong>citas:</strong> {contract.master.resolved_citation_style} / {contract.master.citation_style_source}</p>
            <p><strong>puede generar:</strong> {contract.master.can_continue_generation ? "si" : "no"}</p>
            <p><strong>puede renderizar:</strong> {contract.master.can_continue_docx_render ? "si" : "no"}</p>
          </div>
        </div>

        <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            Institucional
          </h3>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
            <p><strong>template:</strong> {contract.institutional.template_key ?? "sin dato"}</p>
            <p><strong>version:</strong> {contract.institutional.template_version_id ?? "sin dato"}</p>
            <p><strong>citas:</strong> {contract.institutional.resolved_citation_style} / {contract.institutional.citation_style_source}</p>
            <p><strong>puede generar:</strong> {contract.institutional.can_continue_generation ? "si" : "no"}</p>
            <p><strong>puede renderizar:</strong> {contract.institutional.can_continue_docx_render ? "si" : "no"}</p>
          </div>
        </div>
      </div>

      {contract.blockers.length > 0 ? (
        <div className="mt-4 rounded-[18px] border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-900">
          <strong>Blockers:</strong> {contract.blockers.join(" | ")}
        </div>
      ) : null}

      {contract.warnings.length > 0 ? (
        <div className="mt-4 rounded-[18px] border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>Warnings:</strong> {contract.warnings.slice(0, 8).join(" | ")}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          Checks relevantes
        </h3>
        {topChecks.length > 0 ? (
          topChecks.map((check) => (
            <div
              className={`rounded-[16px] border p-3 text-sm leading-6 ${statusClass(check.status)}`}
              key={check.id}
            >
              <p className="font-semibold">{check.label} / {check.status}</p>
              <p>{check.message}</p>
              {check.actual ? <p className="text-xs opacity-80">actual: {check.actual}</p> : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Todos los checks criticos pasaron.</p>
        )}
      </div>
    </article>
  );
}

export function Step7Reader({ snapshot }: Step7ReaderProps) {
  const [selectedPanel, setSelectedPanel] = useState<
    "overview" | "templates" | "inputs" | "extracts" | "assets" | "outputs" | "raw"
  >("overview");
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);

  const alignments = snapshot.templateImportContext.section_alignment_map ?? [];
  const selectedAlignment =
    alignments.find((entry) => entry.section_key === selectedSectionKey) ??
    alignments[0] ??
    null;

  const bridge = snapshot.templateImportContext.source_id_bridge ?? [];
  const topBridge = useMemo(() => bridge.slice(0, 6), [bridge]);
  const registry = snapshot.sourceRegistry.source_registry ?? [];
  const snippets = snapshot.evidenceLedger.snippets ?? [];
  const assets = snapshot.evidenceLedger.assets ?? [];
  const sourceTitleById = new Map(
    (snapshot.evidenceLedger.source_registry ?? []).map((entry) => [entry.source_id, entry.title]),
  );
  const pdfBySourceId = new Map(
    (snapshot.pdfDownloads.records ?? []).map((entry) => [entry.source_id, entry]),
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f1ea_0%,#fbf8f3_48%,#f5efe8_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <header className="rounded-[32px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-4xl">
              <Link
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]"
                href="/lab/master-blueprint"
              >
                <ArrowLeft className="size-4" />
                Volver al lab
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                Step 7 / master_template_runtime
              </p>
              <h1 className="mt-2 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
                Step 7 Reader
              </h1>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                Vista exclusiva para desarrollador del handoff importado, el runtime del template y el
                `templateImportContext`. No muestra drafts, planner ni ejecucion de pasos posteriores.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill>{snapshot.fixtureCase}</Pill>
              <Pill>{snapshot.templateImportContext.source_snapshot?.source_lab ?? "sin source_lab"}</Pill>
              <Pill>{snapshot.templateImportContext.imported_evidence_context?.overall_readiness ?? "sin readiness"}</Pill>
              <Pill>{snapshot.templateImportContext.imported_evidence_context?.quality_gate_status ?? "sin gate"}</Pill>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Template" value={snapshot.masterTemplateRuntime.template_name ?? "sin dato"} />
          <StatCard
            label="Secciones runtime"
            value={`${snapshot.masterTemplateRuntime.sections?.length ?? 0}`}
          />
          <StatCard
            label="Mapeo activo"
            value={`${snapshot.templateImportContext.checks?.mapped_section_count ?? 0}`}
          />
          <StatCard
            label="Fuentes seleccionadas"
            value={`${snapshot.templateImportContext.imported_evidence_context?.selected_source_count ?? snapshot.importedOverview.sourceMix.selected}`}
          />
          <StatCard
            label="Evidence units"
            value={`${snapshot.templateImportContext.imported_evidence_context?.evidence_unit_count ?? 0}`}
          />
          <StatCard
            label="Extractos directos"
            value={`${snapshot.templateImportContext.imported_evidence_context?.original_excerpt_count ?? 0}`}
          />
          <StatCard
            label="Assets citables"
            value={`${snapshot.templateImportContext.imported_evidence_context?.asset_reference_count ?? 0}`}
          />
          <StatCard
            label="Dossiers"
            value={`${snapshot.templateImportContext.imported_evidence_context?.section_dossier_count ?? 0}`}
          />
        </section>

        <div className="flex flex-wrap gap-2">
          {[
            ["overview", "Overview"],
            ["templates", "Templates DB"],
            ["inputs", "Inputs"],
            ["extracts", "Extracts"],
            ["assets", "Assets"],
            ["outputs", "Outputs"],
            ["raw", "JSON raw"],
          ].map(([key, label]) => (
            <button
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                selectedPanel === key
                  ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.82)] text-[var(--color-ink)]"
                  : "border-[rgba(74,58,97,0.08)] bg-white/84 text-[var(--color-muted)]"
              }`}
              key={key}
              onClick={() =>
                setSelectedPanel(
                  key as
                    | "overview"
                    | "templates"
                    | "inputs"
                    | "extracts"
                    | "assets"
                    | "outputs"
                    | "raw",
                )
              }
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {selectedPanel === "overview" ? (
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-[var(--color-coral)]" />
                <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  Imported handoff
                </h2>
              </div>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>titulo:</strong> {snapshot.importedOverview.project.title}</p>
                <p><strong>universidad:</strong> {snapshot.importedOverview.project.university ?? "sin dato"}</p>
                <p><strong>programa:</strong> {snapshot.importedOverview.project.program ?? "sin dato"}</p>
                <p><strong>template key:</strong> {snapshot.importedOverview.project.templateKey ?? "sin dato"}</p>
                <p><strong>area:</strong> {snapshot.templateImportContext.imported_project_context?.knowledge_area_label ?? "sin dato"}</p>
                <p><strong>tema:</strong> {snapshot.templateImportContext.imported_project_context?.topic ?? "sin dato"}</p>
                <p><strong>metodologia preferida:</strong> {snapshot.templateImportContext.imported_project_context?.preferred_methodology ?? "sin dato"}</p>
                <p><strong>poblacion:</strong> {snapshot.templateImportContext.imported_project_context?.target_population ?? "sin dato"}</p>
              </div>
            </article>

            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
              <div className="flex items-center gap-2">
                <Waypoints className="size-4 text-[var(--color-coral)]" />
                <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  Resolved snapshot
                </h2>
              </div>
              <div className="mt-4 grid gap-3 break-all text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>lab_state:</strong> {snapshot.templateImportContext.source_snapshot?.lab_state_path ?? "sin dato"}</p>
                <p><strong>consolidated_latest:</strong> {snapshot.templateImportContext.source_snapshot?.latest_consolidated_evidence_path ?? "sin dato"}</p>
                <p><strong>materialized_run:</strong> {snapshot.templateImportContext.source_snapshot?.resolved_materialized_run_id ?? "sin dato"}</p>
                <p><strong>assets_run:</strong> {snapshot.templateImportContext.source_snapshot?.resolved_assets_run_id ?? "sin dato"}</p>
                <p><strong>consolidated_run:</strong> {snapshot.templateImportContext.source_snapshot?.resolved_consolidated_run_id ?? "sin dato"}</p>
              </div>
            </article>

            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
              <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Proposal context
              </h2>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>metodo candidato:</strong> {snapshot.templateImportContext.proposal_context?.method_candidate?.method_family ?? "sin dato"}</p>
                <p><strong>framework candidato:</strong> {snapshot.templateImportContext.proposal_context?.framework_candidate?.core_framework ?? "sin dato"}</p>
                <p><strong>dominant_methods:</strong> {snapshot.templateImportContext.proposal_context?.dominant_methods?.length ?? 0}</p>
                <p><strong>dominant_frameworks:</strong> {snapshot.templateImportContext.proposal_context?.dominant_frameworks?.length ?? 0}</p>
                <p><strong>evidence_gaps:</strong> {snapshot.templateImportContext.proposal_context?.evidence_gaps?.length ?? 0}</p>
              </div>
            </article>

            <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
              <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Checks y warnings
              </h2>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
                <p><strong>selected_sources_match:</strong> {String(snapshot.templateImportContext.checks?.selected_sources_match ?? "sin dato")}</p>
                <p><strong>stale_snapshot_detected:</strong> {String(snapshot.templateImportContext.checks?.stale_snapshot_detected ?? "sin dato")}</p>
                <p><strong>weak_sections:</strong> {(snapshot.templateImportContext.checks?.weak_sections ?? []).join(", ") || "ninguna"}</p>
                <p><strong>blocked_sections:</strong> {(snapshot.templateImportContext.checks?.blocked_sections ?? []).join(", ") || "ninguna"}</p>
                <p><strong>traceability_warnings:</strong> {(snapshot.templateImportContext.imported_handoff_summary?.traceability_warnings ?? []).length}</p>
                <p><strong>warnings:</strong> {(snapshot.templateImportContext.warnings ?? []).length}</p>
              </div>
            </article>
          </div>
        ) : null}

        {selectedPanel === "templates" ? (
          <section className="grid gap-4">
            {snapshot.templateRuntimeInspection ? (
              <>
                {snapshot.templateQualityContract ? (
                  <TemplateQualityPanel contract={snapshot.templateQualityContract} />
                ) : null}

                <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
                  <div className="flex items-center gap-2">
                    <Database className="size-4 text-[var(--color-coral)]" />
                    <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      Inspector read-only de templates
                    </h2>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="LLM"
                      value={snapshot.templateRuntimeInspection.llm_used ? "usado" : "no usado"}
                    />
                    <StatCard
                      label="Read-only"
                      value={snapshot.templateRuntimeInspection.read_only ? "si" : "no"}
                    />
                    <StatCard
                      label="Overlap semantico"
                      value={`${snapshot.templateRuntimeInspection.comparison.semantic_overlap_count}`}
                    />
                    <StatCard
                      label="Fallback institucional"
                      value={
                        snapshot.templateRuntimeInspection.comparison.institutional_uses_generic_fallback
                          ? "si"
                          : "no"
                      }
                    />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
                    <p><strong>project_id:</strong> {snapshot.templateRuntimeInspection.project_context.project_id}</p>
                    <p><strong>template intake:</strong> {snapshot.templateRuntimeInspection.project_context.template_key}</p>
                    <p><strong>institucional igual a master:</strong> {snapshot.templateRuntimeInspection.comparison.institutional_same_version_as_master ? "si" : "no"}</p>
                    <p><strong>faltantes institucionales vs master:</strong> {snapshot.templateRuntimeInspection.comparison.master_required_missing_in_institutional.join(", ") || "ninguno"}</p>
                    <p><strong>warnings:</strong> {snapshot.templateRuntimeInspection.warnings.join(" | ") || "ninguno"}</p>
                  </div>
                </article>

                <div className="grid gap-4 xl:grid-cols-2">
                  <TemplateRuntimeCard
                    entry={snapshot.templateRuntimeInspection.master}
                    title="Master template runtime"
                  />
                  <TemplateRuntimeCard
                    entry={snapshot.templateRuntimeInspection.institutional}
                    title="Institutional template runtime"
                  />
                </div>
              </>
            ) : (
              <article className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5 text-sm leading-7 text-[var(--color-muted)]">
                No hay artifact `templateRuntimeInspection` cargado. Ejecuta Step 7 con el inspector actualizado.
              </article>
            )}
          </section>
        ) : null}

        {selectedPanel === "inputs" ? (
          <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-[var(--color-coral)]" />
              <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Inputs del lab anterior
              </h2>
            </div>
            <div className="mt-4 grid gap-4">
              {registry.map((entry) => {
                const pdfRecord = pdfBySourceId.get(entry.source_id);

                return (
                <article
                  className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4"
                  key={entry.source_id}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    {entry.origin} {entry.year ? `· ${entry.year}` : ""}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-ink)]">{entry.title}</p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                    <p><strong>source_id:</strong> {entry.source_id}</p>
                    <p><strong>reference_id:</strong> {entry.reference_id ?? "sin dato"}</p>
                    <p><strong>pdf_url:</strong> {entry.pdf_url ? "si" : "no"}</p>
                    <p><strong>landing_page_url:</strong> {entry.landing_page_url ? "si" : "no"}</p>
                    <p><strong>pdf status:</strong> {pdfRecord?.status ?? "sin dato"}</p>
                    <p><strong>stored_file_path:</strong> {pdfRecord?.stored_file_path ?? "sin dato"}</p>
                  </div>
                </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedPanel === "extracts" ? (
          <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
            <div className="flex items-center gap-2">
              <ScrollText className="size-4 text-[var(--color-coral)]" />
              <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Extractos y snippets importados
              </h2>
            </div>
            <div className="mt-4 grid gap-4">
              {snippets.map((snippet) => (
                <article
                  className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4"
                  key={snippet.snippet_id}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    {snippet.origin} / {snippet.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-ink)]">
                    {sourceTitleById.get(snippet.source_id ?? "") ?? snippet.source_id ?? "sin fuente"}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                    <p><strong>snippet_id:</strong> {snippet.snippet_id}</p>
                    <p><strong>source_id:</strong> {snippet.source_id ?? "sin dato"}</p>
                    <p><strong>confidence:</strong> {snippet.confidence ?? "sin dato"}</p>
                    <p><strong>section hints:</strong> {snippet.section_hint_keys?.join(", ") || "sin dato"}</p>
                    <pre className="overflow-auto whitespace-pre-wrap rounded-[16px] bg-white/92 p-3 text-xs leading-6">
                      {snippet.text}
                    </pre>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {selectedPanel === "assets" ? (
          <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-[var(--color-coral)]" />
              <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Assets importados
              </h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {assets.map((asset) => {
                const previewUrl = buildAssetPreviewUrl(asset);

                return (
                  <article
                    className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.68)] p-4"
                    key={asset.asset_key}
                  >
                    {previewUrl && canRenderAssetAsImage(asset) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={asset.caption ?? asset.title}
                        className="max-h-[18rem] w-full rounded-[16px] object-contain"
                        src={previewUrl}
                      />
                    ) : null}
                    <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
                      <p><strong>{asset.title}</strong></p>
                      <p><strong>asset_key:</strong> {asset.asset_key}</p>
                      <p><strong>source_id:</strong> {asset.source_id}</p>
                      <p><strong>kind:</strong> {asset.kind}</p>
                      {asset.page_number ? <p><strong>pagina:</strong> {asset.page_number}</p> : null}
                      {asset.caption ? <p><strong>caption:</strong> {asset.caption}</p> : null}
                      {asset.text_content ? (
                        <pre className="overflow-auto whitespace-pre-wrap rounded-[16px] bg-white/92 p-3 text-xs leading-6">
                          {asset.text_content}
                        </pre>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedPanel === "outputs" ? (
          <div className="grid gap-4 xl:grid-cols-[0.34fr_0.66fr]">
            <section className="grid max-h-[42rem] gap-2 overflow-auto rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4">
              {alignments.map((entry) => (
                <button
                  className={`rounded-[20px] border px-4 py-3 text-left ${
                    entry.section_key === selectedAlignment?.section_key
                      ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.82)]"
                      : "border-[rgba(74,58,97,0.08)] bg-white/80"
                  }`}
                  key={entry.section_key}
                  onClick={() => setSelectedSectionKey(entry.section_key)}
                  type="button"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    {entry.generation_role} / {entry.generation_priority}
                  </p>
                  <p className="mt-2 font-semibold text-[var(--color-ink)]">{entry.template_title}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {entry.section_key} / {entry.readiness}
                  </p>
                </button>
              ))}
            </section>

            <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
              {selectedAlignment ? (
                <div className="grid gap-4">
                  <header>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      Section alignment
                    </p>
                    <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                      {selectedAlignment.template_title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                      {selectedAlignment.section_key}
                    </p>
                  </header>

                  <div className="grid gap-4 md:grid-cols-2">
                    <StatCard label="Readiness" value={selectedAlignment.readiness} />
                    <StatCard label="Enough to draft" value={selectedAlignment.enough_to_draft ? "si" : "no"} />
                    <StatCard label="Direct excerpts" value={`${selectedAlignment.direct_excerpt_count ?? 0}`} />
                    <StatCard label="Assets" value={`${selectedAlignment.asset_reference_count ?? 0}`} />
                  </div>

                  <div className="grid gap-3 text-sm leading-6 text-[var(--color-ink)]">
                    <p><strong>mapped imported keys:</strong> {selectedAlignment.mapped_imported_section_keys.join(", ") || "ninguno"}</p>
                    <p><strong>imported source ids:</strong> {selectedAlignment.imported_source_ids.join(", ") || "ninguno"}</p>
                    <p><strong>recommended snippets:</strong> {selectedAlignment.recommended_snippet_ids.length}</p>
                    <p><strong>recommended assets:</strong> {selectedAlignment.recommended_asset_keys.length}</p>
                    <p><strong>dominant evidence types:</strong> {selectedAlignment.dominant_evidence_types?.join(", ") || "sin dato"}</p>
                    <p><strong>dossier summary:</strong> {selectedAlignment.dossier_summary ?? "sin resumen"}</p>
                    <p><strong>gap labels:</strong> {selectedAlignment.gap_labels?.join(", ") || "ninguno"}</p>
                    <p><strong>notes:</strong> {selectedAlignment.notes?.join(" | ") || "sin notas"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">Sin alignment cargado.</p>
              )}
            </section>
          </div>
        ) : null}

        {selectedPanel === "raw" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <JsonViewer title="sourceRegistry" value={snapshot.sourceRegistry} />
            <JsonViewer title="evidenceLedger" value={snapshot.evidenceLedger} />
            <JsonViewer title="masterTemplateRuntime" value={snapshot.masterTemplateRuntime} />
            <JsonViewer title="templateImportContext" value={snapshot.templateImportContext} />
            <JsonViewer
              title="templateRuntimeInspection"
              value={snapshot.templateRuntimeInspection ?? null}
            />
            <JsonViewer
              title="templateQualityContract"
              value={snapshot.templateQualityContract ?? null}
            />
          </div>
        ) : null}

        <section className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-5">
          <div className="flex items-center gap-2">
            <FileJson className="size-4 text-[var(--color-coral)]" />
            <h2 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              Notas para desarrollador
            </h2>
          </div>
          <div className="mt-4 grid gap-2 text-sm leading-7 text-[var(--color-muted)]">
            <p>1. Esta vista debe usarse para validar que el handoff read-only correcto fue cargado.</p>
            <p>2. Si `selected_sources_match` o `stale_snapshot_detected` fallan, no conviene seguir afinando planner o generation aun.</p>
            <p>3. El objetivo del paso 7 es dejar puenteadas fuentes, dossiers, gaps y alignment antes del paso 8.</p>
            <p>4. Si una seccion no muestra `direct_excerpt_count` o `asset_reference_count` esperables, el problema ya empieza aqui.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
