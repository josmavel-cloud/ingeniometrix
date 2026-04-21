import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { saveIntakeForProject } from "@/server/projects/project-service";
import { parseIntakeInput } from "@/server/projects/project-validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const input = parseIntakeInput(await request.json());
    const project = await saveIntakeForProject(user.id, id, input);

    return NextResponse.json({ project });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar el intake.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
