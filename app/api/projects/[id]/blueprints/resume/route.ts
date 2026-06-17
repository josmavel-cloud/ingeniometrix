import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { scheduleBlueprintJobRun } from "@/server/blueprint-v2/jobs/blueprint-job-scheduler";
import { resumeLatestBlueprintJobForUser } from "@/server/blueprint-v2/jobs/blueprint-job-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const result = await resumeLatestBlueprintJobForUser(user.id, id);

    if (result.shouldContinue && result.job) {
      scheduleBlueprintJobRun({
        origin: new URL(request.url).origin,
        jobId: result.job.id,
      });
    }

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo reanudar el job.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
