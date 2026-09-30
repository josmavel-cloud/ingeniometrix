import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getBlueprintProgressForUserV2 } from "@/server/blueprint-v2/jobs/blueprint-job-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const progress = await getBlueprintProgressForUserV2(user.id, id);

    return NextResponse.json({ progress });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo obtener el progreso del blueprint.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
