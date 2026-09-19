import { NextResponse } from "next/server";

import type { IntakeDraft } from "@/server/projects/intake-draft-service";
import { requireCurrentUser } from "@/server/auth/session";
import { generateIntakeDrafts } from "@/server/projects/intake-draft-service";
import { getProjectForUser } from "@/server/projects/project-service";
import { resolveProjectContentLanguage } from "@/server/projects/project-language-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.replace(/\u0000/g, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeExistingDrafts(value: unknown): IntakeDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      label: normalizeOptionalText(item.label) ?? "Draft",
      topic: normalizeOptionalText(item.topic) ?? "",
      problemContext: normalizeOptionalText(item.problemContext) ?? "",
      researchLine: normalizeOptionalText(item.researchLine) ?? "",
      academicConstraints: normalizeOptionalText(item.academicConstraints) ?? "",
      targetPopulation: normalizeOptionalText(item.targetPopulation) ?? "",
      availableData: normalizeOptionalText(item.availableData) ?? "",
      preferredMethodology: normalizeOptionalText(item.preferredMethodology) ?? "",
      advisorNotes: normalizeOptionalText(item.advisorNotes) ?? "",
    }));
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const project = await getProjectForUser(user.id, id);

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }

    const language = resolveProjectContentLanguage(project.language);
    const result = await generateIntakeDrafts({
      project,
      variantSeed: normalizeOptionalText(payload.variantSeed),
      existingDrafts: normalizeExistingDrafts(payload.existingDrafts),
      languageOverride: language,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo generar el intake.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
