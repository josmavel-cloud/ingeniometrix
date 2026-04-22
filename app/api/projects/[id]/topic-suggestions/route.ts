import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import {
  ensureTopicSuggestionsForUser,
  regenerateTopicSuggestionsForUser,
  selectTopicSuggestionForUser,
} from "@/server/projects/topic-suggestion-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const suggestions = await ensureTopicSuggestionsForUser(user.id, id);

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron listar las sugerencias.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const suggestions = await regenerateTopicSuggestionsForUser(user.id, id);

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron regenerar las sugerencias.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as { suggestionId?: string };

    if (!body.suggestionId) {
      return NextResponse.json(
        { error: "Debes indicar suggestionId." },
        { status: 400 },
      );
    }

    const project = await selectTopicSuggestionForUser({
      userId: user.id,
      projectId: id,
      suggestionId: body.suggestionId,
    });

    return NextResponse.json({ project });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo seleccionar el tema.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
