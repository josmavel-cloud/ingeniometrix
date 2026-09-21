import { NextResponse } from "next/server";
import { z } from "zod";
import { draftIntakeSchema } from "@/lib/project-draft-contract";
import { requireCurrentUser } from "@/server/auth/session";
import { DraftConflict, readProjectDraft, saveProjectDraft, confirmProjectDraft } from "@/server/projects/project-draft-service";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof DraftConflict ? error.message : "No se pudo guardar o recuperar el borrador.", code: error instanceof DraftConflict ? "DRAFT_REVISION_CONFLICT" : "DRAFT_REQUEST_FAILED" }, { status: error instanceof DraftConflict ? 409 : 400, headers });
}
export async function GET(_request: Request, context: Context) {
  try { const user = await requireCurrentUser(); return NextResponse.json({ draft: await readProjectDraft(user.id, (await context.params).id) }, { headers }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    const body = z.object({ revision: z.number().int().nonnegative(), intake: draftIntakeSchema }).strict().parse(await request.json());
    return NextResponse.json({ draft: await saveProjectDraft(user.id, (await context.params).id, body.revision, body.intake) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    const body = z.object({ revision: z.number().int().positive() }).strict().parse(await request.json());
    return NextResponse.json(await confirmProjectDraft(user.id, (await context.params).id, body.revision), { headers });
  } catch (error) { return failure(error); }
}
