import { NextResponse } from "next/server";

import { recordBlueprintLaunchDebugSnapshot } from "@/blueprint_launch/server/debug-run-store";
import {
  applySelectionState,
  readBlueprintLaunchLocalState,
  saveBlueprintLaunchSearchSnapshot,
  type BlueprintLaunchReferenceListItem,
} from "@/blueprint_launch/server/local-playground-store";
import { searchBlueprintLaunchReferences } from "@/blueprint_launch/server/local-reference-search";
import {
  MAX_SELECTED_REFERENCES,
  MIN_SELECTED_REFERENCES,
  REFERENCE_BATCH_SIZE,
} from "@/lib/research-workflow";

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function selectTopReferenceIds(
  references: BlueprintLaunchReferenceListItem[],
  limit: number,
) {
  return references.slice(0, limit).map((item) => item.reference.id);
}

function mergeVisibleReferenceOrder(params: {
  previousReferences: BlueprintLaunchReferenceListItem[];
  nextReferences: BlueprintLaunchReferenceListItem[];
  desiredTotal: number;
}) {
  const { previousReferences, nextReferences, desiredTotal } = params;
  const previousIds = new Set(previousReferences.map((item) => item.reference.id));
  const preserved = previousReferences.slice(0, desiredTotal);
  const additions = nextReferences
    .filter((item) => !previousIds.has(item.reference.id))
    .slice(0, Math.max(desiredTotal - preserved.length, 0));

  return [...preserved, ...additions];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      desiredTotal?: number;
    };
    const state = await readBlueprintLaunchLocalState();

    if (!state.savedIntake) {
      throw new Error("Primero guarda el intake local antes de buscar fuentes.");
    }

    const desiredTotal = Math.min(
      Math.max(body.desiredTotal ?? REFERENCE_BATCH_SIZE, MIN_SELECTED_REFERENCES),
      MAX_SELECTED_REFERENCES,
    );
    const snapshot = await searchBlueprintLaunchReferences({
      intake: state.savedIntake.intake,
      knowledgeAreaLabel: state.savedIntake.projectContext.knowledgeAreaLabel,
      desiredTotal,
    });
    const previousSnapshot = state.searchSnapshot;

    const baseSnapshot =
      previousSnapshot && previousSnapshot.references.length > 0 && desiredTotal > previousSnapshot.references.length
        ? {
            ...snapshot,
            references: mergeVisibleReferenceOrder({
              previousReferences: previousSnapshot.references,
              nextReferences: snapshot.references,
              desiredTotal,
            }),
          }
        : snapshot;

    const previousSelectedIds =
      previousSnapshot?.references
        .filter((item) => item.selected)
        .sort((left, right) => (left.selectedOrder ?? 999) - (right.selectedOrder ?? 999))
        .map((item) => item.reference.id) ?? [];

    const existingIds = new Set(previousSnapshot?.references.map((item) => item.reference.id) ?? []);
    const batchNewIds = baseSnapshot.references
      .filter((item) => !existingIds.has(item.reference.id))
      .map((item) => item.reference.id);
    const defaultBatchIds =
      previousSnapshot && previousSnapshot.references.length > 0
        ? batchNewIds.slice(0, MIN_SELECTED_REFERENCES)
        : selectTopReferenceIds(baseSnapshot.references, MIN_SELECTED_REFERENCES);
    const selectedReferenceIds = uniqueValues([
      ...previousSelectedIds,
      ...defaultBatchIds,
    ]).slice(0, MAX_SELECTED_REFERENCES);
    const nextSnapshot = {
      ...baseSnapshot,
      references: applySelectionState(baseSnapshot.references, selectedReferenceIds),
    };

    await saveBlueprintLaunchSearchSnapshot(nextSnapshot);
    const debugSnapshot = await recordBlueprintLaunchDebugSnapshot({
      eventType: "SEARCH_COMPLETED",
    });

    return NextResponse.json({ snapshot: nextSnapshot, debugSnapshot });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar la busqueda local.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
