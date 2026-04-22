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
        title="Elegir tema"
        description="Compara tu idea original con tres opciones relacionadas y elige una base para el intake."
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
