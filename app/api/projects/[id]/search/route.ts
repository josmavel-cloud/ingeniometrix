import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await _request.json().catch(() => ({}))) as {
      desiredTotal?: number;
    };
    const result = await searchProjectReferencesV2(user.id, id, {
      desiredTotal: body.desiredTotal,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo ejecutar la busqueda.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
