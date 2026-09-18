import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  applyMvpStep3SourceSelection,
  prepareMvpStep3SourceSelection,
  requestMvpStep3MoreSources,
} from "@/server/mvp/source-selection-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const result = await prepareMvpStep3SourceSelection({
      userId: user.id,
      projectId: id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo preparar la selección de fuentes.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      selectedReferenceIds?: unknown;
    };

    if (body.action === "request_more") {
      const result = await requestMvpStep3MoreSources({
        userId: user.id,
        projectId: id,
      });

      return NextResponse.json(result);
    }

    if (body.action === "apply_selection") {
      const selectedReferenceIds = Array.isArray(body.selectedReferenceIds)
        ? body.selectedReferenceIds.filter((item): item is string => typeof item === "string")
        : [];
      const result = await applyMvpStep3SourceSelection({
        userId: user.id,
        projectId: id,
        selectedReferenceIds,
      });

      return NextResponse.json(result);
    }

    throw new Error("Acción inválida para Paso 3.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar el Paso 3.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
