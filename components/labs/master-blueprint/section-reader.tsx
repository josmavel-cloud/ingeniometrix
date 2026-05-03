"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Files,
  ImageIcon,
  ShieldCheck,
} from "lucide-react";

import { JsonViewer } from "@/components/labs/master-blueprint/json-viewer";

type SectionReaderProps = {
  snapshot: SectionReaderSnapshot;
};

type SectionReaderSnapshot = {
  caseName: string;
  runId: string;
  intakeTopic: string | null;
  promptPlan: PromptPlanShape;
  sectionDrafts: SectionDraftArtifact;
  evidenceLedger: EvidenceLedgerInspector;
};

type SectionDraftArtifact = {
  drafts: SectionDraft[];
  referencesWorkingSet?: string[];
};

type SectionDraft = {
  section_key: string;
  title: string;
  phase: string;
  wave?: string;
  generation_strategy?: string;
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
  used_asset_keys?: string[];
  used_reference_ids?: string[];
  citation_policy?: {
    expected_density?: string;
    citation_mode?: string;
  };
  warnings?: string[];
};

type PromptPlanShape = {
  generation_plan?: Array<{
    section_key: string;
    title: string;
    phase: string;
    wave?: string;
    generation_strategy?: string;
    readiness?: string;
    enough_to_draft?: boolean;
    min_words?: number | null;
    max_words?: number | null;
    depends_on_keys?: string[];
  }>;
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
        if (span && typeof span === "object" && "text" in span && typeof span.text === "string") {
          return span.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function WaveLabel(props: { wave?: string }) {
  return (
    <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.76)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
      {props.wave ?? "sin wave"}
    </span>
  );
}

function DraftBlock(props: {
  block: Record<string, unknown>;
  assetLookup: Map<string, EvidenceAsset>;
}) {
  const role = typeof props.block.role === "string" ? props.block.role : "paragraph";
  const text = renderBlockText(props.block);
  const blockId = typeof props.block.block_id === "string" ? props.block.block_id : `${role}-block`;
  const assetRef =
    props.block.asset_ref && typeof props.block.asset_ref === "object"
      ? (props.block.asset_ref as { asset_key?: string; title?: string | null; caption?: string | null })
      : null;
  const structuredData =
    props.block.structured_data && typeof props.block.structured_data === "object"
      ? (props.block.structured_data as {
          schema_type?: string;
          columns?: string[];
          rows?: Array<Array<string | number | boolean | null>>;
        })
      : null;
  const children = Array.isArray(props.block.children)
    ? (props.block.children as Array<Record<string, unknown>>)
    : [];

  if (role === "list") {
    return (
      <ul className="list-disc space-y-2 pl-5 text-[15px] leading-8 text-[var(--color-ink)]" key={blockId}>
        {children.map((child, index) => (
          <li key={`${blockId}-${index}`}>{renderBlockText(child) || "Elemento sin contenido."}</li>
        ))}
      </ul>
    );
  }

  if (role === "table" || structuredData?.schema_type === "table") {
    const asset =
      assetRef?.asset_key ? props.assetLookup.get(assetRef.asset_key) ?? null : null;
    const previewUrl = asset ? buildAssetPreviewUrl(asset) : null;

    const columns = Array.isArray(structuredData?.columns) ? structuredData.columns : [];
    const rows = Array.isArray(structuredData?.rows) ? structuredData.rows : [];

    return (
      <div className="grid gap-3" key={blockId}>
        {asset && previewUrl && canRenderAssetAsImage(asset) ? (
          <figure className="grid gap-3 rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.caption ?? asset.title}
              className="max-h-[28rem] w-full rounded-[16px] object-contain"
              src={previewUrl}
            />
            <figcaption className="text-sm leading-6 text-[var(--color-ink)]">
              <strong>{asset.title}</strong>
              {asset.caption ? <span className="block">{asset.caption}</span> : null}
            </figcaption>
          </figure>
        ) : null}
        <div className="overflow-auto rounded-[20px] border border-[rgba(74,58,97,0.08)]">
          <table className="min-w-full border-collapse bg-white text-sm text-[var(--color-ink)]">
            {columns.length > 0 ? (
              <thead className="bg-[rgba(248,244,252,0.76)]">
                <tr>
                  {columns.map((column) => (
                    <th className="px-3 py-2 text-left font-semibold" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr className="border-t border-[rgba(74,58,97,0.08)]" key={`${blockId}-row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td className="px-3 py-2 align-top leading-6" key={`${blockId}-cell-${rowIndex}-${cellIndex}`}>
                      {cell === null ? "-" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (role === "equation" || structuredData?.schema_type === "equation") {
    const asset =
      assetRef?.asset_key ? props.assetLookup.get(assetRef.asset_key) ?? null : null;
    const previewUrl = asset ? buildAssetPreviewUrl(asset) : null;

    return (
      <div className="grid gap-3" key={blockId}>
        {asset && previewUrl && canRenderAssetAsImage(asset) ? (
          <figure className="grid gap-3 rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.caption ?? asset.title}
              className="max-h-[24rem] w-full rounded-[16px] object-contain"
              src={previewUrl}
            />
            <figcaption className="text-sm leading-6 text-[var(--color-ink)]">
              <strong>{asset.title}</strong>
              {asset.caption ? <span className="block">{asset.caption}</span> : null}
            </figcaption>
          </figure>
        ) : null}
        <pre className="overflow-auto rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.76)] px-4 py-4 text-sm leading-7 text-[var(--color-ink)]">
          {text || "Ecuacion sin representacion textual."}
        </pre>
      </div>
    );
  }

  if (role === "figure" || assetRef?.asset_key) {
    const asset = assetRef?.asset_key ? props.assetLookup.get(assetRef.asset_key) : null;
    const previewUrl = asset ? buildAssetPreviewUrl(asset) : null;

    return (
      <figure className="grid gap-3 rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white p-4" key={blockId}>
        {previewUrl && asset?.mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={asset.caption ?? asset.title}
            className="max-h-[28rem] w-full rounded-[16px] object-contain"
            src={previewUrl}
          />
        ) : null}
        <figcaption className="grid gap-1 text-sm leading-6 text-[var(--color-ink)]">
          <p><strong>{assetRef?.title ?? asset?.title ?? "Asset"}</strong></p>
          <p>{assetRef?.caption ?? asset?.caption ?? asset?.text_content ?? "Sin descripcion disponible."}</p>
          {asset?.page_number ? <p>Pagina {asset.page_number}</p> : null}
        </figcaption>
      </figure>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-[15px] leading-8 text-[var(--color-ink)]" key={blockId}>
      {text || "Bloque sin contenido legible."}
    </p>
  );
}

function AssetViewer(props: { asset: EvidenceAsset | null }) {
  if (!props.asset) {
    return (
      <div className="rounded-[20px] border border-dashed border-[rgba(74,58,97,0.14)] bg-[rgba(248,244,252,0.6)] px-4 py-6 text-sm text-[var(--color-muted)]">
        Esta seccion no tiene assets visibles.
      </div>
    );
  }

  const asset = props.asset;
  const previewUrl = buildAssetPreviewUrl(asset);
  const renderAsImage = previewUrl && canRenderAssetAsImage(asset);

  return (
    <div className="grid gap-4 rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-white/92 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.76)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
          {asset.kind}
        </span>
        {asset.page_number ? (
          <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-[rgba(248,244,252,0.76)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
            pagina {asset.page_number}
          </span>
        ) : null}
      </div>

      {renderAsImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={asset.caption ?? asset.title}
          className="max-h-[20rem] w-full rounded-[16px] object-contain"
          src={previewUrl}
        />
      ) : null}

      {asset.kind === "equation" && !renderAsImage ? (
        <pre className="overflow-auto rounded-[16px] bg-[rgba(248,244,252,0.76)] p-3 text-xs leading-6 text-[var(--color-ink)]">
          {asset.text_content ?? asset.caption ?? asset.title}
        </pre>
      ) : null}

      {asset.kind === "table" && !renderAsImage ? (
        <pre className="overflow-auto whitespace-pre-wrap rounded-[16px] bg-[rgba(248,244,252,0.76)] p-3 text-xs leading-6 text-[var(--color-ink)]">
          {asset.text_content ?? asset.caption ?? asset.title}
        </pre>
      ) : null}

      <div className="grid gap-1 text-sm leading-6 text-[var(--color-ink)]">
        <p><strong>{asset.title}</strong></p>
        {asset.caption ? <p>{asset.caption}</p> : null}
        <p className="text-xs text-[var(--color-muted)]">{asset.asset_key}</p>
      </div>
    </div>
  );
}

export function MasterBlueprintSectionReader(props: SectionReaderProps) {
  const promptPlan = props.snapshot.promptPlan;
  const evidenceLedger = props.snapshot.evidenceLedger;
  const sectionPlans = promptPlan.generation_plan ?? [];
  const generatedDrafts = props.snapshot.sectionDrafts.drafts ?? [];
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(
    sectionPlans[0]?.section_key ?? generatedDrafts[0]?.section_key ?? null,
  );
  const [showRawJson, setShowRawJson] = useState(false);

  const selectedPlan =
    sectionPlans.find((plan) => plan.section_key === selectedSectionKey) ??
    sectionPlans[0] ??
    null;
  const selectedDraft =
    generatedDrafts.find((draft) => draft.section_key === selectedSectionKey) ??
    generatedDrafts[0] ??
    null;

  const assetLookup = useMemo(
    () => new Map((evidenceLedger.assets ?? []).map((asset) => [asset.asset_key, asset])),
    [evidenceLedger.assets],
  );
  const sourceByAnyId = useMemo(() => {
    const map = new Map<string, SourceRegistryEntry>();
    for (const source of evidenceLedger.source_registry ?? []) {
      map.set(source.source_id, source);
      if (source.reference_id) {
        map.set(source.reference_id, source);
      }
    }
    return map;
  }, [evidenceLedger.source_registry]);
  const snippetsById = useMemo(
    () => new Map((evidenceLedger.snippets ?? []).map((snippet) => [snippet.snippet_id, snippet])),
    [evidenceLedger.snippets],
  );
  const assumptionsById = useMemo(
    () => new Map((evidenceLedger.assumptions ?? []).map((assumption) => [assumption.assumption_id, assumption])),
    [evidenceLedger.assumptions],
  );

  const groupedPlans = useMemo(() => {
    const orderByKey = new Map(sectionPlans.map((plan, index) => [plan.section_key, index]));
    const byWave = new Map<string, typeof sectionPlans>();

    for (const plan of sectionPlans) {
      const wave = plan.wave ?? "sin wave";
      const bucket = byWave.get(wave) ?? [];
      bucket.push(plan);
      byWave.set(wave, bucket);
    }

    return Array.from(byWave.entries()).map(([wave, plans]) => [
      wave,
      [...plans].sort(
        (left, right) =>
          (orderByKey.get(left.section_key) ?? Number.MAX_SAFE_INTEGER) -
          (orderByKey.get(right.section_key) ?? Number.MAX_SAFE_INTEGER),
      ),
    ] as const);
  }, [sectionPlans]);

  const referenceWorkingSet = useMemo(
    () =>
      props.snapshot.sectionDrafts.referencesWorkingSet?.length
        ? props.snapshot.sectionDrafts.referencesWorkingSet
        : Array.from(new Set(generatedDrafts.flatMap((draft) => draft.used_reference_ids ?? []))),
    [generatedDrafts, props.snapshot.sectionDrafts.referencesWorkingSet],
  );
  const assetWorkingSet = useMemo(
    () => Array.from(new Set(generatedDrafts.flatMap((draft) => draft.used_asset_keys ?? []))),
    [generatedDrafts],
  );

  const relatedAssets = (selectedDraft?.used_asset_keys ?? [])
    .map((assetKey) => assetLookup.get(assetKey))
    .filter((asset): asset is EvidenceAsset => Boolean(asset));
  const relatedSnippets = (selectedDraft?.evidence_snippet_ids ?? [])
    .map((snippetId) => snippetsById.get(snippetId))
    .filter((snippet): snippet is EvidenceSnippet => Boolean(snippet));
  const relatedAssumptions = (selectedDraft?.supported_assumption_ids ?? [])
    .map((assumptionId) => assumptionsById.get(assumptionId))
    .filter((assumption): assumption is EvidenceAssumption => Boolean(assumption));
  const relatedReferences = Array.from(
    new Map(
      (selectedDraft?.used_reference_ids ?? [])
        .map((referenceId) => sourceByAnyId.get(referenceId))
        .filter((source): source is SourceRegistryEntry => Boolean(source))
        .map((source) => [source.source_id, source]),
    ).values(),
  );

  if (!selectedPlan && !selectedDraft) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1200px] items-center justify-center px-6 py-10">
        <div className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/90 px-8 py-10 text-center">
          <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            No hay secciones disponibles
          </p>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            No se encontro un snapshot valido del paso 9.
          </p>
          <Link className="brand-button-secondary mt-6 inline-flex px-4 py-3 text-sm font-semibold" href="/lab/master-blueprint">
            Volver al lab principal
          </Link>
        </div>
      </main>
    );
  }

  const topStats = {
    sectionCount: sectionPlans.length || generatedDrafts.length,
    generatedCount: generatedDrafts.length,
    referenceCount: referenceWorkingSet.length,
    assetCount: assetWorkingSet.length,
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="brand-kicker">Generated Sections Snapshot</p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
              Step 9 section reader
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)] sm:text-base">
              Visor rapido del ultimo snapshot generado. Cambiar de seccion solo actualiza la lectura local y no vuelve a ejecutar el pipeline.
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--color-ink)]">
              <strong>Tema actual:</strong> {props.snapshot.intakeTopic ?? "sin dato"}
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-ink)]">
              <strong>Snapshot:</strong> {props.snapshot.runId}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="brand-button-secondary inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold" href="/lab/master-blueprint">
              <ArrowLeft className="size-4" />
              Volver al lab
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-[24px] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Secciones</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{topStats.sectionCount}</p>
          </div>
          <div className="rounded-[24px] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Generadas</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{topStats.generatedCount}</p>
          </div>
          <div className="rounded-[24px] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Referencias usadas</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{topStats.referenceCount}</p>
          </div>
          <div className="rounded-[24px] bg-white/88 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Assets usados</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{topStats.assetCount}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="surface-panel rounded-[28px] p-4">
          <div className="mb-4 flex items-center gap-2">
            <Files className="size-4 text-[var(--color-coral)]" />
            <p className="text-sm font-semibold text-[var(--color-ink)]">Section index</p>
          </div>
          <div className="grid gap-4">
            {groupedPlans.map(([wave, wavePlans]) => (
              <section className="grid gap-2" key={wave}>
                <div className="flex items-center justify-between">
                  <WaveLabel wave={wave} />
                  <span className="text-xs text-[var(--color-muted)]">{wavePlans.length}</span>
                </div>
                <div className="grid gap-2">
                  {wavePlans.map((plan) => {
                    const draft = generatedDrafts.find((item) => item.section_key === plan.section_key);
                    return (
                      <button
                        className={`rounded-[20px] border px-4 py-3 text-left ${
                          plan.section_key === (selectedDraft?.section_key ?? selectedPlan?.section_key)
                            ? "border-[rgba(52,20,95,0.14)] bg-[rgba(236,216,255,0.78)]"
                            : "border-[rgba(74,58,97,0.08)] bg-white/78"
                        }`}
                        key={plan.section_key}
                        onClick={() => setSelectedSectionKey(plan.section_key)}
                        type="button"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                          {plan.phase}
                        </p>
                        <p className="mt-2 font-semibold text-[var(--color-ink)]">{plan.title}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                          <span>{plan.generation_strategy ?? draft?.generation_strategy ?? "strategy"}</span>
                          <span>{draft ? "generada" : "pendiente"}</span>
                          <span>deps {(plan.depends_on_keys ?? []).length}</span>
                          {draft ? <span>assets {draft.used_asset_keys?.length ?? 0}</span> : null}
                          {draft && (draft.warnings?.length ?? 0) > 0 ? <span>warnings {draft.warnings?.length}</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <section className="grid gap-5">
          <article className="surface-panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-center gap-3">
              <WaveLabel wave={selectedPlan?.wave ?? selectedDraft?.wave} />
              <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {selectedPlan?.phase ?? selectedDraft?.phase ?? "sin phase"}
              </span>
              <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                {selectedPlan?.generation_strategy ?? selectedDraft?.generation_strategy ?? "sin strategy"}
              </span>
              {selectedDraft ? (
                <span className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                  {selectedDraft.support_level}
                </span>
              ) : null}
            </div>
            <h2 className="mt-4 font-[var(--font-heading)] text-3xl font-semibold text-[var(--color-ink)]">
              {selectedPlan?.title ?? selectedDraft?.title ?? "Seccion"}
            </h2>

            <div className="mt-6 grid gap-5">
              {selectedDraft ? (
                (selectedDraft.content_blocks?.length ?? 0) > 0 ? (
                  selectedDraft.content_blocks!.map((block, index) => (
                    <DraftBlock
                      assetLookup={assetLookup}
                      block={block}
                      key={
                        typeof block.block_id === "string"
                          ? block.block_id
                          : `${selectedDraft.section_key}-block-${index}`
                      }
                    />
                  ))
                ) : (
                  <div className="grid gap-3">
                    <div className="rounded-[18px] border border-dashed border-[rgba(74,58,97,0.14)] bg-[rgba(248,244,252,0.6)] px-4 py-3 text-sm text-[var(--color-muted)]">
                      Seccion sin bloques estructurados; mostrando contenido plano.
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-8 text-[var(--color-ink)]">
                      {selectedDraft.content}
                    </p>
                  </div>
                )
              ) : (
                <div className="grid gap-3">
                  <div className="rounded-[18px] border border-dashed border-[rgba(74,58,97,0.14)] bg-[rgba(248,244,252,0.6)] px-4 py-5 text-sm text-[var(--color-muted)]">
                    Esta seccion no aparece en el snapshot cargado.
                  </div>
                  <div className="grid gap-2 text-sm leading-7 text-[var(--color-ink)]">
                    <p><strong>readiness:</strong> {selectedPlan?.readiness ?? "sin dato"}</p>
                    <p><strong>min_words:</strong> {selectedPlan?.min_words ?? "sin dato"}</p>
                    <p><strong>max_words:</strong> {selectedPlan?.max_words ?? "sin dato"}</p>
                    <p><strong>depends_on:</strong> {(selectedPlan?.depends_on_keys ?? []).join(", ") || "sin dependencias"}</p>
                  </div>
                </div>
              )}
            </div>
          </article>
        </section>

        <aside className="grid gap-5">
          <section className="surface-panel rounded-[28px] p-5">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-[var(--color-coral)]" />
              <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Assets de la seccion
              </h3>
            </div>
            <div className="mt-4 grid gap-3">
              {relatedAssets.length > 0 ? (
                <div className="grid gap-4">
                  {relatedAssets.map((asset) => (
                    <AssetViewer asset={asset} key={asset.asset_key} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">Esta seccion no tiene assets asociados.</p>
              )}
            </div>
          </section>

          <section className="surface-panel rounded-[28px] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-[var(--color-coral)]" />
              <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Trace
              </h3>
            </div>
            <div className="mt-4 grid gap-2 text-sm leading-6 text-[var(--color-ink)]">
              <p><strong>section_key:</strong> {selectedPlan?.section_key ?? selectedDraft?.section_key ?? "sin dato"}</p>
              <p><strong>format:</strong> {selectedDraft?.content_format_version ?? "v1"}</p>
              <p>
                <strong>citation_policy:</strong>{" "}
                {selectedDraft?.citation_policy
                  ? `${selectedDraft.citation_policy.expected_density ?? "na"} / ${selectedDraft.citation_policy.citation_mode ?? "na"}`
                  : "sin dato"}
              </p>
              <p><strong>references:</strong> {selectedDraft?.used_reference_ids?.length ?? 0}</p>
              <p><strong>assets:</strong> {selectedDraft?.used_asset_keys?.length ?? 0}</p>
              <p><strong>snippets:</strong> {selectedDraft?.evidence_snippet_ids.length ?? 0}</p>
              <p><strong>assumptions:</strong> {selectedDraft?.supported_assumption_ids.length ?? 0}</p>
            </div>
          </section>

          <section className="surface-panel rounded-[28px] p-5">
            <div className="flex items-center gap-2">
              <BookOpenText className="size-4 text-[var(--color-coral)]" />
              <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                References used
              </h3>
            </div>
            <div className="mt-4 grid gap-3">
              {selectedDraft && relatedReferences.length > 0 ? (
                relatedReferences.map((reference) => (
                  <article
                    className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-3"
                    key={reference.source_id}
                  >
                    <p className="font-semibold text-[var(--color-ink)]">{reference.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
                      {(reference.authors ?? []).join(", ") || "Autor no disponible"}
                      {reference.year ? ` · ${reference.year}` : ""}
                    </p>
                    <p className="mt-2 break-all text-xs leading-5 text-[var(--color-muted)]">
                      {reference.reference_id ?? reference.source_id}
                    </p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[var(--color-muted)]">Sin referencias vinculadas a esta seccion.</p>
              )}
            </div>
          </section>

          <section className="surface-panel rounded-[28px] p-5">
            <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              Snippets and assumptions
            </h3>
            <div className="mt-4 grid gap-3">
              {selectedDraft && relatedSnippets.length > 0 ? (
                relatedSnippets.slice(0, 8).map((snippet) => (
                  <article
                    className="rounded-[18px] border border-[rgba(74,58,97,0.08)] bg-white/88 p-3"
                    key={snippet.snippet_id}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">
                      {snippet.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">{snippet.text}</p>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[var(--color-muted)]">Sin snippets asociados.</p>
              )}

              {selectedDraft && relatedAssumptions.length > 0 ? (
                <div className="grid gap-2 rounded-[18px] border border-amber-200 bg-amber-50/80 p-3">
                  {relatedAssumptions.map((assumption) => (
                    <p className="text-sm leading-6 text-amber-900" key={assumption.assumption_id}>
                      * {assumption.statement}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface-panel rounded-[28px] p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                Raw JSON
              </h3>
              <button
                className="rounded-full border border-[rgba(74,58,97,0.08)] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]"
                onClick={() => setShowRawJson((current) => !current)}
                type="button"
              >
                {showRawJson ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {showRawJson ? (
              <JsonViewer
                className="mt-4"
                title={`draft: ${selectedPlan?.section_key ?? selectedDraft?.section_key ?? "section"}`}
                value={selectedDraft ?? selectedPlan ?? {}}
              />
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
                Abre el JSON solo si necesitas inspeccion tecnica del draft.
              </p>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}
