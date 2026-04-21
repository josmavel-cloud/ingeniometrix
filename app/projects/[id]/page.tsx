import { notFound } from "next/navigation";

import { BlueprintPanel } from "@/components/projects/blueprint-panel";
import { ExportPanel } from "@/components/projects/export-panel";
import { IntakeForm } from "@/components/projects/intake-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { ReferenceSearchPanel } from "@/components/projects/reference-search-panel";
import { WorkflowStageNav } from "@/components/projects/workflow-stage-nav";
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
  const stageCards = [
    {
      step: "01",
      href: "#proyecto",
      title: "Base del proyecto",
      description: "Tema, programa, universidad y contexto inicial.",
      active: statusMeta.stage >= 1,
      cardClassName: "brand-card-lilac",
    },
    {
      step: "02",
      href: "#fuentes",
      title: "Fuentes semilla",
      description: "Busqueda, revision y seleccion de evidencia trazable.",
      active: statusMeta.stage >= 2,
      cardClassName: "brand-card-gold",
    },
    {
      step: "03",
      href: "#blueprint",
      title: "Blueprint",
      description: "Validacion de coherencia y preparacion para salida.",
      active: statusMeta.stage >= 3,
      cardClassName: "brand-card-mint",
    },
    {
      step: "04",
      href: "#exportacion",
      title: "Exportacion",
      description: "Salidas finales y evidencia lista para compartir.",
      active: statusMeta.stage >= 4,
      cardClassName: "brand-card-blush",
    },
  ];

  return (
    <ProjectShell
      title={project.title}
      description="Convierte tu tema en una ruta de investigacion mejor estructurada, con intake guiado, fuentes trazables y un siguiente paso siempre visible."
    >
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
                Etapa {Math.min(statusMeta.stage, 4)} de 4
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
              Primero deja una base suficiente en el intake. Despues busca y guarda
              fuentes semilla. Solo entonces conviene generar un blueprint.
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
              initialReferences={references}
              projectId={project.id}
              status={project.status}
            />
          </div>

          <div className="scroll-mt-32" id="blueprint">
            <BlueprintPanel
              projectId={project.id}
              projectStatus={project.status}
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
            projectStatus={project.status}
          />
        </section>
      </section>
    </ProjectShell>
  );
}
