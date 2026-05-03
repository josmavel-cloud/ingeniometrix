import { NextResponse } from "next/server";

import { syntheticProjectData } from "@/blueprint_launch/fixtures/synthetic-intake";
import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import {
  saveBlueprintLaunchStep1State,
  type BlueprintLaunchSavedIntakeOriginalSnapshot,
} from "@/blueprint_launch/server/local-playground-store";
import {
  buildBlueprintLaunchProjectGlobalContext,
  buildBlueprintLaunchProjectSnapshot,
  improveBlueprintLaunchIntake,
} from "@/blueprint_launch/server/step1-intake-context";
import { readLlmUsageRegistry } from "@/server/llm-usage-registry";
import { parseIntakeInput, resolveProjectStatusFromIntake } from "@/server/projects/project-validation";

export async function PUT(request: Request) {
  try {
    const raw = await request.json();
    const input = parseIntakeInput(raw);
    const payload = raw as {
      knowledgeAreaLabel?: unknown;
      preserveExistingArtifacts?: unknown;
    };
    const knowledgeAreaLabel =
      typeof payload.knowledgeAreaLabel === "string" && payload.knowledgeAreaLabel.trim().length > 0
        ? payload.knowledgeAreaLabel.trim()
        : null;
    const preserveExistingArtifacts = payload.preserveExistingArtifacts === true;
    const projectSnapshot = buildBlueprintLaunchProjectSnapshot({
      ...syntheticProjectData,
      knowledgeAreaLabel: knowledgeAreaLabel ?? syntheticProjectData.knowledgeAreaLabel,
    });
    const originalSnapshot: BlueprintLaunchSavedIntakeOriginalSnapshot = {
      savedAt: new Date().toISOString(),
      status: resolveProjectStatusFromIntake(input),
      intake: input,
      projectContext: {
        knowledgeAreaLabel,
      },
    };
    const intakeImprovementResult = await improveBlueprintLaunchIntake({
      project: {
        ...syntheticProjectData,
        knowledgeAreaLabel: knowledgeAreaLabel ?? syntheticProjectData.knowledgeAreaLabel,
      },
      intake: input,
    });
    const snapshot = {
      savedAt: new Date().toISOString(),
      status: resolveProjectStatusFromIntake(intakeImprovementResult.intakeImprovedEs),
      intake: intakeImprovementResult.intakeImprovedEs,
      derivedSearchQuery: null,
      projectContext: {
        knowledgeAreaLabel,
      },
    } as const;
    const projectGlobalContext = buildBlueprintLaunchProjectGlobalContext({
      projectSnapshot,
      intakeOriginal: input,
      intakeImprovementResult,
    });

    await saveBlueprintLaunchStep1State({
      projectSnapshot,
      savedIntakeOriginal: originalSnapshot,
      intakeImprovementResult,
      projectGlobalContext,
      savedIntake: snapshot,
      preserveExistingArtifacts,
    });
    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "INTAKE_SAVED",
    });
    const tokenUsage = await readLlmUsageRegistry();

    return NextResponse.json({
      snapshot,
      originalSnapshot,
      projectSnapshot,
      intakeImprovementResult,
      projectGlobalContext,
      tokenUsage,
      debugSnapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar el intake local.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
