"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Search, Sparkles } from "lucide-react";

import { getProjectStatusMeta, getProjectStatusToneClasses } from "@/lib/project-status";
import {
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
    doi: string | null;
    year: number | null;
    venue: string | null;
    abstract: string | null;
    landingPageUrl: string | null;
    authorsJson: unknown;
  };
};

type ReferenceSearchPanelProps = {
  projectId: string;
  status: string;
  initialReferences: ReferenceListItem[];
};

function renderAuthors(authorsJson: unknown) {
  if (!Array.isArray(authorsJson)) {
    return "";
  }

  return authorsJson.filter((author): author is string => typeof author === "string").join(", ");
}

export function ReferenceSearchPanel({
  projectId,
  status,
  initialReferences,
}: ReferenceSearchPanelProps) {
  const router = useRouter();
  const [references, setReferences] = useState(initialReferences);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  const selectedCount = useMemo(
    () => references.filter((reference) => reference.selected).length,
    [references],
  );
  const statusMeta = getProjectStatusMeta(status);

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

  function runSearch() {
    setError(null);
    setMessage(null);
    setInfo(null);

    startSearchTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/search`, {
        method: "POST",
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

      setReferences(refreshPayload.references);

      const totalResults = payload.result?.totalResults ?? 0;

      if (totalResults > 0) {
        setMessage(
          `Busqueda completada. Revisa y selecciona entre ${MIN_SELECTED_REFERENCES} y ${MAX_SELECTED_REFERENCES} fuentes.`,
        );
        setInfo(null);
      } else if ((refreshPayload.references?.length ?? 0) > 0) {
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

      router.refresh();
    });
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
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <Sparkles className="size-3.5 text-lime-500" />
            Fuentes bibliograficas
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            Encuentra y depura tus fuentes semilla.
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Ejecuta la busqueda con OpenAlex y enriquece metadatos con Crossref.
            Luego selecciona entre {MIN_SELECTED_REFERENCES} y {MAX_SELECTED_REFERENCES} referencias para continuar.
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
            disabled={isSearching}
            onClick={runSearch}
            type="button"
          >
            <Search className="mr-2 size-4" />
            {isSearching ? "Buscando..." : "Buscar fuentes"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-600">
          Seleccionadas: <strong>{selectedCount}</strong> / {MAX_SELECTED_REFERENCES}
        </p>
        <p className="text-sm leading-6 text-slate-500">
          El estado pasa a <strong>SOURCES_SELECTED</strong> cuando guardas entre {MIN_SELECTED_REFERENCES} y {MAX_SELECTED_REFERENCES} fuentes.
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {info ? <p className="text-sm text-slate-500">{info}</p> : null}
      </div>

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
          {references.map((item) => (
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
                  {item.reference.title}
                </h3>
                {renderAuthors(item.reference.authorsJson) ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {renderAuthors(item.reference.authorsJson)}
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {[item.reference.venue, item.reference.year].filter(Boolean).join(" | ")}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  DOI: {item.reference.doi ?? "No disponible"}
                </p>
                {item.reference.abstract ? (
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    {item.reference.abstract.slice(0, 320)}
                    {item.reference.abstract.length > 320 ? "..." : ""}
                  </p>
                ) : null}
                {item.reference.landingPageUrl ? (
                  <a
                    className="mt-4 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
                    href={item.reference.landingPageUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Ver fuente
                    <ExternalLink className="ml-2 size-4" />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-500">
          Guarda la seleccion cuando tengas un set semilla suficientemente representativo.
        </p>
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
