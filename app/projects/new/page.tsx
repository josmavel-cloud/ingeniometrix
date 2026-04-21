import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";

export default async function NewProjectPage() {
  await requireCurrentUser();

  return (
    <ProjectShell
      title="Crea un nuevo proyecto"
      description="Empieza con un catalogo estructurado para tu tesis: carrera, titulo, universidad destacada, plantilla y 20 intakes relacionados por tema."
    >
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.2fr]">
        <aside className="surface-panel rounded-[32px] p-6 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
            Paso 1
          </p>
          <h2 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-slate-950">
            Define el marco base del proyecto.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Aqui eliges el tema desde un catalogo organizado. El objetivo es que
            Ingeniometrix entienda tu contexto academico antes de pasar al intake
            estructurado.
          </p>
          <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
            <p className="text-sm font-semibold text-slate-700">Incluye:</p>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
              <li>- 10 carreras comunes con 100 temas distribuidos uniformemente</li>
              <li>- 20 intakes listos por cada titulo del catalogo</li>
              <li>- 10 universidades destacadas en el combo del proyecto</li>
              <li>- Relacion directa entre titulo elegido e intakes sugeridos</li>
            </ul>
          </div>
        </aside>

        <section className="surface-panel rounded-[32px] p-6 sm:p-8">
          <CreateProjectForm />
        </section>
      </section>
    </ProjectShell>
  );
}
