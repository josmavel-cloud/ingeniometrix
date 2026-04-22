"use client";

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
  PROJECT_CAREERS,
  PROJECT_PRESETS,
  type ProjectPresetDegreeLevel,
} from "@/lib/project-presets";
import {
  getFeaturedProjectUniversityOptions,
  getProjectTemplateKeyForUniversity,
  type ProjectTemplateKey,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";
import {
  buildProjectPresetSuggestionEntries,
  getTopicAreaLabel,
  type TopicSuggestionTone,
} from "@/lib/topic-suggestion-scoring";

const FEATURED_UNIVERSITIES = getFeaturedProjectUniversityOptions();
const PRIMARY_UNIVERSITY_CODES = ["UPC", "UCV", "USMP"] as const;
const PRIMARY_UNIVERSITY_CODE_SET = new Set<ProjectUniversityCode>(PRIMARY_UNIVERSITY_CODES);
const PRIMARY_UNIVERSITIES = FEATURED_UNIVERSITIES.filter((option) =>
  PRIMARY_UNIVERSITY_CODE_SET.has(option.code),
);

const fieldClassName = "brand-input";

function getProgramDefault(careerId: string, degreeLevel: ProjectPresetDegreeLevel) {
  return (
    PROJECT_PRESETS.find(
      (preset) =>
        preset.careerId === careerId && preset.degreeLevel === degreeLevel,
    )?.program ?? ""
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
  const [careerId, setCareerId] = useState(PROJECT_CAREERS[0]?.id ?? "");
  const [degreeLevel, setDegreeLevel] =
    useState<ProjectPresetDegreeLevel>("MAESTRIA");
  const [university, setUniversity] = useState<ProjectUniversityCode>("UPC");
  const [program, setProgram] = useState(
    getProgramDefault(PROJECT_CAREERS[0]?.id ?? "", "MAESTRIA"),
  );
  const [interestText, setInterestText] = useState("");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState("");
  const [templateKey, setTemplateKey] =
    useState<ProjectTemplateKey>("UPC_POSGRADO");
  const [isAreaEditable, setIsAreaEditable] = useState(false);
  const [customAreaLabel, setCustomAreaLabel] = useState("");
  const [isProgramEditable, setIsProgramEditable] = useState(false);
  const [hasManualProgram, setHasManualProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredInterestText = useDeferredValue(interestText);

  const suggestionEntries = useMemo(
    () =>
      buildProjectPresetSuggestionEntries({
        areaId: careerId,
        degreeLevel,
        university,
        templateKey,
        interestText: deferredInterestText,
        limit: 4,
      }),
    [careerId, degreeLevel, deferredInterestText, templateKey, university],
  );

  const selectedSuggestion =
    suggestionEntries.find((entry) => entry.preset.id === selectedSuggestionId)?.preset ??
    suggestionEntries[0]?.preset ??
    null;

  useEffect(() => {
    setTemplateKey(getProjectTemplateKeyForUniversity(university));
  }, [university]);

  useEffect(() => {
    if (hasManualProgram) {
      return;
    }

    setProgram(getProgramDefault(careerId, degreeLevel));
  }, [careerId, degreeLevel, hasManualProgram]);

  useEffect(() => {
    if (selectedSuggestion && selectedSuggestionId !== selectedSuggestion.id) {
      setSelectedSuggestionId(selectedSuggestion.id);
    }
  }, [selectedSuggestion, selectedSuggestionId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedSuggestion) {
      setError("Selecciona una sugerencia para continuar.");
      return;
    }

    startTransition(async () => {
      const trimmedIdea = interestText.trim();
      const usingCustomIdea = trimmedIdea.length > 0;
      const resolvedAreaLabel =
        customAreaLabel.trim().length > 0
          ? customAreaLabel.trim()
          : getTopicAreaLabel(careerId) ?? null;

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
          topicAreaId:
            customAreaLabel.trim().length > 0 ? undefined : careerId,
          topicAreaLabel: resolvedAreaLabel,
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
    <form className="grid gap-8" onSubmit={handleSubmit}>
      <div className="rounded-[30px] p-5 brand-card-primary sm:p-6">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
          Menos de 10 segundos
        </p>
        <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">
          Define contexto y registra tu idea como punto de partida.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/76">
          Este paso ya guarda tu idea original. La siguiente pantalla te mostrara
          variantes derivadas de esa semilla o de la opcion que elijas aqui.
        </p>
      </div>

      <section className="grid gap-6">
        <div className="grid gap-4 lg:grid-cols-2">
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
              onChange={(event) =>
                setDegreeLevel(event.target.value as ProjectPresetDegreeLevel)
              }
              value={degreeLevel}
            >
              <option value="MAESTRIA">Maestria</option>
              <option value="POSGRADO">Posgrado</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label
              className="text-sm font-semibold text-[var(--color-muted)]"
              htmlFor="project-career"
            >
              Carrera o area base
            </label>
            <select
              className={fieldClassName}
              id="project-career"
              onChange={(event) => setCareerId(event.target.value)}
              value={careerId}
            >
              {PROJECT_CAREERS.map((career) => (
                <option key={career.id} value={career.id}>
                  {career.label}
                </option>
              ))}
            </select>
            <button
              className="brand-button-secondary w-fit px-4 py-2 text-sm font-semibold"
              onClick={() => setIsAreaEditable((current) => !current)}
              type="button"
            >
              {isAreaEditable ? "Ocultar area libre" : "Escribir area propia"}
            </button>
            {isAreaEditable ? (
              <input
                className={fieldClassName}
                onChange={(event) => setCustomAreaLabel(event.target.value)}
                placeholder="Ej. Innovacion educativa aplicada"
                value={customAreaLabel}
              />
            ) : null}
          </div>
        </div>

        <div className="grid gap-3">
          <label className="text-sm font-semibold text-[var(--color-muted)]">
            Universidad base del MVP
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {PRIMARY_UNIVERSITIES.map((option) => {
              const isActive = option.code === university;

              return (
                <button
                  className={[
                    "rounded-[24px] border p-4 text-left",
                    isActive
                      ? "border-[rgba(52,20,95,0.34)] bg-[rgba(255,255,255,0.96)] shadow-[0_18px_40px_rgba(52,20,95,0.14)]"
                      : "border-[rgba(74,58,97,0.1)] bg-[rgba(255,255,255,0.82)] hover:-translate-y-[1px]",
                  ].join(" ")}
                  key={option.code}
                  onClick={() => setUniversity(option.code)}
                  type="button"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[rgba(100,94,115,0.7)]">
                    {option.shortName}
                  </p>
                  <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
                    {option.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    Plantilla {option.templateKey}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-2">
          <label
            className="text-sm font-semibold text-[var(--color-muted)]"
            htmlFor="project-interest"
          >
            Tu idea de tema
          </label>
          <textarea
            className="brand-textarea"
            id="project-interest"
            onChange={(event) => setInterestText(event.target.value)}
            placeholder="Ej. IA generativa en procesos administrativos, trazabilidad en cadenas de frio o bienestar laboral en salud."
            rows={4}
            value={interestText}
          />
          <p className="text-sm leading-6 text-[var(--color-muted)]">
            Si escribes aqui, Ingeniometrix priorizara esta idea al crear el
            proyecto y generara otras variantes en la siguiente pantalla.
          </p>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-3 rounded-[28px] p-5 brand-card-lilac sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(23,19,31,0.52)]">
              Referencias iniciales
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              El catalogo sigue ayudando, pero ya no manda por encima de tu idea.
            </p>
            <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Estas opciones se usan como apoyo. La seleccion definitiva del tema se
              hara en la siguiente etapa del flujo.
            </p>
          </div>

          <div className="rounded-[22px] bg-white/70 px-4 py-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
            <strong>{suggestionEntries.length}</strong> ideas relacionadas para tomar
            impulso.
          </div>
        </div>

        <div className="grid gap-4">
          {suggestionEntries.map((entry) => {
            const isActive = entry.preset.id === selectedSuggestion?.id;

            return (
              <button
                aria-pressed={isActive}
                className={getSuggestionCardClassName(entry.tone, isActive)}
                key={entry.preset.id}
                onClick={() => setSelectedSuggestionId(entry.preset.id)}
                type="button"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(23,19,31,0.54)]">
                      {entry.preset.careerLabel}
                    </p>
                    <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                      {entry.preset.title}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                      Linea sugerida: {entry.preset.researchLine}
                    </p>
                  </div>

                  <div className="grid gap-2 lg:max-w-sm lg:justify-items-end">
                    <div className="inline-flex rounded-full bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.64)]">
                      {isActive ? "Base elegida" : "Referencia"}
                    </div>
                    <p className="text-sm leading-6 text-[rgba(23,19,31,0.72)] lg:text-right">
                      {entry.reasons[0]}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 rounded-[28px] p-5 brand-card-gold">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(23,19,31,0.52)]">
              Siguiente etapa
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Elegir el tema definitivo del proyecto.
            </p>
            <p className="mt-2 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
              Despues del alta entraras a una pantalla de tema donde podras usar tu
              idea tal como esta, elegir una variante o regenerar nuevas opciones.
            </p>
          </div>

          <div className="rounded-[24px] bg-white/70 px-4 py-4 text-sm leading-6 text-[rgba(23,19,31,0.72)] lg:max-w-sm">
            <p>
              <strong>Universidad:</strong>{" "}
              {FEATURED_UNIVERSITIES.find((option) => option.code === university)?.shortName ??
                university}
            </p>
            <p>
              <strong>Plantilla:</strong> {templateKey}
            </p>
            <p>
              <strong>Programa:</strong> {program}
            </p>
            <p>
              <strong>Area:</strong>{" "}
              {customAreaLabel.trim() || getTopicAreaLabel(careerId) || "No especificada"}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-[rgba(23,19,31,0.72)]">
              Programa sugerido
            </p>
            <button
              className="brand-button-secondary px-4 py-2 text-sm font-semibold"
              onClick={() => setIsProgramEditable((current) => !current)}
              type="button"
            >
              {isProgramEditable ? "Ocultar edicion" : "Editar programa"}
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
            <p className="text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Lo precargamos desde tu area y nivel para que no tengas que pensar de
              mas en este primer paso.
            </p>
          )}
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isPending || !selectedSuggestion || program.trim().length === 0}
          type="submit"
        >
          {isPending ? "Creando..." : "Crear proyecto y pasar a tema"}
        </button>
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          La siguiente pantalla convertira tu idea original o esta referencia en la
          base tematica definitiva del proyecto.
        </p>
      </div>
    </form>
  );
}
