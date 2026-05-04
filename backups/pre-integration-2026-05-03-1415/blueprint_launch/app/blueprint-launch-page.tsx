import { BlueprintLaunchPlayground } from "@/blueprint_launch/components/blueprint-launch-playground";
import { readLatestBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { getMasterTemplatePlaygroundSnapshot } from "@/blueprint_launch/server/master-template-playground";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchPage() {
  const [templateSnapshot, initialDebugSnapshot, localState, initialTokenUsage] = await Promise.all([
    getMasterTemplatePlaygroundSnapshot(),
    readLatestBlueprintLaunchDebugSnapshot(),
    readBlueprintLaunchLocalState(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchPlayground
      initialDebugSnapshot={initialDebugSnapshot}
      initialIntakeImprovementResult={localState.intakeImprovementResult}
      initialProjectGlobalContext={localState.projectGlobalContext}
      initialProjectSnapshot={localState.projectSnapshot}
      initialSavedIntake={localState.savedIntake}
      initialSavedIntakeOriginal={localState.savedIntakeOriginal}
      initialSearchSnapshot={localState.searchSnapshot}
      initialTokenUsage={initialTokenUsage}
      templateSnapshot={templateSnapshot}
    />
  );
}
