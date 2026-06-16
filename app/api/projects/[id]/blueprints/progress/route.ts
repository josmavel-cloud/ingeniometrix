import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getBlueprintProgressForUser } from "@/server/blueprint/blueprint-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const progress = await getBlueprintProgressForUser(user.id, id);

    return NextResponse.json({ progress });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo obtener el progreso del blueprint.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
