import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/server/auth/session";
import { DraftConflict } from "@/server/projects/project-draft-service";
import { changeDefinition, confirmDefinition, readConfirmedSearchIntent, readDefinition } from "@/server/projects/conversational-definition-service";
import { submitIntakeTurn } from "@/server/projects/intake-conversation-service";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
function failure(e: unknown) {
  const conflict = e instanceof DraftConflict;
  return NextResponse.json({ code: conflict ? "DRAFT_REVISION_CONFLICT" : "DEFINITION_REQUEST_FAILED", error: conflict ? e.message : "No se pudo completar la operación. Tu borrador guardado se conserva." }, { status: conflict ? 409 : 400, headers });
}
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireCurrentUser(), id = (await context.params).id;
    if (new URL(request.url).searchParams.get("view") === "search-intent") return NextResponse.json({ intent: await readConfirmedSearchIntent(user.id, id) }, { headers });
    return NextResponse.json({ state: await readDefinition(user.id, id), assistanceAvailable: Boolean(process.env.OPENAI_API_KEY?.trim()) && process.env.IMX_CONVERSATIONAL_INTAKE !== "0" }, { headers });
  } catch (e) { return failure(e); }
}
export async function PUT(request: Request, context: Context) {
  try { const user = await requireCurrentUser(); return NextResponse.json({ state: await changeDefinition(user.id, (await context.params).id, await request.json()) }, { headers }); }
  catch (e) { return failure(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireCurrentUser(), id = (await context.params).id, body = await request.json();
    if (body.operation === "confirm") {
      const input = z.object({ operation: z.literal("confirm"), revision: z.number().int().positive(), definitionHash: z.string().length(64) }).strict().parse(body);
      return NextResponse.json({ state: await confirmDefinition(user.id, id, input.revision, input.definitionHash) }, { headers });
    }
    return NextResponse.json(await submitIntakeTurn(user.id, id, body), { headers });
  } catch (e) { return failure(e); }
}
