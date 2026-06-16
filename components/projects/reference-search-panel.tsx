"use client";

import { useMemo, useState, useTransition } from "react";
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

type ReferenceListItem = {
  id: string;
  selected: boolean;
  selectedOrder: number | null;
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
  if (!label || language !== "en") {
    return label;
  }

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

function mergeReferenceLists(
  current: ReferenceListItem[],
  incoming: ReferenceListItem[],
) {
  if (current.length === 0) {
    return incoming;
  }

  const currentByReferenceId = new Map(
    current.map((item, index) => [item.reference.id, { item, index }] as const),
  );
  const merged = [...current];

  for (const nextItem of incoming) {
    const existing = currentByReferenceId.get(nextItem.reference.id);

    if (!existing) {
      merged.push(nextItem);
      continue;
    }

    const preservedSelection =
      existing.item.selected || existing.item.selectedOrder !== null
        ? {
            selected: existing.item.selected,
            selectedOrder: existing.item.selectedOrder,
          }
        : {
            selected: nextItem.selected,
            selectedOrder: nextItem.selectedOrder,
          };

    merged[existing.index] = {
      ...nextItem,
      ...preservedSelection,
    };
  }

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
  const [isSaving, startSaveTransition] = useTransition();

  const selectedCount = useMemo(
    () => references.filter((reference) => reference.selected).length,
    [references],
  );
  const visibleReferences = useMemo(
    () => references.slice(0, visibleCount),
    [references, visibleCount],
  );
  const nextVisibleTarget = Math.min(visibleCount + REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES);
  const canExpand = visibleCount < Math.min(references.length, MAX_SELECTED_REFERENCES);
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

  function toggleReference(referenceId: string) {
    setReferences((current) => {
      const isSelected = current.find((item) => item.reference.id === referenceId)?.selected;

      if (!isSelected && selectedCount >= MAX_SELECTED_REFERENCES) {
        setError(copy.maxSelected(MAX_SELECTED_REFERENCES));
        return current;
      }

      setError(null);

      const updated = current.map((item) =>
        item.reference.id === referenceId
          ? { ...item, selected: !item.selected }
          : item,
      );

      let order = 1;
      return updated.map((item) =>
        item.selected ? { ...item, selectedOrder: order++ } : { ...item, selectedOrder: null },
      );
    });
  }

  function runSearch(desiredTotal: number) {
    setError(null);
    setMessage(null);
    setInfo(null);

    if (!hasIntakeMinimum) {
      setInfo(copy.minimumIntakeInfo);
      return;
    }

    startSearchTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ desiredTotal }),
      });

      const payload = (await response.json()) as {
        error?: string;
        result?: {
          totalResults: number;
          attemptedQueries: string[];
        };
      };

      if (!response.ok) {
        setError(payload.error ?? copy.searchError);
        return;
      }

      const refreshResponse = await fetch(`/api/projects/${projectId}/references`);
      const refreshPayload = (await refreshResponse.json()) as {
        error?: string;
        references?: ReferenceListItem[];
        searchSnapshot?: ReferenceSearchSnapshot | null;
      };

      if (!refreshResponse.ok || !refreshPayload.references) {
        setError(refreshPayload.error ?? copy.referencesLoadError);
        return;
      }

      let mergedReferencesLength = refreshPayload.references.length;
      let newUniqueCount = refreshPayload.references.length;

      setReferences((current) => {
        const merged = mergeReferenceLists(current, refreshPayload.references ?? []);
        mergedReferencesLength = merged.length;
        newUniqueCount = Math.max(0, merged.length - current.length);
        return merged;
      });
      setSearchSnapshot(refreshPayload.searchSnapshot ?? null);
      setVisibleCount((current) =>
        Math.min(Math.max(current, desiredTotal), mergedReferencesLength),
      );

      const totalResults = payload.result?.totalResults ?? 0;

      if (newUniqueCount > 0 || (references.length === 0 && totalResults > 0)) {
        setMessage(
          desiredTotal > REFERENCE_BATCH_SIZE
            ? copy.addedNew(newUniqueCount)
            : copy.searchCompleted(
                Math.min(mergedReferencesLength, REFERENCE_BATCH_SIZE),
                MIN_SELECTED_REFERENCES,
                MAX_SELECTED_REFERENCES,
              ),
        );
        setInfo(null);
      } else if (mergedReferencesLength > 0) {
        setMessage(null);
        setInfo(copy.noNew);
      } else {
        setMessage(null);
        setInfo(copy.noResults);
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

    if (!hasIntakeMinimum || references.length >= MAX_SELECTED_REFERENCES) {
      return;
    }

    runSearch(nextVisibleTarget);
  }

  function saveSelection() {
    setError(null);
    setMessage(null);
    setInfo(null);

    const selectedReferenceIds = references
      .filter((reference) => reference.selected)
      .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
      .map((reference) => reference.reference.id);

    if (
      selectedReferenceIds.length < MIN_SELECTED_REFERENCES ||
      selectedReferenceIds.length > MAX_SELECTED_REFERENCES
    ) {
      setError(copy.saveRange(MIN_SELECTED_REFERENCES, MAX_SELECTED_REFERENCES));
      return;
    }

    startSaveTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/references`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ selectedReferenceIds }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? copy.saveError);
        return;
      }

      setMessage(copy.saved);
      router.refresh();
    });
  }

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
          <div className="mt-4 grid gap-4">
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
            {copy.emptyTitle}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {copy.emptyBody}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {visibleReferences.map((item) => (
            <article
              className="surface-panel rounded-[28px] p-5"
              key={item.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-600">
                  <input
                    checked={item.selected}
                    className="size-4 rounded border-slate-300 text-lime-500 focus:ring-lime-400"
                    onChange={() => toggleReference(item.reference.id)}
                    type="checkbox"
                  />
                  <span>
                    {item.selectedOrder ? copy.selectedOrder(item.selectedOrder) : copy.notSelected}
                  </span>
                </label>
                <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {renderScoreLabel(item.scoreBreakdown?.label ?? "BAJO", language)} -{" "}
                  {item.relevanceScore?.toFixed(2) ?? "0.00"}
                </div>
              </div>

              <div className="mt-4">
                <h3 className="font-[var(--font-heading)] text-lg font-semibold text-slate-950">
                  {item.reference.translatedTitle ?? item.reference.title}
                </h3>
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
                {item.reference.abstract ? (
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    {(item.reference.translatedAbstract ?? item.reference.abstract).slice(0, 320)}
                    {(item.reference.translatedAbstract ?? item.reference.abstract).length > 320
                      ? "..."
                      : ""}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {item.reference.pdfUrl && item.reference.pdfAccessible ? (
                    <a
                      className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-300 hover:text-rose-800"
                      href={item.reference.pdfUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {copy.pdfLabel}
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
                      <p>
                        {copy.scoreLabel}:{" "}
                        {renderScoreLabel(item.scoreBreakdown?.label, language) ??
                          copy.unavailable}
                      </p>
                      <p>
                        {copy.queryLabel}:{" "}
                        {item.scoreBreakdown?.matchedQuery ?? copy.unavailable}
                      </p>
                      <p>
                        {copy.stage}:{" "}
                        {item.scoreBreakdown?.matchedQueryStage === "necessary_only"
                          ? copy.stageNecessary
                          : item.scoreBreakdown?.matchedQueryStage === "complementary_boosted"
                            ? copy.stageComplementary
                            : copy.stageBackup}
                      </p>
                      <p>
                        {copy.necessaryMatches}:{" "}
                        {item.scoreBreakdown?.necessaryMatches.join(", ") || copy.noStrongMatch}
                      </p>
                      <p>
                        {copy.complementaryMatches}:{" "}
                        {item.scoreBreakdown?.complementaryMatches.join(", ") ||
                          copy.noBoost}
                      </p>
                      <p>
                        {copy.optionalMatches}:{" "}
                        {item.scoreBreakdown?.optionalMatches.join(", ") || copy.noMatch}
                      </p>
                      <p>{copy.recency}: {item.scoreBreakdown?.recencyBand ?? copy.unavailable}</p>
                      <p>
                        {copy.pdfAccessible}:{" "}
                        {item.reference.pdfUrl && item.reference.pdfAccessible ? copy.yes : copy.notVerified}
                      </p>
                      {item.reference.hasAutoTranslation &&
                      item.reference.translatedTitle &&
                      item.reference.translatedTitle !== item.reference.title ? (
                        <p>{copy.originalTitle}: {item.reference.title}</p>
                      ) : null}
                      {item.reference.hasAutoTranslation &&
                      item.reference.translatedAbstract &&
                      item.reference.abstract ? (
                        <p>{copy.originalAbstract}</p>
                      ) : null}
                    </div>
                  </details>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {references.length > 0 && visibleCount < MAX_SELECTED_REFERENCES ? (
        <div className="mt-6 flex justify-start">
          <button
            className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            disabled={isSearching || (!canExpand && references.length >= MAX_SELECTED_REFERENCES)}
            onClick={expandReferences}
            type="button"
          >
            {isSearching
              ? copy.loading
              : canExpand
                ? copy.seeMore(Math.min(REFERENCE_BATCH_SIZE, references.length - visibleCount))
                : copy.searchMore(Math.min(REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES - references.length))}
          </button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-500">{copy.saveHint}</p>
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isSaving || references.length === 0}
          onClick={saveSelection}
          type="button"
        >
          {isSaving ? copy.saving : copy.saveSelection}
        </button>
      </div>
    </section>
  );
}
