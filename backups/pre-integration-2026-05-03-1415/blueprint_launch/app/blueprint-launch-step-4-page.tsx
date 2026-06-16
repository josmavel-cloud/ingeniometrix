import { BlueprintLaunchStep4Lab } from "@/blueprint_launch/components/step-4/blueprint-launch-step-4";
import { readLatestBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchStep4Page() {
  const [localState, debugSnapshot, initialTokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLatestBlueprintLaunchDebugSnapshot(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchStep4Lab
      initialBundle={localState.selectedSourcesBundle}
      initialContentMaterialization={localState.contentMaterialization}
      initialDebugSnapshot={debugSnapshot}
      initialEvidencePlanning={localState.evidencePlanning}
      initialProjectGlobalContext={localState.projectGlobalContext}
      initialSavedIntake={localState.savedIntake}
      initialTokenUsage={initialTokenUsage}
    />
  );
}
