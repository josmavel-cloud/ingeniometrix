import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  listTopicAreaSuggestions,
  normalizeTopicAreaInRealTime,
} from "@/server/projects/topic-area-service";

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

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const payload = (await request.json()) as { label?: unknown };
    const label = typeof payload.label === "string" ? payload.label.trim() : "";

    if (!label) {
      return NextResponse.json(
        { error: "La etiqueta del area es obligatoria." },
        { status: 400 },
      );
    }

    const normalizedArea = await normalizeTopicAreaInRealTime(label);

    return NextResponse.json({ normalizedArea });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo normalizar el area.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
