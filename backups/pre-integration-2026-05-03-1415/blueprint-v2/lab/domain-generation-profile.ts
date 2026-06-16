import type { DomainGenerationProfile, EvidenceLedger, MasterBlueprintEngineProject } from "@/server/blueprint-v2/types";
import type { MasterTemplateImportContextArtifact } from "@/server/blueprint-v2/lab/template-import-context";

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function resolveDomainGenerationProfile(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  templateImportContext?: MasterTemplateImportContextArtifact | null;
}): DomainGenerationProfile {
  const joinedContext = [
    input.templateImportContext?.imported_project_context.knowledge_area_label ?? "",
    input.project.intake.topic,
    input.project.intake.problemContext ?? "",
    input.project.intake.researchLine ?? "",
    input.project.intake.preferredMethodology ?? "",
    input.project.intake.availableData ?? "",
    input.templateImportContext?.proposal_context.method_candidate?.method_family ?? "",
    input.templateImportContext?.proposal_context.framework_candidate?.core_framework ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const equationCount = input.evidenceLedger.assets.filter((asset) => asset.kind === "equation").length;
  const tableCount = input.evidenceLedger.assets.filter((asset) => asset.kind === "table").length;
  const imageCount = input.evidenceLedger.assets.filter((asset) => asset.kind === "image").length;

  const domainFamily = includesAny(joinedContext, [/architect/i, /urban/i, /adaptive reuse/i, /housing/i, /regener/i])
    ? "arquitectura_urbanismo"
    : includesAny(joinedContext, [/ingenier/i, /control/i, /estructura/i, /sism/i, /algorithm/i, /modela/i, /simulation/i])
      ? "ingenieria_tecnica"
      : includesAny(joinedContext, [/salud/i, /clinical/i, /hospital/i, /patient/i, /diagnos/i, /medic/i])
        ? "salud_clinica"
        : includesAny(joinedContext, [/social/i, /community/i, /policy/i, /govern/i, /municip/i])
          ? "ciencias_sociales"
          : includesAny(joinedContext, [/educa/i, /school/i, /learning/i, /pedagog/i])
            ? "educacion"
            : includesAny(joinedContext, [/business/i, /market/i, /management/i, /operat/i, /productiv/i, /finance/i])
              ? "negocios_gestion"
              : includesAny(joinedContext, [/normativ/i, /regulator/i, /legal/i, /contratacion/i, /doctrin/i, /public procurement/i])
                ? "derecho_politica_publica"
                : "general";

  const evidenceStyle = includesAny(joinedContext, [/normativ/i, /regulator/i, /legal/i, /code/i, /zoning/i])
    ? "normative"
    : equationCount > 0 || includesAny(joinedContext, [/control/i, /simulation/i, /design/i, /dynamic/i, /technical/i])
      ? "technical"
      : includesAny(joinedContext, [/survey/i, /sample/i, /interview/i, /case study/i, /comparative/i, /empir/i])
        ? "empirical"
        : includesAny(joinedContext, [/theor/i, /concept/i, /framework/i])
          ? "conceptual"
          : "mixed";

  const preferredOutputModes = uniqueStrings([
    "narrative",
    evidenceStyle === "empirical" ? "comparative" : null,
    tableCount > 0 || includesAny(joinedContext, [/criteria/i, /multicriter/i, /framework/i])
      ? "criteria_table"
      : null,
    equationCount > 0 ? "equation_supported" : null,
    imageCount > 0 ? "figure_supported" : null,
    includesAny(joinedContext, [/algorithm/i, /control/i, /software/i, /iot/i])
      ? "code_or_algorithm"
      : null,
    evidenceStyle === "normative" ? "normative_matrix" : null,
  ]) as DomainGenerationProfile["preferred_output_modes"];

  const reasoning = uniqueStrings([
    `domain_family inferido: ${domainFamily}`,
    `evidence_style inferido: ${evidenceStyle}`,
    equationCount > 0 ? `assets con ecuaciones: ${equationCount}` : null,
    tableCount > 0 ? `assets con tablas: ${tableCount}` : null,
    imageCount > 0 ? `assets con imagenes: ${imageCount}` : null,
  ]);

  return {
    domain_family: domainFamily,
    evidence_style: evidenceStyle,
    preferred_output_modes: preferredOutputModes,
    reasoning,
  };
}
