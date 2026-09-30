import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/server/auth/session";
import { listBlueprintVersionsForUser } from "@/server/blueprint/blueprint-service";
import { toBlueprintApiError } from "@/server/blueprint/blueprint-errors";
import { enqueueBlueprintJobForUser } from "@/server/blueprint-v2/jobs/blueprint-job-service";
import { getProjectContentLanguageForUser } from "@/server/projects/project-language-service";
import { rateLimit } from "@/server/auth/security-events";
import { generationContextForUser } from "@/server/projects/generation-context-service";
import { randomUUID } from "node:crypto";

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
  const requestId = randomUUID();
  let diagnostic: { projectId: string; userId: string; operationId?: string; expected?: {
    confirmedRevision: number; draftRevision: number; definitionHash: string; selectionHash: string; uploadHash: string } } | null = null;
  try {
    const user = await requireCurrentUser();
    await rateLimit("generation", user.id, 20);
    const { id } = await context.params;
    const language = await getProjectContentLanguageForUser(user.id, id);
    const contextSchema = z.object({ intakeId: z.string().uuid(), confirmedRevision: z.number().int().nonnegative(),
      definitionHash: z.string().length(64), selectionHash: z.string().length(64), uploadHash: z.string().length(64),
      evidenceSetId: z.string().uuid().nullable(), draftRevision: z.number().int().nonnegative() }).strict();
    const body = z.union([
      z.object({ context: contextSchema, operationId: z.string().uuid() }).strict(),
      z.object({ draftRevision: z.number().int().nonnegative() }).strict(),
    ]).safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ code: "GENERATION_CONTRACT_INCOMPLETE",
      error: "No se pudo verificar la versión de tu investigación. Actualiza la página y vuelve a continuar." }, { status: 400 });
    const expectedContext = "context" in body.data ? body.data.context : await generationContextForUser(user.id, id);
    diagnostic = { projectId: id, userId: user.id, operationId: "operationId" in body.data ? body.data.operationId : undefined,
      expected: expectedContext };
    const job = await enqueueBlueprintJobForUser(user.id, id, {
      languageOverride: language,
      scientificProfile: "rc4",
      ...( "draftRevision" in body.data ? { confirmedDraftRevision: body.data.draftRevision } :
        { expectedContext, operationId: body.data.operationId }),
    });

    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
    if (diagnostic && ["DEFINITION_REVISION_CONFLICT", "SOURCE_SELECTION_CONFLICT", "DRAFT_REVISION_CONFLICT", "EVIDENCE_SET_CHANGED"].includes(code)) {
      const current = await generationContextForUser(diagnostic.userId, diagnostic.projectId).catch(() => null);
      console.warn(JSON.stringify({ event: "generation_context_conflict", requestId, operationId: diagnostic.operationId,
        projectId: diagnostic.projectId, category: code, phase: "enqueue",
        expected: diagnostic.expected, actual: current ? { confirmedRevision: current.confirmedRevision,
          draftRevision: current.draftRevision, definitionHash: current.definitionHash,
          selectionHash: current.selectionHash, uploadHash: current.uploadHash } : null }));
    }
    if (error instanceof Error && error.message === "ENTITLEMENT_REQUIRED") return NextResponse.json({ code: "PURCHASE_REQUIRED", error: "Necesitas un paquete con planes disponibles para generar.", purchaseUrl: "/account" }, { status: 402 });
    if (error instanceof Error && error.message === "RATE_LIMITED") return NextResponse.json({ error: "Espera unos minutos antes de volver a intentar." }, { status: 429 });
    const payload = toBlueprintApiError(error);

    return NextResponse.json(payload, { status: payload.code.endsWith("CONFLICT") || payload.code === "EVIDENCE_SET_CHANGED" ? 409 : 400 });
  }
}
