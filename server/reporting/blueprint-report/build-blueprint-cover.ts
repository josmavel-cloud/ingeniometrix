import type { CanonicalCover } from "@/server/reporting/canonical-report-types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";

function buildFallbackValue(input: {
  key: string;
  blueprint: ResearchBlueprintRecord;
  runtime: LoadedTemplateVersionRuntime;
}) {
  switch (input.key) {
    case "institution_logo":
      return input.runtime.templateCandidate.logo_policy.primary_asset_key ?? null;
    case "university_name":
      return input.runtime.templateCandidate.institution.university_name ?? input.blueprint.university;
    case "school_name":
      return input.runtime.templateCandidate.institution.school_name ?? null;
    case "program_name":
      return input.runtime.templateCandidate.institution.program_name ?? input.blueprint.program;
    case "document_label":
      return input.runtime.templateCandidate.cover_template.document_label ?? "Plan de tesis";
    case "project_title":
    case "thesis_title":
      return input.blueprint.project_title;
    default:
      return null;
  }
}

export function buildBlueprintCover(input: {
  blueprint: ResearchBlueprintRecord;
  runtime: LoadedTemplateVersionRuntime;
}) {
  const fields = input.runtime.templateCandidate.cover_template.fields.map((field) => ({
    key: field.key,
    label: field.label,
    value_type: field.value_type,
    value: buildFallbackValue({
      key: field.key,
      blueprint: input.blueprint,
      runtime: input.runtime,
    }),
  }));

  return {
    document_label:
      input.runtime.templateCandidate.cover_template.document_label ??
      "Plan de tesis",
    fields,
  } satisfies CanonicalCover;
}
