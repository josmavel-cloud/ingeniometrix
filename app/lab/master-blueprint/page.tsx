import { MasterBlueprintLab } from "@/components/labs/master-blueprint/master-blueprint-lab";
import { loadMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/fixture-loader";
import { runMasterBlueprintLabThroughStep } from "@/server/blueprint-v2/lab/pipeline";

export default async function MasterBlueprintLabPage() {
  const fixtures = await loadMasterBlueprintLabFixtureSet({
    caseName: "blueprint-launch-latest",
  });
  const initialExecution = await runMasterBlueprintLabThroughStep({
    fixtures,
    throughStep: "prompt_planning",
    allowLlm: false,
  });

  return <MasterBlueprintLab initialExecution={initialExecution} />;
}
