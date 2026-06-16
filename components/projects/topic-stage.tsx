"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TopicSuggestionItem = {
  id: string;
  sourceType: "CATALOG" | "AI_GENERATED" | "USER_SEED";
  title: string;
  researchLine: string | null;
  rationale: string | null;
  selected: boolean;
  variantKind: "USER_SEED" | "CATALOG" | "TECHNICAL_REWRITE" | "VARIANT";
  suggestedIntake: {
    researchLine?: string | null;
    problemContext?: string | null;
    targetPopulation?: string | null;
    preferredMethodology?: string | null;
    availableData?: string | null;
    academicConstraints?: string | null;
    advisorNotes?: string | null;
  };
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

function shouldBootstrapSuggestions(items: TopicSuggestionItem[]) {
  return (
    items.length === 0 ||
    items.every((item) => item.sourceType === "USER_SEED")
  );
}

function getSourceLabel(sourceType: TopicSuggestionItem["sourceType"]) {
  if (sourceType === "USER_SEED") {
    return "Tu idea";
  }

  if (sourceType === "AI_GENERATED") {
    return "Generada ahora";
  }

  return "Catalogo";
}

function getVariantLabel(item: TopicSuggestionItem) {
  if (item.variantKind === "TECHNICAL_REWRITE") {
    return "Version tecnica";
  }

  if (item.variantKind === "USER_SEED") {
    return "Idea original";
  }

  if (item.variantKind === "CATALOG") {
    return "Base catalogada";
  }

  return "Variante";
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
  const [isBootstrapping, setIsBootstrapping] = useState(
    shouldBootstrapSuggestions(suggestions),
  );
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
  const generatedSuggestions = useMemo(
    () =>
      items
        .filter((item) => item.sourceType !== "USER_SEED")
        .sort((left, right) => {
          const priority = {
            TECHNICAL_REWRITE: 0,
            VARIANT: 1,
            CATALOG: 2,
            USER_SEED: 3,
          } as const;

          return priority[left.variantKind] - priority[right.variantKind];
        })
        .slice(0, 3),
    [items],
  );

  useEffect(() => {
    if (!shouldBootstrapSuggestions(suggestions)) {
      setIsBootstrapping(false);
      return;
    }

    let isCancelled = false;
    setIsBootstrapping(true);

    void (async () => {
      const response = await fetch(`/api/projects/${projectId}/topic-suggestions`);
      const payload = (await response.json()) as {
        error?: string;
        suggestions?: TopicSuggestionItem[];
      };

      if (isCancelled) {
        return;
      }

      if (!response.ok || !payload.suggestions) {
        setError(payload.error ?? "No se pudieron preparar las ideas relacionadas.");
        setIsBootstrapping(false);
        return;
      }

      setItems(payload.suggestions);
      setIsBootstrapping(false);
    })();

    return () => {
      isCancelled = true;
    };
  }, [projectId, suggestions]);

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

  function updateSuggestionField(
    suggestionId: string,
    field: keyof TopicSuggestionItem["suggestedIntake"],
    value: string,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === suggestionId
          ? {
              ...item,
              suggestedIntake: {
                ...item.suggestedIntake,
                [field]: value,
              },
            }
          : item,
      ),
    );
  }

  function selectSuggestion(suggestionId: string) {
    setError(null);
    setMessage(null);
    const selectedItem = items.find((item) => item.id === suggestionId);

    if (!selectedItem) {
      setError("No se encontro la sugerencia seleccionada.");
      return;
    }

    startSelectTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/topic-suggestions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestionId,
          edits: selectedItem.suggestedIntake,
        }),
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
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
          <span className="rounded-full border border-[rgba(74,58,97,0.1)] bg-[rgba(244,241,248,0.8)] px-3 py-1">
            Tema
          </span>
          <span className="rounded-full border border-[rgba(74,58,97,0.1)] bg-[rgba(244,241,248,0.8)] px-3 py-1">
            {getOriginLabel(topicOriginType)}
          </span>
          <span className="rounded-full border border-[rgba(74,58,97,0.1)] bg-[rgba(244,241,248,0.8)] px-3 py-1">
            {topicAreaLabel ?? "Area no especificada"}
          </span>
        </div>

        <h2 className="mt-4 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
          Elige una base tematica.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
          Empieza con tu idea original o cambia a una de las tres opciones relacionadas.
        </p>

        <div className="mt-5 rounded-[28px] p-5 brand-card-lilac">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
            Tu idea original
          </p>
          <p className="text-sm leading-7 text-[rgba(23,19,31,0.78)]">{topicSeedText}</p>
        </div>

        {isBootstrapping ? (
          <div className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/82 px-4 py-4 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
            Estamos preparando tres opciones relacionadas con tu idea.
          </div>
        ) : null}

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
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <section className="grid gap-4">
        {!isBootstrapping && generatedSuggestions.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[rgba(74,58,97,0.14)] bg-[rgba(255,255,255,0.76)] px-5 py-8 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
            Aun no hay opciones listas. Puedes usar tu idea original o regenerar tres opciones cercanas.
          </div>
        ) : null}
        {generatedSuggestions.map((item) => (
          <article
            className={`rounded-[30px] p-5 ${getSourceToneClassName(item.sourceType)}`}
            key={item.id}
          >
            <div className="flex flex-col gap-4">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[rgba(23,19,31,0.08)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.72)]">
                    {getVariantLabel(item)}
                  </span>
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
                {item.rationale ? (
                  <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
                    {item.rationale}
                  </p>
                ) : null}
                {item.researchLine ? (
                  <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                    Linea sugerida: {item.researchLine}
                  </p>
                ) : null}

                <div className="mt-4">
                  <button
                    className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                    disabled={isSelecting}
                    onClick={() => selectSuggestion(item.id)}
                    type="button"
                  >
                    {isSelecting ? "Guardando..." : "Elegir esta opcion"}
                  </button>
                </div>
              </div>

              <details className="rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white/70 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                  Ver base sugerida
                </summary>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                      Problema sugerido
                    </span>
                    <textarea
                      className="brand-textarea min-h-[104px] bg-white"
                      onChange={(event) =>
                        updateSuggestionField(
                          item.id,
                          "problemContext",
                          event.target.value,
                        )
                      }
                      value={item.suggestedIntake.problemContext ?? ""}
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                        Linea sugerida
                      </span>
                      <input
                        className="brand-input bg-white"
                        onChange={(event) =>
                          updateSuggestionField(
                            item.id,
                            "researchLine",
                            event.target.value,
                          )
                        }
                        value={item.suggestedIntake.researchLine ?? item.researchLine ?? ""}
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                        Poblacion sugerida
                      </span>
                      <textarea
                        className="brand-textarea min-h-[92px] bg-white"
                        onChange={(event) =>
                          updateSuggestionField(
                            item.id,
                            "targetPopulation",
                            event.target.value,
                          )
                        }
                        value={item.suggestedIntake.targetPopulation ?? ""}
                      />
                    </label>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                      Metodologia sugerida
                    </span>
                    <textarea
                      className="brand-textarea min-h-[96px] bg-white"
                      onChange={(event) =>
                        updateSuggestionField(
                          item.id,
                          "preferredMethodology",
                          event.target.value,
                        )
                      }
                      value={item.suggestedIntake.preferredMethodology ?? ""}
                    />
                  </label>

                  <details className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
                      Mas ajustes
                    </summary>
                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                          Datos o evidencia sugerida
                        </span>
                        <textarea
                          className="brand-textarea min-h-[96px] bg-white"
                          onChange={(event) =>
                            updateSuggestionField(
                              item.id,
                              "availableData",
                              event.target.value,
                            )
                          }
                          value={item.suggestedIntake.availableData ?? ""}
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                          Restricciones sugeridas
                        </span>
                        <textarea
                          className="brand-textarea min-h-[96px] bg-white"
                          onChange={(event) =>
                            updateSuggestionField(
                              item.id,
                              "academicConstraints",
                              event.target.value,
                            )
                          }
                          value={item.suggestedIntake.academicConstraints ?? ""}
                        />
                      </label>

                      <label className="grid gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                          Nota inicial para el intake
                        </span>
                        <textarea
                          className="brand-textarea min-h-[96px] bg-white"
                          onChange={(event) =>
                            updateSuggestionField(
                              item.id,
                              "advisorNotes",
                              event.target.value,
                            )
                          }
                          value={item.suggestedIntake.advisorNotes ?? ""}
                        />
                      </label>
                    </div>
                  </details>
                </div>
              </details>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
