import { Step10Reader } from "@/components/labs/master-blueprint/step-10-reader";
import { loadLatestMasterBlueprintLabRun } from "@/server/blueprint-v2/lab/artifact-reader";
import type { ConsistencyMatrixArtifact } from "@/server/blueprint-v2/sections/consistency-matrix-engine";

export const dynamic = "force-dynamic";

export default async function MasterBlueprintStep10Page() {
  const execution = await loadLatestMasterBlueprintLabRun({
    caseName: "blueprint-launch-latest",
  });

  return (
    <Step10Reader
      snapshot={{
        fixtureCase: execution.fixtureCase,
        artifactRun: execution.artifactRun,
        execution: execution.execution,
        consistencyMatrixArtifact: execution.artifacts
          .consistencyMatrixArtifact as unknown as ConsistencyMatrixArtifact,
        sectionDrafts: execution.artifacts.sectionDrafts as {
          drafts?: Array<{
            section_key: string;
            title: string;
            content: string;
            fallback_cause?: string | null;
            warnings?: string[];
            quality_checks?: Record<string, boolean>;
          }>;
        },
      }}
    />
  );
}
