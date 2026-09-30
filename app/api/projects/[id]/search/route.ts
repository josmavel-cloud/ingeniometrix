import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/server/auth/session";
import { convergeSourceSufficiency } from "@/server/retrieval/source-sufficiency-controller";
import { searchProjectReferencesV2 } from "@/server/retrieval/reference-search-v2";
import { withPaidRequest } from "@/server/mvp/pre-job-budget";
import { loadSearchInput } from "@/server/retrieval/search-intent-service";
import { SearchPlanningError } from "@/lib/search-planning-outcome";
import { readDefinition } from "@/server/projects/conversational-definition-service";
import { definitionReadiness } from "@/lib/conversational-intake";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireCurrentUser();
  const { id } = await context.params;
  try {
    const searchInput = await loadSearchInput(user.id, id);
    const body = (await _request.json().catch(() => ({}))) as {
      desiredTotal?: number;
      batchKind?: "initial" | "more";
    };
    if (body.batchKind !== undefined && body.batchKind !== "initial" && body.batchKind !== "more") throw new Error("INVALID_SEARCH_BATCH_KIND");
    if (body.desiredTotal !== undefined && (!Number.isInteger(body.desiredTotal) || body.desiredTotal < 1 || body.desiredTotal > 40)) throw new Error("INVALID_SEARCH_SIZE");
    const result = body.batchKind !== "more" ? await convergeSourceSufficiency(user.id, id, searchInput) : await withPaidRequest(_request, user.id, id, body, () => searchProjectReferencesV2(user.id, id, searchInput, {
      desiredTotal: body.desiredTotal,
      batchKind: body.batchKind,
    }));

    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof SearchPlanningError ? error.code : error instanceof Error ? error.message : "INTERNAL_SEARCH_PLANNING_ERROR";
    const clarification = code === "REAL_USER_CLARIFICATION_REQUIRED" || code === "SEARCH_INTENT_NOT_READY" || code === "DEFINITION_CONFIRMATION_REQUIRED";
    if (clarification) {
      let question = "Para buscar antecedentes útiles necesito que revises y confirmes la dirección de tu investigación.";
      try {
        const state = await readDefinition(user.id, id);
        const reason = state && definitionReadiness(state.definition).evidenceSearch.reasons[0];
        if (reason) question = reason;
      } catch { /* Keep the generic, non-sensitive question. */ }
      return NextResponse.json({ code: "REAL_USER_CLARIFICATION_REQUIRED", error: question }, { status: 409 });
    }
    const unavailable = code === "PROVIDER_UNAVAILABLE" || code === "OPENALEX_UNAVAILABLE";
    return NextResponse.json({ code: unavailable ? "PROVIDER_UNAVAILABLE" : "SEARCH_PLANNING_FAILED",
      error: unavailable ? "El servicio de búsqueda no está disponible ahora. Conservamos tu definición; vuelve a intentarlo más tarde." :
        "No pudimos preparar la búsqueda. Conservamos tu definición y tus fuentes; vuelve a intentarlo." }, { status: unavailable ? 503 : 500 });
  }
}
