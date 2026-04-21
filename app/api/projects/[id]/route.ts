import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getProjectForUser } from "@/server/projects/project-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const project = await getProjectForUser(user.id, id);

  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ project });
}
