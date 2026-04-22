import { notFound } from "next/navigation";

import { TopicStage } from "@/components/projects/topic-stage";
import { ProjectShell } from "@/components/projects/project-shell";
import { requireCurrentUser } from "@/server/auth/session";
import {
  getTopicProjectForUser,
  listTopicSuggestionsForUser,
} from "@/server/projects/topic-suggestion-service";

type TopicStagePageProps = {
  params: Promise<{ id: string }>;
};

export default async function TopicStagePage({ params }: TopicStagePageProps) {
  const user = await requireCurrentUser();
  const { id } = await params;

  try {
    const project = await getTopicProjectForUser(user.id, id);
    const suggestions = await listTopicSuggestionsForUser(user.id, id);

    return (
      <ProjectShell
        title="Define el tema base"
        description="Antes del intake, elegimos la base tematica del proyecto. Aqui puedes usar tu idea original o una variante generada a partir de ella."
      >
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
