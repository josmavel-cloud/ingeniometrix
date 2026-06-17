import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { scheduleBlueprintJobRun } from "@/server/blueprint-v2/jobs/blueprint-job-scheduler";
import { getBlueprintProgressForUserV2 } from "@/server/blueprint-v2/jobs/blueprint-job-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const progress = await getBlueprintProgressForUserV2(user.id, id);

    if (progress.shouldNudge && progress.jobId) {
      scheduleBlueprintJobRun({
        origin: new URL(request.url).origin,
        jobId: progress.jobId,
      });
    }

    return NextResponse.json({ progress });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo obtener el progreso del blueprint.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
