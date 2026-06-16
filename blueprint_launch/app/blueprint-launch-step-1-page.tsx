import { BlueprintLaunchStep1Lab } from "@/blueprint_launch/components/step-1/blueprint-launch-step-1";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchStep1Page() {
  const [localState, initialTokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchStep1Lab
      initialIntakeImprovementResult={localState.intakeImprovementResult}
      initialProjectGlobalContext={localState.projectGlobalContext}
      initialProjectSnapshot={localState.projectSnapshot}
      initialSavedIntake={localState.savedIntake}
      initialSavedIntakeOriginal={localState.savedIntakeOriginal}
      initialTokenUsage={initialTokenUsage}
    />
  );
}
