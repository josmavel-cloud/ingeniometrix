import Link from "next/link";

import { ProjectShell } from "@/components/projects/project-shell";
import { getUniversityDisplayNameByCode } from "@/lib/peru-universities";
import { getProjectStatusToneClasses } from "@/lib/project-status";
import { getProjectStatusMetaForLanguage } from "@/lib/project-ui-copy";
import { requireCurrentUser } from "@/server/auth/session";
import { getRequestLanguage } from "@/server/i18n/request-language";
import { listProjectsForUser } from "@/server/projects/project-service";

const copy = {
  es: {
    title: "Tus proyectos",
    description:
      "El MVP se mueve en un solo recorrido: define contexto, entra con una base sugerida, afina el intake y valida fuentes antes del blueprint.",
    kicker: "Inicio del workspace",
    heading: "Sigue cada proyecto como un recorrido guiado.",
    activeUser: "Usuario activo",
    newProject: "Nuevo proyecto",
    emptyTitle: "Aun no tienes proyectos.",
    emptyBody:
      "El nuevo arranque del MVP empieza por contexto y sugerencias. Creas una base inicial en segundos y despues entras al workspace para afinar el intake y avanzar hacia fuentes y blueprint.",
    createFirst: "Crear primer proyecto",
    step1: ["Paso 1", "Define contexto", "Elige universidad, nivel, area e interes para entrar con mejor punto de partida."],
    step2: ["Paso 2", "Elige una base sugerida", "Ingeniometrix te propone temas iniciales del catalogo segun ese contexto."],
    step3: ["Paso 3", "Refina y valida", "Ajusta intake, selecciona fuentes trazables y genera un blueprint para revision academica."],
    nextStep: "Siguiente paso",
  },
  en: {
    title: "Your projects",
    description:
      "The MVP moves through one path: define context, start with a suggested base, refine the intake, and validate sources before the blueprint.",
    kicker: "Workspace home",
    heading: "Track each project as a guided path.",
    activeUser: "Active user",
    newProject: "New project",
    emptyTitle: "You do not have projects yet.",
    emptyBody:
      "The MVP now starts with context and suggestions. Create an initial base in seconds, then enter the workspace to refine the intake and move toward sources and blueprint.",
    createFirst: "Create first project",
    step1: ["Step 1", "Define context", "Choose university, degree, area, and interest to start from a better base."],
    step2: ["Step 2", "Choose a suggested base", "Ingeniometrix proposes initial catalog topics from that context."],
    step3: ["Step 3", "Refine and validate", "Adjust the intake, select traceable sources, and generate a blueprint for academic review."],
    nextStep: "Next step",
  },
};

export default async function ProjectsPage() {
  const user = await requireCurrentUser();
  const language = await getRequestLanguage();
  const t = copy[language];
  const projects = await listProjectsForUser(user.id);

  return (
    <ProjectShell
      title={t.title}
      description={t.description}
    >
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="brand-kicker">{t.kicker}</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              {t.heading}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              {t.activeUser}: {user.name ? `${user.name} | ` : ""}
              {user.email}
            </p>
          </div>

          <Link
            className="brand-button-primary px-5 py-3 text-sm font-semibold"
            href="/projects/new"
          >
            {t.newProject}
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="mt-8 grid gap-5">
            <div className="rounded-[32px] border border-dashed border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.76)] px-6 py-8">
              <p className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                {t.emptyTitle}
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">
                {t.emptyBody}
              </p>
              <div className="mt-5">
                <Link
                  className="brand-button-primary px-5 py-3 text-sm font-semibold"
                  href="/projects/new"
                >
                  {t.createFirst}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-[28px] p-5 brand-card-lilac">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  {t.step1[0]}
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {t.step1[1]}
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  {t.step1[2]}
                </p>
              </article>

              <article className="rounded-[28px] p-5 brand-card-gold">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  {t.step2[0]}
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {t.step2[1]}
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  {t.step2[2]}
                </p>
              </article>

              <article className="rounded-[28px] p-5 brand-card-mint">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
                  {t.step3[0]}
                </p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
                  {t.step3[1]}
                </p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
                  {t.step3[2]}
                </p>
              </article>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {projects.map((project) => {
              const statusMeta = getProjectStatusMetaForLanguage(project.status, language);

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
                      {t.nextStep}: {statusMeta.nextStep}
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
