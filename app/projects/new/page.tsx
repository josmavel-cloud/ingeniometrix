import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";

type NewProjectPageProps = {
  searchParams?: Promise<{
    idea?: string | string[];
    tema_sugerido?: string | string[];
    tema?: string | string[];
    topic?: string | string[];
  }>;
};

function getFirstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getFirstNonBlankSearchValue(
  ...values: Array<string | string[] | undefined>
) {
  return (
    values
      .map((value) => getFirstSearchValue(value)?.trim() ?? "")
      .find((value) => value.length > 0) ?? ""
  );
}

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  await requireCurrentUser();
  const language = "es" as const;
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialInterestText = getFirstNonBlankSearchValue(
    resolvedSearchParams.tema,
    resolvedSearchParams.idea,
    resolvedSearchParams.tema_sugerido,
    resolvedSearchParams.topic,
  ).slice(0, 700);

  return (
    <ProjectShell
      title="Crear proyecto"
      description="Completa el contexto inicial. Podras definir el problema y la poblacion en el siguiente tramo."
    >
      <section className="surface-panel rounded-[34px] p-4 sm:p-8">
        <CreateProjectForm
          initialInterestText={initialInterestText}
          language={language}
        />
      </section>
    </ProjectShell>
  );
}
