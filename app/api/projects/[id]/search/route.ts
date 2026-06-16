import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getRequestLanguage } from "@/server/i18n/request-language";
import { searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  let language: "es" | "en" = "es";

  try {
    const user = await requireCurrentUser();
    language = await getRequestLanguage();
    const { id } = await context.params;
    const body = (await _request.json().catch(() => ({}))) as {
      desiredTotal?: number;
    };
    const result = await searchProjectReferencesV2(user.id, id, {
      desiredTotal: body.desiredTotal,
      languageOverride: language,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : language === "en"
          ? "Could not run the search."
          : "No se pudo ejecutar la busqueda.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
