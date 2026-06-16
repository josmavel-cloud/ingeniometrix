import { DegreeLevel, University } from "@prisma/client";
import { NextResponse } from "next/server";

import { APP_DEFAULT_LANGUAGE, normalizeLanguageCode } from "@/lib/language";
import { resolveTemplateKeyForMvp } from "@/lib/system-master-template";
import { requireCurrentUser } from "@/server/auth/session";
import { generateIdeaDrafts } from "@/server/projects/idea-draft-service";

const DEGREE_LEVEL_VALUES = new Set(Object.values(DegreeLevel));
const UNIVERSITY_VALUES = new Set(Object.values(University));

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.replace(/\u0000/g, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const payload = (await request.json()) as Record<string, unknown>;
    const degreeLevel = payload.degreeLevel;
    const university = payload.university;
    const templateKey = resolveTemplateKeyForMvp(payload.templateKey);

    if (!DEGREE_LEVEL_VALUES.has(degreeLevel as DegreeLevel)) {
      throw new Error("degreeLevel invalido.");
    }

    if (!UNIVERSITY_VALUES.has(university as University)) {
      throw new Error("university invalida.");
    }

    const result = await generateIdeaDrafts({
      degreeLevel: degreeLevel as DegreeLevel,
      university: university as University,
      program: normalizeOptionalText(payload.program) ?? "Programa de posgrado",
      language:
        normalizeLanguageCode(normalizeOptionalText(payload.language)) ??
        APP_DEFAULT_LANGUAGE,
      templateKey,
      topicAreaId: normalizeOptionalText(payload.topicAreaId) ?? null,
      topicAreaLabel: normalizeOptionalText(payload.topicAreaLabel) ?? null,
      seedText: normalizeOptionalText(payload.seedText) ?? null,
      existingTitles: Array.isArray(payload.existingTitles)
        ? payload.existingTitles.filter((item): item is string => typeof item === "string")
        : [],
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudieron generar ideas.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
