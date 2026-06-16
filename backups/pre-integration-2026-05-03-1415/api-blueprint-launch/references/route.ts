import { NextResponse } from "next/server";

import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import {
  saveBlueprintLaunchContentMaterialization,
  saveBlueprintLaunchConsolidatedEvidenceArtifact,
  saveBlueprintLaunchEvidenceCompletion,
  saveBlueprintLaunchEvidencePacksArtifact,
  saveBlueprintLaunchSourceAccessResolution,
  saveBlueprintLaunchSourceSignalExtraction,
  saveBlueprintLaunchSourceIntakeGate,
  saveBlueprintLaunchSelectedSourcesBundle,
  readBlueprintLaunchLocalState,
  updateBlueprintLaunchSelectedReferences,
} from "@/blueprint_launch/server/local-playground-store";
import { syntheticProjectData } from "@/blueprint_launch/fixtures/synthetic-intake";
import {
  buildBlueprintLaunchSelectedSourcesBundle,
  writeBlueprintLaunchSelectedSourcesBundle,
} from "@/blueprint_launch/server/selected-source-bundle";
import { materializeBlueprintLaunchSourceContent } from "@/blueprint_launch/server/source-content-materialization";
import { resolveBlueprintLaunchSourceAccess } from "@/blueprint_launch/server/source-access-resolution";
import { completeBlueprintLaunchEvidence } from "@/blueprint_launch/server/source-evidence-completion";
import { extractBlueprintLaunchSourceSignals } from "@/blueprint_launch/server/source-signal-extraction";
import { evaluateBlueprintLaunchSourceIntakeGate } from "@/blueprint_launch/server/source-intake-gate";
import { consolidateBlueprintLaunchEvidence } from "@/blueprint_launch/server/consolidated-evidence";

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { selectedReferenceIds?: string[] };
    const selectedReferenceIds = Array.isArray(body.selectedReferenceIds)
      ? body.selectedReferenceIds
      : [];
    const snapshot = await updateBlueprintLaunchSelectedReferences(selectedReferenceIds);
    const currentState = await readBlueprintLaunchLocalState();
    const bundle = await buildBlueprintLaunchSelectedSourcesBundle();
    const sourceAccessResolution = await resolveBlueprintLaunchSourceAccess({
      bundle,
      projectGlobalContext: currentState.projectGlobalContext,
    });
    const sourceIntakeGate = evaluateBlueprintLaunchSourceIntakeGate(
      snapshot.references,
      sourceAccessResolution,
    );

    if (!currentState.savedIntake) {
      throw new Error("No hay intake guardado para completar evidencia.");
    }

    const evidenceCompletion = await completeBlueprintLaunchEvidence({
      savedIntake: currentState.savedIntake,
      bundle,
      sourceAccessResolution,
    });
    const contentMaterialization = await materializeBlueprintLaunchSourceContent({
      bundle,
      sourceAccessResolution,
      evidencePlanning: currentState.evidencePlanning,
    });
    const { evidencePacksArtifact, sourceSignalExtraction } =
      await extractBlueprintLaunchSourceSignals({
        projectTitle: syntheticProjectData.title,
        savedIntake: currentState.savedIntake,
        bundle,
        sourceAccessResolution,
        contentMaterialization,
        evidenceCompletion,
      });
    const consolidatedEvidenceArtifact = await consolidateBlueprintLaunchEvidence({
      projectTitle: syntheticProjectData.title,
      savedIntake: currentState.savedIntake,
      sourceSignalExtraction,
      evidencePacksArtifact,
    });

    await writeBlueprintLaunchSelectedSourcesBundle(bundle);
    await saveBlueprintLaunchSelectedSourcesBundle(bundle);
    await saveBlueprintLaunchSourceAccessResolution(sourceAccessResolution);
    await saveBlueprintLaunchSourceIntakeGate(sourceIntakeGate);
    await saveBlueprintLaunchEvidenceCompletion(evidenceCompletion);
    await saveBlueprintLaunchContentMaterialization(contentMaterialization);
    await saveBlueprintLaunchSourceSignalExtraction(sourceSignalExtraction);
    await saveBlueprintLaunchEvidencePacksArtifact(evidencePacksArtifact);
    await saveBlueprintLaunchConsolidatedEvidenceArtifact(consolidatedEvidenceArtifact);
    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "REFERENCES_SAVED",
      bundle,
    });

    return NextResponse.json({
      snapshot,
      bundle,
      debugSnapshot,
      sourceAccessResolution,
      sourceIntakeGate,
      evidenceCompletion,
      contentMaterialization,
      sourceSignalExtraction,
      evidencePacksArtifact,
      consolidatedEvidenceArtifact,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo guardar la seleccion local de fuentes.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
