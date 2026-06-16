import Link from "next/link";
import { notFound } from "next/navigation";

import { BlueprintPanel } from "@/components/projects/blueprint-panel";
import { ExportPanel } from "@/components/projects/export-panel";
import { IntakeForm } from "@/components/projects/intake-form";
import { ProjectContextRibbon } from "@/components/projects/project-context-ribbon";
import { ProjectShell } from "@/components/projects/project-shell";
import { ReferenceSearchPanel } from "@/components/projects/reference-search-panel";
import { WorkflowStageNav } from "@/components/projects/workflow-stage-nav";
import { getDegreeLevelLabelForLanguage } from "@/lib/degree-levels";
import { getLocaleForLanguage } from "@/lib/language";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import {
  getProjectStatusMetaForLanguage,
  getProjectUiCopy,
} from "@/lib/project-ui-copy";
import { getProjectStatusToneClasses } from "@/lib/project-status";
import { getTemplateDisplayLabel } from "@/lib/system-master-template";
import { requireCurrentUser } from "@/server/auth/session";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { getRequestLanguage } from "@/server/i18n/request-language";
import { getProjectForUser } from "@/server/projects/project-service";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { listProjectReferences } from "@/server/retrieval/reference-service";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const user = await requireCurrentUser();
  const language = await getRequestLanguage();
  const copy = getProjectUiCopy(language);
  const locale = getLocaleForLanguage(language);
  const { id } = await params;
  const project = await getProjectForUser(user.id, id);

  if (!project) {
    notFound();
  }

  const [references, initialReferenceSearchSnapshot] = await Promise.all([
    listProjectReferences(user.id, id),
    getLatestProjectReferenceSearchSnapshot(id),
  ]);
  const blueprintVersions = await listBlueprintVersionsForUser(user.id, id);
  const statusMeta = getProjectStatusMetaForLanguage(project.status, language);
  const selectedReferenceCount = references.filter((reference) => reference.selected).length;
  const hasIntakeMinimum = Boolean(
    project.intake?.topic?.trim() &&
      project.intake?.problemContext?.trim() &&
      project.intake?.targetPopulation?.trim(),
  );
  const latestBlueprint = blueprintVersions[0] ?? null;
  const selectedTopicLabel =
    project.topicSelectionStatus === "SELECTED"
      ? project.title
      : project.topicSeedText ?? project.title;
  const topicOriginLabel =
    project.topicOriginType === "CUSTOM"
      ? copy.projectPage.topicOrigin.custom
      : project.topicOriginType === "HYBRID"
        ? copy.projectPage.topicOrigin.hybrid
        : copy.projectPage.topicOrigin.catalog;
  const latestBlueprintJson = latestBlueprint?.blueprintJson as
    | {
        references_used?: Array<{ reference_id: string; title: string }>;
      }
    | undefined;
  const stageCards = [
    {
      step: "01",
      href: `/projects/${project.id}/topic`,
      title: copy.workflow.stages.topic[0],
      description: copy.workflow.stages.topic[1],
      active: project.topicSelectionStatus === "SELECTED",
      cardClassName: "brand-card-lilac",
    },
    {
      step: "02",
      href: "#intake",
      title: copy.workflow.stages.intake[0],
      description: copy.workflow.stages.intake[1],
      active: statusMeta.stage >= 1,
      cardClassName: "brand-card-gold",
    },
    {
      step: "03",
      href: "#fuentes",
      title: copy.workflow.stages.sources[0],
      description: copy.workflow.stages.sources[1],
      active: statusMeta.stage >= 2,
      cardClassName: "brand-card-mint",
    },
    {
      step: "04",
      href: "#blueprint",
      title: copy.workflow.stages.blueprint[0],
      description: copy.workflow.stages.blueprint[1],
      active: statusMeta.stage >= 3,
      cardClassName: "brand-card-blush",
    },
    {
      step: "05",
      href: "#exportacion",
      title: copy.workflow.stages.export[0],
      description: copy.workflow.stages.export[1],
      active: statusMeta.stage >= 4,
      cardClassName: "surface-panel",
    },
  ];

  return (
    <ProjectShell
      title={project.title}
      description={copy.projectPage.description}
    >
      <ProjectContextRibbon
        degreeLevel={project.degreeLevel}
        language={language}
        program={project.program}
        selectedTopicLabel={selectedTopicLabel}
        templateKey={project.templateKey}
        topicOriginLabel={topicOriginLabel}
        topicSeedText={project.topicSeedText?.trim() || project.title}
        universityLabel={getUniversityDisplayNameByCode(project.university)}
      />

      <WorkflowStageNav items={stageCards} language={language} />

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.22fr]">
        <aside className="grid gap-6" id="proyecto">
          {project.topicSelectionStatus !== "SELECTED" ? (
            <section className="rounded-[32px] p-6 brand-card-lilac">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                {copy.projectPage.missingTopicKicker}
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {copy.projectPage.missingTopicTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
                {copy.projectPage.missingTopicBody}
              </p>
              <div className="mt-5">
                <Link
                  className="brand-button-primary px-5 py-3 text-sm font-semibold"
                  href={`/projects/${project.id}/topic`}
                >
                  {copy.projectPage.goToTopic}
                </Link>
              </div>
            </section>
          ) : null}

          <section className="brand-card-primary rounded-[32px] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
                  {copy.projectPage.currentStatus}
                </p>
                <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">
                  {statusMeta.label}
                </h2>
              </div>
              <div className="rounded-full bg-white/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                {copy.projectPage.stageCounter(Math.min(statusMeta.stage + 1, 5))}
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/76">{statusMeta.summary}</p>
            <div className="mt-5 rounded-[24px] bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
                {copy.projectPage.nextStep}
              </p>
              <p className="mt-2 text-sm leading-6 text-white">
                {statusMeta.nextStep}
              </p>
            </div>
          </section>

          <details className="surface-panel rounded-[32px] p-6 sm:p-8">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink)]">
              {copy.projectPage.projectData}
            </summary>
            <div className="mt-5 grid gap-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.projectPage.status}
                </p>
                <div
                  className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${getProjectStatusToneClasses(project.status)}`}
                >
                  {statusMeta.label}
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.projectPage.university}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getUniversityDisplayNameByCode(project.university)}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.projectPage.degree}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getDegreeLevelLabelForLanguage(project.degreeLevel, language)}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.projectPage.program}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{project.program}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {copy.projectPage.template}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getTemplateDisplayLabel(project.templateKey)}
                </p>
              </div>
            </div>
          </details>
        </aside>

        <section className="grid gap-6">
          <section className="surface-panel scroll-mt-32 rounded-[32px] p-6 sm:p-8" id="intake">
            <div className="mb-6">
              <p className="brand-kicker">
                {copy.projectPage.intakeKicker}
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {copy.projectPage.intakeTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                {copy.projectPage.intakeBody}
              </p>
            </div>

            <IntakeForm project={project} language={language} />
          </section>

          <div className="scroll-mt-32" id="fuentes">
            <ReferenceSearchPanel
              hasIntakeMinimum={hasIntakeMinimum}
              intakeSnapshot={{
                topic: project.intake?.topic ?? "",
                problemContext: project.intake?.problemContext ?? "",
                targetPopulation: project.intake?.targetPopulation ?? "",
              }}
              initialSearchSnapshot={initialReferenceSearchSnapshot}
              initialReferences={references}
              language={language}
              projectId={project.id}
              status={project.status}
            />
          </div>

          <div className="scroll-mt-32" id="blueprint">
            <BlueprintPanel
              hasIntakeMinimum={hasIntakeMinimum}
              language={language}
              projectId={project.id}
              projectStatus={project.status}
              selectedReferenceCount={selectedReferenceCount}
              versions={blueprintVersions.map((version) => ({
                id: version.id,
                versionNumber: version.versionNumber,
                createdAt: version.createdAt.toISOString(),
                blueprintJson: version.blueprintJson as Record<string, unknown>,
                coherenceReportJson: version.coherenceReportJson as Record<string, unknown>,
              }))}
            />
          </div>

          <ExportPanel
            hasBlueprint={blueprintVersions.length > 0}
            hasIntakeMinimum={hasIntakeMinimum}
            language={language}
            latestBlueprintId={latestBlueprint?.id ?? null}
            latestBlueprintCreatedAt={
              latestBlueprint ? latestBlueprint.createdAt.toLocaleString(locale) : null
            }
            latestBlueprintReferenceCount={latestBlueprintJson?.references_used?.length ?? 0}
            latestBlueprintVersionNumber={latestBlueprint?.versionNumber ?? null}
            projectId={project.id}
            projectStatus={project.status}
            selectedReferenceCount={selectedReferenceCount}
          />
        </section>
      </section>
    </ProjectShell>
  );
}
