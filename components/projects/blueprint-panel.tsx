"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileStack, Sparkles } from "lucide-react";

import { getLocaleForLanguage, type SupportedLanguage } from "@/lib/language";
import {
  getProjectStatusMetaForLanguage,
  getProjectUiCopy,
} from "@/lib/project-ui-copy";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
} from "@/lib/research-workflow";

type BlueprintVersionListItem = {
  id: string;
  versionNumber: number;
  createdAt: string;
  blueprintJson: Record<string, unknown>;
  coherenceReportJson: Record<string, unknown>;
};

type BlueprintUiError = {
  code?: string;
  message: string;
  nextAction?: string;
};

type BlueprintPanelProps = {
  projectId: string;
  projectStatus: string;
  hasIntakeMinimum: boolean;
  selectedReferenceCount: number;
  versions: BlueprintVersionListItem[];
  language: SupportedLanguage;
};

type CoherenceCheck = {
  status: "pass" | "warning" | "fail";
  notes: string;
};

type CoherencePanelItem = {
  label: string;
  check?: CoherenceCheck;
};

type BlueprintProgress = {
  projectStatus: string;
  jobId: string | null;
  jobStatus: string | null;
  stageKey: string | null;
  label: string | null;
  progress: number | null;
  updatedAt: string | null;
  errorMessage: string | null;
  shouldNudge: boolean;
};

type BlueprintJobResponse = {
  id: string;
  status: string;
  currentStage: string | null;
  progress: number;
  updatedAt: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordList(
  keyConstructs: string[],
  text: string,
) {
  const tokens = new Set<string>();

  for (const construct of keyConstructs) {
    if (construct.trim().length >= 4) {
      tokens.add(construct.trim());
    }
  }

  for (const token of text.split(/\s+/)) {
    const normalized = token.replace(/[^\p{L}\p{N}]+/gu, "");
    if (/ar$|er$|ir$/i.test(normalized) && normalized.length >= 5) {
      tokens.add(normalized);
    }
  }

  return Array.from(tokens).slice(0, 8);
}

function renderHighlightedText(text: string, keywords: string[]) {
  if (keywords.length === 0) {
    return text;
  }

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = keywords.some(
      (keyword) => keyword.toLowerCase() === part.toLowerCase(),
    );

    return isKeyword ? (
      <mark
        className="rounded-md bg-[rgba(219,193,255,0.42)] px-1 py-0.5 text-[var(--color-ink)]"
        key={`${part}-${index}`}
      >
        {part}
      </mark>
    ) : (
      <Fragment key={`${part}-${index}`}>{part}</Fragment>
    );
  });
}

function renderStatusPill(status: CoherenceCheck["status"]) {
  if (status === "pass") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "warning") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-rose-50 text-rose-700 border-rose-200";
}

