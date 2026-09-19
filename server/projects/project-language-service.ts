import { normalizeLanguageCode, type SupportedLanguage } from "@/lib/language";
import { prisma } from "@/lib/prisma";

export function resolveProjectContentLanguage(
  value: string | null | undefined,
): SupportedLanguage {
  return normalizeLanguageCode(value) ?? "es";
}

export async function getProjectContentLanguageForUser(
  userId: string,
  projectId: string,
) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    select: {
      language: true,
    },
  });

  if (!project) {
    throw new Error("Proyecto no encontrado.");
  }

  return resolveProjectContentLanguage(project.language);
}
