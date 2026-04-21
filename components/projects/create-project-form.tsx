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
  type ProjectPreset,
  type ProjectPresetDegreeLevel,
} from "@/lib/project-presets";
import {
  getFeaturedProjectUniversityOptions,
  getProjectTemplateKeyForUniversity,
  type ProjectTemplateKey,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";

const FEATURED_UNIVERSITIES = getFeaturedProjectUniversityOptions();
const PRIMARY_UNIVERSITY_CODES = ["UPC", "UCV", "USMP"] as const;
const PRIMARY_UNIVERSITY_CODE_SET = new Set<ProjectUniversityCode>(PRIMARY_UNIVERSITY_CODES);
const PRIMARY_UNIVERSITIES = FEATURED_UNIVERSITIES.filter((option) =>
  PRIMARY_UNIVERSITY_CODE_SET.has(option.code),
);

const fieldClassName = "brand-input";

type SuggestionTone = "lilac" | "gold" | "mint" | "blush";

type SuggestionEntry = {
  preset: ProjectPreset;
  reasons: string[];
  score: number;
  tone: SuggestionTone;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getInterestTokens(value: string) {
  const normalized = normalizeSearchText(value);

  if (!normalized) {
    return [];
  }

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 4),
    ),
  );
}

function getProgramDefault(careerId: string, degreeLevel: ProjectPresetDegreeLevel) {
  return (
    PROJECT_PRESETS.find(
      (preset) =>
        preset.careerId === careerId && preset.degreeLevel === degreeLevel,
    )?.program ?? ""
  );
}

function buildSuggestionEntries(params: {
  careerId: string;
  degreeLevel: ProjectPresetDegreeLevel;
  university: ProjectUniversityCode;
  templateKey: ProjectTemplateKey;
  interestText: string;
}) {
  const { careerId, degreeLevel, university, templateKey, interestText } = params;
  const interestTokens = getInterestTokens(interestText);
  const normalizedInterest = normalizeSearchText(interestText);
  const tones: SuggestionTone[] = ["lilac", "gold", "mint", "blush"];

  return PROJECT_PRESETS.filter((preset) => preset.careerId === careerId)
    .map((preset) => {
      const reasons: string[] = [];
      let score = 0;

      if (preset.degreeLevel === degreeLevel) {
        score += 5;
        reasons.push(
          degreeLevel === "MAESTRIA"
            ? "Encaja con maestria."
            : "Encaja con posgrado.",
        );
      }

      if (preset.university === university) {
        score += 4;
        reasons.push("Compatible con la universidad elegida.");
      } else if (preset.templateKey === templateKey) {
        score += 2;
        reasons.push("Compatible con la plantilla activa.");
      }

      const haystack = normalizeSearchText(
        [preset.label, preset.title, preset.researchLine].join(" "),
      );

      const matchingTokens = interestTokens.filter((token) => haystack.includes(token));

      if (matchingTokens.length > 0) {
        score += matchingTokens.length * 3;
        reasons.push(
          `Se acerca a tu interes: ${matchingTokens.slice(0, 2).join(", ")}.`,
        );
      } else if (normalizedInterest.length >= 10 && haystack.includes(normalizedInterest)) {
        score += 4;
        reasons.push("Se alinea de forma directa con lo que escribiste.");
      }

      if (reasons.length === 0) {
        reasons.push("Base corta del catalogo para empezar rapido.");
      }

      return { preset, reasons, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.preset.degreeLevel !== right.preset.degreeLevel) {
        return left.preset.degreeLevel === degreeLevel ? -1 : 1;
      }

      if (left.preset.university !== right.preset.university) {
        return left.preset.university === university ? -1 : 1;
      }

      return left.preset.title.localeCompare(right.preset.title, "es");
    })
    .slice(0, 4)
    .map((entry, index) => ({
      ...entry,
      tone: tones[index % tones.length],
    }));
}

function getSuggestionCardClassName(tone: SuggestionTone, isActive: boolean) {
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
  const [isProgramEditable, setIsProgramEditable] = useState(false);
  const [hasManualProgram, setHasManualProgram] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredInterestText = useDeferredValue(interestText);

  const suggestionEntries = useMemo(
    () =>
      buildSuggestionEntries({
        careerId,
        degreeLevel,
        university,
        templateKey,
        interestText: deferredInterestText,
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
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogTopicId: selectedSuggestion.id,
          title: selectedSuggestion.title,
          degreeLevel,
          university,
          program,
          templateKey,
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

      router.push(`/projects/${payload.project.id}`);
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
          Define contexto y entra con una base sugerida.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/76">
          Este paso solo necesita universidad, nivel, area e interes. Ingeniometrix
          usa el catalogo actual para proponerte temas iniciales y dejar listo el
          ingreso al workspace.
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
              Carrera o area
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
            Tema o interes de investigacion
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
            Todavia no guardamos este texto como campo propio. Aqui solo lo usamos
            para priorizar una base del catalogo y acelerar tu entrada al proyecto.
          </p>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-3 rounded-[28px] p-5 brand-card-lilac sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(23,19,31,0.52)]">
              Paso 2
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Elige una sugerencia inicial.
            </p>
            <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              Estas opciones salen del catalogo actual del MVP. Te damos una base
              clara hoy y el refinamiento fino queda para el intake.
            </p>
          </div>

          <div className="rounded-[22px] bg-white/70 px-4 py-3 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
            <strong>{suggestionEntries.length}</strong> sugerencias activas para{" "}
            {degreeLevel === "MAESTRIA" ? "maestria" : "posgrado"}.
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
                      {isActive ? "Seleccionado" : "Sugerencia"}
                    </div>
                    <p className="text-sm leading-6 text-[rgba(23,19,31,0.72)] lg:text-right">
                      {entry.reasons[0]}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {entry.reasons.map((reason) => (
                    <span
                      className="rounded-full bg-white/72 px-3 py-2 text-xs font-medium text-[rgba(23,19,31,0.72)]"
                      key={reason}
                    >
                      {reason}
                    </span>
                  ))}
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
              Paso 3
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Entra al workspace con una base lista.
            </p>
            <p className="mt-2 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
              Apenas se cree el proyecto, pasaras al workspace para completar el
              intake, buscar fuentes y convertir esta idea inicial en un blueprint
              trazable.
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
          {isPending ? "Creando..." : "Crear proyecto con esta base"}
        </button>
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          La sugerencia elegida se puede refinar despues. Aqui solo buscamos una
          salida rapida y coherente hacia el intake.
        </p>
      </div>
    </form>
  );
}
