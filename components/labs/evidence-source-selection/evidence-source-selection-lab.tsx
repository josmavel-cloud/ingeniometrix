"use client";

import {
  AlertTriangle,
  Check,
  Circle,
  ExternalLink,
  FileText,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";

type Candidate = {
  candidate_id: string;
  title: string;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  openalex_id?: string | null;
  crossref_id?: string | null;
  abstract?: string | null;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  open_access_status?: string | null;
  relevance_score?: number | null;
  rank?: number;
  provider?: string;
  reasons?: string[];
  warnings?: string[];
};

type RunListItem = {
  case_id: string;
  case_name: string;
  run_id: string;
  run_folder: string;
  candidate_count: number | null;
  status: string | null;
  selection_status: string;
  updated_at: string;
};

type IntakeFixture = {
  case_name?: string;
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

type SearchSnapshotSummary = {
  search_query?: string;
  attempted_queries?: string[];
  total_results?: number;
  metadata?: {
    planSource?: "llm" | "fallback";
    plannerStatus?: "llm" | "fallback";
    plannerErrorMessage?: string | null;
    knowledgeArea?: string | null;
    normalizedTopic?: string;
    intentSummary?: string;
    keywordGroups?: {
      necessary?: Array<{ label: string; variants: string[] }>;
      complementary?: Array<{ label: string; variants: string[] }>;
      optional?: Array<{ label: string; variants: string[] }>;
    };
    focusTerms?: string[];
    scoringRules?: string[];
  };
};

type RunPayload = {
  run: {
    case_id: string;
    run_id: string;
    run_folder: string;
  };
  candidate_sources: {
    candidates?: Candidate[];
    search_snapshot_summary?: SearchSnapshotSummary;
  };
  run_summary: Record<string, unknown> | null;
  intake_fixture: IntakeFixture | null;
  source_selection_template: {
    instructions_es?: string;
  } | null;
  source_selection: {
    selected_reference_ids?: string[];
    rejected_reference_ids?: string[];
    undecided_reference_ids?: string[];
    reviewer_notes?: string;
    candidate_notes?: Record<string, string>;
  } | null;
};

type CandidateStatus = "selected" | "rejected" | "undecided";

function abstractSnippet(value?: string | null) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sin resumen disponible.";
  return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function renderAuthors(authors: string[] | undefined) {
  return Array.isArray(authors) ? authors.filter(Boolean).join(", ") : "";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatStableTimestamp(value: unknown) {
  if (typeof value !== "string") return "Pendiente";

  const [datePart, timePart] = value.split("T");
  const safeTime = timePart?.replace("Z", "").slice(0, 8) ?? "00:00:00";
  return `${datePart} ${safeTime} UTC`;
}

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "0.00";
}

function getScoreLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "BAJO";
  if (value >= 0.72) return "ALTO";
  if (value >= 0.48) return "MEDIO";
  if (value >= 0.24) return "MINIMO";
  return "BAJO";
}

function getScoreBadgeClasses(value: number | null | undefined) {
  const label = getScoreLabel(value);

  if (label === "ALTO") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (label === "MEDIO") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (label === "MINIMO") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-white text-slate-500";
}

function buildInitialStatuses(payload: RunPayload): Record<string, CandidateStatus> {
  const candidates = payload.candidate_sources.candidates ?? [];
  const selected = new Set(payload.source_selection?.selected_reference_ids ?? []);
  const rejected = new Set(payload.source_selection?.rejected_reference_ids ?? []);

  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.candidate_id,
      selected.has(candidate.candidate_id)
        ? "selected"
        : rejected.has(candidate.candidate_id)
          ? "rejected"
          : "undecided",
    ]),
  );
}

function buildInitialNotes(payload: RunPayload) {
  const savedNotes = payload.source_selection?.candidate_notes ?? {};
  const candidates = payload.candidate_sources.candidates ?? [];

  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.candidate_id,
      savedNotes[candidate.candidate_id] ?? "",
    ]),
  );
}

