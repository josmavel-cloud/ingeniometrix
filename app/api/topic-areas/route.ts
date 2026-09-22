import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  listTopicAreaSuggestions,
  normalizeTopicAreaInRealTime,
} from "@/server/projects/topic-area-service";

function readOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\u0000/g, "").trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  try {
    await requireCurrentUser();

    const url = new URL(request.url);
    const query = readOptionalText(url.searchParams.get("q"));
    const suggestions = await listTopicAreaSuggestions(query ?? undefined);

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron listar areas tematicas.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    await requireCurrentUser();

    const payload = (await request.json()) as Record<string, unknown>;
    const label = readOptionalText(payload.label);

    if (!label) {
      return NextResponse.json(
        { error: "La etiqueta de area tematica es requerida." },
        { status: 400 },
      );
    }

    const normalizedArea = await normalizeTopicAreaInRealTime(label);

    return NextResponse.json({ normalizedArea });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo normalizar el area tematica.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
