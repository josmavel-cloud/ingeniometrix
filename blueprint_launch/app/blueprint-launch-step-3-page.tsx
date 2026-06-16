import { BlueprintLaunchStep3Lab } from "@/blueprint_launch/components/step-3/blueprint-launch-step-3";
import { readLatestBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchStep3Page() {
  const [localState, debugSnapshot, initialTokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLatestBlueprintLaunchDebugSnapshot(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchStep3Lab
      initialBundle={localState.selectedSourcesBundle}
      initialDebugSnapshot={debugSnapshot}
      initialEvidencePlanning={localState.evidencePlanning}
      initialProjectGlobalContext={localState.projectGlobalContext}
      initialSavedIntake={localState.savedIntake}
      initialSourceAccessResolution={localState.sourceAccessResolution}
      initialSourceIntakeGate={localState.sourceIntakeGate}
      initialTokenUsage={initialTokenUsage}
    />
  );
}
