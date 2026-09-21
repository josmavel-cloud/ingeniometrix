import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/server/auth/session";
import { approveScientificDecision, decisionForUser, reviseScientificDecision } from "@/server/mvp/scientific-decision-service";

type RouteContext = { params: Promise<{ id: string }> };
const bodySchema = z.object({ jobId: z.string().uuid(), alternativeId: z.string().min(1).max(100), decisionFingerprint: z.string().regex(/^[a-f0-9]{64}$/), acceptScopeChanges: z.boolean() }).strict();
export async function GET(request: Request, context: RouteContext) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Falta la solicitud de investigación." }, { status: 400 });
  try { return NextResponse.json(await decisionForUser(user.id, id, jobId), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Diseño no encontrado." }, { status: 404 }); }
}
export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  try {
    const body = bodySchema.pick({ jobId: true, decisionFingerprint: true }).strict().parse(await request.json());
    return NextResponse.json(await reviseScientificDecision({ userId: user.id, projectId: id, ...body }), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Guarda primero los cambios en la definición y verifica que esta solicitud todavía admita revisión. El presupuesto y los límites se conservan." }, { status: 409 });
  }
}
export async function POST(request: Request, context: RouteContext) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  try {
    const body = bodySchema.parse(await request.json());
    return NextResponse.json(await approveScientificDecision({ userId: user.id, projectId: id, ...body }), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo confirmar. Revisa si cambió la información o si quedan decisiones indispensables por resolver." }, { status: 409 });
  }
}
