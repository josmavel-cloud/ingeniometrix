import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { listTopicAreaSuggestions } from "@/server/projects/topic-area-service";

export async function GET(request: Request) {
  try {
    await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const suggestions = await listTopicAreaSuggestions(searchParams.get("q") ?? "");

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar las areas.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
