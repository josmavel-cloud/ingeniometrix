import path from "node:path";

import {
  adaptCurrentLabAArtifactToEvidenceHandoffV1,
  loadCurrentLabAEvidenceArtifact,
} from "@/server/blueprint-engine/adapters/current-lab-a-handoff-adapter";
import {
  evidenceEngineHandoffV1Schema,
  type EvidenceEngineHandoffV1,
} from "@/server/blueprint-engine/contracts";

export const CURRENT_LAB_A_TEST_ARTIFACT_PATH = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "blueprint-engine",
  "current-lab-a-consolidated-evidence.json",
);

export function loadCurrentLabATestArtifact() {
  return loadCurrentLabAEvidenceArtifact({
    artifactPath: CURRENT_LAB_A_TEST_ARTIFACT_PATH,
  });
}

export function buildEvidenceHandoffTestFixture(): EvidenceEngineHandoffV1 {
  const loaded = loadCurrentLabATestArtifact();
  const handoff = adaptCurrentLabAArtifactToEvidenceHandoffV1(loaded.artifact, {
    sourceArtifactPath: loaded.artifact_path,
    rawJson: loaded.raw_json,
  });
  const parsed = evidenceEngineHandoffV1Schema.safeParse(handoff);

  if (!parsed.success) {
    throw new Error(
      `Evidence handoff test fixture failed schema validation: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return parsed.data as EvidenceEngineHandoffV1;
}
