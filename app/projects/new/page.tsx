import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";

export default async function NewProjectPage() {
  await requireCurrentUser();

  return (
    <ProjectShell
      title="Crear proyecto"
      description="Completa el contexto base y continua al tema. Todo lo demas se refina despues."
    >
      <section className="surface-panel rounded-[34px] p-6 sm:p-8">
        <CreateProjectForm />
      </section>
    </ProjectShell>
  );
}
