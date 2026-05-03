import { NextResponse } from "next/server";

import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import {
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchEvidencePlanning,
} from "@/blueprint_launch/server/local-playground-store";
import { planBlueprintLaunchEvidence } from "@/blueprint_launch/server/source-evidence-planning";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function POST() {
  try {
    const currentState = await readBlueprintLaunchLocalState();

    if (!currentState.savedIntake) {
      throw new Error("No hay intake guardado para planificar el Paso 3.");
    }

    if (!currentState.selectedSourcesBundle) {
      throw new Error("No hay bundle de fuentes seleccionadas. Ejecuta el Paso 2 primero.");
    }

    if (!currentState.sourceAccessResolution) {
      throw new Error("No hay resolucion de acceso. Ejecuta el Paso 2 primero.");
    }

    if (!currentState.sourceIntakeGate) {
      throw new Error("No hay gate de fuentes. Ejecuta el Paso 2 primero.");
    }

    const evidencePlanning = await planBlueprintLaunchEvidence({
      savedIntake: currentState.savedIntake,
      projectGlobalContext: currentState.projectGlobalContext,
      bundle: currentState.selectedSourcesBundle,
      sourceAccessResolution: currentState.sourceAccessResolution,
      sourceIntakeGate: currentState.sourceIntakeGate,
      state: currentState,
    });

    await saveBlueprintLaunchEvidencePlanning(evidencePlanning);
    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "STEP3_PLANNED",
      bundle: currentState.selectedSourcesBundle,
    });
    const tokenUsage = await readLlmUsageRegistry();

    return NextResponse.json({
      debugSnapshot,
      evidencePlanning,
      tokenUsage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el Paso 3.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
