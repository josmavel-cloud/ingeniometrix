import { FinalOutputsReader } from "@/components/labs/master-blueprint/final-outputs-reader";
import { loadLatestMasterBlueprintLabRun } from "@/server/blueprint-v2/lab/artifact-reader";

export const dynamic = "force-dynamic";

export default async function MasterBlueprintFinalOutputsPage() {
  const execution = await loadLatestMasterBlueprintLabRun({
    caseName: "blueprint-launch-latest",
  });

  return <FinalOutputsReader snapshot={execution} />;
}
