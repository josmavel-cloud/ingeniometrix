import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  createProjectForUser,
  listProjectsForUser,
} from "@/server/projects/project-service";
import { parseCreateProjectInput } from "@/server/projects/project-validation";
import { withPaidRequest } from "@/server/mvp/pre-job-budget";
import { createConversationalProject } from "@/server/projects/conversational-definition-service";

export async function GET() {
  const user = await requireCurrentUser();
  const projects = await listProjectsForUser(user.id);

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const raw = await request.json();
    if (raw.intakeMode === "conversation") return NextResponse.json({ project: await createConversationalProject(user.id, raw) }, { status: 201 });
    const input = parseCreateProjectInput(raw);
    const project = await withPaidRequest(request, user.id, undefined, input, () => createProjectForUser(user.id, input));

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear el proyecto.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
