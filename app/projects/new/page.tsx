import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";

export default async function NewProjectPage() {
  await requireCurrentUser();

  return (
    <ProjectShell
      title="Activa un proyecto en minutos"
      description="La entrada del MVP ahora parte del contexto y de tu idea original. Primero guardamos esa semilla y luego pasas a una etapa de tema antes del intake."
    >
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="grid gap-4">
          <section className="brand-card-primary rounded-[34px] p-6 sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/64">
              Paso 1 de 3
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-white">
              Define el contexto base.
            </h2>
            <p className="mt-4 text-sm leading-7 text-white/76">
              Este primer tramo ya no te pide pensar toda la tesis. Solo define el
              punto de partida academico para que las sugerencias tengan mas ajuste
              desde el segundo uno y la siguiente pantalla pueda refinar el tema.
            </p>
          </section>

          <section className="rounded-[30px] p-5 brand-card-lilac">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
              Lo que obtienes
            </p>
            <p className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-[var(--color-ink)]">
              Un arranque mucho mas corto.
            </p>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-[rgba(23,19,31,0.72)]">
              <li>Contexto rapido segun universidad, nivel y area.</li>
              <li>Tu idea original guardada como semilla del proyecto.</li>
              <li>Segunda etapa para elegir el tema definitivo antes del intake.</li>
            </ul>
          </section>

          <section className="rounded-[30px] p-5 brand-card-gold">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgba(23,19,31,0.52)]">
              Criterio MVP
            </p>
            <p className="mt-3 text-sm leading-7 text-[rgba(23,19,31,0.72)]">
              La salida de este paso es una base inicial, no una respuesta final. La
              profundidad vendra despues con intake, fuentes trazables y blueprint.
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
