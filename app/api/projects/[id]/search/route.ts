import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { searchProjectReferences } from "@/server/retrieval/reference-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const result = await searchProjectReferences(user.id, id);

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar la busqueda.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
