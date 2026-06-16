import type { ProjectTemplateKey } from "@/lib/peru-universities";

export const SYSTEM_MASTER_TEMPLATE_ALIAS = "SYSTEM_MASTER";
export const SYSTEM_MASTER_TEMPLATE_KEY: ProjectTemplateKey = "GENERIC_POSGRADO_PE";

const KNOWN_TEMPLATE_KEYS = new Set<ProjectTemplateKey>([
  "UPC_POSGRADO",
  "UCV_POSGRADO",
  "USMP_POSGRADO",
  "GENERIC_POSGRADO_PE",
]);

export function resolveTemplateKeyForMvp(
  value: unknown,
): ProjectTemplateKey {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === SYSTEM_MASTER_TEMPLATE_ALIAS
  ) {
    return SYSTEM_MASTER_TEMPLATE_KEY;
  }

  if (typeof value !== "string" || !KNOWN_TEMPLATE_KEYS.has(value as ProjectTemplateKey)) {
    throw new Error("templateKey invalida.");
  }

  return value as ProjectTemplateKey;
}

export function getTemplateDisplayLabel(templateKey: string | null | undefined) {
  return templateKey === SYSTEM_MASTER_TEMPLATE_KEY
    ? SYSTEM_MASTER_TEMPLATE_ALIAS
    : (templateKey ?? SYSTEM_MASTER_TEMPLATE_ALIAS);
}
