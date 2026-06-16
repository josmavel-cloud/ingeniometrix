import { loadMasterTemplateRuntime } from "@/server/reporting/template-runtime/master-template";

import type {
  MasterTemplateRuntime,
  MasterTemplateSectionRuntime,
} from "@/server/blueprint-v2/types";

type TemplateSectionNode = {
  id?: string | null;
  title?: string | null;
  level?: number | null;
  semantic_key?: string | null;
  required?: boolean | null;
  content_kind?: string | null;
  children?: TemplateSectionNode[];
  guidance?: {
    purpose?: string | null;
    instructions?: string[] | null;
    min_words?: number | null;
    max_words?: number | null;
  } | null;
};

function flattenSections(
  sections: TemplateSectionNode[],
  pathTitles: string[] = [],
): MasterTemplateSectionRuntime[] {
  const flattened: MasterTemplateSectionRuntime[] = [];

  for (const section of sections) {
    const title = section.title?.trim() || "Seccion sin titulo";
    const semanticKey =
      section.semantic_key?.trim() ||
      section.id?.trim() ||
      title.toLowerCase().replace(/\s+/g, "_");
    const nextPath = [...pathTitles, title];

    flattened.push({
      section_id: section.id?.trim() || semanticKey,
      title,
      semantic_key: semanticKey,
      path_titles: nextPath,
      level: section.level ?? nextPath.length,
      content_kind: section.content_kind?.trim() || "rich_text",
      required: Boolean(section.required),
      instructions: section.guidance?.instructions?.filter(Boolean) ?? [],
      purpose: section.guidance?.purpose?.trim() ?? null,
      min_words:
        typeof section.guidance?.min_words === "number" ? section.guidance.min_words : null,
      max_words:
        typeof section.guidance?.max_words === "number" ? section.guidance.max_words : null,
    });

    if (Array.isArray(section.children) && section.children.length > 0) {
      flattened.push(...flattenSections(section.children, nextPath));
    }
  }

  return flattened;
}

export async function loadMasterTemplateRuntimeV2(): Promise<MasterTemplateRuntime> {
  const runtime = await loadMasterTemplateRuntime();
  const validations =
    runtime.templateCandidate.validations &&
    typeof runtime.templateCandidate.validations === "object" &&
    !Array.isArray(runtime.templateCandidate.validations)
      ? (runtime.templateCandidate.validations as Record<string, unknown>)
      : {};
  const requiredSectionKeys = Array.isArray(validations.required_section_keys)
    ? validations.required_section_keys.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : [];

  return {
    template_key: runtime.templateKey,
    template_name: runtime.templateName,
    template_version_id: runtime.versionId,
    methodology_mode: runtime.methodologyMode ?? null,
    citation_style: runtime.citationStyle ?? null,
    required_section_keys: requiredSectionKeys,
    sections: flattenSections(runtime.templateCandidate.sections as TemplateSectionNode[]),
    guidance_notes: [
      ...runtime.runtimeWarnings,
      "La plantilla maestra LATAM es la fuente principal de estructura y de instrucciones de redaccion para el blueprint v2.",
    ],
  };
}
