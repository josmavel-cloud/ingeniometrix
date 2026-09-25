import { notFound, redirect } from "next/navigation";

import { TopicStage } from "@/components/projects/topic-stage";
import { ProjectShell } from "@/components/projects/project-shell";
import { WorkflowStageNav } from "@/components/projects/workflow-stage-nav";
import { requireCurrentUser, pageData } from "@/lib/backend-http";

type TopicStagePageProps = {
  params: Promise<{ id: string }>;
};

export default async function TopicStagePage({ params }: TopicStagePageProps) {
  const user = await requireCurrentUser();
  const { id } = await params;

  const { project, suggestions } = await pageData("topic", id);
  if (project.conversationalIntake) redirect(`/projects/${id}?step=define`);
  try {

    return (
      <ProjectShell
        title="Idea"
        description="Paso 1 de 4 · Revisa o mejora la dirección inicial de tu investigación."
      >
        <WorkflowStageNav
          language="es"
          items={[
            { step: "01", href: `/projects/${project.id}/topic`, title: "Idea", description: "Elige la dirección de tu investigación.", active: true, current: true },
            { step: "02", href: `/projects/${project.id}?step=define`, title: "Define tu investigación", description: "Delimita el problema, contexto y diseño.", active: project.topicSelectionStatus === "SELECTED", current: false },
            { step: "03", href: `/projects/${project.id}?step=evidence`, title: "Evidencia", description: "Busca, revisa y selecciona fuentes.", active: false, current: false },
            { step: "04", href: `/projects/${project.id}?step=plan`, title: "Plan de tesis", description: "Genera y consulta tus versiones publicadas.", active: false, current: false },
          ]}
        />
        <TopicStage
          projectId={project.id}
          projectTitle={project.title}
          suggestions={suggestions}
          topicAreaLabel={project.topicAreaLabel}
          topicOriginType={project.topicOriginType}
          topicSeedText={project.topicSeedText?.trim() || project.title}
        />
      </ProjectShell>
    );
  } catch {
    notFound();
  }
}
