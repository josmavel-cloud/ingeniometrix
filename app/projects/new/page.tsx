import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";

export default async function NewProjectPage() {
  await requireCurrentUser();

  return (
    <ProjectShell
      title="Crea un nuevo proyecto"
      description="Empieza con una base corta y clara. Hoy solo necesitamos el marco minimo para pasar al intake guiado."
    >
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="grid gap-4">
          <section className="brand-card-primary rounded-[34px] p-6 sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
              Paso 1 de 3
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">
              Define la base del proyecto.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/76">
              Aqui solo se decide el marco inicial: tema, programa, universidad y
              plantilla. El detalle fino vendra despues, dentro del intake.
            </p>
          </section>

          <section className="rounded-[30px] p-5 brand-card-lilac">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
              Lo que obtienes
            </p>
            <p className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              Un punto de partida mejor guiado.
            </p>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              <li>Temas organizados por carrera.</li>
              <li>Plantilla alineada con la universidad elegida.</li>
              <li>Base conectada con variantes de intake relacionadas.</li>
            </ul>
          </section>

          <section className="rounded-[30px] p-5 brand-card-gold">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
              Criterio MVP
            </p>
            <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
              Este paso no intenta resolver toda la tesis. Solo deja una base
              suficientemente clara para que Ingeniometrix haga mejores preguntas en el
              intake y recupere fuentes mas utiles despues.
            </p>
          </section>
        </aside>

        <section className="surface-panel rounded-[34px] p-6 sm:p-8">
          <CreateProjectForm />
        </section>
      </section>
    </ProjectShell>
  );
}
