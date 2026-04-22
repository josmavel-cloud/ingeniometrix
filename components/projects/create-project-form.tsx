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
  getDegreeLevelLabel,
  getGenericProgramDefault,
  getPresetDegreeLevelForProject,
  PROJECT_DEGREE_LEVEL_OPTIONS,
} from "@/lib/degree-levels";
import { PROJECT_CAREERS, PROJECT_PRESETS } from "@/lib/project-presets";
import {
  getFeaturedProjectUniversityOptions,
  getProjectTemplateKeyForUniversity,
  type ProjectTemplateKey,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";
import {
  buildProjectPresetSuggestionEntries,
  getTopicAreaLabel,
  normalizeSearchText,
  type TopicSuggestionTone,
} from "@/lib/topic-suggestion-scoring";

const FEATURED_UNIVERSITIES = getFeaturedProjectUniversityOptions();
const fieldClassName = "brand-input";

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
  const [templateKey, setTemplateKey] =
    useState<ProjectTemplateKey>("GENERIC_POSGRADO_PE");
  const [isProgramEditable, setIsProgramEditable] = useState(false);
  const [hasManualProgram, setHasManualProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredInterestText = useDeferredValue(interestText);

  const matchedCareer = useMemo(() => findCareerMatch(areaQuery), [areaQuery]);
  const topicAreaId = matchedCareer?.id ?? null;
  const topicAreaLabel =
    areaQuery.trim().length > 0
      ? areaQuery.trim()
      : getTopicAreaLabel(topicAreaId) ?? null;

  const suggestionEntries = useMemo(
    () =>
      buildProjectPresetSuggestionEntries({
        areaId: topicAreaId,
        degreeLevel: getPresetDegreeLevelForProject(degreeLevel),
        university,
        templateKey,
        interestText: deferredInterestText,
        limit: 4,
      }),
    [deferredInterestText, degreeLevel, templateKey, topicAreaId, university],
  );

  const selectedSuggestion =
    suggestionEntries.find((entry) => entry.preset.id === selectedSuggestionId)?.preset ??
    suggestionEntries[0]?.preset ??
    null;
  const hasCustomIdea = interestText.trim().length > 0;
  const visibleSuggestionEntries = suggestionEntries.slice(0, 3);

  useEffect(() => {
    setTemplateKey(getProjectTemplateKeyForUniversity(university));
  }, [university]);

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
          templateKey,
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
          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-[var(--color-muted)]"
              htmlFor="project-degree"
            >
              Nivel
            </label>
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

          <div className="grid gap-3">
            <label className="text-sm font-semibold text-[var(--color-muted)]">
              Universidad
            </label>
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
          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-[var(--color-muted)]"
              htmlFor="project-career"
            >
              Carrera o area base
            </label>
            <input
              className={fieldClassName}
              id="project-career"
              list="project-career-options"
              onChange={(event) => setAreaQuery(event.target.value)}
              placeholder="Selecciona de la lista o escribe tu propia area"
              value={areaQuery}
            />
            <datalist id="project-career-options">
              {PROJECT_CAREERS.map((career) => (
                <option key={career.id} value={career.label} />
              ))}
            </datalist>
            <p className="text-sm leading-6 text-[var(--color-muted)]">
              Puedes elegir una opcion sugerida o escribir un area propia.
            </p>
          </div>

          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-[var(--color-muted)]"
              htmlFor="project-interest"
            >
              Idea original
            </label>
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
              <strong>Plantilla:</strong> {templateKey}
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
          {hasCustomIdea
            ? "Usar una referencia del catalogo en su lugar"
            : "No tengo idea propia: usar una referencia rapida"}
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Elige una referencia corta para arrancar. Luego podras refinar el tema en la siguiente etapa.
          </p>

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
