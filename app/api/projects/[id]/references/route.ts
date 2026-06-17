import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { getProjectContentLanguageForUser } from "@/server/projects/project-language-service";
import { getLatestProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import {
  listProjectReferences,
  updateSelectedProjectReferences,
} from "@/server/retrieval/reference-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  let language: "es" | "en" = "es";

  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    language = await getProjectContentLanguageForUser(user.id, id);
    const [references, searchSnapshot] = await Promise.all([
      listProjectReferences(user.id, id, { languageOverride: language }),
      getLatestProjectReferenceSearchSnapshot(id),
    ]);

    return NextResponse.json({ references, searchSnapshot });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : language === "en"
          ? "Could not list the sources."
          : "No se pudieron listar las fuentes.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  let language: "es" | "en" = "es";

  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    language = await getProjectContentLanguageForUser(user.id, id);
    const body = (await request.json()) as { selectedReferenceIds?: string[] };
    const selectedReferenceIds = Array.isArray(body.selectedReferenceIds)
      ? body.selectedReferenceIds
      : [];

    await updateSelectedProjectReferences(user.id, id, selectedReferenceIds);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : language === "en"
          ? "Could not save the source selection."
          : "No se pudo guardar la seleccion de fuentes.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
