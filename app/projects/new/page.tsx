import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";
import { getRequestLanguage } from "@/server/i18n/request-language";

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
  const language = await getRequestLanguage();
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialInterestText = getFirstNonBlankSearchValue(
    resolvedSearchParams.tema,
    resolvedSearchParams.idea,
    resolvedSearchParams.tema_sugerido,
    resolvedSearchParams.topic,
  ).slice(0, 700);

  return (
    <ProjectShell
      title={language === "en" ? "Create project" : "Crear proyecto"}
      description={
        language === "en"
          ? "Complete the base context and continue to intake. Everything else is refined later."
          : "Completa el contexto base y continua al intake. Todo lo demas se refina despues."
      }
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
