import { after } from "next/server";

function getWorkerSecret() {
  const secret =
    process.env.BLUEPRINT_WORKER_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Falta BLUEPRINT_WORKER_SECRET o NEXTAUTH_SECRET para ejecutar jobs internos.",
    );
  }

  return "local-dev-blueprint-worker-secret";
}

export function verifyBlueprintWorkerRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  return token.length > 0 && token === getWorkerSecret();
}

export async function dispatchBlueprintJobRun(input: {
  origin: string;
  jobId: string;
}) {
  const secret = getWorkerSecret();
  const url = new URL(
    `/api/internal/blueprint-jobs/${input.jobId}/run-stage`,
    input.origin,
  );

  await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
    },
    cache: "no-store",
  });
}

export function scheduleBlueprintJobRun(input: {
  origin: string;
  jobId: string;
}) {
  after(async () => {
    await dispatchBlueprintJobRun(input).catch((error) => {
      console.error("[blueprint-job] failed to schedule next stage", {
        jobId: input.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}
