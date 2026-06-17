import { after, NextResponse } from "next/server";

import {
  dispatchBlueprintJobRun,
  verifyBlueprintWorkerRequest,
} from "@/server/blueprint-v2/jobs/blueprint-job-scheduler";
import { runNextBlueprintJobStage } from "@/server/blueprint-v2/jobs/blueprint-job-service";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  if (!verifyBlueprintWorkerRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { jobId } = await context.params;
  const origin = new URL(request.url).origin;

  after(async () => {
    const result = await runNextBlueprintJobStage(jobId);

    if (result.shouldContinue && result.job) {
      await dispatchBlueprintJobRun({
        origin,
        jobId: result.job.id,
      }).catch((error) => {
        console.error("[blueprint-job] failed to dispatch next stage", {
          jobId: result.job?.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  });

  return NextResponse.json({ accepted: true, jobId });
}
