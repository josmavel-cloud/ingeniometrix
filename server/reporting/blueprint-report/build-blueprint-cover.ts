import type { CanonicalCover } from "@/server/reporting/canonical-report-types";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";
import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";

type CoverFieldValueType = "text" | "person_name" | "date" | "location" | "asset";

type CoverFieldInput = {
  key: string;
  label: string;
  valueType: CoverFieldValueType;
  required: boolean;
  blueprint: ResearchBlueprintRecord;
  runtime: LoadedTemplateVersionRuntime;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTextValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function resolveAssetFallback(input: CoverFieldInput) {
  return input.runtime.templateCandidate.logo_policy.primary_asset_key ?? null;
}

function resolvePlaceholder(input: CoverFieldInput) {
  const key = normalizeKey(input.key);
  const label = normalizeKey(input.label);

  if (input.valueType === "asset") {
    return resolveAssetFallback(input);
  }

  if (
    key.includes("student") ||
    key.includes("author") ||
    key.includes("tesista") ||
    label.includes("estudiante") ||
    label.includes("tesista") ||
    label.includes("autor")
  ) {
    return "Nombre del tesista por completar";
  }

  if (
    key.includes("co_advisor") ||
    key.includes("coadvisor") ||
    key.includes("coasesor") ||
    label.includes("coasesor")
  ) {
    return "Nombre del coasesor por completar";
  }

  if (
    key.includes("advisor") ||
    key.includes("asesor") ||
    label.includes("asesor")
  ) {
    return "Nombre del asesor por completar";
  }

  if (
    key.includes("school") ||
    key.includes("faculty") ||
    key.includes("facultad") ||
    key.includes("program") ||
    key.includes("programa") ||
    label.includes("facultad") ||
    label.includes("escuela")
  ) {
    return "Programa por confirmar";
  }

  if (
    key.includes("place") ||
    key.includes("location") ||
    key.includes("city") ||
    key.includes("date") ||
    key.includes("fecha") ||
    label.includes("lugar") ||
    label.includes("fecha")
  ) {
    return input.valueType === "date"
      ? "Fecha por completar"
      : "Lima, Peru - fecha por completar";
  }

  if (
    key.includes("title") ||
    key.includes("project") ||
    key.includes("thesis") ||
    label.includes("titulo")
  ) {
    return (
      normalizeTextValue(input.blueprint.project_title) ??
      "Titulo del proyecto por completar"
    );
  }

  if (
    key.includes("document") ||
    label.includes("tipo de documento")
  ) {
    return (
      normalizeTextValue(input.runtime.templateCandidate.cover_template.document_label) ??
      "Plan de tesis"
    );
  }

  if (
    key.includes("university") ||
    label.includes("universidad")
  ) {
    return (
      normalizeTextValue(input.runtime.templateCandidate.institution.university_name) ??
      normalizeTextValue(input.blueprint.university) ??
      "Universidad por confirmar"
    );
  }

  return input.required ? "Dato por completar" : null;
}

function buildFallbackValue(input: CoverFieldInput) {
  if (input.valueType === "asset") {
    return resolveAssetFallback(input);
  }

  switch (input.key) {
    case "university_name":
      return (
        normalizeTextValue(input.runtime.templateCandidate.institution.university_name) ??
        normalizeTextValue(input.blueprint.university) ??
        resolvePlaceholder(input)
      );
    case "school_name":
      return (
        normalizeTextValue(input.runtime.templateCandidate.institution.school_name) ??
        resolvePlaceholder(input)
      );
    case "program_name":
      return (
        normalizeTextValue(input.runtime.templateCandidate.institution.program_name) ??
        normalizeTextValue(input.blueprint.program) ??
        resolvePlaceholder(input)
      );
    case "document_label":
      return (
        normalizeTextValue(input.runtime.templateCandidate.cover_template.document_label) ??
        "Plan de tesis"
      );
    case "project_title":
    case "thesis_title":
      return normalizeTextValue(input.blueprint.project_title) ?? resolvePlaceholder(input);
    default:
      return resolvePlaceholder(input);
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
      label: field.label,
      valueType: field.value_type,
      required: field.required,
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
