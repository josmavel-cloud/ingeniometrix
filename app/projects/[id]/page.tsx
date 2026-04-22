import Link from "next/link";
import { notFound } from "next/navigation";

import { BlueprintPanel } from "@/components/projects/blueprint-panel";
import { ExportPanel } from "@/components/projects/export-panel";
import { IntakeForm } from "@/components/projects/intake-form";
import { ProjectContextRibbon } from "@/components/projects/project-context-ribbon";
import { ProjectShell } from "@/components/projects/project-shell";
import { ReferenceSearchPanel } from "@/components/projects/reference-search-panel";
import { WorkflowStageNav } from "@/components/projects/workflow-stage-nav";
import { getDegreeLevelLabel } from "@/lib/degree-levels";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import { getProjectStatusMeta, getProjectStatusToneClasses } from "@/lib/project-status";
import { requireCurrentUser } from "@/server/auth/session";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { getProjectForUser } from "@/server/projects/project-service";
import { listProjectReferences } from "@/server/retrieval/reference-service";

type ProjectDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const project = await getProjectForUser(user.id, id);

  if (!project) {
    notFound();
  }

  const references = await listProjectReferences(user.id, id);
  const blueprintVersions = await listBlueprintVersionsForUser(user.id, id);
  const statusMeta = getProjectStatusMeta(project.status);
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
      ? "Idea propia"
      : project.topicOriginType === "HYBRID"
        ? "Idea propia + sugerencia"
        : "Catalogo";
  const latestBlueprintJson = latestBlueprint?.blueprintJson as
    | {
        references_used?: Array<{ reference_id: string; title: string }>;
      }
    | undefined;
  const stageCards = [
    {
      step: "01",
      href: `/projects/${project.id}/topic`,
      title: "Tema",
      description: "Idea semilla, variantes y seleccion de base tematica.",
      active: project.topicSelectionStatus === "SELECTED",
      cardClassName: "brand-card-lilac",
    },
    {
      step: "02",
      href: "#intake",
      title: "Intake",
      description: "Problema, poblacion y contexto minimo del proyecto.",
      active: statusMeta.stage >= 1,
      cardClassName: "brand-card-gold",
    },
    {
      step: "03",
      href: "#fuentes",
      title: "Fuentes semilla",
      description: "Busqueda, revision y seleccion de evidencia trazable.",
      active: statusMeta.stage >= 2,
      cardClassName: "brand-card-mint",
    },
    {
      step: "04",
      href: "#blueprint",
      title: "Blueprint",
      description: "Validacion de coherencia y preparacion para salida.",
      active: statusMeta.stage >= 3,
      cardClassName: "brand-card-blush",
    },
    {
      step: "05",
      href: "#exportacion",
      title: "Exportacion",
      description: "Salidas finales y evidencia lista para compartir.",
      active: statusMeta.stage >= 4,
      cardClassName: "surface-panel",
    },
  ];

  return (
    <ProjectShell
      title={project.title}
      description="Convierte tu tema en una ruta de investigacion mejor estructurada, con intake guiado, fuentes trazables y un siguiente paso siempre visible."
    >
      <ProjectContextRibbon
        degreeLevel={project.degreeLevel}
        program={project.program}
        selectedTopicLabel={selectedTopicLabel}
        templateKey={project.templateKey}
        topicOriginLabel={topicOriginLabel}
        topicSeedText={project.topicSeedText?.trim() || project.title}
        universityLabel={getUniversityDisplayNameByCode(project.university)}
      />

      <section className="grid gap-4 lg:grid-cols-4">
        {stageCards.map((card) => (
          <article
            className={`rounded-[28px] p-5 ${card.active ? card.cardClassName : "surface-panel"}`}
            key={card.step}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
              Paso {card.step}
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              {card.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              {card.description}
            </p>
          </article>
        ))}
      </section>

      <WorkflowStageNav items={stageCards} />

      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.22fr]">
        <aside className="grid gap-6" id="proyecto">
          {project.topicSelectionStatus !== "SELECTED" ? (
            <section className="rounded-[32px] p-6 brand-card-lilac">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                Falta cerrar la etapa tema
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Antes del intake, elige la base tematica definitiva.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
                Tu proyecto ya tiene semilla, pero aun no selecciona un tema final.
                Cierra esa etapa y luego sigue con intake, fuentes y blueprint.
              </p>
              <div className="mt-5">
                <Link
                  className="brand-button-primary px-5 py-3 text-sm font-semibold"
                  href={`/projects/${project.id}/topic`}
                >
                  Ir a etapa Tema
                </Link>
              </div>
            </section>
          ) : null}

          <section className="brand-card-primary rounded-[32px] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
                  Estado actual
                </p>
                <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-white">
                  {statusMeta.label}
                </h2>
              </div>
              <div className="rounded-full bg-white/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                Etapa {Math.min(statusMeta.stage + 1, 5)} de 5
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/76">{statusMeta.summary}</p>
            <div className="mt-5 rounded-[24px] bg-white/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
                Siguiente paso
              </p>
              <p className="mt-2 text-sm leading-6 text-white">
                {statusMeta.nextStep}
              </p>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">Resumen del proyecto</p>
            <div className="mt-5 grid gap-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Estado
                </p>
                <div
                  className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${getProjectStatusToneClasses(project.status)}`}
                >
                  {statusMeta.label}
                </div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Universidad
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getUniversityDisplayNameByCode(project.university)}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Nivel
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {getDegreeLevelLabel(project.degreeLevel)}
                </p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Programa
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{project.program}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Plantilla
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{project.templateKey}</p>
              </div>
            </div>
          </section>

          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="brand-kicker">
              Como avanzar
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Un paso bien hecho desbloquea el siguiente.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
              Primero cierra la etapa de tema. Despues deja una base suficiente en
              el intake, busca y guarda fuentes semilla, y solo entonces conviene
              generar un blueprint.
            </p>
          </section>
        </aside>

        <section className="grid gap-6">
          <section className="surface-panel scroll-mt-32 rounded-[32px] p-6 sm:p-8" id="intake">
            <div className="mb-6">
              <p className="brand-kicker">
                Intake estructurado
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Construye una base mas clara para tu tesis.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
                El objetivo aqui no es llenar un formulario administrativo, sino traducir tu idea en una estructura que luego podamos validar y enriquecer.
              </p>
            </div>

            <IntakeForm project={project} />
          </section>

          <div className="scroll-mt-32" id="fuentes">
            <ReferenceSearchPanel
              hasIntakeMinimum={hasIntakeMinimum}
              intakeSnapshot={{
                topic: project.intake?.topic ?? "",
                problemContext: project.intake?.problemContext ?? "",
                targetPopulation: project.intake?.targetPopulation ?? "",
              }}
              initialReferences={references}
              projectId={project.id}
              status={project.status}
            />
          </div>

          <div className="scroll-mt-32" id="blueprint">
            <BlueprintPanel
              hasIntakeMinimum={hasIntakeMinimum}
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
            latestBlueprintId={latestBlueprint?.id ?? null}
            latestBlueprintCreatedAt={
              latestBlueprint ? latestBlueprint.createdAt.toLocaleString("es-PE") : null
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
