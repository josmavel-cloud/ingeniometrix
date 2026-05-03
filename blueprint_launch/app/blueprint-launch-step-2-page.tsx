import { BlueprintLaunchStep2Lab } from "@/blueprint_launch/components/step-2/blueprint-launch-step-2";
import { readLatestBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchStep2Page() {
  const [localState, debugSnapshot, initialTokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLatestBlueprintLaunchDebugSnapshot(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchStep2Lab
      initialBundle={localState.selectedSourcesBundle}
      initialDebugSnapshot={debugSnapshot}
      initialProjectGlobalContext={localState.projectGlobalContext}
      initialSavedIntake={localState.savedIntake}
      initialSearchSnapshot={localState.searchSnapshot}
      initialSourceAccessResolution={localState.sourceAccessResolution}
      initialSourceIntakeGate={localState.sourceIntakeGate}
      initialTokenUsage={initialTokenUsage}
    />
  );
}
