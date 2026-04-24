"use client";

import { type DegreeLevel } from "@prisma/client";
import {
  FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Building2,
  Check,
  ChevronDown,
  GraduationCap,
  Lightbulb,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import {
  getDegreeLevelLabel,
  getGenericProgramDefault,
  getPresetDegreeLevelForProject,
  PROJECT_DEGREE_LEVEL_OPTIONS,
} from "@/lib/degree-levels";
import { PROJECT_CAREERS, PROJECT_PRESETS } from "@/lib/project-presets";
import {
  getFeaturedProjectUniversityOptions,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";
import {
  SYSTEM_MASTER_TEMPLATE_ALIAS,
  SYSTEM_MASTER_TEMPLATE_KEY,
} from "@/lib/system-master-template";
import {
  buildProjectPresetSuggestionEntries,
  getTopicAreaLabel,
  normalizeSearchText,
  type TopicSuggestionTone,
} from "@/lib/topic-suggestion-scoring";

const FEATURED_UNIVERSITIES = getFeaturedProjectUniversityOptions();
const fieldClassName = "brand-input";

type TopicAreaOption = {
  label: string;
  canonicalAreaId: string | null;
  canonicalAreaLabel: string | null;
  source: "catalog" | "custom";
};

type IdeaDraft = {
  title: string;
  rationale: string;
};

async function readJsonSafe<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function findCareerMatch(value: string) {
  const normalizedValue = normalizeSearchText(value);

  if (!normalizedValue) {
    return null;
  }

  return (
    PROJECT_CAREERS.find(
      (career) => normalizeSearchText(career.label) === normalizedValue,
    ) ??
    PROJECT_CAREERS.find((career) =>
      normalizeSearchText(career.label).includes(normalizedValue),
    ) ??
    null
  );
}

function getProgramDefault(careerId: string | null, degreeLevel: DegreeLevel) {
  const presetDegreeLevel = getPresetDegreeLevelForProject(degreeLevel);

  return (
    PROJECT_PRESETS.find(
      (preset) =>
        preset.careerId === careerId && preset.degreeLevel === presetDegreeLevel,
    )?.program ?? getGenericProgramDefault(degreeLevel)
  );
}

function getSuggestionCardClassName(tone: TopicSuggestionTone, isActive: boolean) {
  const toneClassName =
    tone === "gold"
      ? "brand-card-gold"
      : tone === "mint"
        ? "brand-card-mint"
        : tone === "blush"
          ? "brand-card-blush"
          : "brand-card-lilac";

  return [
    "w-full rounded-[28px] border p-5 text-left shadow-[0_18px_44px_rgba(23,19,31,0.06)]",
    toneClassName,
    isActive
      ? "border-[rgba(52,20,95,0.38)] ring-4 ring-[rgba(219,193,255,0.42)]"
      : "border-transparent hover:-translate-y-[1px]",
  ].join(" ");
}

export function CreateProjectForm() {
  const router = useRouter();
  const [degreeLevel, setDegreeLevel] = useState<DegreeLevel>("POSGRADO");
  const [university, setUniversity] = useState<ProjectUniversityCode>("PUCP");
  const [areaQuery, setAreaQuery] = useState(PROJECT_CAREERS[0]?.label ?? "");
  const [program, setProgram] = useState(
    getProgramDefault(PROJECT_CAREERS[0]?.id ?? null, "POSGRADO"),
  );
  const [interestText, setInterestText] = useState("");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState("");
  const [areaOptions, setAreaOptions] = useState<TopicAreaOption[]>(
    PROJECT_CAREERS.slice(0, 6).map((career) => ({
      label: career.label,
      canonicalAreaId: career.id,
      canonicalAreaLabel: career.label,
      source: "catalog",
    })),
  );
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
  const [quickIdeaOptions, setQuickIdeaOptions] = useState<IdeaDraft[]>([]);
  const [ideaDraftError, setIdeaDraftError] = useState<string | null>(null);
  const [ideaDraftMessage, setIdeaDraftMessage] = useState<string | null>(null);
  const [isProgramEditable, setIsProgramEditable] = useState(false);
  const [hasManualProgram, setHasManualProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGeneratingIdeas, startIdeaTransition] = useTransition();
  const deferredInterestText = useDeferredValue(interestText);
  const deferredAreaQuery = useDeferredValue(areaQuery);

  const selectedAreaOption = useMemo(() => {
    const normalizedAreaQuery = normalizeSearchText(areaQuery);

    if (!normalizedAreaQuery) {
      return null;
    }

    return (
      areaOptions.find(
        (option) => normalizeSearchText(option.label) === normalizedAreaQuery,
      ) ?? null
    );
  }, [areaOptions, areaQuery]);

  const matchedCareer = useMemo(() => {
    if (selectedAreaOption?.canonicalAreaId) {
      return (
        PROJECT_CAREERS.find((career) => career.id === selectedAreaOption.canonicalAreaId) ??
        findCareerMatch(areaQuery)
      );
    }

    return findCareerMatch(areaQuery);
  }, [areaQuery, selectedAreaOption]);
  const topicAreaId = selectedAreaOption?.canonicalAreaId ?? matchedCareer?.id ?? null;
  const topicAreaLabel =
    areaQuery.trim().length > 0
      ? areaQuery.trim()
      : selectedAreaOption?.canonicalAreaLabel ?? getTopicAreaLabel(topicAreaId) ?? null;

  const suggestionEntries = useMemo(
    () =>
      buildProjectPresetSuggestionEntries({
        areaId: topicAreaId,
        degreeLevel: getPresetDegreeLevelForProject(degreeLevel),
        university,
        templateKey: SYSTEM_MASTER_TEMPLATE_KEY,
        interestText: deferredInterestText,
        limit: 4,
      }),
    [deferredInterestText, degreeLevel, topicAreaId, university],
  );

  const selectedSuggestion =
    suggestionEntries.find((entry) => entry.preset.id === selectedSuggestionId)?.preset ??
    suggestionEntries[0]?.preset ??
    null;
  const hasCustomIdea = interestText.trim().length > 0;
  const visibleSuggestionEntries = suggestionEntries.slice(0, 3);
  const normalizedAreaQuery = normalizeSearchText(areaQuery);
  const hasExactAreaOption = areaOptions.some(
    (option) => normalizeSearchText(option.label) === normalizedAreaQuery,
  );

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/topic-areas?q=${encodeURIComponent(deferredAreaQuery.trim())}`,
        );
        const payload = await readJsonSafe<{
          error?: string;
          suggestions?: TopicAreaOption[];
        }>(response);

        if (isCancelled || !response.ok || !payload?.suggestions) {
          return;
        }

        setAreaOptions(payload.suggestions);
      } catch {
        // Mantiene las opciones locales sin romper la pantalla.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [deferredAreaQuery]);

  useEffect(() => {
    if (hasManualProgram) {
      return;
    }

    setProgram(getProgramDefault(topicAreaId, degreeLevel));
  }, [degreeLevel, hasManualProgram, topicAreaId]);

  useEffect(() => {
    if (selectedSuggestion && selectedSuggestionId !== selectedSuggestion.id) {
      setSelectedSuggestionId(selectedSuggestion.id);
    }
  }, [selectedSuggestion, selectedSuggestionId]);

  async function requestIdeaDrafts(options?: {
    seedText?: string;
    fillGeneratedIdea?: boolean;
  }) {
    const normalizedSeedText = options?.seedText?.trim() ?? interestText.trim();

    if (!topicAreaLabel && normalizedSeedText.length === 0) {
      setIdeaDraftError("Escribe un area o una idea para poder sugerir variantes.");
      return;
    }

    setIdeaDraftError(null);
    setIdeaDraftMessage(null);

    startIdeaTransition(async () => {
      try {
        const response = await fetch("/api/projects/idea-drafts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            degreeLevel,
            university,
            program,
            topicAreaId: topicAreaId ?? undefined,
            topicAreaLabel: topicAreaLabel ?? undefined,
            seedText: normalizedSeedText || undefined,
          }),
        });
        const payload = await readJsonSafe<{
          error?: string;
          generatedIdea?: string;
          relatedIdeas?: IdeaDraft[];
          resolvedArea?: {
            topicAreaId: string | null;
            topicAreaLabel: string | null;
          };
        }>(response);

        if (!response.ok || !payload?.relatedIdeas) {
          setIdeaDraftError(
            payload?.error ?? "No se pudieron preparar ideas relacionadas.",
          );
          return;
        }

        setQuickIdeaOptions(payload.relatedIdeas.slice(0, 3));

        if (payload.resolvedArea?.topicAreaLabel && !areaQuery.trim()) {
          setAreaQuery(payload.resolvedArea.topicAreaLabel);
        }

        if (options?.fillGeneratedIdea ?? true) {
          setInterestText(
            payload.generatedIdea ??
              payload.relatedIdeas[0]?.title ??
              normalizedSeedText,
          );
          setIdeaDraftMessage(
            "Cargamos una idea inicial editable basada en tu area.",
          );
        } else {
          setIdeaDraftMessage("Ya tienes ideas relacionadas para arrancar mas rapido.");
        }
      } catch {
        setIdeaDraftError(
          "No pudimos generar ideas ahora. Revisa la configuracion LLM o intenta de nuevo.",
        );
      }
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasCustomIdea && !selectedSuggestion) {
      setError("Escribe una idea propia o elige una referencia rapida.");
      return;
    }

    startTransition(async () => {
      const trimmedIdea = interestText.trim();
      const usingCustomIdea = trimmedIdea.length > 0;

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogTopicId: usingCustomIdea ? undefined : selectedSuggestion.id,
          customIdeaText: usingCustomIdea ? trimmedIdea : undefined,
          title: usingCustomIdea ? trimmedIdea : selectedSuggestion.title,
          degreeLevel,
          university,
          program,
          topicAreaId: topicAreaId ?? undefined,
          topicAreaLabel: topicAreaLabel ?? undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        project?: { id: string };
      };

      if (!response.ok || !payload.project) {
        setError(payload.error ?? "No se pudo crear el proyecto.");
        return;
      }

      router.push(`/projects/${payload.project.id}/topic`);
      router.refresh();
    });
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          Completa cuatro datos y continua. En la siguiente pantalla refinaremos el tema.
        </p>
        <div className="inline-flex w-fit rounded-full border border-[rgba(74,58,97,0.1)] bg-[rgba(244,241,248,0.8)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
          Paso 1 de 3
        </div>
      </div>

      <section className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(219,193,255,0.3)] text-[var(--color-plum)]">
                <GraduationCap className="size-4" />
              </span>
              <label
                className="text-sm font-semibold text-[var(--color-muted)]"
                htmlFor="project-degree"
              >
                Nivel
              </label>
            </div>
            <select
              className={fieldClassName}
              id="project-degree"
              onChange={(event) => setDegreeLevel(event.target.value as DegreeLevel)}
              value={degreeLevel}
            >
              {PROJECT_DEGREE_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(157,231,214,0.28)] text-[var(--color-mint-strong)]">
                <Building2 className="size-4" />
              </span>
              <label className="text-sm font-semibold text-[var(--color-muted)]">
                Universidad
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {FEATURED_UNIVERSITIES.map((option) => {
                const isActive = option.code === university;

                return (
                  <button
                    className={[
                      "rounded-[20px] border px-4 py-3 text-left text-sm font-semibold transition-transform",
                      isActive
                        ? "border-[rgba(52,20,95,0.34)] bg-[rgba(255,255,255,0.96)] text-[var(--color-ink)] shadow-[0_12px_28px_rgba(52,20,95,0.12)]"
                        : "border-[rgba(74,58,97,0.1)] bg-[rgba(255,255,255,0.82)] text-[var(--color-muted)] hover:-translate-y-[1px]",
                    ].join(" ")}
                    key={option.code}
                    onClick={() => setUniversity(option.code)}
                    type="button"
                  >
                    {option.shortName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(255,190,201,0.28)] text-[var(--color-coral)]">
                <BookOpenText className="size-4" />
              </span>
              <label
                className="text-sm font-semibold text-[var(--color-muted)]"
                htmlFor="project-career"
              >
                Carrera o area base
              </label>
            </div>
            <div className="relative">
              <input
                autoComplete="off"
                className={`${fieldClassName} pr-11`}
                id="project-career"
                onBlur={() => {
                  window.setTimeout(() => setIsAreaDropdownOpen(false), 120);
                }}
                onChange={(event) => {
                  setAreaQuery(event.target.value);
                  setIsAreaDropdownOpen(true);
                }}
                onFocus={() => setIsAreaDropdownOpen(true)}
                placeholder="Selecciona una opcion o escribe tu propia area"
                value={areaQuery}
              />
              <button
                aria-label="Mostrar areas sugeridas"
                className="absolute inset-y-0 right-3 my-auto inline-flex size-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[rgba(74,58,97,0.06)]"
                onClick={() => setIsAreaDropdownOpen((current) => !current)}
                type="button"
              >
                <ChevronDown className="size-4" />
              </button>
              {isAreaDropdownOpen ? (
                <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-[22px] border border-[rgba(74,58,97,0.12)] bg-white p-2 shadow-[0_18px_44px_rgba(23,19,31,0.1)]">
                  {areaOptions.map((option) => {
                    const isSelected =
                      normalizeSearchText(option.label) === normalizedAreaQuery;

                    return (
                      <button
                        className={[
                          "flex w-full items-center justify-between rounded-[16px] px-3 py-3 text-left text-sm",
                          isSelected
                            ? "bg-[rgba(219,193,255,0.22)] text-[var(--color-ink)]"
                            : "text-[var(--color-muted)] hover:bg-[rgba(74,58,97,0.04)]",
                        ].join(" ")}
                        key={`${option.source}-${option.label}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          setAreaQuery(option.label);
                          setIsAreaDropdownOpen(false);
                        }}
                        type="button"
                      >
                        <span>{option.label}</span>
                        {isSelected ? <Check className="size-4 text-[var(--color-plum)]" /> : null}
                      </button>
                    );
                  })}
                  {areaQuery.trim() && !hasExactAreaOption ? (
                    <button
                      className="mt-1 flex w-full items-center justify-between rounded-[16px] border border-dashed border-[rgba(74,58,97,0.12)] px-3 py-3 text-left text-sm text-[var(--color-ink)] hover:bg-[rgba(74,58,97,0.04)]"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setIsAreaDropdownOpen(false);
                      }}
                      type="button"
                    >
                      <span>Usar "{areaQuery.trim()}" como area nueva</span>
                      <Sparkles className="size-4 text-[var(--color-plum)]" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              Puedes elegir una opcion sugerida o escribir un area propia. La normalizaremos al guardar el proyecto.
            </p>
          </div>

          <div className="grid gap-2 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-[16px] bg-[rgba(239,193,77,0.24)] text-[var(--color-gold)]">
                  <Lightbulb className="size-4" />
                </span>
                <label
                  className="text-sm font-semibold text-[var(--color-muted)]"
                  htmlFor="project-interest"
                >
                  Idea original
                </label>
              </div>
              <button
                className="brand-button-secondary px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                disabled={isGeneratingIdeas || (!topicAreaLabel && interestText.trim().length === 0)}
                onClick={() => requestIdeaDrafts({ fillGeneratedIdea: true })}
                type="button"
              >
                <WandSparkles className="mr-2 size-4" />
                {isGeneratingIdeas ? "Generando..." : "Generar idea"}
              </button>
            </div>
            <textarea
              className="brand-textarea"
              id="project-interest"
              onChange={(event) => setInterestText(event.target.value)}
              placeholder="Escribe el problema o tema que quieres investigar."
              rows={4}
              value={interestText}
            />
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              Si escribes aqui, esta idea sera la prioridad en la siguiente etapa.
            </p>
            {ideaDraftError ? (
              <p className="text-sm text-rose-600">{ideaDraftError}</p>
            ) : null}
            {ideaDraftMessage ? (
              <p className="text-sm text-emerald-700">{ideaDraftMessage}</p>
            ) : null}
          </div>
        </div>
      </section>

      <details className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          Ajustes opcionales
        </summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                Programa
              </p>
              <button
                className="brand-button-secondary px-4 py-2 text-sm font-semibold"
                onClick={() => setIsProgramEditable((current) => !current)}
                type="button"
              >
                {isProgramEditable ? "Ocultar" : "Editar"}
              </button>
            </div>

            {isProgramEditable ? (
              <input
                className={fieldClassName}
                onChange={(event) => {
                  setProgram(event.target.value);
                  setHasManualProgram(true);
                }}
                placeholder="Ej. Maestria en Gestion Empresarial"
                required
                value={program}
              />
            ) : (
              <p className="text-sm leading-6 text-[var(--color-muted)]">
                {program}
              </p>
            )}
          </div>

          <div className="grid gap-2 text-sm leading-6 text-[var(--color-muted)] sm:grid-cols-2">
            <p>
              <strong>Plantilla:</strong> {SYSTEM_MASTER_TEMPLATE_ALIAS}
            </p>
            <p>
              <strong>Area:</strong> {topicAreaLabel || "No especificada"}
            </p>
            <p>
              <strong>Nivel:</strong> {getDegreeLevelLabel(degreeLevel)}
            </p>
            <p>
              <strong>Universidad:</strong>{" "}
              {FEATURED_UNIVERSITIES.find((option) => option.code === university)?.shortName ??
                university}
            </p>
          </div>
        </div>
      </details>

      <details
        className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-5"
        onToggle={(event) => {
          const details = event.currentTarget;

          if (details.open && quickIdeaOptions.length === 0) {
            void requestIdeaDrafts({ fillGeneratedIdea: false });
          }
        }}
      >
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {hasCustomIdea
            ? "Usar una idea relacionada o una base del catalogo"
            : "No tengo idea propia: usar una idea rapida"}
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Si ya escribiste una idea, priorizaremos variantes cercanas. Si no, te mostraremos una base rapida dentro del area elegida.
          </p>

          {quickIdeaOptions.length > 0 ? (
            <div className="grid gap-3">
              {quickIdeaOptions.slice(0, 3).map((idea, index) => (
                <button
                  className={getSuggestionCardClassName(
                    index === 0 ? "mint" : index === 1 ? "lilac" : "gold",
                    normalizeSearchText(interestText) === normalizeSearchText(idea.title),
                  )}
                  key={`${idea.title}-${index}`}
                  onClick={() => setInterestText(idea.title)}
                  type="button"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                        {idea.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                        {idea.rationale}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                      Idea sugerida
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3">
            {visibleSuggestionEntries.map((entry) => {
              const isActive = entry.preset.id === selectedSuggestion?.id;

              return (
                <button
                  aria-pressed={isActive}
                  className={getSuggestionCardClassName(entry.tone, isActive)}
                  key={entry.preset.id}
                  onClick={() => setSelectedSuggestionId(entry.preset.id)}
                  type="button"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="max-w-2xl">
                      <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                        {entry.preset.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                        {entry.reasons[0]}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                      {isActive ? "Elegida" : "Referencia"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </details>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isPending || (!hasCustomIdea && !selectedSuggestion) || program.trim().length === 0}
          type="submit"
        >
          {isPending ? "Creando..." : "Continuar"}
        </button>
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          Guardaremos esta base y en la siguiente pantalla elegiras el tema definitivo.
        </p>
      </div>
    </form>
  );
}
