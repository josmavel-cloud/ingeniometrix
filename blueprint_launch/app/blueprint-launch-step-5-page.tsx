import { BlueprintLaunchStep5Lab } from "@/blueprint_launch/components/step-5/blueprint-launch-step-5";
import { readLatestBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchStep5Page() {
  const [localState, debugSnapshot, initialTokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLatestBlueprintLaunchDebugSnapshot(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchStep5Lab
      initialBundle={localState.selectedSourcesBundle}
      initialContentMaterialization={localState.contentMaterialization}
      initialDebugSnapshot={debugSnapshot}
      initialEvidencePacksArtifact={localState.evidencePacksArtifact}
      initialEvidencePlanning={localState.evidencePlanning}
      initialProjectGlobalContext={localState.projectGlobalContext}
      initialSavedIntake={localState.savedIntake}
      initialSourceSignalExtraction={localState.sourceSignalExtraction}
      initialTokenUsage={initialTokenUsage}
    />
  );
}
