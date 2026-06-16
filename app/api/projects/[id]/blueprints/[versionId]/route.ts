import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getBlueprintVersionForUser } from "@/server/blueprint/blueprint-service";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id, versionId } = await context.params;
    const version = await getBlueprintVersionForUser(user.id, id, versionId);

    return NextResponse.json({ version });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo cargar la version.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
