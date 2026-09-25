import { notFound, redirect } from "next/navigation";

import { BlueprintPanel } from "@/components/projects/blueprint-panel";
import { ExportPanel } from "@/components/projects/export-panel";
import { IntakeForm } from "@/components/projects/intake-form";
import { ConversationalIntake } from "@/components/projects/conversational-intake";
import { ProjectShell } from "@/components/projects/project-shell";
import { ProjectSummarySidebar } from "@/components/projects/project-summary-sidebar";
import { ReferenceSearchPanel } from "@/components/projects/reference-search-panel";
import { PrivatePdfUpload } from "@/components/projects/private-pdf-upload";
import { WorkflowStageNav } from "@/components/projects/workflow-stage-nav";
import { getLocaleForLanguage } from "@/lib/language";
import { requireCurrentUser, pageData } from "@/lib/backend-http";

type VisibleStep = "define" | "evidence" | "plan";
type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
};

export default async function ProjectDetailPage({ params, searchParams }: ProjectDetailPageProps) {
  const user = await requireCurrentUser();
  const language = "es" as const;
  const locale = getLocaleForLanguage(language);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { project, references, initialReferenceSearchSnapshot, blueprintVersions } = await pageData("detail", id);
  if (query.step === "idea") redirect(project.conversationalIntake ? `/projects/${id}?step=define` : `/projects/${id}/topic`);

  const currentStep: VisibleStep = query.step === "evidence" || query.step === "plan" ? query.step : query.step === "define" ? "define" : project.conversationalIntake && project.definitionConfirmed ? (blueprintVersions.length ? "plan" : "evidence") : "define";
  const selectedReferenceCount = references.filter((reference) => reference.selected).length;
  const hasIntakeMinimum = project.conversationalIntake ? Boolean(project.definitionConfirmed) : Boolean(project.intake?.topic?.trim() && project.intake.problemContext?.trim() && project.intake.targetPopulation?.trim());
  const latestBlueprint = blueprintVersions[0] ?? null;
  const activeVersion = blueprintVersions.find((version) => version.id === project.activeBlueprintVersionId) ?? latestBlueprint;
  const activeBlueprintJson = activeVersion?.blueprintJson as { references_used?: Array<{ reference_id: string; title: string }> } | undefined;
  const primaryKnowledgeField = project.knowledgeFields[0];
  const areaLabel = primaryKnowledgeField?.concept?.labelEs ?? primaryKnowledgeField?.customLabel ?? project.topicAreaLabel;
  const draftStaleScopes = Array.isArray(project.draft?.staleScopesJson) ? project.draft.staleScopesJson : [];
  const stepNumber = currentStep === "define" ? 1 : currentStep === "evidence" ? 2 : 3;
  const progress = currentStep === "define" ? 35 : currentStep === "evidence" ? 65 : activeVersion ? 100 : 85;
  const stages = [
    { step: "01", href: `/projects/${id}?step=define`, title: "Define tu investigación", description: "Aclara y confirma tu investigación.", active: hasIntakeMinimum, current: currentStep === "define" },
    { step: "02", href: `/projects/${id}?step=evidence`, title: "Evidencia", description: "Busca, revisa y selecciona fuentes.", active: selectedReferenceCount > 0, current: currentStep === "evidence" },
    { step: "03", href: `/projects/${id}?step=plan`, title: "Plan de tesis", description: "Genera y consulta tus versiones publicadas.", active: Boolean(activeVersion), current: currentStep === "plan" },
  ];

  return (
    <ProjectShell title={project.title} description={`Paso ${stepNumber} de 3 · ${stages[stepNumber - 1]?.title ?? "Investigación"}`} compactHeader={project.conversationalIntake && currentStep === "define"}>
      <WorkflowStageNav items={stages} language={language} compact={project.conversationalIntake && currentStep === "define"} />
      <div className={project.conversationalIntake && currentStep === "define" ? "grid gap-6" : "grid gap-6 xl:grid-cols-[minmax(240px,0.34fr)_minmax(0,1fr)]"}>
        {!(project.conversationalIntake && currentStep === "define") && <ProjectSummarySidebar
          area={areaLabel}
          context={project.intake?.researchScope ?? project.country}
          degreeLevel={project.degreeLevel}
          latestVersion={activeVersion?.versionNumber ?? null}
          methodology={project.intake?.preferredMethodology ?? null}
          pendingDecisions={project.intake?.pendingDecisions ?? (draftStaleScopes.length ? "Hay decisiones que deben revisarse después de los últimos cambios." : null)}
          problem={project.intake?.problemContext ?? null}
          progress={progress}
          selectedSources={selectedReferenceCount}
          title={project.title}
        />}
        <main className="grid gap-6">
          {currentStep === "define" && project.conversationalIntake ? <ConversationalIntake projectId={id} ownerId={user.id} /> : currentStep === "define" ? (
            <section className="surface-panel rounded-[32px] p-6 sm:p-8">
              <p className="brand-kicker">Paso 1 · Define tu investigación · editor histórico</p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold">Delimitación científica</h2>
              <p className="mt-3 mb-6 text-sm leading-7 text-[var(--color-muted)]">Convierte la idea en una definición investigable. Todos los campos se guardan en tu borrador y puedes volver a editarlos.</p>
              <IntakeForm project={project} language={language} />
            </section>
          ) : null}
          {currentStep === "evidence" ? (
            <>
              {project.conversationalIntake && !project.definitionConfirmed ? <p role="status">Hay cambios sin confirmar. Revisa tu definición antes de buscar evidencia.</p> : <>
              <ReferenceSearchPanel
                hasIntakeMinimum={hasIntakeMinimum}
                intakeSnapshot={{ topic: project.intake?.topic ?? "", problemContext: project.intake?.problemContext ?? "", targetPopulation: project.intake?.targetPopulation ?? "" }}
                initialSearchSnapshot={initialReferenceSearchSnapshot}
                initialReferences={references}
                language={language}
                projectId={project.id}
                status={project.status}
              />
              <PrivatePdfUpload projectId={id} />
              </>}
            </>
          ) : null}
          {currentStep === "plan" ? (
            <>
              <BlueprintPanel
                activeVersionId={activeVersion?.id ?? null}
                draftRevision={project.draft?.revision ?? 0}
                hasIntakeMinimum={hasIntakeMinimum}
                language={language}
                projectId={project.id}
                projectStatus={project.status}
                selectedReferenceCount={selectedReferenceCount}
                versions={blueprintVersions.map((version) => ({
                  id: version.id,
                  versionNumber: version.versionNumber,
                  createdAt: version.createdAt,
                  blueprintJson: version.blueprintJson as Record<string, unknown>,
                  coherenceReportJson: version.coherenceReportJson as Record<string, unknown>,
                  originatingDraftRevision: version.originatingDraftRevision,
                  publicationStatus: version.publicationStatus,
                  userLabel: version.userLabel,
                }))}
              />
              <ExportPanel
                hasBlueprint={blueprintVersions.length > 0}
                hasIntakeMinimum={hasIntakeMinimum}
                language={language}
                latestBlueprintId={activeVersion?.id ?? null}
                latestBlueprintCreatedAt={activeVersion ? new Date(activeVersion.createdAt).toLocaleString(locale) : null}
                latestBlueprintReferenceCount={activeBlueprintJson?.references_used?.length ?? 0}
                latestBlueprintVersionNumber={activeVersion?.versionNumber ?? null}
                projectId={project.id}
                projectStatus={project.status}
                selectedReferenceCount={selectedReferenceCount}
              />
            </>
          ) : null}
        </main>
      </div>
    </ProjectShell>
  );
}
