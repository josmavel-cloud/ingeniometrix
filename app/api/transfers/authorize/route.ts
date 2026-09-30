import { cookies } from "next/headers";
import { z } from "zod";
import { authorizeTransfer } from "@/server/hybrid/transfers";
import { limitedJson } from "@/server/commercial/mercado-pago";
const input = z.object({ purpose: z.enum(["UPLOAD", "DOWNLOAD"]), projectId: z.string().uuid(), artifactId: z.string().uuid().optional(),
  fileName: z.string().max(180).optional(), byteSize: z.number().int().positive().optional(), draftRevision: z.number().int().positive().optional(), trainingConsent: z.boolean().optional() }).strict();
export async function POST(request: Request) {
  try {
    const value = input.parse(await limitedJson(request, 4096));
    const result = await authorizeTransfer((await cookies()).get("imx_session")?.value || "", value);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_REQUEST";
    const status = code === "UNAUTHORIZED" ? 401 : code === "NOT_FOUND" ? 404 : code === "DRAFT_CONFLICT" || code === "PDF_LIMIT" ? 409 : 400;
    return Response.json({ error: ["UNAUTHORIZED", "NOT_FOUND", "DRAFT_CONFLICT", "PDF_LIMIT", "TRANSFERS_DISABLED"].includes(code) ? code : "INVALID_REQUEST" }, { status });
  }
}
