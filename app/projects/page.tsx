import Link from "next/link";

import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";
import { listProjectsForUser } from "@/server/projects/project-service";

export default async function ProjectsPage() {
  const user = await requireCurrentUser();
  const projects = await listProjectsForUser(user.id);

  return (
    <ProjectShell
      title="Tus proyectos"
      description="Organiza tus planes de tesis, valida avances y vuelve al intake cuando necesites ajustar el enfoque."
    >
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
              Panel
            </p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
              Sigue cada proyecto con mas claridad.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Usuario activo: {user.name ? `${user.name} | ` : ""}
              {user.email}
            </p>
          </div>

          <Link
            className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_40px_rgba(163,230,53,0.32)] hover:-translate-y-0.5 hover:bg-lime-300"
            href="/projects/new"
          >
            Nuevo proyecto
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
            <p className="font-[var(--font-heading)] text-xl font-semibold text-slate-950">
              Aun no tienes proyectos.
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Crea el primero para empezar el intake y probar el flujo de Ingeniometrix.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {projects.map((project) => (
              <Link
                className="group surface-panel flex flex-col gap-4 rounded-[28px] p-5 sm:flex-row sm:items-center sm:justify-between"
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <div>
                  <p className="font-[var(--font-heading)] text-lg font-semibold text-slate-950 group-hover:text-slate-700">
                    {project.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {getUniversityDisplayNameByCode(project.university)} | {project.program}
                  </p>
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {project.status}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </ProjectShell>
  );
}
