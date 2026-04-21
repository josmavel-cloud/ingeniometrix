import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  listProjectReferences,
  updateSelectedProjectReferences,
} from "@/server/retrieval/reference-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const references = await listProjectReferences(user.id, id);

    return NextResponse.json({ references });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron listar las fuentes.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as { selectedReferenceIds?: string[] };
    const selectedReferenceIds = Array.isArray(body.selectedReferenceIds)
      ? body.selectedReferenceIds
      : [];

    await updateSelectedProjectReferences(user.id, id, selectedReferenceIds);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo guardar la seleccion de fuentes.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
