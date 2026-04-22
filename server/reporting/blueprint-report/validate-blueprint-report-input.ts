import type { LoadedTemplateVersionRuntime } from "@/server/reporting/template-runtime/load-template-version";
import type { ResearchBlueprintRecord } from "@/server/blueprint/blueprint-types";

export function validateBlueprintReportInput(input: {
  runtime: LoadedTemplateVersionRuntime;
  blueprint: ResearchBlueprintRecord;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.blueprint.project_title?.trim()) {
    errors.push("El blueprint no contiene project_title.");
  }

  if (!input.blueprint.general_objective?.trim()) {
    errors.push("El blueprint no contiene general_objective.");
  }

  if (!Array.isArray(input.blueprint.references_used) || input.blueprint.references_used.length === 0) {
    errors.push("El blueprint no contiene references_used trazables.");
  }

  if (!Array.isArray(input.runtime.templateCandidate.sections) || input.runtime.templateCandidate.sections.length === 0) {
    errors.push("La plantilla cargada no contiene secciones para construir el documento canónico.");
  }

  if (!input.blueprint.template_context?.template_key) {
    warnings.push("El blueprint no trae template_context completo; se continuara con la plantilla runtime cargada.");
  }

  if (!Array.isArray(input.blueprint.citation_plan) || input.blueprint.citation_plan.length === 0) {
    warnings.push("El blueprint no trae citation_plan; varias secciones pueden quedar con trazabilidad reducida en el reporte.");
  }

  if (!Array.isArray(input.blueprint.reference_insights) || input.blueprint.reference_insights.length === 0) {
    warnings.push("El blueprint no trae reference_insights; no se poblaran antecedentes derivados de referencias.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
