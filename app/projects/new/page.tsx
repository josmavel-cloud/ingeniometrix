import { ConversationalProjectCreate } from "@/components/projects/conversational-project-create";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/lib/backend-http";

export const dynamic = "force-dynamic";

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
  const user = await requireCurrentUser();
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
      description="Define tu investigación con una conversación breve y una revisión explícita."
    >
      <section className="surface-panel rounded-[34px] p-4 sm:p-8">
        <ConversationalProjectCreate initialIdea={initialInterestText} ownerId={user.id} />
      </section>
    </ProjectShell>
  );
}
