"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  CheckCircle2,
  Files,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";

type Step9ReaderProps = {
  caseName: string;
};

type ExecutionResponse = {
  fixtureCase: string;
  artifactRun?: {
    runDir: string;
    runId: string;
    loadedAt: string;
    readOnly: boolean;
  };
  executedThrough: string;
  execution: {
    llmEnabled: boolean;
    llmPolicy: "required" | "disabled";
    providerName: string | null;
    modelName: string | null;
  };
  steps: Array<{
    key: string;
    status: "pending" | "ready" | "executed" | "failed";
    durationMs: number | null;
    executedAt: string | null;
    artifactCount: number;
    warnings: string[];
    error: string | null;
  }>;
  artifacts: {
    promptPlan?: PromptPlanShape;
    sectionDrafts?: SectionDraftArtifact;
    packageQualitySummary?: PackageQualitySummary;
  };
  inspectors: {
    evidenceLedger?: EvidenceLedgerInspector;
  };
};

type PackageQualitySummary = {
  overall_package_score_100?: number;
  component_scores_100?: Record<string, number>;
  gates?: Record<string, unknown>;
  execution?: {
    total_tokens?: number;
    total_cost_cad?: number;
    total_duration_ms?: number;
    total_prompt_chars?: number;
    deterministic_section_count?: number;
    llm_section_count?: number;
  };
  coverage?: Record<string, unknown>;
  worst_sections?: Array<{
    section_key: string;
    wave?: string | null;
    failed_checks?: string[];
    real_fallback?: boolean;
    used_reference_count?: number;
    prompt_chars?: number;
  }>;
};

type PromptPlanShape = {
  generation_plan?: Array<{
    section_key: string;
    title: string;
    phase: string;
    wave?: string;
    generation_strategy?: string;
    prompt_mode?: string;
    readiness?: string;
    enough_to_draft?: boolean;
    min_words?: number | null;
    max_words?: number | null;
    depends_on_keys?: string[];
    critical_asset_keys?: string[];
  }>;
  prompt_manifest?: Array<{
    section_key: string;
    prompt: string;
    evidence_snippet_ids: string[];
    supporting_source_ids: string[];
    supporting_pdf_source_ids: string[];
    supporting_web_source_ids: string[];
    supporting_assumption_ids: string[];
  }>;
};

type SectionDraftArtifact = {
  drafts: SectionDraft[];
  referencesWorkingSet?: {
    reference_ids?: string[];
    asset_keys?: string[];
  };
};

type SectionDraft = {
  section_key: string;
  title: string;
  phase: string;
  wave?: string;
  generation_strategy?: string;
  prompt_mode?: string;
  content: string;
  content_kind?: string;
  content_blocks?: Array<Record<string, unknown>>;
  content_format_version?: string;
  support_level: string;
  supported_source_ids: string[];
  supported_pdf_source_ids: string[];
  supported_web_source_ids: string[];
  supported_assumption_ids: string[];
  evidence_snippet_ids: string[];
  used_evidence_ids?: string[];
  used_original_excerpt_ids?: string[];
  used_asset_keys?: string[];
  used_reference_ids?: string[];
  llm_metrics?: {
    provider: string;
    model: string;
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number;
    cost_cad: number;
    duration_ms: number;
  };
  citation_intents?: Array<{
    reference_id: string;
    source_id: string;
    evidence_id: string | null;
    target_block_id: string | null;
    target_sentence_hint: string | null;
    citation_role: string;
    strength: string;
    insertion_mode: string;
  }>;
  asset_placement_intents?: Array<{
    asset_key: string;
    placement_role: string;
    anchor_block_id: string | null;
    insert_after_block_id: string | null;
    caption_override?: string | null;
    required_for_docx: boolean;
  }>;
  attempt_count?: number;
  retry_reasons?: string[];
  fallback_cause?: string | null;
  quality_checks?: {
    min_words_pass?: boolean;
    max_words_pass?: boolean;
    required_structure_pass?: boolean;
    critical_assets_pass?: boolean;
    claims_guard_pass?: boolean;
    language_pass?: boolean;
    format_contamination_pass?: boolean;
    citation_deferred_pass?: boolean;
    punctuation_pass?: boolean;
  };
  citation_policy?: {
    expected_density?: string;
    citation_mode?: string;
  };
  warnings?: string[];
  prompt?: string;
};