export function BlueprintPanel({
  projectId,
  projectStatus,
  hasIntakeMinimum,
  selectedReferenceCount,
  versions,
  language,
}: BlueprintPanelProps) {
  const router = useRouter();
  const copy = getProjectUiCopy(language).blueprint;
  const locale = getLocaleForLanguage(language);
  const [error, setError] = useState<BlueprintUiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<BlueprintProgress | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resumeInFlightRef = useRef(false);

  const latestVersion = versions[0] ?? null;
  const latestBlueprintDocxUrl = latestVersion
    ? `/api/projects/${projectId}/blueprints/${latestVersion.id}/docx`
    : null;
  const blueprint = latestVersion?.blueprintJson as
    | {
        general_objective?: string;
        specific_objectives?: string[];
        research_questions?: string[];
        assumptions?: string[];
        engine_warnings?: string[];
        references_used?: Array<{ reference_id: string; title: string }>;
        key_constructs_or_variables?: string[];
        antecedent_synthesis?: {
          gap_overview?: string;
          objective_guidance?: string[];
          summaries?: Array<{
            reference_id: string;
            title: string;
            authors: string;
            year: number | null;
            download_url: string | null;
            summary: string;
            technical_solution: string;
            unresolved_gap: string;
          }>;
        };
      }
    | undefined;
  const coherence = latestVersion?.coherenceReportJson as
    | {
        problem_objective_alignment?: CoherenceCheck;
        objective_question_alignment?: CoherenceCheck;
        objective_method_alignment?: CoherenceCheck;
        population_method_alignment?: CoherenceCheck;
        technique_analysis_alignment?: CoherenceCheck;
        citation_traceability?: CoherenceCheck;
        missing_information_flags?: string[];
        risk_flags?: string[];
      }
    | undefined;

  const coherenceItems: CoherencePanelItem[] = coherence
    ? [
        {
          label: copy.coherenceLabels.problemObjective,
          check: coherence.problem_objective_alignment,
        },
        {
          label: copy.coherenceLabels.objectiveQuestion,
          check: coherence.objective_question_alignment,
        },
        {
          label: copy.coherenceLabels.objectiveMethod,
          check: coherence.objective_method_alignment,
        },
        {
          label: copy.coherenceLabels.populationMethod,
          check: coherence.population_method_alignment,
        },
        {
          label: copy.coherenceLabels.techniqueAnalysis,
          check: coherence.technique_analysis_alignment,
        },
        {
          label: copy.coherenceLabels.citationTraceability,
          check: coherence.citation_traceability,
        },
      ]
    : [];
  const keyConstructs = blueprint?.key_constructs_or_variables ?? [];
  const specificObjectiveKeywords = useMemo(
    () =>
      (blueprint?.specific_objectives ?? []).map((item) =>
        buildKeywordList(keyConstructs, item),
      ),
    [blueprint?.specific_objectives, keyConstructs],
  );
  const questionKeywords = useMemo(
    () =>
      (blueprint?.research_questions ?? []).map((item) =>
        buildKeywordList(keyConstructs, item),
      ),
    [blueprint?.research_questions, keyConstructs],
  );

  const canRetryInterruptedGeneration =
    projectStatus === "BLUEPRINT_GENERATING" && versions.length === 0;
  const canGenerate =
    projectStatus === "SOURCES_SELECTED" ||
    projectStatus === "BLUEPRINT_READY" ||
    projectStatus === "EXPORT_READY" ||
    canRetryInterruptedGeneration;
  const statusMeta = getProjectStatusMetaForLanguage(projectStatus, language);
  const preparationChecklist = [
    {
      label: copy.intakeBase,
      ready: hasIntakeMinimum,
      detail: hasIntakeMinimum
        ? copy.intakeBaseReady
        : copy.intakeBaseMissing,
    },
    {
      label: copy.sourcesSelected,
      ready:
        selectedReferenceCount >= MIN_SELECTED_REFERENCES &&
        selectedReferenceCount <= MAX_SELECTED_REFERENCES,
      detail: copy.sourcesDetail(
        selectedReferenceCount,
        MIN_SELECTED_REFERENCES,
        MAX_SELECTED_REFERENCES,
      ),
    },
    {
      label: copy.blueprintValidation,
      ready: canGenerate,
      detail: canGenerate
        ? copy.blueprintReadyDetail
        : copy.blueprintMissingDetail,
    },
  ];
  const readyCount = preparationChecklist.filter((item) => item.ready).length;
  const progressJobActive =
    progress?.jobStatus === "QUEUED" ||
    progress?.jobStatus === "RUNNING" ||
    progress?.jobStatus === "WAITING_NEXT_STAGE";
  const hasActiveGeneration = Boolean(activeJobId) || progressJobActive;
  const shouldPollProgress =
    isPending ||
    hasActiveGeneration ||
    (projectStatus === "BLUEPRINT_GENERATING" &&
      progress?.jobStatus !== "COMPLETED" &&
      progress?.jobStatus !== "FAILED");

  useEffect(() => {
    if (!shouldPollProgress) {
      return;
    }

    let isCancelled = false;
    const pollProgress = async () => {
      const response = await fetch(`/api/projects/${projectId}/blueprints/progress`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { progress?: BlueprintProgress };

      if (isCancelled || !response.ok || !payload.progress) {
        return;
      }

      setProgress(payload.progress);

      if (payload.progress.jobId) {
        setActiveJobId(payload.progress.jobId);
      }

      if (
        payload.progress.shouldNudge &&
        payload.progress.jobId &&
        !resumeInFlightRef.current
      ) {
        resumeInFlightRef.current = true;
        fetch(`/api/projects/${projectId}/blueprints/resume`, {
          method: "POST",
          cache: "no-store",
        }).finally(() => {
          resumeInFlightRef.current = false;
        });
      }

      if (
        payload.progress.jobStatus === "COMPLETED" ||
        payload.progress.projectStatus === "BLUEPRINT_READY"
      ) {
        setActiveJobId(null);
        setMessage(copy.generated);
        router.refresh();
      }

      if (payload.progress.jobStatus === "FAILED") {
        setActiveJobId(null);
        setError({
          message: payload.progress.errorMessage ?? copy.generateError,
        });
      }
    };

    void pollProgress();
    const interval = globalThis.setInterval(pollProgress, 3000);

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [copy.generateError, copy.generated, projectId, router, shouldPollProgress]);

  async function readJsonPayload(response: Response) {
    const text = await response.text();

    if (!text.trim()) {
      return {};
    }

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        error: response.ok ? undefined : copy.generateError,
      };
    }
  }

  function generateBlueprint() {
    setError(null);
    setMessage(null);
    setProgress({
      projectStatus,
      jobId: null,
      jobStatus: "QUEUED",
      stageKey: "queued",
      label: copy.queued,
      progress: 6,
      updatedAt: null,
      errorMessage: null,
      shouldNudge: false,
    });

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/blueprints`, {
        method: "POST",
      });

      const payload = (await readJsonPayload(response)) as {
        error?: string;
        code?: string;
        nextAction?: string;
        job?: BlueprintJobResponse;
      };

      if (!response.ok) {
        setError({
          code: payload.code,
          message: payload.error ?? copy.generateError,
          nextAction: payload.nextAction,
        });
        return;
      }

      if (payload.job) {
        setActiveJobId(payload.job.id);
        setProgress({
          projectStatus: "BLUEPRINT_GENERATING",
          jobId: payload.job.id,
          jobStatus: payload.job.status,
          stageKey: payload.job.currentStage,
          label: copy.queued,
          progress: payload.job.progress,
          updatedAt: payload.job.updatedAt,
          errorMessage: null,
          shouldNudge: false,
        });
        setMessage(copy.queued);
      }
    });
  }

  return (
    <section className="surface-panel rounded-[32px] p-6 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            <FileStack className="size-3.5 text-lime-500" />
            {copy.kicker}
          </div>
          <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            {copy.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {copy.body}
          </p>
        </div>

        <button
          className="brand-button-primary px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || hasActiveGeneration || !canGenerate}
          onClick={generateBlueprint}
          type="button"
        >
          <Sparkles className="mr-2 size-4" />
          {isPending || hasActiveGeneration
            ? copy.generating
            : canRetryInterruptedGeneration
              ? copy.retry
              : copy.generate}
        </button>
      </div>

      {latestBlueprintDocxUrl ? (
        <div className="mt-4 flex justify-start">
          <a
            className="brand-button-secondary px-5 py-3 text-sm font-semibold"
            href={latestBlueprintDocxUrl}
          >
            <Download className="mr-2 size-4" />
            {copy.downloadWord}
          </a>
        </div>
      ) : null}

      <div
        className={`mt-6 rounded-[24px] border px-4 py-4 text-sm leading-6 ${
          canGenerate
            ? "border-[rgba(24,169,153,0.16)] bg-[rgba(213,247,239,0.42)] text-[var(--color-ink)]"
            : "border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.72)] text-[var(--color-ink)]"
        }`}
      >
        {canGenerate
          ? canRetryInterruptedGeneration
            ? copy.interrupted(selectedReferenceCount)
            : copy.readyToGenerate(selectedReferenceCount)
          : copy.missingSources}
      </div>

      <details className="mt-4 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-[rgba(255,255,255,0.72)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
          {copy.preparation}
        </summary>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {preparationChecklist.map((item) => (
            <article
              className="rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-white/86 p-4"
              key={item.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[rgba(100,94,115,0.62)]">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                {item.detail}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">
          {copy.currentStatus}: <strong>{statusMeta.label}</strong>. {copy.checklist} {readyCount}/3.
        </p>
      </details>

      {!canGenerate ? (
        <p className="mt-5 text-sm leading-6 text-slate-500">
          {copy.projectStill(
            statusMeta.label,
            MIN_SELECTED_REFERENCES,
            MAX_SELECTED_REFERENCES,
          )}
        </p>
      ) : null}

      <div className="mt-5 grid gap-2">
        {error ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            <p className="font-semibold">
              {error.code ? `${error.code}: ` : ""}{error.message}
            </p>
            {error.nextAction ? (
              <p className="mt-2 leading-6">{error.nextAction}</p>
            ) : null}
          </div>
        ) : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </div>

      {shouldPollProgress && progress ? (
        <div className="mt-5 rounded-[24px] border border-[rgba(74,58,97,0.08)] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {progress.label ?? copy.progressDefault}
            </p>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
              {progress.progress ?? 0}%
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[rgba(74,58,97,0.08)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#4f46e5_100%)] transition-all duration-500"
              style={{ width: `${progress.progress ?? 0}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            {copy.progressBody}
          </p>
        </div>
      ) : null}

      {!latestVersion ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
            {copy.noVersionsTitle}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {copy.noVersionsBody}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {copy.currentVersion}
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-slate-950">
              {copy.version} {latestVersion.versionNumber}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {copy.generatedAt} {new Date(latestVersion.createdAt).toLocaleString(locale)}
            </p>
          </div>

          {(blueprint?.general_objective || (blueprint?.specific_objectives ?? []).length > 0) ? (
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {copy.executiveView}
              </p>
              {blueprint?.general_objective ? (
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {blueprint.general_objective}
                </p>
              ) : null}

              <div className="mt-5 grid gap-6 xl:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {copy.specificObjectives}
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
                    {(blueprint?.specific_objectives ?? []).map((item, index) => (
                      <li key={item}>
                        * {renderHighlightedText(item, specificObjectiveKeywords[index] ?? [])}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {copy.questions}
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
                    {(blueprint?.research_questions ?? []).map((item, index) => (
                      <li key={item}>
                        * {renderHighlightedText(item, questionKeywords[index] ?? [])}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[24px] border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {copy.assumptions}
            </p>
            <ul className="mt-3 grid gap-2 text-sm leading-7 text-slate-700">
              {(blueprint?.assumptions ?? []).length > 0 ? (
                blueprint?.assumptions?.map((item) => <li key={item}>* {item}</li>)
              ) : (
                <li>{copy.noAssumptions}</li>
              )}
            </ul>
          </div>

          {(blueprint?.engine_warnings ?? []).length > 0 ? (
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                {copy.engineAlerts}
              </p>
              <ul className="mt-3 grid gap-2 text-sm leading-7 text-amber-900">
                {blueprint?.engine_warnings?.map((item) => <li key={item}>* {item}</li>)}
              </ul>
            </div>
          ) : null}

          {(blueprint?.antecedent_synthesis?.summaries ?? []).length > 0 ? (
            <details className="rounded-[24px] border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {copy.keyAntecedents}
              </summary>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {blueprint?.antecedent_synthesis?.gap_overview}
              </p>

              <div className="mt-5 grid gap-4">
                {blueprint?.antecedent_synthesis?.summaries?.map((item) => (
                  <article
                    className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4"
                    key={item.reference_id}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">
                          {item.authors} {item.year ? `| ${item.year}` : ""}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.reference_id}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      <strong>{copy.technicalSolution}:</strong> {item.technical_solution}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      <strong>{copy.unresolvedGap}:</strong> {item.unresolved_gap}
                    </p>
                  </article>
                ))}
              </div>

              {(blueprint?.antecedent_synthesis?.objective_guidance ?? []).length > 0 ? (
                <div className="mt-5 rounded-[20px] border border-[rgba(74,58,97,0.08)] bg-[rgba(244,241,248,0.7)] p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {copy.objectiveGuidance}
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
                    {blueprint?.antecedent_synthesis?.objective_guidance?.map((item) => (
                      <li key={item}>* {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </details>
          ) : null}

          <details className="rounded-[24px] border border-slate-200 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              {copy.referencesAndCoherence}
            </summary>

            <div className="mt-5 grid gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.referencesUsed}
                </p>
                <ul className="mt-3 grid gap-3 text-sm leading-7 text-slate-700">
                  {(blueprint?.references_used ?? []).map((reference) => (
                    <li key={reference.reference_id}>
                      <strong>{reference.reference_id}</strong>: {reference.title}
                    </li>
                  ))}
                </ul>
              </div>

              {coherence ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {copy.coherenceReport}
                  </p>

                  <div className="mt-4 grid gap-3">
                    {coherenceItems.map(({ label, check }) =>
                      check ? (
                        <div
                          className="flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4"
                          key={label}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm font-semibold text-slate-900">{label}</p>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${renderStatusPill(check.status)}`}
                            >
                              {check.status}
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-slate-600">{check.notes}</p>
                        </div>
                      ) : null,
                    )}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {copy.missingInfo}
                      </p>
                      <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">
                        {(coherence.missing_information_flags ?? []).length > 0 ? (
                          coherence.missing_information_flags?.map((item) => (
                            <li key={item}>* {item}</li>
                          ))
                        ) : (
                          <li>{copy.noMissing}</li>
                        )}
                      </ul>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900">{copy.risks}</p>
                      <ul className="mt-2 grid gap-2 text-sm leading-6 text-slate-600">
                        {(coherence.risk_flags ?? []).length > 0 ? (
                          coherence.risk_flags?.map((item) => <li key={item}>* {item}</li>)
                        ) : (
                          <li>{copy.noRisks}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
