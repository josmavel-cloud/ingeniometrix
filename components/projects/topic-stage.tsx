"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type TopicSuggestionItem = {
  id: string;
  sourceType: "CATALOG" | "AI_GENERATED" | "USER_SEED";
  title: string;
  researchLine: string | null;
  rationale: string | null;
  selected: boolean;
  primaryConcept: {
    prefLabel: string;
  } | null;
};

type TopicStageProps = {
  projectId: string;
  projectTitle: string;
  topicSeedText: string;
  topicOriginType: "CATALOG" | "CUSTOM" | "HYBRID";
  topicAreaLabel: string | null;
  suggestions: TopicSuggestionItem[];
};

function getSourceLabel(sourceType: TopicSuggestionItem["sourceType"]) {
  if (sourceType === "USER_SEED") {
    return "Tu idea";
  }

  if (sourceType === "AI_GENERATED") {
    return "Generada ahora";
  }

  return "Catalogo";
}

function getSourceToneClassName(sourceType: TopicSuggestionItem["sourceType"]) {
  if (sourceType === "USER_SEED") {
    return "brand-card-lilac";
  }

  if (sourceType === "AI_GENERATED") {
    return "brand-card-mint";
  }

  return "brand-card-gold";
}

function getOriginLabel(originType: TopicStageProps["topicOriginType"]) {
  if (originType === "CUSTOM") {
    return "Idea propia";
  }

  if (originType === "HYBRID") {
    return "Idea propia + catalogo";
  }

  return "Catalogo";
}

export function TopicStage({
  projectId,
  projectTitle,
  topicSeedText,
  topicOriginType,
  topicAreaLabel,
  suggestions,
}: TopicStageProps) {
  const router = useRouter();
  const [items, setItems] = useState(suggestions);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isSelecting, startSelectTransition] = useTransition();

  const selectedSuggestion = useMemo(
    () => items.find((item) => item.selected) ?? null,
    [items],
  );
  const userSeedSuggestion = useMemo(
    () => items.find((item) => item.sourceType === "USER_SEED") ?? null,
    [items],
  );

  function refreshSuggestions() {
    setError(null);
    setMessage(null);

    startRefreshTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/topic-suggestions`, {
        method: "POST",
      });

      const payload = (await response.json()) as {
        error?: string;
        suggestions?: TopicSuggestionItem[];
      };

      if (!response.ok || !payload.suggestions) {
        setError(payload.error ?? "No se pudieron regenerar las ideas.");
        return;
      }

      setItems(payload.suggestions);
      setMessage("Ideas actualizadas correctamente.");
      router.refresh();
    });
  }

  function selectSuggestion(suggestionId: string) {
    setError(null);
    setMessage(null);

    startSelectTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/topic-suggestions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ suggestionId }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo seleccionar el tema.");
        return;
      }

      router.push(`/projects/${projectId}`);
      router.refresh();
    });
  }

  return (
    <section className="grid gap-6">
      <section className="brand-card-primary rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
              Etapa tema
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">
              Elige la base tematica antes de entrar al intake.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/76">
              Aqui ya priorizamos tu idea original. Las otras variantes existen para
              ayudarte a afinarla, no para reemplazarla si ya tienes una direccion
              clara.
            </p>
          </div>

          <div className="rounded-[24px] bg-white/12 px-4 py-4 text-sm leading-6 text-white/84 lg:min-w-[260px]">
            <p>
              <strong>Proyecto:</strong> {projectTitle}
            </p>
            <p>
              <strong>Origen:</strong> {getOriginLabel(topicOriginType)}
            </p>
            <p>
              <strong>Area:</strong> {topicAreaLabel ?? "No especificada"}
            </p>
          </div>
        </div>
      </section>

      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <p className="brand-kicker">Idea semilla</p>
        <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Esta es la idea que usaremos como centro del proyecto.
        </h2>
        <div className="mt-5 rounded-[28px] p-5 brand-card-lilac">
          <p className="text-sm leading-7 text-[rgba(23,19,31,0.78)]">{topicSeedText}</p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {userSeedSuggestion ? (
            <button
              className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
              disabled={isSelecting}
              onClick={() => selectSuggestion(userSeedSuggestion.id)}
              type="button"
            >
              {isSelecting ? "Guardando..." : "Usar mi idea tal como esta"}
            </button>
          ) : null}
          <button
            className="brand-button-secondary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            disabled={isRefreshing}
            onClick={refreshSuggestions}
            type="button"
          >
            {isRefreshing ? "Regenerando..." : "Generar otras ideas"}
          </button>
          {selectedSuggestion ? (
            <Link
              className="brand-button-secondary px-5 py-3 text-sm font-semibold"
              href={`/projects/${projectId}`}
            >
              Continuar al intake
            </Link>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <section className="grid gap-4">
        {items.map((item) => (
          <article
            className={`rounded-[30px] p-5 ${getSourceToneClassName(item.sourceType)}`}
            key={item.id}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/72 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                    {getSourceLabel(item.sourceType)}
                  </span>
                  {item.selected ? (
                    <span className="rounded-full bg-[rgba(23,19,31,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.72)]">
                      Seleccionada
                    </span>
                  ) : null}
                  {item.primaryConcept ? (
                    <span className="rounded-full bg-white/72 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                      {item.primaryConcept.prefLabel}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h3>
                {item.researchLine ? (
                  <p className="mt-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                    Linea sugerida: {item.researchLine}
                  </p>
                ) : null}
                {item.rationale ? (
                  <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
                    {item.rationale}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 lg:min-w-[220px]">
                <button
                  className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                  disabled={isSelecting}
                  onClick={() => selectSuggestion(item.id)}
                  type="button"
                >
                  {isSelecting ? "Guardando..." : "Elegir este tema"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
