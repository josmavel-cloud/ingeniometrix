import { notFound } from "next/navigation";

import { BlueprintPanel } from "@/components/projects/blueprint-panel";
import { IntakeForm } from "@/components/projects/intake-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { ReferenceSearchPanel } from "@/components/projects/reference-search-panel";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
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

  return (
    <ProjectShell
      title={project.title}
      description="Convierte tu tema en una ruta de investigacion mejor estructurada, con intake guiado y una base de fuentes para seguir avanzando."
    >
      <section className="grid gap-6 xl:grid-cols-[0.88fr_1.22fr]">
        <aside className="grid gap-6">
          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
              Resumen del proyecto
            </p>
            <div className="mt-5 grid gap-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Estado
                </p>
                <p className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {project.status}
                </p>
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
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
              Como avanzar
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
              Primero estructura, despues busca.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              Para pasar a <strong>INTAKE_READY</strong>, el sistema requiere como minimo tema, contexto del problema y poblacion objetivo. Luego podras ejecutar la busqueda y elegir fuentes semilla.
            </p>
          </section>
        </aside>

        <section className="grid gap-6">
          <section className="surface-panel rounded-[32px] p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
                Intake estructurado
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
                Construye una base mas clara para tu tesis.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                El objetivo aqui no es llenar un formulario administrativo, sino traducir tu idea en una estructura que luego podamos validar y enriquecer.
              </p>
            </div>

            <IntakeForm project={project} />
          </section>

          <ReferenceSearchPanel
            initialReferences={references}
            projectId={project.id}
            status={project.status}
          />

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
        </section>
      </section>
    </ProjectShell>
  );
}
