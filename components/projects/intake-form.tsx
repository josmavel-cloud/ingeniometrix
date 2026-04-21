"use client";

import type { Intake, Project } from "@prisma/client";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { IntakePreset } from "@/lib/intake-presets";
import {
  findProjectPresetByTitle,
  getProjectPresetById,
} from "@/lib/project-presets";

type IntakeFormProps = {
  project: Project & {
    intake: Intake | null;
  };
};

type IntakeState = {
  topic: string;
  problemContext: string;
  researchLine: string;
  academicConstraints: string;
  targetPopulation: string;
  availableData: string;
  preferredMethodology: string;
  advisorNotes: string;
};

const inputClassName =
  "h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm focus:border-lime-400 focus:ring-4 focus:ring-lime-100";

const textareaClassName =
  "rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm focus:border-lime-400 focus:ring-4 focus:ring-lime-100";

export function IntakeForm({ project }: IntakeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<IntakeState>({
    topic: project.intake?.topic ?? "",
    problemContext: project.intake?.problemContext ?? "",
    researchLine: project.intake?.researchLine ?? "",
    academicConstraints: project.intake?.academicConstraints ?? "",
    targetPopulation: project.intake?.targetPopulation ?? "",
    availableData: project.intake?.availableData ?? "",
    preferredMethodology: project.intake?.preferredMethodology ?? "",
    advisorNotes: project.intake?.advisorNotes ?? "",
  });
  const [activePresetId, setActivePresetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const relatedProjectPreset = useMemo(
    () =>
      getProjectPresetById(project.catalogTopicId) ??
      findProjectPresetByTitle(project.title),
    [project.catalogTopicId, project.title],
  );

  const intakePresets = useMemo(
    () => relatedProjectPreset?.intakePresets ?? [],
    [relatedProjectPreset],
  );

  const activePreset = useMemo(
    () =>
      intakePresets.find((preset) => preset.id === activePresetId) ??
      intakePresets[0] ??
      null,
    [activePresetId, intakePresets],
  );

  function applyPreset(preset: IntakePreset) {
    setActivePresetId(preset.id);
    setForm({
      topic: preset.topic,
      problemContext: preset.problemContext,
      researchLine: preset.researchLine,
      academicConstraints: preset.academicConstraints,
      targetPopulation: preset.targetPopulation,
      availableData: preset.availableData,
      preferredMethodology: preset.preferredMethodology,
      advisorNotes: preset.advisorNotes,
    });
  }

  function updateField<K extends keyof IntakeState>(key: K, value: IntakeState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  useEffect(() => {
    const firstPreset = intakePresets[0];

    if (!firstPreset) {
      return;
    }

    if (project.intake) {
      setActivePresetId(firstPreset.id);
      return;
    }

    applyPreset(firstPreset);
  }, [intakePresets, project.intake]);

  function cyclePreset() {
    if (intakePresets.length === 0) {
      return;
    }

    const currentIndex = intakePresets.findIndex((preset) => preset.id === activePresetId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % intakePresets.length : 0;
    applyPreset(intakePresets[nextIndex]);
  }

  function handlePresetChange(nextPresetId: string) {
    const nextPreset = intakePresets.find((preset) => preset.id === nextPresetId);

    if (nextPreset) {
      applyPreset(nextPreset);
    }
  }

  function handleTabSuggestion<K extends keyof IntakeState>(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    key: K,
  ) {
    if (event.key !== "Tab" || !activePreset) {
      return;
    }

    const suggestion = activePreset[key];
    const currentValue = form[key];
    const normalizedCurrent = currentValue.trim().toLowerCase();
    const normalizedSuggestion = suggestion.trim().toLowerCase();

    if (!suggestion) {
      return;
    }

    if (
      normalizedCurrent.length === 0 ||
      (normalizedSuggestion.startsWith(normalizedCurrent) &&
        normalizedCurrent !== normalizedSuggestion)
    ) {
      event.preventDefault();
      updateField(key, suggestion as IntakeState[K]);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${project.id}/intake`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo guardar el intake.");
        return;
      }

      setSuccess("Intake guardado correctamente.");
      router.refresh();
    });
  }

  return (
    <form className="grid gap-8" onSubmit={handleSubmit}>
      <div className="surface-panel grid gap-4 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 p-5 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            Intakes relacionados
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-slate-950">
            {relatedProjectPreset
              ? `${relatedProjectPreset.label} (${intakePresets.length} variantes)`
              : "Proyecto sin catalogo relacionado"}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Este formulario ya no usa ejemplos globales: solo trabaja con los 20
            intakes derivados del titulo seleccionado en el proyecto.
          </p>
        </div>

        <div className="grid gap-3 sm:justify-items-end">
          <p className="max-w-xs text-sm leading-6 text-slate-500">
            Presiona <strong>Tab</strong> para autocompletar el campo actual con
            el preset activo.
          </p>
          <button
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:text-slate-950"
            onClick={cyclePreset}
            type="button"
          >
            Siguiente intake
          </button>
        </div>
      </div>

      {intakePresets.length > 0 ? (
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-slate-600" htmlFor="intake-preset">
            Variante de intake
          </label>
          <select
            className={inputClassName}
            id="intake-preset"
            onChange={(event) => handlePresetChange(event.target.value)}
            value={activePreset?.id ?? ""}
          >
            {intakePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
          No se encontro un catalogo relacionado para este proyecto. Puedes completar
          el intake manualmente, pero los proyectos nuevos ya quedan enlazados
          automaticamente mediante <code>catalogTopicId</code>.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <label className="grid gap-2 lg:col-span-2">
          <span className="text-sm font-semibold text-slate-600">Tema</span>
          <textarea
            className={textareaClassName}
            onChange={(event) => updateField("topic", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "topic")}
            placeholder="Describe el tema central de investigacion."
            required
            rows={3}
            value={form.topic}
          />
        </label>

        <label className="grid gap-2 lg:col-span-2">
          <span className="text-sm font-semibold text-slate-600">Contexto del problema</span>
          <textarea
            className={textareaClassName}
            onChange={(event) => updateField("problemContext", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "problemContext")}
            placeholder="Explica el problema y por que importa."
            rows={4}
            value={form.problemContext}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-600">Linea de investigacion</span>
          <input
            className={inputClassName}
            onChange={(event) => updateField("researchLine", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "researchLine")}
            placeholder="Ej. transformacion digital"
            value={form.researchLine}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-600">Metodologia preferida</span>
          <input
            className={inputClassName}
            onChange={(event) => updateField("preferredMethodology", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "preferredMethodology")}
            placeholder="Ej. enfoque mixto, cuantitativo, estudio de caso"
            value={form.preferredMethodology}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-600">Poblacion objetivo</span>
          <textarea
            className={textareaClassName}
            onChange={(event) => updateField("targetPopulation", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "targetPopulation")}
            placeholder="Describe la poblacion o unidad de analisis."
            rows={3}
            value={form.targetPopulation}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-600">Datos disponibles</span>
          <textarea
            className={textareaClassName}
            onChange={(event) => updateField("availableData", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "availableData")}
            placeholder="Indica que datos o acceso real tienes."
            rows={3}
            value={form.availableData}
          />
        </label>

        <label className="grid gap-2 lg:col-span-2">
          <span className="text-sm font-semibold text-slate-600">Restricciones academicas</span>
          <textarea
            className={textareaClassName}
            onChange={(event) => updateField("academicConstraints", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "academicConstraints")}
            placeholder="Normas, alcance, observaciones formales o limites del programa."
            rows={3}
            value={form.academicConstraints}
          />
        </label>

        <label className="grid gap-2 lg:col-span-2">
          <span className="text-sm font-semibold text-slate-600">Observaciones del asesor</span>
          <textarea
            className={textareaClassName}
            onChange={(event) => updateField("advisorNotes", event.target.value)}
            onKeyDown={(event) => handleTabSuggestion(event, "advisorNotes")}
            placeholder="Pega aqui comentarios, requisitos o restricciones del asesor."
            rows={6}
            value={form.advisorNotes}
          />
        </label>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_rgba(163,230,53,0.32)] hover:-translate-y-0.5 hover:bg-lime-300 disabled:cursor-wait disabled:opacity-70"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Guardando..." : "Guardar intake"}
        </button>
        <p className="text-sm leading-6 text-slate-500">
          El estado pasa a <strong>INTAKE_READY</strong> cuando completas tema,
          contexto del problema y poblacion objetivo.
        </p>
      </div>
    </form>
  );
}
