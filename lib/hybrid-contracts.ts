import type { ComponentProps } from "react";
import type { ReferenceSearchPanel } from "@/components/projects/reference-search-panel";
import type { BlueprintPanel } from "@/components/projects/blueprint-panel";
import type { TopicStage } from "@/components/projects/topic-stage";
import type { ProjectListItem } from "@/components/projects/project-list";

// Wire contracts: no ORM types, secrets, binary content or filesystem paths.
export type DegreeLevel = "PREGRADO" | "POSGRADO" | "ESPECIALIZACION" | "MAESTRIA" | "DOCTORADO" | "PROYECTO_INVESTIGACION";
export type IntakeView = { topic: string } & Record<"problemContext" | "researchLine" | "academicConstraints" | "targetPopulation" | "availableData" | "preferredMethodology" | "advisorNotes" | "researchScope" | "constructs" | "pendingDecisions", string | null>;
export type ProjectView = {
  id: string; title: string; catalogTopicId: string | null; country: string;
  degreeLevel: DegreeLevel; status: string; topicAreaLabel: string | null;
  activeBlueprintVersionId: string | null; intake: IntakeView | null;
  conversationalIntake?: boolean;
  definitionConfirmed?: boolean;
  draft: { revision: number; staleScopesJson: unknown } | null;
  knowledgeFields: Array<{ customLabel: string | null; concept: { labelEs: string | null } | null }>;
};
export type SessionView = { id: string; name: string | null; email: string } | null;
export type DetailView = {
  project: ProjectView;
  references: ComponentProps<typeof ReferenceSearchPanel>["initialReferences"];
  initialReferenceSearchSnapshot: ComponentProps<typeof ReferenceSearchPanel>["initialSearchSnapshot"];
  blueprintVersions: ComponentProps<typeof BlueprintPanel>["versions"];
};
export type TopicView = { project: Pick<ProjectView, "id" | "title" | "topicAreaLabel"> & {
  topicSelectionStatus: string; topicSeedText: string | null;
  conversationalIntake?: boolean;
  topicOriginType: ComponentProps<typeof TopicStage>["topicOriginType"];
}; suggestions: ComponentProps<typeof TopicStage>["suggestions"] };
export type PageContract = {
  session: SessionView;
  projects: ProjectListItem[];
  detail: DetailView;
  topic: TopicView;
  purchase: { id: string };
};
