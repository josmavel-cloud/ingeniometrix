import Link from "next/link";

import { ProjectShell } from "@/components/projects/project-shell";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import { getProjectStatusMeta, getProjectStatusToneClasses } from "@/lib/project-status";
import { requireCurrentUser } from "@/server/auth/session";
import { listProjectsForUser } from "@/server/projects/project-service";

export default async function ProjectsPage() {
  const user = await requireCurrentUser();
  const projects = await listProjectsForUser(user.id);

  return (
    <ProjectShell
      title="Tus proyectos"
      description="Entra por un solo flujo: crea proyecto, afina el intake, selecciona fuentes y revisa el blueprint con mayor claridad."
    >
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="brand-kicker">Inicio del workspace</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              Sigue cada proyecto como un recorrido guiado.
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Usuario activo: {user.name ? `${user.name} | ` : ""}
              {user.email}
            </p>
          </div>

          <Link
            className="brand-button-primary px-5 py-3 text-sm font-semibold"
            href="/projects/new"
          >
            Nuevo proyecto
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="mt-8 grid gap-5">
            <div className="rounded-[32px] border border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.76)] px-6 py-8">
              <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                Aun no tienes proyectos.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">
                El primer valor del MVP aparece cuando creas un proyecto y completas
                la base del intake. Desde ahi Ingeniometrix ya puede guiarte hacia
                fuentes y blueprint.
              </p>
              <div className="mt-5">
                <Link
                  className="brand-button-primary px-5 py-3 text-sm font-semibold"
                  href="/projects/new"
                >
                  Crear primer proyecto
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-[28px] p-5 brand-card-lilac">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  Paso 1
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  Crea la base
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  Elige universidad, programa y tema para arrancar con contexto.
                </p>
              </article>

              <article className="rounded-[28px] p-5 brand-card-gold">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  Paso 2
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  Completa el intake
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  Ajusta tema, problema y poblacion para volver la busqueda mas util.
                </p>
              </article>

              <article className="rounded-[28px] p-5 brand-card-mint">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  Paso 3
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  Selecciona y valida
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  Elige fuentes trazables y genera un blueprint para revision academica.
                </p>
              </article>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {projects.map((project) => {
              const statusMeta = getProjectStatusMeta(project.status);

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
                  </div>

                  <div className="grid gap-3 lg:justify-items-end">
                    <div
                      className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${getProjectStatusToneClasses(project.status)}`}
                    >
                      {statusMeta.label}
                    </div>
                    <p className="max-w-sm text-sm leading-6 text-[var(--color-muted)] lg:text-right">
                      Siguiente paso: {statusMeta.nextStep}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </ProjectShell>
  );
}
