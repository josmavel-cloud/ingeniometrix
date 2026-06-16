import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  createProjectForUser,
  listProjectsForUser,
} from "@/server/projects/project-service";
import { parseCreateProjectInput } from "@/server/projects/project-validation";

export async function GET() {
  const user = await requireCurrentUser();
  const projects = await listProjectsForUser(user.id);

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = parseCreateProjectInput(await request.json());
    const project = await createProjectForUser(user.id, input);

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear el proyecto.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
