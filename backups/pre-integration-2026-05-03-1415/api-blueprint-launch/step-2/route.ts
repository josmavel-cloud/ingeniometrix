import { NextResponse } from "next/server";

import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import { evaluateBlueprintLaunchSourceIntakeGate } from "@/blueprint_launch/server/source-intake-gate";
import { resolveBlueprintLaunchSourceAccess } from "@/blueprint_launch/server/source-access-resolution";
import {
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchSelectedSourcesBundle,
  saveBlueprintLaunchSourceAccessResolution,
  saveBlueprintLaunchSourceIntakeGate,
} from "@/blueprint_launch/server/local-playground-store";
import {
  buildBlueprintLaunchSelectedSourcesBundle,
  writeBlueprintLaunchSelectedSourcesBundle,
} from "@/blueprint_launch/server/selected-source-bundle";

export async function POST() {
  try {
    const currentState = await readBlueprintLaunchLocalState();

    if (!currentState.searchSnapshot) {
      throw new Error("No hay una busqueda local lista para resolver en el Paso 2.");
    }

    const selectedCount = currentState.searchSnapshot.references.filter((item) => item.selected).length;

    if (selectedCount === 0) {
      throw new Error("No hay fuentes seleccionadas para ejecutar el Paso 2.");
    }

    const bundle = await buildBlueprintLaunchSelectedSourcesBundle();
    const sourceAccessResolution = await resolveBlueprintLaunchSourceAccess({
      bundle,
      projectGlobalContext: currentState.projectGlobalContext,
    });
    const sourceIntakeGate = evaluateBlueprintLaunchSourceIntakeGate(
      currentState.searchSnapshot.references,
      sourceAccessResolution,
    );

    await writeBlueprintLaunchSelectedSourcesBundle(bundle);
    await saveBlueprintLaunchSelectedSourcesBundle(bundle);
    await saveBlueprintLaunchSourceAccessResolution(sourceAccessResolution);
    await saveBlueprintLaunchSourceIntakeGate(sourceIntakeGate);

    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "STEP2_RESOLVED",
      bundle,
    });

    return NextResponse.json({
      bundle,
      debugSnapshot,
      sourceAccessResolution,
      sourceIntakeGate,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el Paso 2.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
