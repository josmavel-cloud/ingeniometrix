import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getRequestLanguage } from "@/server/i18n/request-language";
import { generateBlueprintVersion } from "@/server/blueprint-v2";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { toBlueprintApiError } from "@/server/blueprint/blueprint-errors";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const versions = await listBlueprintVersionsForUser(user.id, id);

    return NextResponse.json({ versions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron listar las versiones.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const language = await getRequestLanguage();
    const { id } = await context.params;
    const version = await generateBlueprintVersion(user.id, id, {
      languageOverride: language,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    const payload = toBlueprintApiError(error);

    return NextResponse.json(payload, { status: 400 });
  }
}
