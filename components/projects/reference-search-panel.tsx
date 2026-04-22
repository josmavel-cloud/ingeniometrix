"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search, Sparkles } from "lucide-react";

import { getProjectStatusMeta, getProjectStatusToneClasses } from "@/lib/project-status";
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
  };
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
  initialReferences: ReferenceListItem[];
};

function renderAuthors(authorsJson: unknown) {
  if (!Array.isArray(authorsJson)) {
    return "";
  }

  return authorsJson.filter((author): author is string => typeof author === "string").join(", ");
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
  initialReferences,
}: ReferenceSearchPanelProps) {
  const router = useRouter();
  const [references, setReferences] = useState(initialReferences);
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
  const statusMeta = getProjectStatusMeta(status);
  const intakeChecklist = [
    {
      label: "Tema",
      ready: intakeSnapshot.topic.trim().length > 0,
      value: intakeSnapshot.topic,
    },
    {
      label: "Contexto del problema",
      ready: intakeSnapshot.problemContext.trim().length > 0,
      value: intakeSnapshot.problemContext,
    },
    {
      label: "Poblacion objetivo",
      ready: intakeSnapshot.targetPopulation.trim().length > 0,
      value: intakeSnapshot.targetPopulation,
    },
  ];

  function toggleReference(referenceId: string) {
    setReferences((current) => {
      const isSelected = current.find((item) => item.reference.id === referenceId)?.selected;

      if (!isSelected && selectedCount >= MAX_SELECTED_REFERENCES) {
        setError(`Puedes seleccionar hasta ${MAX_SELECTED_REFERENCES} fuentes en esta etapa.`);
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
      setInfo(
        "Completa primero el minimo del intake para que la busqueda tenga suficiente contexto.",
      );
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
        setError(payload.error ?? "No se pudo ejecutar la busqueda.");
        return;
      }

      const refreshResponse = await fetch(`/api/projects/${projectId}/references`);
      const refreshPayload = (await refreshResponse.json()) as {
        error?: string;
        references?: ReferenceListItem[];
      };

      if (!refreshResponse.ok || !refreshPayload.references) {
        setError(refreshPayload.error ?? "No se pudo cargar la lista de fuentes.");
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
      setVisibleCount((current) =>
        Math.min(Math.max(current, desiredTotal), mergedReferencesLength),
      );

      const totalResults = payload.result?.totalResults ?? 0;

      if (newUniqueCount > 0 || (references.length === 0 && totalResults > 0)) {
        setMessage(
          desiredTotal > REFERENCE_BATCH_SIZE
            ? `Anadimos ${newUniqueCount} fuente(s) nueva(s) y mantuvimos tu seleccion actual.`
            : `Busqueda completada. Revisa las primeras ${Math.min(mergedReferencesLength, REFERENCE_BATCH_SIZE)} fuentes y selecciona entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} referencias para continuar.`,
        );
        setInfo(null);
      } else if (mergedReferencesLength > 0) {
        setMessage(null);
        setInfo(
          "No encontramos referencias nuevas en este intento, pero mantuvimos las fuentes ya cargadas en el proyecto.",
        );
      } else {
        setMessage(null);
        setInfo(
          "No encontramos referencias con esta formulacion. Ajusta el intake o vuelve a intentar con un tema mas concreto.",
        );
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
      setError(
        `Debes seleccionar entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes para continuar.`,
      );
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
        setError(payload.error ?? "No se pudo guardar la seleccion.");
        return;
      }

      setMessage("Seleccion de fuentes guardada.");
      router.refresh();
    });
  }

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <Sparkles className="size-3.5 text-lime-500" />
            Fuentes bibliograficas
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            Elige tus fuentes semilla.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Busca, revisa y guarda entre {MIN_SELECTED_REFERENCES} y {MAX_SELECTED_REFERENCES} referencias.
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
              ? "Buscando..."
              : hasIntakeMinimum
                ? "Buscar fuentes"
                : "Completa intake minimo"}
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
          ? "La base ya esta lista para buscar evidencia."
          : "Falta completar tema, problema y poblacion para mejorar la busqueda."}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-600">
          Seleccionadas: <strong>{selectedCount}</strong> / {MAX_SELECTED_REFERENCES}
        </p>
        <p className="text-sm leading-6 text-slate-500">
          Mostrando <strong>{visibleReferences.length}</strong> de <strong>{references.length}</strong>
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
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
      </details>

      {references.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
            Aun no hay referencias cargadas.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Guarda un intake suficiente y ejecuta la busqueda. Si sigue vacio, prueba con un tema menos largo o mas especifico.
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
                    {item.selectedOrder ? `Seleccion ${item.selectedOrder}` : "No seleccionada"}
                  </span>
                </label>
                <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Score {item.relevanceScore?.toFixed(2) ?? "0.00"}
                </div>
              </div>

              <div className="mt-4">
                <h3 className="font-[var(--font-heading)] text-lg font-semibold text-slate-950">
                  {item.reference.translatedTitle ?? item.reference.title}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                    {[item.reference.venue, item.reference.year].filter(Boolean).join(" | ") || "Sin fecha"}
                  </span>
                  {item.reference.abstract ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                      Abstract
                    </span>
                  ) : null}
                  {item.reference.hasAutoTranslation ? (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                      Traducida
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
                  {item.reference.landingPageUrl ? (
                    <a
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                      href={item.reference.landingPageUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Ver fuente
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  ) : null}

                  <details className="text-sm text-slate-500">
                    <summary className="cursor-pointer font-semibold text-slate-600">
                      Ver detalles
                    </summary>
                    <div className="mt-3 grid gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                      <p>DOI: {item.reference.doi ?? "No disponible"}</p>
                      {item.reference.hasAutoTranslation &&
                      item.reference.translatedTitle &&
                      item.reference.translatedTitle !== item.reference.title ? (
                        <p>Titulo original: {item.reference.title}</p>
                      ) : null}
                      {item.reference.hasAutoTranslation &&
                      item.reference.translatedAbstract &&
                      item.reference.abstract ? (
                        <p>Abstract original disponible en el registro recuperado.</p>
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
              ? "Cargando..."
              : canExpand
                ? `Ver ${Math.min(REFERENCE_BATCH_SIZE, references.length - visibleCount)} mas`
                : `Buscar ${Math.min(REFERENCE_BATCH_SIZE, MAX_SELECTED_REFERENCES - references.length)} mas`}
          </button>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-500">Guarda la seleccion para continuar al blueprint.</p>
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isSaving || references.length === 0}
          onClick={saveSelection}
          type="button"
        >
          {isSaving ? "Guardando..." : "Guardar seleccion"}
        </button>
      </div>
    </section>
  );
}
