import { NextResponse } from "next/server";

import { syntheticProjectData } from "@/blueprint_launch/fixtures/synthetic-intake";
import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import {
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchEvidencePacksArtifact,
  saveBlueprintLaunchSourceSignalExtraction,
} from "@/blueprint_launch/server/local-playground-store";
import { extractBlueprintLaunchSourceSignals } from "@/blueprint_launch/server/source-signal-extraction";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function POST() {
  try {
    const currentState = await readBlueprintLaunchLocalState();

    if (!currentState.savedIntake) {
      throw new Error("No hay intake guardado para ejecutar el Paso 5.");
    }

    if (!currentState.selectedSourcesBundle) {
      throw new Error("No hay bundle de fuentes seleccionadas. Ejecuta el Paso 2 primero.");
    }

    if (!currentState.sourceAccessResolution) {
      throw new Error("No hay resolucion de acceso. Ejecuta el Paso 2 primero.");
    }

    if (!currentState.contentMaterialization?.readyForStep5) {
      throw new Error("No hay materializacion completa lista. Ejecuta el Paso 4 primero.");
    }

    const { evidencePacksArtifact, sourceSignalExtraction } =
      await extractBlueprintLaunchSourceSignals({
        projectTitle: syntheticProjectData.title,
        savedIntake: currentState.savedIntake,
        bundle: currentState.selectedSourcesBundle,
        sourceAccessResolution: currentState.sourceAccessResolution,
        contentMaterialization: currentState.contentMaterialization,
        evidenceCompletion: currentState.evidenceCompletion,
      });

    await saveBlueprintLaunchSourceSignalExtraction(sourceSignalExtraction);
    await saveBlueprintLaunchEvidencePacksArtifact(evidencePacksArtifact);

    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "STEP5_EXTRACTED",
      bundle: currentState.selectedSourcesBundle,
    });
    const tokenUsage = await readLlmUsageRegistry();

    return NextResponse.json({
      debugSnapshot,
      sourceSignalExtraction,
      evidencePacksArtifact,
      tokenUsage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el Paso 5.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
