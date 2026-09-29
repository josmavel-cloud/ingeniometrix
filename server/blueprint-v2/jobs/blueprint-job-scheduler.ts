import { timingSafeEqual } from "node:crypto";

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

  const expected = Buffer.from(getWorkerSecret());
  const received = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
