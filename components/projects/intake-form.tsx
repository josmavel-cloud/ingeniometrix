"use client";

import type { Intake, Project } from "@prisma/client";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { SupportedLanguage } from "@/lib/language";
import type { IntakePreset } from "@/lib/intake-presets";
import { getProjectUiCopy } from "@/lib/project-ui-copy";
import {
  findProjectPresetByTitle,
  getProjectPresetById,
} from "@/lib/project-presets";

type IntakeFormProps = {
  project: Project & {
    intake: Intake | null;
  };
  language: SupportedLanguage;
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

type GeneratedIntakeDraft = IntakeState & {
  label: string;
};

const inputClassName = "brand-input";
const textareaClassName = "brand-textarea";

export function IntakeForm({ project, language }: IntakeFormProps) {
  const router = useRouter();
  const copy = getProjectUiCopy(language).intakeForm;
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
  const [generatedDrafts, setGeneratedDrafts] = useState<GeneratedIntakeDraft[]>([]);
  const [activeGeneratedDraftIndex, setActiveGeneratedDraftIndex] = useState(0);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [hasRequestedInitialDraft, setHasRequestedInitialDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isGeneratingDrafts, startDraftTransition] = useTransition();

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
  const activeGeneratedDraft =
    generatedDrafts[activeGeneratedDraftIndex] ?? generatedDrafts[0] ?? null;

  const quickFieldsReady = [
    form.topic.trim().length > 0,
    form.problemContext.trim().length > 0,
    form.targetPopulation.trim().length > 0,
  ].filter(Boolean).length;
  const quickIntakeReady = quickFieldsReady === 3;
  const hasSuggestedIntakeBase = [
    form.problemContext,
    form.researchLine,
    form.targetPopulation,
    form.preferredMethodology,
    form.availableData,
    form.academicConstraints,
    form.advisorNotes,
  ].some((value) => value.trim().length > 0);
  const needsGeneratedIntake = [
    form.problemContext,
    form.targetPopulation,
    form.availableData,
    form.preferredMethodology,
    form.academicConstraints,
  ].some((value) => value.trim().length === 0);

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

  function applyGeneratedDraft(draft: GeneratedIntakeDraft, index: number) {
    setActiveGeneratedDraftIndex(index);
    setForm({
      topic: draft.topic,
      problemContext: draft.problemContext,
      researchLine: draft.researchLine,
      academicConstraints: draft.academicConstraints,
      targetPopulation: draft.targetPopulation,
      availableData: draft.availableData,
      preferredMethodology: draft.preferredMethodology,
      advisorNotes: draft.advisorNotes,
    });
    setDraftMessage(copy.draftApplied(draft.label));
    setDraftError(null);
  }

  function toIntakeState(draft: IntakeState): IntakeState {
    return {
      topic: draft.topic,
      problemContext: draft.problemContext,
      researchLine: draft.researchLine,
      academicConstraints: draft.academicConstraints,
      targetPopulation: draft.targetPopulation,
      availableData: draft.availableData,
      preferredMethodology: draft.preferredMethodology,
      advisorNotes: draft.advisorNotes,
    };
  }

  async function saveIntakePayload(nextForm: IntakeState) {
    const response = await fetch(`/api/projects/${project.id}/intake`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toIntakeState(nextForm)),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? copy.saveError);
    }

    return payload;
  }

  async function requestGeneratedDrafts(options?: {
    variantSeed?: string;
    autoSaveFirstDraft?: boolean;
  }) {
    setDraftError(null);
    setDraftMessage(null);

    startDraftTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}/intake-drafts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            variantSeed: options?.variantSeed,
            existingDrafts: generatedDrafts,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          drafts?: GeneratedIntakeDraft[];
        };

        if (!response.ok || !payload.drafts?.length) {
          setDraftError(payload.error ?? copy.draftError);
          return;
        }

        const nextDrafts = payload.drafts.slice(0, 3);
        setGeneratedDrafts(nextDrafts);
        applyGeneratedDraft(nextDrafts[0], 0);
        if (options?.autoSaveFirstDraft) {
          await saveIntakePayload(nextDrafts[0]);
          setSuccess(copy.saved);
          router.refresh();
        }
        setDraftMessage(copy.draftsGenerated(nextDrafts.length));
      } catch {
        setDraftError(copy.draftUnavailable);
      }
    });
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

  useEffect(() => {
    if (hasRequestedInitialDraft || isGeneratingDrafts || !needsGeneratedIntake) {
      return;
    }

    if (!form.topic.trim()) {
      return;
    }

    setHasRequestedInitialDraft(true);
    void requestGeneratedDrafts({
      variantSeed: "Complete every missing intake field for the selected topic.",
      autoSaveFirstDraft: true,
    });
  }, [form.topic, hasRequestedInitialDraft, isGeneratingDrafts, needsGeneratedIntake]);

  function cyclePreset() {
    if (generatedDrafts.length > 0) {
      const nextIndex = (activeGeneratedDraftIndex + 1) % generatedDrafts.length;
      applyGeneratedDraft(generatedDrafts[nextIndex], nextIndex);
      return;
    }

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
    const activeSuggestion = activeGeneratedDraft ?? activePreset;

    if (event.key !== "Tab" || !activeSuggestion) {
      return;
    }

    const suggestion = activeSuggestion[key];
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
      try {
        await saveIntakePayload(form);
        setSuccess(copy.saved);
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : copy.saveError);
      }
    });
  }

  return (
    <form className="grid gap-8" onSubmit={handleSubmit}>
      <div className="rounded-[28px] p-5 brand-card-lilac sm:grid sm:grid-cols-[1fr_auto] sm:items-start sm:gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(23,19,31,0.52)]">
            {copy.assistedKicker}
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-[var(--color-ink)]">
            {activeGeneratedDraft
              ? `${activeGeneratedDraft.label} (${activeGeneratedDraftIndex + 1}/${generatedDrafts.length})`
              : relatedProjectPreset
              ? `${relatedProjectPreset.label} (${intakePresets.length} ${copy.variants})`
              : copy.noCatalogProject}
          </p>
          <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
            {copy.assistedBody}
          </p>
        </div>

        <div className="grid gap-3 sm:justify-items-end">
          <p className="max-w-xs text-sm leading-6 text-[rgba(23,19,31,0.68)]">
            {copy.tabHint}
          </p>
          <button
            className="brand-button-primary px-4 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
            disabled={isGeneratingDrafts}
            onClick={() =>
              requestGeneratedDrafts({
                variantSeed: generatedDrafts.length
                  ? "Create a different intake alternative from the current drafts."
                  : "Complete every intake field from the current topic.",
              })
            }
            type="button"
          >
            {isGeneratingDrafts
              ? copy.generating
              : generatedDrafts.length > 0
                ? copy.anotherIntake
                : copy.generateFull}
          </button>
          <button
            className="brand-button-secondary px-4 py-2 text-sm font-semibold"
            onClick={cyclePreset}
            type="button"
            disabled={generatedDrafts.length === 0 && intakePresets.length === 0}
          >
            {copy.nextIntake}
          </button>
        </div>
      </div>

      {draftError ? <p className="text-sm text-rose-600">{draftError}</p> : null}
      {draftMessage ? <p className="text-sm text-emerald-700">{draftMessage}</p> : null}

      <section className="grid gap-4 rounded-[28px] p-5 brand-card-primary">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/64">
              {copy.quickKicker}
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-white">
              {copy.quickTitle}
            </p>
            <p className="mt-3 text-sm leading-7 text-white/76">
              {copy.quickBody}
            </p>
          </div>

          <div className="rounded-[24px] bg-white/10 px-4 py-4 lg:min-w-[220px]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
              {copy.quickProgress}
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {quickFieldsReady}/3
            </p>
            <div className="mt-4 brand-progress-rail">
              <div
                className="brand-progress-fill"
                style={{ width: `${(quickFieldsReady / 3) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-white/76">
              {quickIntakeReady
                ? copy.quickReady
                : copy.quickMissing}
            </p>
          </div>
        </div>
      </section>

      {intakePresets.length > 0 ? (
        <div className="grid gap-2">
          <label className="text-sm font-semibold text-[var(--color-muted)]" htmlFor="intake-preset">
            {copy.presetLabel}
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
          {hasSuggestedIntakeBase
            ? copy.noCatalogWithBase
            : copy.noCatalogNoBase}
        </div>
      )}

      <section className="grid gap-4 rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
            {copy.keyStep}
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
            {copy.keyTitle}
          </p>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
            {copy.keyBody}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">{copy.topic}</span>
            <textarea
              className={textareaClassName}
              onChange={(event) => updateField("topic", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "topic")}
              placeholder={copy.topicPlaceholder}
              required
              rows={3}
              value={form.topic}
            />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.problemContext}
            </span>
            <textarea
              className={textareaClassName}
              onChange={(event) => updateField("problemContext", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "problemContext")}
              placeholder={copy.problemPlaceholder}
              rows={4}
              value={form.problemContext}
            />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.targetPopulation}
            </span>
            <textarea
              className={textareaClassName}
              onChange={(event) => updateField("targetPopulation", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "targetPopulation")}
              placeholder={copy.populationPlaceholder}
              rows={3}
              value={form.targetPopulation}
            />
          </label>
        </div>
      </section>

      <details className="rounded-[28px] border border-[rgba(74,58,97,0.08)] bg-white/72 p-5">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(100,94,115,0.62)]">
                {copy.expandedContext}
              </p>
              <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {copy.expandedTitle}
              </p>
            </div>
            <span className="brand-button-secondary px-4 py-2 text-sm font-semibold">
              {copy.openAdvanced}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
            {copy.expandedBody}
          </p>
        </summary>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.researchLine}
            </span>
            <input
              className={inputClassName}
              onChange={(event) => updateField("researchLine", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "researchLine")}
              placeholder={copy.researchLinePlaceholder}
              value={form.researchLine}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.methodology}
            </span>
            <input
              className={inputClassName}
              onChange={(event) => updateField("preferredMethodology", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "preferredMethodology")}
              placeholder={copy.methodologyPlaceholder}
              value={form.preferredMethodology}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.availableData}
            </span>
            <textarea
              className={textareaClassName}
              onChange={(event) => updateField("availableData", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "availableData")}
              placeholder={copy.dataPlaceholder}
              rows={3}
              value={form.availableData}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.constraints}
            </span>
            <textarea
              className={textareaClassName}
              onChange={(event) => updateField("academicConstraints", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "academicConstraints")}
              placeholder={copy.constraintsPlaceholder}
              rows={3}
              value={form.academicConstraints}
            />
          </label>

          <label className="grid gap-2 lg:col-span-2">
            <span className="text-sm font-semibold text-[var(--color-muted)]">
              {copy.advisorNotes}
            </span>
            <textarea
              className={textareaClassName}
              onChange={(event) => updateField("advisorNotes", event.target.value)}
              onKeyDown={(event) => handleTabSuggestion(event, "advisorNotes")}
              placeholder={copy.advisorPlaceholder}
              rows={6}
              value={form.advisorNotes}
            />
          </label>
        </div>
      </details>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-wait disabled:opacity-70"
          disabled={isPending}
          type="submit"
        >
          {isPending
            ? copy.saving
            : quickIntakeReady
              ? copy.saveAndSources
              : copy.saveIntake}
        </button>
        <p className="text-sm leading-6 text-[var(--color-muted)]">
          {copy.saveHint}
        </p>
      </div>
    </form>
  );
}