type SourceRegistryEntry = {
  source_id: string;
  reference_id: string | null;
  title: string;
  authors?: string[];
  year?: number | null;
  landing_page_url?: string | null;
};

type EvidenceAsset = {
  source_id: string;
  asset_key: string;
  title: string;
  kind: "image" | "equation" | "table";
  caption: string | null;
  page_number: number | null;
  file_path: string | null;
  mime_type: string | null;
  width_px: number | null;
  height_px: number | null;
  text_content: string | null;
};

type EvidenceSnippet = {
  snippet_id: string;
  source_id?: string | null;
  origin?: string;
  label: string;
  text: string;
};

type EvidenceAssumption = {
  assumption_id: string;
  statement: string;
};

type EvidenceLedgerInspector = {
  source_registry?: SourceRegistryEntry[];
  assets?: EvidenceAsset[];
  snippets?: EvidenceSnippet[];
  assumptions?: EvidenceAssumption[];
};

function buildAssetPreviewUrl(asset: EvidenceAsset) {
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

function canRenderAssetAsImage(asset: EvidenceAsset) {
  if (!asset.file_path) {
    return false;
  }

  if (asset.mime_type?.startsWith("image/")) {
    return true;
  }

  return /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.file_path);
}

function renderBlockText(block: Record<string, unknown>) {
  if (typeof block.text === "string" && block.text.trim().length > 0) {
    return block.text;
  }

  if (Array.isArray(block.spans)) {
    return block.spans
      .map((span) => {
        if (
          span &&
          typeof span === "object" &&
          "text" in span &&
          typeof span.text === "string"
        ) {
          return span.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

export function Step9Reader(props: Step9ReaderProps) {
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "draft" | "evidence" | "assets" | "raw"
  >("overview");
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLatestRun(signal?: AbortSignal) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/labs/master-blueprint/artifacts/latest?caseName=${encodeURIComponent(
          props.caseName,
        )}`,
        { method: "GET", signal },
      );
      const payload = (await response.json()) as ExecutionResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "No se pudo cargar el ultimo run del paso 9.",
        );
      }

      const okPayload = payload as ExecutionResponse;
      setExecution(okPayload);
      const firstSection =
        okPayload.artifacts.sectionDrafts?.drafts.find(
          (draft) => draft.section_key !== "consistency_matrix",
        )?.section_key ?? null;
      setSelectedSectionKey(firstSection);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudo cargar el ultimo run del paso 9.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function runStep9WithLlm() {
    const confirmed = window.confirm(
      "Esta accion ejecutara nuevamente el paso 9 con LLM y puede generar costo. Deseas continuar?",
    );

    if (!confirmed) {
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/labs/master-blueprint/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseName: props.caseName,
          throughStep: "section_generation",
          allowLlm: true,
        }),
      });
      const payload = (await response.json()) as ExecutionResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "No se pudo ejecutar el paso 9.",
        );
      }

      const okPayload = payload as ExecutionResponse;
      setExecution(okPayload);
      const firstSection =
        okPayload.artifacts.sectionDrafts?.drafts.find(
          (draft) => draft.section_key !== "consistency_matrix",
        )?.section_key ?? null;
      setSelectedSectionKey(firstSection);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo ejecutar el paso 9.",
      );
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadLatestRun(controller.signal);

    return () => {
      controller.abort();
    };
  }, [props.caseName]);

  const promptPlan = execution?.artifacts.promptPlan;
  const sectionDrafts = execution?.artifacts.sectionDrafts?.drafts ?? [];
  const evidenceLedger = execution?.inspectors.evidenceLedger;
  const packageQualitySummary = execution?.artifacts.packageQualitySummary;

  const selectedDraft =
    sectionDrafts.find((draft) => draft.section_key === selectedSectionKey) ?? null;
  const planItem =
    promptPlan?.generation_plan?.find(
      (item) => item.section_key === selectedDraft?.section_key,
    ) ?? null;
  const promptManifestItem =
    promptPlan?.prompt_manifest?.find(
      (item) => item.section_key === selectedDraft?.section_key,
    ) ?? null;

  const sourceLookup = useMemo(
    () =>
      new Map(
        (evidenceLedger?.source_registry ?? []).map((source) => [
          source.source_id,
          source,
        ]),
      ),
    [evidenceLedger],
  );

  const snippetLookup = useMemo(
    () =>
      new Map(
        (evidenceLedger?.snippets ?? []).map((snippet) => [
          snippet.snippet_id,
          snippet,
        ]),
      ),
    [evidenceLedger],
  );

  const assetLookup = useMemo(
    () =>
      new Map(
        (evidenceLedger?.assets ?? []).map((asset) => [asset.asset_key, asset]),
      ),
    [evidenceLedger],
  );

  const selectedSnippets =
    selectedDraft?.evidence_snippet_ids
      ?.map((snippetId) => snippetLookup.get(snippetId))
      .filter((snippet): snippet is EvidenceSnippet => Boolean(snippet)) ?? [];

  const selectedAssets =
    selectedDraft?.used_asset_keys
      ?.map((assetKey) => assetLookup.get(assetKey))
      .filter((asset): asset is EvidenceAsset => Boolean(asset)) ?? [];

  const fallbackCount = sectionDrafts.filter(
    (draft) => draft.fallback_cause && draft.fallback_cause !== "deterministic_section",
  ).length;
  const deterministicCount = sectionDrafts.filter(
    (draft) => draft.fallback_cause === "deterministic_section",
  ).length;
  const emptyRetryCount = sectionDrafts.filter(
    (draft) => (draft.attempt_count ?? 0) > 1,
  ).length;
  const totalCadCost = sectionDrafts.reduce(
    (sum, draft) => sum + (draft.llm_metrics?.cost_cad ?? 0),
    0,
  );
  const totalTokens = sectionDrafts.reduce(
    (sum, draft) => sum + (draft.llm_metrics?.total_tokens ?? 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f2ea_0%,#fbf8f2_100%)] text-[var(--color-ink)]">
      <div className="mx-auto max-w-[1500px] px-6 py-10 lg:px-10">
        <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/90 p-6 shadow-[0_16px_60px_rgba(29,21,37,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                Paso 9
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
                Section Generation
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[var(--color-muted)]">
                Inspecciona el ultimo runtime multi-ola generado y deja visibles
                prompts finales, trazabilidad de evidencia, assets, retries,
                fallbacks y quality checks por seccion.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.76)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]"
              disabled={running}
              onClick={runStep9WithLlm}
              type="button"
            >
              <RefreshCw className={`size-4 ${running ? "animate-spin" : ""}`} />
              {running ? "Ejecutando" : "Reejecutar con LLM"}
            </button>
          </div>

          {loading ? (
            <div className="mt-8 flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(248,244,252,0.54)]">
              <LoaderCircle className="size-7 animate-spin text-[var(--color-muted)]" />
              <p className="text-sm text-[var(--color-muted)]">
                Cargando el ultimo run local del paso 9.
              </p>
            </div>
          ) : error ? (
            <div className="mt-8 rounded-[24px] border border-[rgba(184,63,63,0.18)] bg-[rgba(255,244,244,0.92)] p-5">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 size-5 text-[rgb(172,56,56)]" />
                <div className="grid gap-2">
                  <p className="text-sm font-semibold text-[rgb(125,36,36)]">
                    La ejecucion del paso 9 fallo.
                  </p>
                  <p className="text-sm leading-7 text-[rgb(125,36,36)]">{error}</p>
                </div>
              </div>
            </div>
          ) : execution ? (
            <div className="mt-8 grid gap-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <MetricCard label="fixture" value={execution.fixtureCase} icon={<Files className="size-4" />} />
                <MetricCard
                  label="run"
                  value={execution.artifactRun?.runId ?? "runtime"}
                  icon={<Files className="size-4" />}
                />
                <MetricCard
                  label="LLM"
                  value={execution.execution.llmEnabled ? "enabled" : "offline"}
                  icon={<CheckCircle2 className="size-4" />}
                />
                <MetricCard
                  label="provider"
                  value={execution.execution.providerName ?? "sin proveedor"}
                  icon={<BookOpenText className="size-4" />}
                />
                <MetricCard
                  label="drafts"
                  value={String(sectionDrafts.length)}
                  icon={<Files className="size-4" />}
                />
                <MetricCard
                  label="fallbacks"
                  value={String(fallbackCount)}
                  icon={<AlertTriangle className="size-4" />}
                />
                <MetricCard
                  label="deterministic"
                  value={String(deterministicCount)}
                  icon={<CheckCircle2 className="size-4" />}
                />
                <MetricCard
                  label="retries"
                  value={String(emptyRetryCount)}
                  icon={<RefreshCw className="size-4" />}
                />
                <MetricCard
                  label="quality"
                  value={
                    typeof packageQualitySummary?.overall_package_score_100 === "number"
                      ? `${packageQualitySummary.overall_package_score_100.toFixed(2)}/100`
                      : "sin score"
                  }
                  icon={<CheckCircle2 className="size-4" />}
                />
                <MetricCard
                  label="tokens"
                  value={String(totalTokens)}
                  icon={<BookOpenText className="size-4" />}
                />
                <MetricCard
                  label="cost CAD"
                  value={totalCadCost.toFixed(4)}
                  icon={<CheckCircle2 className="size-4" />}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
                  Overview
                </TabButton>
                <TabButton active={activeTab === "draft"} onClick={() => setActiveTab("draft")}>
                  Draft + Prompt
                </TabButton>
                <TabButton active={activeTab === "evidence"} onClick={() => setActiveTab("evidence")}>
                  Evidence
                </TabButton>
                <TabButton active={activeTab === "assets"} onClick={() => setActiveTab("assets")}>
                  Assets
                </TabButton>
                <TabButton active={activeTab === "raw"} onClick={() => setActiveTab("raw")}>
                  JSON raw
                </TabButton>
              </div>

              <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.6)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    Secciones
                  </p>
                  <div className="mt-4 grid gap-2">
                    {sectionDrafts.map((draft) => {
                      const selected = draft.section_key === selectedSectionKey;
                      const words = countWords(draft.content);

                      return (
                        <button
                          className={`grid gap-1 rounded-[18px] px-4 py-3 text-left transition ${
                            selected
                              ? "bg-white shadow-[0_10px_25px_rgba(29,21,37,0.08)]"
                              : "bg-transparent hover:bg-white/70"
                          }`}
                          key={draft.section_key}
                          onClick={() => setSelectedSectionKey(draft.section_key)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-[var(--color-ink)]">
                              {draft.title}
                            </span>
                            <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.86)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                              {draft.wave ?? "sin wave"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                            <span>{words} words</span>
                            <span>{draft.prompt_mode ?? "sin mode"}</span>
                            {draft.fallback_cause ? (
                              <span className="text-[rgb(168,77,36)]">
                                {draft.fallback_cause === "deterministic_section"
                                  ? "deterministic"
                                  : "fallback"}
                              </span>
                            ) : (
                              <span className="text-[rgb(36,124,88)]">llm</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <section className="min-w-0 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-5">
                  {selectedDraft ? (
                    <>
                      {activeTab === "overview" ? (
                        <div className="grid gap-5">
                          <div className="grid gap-2">
                            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-ink)]">
                              {selectedDraft.title}
                            </h2>
                            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                              <span>{selectedDraft.section_key}</span>
                              <span>{selectedDraft.phase}</span>
                              <span>{selectedDraft.wave ?? "sin wave"}</span>
                              <span>{selectedDraft.generation_strategy ?? "sin strategy"}</span>
                              <span>{selectedDraft.prompt_mode ?? "sin prompt_mode"}</span>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <MiniMetric
                              label="Palabras"
                              value={String(countWords(selectedDraft.content))}
                            />
                            <MiniMetric
                              label="Intentos"
                              value={String(selectedDraft.attempt_count ?? 0)}
                            />
                            <MiniMetric
                              label="Sources"
                              value={String(selectedDraft.supported_source_ids.length)}
                            />
                            <MiniMetric
                              label="Assets"
                              value={String(selectedDraft.used_asset_keys?.length ?? 0)}
                            />
                          </div>

                          <InfoCard title="Package quality summary">
                            {packageQualitySummary ? (
                              <div className="grid gap-4 md:grid-cols-2">
                                <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                  <li>
                                    <strong>overall:</strong>{" "}
                                    {typeof packageQualitySummary.overall_package_score_100 === "number"
                                      ? `${packageQualitySummary.overall_package_score_100.toFixed(2)}/100`
                                      : "sin score"}
                                  </li>
                                  <li>
                                    <strong>total tokens:</strong>{" "}
                                    {packageQualitySummary.execution?.total_tokens ?? totalTokens}
                                  </li>
                                  <li>
                                    <strong>cost CAD:</strong>{" "}
                                    {typeof packageQualitySummary.execution?.total_cost_cad === "number"
                                      ? packageQualitySummary.execution.total_cost_cad.toFixed(4)
                                      : totalCadCost.toFixed(4)}
                                  </li>
                                  <li>
                                    <strong>real fallbacks:</strong>{" "}
                                    {String(packageQualitySummary.gates?.real_fallback_count ?? fallbackCount)}
                                  </li>
                                  <li>
                                    <strong>format failures:</strong>{" "}
                                    {String(packageQualitySummary.gates?.format_contamination_failure_count ?? "na")}
                                  </li>
                                  <li>
                                    <strong>citation deferred failures:</strong>{" "}
                                    {String(packageQualitySummary.gates?.citation_deferred_failure_count ?? "na")}
                                  </li>
                                </ul>
                                <div className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                  {Object.entries(
                                    packageQualitySummary.component_scores_100 ?? {},
                                  ).map(([key, value]) => (
                                    <div
                                      className="flex items-center justify-between gap-3 rounded-[14px] border border-[rgba(74,58,97,0.08)] bg-white px-3 py-2"
                                      key={key}
                                    >
                                      <span className="text-[var(--color-muted)]">{key}</span>
                                      <strong>{Number(value).toFixed(2)}</strong>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-muted)]">
                                Sin resumen de calidad del paquete.
                              </p>
                            )}
                          </InfoCard>

                          <div className="grid gap-4 md:grid-cols-2">
                            <InfoCard title="LLM metrics">
                              <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                <li>
                                  <strong>provider:</strong>{" "}
                                  {selectedDraft.llm_metrics?.provider ?? "sin registro"}
                                </li>
                                <li>
                                  <strong>model:</strong>{" "}
                                  {selectedDraft.llm_metrics?.model ?? "sin registro"}
                                </li>
                                <li>
                                  <strong>tokens:</strong>{" "}
                                  {selectedDraft.llm_metrics
                                    ? `${selectedDraft.llm_metrics.input_tokens} in / ${selectedDraft.llm_metrics.output_tokens} out / ${selectedDraft.llm_metrics.total_tokens} total`
                                    : "sin registro"}
                                </li>
                                <li>
                                  <strong>cost:</strong>{" "}
                                  {selectedDraft.llm_metrics
                                    ? `USD ${selectedDraft.llm_metrics.cost_usd.toFixed(6)} / CAD ${selectedDraft.llm_metrics.cost_cad.toFixed(6)}`
                                    : "sin registro"}
                                </li>
                                <li>
                                  <strong>duration:</strong>{" "}
                                  {selectedDraft.llm_metrics
                                    ? `${selectedDraft.llm_metrics.duration_ms} ms`
                                    : "sin registro"}
                                </li>
                              </ul>
                            </InfoCard>
                            <InfoCard title="Citation intents">
                              {selectedDraft.citation_intents?.length ? (
                                <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                  {selectedDraft.citation_intents.map((intent, index) => (
                                    <li key={`${intent.reference_id}-${index}`}>
                                      <strong>{intent.reference_id}</strong> · {intent.citation_role} · {intent.strength}
                                      <span className="block text-[var(--color-muted)]">
                                        block: {intent.target_block_id ?? "sin bloque"} · evidence: {intent.evidence_id ?? "sin evidence_id"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-[var(--color-muted)]">
                                  Sin citation intents registrados.
                                </p>
                              )}
                            </InfoCard>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <InfoCard title="Retry / fallback">
                              <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                <li>
                                  <strong>fallback_cause:</strong>{" "}
                                  {selectedDraft.fallback_cause ?? "sin fallback"}
                                </li>
                                <li>
                                  <strong>retry_reasons:</strong>{" "}
                                  {selectedDraft.retry_reasons?.length
                                    ? selectedDraft.retry_reasons.join(" | ")
                                    : "sin retries"}
                                </li>
                              </ul>
                            </InfoCard>
                            <InfoCard title="Quality checks">
                              <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                {Object.entries(selectedDraft.quality_checks ?? {}).map(
                                  ([key, value]) => (
                                    <li key={key}>
                                      <strong>{key}:</strong> {value ? "pass" : "fail"}
                                    </li>
                                  ),
                                )}
                              </ul>
                            </InfoCard>
                          </div>

                          <InfoCard title="Warnings">
                            {selectedDraft.warnings?.length ? (
                              <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                {selectedDraft.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-[var(--color-muted)]">
                                Sin warnings.
                              </p>
                            )}
                          </InfoCard>

                          <InfoCard title="Plan constraints">
                            <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                              <li>
                                <strong>min_words:</strong>{" "}
                                {planItem?.min_words ?? "no definido"}
                              </li>
                              <li>
                                <strong>max_words:</strong>{" "}
                                {planItem?.max_words ?? "no definido"}
                              </li>
                              <li>
                                <strong>depends_on:</strong>{" "}
                                {planItem?.depends_on_keys?.join(", ") || "sin dependencias"}
                              </li>
                              <li>
                                <strong>critical_assets:</strong>{" "}
                                {planItem?.critical_asset_keys?.join(", ") || "sin assets criticos"}
                              </li>
                            </ul>
                          </InfoCard>
                        </div>
                      ) : null}

                      {activeTab === "draft" ? (
                        <div className="grid gap-5">
                          <InfoCard title="Contenido generado">
                            <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.5)] p-4 text-[15px] leading-8 text-[var(--color-ink)] whitespace-pre-wrap">
                              {selectedDraft.content}
                            </div>
                          </InfoCard>
                          <InfoCard title="Prompt final">
                            <div className="max-h-[38rem] overflow-auto rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.5)] p-4 text-sm leading-7 text-[var(--color-ink)] whitespace-pre-wrap">
                              {selectedDraft.prompt ?? promptManifestItem?.prompt ?? "NO_DISPONIBLE"}
                            </div>
                          </InfoCard>
                        </div>
                      ) : null}

                      {activeTab === "evidence" ? (
                        <div className="grid gap-5">
                          <InfoCard title="Trazabilidad registrada">
                            <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                              <li>
                                <strong>used_evidence_ids:</strong>{" "}
                                {selectedDraft.used_evidence_ids?.join(", ") || "sin registro"}
                              </li>
                              <li>
                                <strong>used_original_excerpt_ids:</strong>{" "}
                                {selectedDraft.used_original_excerpt_ids?.join(", ") || "sin registro"}
                              </li>
                              <li>
                                <strong>evidence_snippet_ids:</strong>{" "}
                                {selectedDraft.evidence_snippet_ids.join(", ") || "sin snippets"}
                              </li>
                              <li>
                                <strong>used_reference_ids:</strong>{" "}
                                {selectedDraft.used_reference_ids?.join(", ") || "sin referencias"}
                              </li>
                            </ul>
                          </InfoCard>

                          <InfoCard title="Snippets usados">
                            {selectedSnippets.length > 0 ? (
                              <div className="grid gap-3">
                                {selectedSnippets.map((snippet) => (
                                  <div
                                    className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white p-4"
                                    key={snippet.snippet_id}
                                  >
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                                      {snippet.snippet_id}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">
                                      {snippet.label}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
                                      {snippet.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-muted)]">
                                No hay snippets registrados para esta seccion.
                              </p>
                            )}
                          </InfoCard>

                          <InfoCard title="Sources asociados">
                            <div className="grid gap-3">
                              {selectedDraft.supported_source_ids.map((sourceId) => {
                                const source = sourceLookup.get(sourceId);
                                return (
                                  <div
                                    className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white p-4"
                                    key={sourceId}
                                  >
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                                      {sourceId}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">
                                      {source?.title ?? "Fuente no localizada en el inspector"}
                                    </p>
                                    <p className="mt-2 text-sm text-[var(--color-muted)]">
                                      {source?.authors?.join(", ") || "Autor no disponible"}
                                      {source?.year ? ` (${source.year})` : ""}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </InfoCard>
                        </div>
                      ) : null}

                      {activeTab === "assets" ? (
                        <div className="grid gap-5">
                          <InfoCard title="Assets usados por la seccion">
                            {selectedAssets.length > 0 ? (
                              <div className="grid gap-4 xl:grid-cols-2">
                                {selectedAssets.map((asset) => {
                                  const previewUrl = buildAssetPreviewUrl(asset);
                                  return (
                                    <div
                                      className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white p-4"
                                      key={asset.asset_key}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                                            {asset.title}
                                          </p>
                                          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">
                                            {asset.kind} · page {asset.page_number ?? "?"}
                                          </p>
                                        </div>
                                        <ImageIcon className="size-4 text-[var(--color-muted)]" />
                                      </div>
                                      {previewUrl && canRenderAssetAsImage(asset) ? (
                                        <div className="mt-3 rounded-[16px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.5)] p-3">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            alt={asset.caption ?? asset.title}
                                            className="max-h-[22rem] w-full rounded-[12px] object-contain"
                                            src={previewUrl}
                                          />
                                        </div>
                                      ) : null}
                                      <div className="mt-3 grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                        <p><strong>asset_key:</strong> {asset.asset_key}</p>
                                        <p><strong>caption:</strong> {asset.caption ?? "sin caption"}</p>
                                        <p><strong>text_content:</strong> {asset.text_content ?? "sin text_content"}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-[var(--color-muted)]">
                                Esta seccion no registro assets usados.
                              </p>
                            )}
                          </InfoCard>
                          <InfoCard title="Asset placement intents">
                            {selectedDraft.asset_placement_intents?.length ? (
                              <ul className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                                {selectedDraft.asset_placement_intents.map((intent) => (
                                  <li key={intent.asset_key}>
                                    <strong>{intent.asset_key}</strong> · {intent.placement_role}
                                    <span className="block text-[var(--color-muted)]">
                                      anchor: {intent.anchor_block_id ?? "sin anchor"} · after: {intent.insert_after_block_id ?? "sin after"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-[var(--color-muted)]">
                                Sin asset placement intents registrados.
                              </p>
                            )}
                          </InfoCard>
                        </div>
                      ) : null}

                      {activeTab === "raw" ? (
                        <div className="grid gap-5">
                          <JsonViewer value={selectedDraft as unknown as Record<string, unknown>} />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-[var(--color-muted)]">
                      No hay seccion seleccionada.
                    </p>
                  )}
                </section>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard(props: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.6)] p-4">
      <div className="flex items-center gap-2 text-[var(--color-muted)]">
        {props.icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
          {props.label}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--color-ink)]">
        {props.value}
      </p>
    </div>
  );
}

function MiniMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.54)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
        {props.label}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">
        {props.value}
      </p>
    </div>
  );
}

function InfoCard(props: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.42)] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
        props.active
          ? "bg-[rgba(236,216,255,0.92)] text-[var(--color-ink)]"
          : "bg-[rgba(248,244,252,0.72)] text-[var(--color-muted)]"
      }`}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );
}
