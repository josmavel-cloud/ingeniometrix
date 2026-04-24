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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  GraduationCap,
  Lightbulb,
  RotateCcw,
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

type TopicFlowStage = "topic_input" | "topic_confirmed" | "variant_selection";

type NormalizedAreaResult = TopicAreaOption & {
  confidence: "high" | "medium" | "low";
};

const MAX_GENERATED_IDEAS = 5;

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

function buildDefaultAreaOptions() {
  return PROJECT_CAREERS.map((career) => ({
    label: career.label,
    canonicalAreaId: career.id,
    canonicalAreaLabel: career.label,
    source: "catalog" as const,
  }));
}

function mergeTopicAreaOptions(...groups: TopicAreaOption[][]) {
  const merged = new Map<string, TopicAreaOption>();

  for (const group of groups) {
    for (const option of group) {
      merged.set(normalizeSearchText(option.label), option);
    }
  }

  return Array.from(merged.values());
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
    buildDefaultAreaOptions(),
  );
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
  const [flowStage, setFlowStage] = useState<TopicFlowStage>("topic_input");
  const [confirmedTopic, setConfirmedTopic] = useState<string | null>(null);
  const [pendingTopicConfirmation, setPendingTopicConfirmation] = useState<string | null>(
    null,
  );
  const [generatedIdeas, setGeneratedIdeas] = useState<IdeaDraft[]>([]);
  const [generatedIdeaVariants, setGeneratedIdeaVariants] = useState<
    Record<string, IdeaDraft[]>
  >({});
  const [activeGeneratedIdeaIndex, setActiveGeneratedIdeaIndex] = useState(0);
  const [ideaDraftError, setIdeaDraftError] = useState<string | null>(null);
  const [ideaDraftMessage, setIdeaDraftMessage] = useState<string | null>(null);
  const [normalizedAreaMessage, setNormalizedAreaMessage] = useState<string | null>(null);
  const [selectedIdeaTitle, setSelectedIdeaTitle] = useState<string | null>(null);
  const [selectedVariantTitle, setSelectedVariantTitle] = useState<string | null>(null);
  const [isProgramEditable, setIsProgramEditable] = useState(false);
  const [hasManualProgram, setHasManualProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGeneratingIdeas, startIdeaTransition] = useTransition();
  const [isNormalizingArea, startNormalizingAreaTransition] = useTransition();
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
        limit: 5,
      }),
    [deferredInterestText, degreeLevel, topicAreaId, university],
  );

  const selectedSuggestion =
    suggestionEntries.find((entry) => entry.preset.id === selectedSuggestionId)?.preset ??
    suggestionEntries[0]?.preset ??
    null;
  const activeGeneratedIdea = generatedIdeas[activeGeneratedIdeaIndex] ?? null;
  const visibleSuggestionEntries = suggestionEntries.slice(0, 5);
  const normalizedAreaQuery = normalizeSearchText(areaQuery);
  const hasExactAreaOption = areaOptions.some(
    (option) => normalizeSearchText(option.label) === normalizedAreaQuery,
  );
  const selectedIdea =
    generatedIdeas.find(
      (idea) => normalizeSearchText(idea.title) === normalizeSearchText(selectedIdeaTitle ?? ""),
    ) ?? null;
  const selectedIdeaVariants = selectedIdea
    ? generatedIdeaVariants[normalizeSearchText(selectedIdea.title)] ?? []
    : [];
  const topicLiveSuggestions = useMemo(() => {
    const typedTitle = interestText.trim();
    const typedKey = normalizeSearchText(typedTitle);
    const suggestions: IdeaDraft[] = [];

    if (typedTitle) {
      suggestions.push({
        title: typedTitle,
        rationale: "Usar exactamente el tema que acabas de escribir como base.",
      });
    }

    for (const entry of visibleSuggestionEntries) {
      const title = entry.preset.title;
      const key = normalizeSearchText(title);

      if (key && key !== typedKey) {
        suggestions.push({
          title,
          rationale: entry.reasons[0] ?? "Tema relacionado con tu area.",
        });
      }
    }

    return suggestions.slice(0, 5);
  }, [interestText, visibleSuggestionEntries]);
  const hasCustomIdea = interestText.trim().length > 0;
  const canGenerateIdeas =
    flowStage === "topic_confirmed" &&
    generatedIdeas.length < MAX_GENERATED_IDEAS &&
    (!isGeneratingIdeas && !!confirmedTopic);
  const finalTopicTitle = selectedVariantTitle ?? selectedIdea?.title ?? confirmedTopic ?? null;
  const hasFinalIdeaSelection = generatedIdeas.length === 0 || !!selectedIdea;
  const canContinue =
    !isPending &&
    program.trim().length > 0 &&
    !!finalTopicTitle &&
    hasFinalIdeaSelection &&
    flowStage !== "topic_input";

  function resetIdeaFlowState() {
    setGeneratedIdeas([]);
    setGeneratedIdeaVariants({});
    setActiveGeneratedIdeaIndex(0);
    setSelectedIdeaTitle(null);
    setSelectedVariantTitle(null);
    setIdeaDraftMessage(null);
    setIdeaDraftError(null);
  }

  function restartPlanningFlow() {
    setFlowStage("topic_input");
    setConfirmedTopic(null);
    setPendingTopicConfirmation(null);
    setInterestText("");
    setSelectedSuggestionId("");
    resetIdeaFlowState();
    setError(null);
  }

  function beginTopicEditing() {
    setFlowStage("topic_input");
    setConfirmedTopic(null);
    setPendingTopicConfirmation(null);
    resetIdeaFlowState();
  }

  function openTopicConfirmation(candidateTitle: string) {
    const trimmedTitle = candidateTitle.trim();

    if (!trimmedTitle) {
      return;
    }

    setPendingTopicConfirmation(trimmedTitle);
    setError(null);
  }

  function confirmTopicSelection(candidateTitle?: string) {
    const confirmedTitle = candidateTitle?.trim() || interestText.trim();

    if (!confirmedTitle) {
      setError("Escribe o elige un tema base antes de continuar.");
      return;
    }

    setInterestText(confirmedTitle);
    setConfirmedTopic(confirmedTitle);
    setPendingTopicConfirmation(null);
    resetIdeaFlowState();
    setFlowStage("topic_confirmed");
    setIdeaDraftMessage(
      "Tema confirmado. Ahora ya puedes generar ideas relacionadas a partir de esta base.",
    );
  }

  function applyGeneratedIdea(index: number) {
    const idea = generatedIdeas[index];

    if (!idea) {
      return;
    }

    setActiveGeneratedIdeaIndex(index);
    setIdeaDraftMessage(`Estas viendo la idea ${index + 1} de ${generatedIdeas.length}.`);
  }

  function lockIdeaSelection() {
    const currentIdea = generatedIdeas[activeGeneratedIdeaIndex];

    if (!currentIdea) {
      return;
    }

    setSelectedIdeaTitle(currentIdea.title);
    setSelectedVariantTitle(null);
    setFlowStage("variant_selection");
    setIdeaDraftMessage(
      "Idea principal elegida. Ahora puedes escoger una variante o continuar con esta idea.",
    );
  }

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

        setAreaOptions(
          mergeTopicAreaOptions(buildDefaultAreaOptions(), payload.suggestions),
        );
      } catch {
        // Mantiene las opciones locales sin romper la pantalla.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [deferredAreaQuery]);

  useEffect(() => {
    const trimmedQuery = deferredAreaQuery.trim();

    if (!trimmedQuery || hasExactAreaOption) {
      return;
    }

    let isCancelled = false;

    const timer = window.setTimeout(() => {
      startNormalizingAreaTransition(async () => {
        try {
          const response = await fetch("/api/topic-areas", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              label: trimmedQuery,
            }),
          });
          const payload = await readJsonSafe<{
            error?: string;
            normalizedArea?: NormalizedAreaResult | null;
          }>(response);

          if (isCancelled || !response.ok || !payload?.normalizedArea) {
            return;
          }

          const normalizedArea = payload.normalizedArea;
          const normalizedOption: TopicAreaOption = {
            label: normalizedArea.label,
            canonicalAreaId: normalizedArea.canonicalAreaId,
            canonicalAreaLabel: normalizedArea.canonicalAreaLabel,
            source: normalizedArea.source,
          };

          setAreaOptions((current) =>
            mergeTopicAreaOptions([normalizedOption], current, buildDefaultAreaOptions()),
          );

          if (
            normalizedArea.confidence !== "low" &&
            normalizeSearchText(trimmedQuery) !== normalizeSearchText(normalizedArea.label)
          ) {
            setAreaQuery(normalizedArea.label);
          }

          setNormalizedAreaMessage(
            normalizedArea.confidence === "low"
              ? `Registramos "${normalizedArea.label}" como area personalizada.`
              : `Normalizamos el area como "${normalizedArea.label}".`,
          );
        } catch {
          // Evita romper el formulario si la normalizacion falla.
        }
      });
    }, 450);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredAreaQuery, hasExactAreaOption, startNormalizingAreaTransition]);

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
  }) {
    const normalizedSeedText =
      options?.seedText?.trim() ?? confirmedTopic?.trim() ?? interestText.trim();

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
            existingTitles: generatedIdeas.map((idea) => idea.title),
          }),
        });
        const payload = await readJsonSafe<{
          error?: string;
          generatedIdea?: IdeaDraft;
          relatedIdeas?: IdeaDraft[];
          resolvedArea?: {
            topicAreaId: string | null;
            topicAreaLabel: string | null;
          };
        }>(response);

        if (!response.ok || !payload?.generatedIdea) {
          setIdeaDraftError(
            payload?.error ?? "No se pudieron preparar ideas relacionadas.",
          );
          return;
        }

        const normalizedGeneratedTitle = normalizeSearchText(payload.generatedIdea.title);
        const nextIdeas = (() => {
          const alreadyExists = generatedIdeas.some(
            (idea) =>
              normalizeSearchText(idea.title) === normalizedGeneratedTitle,
          );

          if (alreadyExists) {
            return generatedIdeas;
          }

          return [...generatedIdeas, payload.generatedIdea].slice(0, MAX_GENERATED_IDEAS);
        })();
        const nextIndex = Math.max(
          nextIdeas.findIndex(
            (idea) => normalizeSearchText(idea.title) === normalizedGeneratedTitle,
          ),
          0,
        );

        setGeneratedIdeas(nextIdeas);
        setActiveGeneratedIdeaIndex(nextIndex);
        setGeneratedIdeaVariants((current) => ({
          ...current,
          [normalizedGeneratedTitle]: payload.relatedIdeas?.slice(0, 4) ?? [],
        }));

        if (payload.resolvedArea?.topicAreaLabel && !areaQuery.trim()) {
          setAreaQuery(payload.resolvedArea.topicAreaLabel);
        }

        setIdeaDraftMessage(
          `Generamos ${nextIdeas.length} de ${MAX_GENERATED_IDEAS} ideas disponibles para esta base.`,
        );
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

    if (!finalTopicTitle || !hasFinalIdeaSelection) {
      setError("Confirma un tema base y, si generaste ideas, elige una antes de continuar.");
      return;
    }

    startTransition(async () => {
      const trimmedIdea = finalTopicTitle.trim();
      const shouldUseCatalogSuggestion =
        !selectedIdea &&
        !selectedVariantTitle &&
        !!selectedSuggestion &&
        normalizeSearchText(selectedSuggestion.title) === normalizeSearchText(trimmedIdea);

      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogTopicId: shouldUseCatalogSuggestion ? selectedSuggestion.id : undefined,
          customIdeaText: shouldUseCatalogSuggestion ? undefined : trimmedIdea,
          title: trimmedIdea,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-2">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Primero define el tema base, luego generamos ideas y finalmente eliges una variante final.
          </p>
          <div className="inline-flex w-fit rounded-full border border-[rgba(74,58,97,0.1)] bg-[rgba(244,241,248,0.8)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Paso 1 de 3
          </div>
        </div>
        {flowStage !== "topic_input" ? (
          <button
            className="brand-button-secondary px-4 py-2 text-sm font-semibold"
            onClick={restartPlanningFlow}
            type="button"
          >
            <RotateCcw className="mr-2 size-4" />
            Empezar otra vez
          </button>
        ) : null}
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
              disabled={flowStage !== "topic_input"}
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
                    onClick={() => {
                      if (flowStage !== "topic_input") {
                        return;
                      }

                      setUniversity(option.code);
                    }}
                    disabled={flowStage !== "topic_input"}
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
                disabled={flowStage !== "topic_input"}
                id="project-career"
                onBlur={() => {
                  window.setTimeout(() => setIsAreaDropdownOpen(false), 120);
                }}
                onChange={(event) => {
                  beginTopicEditing();
                  setNormalizedAreaMessage(null);
                  setAreaQuery(event.target.value);
                  setIsAreaDropdownOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setIsAreaDropdownOpen(false);
                  }
                }}
                onFocus={() => setIsAreaDropdownOpen(true)}
                placeholder="Selecciona una opcion o escribe tu propia area"
                value={areaQuery}
              />
              <button
                aria-label="Mostrar areas sugeridas"
                className="absolute inset-y-0 right-3 my-auto inline-flex size-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[rgba(74,58,97,0.06)]"
                disabled={flowStage !== "topic_input"}
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
                          beginTopicEditing();
                          setNormalizedAreaMessage(null);
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
                        beginTopicEditing();
                        setNormalizedAreaMessage(null);
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
              Puedes elegir una opcion sugerida o escribir un area propia. La normalizaremos y registraremos en tiempo real.
            </p>
            {normalizedAreaMessage ? (
              <p className="text-sm text-emerald-700">
                {normalizedAreaMessage}
                {isNormalizingArea ? " Ajustando..." : ""}
              </p>
            ) : isNormalizingArea ? (
              <p className="text-sm text-[var(--color-muted)]">
                Validando semanticamente el area...
              </p>
            ) : null}
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
                  Tema base
                </label>
              </div>
            </div>
            <div className="relative">
              <input
                className={fieldClassName}
                disabled={flowStage !== "topic_input"}
                id="project-interest"
                onChange={(event) => {
                  beginTopicEditing();
                  setInterestText(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    openTopicConfirmation(
                      interestText.trim() || topicLiveSuggestions[0]?.title || "",
                    );
                  }
                }}
                placeholder="Escribe el tema que quieres investigar."
                value={interestText}
              />
              {flowStage === "topic_input" && topicLiveSuggestions.length > 0 ? (
                <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-[22px] border border-[rgba(74,58,97,0.12)] bg-white p-2 shadow-[0_18px_44px_rgba(23,19,31,0.1)]">
                  {topicLiveSuggestions.map((suggestion, index) => {
                    const isTypedSuggestion =
                      index === 0 &&
                      normalizeSearchText(suggestion.title) ===
                        normalizeSearchText(interestText.trim());

                    return (
                      <button
                        className="flex w-full flex-col rounded-[16px] px-3 py-3 text-left text-sm text-[var(--color-muted)] hover:bg-[rgba(74,58,97,0.04)]"
                        key={`${suggestion.title}-${index}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          if (!isTypedSuggestion) {
                            setInterestText(suggestion.title);
                          }
                          openTopicConfirmation(suggestion.title);
                        }}
                        type="button"
                      >
                        <span className="font-semibold text-[var(--color-ink)]">
                          {suggestion.title}
                        </span>
                        <span className="mt-1 leading-6">{suggestion.rationale}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              Escribe el tema y pulsa `Enter` para confirmarlo. Mientras escribes, veras sugerencias relacionadas como en un buscador.
            </p>
            {pendingTopicConfirmation && flowStage === "topic_input" ? (
              <div className="rounded-[22px] border border-[rgba(52,20,95,0.14)] bg-[rgba(250,247,253,0.95)] p-4">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  Confirmar tema base
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {pendingTopicConfirmation}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Si este es el nombre correcto, lo usaremos para establecer el contexto de generacion de ideas.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    className="brand-button-primary px-4 py-2 text-sm font-semibold"
                    onClick={() => confirmTopicSelection(pendingTopicConfirmation)}
                    type="button"
                  >
                    Usar este tema
                  </button>
                  <button
                    className="brand-button-secondary px-4 py-2 text-sm font-semibold"
                    onClick={() => setPendingTopicConfirmation(null)}
                    type="button"
                  >
                    Seguir editando
                  </button>
                </div>
              </div>
            ) : null}
            {confirmedTopic ? (
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(250,247,253,0.9)] p-4">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  Tema confirmado
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {confirmedTopic}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Este tema fija el contexto. A partir de aqui generamos ideas y luego variantes.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="brand-button-secondary px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
                disabled={!canGenerateIdeas}
                onClick={() => requestIdeaDrafts({ seedText: confirmedTopic ?? undefined })}
                type="button"
              >
                <WandSparkles className="mr-2 size-4" />
                {isGeneratingIdeas
                  ? "Generando..."
                  : generatedIdeas.length >= MAX_GENERATED_IDEAS
                    ? "Limite alcanzado"
                    : "Generar idea"}
              </button>
              <p className="text-sm leading-6 text-[var(--color-muted)]">
                {flowStage === "topic_input"
                  ? "Primero confirma el tema."
                  : flowStage === "topic_confirmed"
                    ? "Genera hasta 5 ideas y luego elige una."
                    : "Ya elegiste una idea principal. Ahora define una variante o continua con esa base."}
              </p>
            </div>
            {ideaDraftError ? (
              <p className="text-sm text-rose-600">{ideaDraftError}</p>
            ) : null}
            {ideaDraftMessage ? (
              <p className="text-sm text-emerald-700">{ideaDraftMessage}</p>
            ) : null}
            {generatedIdeas.length > 0 ? (
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(250,247,253,0.9)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-ink)]">
                      Idea generada actual
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">
                      {activeGeneratedIdeaIndex + 1}/{generatedIdeas.length} ideas
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Idea anterior"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-[rgba(74,58,97,0.1)] text-[var(--color-muted)] disabled:opacity-40"
                      disabled={activeGeneratedIdeaIndex === 0 || flowStage === "variant_selection"}
                      onClick={() => applyGeneratedIdea(activeGeneratedIdeaIndex - 1)}
                      type="button"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      aria-label="Idea siguiente"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-[rgba(74,58,97,0.1)] text-[var(--color-muted)] disabled:opacity-40"
                      disabled={
                        activeGeneratedIdeaIndex >= generatedIdeas.length - 1 ||
                        flowStage === "variant_selection"
                      }
                      onClick={() => applyGeneratedIdea(activeGeneratedIdeaIndex + 1)}
                      type="button"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
                {activeGeneratedIdea ? (
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                        {activeGeneratedIdea.title}
                      </p>
                      <p className="text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                        {activeGeneratedIdea.rationale}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        className="brand-button-primary px-4 py-2 text-sm font-semibold"
                        disabled={flowStage === "variant_selection"}
                        onClick={lockIdeaSelection}
                        type="button"
                      >
                        Elegir esta idea
                      </button>
                      {selectedIdea &&
                      normalizeSearchText(selectedIdea.title) ===
                        normalizeSearchText(activeGeneratedIdea.title) ? (
                        <span className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                          Idea fijada
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
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
                disabled={flowStage !== "topic_input"}
                onClick={() => setIsProgramEditable((current) => !current)}
                type="button"
              >
                {isProgramEditable ? "Ocultar" : "Editar"}
              </button>
            </div>

            {isProgramEditable ? (
              <input
                className={fieldClassName}
                disabled={flowStage !== "topic_input"}
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

      <details className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-5">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {flowStage === "variant_selection"
            ? "Elegir una variante final"
            : hasCustomIdea
              ? "Ver temas relacionados con tu idea"
              : "Explorar temas relacionados dentro del area"}
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            {flowStage === "variant_selection"
              ? "Ahora ya no editamos lo anterior. Si eliges una variante, esa sera la base final; si no, se usara la idea principal que fijaste."
              : "Aqui solo mostramos temas relacionados con tu idea actual y con la carrera elegida para ayudarte a cerrar el tema base."}
          </p>

          {flowStage === "variant_selection" && selectedIdea ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                Idea principal elegida
              </p>
              <div className="rounded-[22px] border border-[rgba(74,58,97,0.08)] bg-[rgba(250,247,253,0.9)] p-4">
                <p className="font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                  {selectedIdea.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  {selectedIdea.rationale}
                </p>
              </div>
            </div>
          ) : null}

          {flowStage === "variant_selection" && selectedIdeaVariants.length > 0 ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                Variantes relacionadas
              </p>
              {selectedIdeaVariants.map((idea, index) => (
                <button
                  className={getSuggestionCardClassName(
                    index === 0 ? "mint" : index === 1 ? "lilac" : "gold",
                    normalizeSearchText(selectedVariantTitle ?? "") ===
                      normalizeSearchText(idea.title),
                  )}
                  key={`${idea.title}-${index}`}
                  onClick={() => {
                    setSelectedVariantTitle(idea.title);
                  }}
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
                      {normalizeSearchText(selectedVariantTitle ?? "") ===
                      normalizeSearchText(idea.title)
                        ? "Variante elegida"
                        : "Variante"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {flowStage !== "variant_selection" ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
                Temas del catalogo relacionados
              </p>
              {visibleSuggestionEntries.map((entry) => {
                const isActive = entry.preset.id === selectedSuggestion?.id;

                return (
                  <button
                    aria-pressed={isActive}
                    className={getSuggestionCardClassName(entry.tone, isActive)}
                    key={entry.preset.id}
                    onClick={() => {
                      setSelectedSuggestionId(entry.preset.id);

                      if (flowStage === "topic_input") {
                        setInterestText(entry.preset.title);
                        openTopicConfirmation(entry.preset.title);
                      }
                    }}
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
          ) : (
            <div className="rounded-[22px] border border-dashed border-[rgba(74,58,97,0.12)] px-4 py-4 text-sm leading-6 text-[var(--color-muted)]">
              Si no eliges una variante, continuaremos con la idea principal seleccionada.
            </div>
          )}
        </div>
      </details>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={!canContinue}
          type="submit"
        >
          {isPending ? "Creando..." : "Continuar"}
        </button>
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          {flowStage === "variant_selection"
            ? "Guardaremos la variante elegida o, si no elegiste una, la idea principal seleccionada."
            : "Confirma el tema y luego fija una idea para poder continuar."}
        </p>
      </div>
    </form>
  );
}
