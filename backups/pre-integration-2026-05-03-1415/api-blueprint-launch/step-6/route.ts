import { NextResponse } from "next/server";

import { syntheticProjectData } from "@/blueprint_launch/fixtures/synthetic-intake";
import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { consolidateBlueprintLaunchEvidence } from "@/blueprint_launch/server/consolidated-evidence";
import {
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchConsolidatedEvidenceArtifact,
} from "@/blueprint_launch/server/local-playground-store";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function POST() {
  try {
    const currentState = await readBlueprintLaunchLocalState();

    if (!currentState.savedIntake) {
      throw new Error("No hay intake guardado para ejecutar el Paso 6.");
    }

    if (!currentState.sourceSignalExtraction?.readyForStep6) {
      throw new Error("No hay extraccion del Paso 5 lista para consolidar.");
    }

    if (!currentState.evidencePacksArtifact) {
      throw new Error("No hay evidence packs del Paso 5 para consolidar.");
    }

    const consolidatedEvidenceArtifact = await consolidateBlueprintLaunchEvidence({
      projectTitle: syntheticProjectData.title,
      savedIntake: currentState.savedIntake,
      sourceSignalExtraction: currentState.sourceSignalExtraction,
      evidencePacksArtifact: currentState.evidencePacksArtifact,
    });

    await saveBlueprintLaunchConsolidatedEvidenceArtifact(consolidatedEvidenceArtifact);

    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "STEP6_CONSOLIDATED",
      bundle: currentState.selectedSourcesBundle,
    });
    const tokenUsage = await readLlmUsageRegistry();

    return NextResponse.json({
      consolidatedEvidenceArtifact,
      debugSnapshot,
      tokenUsage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el Paso 6.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
