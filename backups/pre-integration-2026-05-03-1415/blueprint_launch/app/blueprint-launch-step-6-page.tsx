import { BlueprintLaunchStep6Lab } from "@/blueprint_launch/components/step-6/blueprint-launch-step-6";
import { readLatestBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { readBlueprintLaunchLocalState } from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function BlueprintLaunchStep6Page() {
  const [localState, debugSnapshot, initialTokenUsage] = await Promise.all([
    readBlueprintLaunchLocalState(),
    readLatestBlueprintLaunchDebugSnapshot(),
    readLlmUsageRegistry(),
  ]);

  return (
    <BlueprintLaunchStep6Lab
      initialConsolidatedEvidenceArtifact={localState.consolidatedEvidenceArtifact}
      initialDebugSnapshot={debugSnapshot}
      initialEvidencePacksArtifact={localState.evidencePacksArtifact}
      initialSavedIntake={localState.savedIntake}
      initialSourceSignalExtraction={localState.sourceSignalExtraction}
      initialTokenUsage={initialTokenUsage}
    />
  );
}
