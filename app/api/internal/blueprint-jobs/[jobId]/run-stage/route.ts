import { NextResponse } from "next/server";

import { verifyBlueprintWorkerRequest } from "@/server/blueprint-v2/jobs/blueprint-job-scheduler";
import { runBlueprintJobDrain } from "@/server/blueprint-v2/jobs/blueprint-job-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: RouteContext) {
  if (!verifyBlueprintWorkerRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { jobId } = await context.params;
  const result = await runBlueprintJobDrain(jobId);

  return NextResponse.json({
    accepted: true,
    jobId,
    result,
  });
}