export function EvidenceSourceSelectionLab() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRunKey, setSelectedRunKey] = useState("");
  const [payload, setPayload] = useState<RunPayload | null>(null);
  const [statuses, setStatuses] = useState<Record<string, CandidateStatus>>({});
  const [candidateNotes, setCandidateNotes] = useState<Record<string, string>>({});
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [visibleCount, setVisibleCount] = useState(REFERENCE_BATCH_SIZE);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);

  async function loadRuns() {
    setLoadingRuns(true);
    setMessage(null);
    setInfo(null);
    try {
      const response = await fetch("/api/labs/evidence-source-selection/runs", {
        cache: "no-store",
      });
      const data = (await response.json()) as { runs?: RunListItem[]; error?: string };

      if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar los runs.");

      const nextRuns = data.runs ?? [];
      setRuns(nextRuns);
      setSelectedRunKey((current) =>
        current || (nextRuns[0] ? `${nextRuns[0].case_id}/${nextRuns[0].run_id}` : ""),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar los runs.");
    } finally {
      setLoadingRuns(false);
    }
  }

  async function loadRun(runKey: string) {
    if (!runKey) {
      setPayload(null);
      return;
    }

    const [caseId, runId] = runKey.split("/");
    setLoadingRun(true);
    setMessage(null);
    setInfo(null);
    setSaveWarnings([]);

    try {
      const response = await fetch(
        `/api/labs/evidence-source-selection/run?caseId=${encodeURIComponent(caseId)}&runId=${encodeURIComponent(runId)}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as RunPayload & { error?: string };

      if (!response.ok) throw new Error(data.error ?? "No se pudo cargar el run.");

      setPayload(data);
      setStatuses(buildInitialStatuses(data));
      setCandidateNotes(buildInitialNotes(data));
      setReviewerNotes(data.source_selection?.reviewer_notes ?? "");
      setVisibleCount(
        Math.min(
          data.candidate_sources.candidates?.length ?? 0,
          REFERENCE_BATCH_SIZE,
        ),
      );
    } catch (error) {
      setPayload(null);
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el run.");
    } finally {
      setLoadingRun(false);
    }
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  useEffect(() => {
    void loadRun(selectedRunKey);
  }, [selectedRunKey]);

  const candidates = useMemo(
    () =>
      [...(payload?.candidate_sources.candidates ?? [])].sort(
        (left, right) => (left.rank ?? 999) - (right.rank ?? 999),
      ),
    [payload],
  );

  const selectedIds = useMemo(
    () =>
      candidates
        .filter((candidate) => statuses[candidate.candidate_id] === "selected")
        .map((candidate) => candidate.candidate_id),
    [candidates, statuses],
  );
  const rejectedIds = useMemo(
    () =>
      candidates
        .filter((candidate) => statuses[candidate.candidate_id] === "rejected")
        .map((candidate) => candidate.candidate_id),
    [candidates, statuses],
  );
  const undecidedIds = useMemo(
    () =>
      candidates
        .filter((candidate) => statuses[candidate.candidate_id] === "undecided")
        .map((candidate) => candidate.candidate_id),
    [candidates, statuses],
  );
  const visibleCandidates = useMemo(
    () => candidates.slice(0, visibleCount),
    [candidates, visibleCount],
  );
  const minSelected =
    payload?.intake_fixture?.source_policy?.min_selected_sources ?? MIN_SELECTED_REFERENCES;
  const maxSelected =
    payload?.intake_fixture?.source_policy?.max_selected_sources ?? MAX_SELECTED_REFERENCES;
  const nextVisibleTarget = Math.min(
    visibleCount + REFERENCE_BATCH_SIZE,
    MAX_SELECTED_REFERENCES,
    candidates.length,
  );
  const canExpand = visibleCount < Math.min(candidates.length, MAX_SELECTED_REFERENCES);
  const localWarnings = [
    selectedIds.length < minSelected
      ? `Seleccion por debajo del minimo recomendado (${minSelected}).`
      : null,
    selectedIds.length > maxSelected
      ? `Seleccion por encima del maximo recomendado (${maxSelected}).`
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  const intake = payload?.intake_fixture?.intake ?? null;
  const projectContext = payload?.intake_fixture?.project_context ?? null;
  const searchSummary = payload?.candidate_sources.search_snapshot_summary ?? null;
  const metadata = searchSummary?.metadata ?? null;
  const hasIntakeMinimum = Boolean(
    intake?.topic?.trim() &&
      intake.problemContext?.trim() &&
      intake.targetPopulation?.trim(),
  );
  const intakeChecklist = [
    {
      label: "Tema",
      ready: Boolean(intake?.topic?.trim()),
      value: intake?.topic ?? "",
    },
    {
      label: "Contexto del problema",
      ready: Boolean(intake?.problemContext?.trim()),
      value: intake?.problemContext ?? "",
    },
    {
      label: "Poblacion objetivo",
      ready: Boolean(intake?.targetPopulation?.trim()),
      value: intake?.targetPopulation ?? "",
    },
  ];
  const keywordGroups = metadata?.keywordGroups ?? {};
  const providerCounts = candidates.reduce(
    (counts, candidate) => {
      const provider = candidate.provider?.toLowerCase();

      if (provider === "openalex") counts.openAlex += 1;
      if (provider === "crossref") counts.crossref += 1;

      return counts;
    },
    { openAlex: 0, crossref: 0 },
  );

  function selectedOrder(candidateId: string) {
    const order = selectedIds.indexOf(candidateId);
    return order >= 0 ? order + 1 : null;
  }

  function toggleCandidateSelection(candidateId: string) {
    setStatuses((current) => {
      const currentStatus = current[candidateId] ?? "undecided";

      if (currentStatus !== "selected" && selectedIds.length >= maxSelected) {
        setMessage(`Puedes seleccionar hasta ${maxSelected} fuentes en esta etapa.`);
        return current;
      }

      setMessage(null);
      setInfo(null);

      return {
        ...current,
        [candidateId]: currentStatus === "selected" ? "undecided" : "selected",
      };
    });
  }

  function markRejected(candidateId: string) {
    setStatuses((current) => ({
      ...current,
      [candidateId]: current[candidateId] === "rejected" ? "undecided" : "rejected",
    }));
    setMessage(null);
    setInfo(null);
  }

  function expandReferences() {
    setMessage(null);
    setInfo(null);

    if (!canExpand) {
      setInfo(
        "Este run no contiene mas candidatos. Ejecuta el script backend de busqueda para generar otra corrida.",
      );
      return;
    }

    setVisibleCount(nextVisibleTarget);
  }

  async function saveSelection() {
    if (!payload) return;

    setSaving(true);
    setMessage(null);
    setInfo(null);
    setSaveWarnings([]);

    try {
      const response = await fetch("/api/labs/evidence-source-selection/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: payload.run.case_id,
          run_id: payload.run.run_id,
          selected_reference_ids: uniqueValues(selectedIds),
          rejected_reference_ids: uniqueValues(rejectedIds),
          undecided_reference_ids: uniqueValues(undecidedIds),
          reviewer_notes: reviewerNotes,
          candidate_notes: candidateNotes,
        }),
      });
      const data = (await response.json()) as { warnings?: string[]; error?: string };

      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la seleccion.");

      setSaveWarnings(data.warnings ?? []);
      setMessage("Seleccion guardada en source-selection.json.");
      await loadRuns();
      await loadRun(`${payload.run.case_id}/${payload.run.run_id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la seleccion.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col gap-6 px-5 py-6 text-[var(--color-ink)]">
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              <Sparkles className="size-3.5 text-lime-500" />
              Fuentes bibliograficas
            </div>
            <h1 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
              Elige tus fuentes semilla.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Revisa el intake, la query derivada y las primeras {REFERENCE_BATCH_SIZE} fuentes
              candidatas. Esta vista conserva el flujo visual de Lab A y guarda solo la seleccion
              humana del run backend.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => void loadRuns()}
              className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
              disabled={loadingRuns}
            >
              <RefreshCw className="mr-2 size-4" />
              {loadingRuns ? "Actualizando..." : "Actualizar runs"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-ink)]">
            Run candidato
            <select
              value={selectedRunKey}
              disabled={loadingRuns}
              onChange={(event) => setSelectedRunKey(event.target.value)}
              className="brand-input text-sm font-normal"
            >
              {runs.length === 0 ? <option value="">Sin runs disponibles</option> : null}
              {runs.map((run) => (
                <option key={`${run.case_id}/${run.run_id}`} value={`${run.case_id}/${run.run_id}`}>
                  {run.case_id} / {run.run_id} ({run.candidate_count ?? "?"} candidatos)
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
              seleccionadas {selectedIds.length}
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
              rechazadas {rejectedIds.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500">
              min/max {minSelected}/{maxSelected}
            </span>
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
            ? "La base ya esta lista para buscar evidencia."
            : "Falta completar tema, problema y poblacion para mejorar la busqueda."}
        </div>

        {payload ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Estado guardado",
                value: stringValue(payload.run_summary?.intake_validation_status) || "pass",
              },
              {
                label: "Guardado",
                value: formatStableTimestamp(payload.run_summary?.completed_at),
              },
              {
                label: "Search query derivada",
                value: searchSummary?.search_query ?? "Pendiente de busqueda",
              },
              {
                label: "Tema",
                value: intake?.topic ?? "Pendiente",
              },
            ].map((item) => (
              <div
                className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 p-4"
                key={item.label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  {item.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink)]">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div
          className={`mt-6 rounded-[24px] border px-4 py-4 text-sm leading-6 ${
            candidates.length > 0
              ? "border-[rgba(24,169,153,0.16)] bg-[rgba(213,247,239,0.42)] text-[var(--color-ink)]"
              : "border-[rgba(233,87,87,0.12)] bg-[rgba(255,236,238,0.72)] text-[var(--color-ink)]"
          }`}
        >
          {candidates.length > 0
            ? `Run cargado con ${candidates.length} candidata(s). Selecciona fuentes recuperadas y deja trazabilidad humana antes de continuar.`
            : "Todavia no hay candidatas cargadas para este run."}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-600">
            Seleccionadas: <strong>{selectedIds.length}</strong> / {maxSelected}
          </p>
          <p className="text-sm leading-6 text-slate-500">
            Mostrando <strong>{visibleCandidates.length}</strong> de{" "}
            <strong>{candidates.length}</strong>
          </p>
        </div>

        <div className="mt-5 grid gap-2">
          {[...localWarnings, ...saveWarnings].length > 0 ? (
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" />
                Alertas de seleccion
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {[...localWarnings, ...saveWarnings].map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {info ? <p className="text-sm text-slate-500">{info}</p> : null}
        </div>

        <details className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
            Ver contexto de busqueda
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
                  {item.ready ? item.value : "Pendiente"}
                </p>
              </article>
            ))}
          </div>

          {payload ? (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Query derivada
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    {searchSummary?.search_query ?? "Pendiente"}
                  </p>
                </article>
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Planner
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    {metadata?.planSource === "llm" ? "LLM" : "Fallback heuristico"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    {metadata?.intentSummary ?? "Sin resumen de intencion."}
                  </p>
                </article>
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Providers
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    OpenAlex: {providerCounts.openAlex}
                  </p>
                  <p className="text-sm leading-6 text-[var(--color-muted)]">
                    Crossref: {providerCounts.crossref}
                  </p>
                </article>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Necesarias
                  </p>
                  <div className="mt-2 grid gap-2">
                    {(keywordGroups.necessary ?? []).map((group) => (
                      <p className="text-sm leading-6 text-[var(--color-muted)]" key={group.label}>
                        <strong>{group.label}:</strong> {group.variants.join(" or ")}
                      </p>
                    ))}
                    {(keywordGroups.necessary ?? []).length === 0 ? (
                      <p className="text-sm leading-6 text-[var(--color-muted)]">
                        Sin grupo necesario para esta corrida.
                      </p>
                    ) : null}
                  </div>
                </article>
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Complementarias
                  </p>
                  <div className="mt-2 grid gap-2">
                    {(keywordGroups.complementary ?? []).map((group) => (
                      <p className="text-sm leading-6 text-[var(--color-muted)]" key={group.label}>
                        <strong>{group.label}:</strong> {group.variants.join(" or ")}
                      </p>
                    ))}
                    {(keywordGroups.complementary ?? []).length === 0 ? (
                      <p className="text-sm leading-6 text-[var(--color-muted)]">
                        Sin grupo complementario para esta corrida.
                      </p>
                    ) : null}
                  </div>
                </article>
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    No obligatorias
                  </p>
                  <div className="mt-2 grid gap-2">
                    {(keywordGroups.optional ?? []).map((group) => (
                      <p className="text-sm leading-6 text-[var(--color-muted)]" key={group.label}>
                        <strong>{group.label}:</strong> {group.variants.join(" or ")}
                      </p>
                    ))}
                    {(keywordGroups.optional ?? []).length === 0 ? (
                      <p className="text-sm leading-6 text-[var(--color-muted)]">
                        Sin grupo opcional para esta corrida.
                      </p>
                    ) : null}
                  </div>
                </article>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Queries intentadas
                  </p>
                  <div className="mt-2 grid gap-2">
                    {(searchSummary?.attempted_queries ?? []).map((query) => (
                      <p className="text-sm leading-6 text-[var(--color-muted)]" key={query}>
                        {query}
                      </p>
                    ))}
                    {(searchSummary?.attempted_queries ?? []).length === 0 ? (
                      <p className="text-sm leading-6 text-[var(--color-muted)]">
                        Sin queries preservadas en el artifact.
                      </p>
                    ) : null}
                  </div>
                </article>
                <article className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                    Proyecto
                  </p>
                  <div className="mt-2 grid gap-2">
                    <p className="text-sm leading-6 text-[var(--color-muted)]">
                      {projectContext?.title ?? "Sin titulo preservado."}
                    </p>
                    <p className="text-sm leading-6 text-[var(--color-muted)]">
                      {projectContext?.university ?? "Sin universidad"} /{" "}
                      {projectContext?.program ?? "Sin programa"}
                    </p>
                    <p className="text-sm leading-6 text-[var(--color-muted)]">
                      {projectContext?.knowledge_area_label ?? "Sin area"}
                    </p>
                  </div>
                </article>
              </div>
            </div>
          ) : null}
        </details>

        {loadingRun ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
            <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
              Cargando run...
            </p>
          </div>
        ) : null}

        {!loadingRun && candidates.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
            <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
              Aun no hay referencias cargadas.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Ejecuta primero el script backend de busqueda de candidatas y vuelve a actualizar runs.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {visibleCandidates.map((candidate) => {
              const currentStatus = statuses[candidate.candidate_id] ?? "undecided";
              const order = selectedOrder(candidate.candidate_id);
              const scoreLabel = getScoreLabel(candidate.relevance_score);
              const scoreClasses = getScoreBadgeClasses(candidate.relevance_score);

              return (
                <article className="surface-panel rounded-[28px] p-5" key={candidate.candidate_id}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <label className="inline-flex items-center gap-3 text-sm font-medium text-slate-600">
                      <input
                        checked={currentStatus === "selected"}
                        className="size-4 rounded border-slate-300 text-lime-500 focus:ring-lime-400"
                        onChange={() => toggleCandidateSelection(candidate.candidate_id)}
                        type="checkbox"
                      />
                      <span>{order ? `Seleccion ${order}` : "No seleccionada"}</span>
                    </label>
                    <div className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] ${scoreClasses}`}>
                      {scoreLabel} | {formatScore(candidate.relevance_score)}
                    </div>
                  </div>

                  <div className="mt-4">
                    <h2 className="font-[var(--font-heading)] text-lg font-semibold text-slate-950">
                      {candidate.title}
                    </h2>
                    <p className="mt-2 break-all text-xs text-slate-500">
                      {candidate.candidate_id}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                        {[candidate.venue, candidate.year].filter(Boolean).join(" | ") || "Sin fecha"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                        {candidate.provider ?? "provider desconocido"}
                      </span>
                      {candidate.abstract ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                          Abstract
                        </span>
                      ) : null}
                      {candidate.open_access_status ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                          {candidate.open_access_status}
                        </span>
                      ) : null}
                    </div>

                    {renderAuthors(candidate.authors) ? (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {renderAuthors(candidate.authors)}
                      </p>
                    ) : null}

                    <p className="mt-4 text-sm leading-7 text-slate-600">
                      {abstractSnippet(candidate.abstract)}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {candidate.pdf_url ? (
                        <a
                          className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:border-rose-300 hover:text-rose-800"
                          href={candidate.pdf_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          PDF
                          <FileText className="ml-2 size-4" />
                        </a>
                      ) : null}

                      {candidate.landing_page_url ? (
                        <a
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                          href={candidate.landing_page_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver fuente
                          <ExternalLink className="ml-2 size-4" />
                        </a>
                      ) : null}

                      <button
                        className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold ${
                          currentStatus === "rejected"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                        }`}
                        onClick={() => markRejected(candidate.candidate_id)}
                        type="button"
                      >
                        {currentStatus === "rejected" ? (
                          <>
                            <X className="mr-2 size-4" />
                            Rechazada
                          </>
                        ) : (
                          <>
                            <Circle className="mr-2 size-4" />
                            Marcar rechazo
                          </>
                        )}
                      </button>

                      <details className="text-sm text-slate-500">
                        <summary className="cursor-pointer font-semibold text-slate-600">
                          Ver detalles
                        </summary>
                        <div className="mt-3 grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                          <p>Rank: {candidate.rank ?? "No disponible"}</p>
                          <p>DOI: {candidate.doi ?? "No disponible"}</p>
                          <p>OpenAlex: {candidate.openalex_id ?? "No disponible"}</p>
                          <p>Crossref: {candidate.crossref_id ?? "No disponible"}</p>
                          <p>PDF: {candidate.pdf_url ? "Disponible en metadata" : "No disponible"}</p>
                          <div>
                            <p className="font-semibold text-slate-600">Razones</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {(candidate.reasons ?? ["Requiere revision humana."]).map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-600">Advertencias</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {(candidate.warnings ?? ["Sin advertencias."]).map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </details>
                    </div>

                    <label className="mt-4 flex flex-col gap-2 text-sm font-semibold text-slate-600">
                      Nota del revisor
                      <textarea
                        value={candidateNotes[candidate.candidate_id] ?? ""}
                        onChange={(event) =>
                          setCandidateNotes((current) => ({
                            ...current,
                            [candidate.candidate_id]: event.target.value,
                          }))
                        }
                        className="brand-textarea min-h-20 text-sm font-normal"
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {candidates.length > 0 && visibleCount < MAX_SELECTED_REFERENCES ? (
          <div className="mt-6 flex justify-start">
            <button
              className="brand-button-secondary px-5 py-3 text-sm font-semibold"
              onClick={expandReferences}
              type="button"
            >
              <Search className="mr-2 size-4" />
              {canExpand
                ? `Ver ${Math.min(REFERENCE_BATCH_SIZE, candidates.length - visibleCount)} mas`
                : "Buscar 5 mas"}
            </button>
          </div>
        ) : null}

        {payload ? (
          <div className="mt-8 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-600">
              Notas generales
              <textarea
                value={reviewerNotes}
                onChange={(event) => setReviewerNotes(event.target.value)}
                className="brand-textarea min-h-24 text-sm font-normal"
              />
            </label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-500">
                Despues de guardar, vuelve al backend y ejecuta el siguiente script de pasos 2-6 cuando este disponible.
              </p>
              <button
                className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                disabled={saving || candidates.length === 0}
                onClick={() => void saveSelection()}
                type="button"
              >
                <Save className="mr-2 size-4" />
                {saving ? "Guardando..." : "Guardar seleccion"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
