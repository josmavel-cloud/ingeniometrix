import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { listPreparedSources, prepareSelectedSources } from "@/server/projects/source-preparation-service";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json({ items: await listPreparedSources(user.id, (await context.params).id) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PREPARATION_READ_FAILED" }, { status: 404 });
  }
}
export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json(await prepareSelectedSources(user.id, (await context.params).id),
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PREPARATION_FAILED" }, { status: 409 });
  }
}
