"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { University } from "@prisma/client";

import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import { getProjectStatusToneClasses } from "@/lib/project-status";
import { getProjectStatusMetaForLanguage } from "@/lib/project-ui-copy";
import type { SupportedLanguage } from "@/lib/language";

type LatestProjectJob = {
  id: string;
  status: string;
  currentStage: string | null;
  progress: number;
  errorMessage: string | null;
  updatedAt: string;
  shouldNudge: boolean;
};

export type ProjectListItem = {
  id: string;
  title: string;
  university: University;
  program: string;
  status: string;
  updatedAt: string;
  latestJob: LatestProjectJob | null;
  artifactCount: number;
  hasDocx: boolean;
  hasPdf: boolean;
};

type ProjectsProgressResponse = {
  projects?: Array<{
    id: string;
    status: string;
    updatedAt: string;
    job: LatestProjectJob | null;
    artifactCount: number;
    hasDocx: boolean;
    hasPdf: boolean;
  }>;
};

const copy = {
  es: {
    nextStep: "Siguiente paso",
    currentProgress: "Progreso actual",
    artifacts: "Artefactos guardados",
    docx: "DOCX",
    pdf: "PDF",
    noArtifacts: "Sin archivos persistidos aun",
    stage: "Etapa",
    active: "En proceso",
    failed: "Error",
  },
  en: {
    nextStep: "Next step",
    currentProgress: "Current progress",
    artifacts: "Saved artifacts",
    docx: "DOCX",
    pdf: "PDF",
    noArtifacts: "No persisted files yet",
    stage: "Stage",
    active: "In progress",
    failed: "Error",
  },
};

function isActiveJob(status: string | null | undefined) {
  return status === "QUEUED" || status === "RUNNING" || status === "WAITING_NEXT_STAGE";
}

function formatStage(stage: string | null) {
  if (!stage) {
    return null;
  }

  return stage
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ProjectList({
  initialProjects,
  language,
}: {
  initialProjects: ProjectListItem[];
  language: SupportedLanguage;
}) {
  const router = useRouter();
  const t = copy[language];
  const [projects, setProjects] = useState(initialProjects);
  const resumeInFlight = useRef(new Set<string>());
  const hasActiveProject = useMemo(
    () => projects.some((project) => isActiveJob(project.latestJob?.status)),
    [projects],
  );

  useEffect(() => {
    if (!hasActiveProject) {
      return;
    }

    let isCancelled = false;

    async function pollProgress() {
      const response = await fetch("/api/projects/progress", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as ProjectsProgressResponse;

      if (isCancelled || !response.ok || !payload.projects) {
        return;
      }

      const progressByProject = new Map(payload.projects.map((item) => [item.id, item]));

      setProjects((currentProjects) =>
        currentProjects.map((project) => {
          const update = progressByProject.get(project.id);

          if (!update) {
            return project;
          }

          return {
            ...project,
            status: update.status,
            updatedAt: update.updatedAt,
            latestJob: update.job,
            artifactCount: update.artifactCount,
            hasDocx: update.hasDocx,
            hasPdf: update.hasPdf,
          };
        }),
      );

      for (const update of payload.projects) {
        if (!update.job?.shouldNudge || resumeInFlight.current.has(update.id)) {
          continue;
        }

        resumeInFlight.current.add(update.id);
        fetch(`/api/projects/${update.id}/blueprints/resume`, {
          method: "POST",
          cache: "no-store",
        }).finally(() => {
          resumeInFlight.current.delete(update.id);
        });
      }

      if (payload.projects.some((project) => project.status === "BLUEPRINT_READY")) {
        router.refresh();
      }
    }

    void pollProgress();
    const interval = globalThis.setInterval(pollProgress, 10000);

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [hasActiveProject, router]);

  return (
    <div className="mt-8 grid gap-4">
      {projects.map((project) => {
        const statusMeta = getProjectStatusMetaForLanguage(project.status, language);
        const activeJob = isActiveJob(project.latestJob?.status) ? project.latestJob : null;
        const jobFailed = project.latestJob?.status === "FAILED";
        const progress = Math.max(0, Math.min(100, activeJob?.progress ?? 0));

        return (
          <Link
            className="group surface-panel grid gap-5 rounded-[30px] p-5 lg:grid-cols-[1.2fr_0.8fr]"
            href={`/projects/${project.id}`}
            key={project.id}
          >
            <div>
              <p className="font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-plum)]">
                {project.title}
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
                {getUniversityDisplayNameByCode(project.university)} | {project.program}
              </p>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {statusMeta.summary}
              </p>

              {activeJob ? (
                <div className="mt-4 max-w-xl rounded-[18px] border border-[rgba(24,169,153,0.14)] bg-[rgba(213,247,239,0.36)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#127b6f]">
                      {t.currentProgress}
                    </p>
                    <span className="text-xs font-semibold text-[#127b6f]">
                      {progress}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-[#127b6f] transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
                    {t.stage}: {formatStage(activeJob.currentStage) ?? t.active}
                  </p>
                </div>
              ) : jobFailed ? (
                <p className="mt-4 text-sm leading-6 text-rose-700">
                  {t.failed}: {project.latestJob?.errorMessage}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 lg:justify-items-end">
              <div
                className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${getProjectStatusToneClasses(project.status)}`}
              >
                {statusMeta.label}
              </div>
              <p className="max-w-sm text-sm leading-6 text-[var(--color-muted)] lg:text-right">
                {t.nextStep}: {statusMeta.nextStep}
              </p>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {project.artifactCount > 0 ? (
                  <span className="rounded-full border border-[rgba(74,58,97,0.1)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                    {t.artifacts}: {project.artifactCount}
                  </span>
                ) : (
                  <span className="rounded-full border border-[rgba(74,58,97,0.1)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                    {t.noArtifacts}
                  </span>
                )}
                {project.hasDocx ? (
                  <span className="rounded-full border border-[rgba(24,169,153,0.18)] bg-[rgba(213,247,239,0.6)] px-3 py-1 text-xs font-semibold text-[#127b6f]">
                    {t.docx}
                  </span>
                ) : null}
                {project.hasPdf ? (
                  <span className="rounded-full border border-[rgba(52,20,95,0.14)] bg-[rgba(219,193,255,0.24)] px-3 py-1 text-xs font-semibold text-[#34145f]">
                    {t.pdf}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
