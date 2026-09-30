import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/server/auth/session";
import { generationContextForUser } from "@/server/projects/generation-context-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    return NextResponse.json({ context: await generationContextForUser(user.id, id) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ code: error instanceof Error ? error.message : "GENERATION_CONTEXT_UNAVAILABLE" }, { status: 409 });
  }
}
