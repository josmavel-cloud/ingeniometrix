import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { toBlueprintApiError } from "@/server/blueprint/blueprint-errors";
import { scheduleBlueprintJobRun } from "@/server/blueprint-v2/jobs/blueprint-job-scheduler";
import { enqueueBlueprintJobForUser } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { getProjectContentLanguageForUser } from "@/server/projects/project-language-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const versions = await listBlueprintVersionsForUser(user.id, id);

    return NextResponse.json({ versions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron listar las versiones.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const language = await getProjectContentLanguageForUser(user.id, id);
    const job = await enqueueBlueprintJobForUser(user.id, id, {
      languageOverride: language,
    });

    scheduleBlueprintJobRun({
      origin: new URL(request.url).origin,
      jobId: job.id,
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const payload = toBlueprintApiError(error);

    return NextResponse.json(payload, { status: 400 });
  }
}
