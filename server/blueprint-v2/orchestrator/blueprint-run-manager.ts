import { randomUUID } from "node:crypto";

import { Provider } from "@prisma/client";

import { logAuditEvent } from "@/server/audit/audit-service";
import type {
  BlueprintRunManifest,
  BlueprintRunStage,
  BlueprintRunStageKey,
} from "@/server/blueprint-v2/types";

const ENGINE_VERSION = "master-blueprint-engine-v1";

export function createBlueprintRunManifest(input: {
  userId: string;
  projectId: string;
  selectedTemplateKey: string;
}): BlueprintRunManifest {
  return {
    engine_name: "MasterBlueprintEngine",
    engine_version: ENGINE_VERSION,
    run_id: randomUUID(),
    project_id: input.projectId,
    user_id: input.userId,
    started_at: new Date().toISOString(),
    completed_at: null,
    master_template_key: "MASTER_TEMPLATE_LATAM",
    master_template_version_id: null,
    selected_template_key: input.selectedTemplateKey,
    stages: [],
  };
}

export async function pushBlueprintRunStage(input: {
  manifest: BlueprintRunManifest;
  stageKey: BlueprintRunStageKey;
  label: string;
  progress: number;
}) {
  const stage: BlueprintRunStage = {
    stageKey: input.stageKey,
    label: input.label,
    progress: input.progress,
    createdAt: new Date().toISOString(),
  };
  input.manifest.stages.push(stage);

  await logAuditEvent({
    eventType: "BLUEPRINT_STAGE_UPDATED",
    actorType: "SYSTEM",
    provider: Provider.OPENAI,
    userId: input.manifest.user_id,
    projectId: input.manifest.project_id,
    payloadJson: {
      runId: input.manifest.run_id,
      engineName: input.manifest.engine_name,
      engineVersion: input.manifest.engine_version,
      stageKey: stage.stageKey,
      label: stage.label,
      progress: stage.progress,
      createdAt: stage.createdAt,
    },
  });
}

export function completeBlueprintRunManifest(
  manifest: BlueprintRunManifest,
  masterTemplateVersionId: string,
) {
  manifest.master_template_version_id = masterTemplateVersionId;
  manifest.completed_at = new Date().toISOString();
}
