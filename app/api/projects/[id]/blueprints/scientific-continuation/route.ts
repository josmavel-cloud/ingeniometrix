import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/server/auth/session";
import { enqueueScientificContinuationForUser, SCIENTIFIC_CONTINUATION_REASON } from "@/server/mvp/scientific-continuation";

export const dynamic = "force-dynamic";
const requestSchema = z.object({ parentJobId: z.string().uuid(), reason: z.literal(SCIENTIFIC_CONTINUATION_REASON) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = requestSchema.parse(await request.json());
    const result = await enqueueScientificContinuationForUser(user.id, id, body.parentJobId);
    return NextResponse.json({ result }, { status: result.reused ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const budget = /QA_COMMITMENT|COST_LIMIT/.test(message);
    const contract = error instanceof z.ZodError;
    return NextResponse.json({ error: contract ? "La solicitud de continuación no es válida." : budget
      ? "No hay presupuesto operativo disponible para continuar ahora. Conservamos el trabajo realizado."
      : "No podemos continuar este trabajo ahora. Conservamos tu investigación y los resultados anteriores." },
    { status: contract ? 400 : budget ? 409 : 403 });
  }
}
