"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  PROJECT_CAREERS,
  PROJECT_PRESETS,
  getProjectPresetById,
  getProjectPresetsByCareer,
  type ProjectPreset,
  type ProjectPresetDegreeLevel,
} from "@/lib/project-presets";
import {
  getFeaturedProjectUniversityOptions,
  getProjectTemplateKeyForUniversity,
  type ProjectTemplateKey,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";

const PRESET_STORAGE_KEY = "imx-project-preset-seed";
const FEATURED_UNIVERSITIES = getFeaturedProjectUniversityOptions();

const fieldClassName =
  "h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm focus:border-lime-400 focus:ring-4 focus:ring-lime-100";

export function CreateProjectForm() {
  const router = useRouter();
  const [careerId, setCareerId] = useState(PROJECT_CAREERS[0]?.id ?? "");
  const [catalogTopicId, setCatalogTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [degreeLevel, setDegreeLevel] =
    useState<ProjectPresetDegreeLevel>("MAESTRIA");
  const [university, setUniversity] = useState<ProjectUniversityCode>("UPC");
  const [program, setProgram] = useState("");
  const [templateKey, setTemplateKey] =
    useState<ProjectTemplateKey>("UPC_POSGRADO");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePreset, setActivePreset] = useState<ProjectPreset | null>(null);

  const careerPresets = useMemo(
    () => getProjectPresetsByCareer(careerId),
    [careerId],
  );

  function applyPreset(preset: ProjectPreset) {
    setCareerId(preset.careerId);
    setCatalogTopicId(preset.id);
    setTitle(preset.title);
    setDegreeLevel(preset.degreeLevel);
    setUniversity(preset.university);
    setProgram(preset.program);
    setTemplateKey(preset.templateKey);
    setActivePreset(preset);
  }

  function getNextPreset() {
    const rawIndex = window.localStorage.getItem(PRESET_STORAGE_KEY);
    const parsedIndex = Number.parseInt(rawIndex ?? "0", 10);
    const safeIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;
    const nextPreset = PROJECT_PRESETS[safeIndex % PROJECT_PRESETS.length];

    window.localStorage.setItem(
      PRESET_STORAGE_KEY,
      String((safeIndex + 1) % PROJECT_PRESETS.length),
    );

    return nextPreset;
  }

  useEffect(() => {
    applyPreset(getNextPreset());
  }, []);

  function handleCareerChange(nextCareerId: string) {
    const nextPreset = getProjectPresetsByCareer(nextCareerId)[0];
    setCareerId(nextCareerId);

    if (nextPreset) {
      applyPreset(nextPreset);
    }
  }

  function handleProjectChange(nextProjectId: string) {
    const nextPreset = getProjectPresetById(nextProjectId);

    if (nextPreset) {
      applyPreset(nextPreset);
    }
  }

  function handleUniversityChange(nextUniversity: ProjectUniversityCode) {
    setUniversity(nextUniversity);
    setTemplateKey(getProjectTemplateKeyForUniversity(nextUniversity));
  }

  function cyclePreset() {
    applyPreset(getNextPreset());
  }

  function handleTabSuggestion(
    event: KeyboardEvent<HTMLInputElement>,
    currentValue: string,
    suggestion: string,
    applyValue: (value: string) => void,
  ) {
    if (event.key !== "Tab" || !suggestion) {
      return;
    }

    const normalizedCurrent = currentValue.trim().toLowerCase();
    const normalizedSuggestion = suggestion.trim().toLowerCase();

    if (
      normalizedCurrent.length === 0 ||
      (normalizedSuggestion.startsWith(normalizedCurrent) &&
        normalizedCurrent !== normalizedSuggestion)
    ) {
      event.preventDefault();
      applyValue(suggestion);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogTopicId,
          title,
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
      <div className="surface-panel grid gap-4 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 p-5 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            Catalogo activo
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-slate-950">
            {activePreset ? activePreset.label : "Cargando catalogo..."}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Selecciona una carrera, luego uno de los 100 titulos disponibles. Cada
            proyecto arrastra 20 intakes de tesis relacionados.
          </p>
        </div>

        <div className="grid gap-3 sm:justify-items-end">
          <p className="max-w-xs text-sm leading-6 text-slate-500">
            Presiona <strong>Tab</strong> para autocompletar Programa o usa el
            siguiente proyecto sugerido.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            onClick={cyclePreset}
            type="button"
          >
            Siguiente proyecto
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-600" htmlFor="project-career">
            Carrera
          </label>
          <select
            className={fieldClassName}
            id="project-career"
            onChange={(event) => handleCareerChange(event.target.value)}
            value={careerId}
          >
            {PROJECT_CAREERS.map((career) => (
              <option key={career.id} value={career.id}>
                {career.label} ({career.topicCount} temas)
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-600" htmlFor="project-title">
            Titulo del proyecto
          </label>
          <select
            className={fieldClassName}
            id="project-title"
            onChange={(event) => handleProjectChange(event.target.value)}
            required
            value={catalogTopicId}
          >
            {careerPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.title}
              </option>
            ))}
          </select>
          {activePreset ? (
            <p className="text-sm leading-6 text-slate-500">
              Linea sugerida: {activePreset.researchLine}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-600" htmlFor="project-program">
            Programa
          </label>
          <input
            className={fieldClassName}
            id="project-program"
            onChange={(event) => setProgram(event.target.value)}
            onKeyDown={(event) =>
              handleTabSuggestion(event, program, activePreset?.program ?? "", setProgram)
            }
            placeholder="Ej. Maestria en Gestion Empresarial"
            required
            value={program}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-600" htmlFor="project-degree">
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
          <label className="text-sm font-semibold text-slate-600" htmlFor="project-university">
            Universidad
          </label>
          <select
            className={fieldClassName}
            id="project-university"
            onChange={(event) =>
              handleUniversityChange(event.target.value as ProjectUniversityCode)
            }
            value={university}
          >
            {FEATURED_UNIVERSITIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.shortName} - {option.label}
              </option>
            ))}
          </select>
          <p className="text-sm leading-6 text-slate-500">
            El combo muestra 10 universidades destacadas; el asset local contiene
            el catalogo nacional completo.
          </p>
        </div>

        <div className="grid gap-2 lg:col-span-2">
          <label className="text-sm font-semibold text-slate-600" htmlFor="project-template">
            Plantilla
          </label>
          <input
            className={fieldClassName}
            id="project-template"
            readOnly
            value={templateKey}
          />
          <p className="text-sm leading-6 text-slate-500">
            La plantilla se asigna automaticamente segun la universidad elegida.
          </p>
        </div>
      </div>

      <div className="surface-panel rounded-[28px] p-5">
        <p className="text-sm leading-6 text-slate-600">
          Este paso ahora crea el proyecto sobre un catalogo estructurado:
          10 carreras, 100 temas uniformemente distribuidos y 20 intakes listos por
          cada titulo seleccionado.
        </p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_rgba(163,230,53,0.32)] hover:-translate-y-0.5 hover:bg-lime-300 disabled:cursor-wait disabled:opacity-70"
          disabled={isPending || !catalogTopicId}
          type="submit"
        >
          {isPending ? "Creando..." : "Crear proyecto"}
        </button>
        <p className="text-sm leading-6 text-slate-500">
          Consejo: crea el proyecto con el titulo del catalogo y luego el intake ya
          quedara filtrado a sus 20 variantes relacionadas.
        </p>
      </div>
    </form>
  );
}
