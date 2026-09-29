import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/server/auth/session";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { toBlueprintApiError } from "@/server/blueprint/blueprint-errors";
import { enqueueBlueprintJobForUser } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { getProjectContentLanguageForUser } from "@/server/projects/project-language-service";
import { rateLimit } from "@/server/auth/security-events";

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

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    await rateLimit("generation", user.id, 20);
    const { id } = await context.params;
    const language = await getProjectContentLanguageForUser(user.id, id);
    const body = z.object({ draftRevision: z.number().int().nonnegative().optional() }).strict().parse(await request.json().catch(() => ({})));
    const job = await enqueueBlueprintJobForUser(user.id, id, {
      languageOverride: language,
      scientificProfile: "rc4",
      confirmedDraftRevision: body.draftRevision ?? 0,
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "ENTITLEMENT_REQUIRED") return NextResponse.json({ code: "PURCHASE_REQUIRED", error: "Necesitas un paquete con planes disponibles para generar.", purchaseUrl: "/account" }, { status: 402 });
    if (error instanceof Error && error.message === "RATE_LIMITED") return NextResponse.json({ error: "Espera unos minutos antes de volver a intentar." }, { status: 429 });
    const payload = toBlueprintApiError(error);

    return NextResponse.json(payload, { status: 400 });
  }
}
