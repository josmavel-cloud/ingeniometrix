import { NextResponse } from "next/server";

import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import {
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchContentMaterialization,
} from "@/blueprint_launch/server/local-playground-store";
import { materializeBlueprintLaunchSourceContent } from "@/blueprint_launch/server/source-content-materialization";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";

export async function POST() {
  try {
    const currentState = await readBlueprintLaunchLocalState();

    if (!currentState.selectedSourcesBundle) {
      throw new Error("No hay bundle de fuentes seleccionadas. Ejecuta el Paso 2 primero.");
    }

    if (!currentState.sourceAccessResolution) {
      throw new Error("No hay resolucion de acceso. Ejecuta el Paso 2 primero.");
    }

    if (!currentState.evidencePlanning) {
      throw new Error("No hay plan de evidencia. Ejecuta el Paso 3 primero.");
    }

    const contentMaterialization = await materializeBlueprintLaunchSourceContent({
      bundle: currentState.selectedSourcesBundle,
      sourceAccessResolution: currentState.sourceAccessResolution,
      evidencePlanning: currentState.evidencePlanning,
    });

    await saveBlueprintLaunchContentMaterialization(contentMaterialization);
    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "STEP4_MATERIALIZED",
      bundle: currentState.selectedSourcesBundle,
    });
    const tokenUsage = await readLlmUsageRegistry();

    return NextResponse.json({
      contentMaterialization,
      debugSnapshot,
      tokenUsage,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el Paso 4.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
