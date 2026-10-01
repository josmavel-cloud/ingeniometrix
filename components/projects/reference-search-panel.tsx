"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Search, Sparkles } from "lucide-react";

import type { SupportedLanguage } from "@/lib/language";
import {
  getProjectStatusMetaForLanguage,
  getProjectUiCopy,
} from "@/lib/project-ui-copy";
import { getProjectStatusToneClasses } from "@/lib/project-status";
import {
  REFERENCE_BATCH_SIZE,
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";
import { registerSelectionFlush } from "@/lib/selection-save-queue";

type ReferenceListItem = {
  id: string;
  selected: boolean;
  relevanceTier?: "CORE" | "EXPLORATORY" | "EXCLUDED";
  scientificallyUsable?: boolean;
  selectedOrder: number | null;
  primaryRole?: "DIRECT" | "METHODOLOGICAL" | "THEORETICAL" | "CONTEXTUAL" | "NONE";
  relevanceReason?: string;
  evidenceLevel?: string;
  preparationStatus?: string;
  userUploaded?: boolean;
  relevanceScore: number | null;
  scoreBreakdown: {
    label: "ALTO" | "MEDIO" | "BAJO" | "MINIMO";
    necessaryMatches: string[];
    complementaryMatches: string[];
    optionalMatches: string[];
    recencyBand: string;
    recencyBonus: number;
    matchedQuery: string;
    matchedQueryStage: "necessary_only" | "complementary_boosted" | "optional_backup";
  } | null;
  admission?: { state: "ADMITTED" | "NEEDS_INSPECTION" | "REJECTED_OFF_TOPIC" };
  reference: {
    id: string;
    title: string;
    translatedTitle: string | null;
    doi: string | null;
    year: number | null;
    venue: string | null;
    abstract: string | null;
    translatedAbstract: string | null;
    landingPageUrl: string | null;
    authorsJson: unknown;
    sourceLanguage: string | null;
    displayLanguage: string;
    hasAutoTranslation: boolean;
    pdfUrl: string | null;
    pdfAccessible: boolean;
  };
};

type ReferenceSearchSnapshot = {
  referenceSearchVersion: "v2";
  resultState?: "NO_RELEVANT_INITIAL_RESULTS" | "MORE_FOUND_NEW_RESULTS" | "NO_NEW_RELEVANT_RESULTS" | "SEARCH_SPACE_EXHAUSTED_UNDER_CURRENT_PLAN";
  savedAt: string;
  searchQuery: string;
  attemptedQueries: string[];
  totalResults: number;
  providerBreakdown: {
    openAlex: number;
    crossref: number;
  };
  baseSelectedReferenceIds: string[];
  metadata: {
    planSource: "llm" | "fallback";
    normalizedTopic: string;
    intentSummary: string;
    keywordGroups: {
      necessary: Array<{ label: string; variants: string[] }>;
      complementary: Array<{ label: string; variants: string[] }>;
      optional: Array<{ label: string; variants: string[] }>;
    };
    providerWarnings?: string[];
    queryPack: {
      necessaryOnly: string[];
      complementaryBoosted: string[];
      optionalBackups: string[];
    };
    focusTerms: string[];
    scoringRules: string[];
  };
  references: Array<{
    referenceId: string;
    relevanceScore: number;
    scoreBreakdown: ReferenceListItem["scoreBreakdown"];
    suggestedSelectedOrder: number | null;
  }>;
};

type ReferenceSearchPanelProps = {
  projectId: string;
  status: string;
  hasIntakeMinimum: boolean;
  intakeSnapshot: {
    topic: string;
    problemContext: string;
    targetPopulation: string;
  };
  initialSearchSnapshot: ReferenceSearchSnapshot | null;
  initialReferences: ReferenceListItem[];
  language: SupportedLanguage;
};

function renderAuthors(authorsJson: unknown) {
  if (!Array.isArray(authorsJson)) {
    return "";
  }

  return authorsJson.filter((author): author is string => typeof author === "string").join(", ");
}

function renderScoreLabel(label: string | null | undefined, language: SupportedLanguage) {
  if (!label) return label;
  if (language !== "en") return ({ ALTO: "alta", MEDIO: "media", BAJO: "baja", MINIMO: "mínima" } as Record<string, string>)[label] ?? label;

  if (label === "ALTO") {
    return "HIGH";
  }

  if (label === "MEDIO") {
    return "MEDIUM";
  }

  if (label === "MINIMO") {
    return "MINIMUM";
  }

  return "LOW";
}

const roleLabels: Record<NonNullable<ReferenceListItem["primaryRole"]>, string> = {
  DIRECT: "Directamente relacionada", METHODOLOGICAL: "Antecedente metodológico",
  THEORETICAL: "Marco conceptual/teórico", CONTEXTUAL: "Contexto relevante",
  NONE: "Rol por revisar",
};
function availabilityLabel(item: ReferenceListItem) {
  if (item.preparationStatus === "PREPARED_FULL_TEXT") return "Texto completo disponible";
  if (item.preparationStatus === "IDENTITY_REVIEW_REQUIRED") return "Identidad por revisar";
  if (item.preparationStatus === "FAILED_ACCESS") return "Documento no disponible";
  if (item.evidenceLevel === "ABSTRACT_AVAILABLE") return "Resumen disponible";
  if (item.reference.pdfUrl) return "Enlace a texto/PDF por verificar";
  return "Metadatos disponibles";
}

function mergeReferenceLists(
  current: ReferenceListItem[],
  incoming: ReferenceListItem[],
  pendingSelectedIds: string[] | null = null,
) {
  if (current.length === 0) {
    return incoming;
  }

  const currentByReferenceId = new Map(
    current.map((item) => [item.reference.id, item] as const),
  );
  // Always accept new display fields from the server. Only an unacknowledged
  // local selection may temporarily override the server's checkbox state.
  const merged = incoming.map((item) => {
    const existing = currentByReferenceId.get(item.reference.id);
    return existing && pendingSelectedIds
      ? { ...item, selected: pendingSelectedIds.includes(item.reference.id),
          selectedOrder: pendingSelectedIds.includes(item.reference.id) ? existing.selectedOrder : null }
      : item;
  });
  const incomingIds = new Set(incoming.map((item) => item.reference.id));
  if (pendingSelectedIds) merged.push(...current.filter(item => pendingSelectedIds.includes(item.reference.id) && !incomingIds.has(item.reference.id)));

  return merged;
}

export function ReferenceSearchPanel({
  projectId,
  status,
  hasIntakeMinimum,
  intakeSnapshot,
  initialSearchSnapshot,
  initialReferences,
  language,
}: ReferenceSearchPanelProps) {
  const router = useRouter();
  const copy = getProjectUiCopy(language).sourceSearch;
  const [references, setReferences] = useState(initialReferences);
  const pendingSelectionIds = useRef<string[] | null>(null);
  const refreshSequence = useRef(0);
  const lastDisplayStatus = useRef("");
  const [displayJobs, setDisplayJobs] = useState<Record<string, string>>({});
  useEffect(() => {
    setReferences(current => mergeReferenceLists(current, initialReferences, pendingSelectionIds.current));
  }, [initialReferences]);
  useEffect(() => {
    let mounted = true;
    const endpoint = `/api/projects/${projectId}/reference-display`;
    async function poll() {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok || !mounted) return;
      const jobs = ((await response.json()) as { jobs?: Array<{ status: string; referenceIdsJson: string[] }> }).jobs ?? [];
      const statusKey = JSON.stringify(jobs.map(job => [job.status, job.referenceIdsJson]));
      if (statusKey === lastDisplayStatus.current) return;
      lastDisplayStatus.current = statusKey;
      const states: Record<string, string> = {};
      for (const job of jobs) for (const id of job.referenceIdsJson) states[id] ??= job.status;
      setDisplayJobs(states);
      if (jobs.some(job => job.status === "COMPLETED")) {
        const sequence = ++refreshSequence.current;
        const updated = await fetch(`/api/projects/${projectId}/references`, { cache: "no-store" });
        if (!updated.ok || !mounted || sequence !== refreshSequence.current) return;
        const payload = await updated.json() as { references?: ReferenceListItem[] };
        if (payload.references) setReferences(current => mergeReferenceLists(current, payload.references!, pendingSelectionIds.current));
      }
    }
    void fetch(endpoint, { method: "POST" }).then(() => poll()).catch(() => undefined);
    const interval = window.setInterval(() => { void poll().catch(() => undefined); }, 10_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [projectId]);
  const [searchSnapshot, setSearchSnapshot] = useState<ReferenceSearchSnapshot | null>(
    initialSearchSnapshot,
  );
  const [visibleCount, setVisibleCount] = useState(
    Math.min(initialReferences.length, REFERENCE_BATCH_SIZE),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const searchRequestPending = useRef(false);
  const [isSaving, startSaveTransition] = useTransition();

  const selectedCount = useMemo(
    () => references.filter((reference) => reference.selected).length,
    [references],
  );
  const visibleReferences = useMemo(
    () => [...references].sort((a, b) => Number(a.relevanceTier === "EXPLORATORY") - Number(b.relevanceTier === "EXPLORATORY")).slice(0, visibleCount),
    [references, visibleCount],
  );
  const maxVisibleRecommendations = 40;
  const nextVisibleTarget = Math.min(visibleCount + REFERENCE_BATCH_SIZE, maxVisibleRecommendations);
  const canExpand = visibleCount < Math.min(references.length, maxVisibleRecommendations);
  const statusMeta = getProjectStatusMetaForLanguage(status, language);
  const intakeChecklist = [
    {
      label: copy.topic,
      ready: intakeSnapshot.topic.trim().length > 0,
      value: intakeSnapshot.topic,
    },
    {
      label: copy.problemContext,
      ready: intakeSnapshot.problemContext.trim().length > 0,
      value: intakeSnapshot.problemContext,
    },
    {
      label: copy.targetPopulation,
      ready: intakeSnapshot.targetPopulation.trim().length > 0,
      value: intakeSnapshot.targetPopulation,
    },
  ];

  const persistence = useRef<Promise<void>>(Promise.resolve());
  const persistedIds = useRef(initialReferences.filter(item => item.selected).sort((a,b) => (a.selectedOrder ?? 999) - (b.selectedOrder ?? 999)).map(item => item.reference.id));
  const persistSelection = (items: ReferenceListItem[]) => {
    const ids = items.filter(item => item.selected).sort((a,b) => (a.selectedOrder ?? 999) - (b.selectedOrder ?? 999)).map(item => item.reference.id);
    const pending = persistence.current.catch(() => undefined).then(async () => {
      if (JSON.stringify(ids) === JSON.stringify(persistedIds.current)) return;
      const response = await fetch(`/api/projects/${projectId}/references`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedReferenceIds: ids }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? copy.saveError);
      persistedIds.current = ids;
      if (JSON.stringify(pendingSelectionIds.current) === JSON.stringify(ids)) pendingSelectionIds.current = null;
      window.dispatchEvent(new CustomEvent("imx-selection-saved", { detail: { projectId, count: ids.length } }));
    });
    persistence.current = pending;
    return pending;
  };

  function toggleReference(referenceId: string) {
    const current = selectionForFlush.current;
    const target = current.find(item => item.reference.id === referenceId);
    if (!target || (!target.selected && current.filter(item => item.selected).length >= MAX_SELECTED_REFERENCES)) {
      setError(copy.maxSelected(MAX_SELECTED_REFERENCES)); return;
    }
    setError(null);
    let order = 1;
    const updated = current.map(item => item.reference.id === referenceId ? { ...item, selected: !item.selected } : item)
      .map(item => ({ ...item, selectedOrder: item.selected ? order++ : null }));
    selectionForFlush.current = updated;
    pendingSelectionIds.current = updated.filter(item => item.selected).map(item => item.reference.id);
    setReferences(updated);
    window.dispatchEvent(new CustomEvent("imx-selection-changed", { detail: { projectId, count: order - 1 } }));
    void persistSelection(updated).catch(() => setError("No se guardó la selección. Conservamos tus cambios para reintentarlo antes de continuar."));
  }

  function runSearch(desiredTotal: number, batchKind: "initial" | "more" = "initial") {
    if (isSearching || searchRequestPending.current) return;
    setError(null);
    setMessage(null);
    setInfo(null);

    if (!hasIntakeMinimum) {
      setInfo(copy.minimumIntakeInfo);
      return;
    }

    searchRequestPending.current = true;
    startSearchTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ desiredTotal, batchKind }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          result?: {
            totalResults: number;
            attemptedQueries: string[];
          };
        };

        if (!response.ok) {
          setError(payload.error ?? copy.searchError);
          const retained = await fetch(`/api/projects/${projectId}/references`, { cache: "no-store" }).catch(() => null);
          if (retained?.ok) {
            const partial = await retained.json() as { references?: ReferenceListItem[] };
            if (partial.references) setReferences(current => mergeReferenceLists(current, partial.references!, pendingSelectionIds.current));
          }
          return;
        }

        const refreshResponse = await fetch(`/api/projects/${projectId}/references`);
        const refreshPayload = (await refreshResponse.json().catch(() => ({}))) as {
          error?: string;
          references?: ReferenceListItem[];
          searchSnapshot?: ReferenceSearchSnapshot | null;
        };

        if (!refreshResponse.ok || !refreshPayload.references) {
          setError(refreshPayload.error ?? copy.referencesLoadError);
          return;
        }

        const priorIds = new Set(references.map(item => item.reference.id));
        const newUniqueCount = refreshPayload.references.filter(item => !priorIds.has(item.reference.id)).length;
        const mergedReferencesLength = mergeReferenceLists(references, refreshPayload.references, pendingSelectionIds.current).length;

        setReferences((current) => {
          const merged = mergeReferenceLists(current, refreshPayload.references ?? [], pendingSelectionIds.current);
          return merged;
        });
        setSearchSnapshot(refreshPayload.searchSnapshot ?? null);
        setVisibleCount((current) =>
          Math.min(Math.max(current, desiredTotal), mergedReferencesLength),
        );

        const totalResults = payload.result?.totalResults ?? 0;

        if (newUniqueCount > 0 || (references.length === 0 && totalResults > 0)) {
          setMessage(
            batchKind === "more"
              ? copy.addedNew(newUniqueCount)
              : copy.searchCompleted(
                  Math.min(mergedReferencesLength, REFERENCE_BATCH_SIZE),
                  MIN_SELECTED_REFERENCES,
                  MAX_SELECTED_REFERENCES,
                ),
          );
          setInfo(null);
        } else if (refreshPayload.searchSnapshot?.resultState === "SEARCH_SPACE_EXHAUSTED_UNDER_CURRENT_PLAN") {
          setMessage(null);
          setInfo(copy.searchExhausted);
        } else if (mergedReferencesLength > 0) {
          setMessage(null);
          setInfo(copy.noNew);
        } else {
          setMessage(null);
          setInfo(copy.noResults);
        }
      } catch {
        setError(copy.searchError);
      } finally {
        searchRequestPending.current = false;
      }
    });
  }

  function expandReferences() {
    setError(null);
    setMessage(null);
    setInfo(null);

    if (canExpand) {
      setVisibleCount(nextVisibleTarget);
      return;
    }

    if (!hasIntakeMinimum || references.length >= maxVisibleRecommendations) {
      return;
    }

    runSearch(nextVisibleTarget, "more");
  }

  async function saveSelectionForContinue() {
    await persistSelection(selectionForFlush.current);
    setMessage(copy.saved);
    router.refresh();
  }

  const selectionForFlush = useRef(references);
  selectionForFlush.current = references;
  const flushCallback = useRef(saveSelectionForContinue);
  flushCallback.current = saveSelectionForContinue;
  useEffect(() => registerSelectionFlush(projectId, () => flushCallback.current()), [projectId]);

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <Sparkles className="size-3.5 text-lime-500" />
            {copy.kicker}
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            {copy.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {copy.body(MIN_SELECTED_REFERENCES, MAX_SELECTED_REFERENCES)}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <span
            className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${getProjectStatusToneClasses(status)}`}
          >
            {statusMeta.label}
          </span>
          <button
            className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            disabled={isSearching || !hasIntakeMinimum}
            onClick={() => runSearch(REFERENCE_BATCH_SIZE)}
            type="button"
          >
            <Search className="mr-2 size-4" />
            {isSearching
              ? copy.searching
              : hasIntakeMinimum
                ? copy.search
                : copy.completeIntake}
          </button>
        </div>
      </div>

      <div
        className={`mt-6 rounded-[24px] border px-4 py-4 text-sm leading-6 ${
          hasIntakeMinimum
            ? "border-[rgba(24,169,153,0.16)] bg-[rgba(213,247,239,0.42)] text-[var(--color-ink)]"
            : "border-[rgba(233,87,87,0.12)] bg-[rgba(255,236,238,0.72)] text-[var(--color-ink)]"
        }`}
      >
        {hasIntakeMinimum
          ? copy.intakeReady
          : copy.intakeMissing}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-600">
          {copy.selected}: <strong>{selectedCount}</strong> / {MAX_SELECTED_REFERENCES}
        </p>
        <p className="text-sm leading-6 text-slate-500">
          {copy.showing} <strong>{visibleReferences.length}</strong> {copy.of} <strong>{references.length}</strong>
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {info ? <p className="text-sm text-slate-500">{info}</p> : null}
      </div>

      <details className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {copy.contextSummary}
        </summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {intakeChecklist.map((item) => (
            <article
              className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4"
              key={item.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                {item.ready ? item.value : getProjectUiCopy(language).action.pending}
              </p>
            </article>
          ))}
        </div>
        {searchSnapshot ? (
          <div aria-hidden="true" className="hidden">
            <div className="grid gap-3 lg:grid-cols-3">
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.derivedQuery}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {searchSnapshot.searchQuery}
                </p>
              </article>
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.planner}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {searchSnapshot.metadata.planSource === "llm" ? copy.llm : copy.fallbackPlanner}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {searchSnapshot.metadata.intentSummary}
                </p>
              </article>
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.providers}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  OpenAlex: {searchSnapshot.providerBreakdown.openAlex}
                </p>
                <p className="text-sm leading-6 text-[var(--color-muted)]">
                  Crossref: {searchSnapshot.providerBreakdown.crossref}
                </p>
              </article>
            </div>

            {(searchSnapshot.metadata.providerWarnings ?? []).length > 0 ? (
              <article className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  {copy.providerWarnings}
                </p>
                <div className="mt-2 grid gap-2">
                  {searchSnapshot.metadata.providerWarnings?.map((warning) => (
                    <p className="text-sm leading-6 text-amber-900" key={warning}>
                      {warning}
                    </p>
                  ))}
                </div>
              </article>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-3">
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.necessary}
                </p>
                <div className="mt-2 grid gap-2">
                  {searchSnapshot.metadata.keywordGroups.necessary.map((group) => (
                    <p className="text-sm leading-6 text-[var(--color-muted)]" key={group.label}>
                      <strong>{group.label}:</strong>{" "}
                      {group.variants.join(` ${copy.variantJoiner} `)}
                    </p>
                  ))}
                </div>
              </article>
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.complementary}
                </p>
                <div className="mt-2 grid gap-2">
                  {searchSnapshot.metadata.keywordGroups.complementary.map((group) => (
                    <p className="text-sm leading-6 text-[var(--color-muted)]" key={group.label}>
                      <strong>{group.label}:</strong>{" "}
                      {group.variants.join(` ${copy.variantJoiner} `)}
                    </p>
                  ))}
                </div>
              </article>
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.optional}
                </p>
                <div className="mt-2 grid gap-2">
                  {searchSnapshot.metadata.keywordGroups.optional.length > 0 ? (
                    searchSnapshot.metadata.keywordGroups.optional.map((group) => (
                      <p className="text-sm leading-6 text-[var(--color-muted)]" key={group.label}>
                        <strong>{group.label}:</strong>{" "}
                        {group.variants.join(` ${copy.variantJoiner} `)}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm leading-6 text-[var(--color-muted)]">
                      {copy.noOptional}
                    </p>
                  )}
                </div>
              </article>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.attemptedQueries}
                </p>
                <div className="mt-2 grid gap-2">
                  {searchSnapshot.attemptedQueries.map((query) => (
                    <p className="text-sm leading-6 text-[var(--color-muted)]" key={query}>
                      {query}
                    </p>
                  ))}
                </div>
              </article>
              <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                  {copy.scoreRules}
                </p>
                <div className="mt-2 grid gap-2">
                  {copy.scoreRuleItems.map((rule) => (
                    <p className="text-sm leading-6 text-[var(--color-muted)]" key={rule}>
                      {rule}
                    </p>
                  ))}
                </div>
              </article>
            </div>
          </div>
        ) : null}
      </details>

      {references.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
            {searchSnapshot ? copy.noAdmitted : copy.emptyTitle}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {searchSnapshot ? copy.noResults : copy.emptyBody}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {visibleReferences.map((item, index) => (
            <Fragment key={item.id}>
              {(index === 0 || visibleReferences[index - 1].relevanceTier !== item.relevanceTier) && <h3 className="mt-4 text-lg font-semibold">{item.relevanceTier === "EXPLORATORY" ? "También podrías explorar" : item.relevanceTier === "EXCLUDED" ? "Fuentes seleccionadas pendientes de verificar" : "Más relevantes"}</h3>}
            <article
              className="surface-panel rounded-[28px] p-5"
              key={item.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-600">
                  <input
                    checked={item.selected}
                    className="size-4 rounded border-slate-300 text-[var(--color-plum)] focus:ring-[var(--color-lilac-strong)]"
                    onChange={() => toggleReference(item.reference.id)}
                    type="checkbox"
                  />
                  <span>
                    {item.selectedOrder ? copy.selectedOrder(item.selectedOrder) : copy.notSelected}
                  </span>
                </label>
                <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Relevancia {renderScoreLabel(item.scoreBreakdown?.label ?? "BAJO", language)}
                </div>
              </div>

              <div className="mt-4">
                {item.relevanceTier === "EXPLORATORY" && <p className="mb-3 rounded-xl bg-[var(--color-lilac)]/20 p-3 text-sm">Fuente relacionada, no central. Puede aportar una perspectiva complementaria; conservará esta limitación al preparar el plan.</p>}
                {item.selected && item.admission && item.admission.state !== "ADMITTED" && item.relevanceTier !== "EXPLORATORY" ? (
                  <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    {copy.selectionConflict}
                  </p>
                ) : null}
                <h3 className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {item.reference.title}
                </h3>
                {item.reference.translatedTitle && item.reference.translatedTitle !== item.reference.title &&
                  item.reference.sourceLanguage !== "es" ? <p className="mt-1 text-sm text-[var(--color-muted)]" lang="es">
                    {item.reference.translatedTitle}
                  </p> : null}
                <p className="mt-2 text-sm text-slate-600">{roleLabels[item.primaryRole ?? "NONE"]} · {availabilityLabel(item)}</p>
                {item.relevanceReason ? <p className="mt-2 text-sm leading-6 text-slate-600"><strong>Por qué es relevante para tu investigación: </strong>{item.relevanceReason}</p> : null}
                {item.userUploaded ? <p className="mt-2 text-xs text-amber-800">PDF aportado por ti: su identidad y pertinencia requieren revisión.</p> : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                    {[item.reference.venue, item.reference.year].filter(Boolean).join(" | ") || copy.noDate}
                  </span>
                  {item.reference.abstract ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                      {copy.abstractLabel}
                    </span>
                  ) : null}
                  {item.reference.hasAutoTranslation ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                      {copy.translated}
                    </span>
                  ) : null}
                </div>
                {renderAuthors(item.reference.authorsJson) ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {renderAuthors(item.reference.authorsJson)}
                  </p>
                ) : null}
                <div className="mt-4 text-sm leading-7 text-slate-600">
                  <p className="font-semibold">Resumen del artículo</p>
                  {!item.reference.abstract ? <p>La publicación no ofrece un resumen.</p> :
                    item.reference.sourceLanguage === "es" || item.reference.translatedAbstract ?
                      <p>{(item.reference.translatedAbstract ?? item.reference.abstract).slice(0, 320)}
                        {(item.reference.translatedAbstract ?? item.reference.abstract).length > 320 ? "…" : ""}</p> :
                      <details><summary className="cursor-pointer">{displayJobs[item.reference.id] === "QUEUED" || displayJobs[item.reference.id] === "RUNNING"
                        ? "Traducción en preparación; ver resumen original"
                        : displayJobs[item.reference.id] === "BUDGET_UNAVAILABLE"
                          ? "Traducción no disponible por presupuesto; ver resumen original"
                          : displayJobs[item.reference.id] === "FAILED"
                            ? "No pudimos traducir este resumen; ver original"
                            : "Resumen original disponible; traducción no programada"}</summary>
                        <p lang={item.reference.sourceLanguage ?? undefined}>{item.reference.abstract.slice(0, 320)}</p></details>}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {item.reference.pdfUrl ? (
                    <a
                      className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-300 hover:text-rose-800"
                      href={item.reference.pdfUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Enlace a texto/PDF por verificar
                      <FileText className="ml-2 size-4" />
                    </a>
                  ) : null}

                  {item.reference.landingPageUrl ? (
                    <a
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                      href={item.reference.landingPageUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {copy.viewSource}
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  ) : null}

                  <details className="text-sm text-slate-500">
                    <summary className="cursor-pointer font-semibold text-slate-600">
                      {copy.details}
                    </summary>
                    <div className="mt-3 grid gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                      <p>{copy.doiLabel}: {item.reference.doi ?? copy.unavailable}</p>
                      <p>Relevancia temática: {renderScoreLabel(item.scoreBreakdown?.label, language) ?? copy.unavailable}</p>
                      <p>Año de publicación: {item.reference.year ?? copy.unavailable}</p>
                      <p>Revista o fuente: {item.reference.venue ?? copy.unavailable}</p>
                      <p>
                        {copy.pdfAccessible}:{" "}
                        {item.reference.pdfUrl && item.reference.pdfAccessible ? copy.yes : copy.notVerified}
                      </p>
                      {item.reference.translatedAbstract && item.reference.abstract ?
                        <details><summary className="cursor-pointer">Resumen original</summary>
                          <p lang={item.reference.sourceLanguage ?? undefined}>{item.reference.abstract}</p></details> : null}
                    </div>
                  </details>
                </div>
              </div>
            </article>
            </Fragment>
          ))}
        </div>
      )}

      {searchSnapshot && (references.length === 0 || visibleCount < maxVisibleRecommendations) ? (
        <div className="mt-6 flex justify-start">
          <button
            className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            disabled={isSearching || searchSnapshot.resultState === "SEARCH_SPACE_EXHAUSTED_UNDER_CURRENT_PLAN" ||
              (!canExpand && references.length >= maxVisibleRecommendations)}
            onClick={expandReferences}
            type="button"
          >
            {isSearching
              ? copy.loading
              : canExpand
                ? copy.seeMore(Math.min(REFERENCE_BATCH_SIZE, references.length - visibleCount))
                : copy.searchMore()}
          </button>
        </div>
      ) : null}

      <p className="mt-6 text-sm leading-6 text-[var(--color-muted)]">Tu selección se guarda automáticamente. Puedes elegir hasta 10 fuentes; necesitas al menos 3 utilizables para continuar.</p>
    </section>
  );
}
