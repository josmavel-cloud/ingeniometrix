import Link from "next/link";

import { ProjectList, type ProjectListItem } from "@/components/projects/project-list";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser, pageData } from "@/lib/backend-http";
import { AccountPanel } from "@/components/commercial/account-panel";

export const dynamic = "force-dynamic";

const copy = {
  es: {
    title: "Tus proyectos",
    description:
      "Retoma tu investigacion o empieza una nueva: idea, definicion, evidencia, plan y descarga.",
    kicker: "Inicio del workspace",
    heading: "Sigue cada proyecto como un recorrido guiado.",
    activeUser: "Usuario activo",
    newProject: "Nuevo proyecto",
    emptyTitle: "Aun no tienes proyectos.",
    emptyBody:
      "Empieza con una idea. Ingeniometrix te ayudara a definirla, contrastarla con evidencia y convertirla en un plan revisable.",
    createFirst: "Crear primer proyecto",
    step1: ["Paso 1", "Idea", "Parte de una idea propia o genera propuestas compatibles con tu nivel, área y contexto."],
    step2: ["Paso 2", "Define tu investigación", "Delimita problema, unidad de análisis, alcance y metodología sin perder tu borrador."],
    step3: ["Paso 3", "Evidencia", "Busca y selecciona fuentes trazables para sostener el plan."],
    step4: ["Paso 4", "Plan de tesis", "Genera una versión inmutable y descarga sus documentos cuando estén listos."],
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
    step1: ["Step 1", "Idea", "Start from your own idea or proposals compatible with your level, field, and context."],
    step2: ["Step 2", "Choose a suggested base", "Ingeniometrix proposes initial catalog topics from that context."],
    step3: ["Step 3", "Refine and validate", "Adjust the intake, select traceable sources, and generate a blueprint for academic review."],
    step4: ["Step 4", "Thesis plan", "Generate an immutable version and download its documents when ready."],
    nextStep: "Next step",
  },
};

export default async function ProjectsPage() {
  const user = await requireCurrentUser();
  const language = "es" as const;
  const t = copy[language];
  const projects = await pageData("projects");
  const projectListItems: ProjectListItem[] = projects;

  return (
    <ProjectShell
      title={t.title}
      description={t.description}
    >
      <section className="surface-panel rounded-[32px] p-6 sm:p-8">
        <AccountPanel compact />
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

            <div className="grid gap-4 lg:grid-cols-4">
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

              <article className="rounded-[28px] p-5 brand-card-blush">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">{t.step4[0]}</p>
                <p className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">{t.step4[1]}</p>
                <p className="mt-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">{t.step4[2]}</p>
              </article>
            </div>
          </div>
        ) : (
          <ProjectList initialProjects={projectListItems} language={language} />
        )}
      </section>
    </ProjectShell>
  );
}
