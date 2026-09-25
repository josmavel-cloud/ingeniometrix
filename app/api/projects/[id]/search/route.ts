import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getProjectContentLanguageForUser } from "@/server/projects/project-language-service";
import { searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";
import { withPaidRequest } from "@/server/mvp/pre-job-budget";
import { readDefinition, readConfirmedSearchIntent } from "@/server/projects/conversational-definition-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  let language: "es" | "en" = "es";

  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    // Intake boundary only: no changes to query planning, providers or ranking.
    if (await readDefinition(user.id, id)) await readConfirmedSearchIntent(user.id, id);
    language = await getProjectContentLanguageForUser(user.id, id);
    const body = (await _request.json().catch(() => ({}))) as {
      desiredTotal?: number;
      batchKind?: "initial" | "more";
    };
    const result = await withPaidRequest(_request, user.id, id, body, () => searchProjectReferencesV2(user.id, id, {
      desiredTotal: body.desiredTotal,
      batchKind: body.batchKind,
    }));

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
