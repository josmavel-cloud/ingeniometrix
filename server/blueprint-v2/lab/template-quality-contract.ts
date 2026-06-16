import type {
  TemplateRuntimeInspectionArtifact,
  TemplateRuntimeInspectionEntry,
} from "@/server/blueprint-v2/lab/template-runtime-inspector";

export type TemplateQualityStatus = "pass" | "warn" | "blocked";

export type TemplateQualityCheck = {
  id: string;
  category:
    | "identity"
    | "selection"
    | "citation"
    | "sections"
    | "matrix"
    | "editorial_rules"
    | "cover"
    | "assets"
    | "provenance";
  label: string;
  status: TemplateQualityStatus;
  message: string;
  expected?: string;
  actual?: string;
};

export type TemplateQualityContractEntry = {
  role: "master" | "institutional";
  status: TemplateQualityStatus;
  template_key: string | null;
  template_version_id: string | null;
  resolved_citation_style: string;
  citation_style_source: "template" | "default";
  can_continue_generation: boolean;
  can_continue_docx_render: boolean;
  blockers: string[];
  warnings: string[];
  checks: TemplateQualityCheck[];
};

export type TemplateQualityContractArtifact = {
  artifact_type: "template_quality_contract";
  artifact_version: "v1";
  generated_at: string;
  read_only: true;
  llm_used: false;
  overall_status: TemplateQualityStatus;
  can_continue_step_8: boolean;
  can_continue_docx_steps: boolean;
  master: TemplateQualityContractEntry;
  institutional: TemplateQualityContractEntry;
  cross_template_checks: TemplateQualityCheck[];
  blockers: string[];
  warnings: string[];
};

const CORE_RESEARCH_PLAN_KEYS = [
  "problem_statement",
  "research_questions",
  "general_objective",
  "specific_objectives",
  "justification",
  "theoretical_framework",
  "methodology",
  "population_and_sample",
  "data_collection_techniques",
  "analysis_plan",
  "consistency_matrix",
  "schedule",
  "references",
] as const;

const RECOMMENDED_RESEARCH_PLAN_KEYS = ["abstract", "keywords"] as const;

const MATRIX_SUPPORT_KEYS = [
  "problem_statement",
  "general_objective",
  "specific_objectives",
  "hypotheses",
  "variables_indicators",
  "methodology",
  "population_and_sample",
  "data_collection_techniques",
] as const;

function combineStatus(statuses: TemplateQualityStatus[]) {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

function buildCheck(input: TemplateQualityCheck): TemplateQualityCheck {
  return input;
}

function isKnownCitationStyle(value: string | null) {
  return Boolean(value && value !== "UNKNOWN");
}

function resolveCitationStyle(entry: TemplateRuntimeInspectionEntry) {
  if (isKnownCitationStyle(entry.identity.citation_style)) {
    return {
      style: entry.identity.citation_style as string,
      source: "template" as const,
    };
  }

  return {
    style: "APA7",
    source: "default" as const,
  };
}

function isSpanishLanguage(value: string | null) {
  const normalized = (value ?? "").toLowerCase().trim();

  return normalized === "es" || normalized === "es-pe" || normalized.includes("spanish");
}

function missingKeys(entry: TemplateRuntimeInspectionEntry, keys: readonly string[]) {
  return keys.filter((key) => !entry.sections.semantic_keys.includes(key));
}

function ruleGroupStatus(entry: TemplateRuntimeInspectionEntry, group: string) {
  return entry.element_rules.groups.find((item) => item.group === group)?.complete ?? false;
}

function buildTemplateChecks(entry: TemplateRuntimeInspectionEntry): TemplateQualityCheck[] {
  const checks: TemplateQualityCheck[] = [];
  const coreMissing = missingKeys(entry, CORE_RESEARCH_PLAN_KEYS);
  const recommendedMissing = missingKeys(entry, RECOMMENDED_RESEARCH_PLAN_KEYS);
  const matrixMissing = missingKeys(entry, MATRIX_SUPPORT_KEYS);
  const explicitRatio =
    entry.sections.semantic_key_count > 0
      ? entry.sections.explicit_semantic_key_count / entry.sections.semantic_key_count
      : 0;
  const citationResolution = resolveCitationStyle(entry);
  const requiredRuleGroups = ["page", "titles", "paragraph", "reference_list"] as const;
  const usefulRuleGroups = ["table", "figure", "equation", "citation"] as const;
  const missingRequiredRuleGroups = requiredRuleGroups.filter(
    (group) => !ruleGroupStatus(entry, group),
  );
  const missingUsefulRuleGroups = usefulRuleGroups.filter((group) => !ruleGroupStatus(entry, group));

  checks.push(
    buildCheck({
      id: `${entry.role}.runtime_loaded`,
      category: "identity",
      label: "Runtime cargado",
      status: entry.status === "loaded" ? "pass" : "blocked",
      message:
        entry.status === "loaded"
          ? "El runtime se cargo desde la base de datos."
          : entry.error ?? "No se pudo cargar el runtime.",
      expected: "status=loaded",
      actual: entry.status,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.identity_complete`,
      category: "identity",
      label: "Identidad DB completa",
      status:
        entry.identity.template_key && entry.identity.version_id && entry.identity.template_name
          ? "pass"
          : "blocked",
      message:
        entry.identity.template_key && entry.identity.version_id && entry.identity.template_name
          ? "La plantilla tiene key, nombre y version."
          : "Falta key, nombre o version de plantilla.",
      expected: "template_key + template_name + version_id",
      actual: `${entry.identity.template_key ?? "sin key"} / ${
        entry.identity.version_id ?? "sin version"
      }`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.document_kind`,
      category: "identity",
      label: "Tipo de documento",
      status:
        entry.role === "institutional"
          ? entry.identity.document_kind === "THESIS_PLAN_INSTANCE"
            ? "pass"
            : "warn"
          : entry.identity.document_kind === "TEMPLATE_GUIDE" ||
              entry.identity.document_kind === "THESIS_PLAN_INSTANCE"
            ? "pass"
            : "warn",
      message:
        entry.role === "institutional"
          ? "El institucional deberia representar una instancia o formato de plan de tesis."
          : "El Master puede ser guia o plantilla maestra.",
      expected:
        entry.role === "institutional"
          ? "THESIS_PLAN_INSTANCE"
          : "TEMPLATE_GUIDE o THESIS_PLAN_INSTANCE",
      actual: entry.identity.document_kind ?? "sin dato",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.review_status`,
      category: "identity",
      label: "Estado de revision",
      status: entry.identity.review_status === "REVIEWED" ? "pass" : "warn",
      message:
        entry.identity.review_status === "REVIEWED"
          ? "La plantilla esta marcada como revisada."
          : "La plantilla requiere revision humana antes de uso productivo.",
      expected: "REVIEWED",
      actual: entry.identity.review_status ?? "sin dato",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.language`,
      category: "identity",
      label: "Idioma",
      status: isSpanishLanguage(entry.identity.language) ? "pass" : "warn",
      message: isSpanishLanguage(entry.identity.language)
        ? "La plantilla esta en espanol."
        : "El idioma no esta claramente marcado como espanol.",
      expected: "es",
      actual: entry.identity.language ?? "sin dato",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.methodology_mode`,
      category: "identity",
      label: "Modo metodologico",
      status:
        entry.identity.methodology_mode && entry.identity.methodology_mode !== "unknown"
          ? "pass"
          : "warn",
      message:
        entry.identity.methodology_mode && entry.identity.methodology_mode !== "unknown"
          ? "La plantilla declara modo metodologico."
          : "La plantilla no declara un modo metodologico util.",
      expected: "mixed, technical, quantitative o qualitative",
      actual: entry.identity.methodology_mode ?? "sin dato",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.citation_style`,
      category: "citation",
      label: "Estilo de citas",
      status: citationResolution.source === "template" ? "pass" : "warn",
      message:
        citationResolution.source === "template"
          ? "El estilo de citas viene de la plantilla."
          : "No habia estilo de citas confiable; se usara APA7 por defecto.",
      expected: "APA7 u otro estilo soportado",
      actual: `${citationResolution.style} (${citationResolution.source})`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.source_traceability`,
      category: "provenance",
      label: "Fuente de template",
      status: entry.db_payload.source_count > 0 ? "pass" : "warn",
      message:
        entry.db_payload.source_count > 0
          ? "La plantilla conserva fuente en BD."
          : "La plantilla no conserva fuente materializada en BD.",
      expected: ">= 1 source",
      actual: `${entry.db_payload.source_count}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.normalized_document`,
      category: "provenance",
      label: "Documento normalizado",
      status: entry.db_payload.has_normalized_document ? "pass" : "warn",
      message: entry.db_payload.has_normalized_document
        ? "Existe normalizedDocumentJson."
        : "No se encontro normalizedDocumentJson util.",
      expected: "normalizedDocumentJson presente",
      actual: entry.db_payload.has_normalized_document ? "presente" : "ausente",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.semantic_analysis`,
      category: "provenance",
      label: "Analisis semantico",
      status: entry.db_payload.has_semantic_analysis ? "pass" : "warn",
      message: entry.db_payload.has_semantic_analysis
        ? "Existe semanticAnalysisJson."
        : "No hay semanticAnalysisJson; se depende mas de inferencia por titulos.",
      expected: "semanticAnalysisJson presente",
      actual: entry.db_payload.has_semantic_analysis ? "presente" : "ausente",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.section_count`,
      category: "sections",
      label: "Cantidad de secciones",
      status: entry.sections.total >= 10 ? "pass" : "blocked",
      message:
        entry.sections.total >= 10
          ? "La plantilla tiene suficiente estructura seccional."
          : "La plantilla no tiene suficiente estructura seccional.",
      expected: ">= 10 secciones",
      actual: `${entry.sections.total}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.core_section_coverage`,
      category: "sections",
      label: "Cobertura academica minima",
      status: coreMissing.length === 0 ? "pass" : "blocked",
      message:
        coreMissing.length === 0
          ? "La plantilla cubre las secciones academicas centrales."
          : `Faltan secciones centrales: ${coreMissing.join(", ")}.`,
      expected: CORE_RESEARCH_PLAN_KEYS.join(", "),
      actual: `faltantes: ${coreMissing.join(", ") || "ninguno"}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.recommended_section_coverage`,
      category: "sections",
      label: "Secciones recomendadas",
      status: recommendedMissing.length === 0 ? "pass" : "warn",
      message:
        recommendedMissing.length === 0
          ? "La plantilla incluye resumen y palabras clave."
          : `Faltan secciones recomendadas: ${recommendedMissing.join(", ")}.`,
      expected: RECOMMENDED_RESEARCH_PLAN_KEYS.join(", "),
      actual: `faltantes: ${recommendedMissing.join(", ") || "ninguno"}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.semantic_key_source`,
      category: "sections",
      label: "Semantic keys explicitas",
      status: explicitRatio >= 0.5 ? "pass" : "warn",
      message:
        explicitRatio >= 0.5
          ? "La mayor parte del mapeo semantico viene explicito desde el template."
          : "Gran parte del mapeo semantico fue inferido por titulos; sirve para lab, pero debe normalizarse para produccion.",
      expected: ">= 50% explicitas",
      actual: `${entry.sections.explicit_semantic_key_count}/${entry.sections.semantic_key_count}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.consistency_matrix`,
      category: "matrix",
      label: "Matriz de consistencia",
      status: entry.sections.semantic_keys.includes("consistency_matrix") ? "pass" : "blocked",
      message: entry.sections.semantic_keys.includes("consistency_matrix")
        ? "La plantilla soporta matriz de consistencia."
        : "La plantilla no contiene matriz de consistencia.",
      expected: "consistency_matrix",
      actual: entry.sections.semantic_keys.includes("consistency_matrix") ? "presente" : "ausente",
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.matrix_components`,
      category: "matrix",
      label: "Componentes de matriz",
      status: matrixMissing.length <= 1 ? "pass" : "warn",
      message:
        matrixMissing.length <= 1
          ? "La plantilla expone los componentes necesarios para construir una matriz de consistencia institucional."
          : `Faltan varios componentes para una matriz rica: ${matrixMissing.join(", ")}.`,
      expected: MATRIX_SUPPORT_KEYS.join(", "),
      actual: `faltantes: ${matrixMissing.join(", ") || "ninguno"}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.editorial_required_rules`,
      category: "editorial_rules",
      label: "Reglas Word esenciales",
      status: missingRequiredRuleGroups.length === 0 ? "pass" : "blocked",
      message:
        missingRequiredRuleGroups.length === 0
          ? "Las reglas esenciales de Word estan completas."
          : `Faltan reglas esenciales: ${missingRequiredRuleGroups.join(", ")}.`,
      expected: requiredRuleGroups.join(", "),
      actual: `faltantes: ${missingRequiredRuleGroups.join(", ") || "ninguno"}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.editorial_rich_rules`,
      category: "editorial_rules",
      label: "Reglas de contenido enriquecido",
      status: missingUsefulRuleGroups.length === 0 ? "pass" : "warn",
      message:
        missingUsefulRuleGroups.length === 0
          ? "Las reglas para tablas, figuras, ecuaciones y citas estan completas."
          : `Faltan reglas utiles para render rico: ${missingUsefulRuleGroups.join(", ")}.`,
      expected: usefulRuleGroups.join(", "),
      actual: `faltantes: ${missingUsefulRuleGroups.join(", ") || "ninguno"}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.cover_fields`,
      category: "cover",
      label: "Campos de portada",
      status: entry.cover.field_count >= 3 ? "pass" : "warn",
      message:
        entry.cover.field_count >= 3
          ? "La portada trae campos suficientes."
          : "La portada trae pocos campos; el DOCX necesitara fallback editorial.",
      expected: ">= 3 campos",
      actual: `${entry.cover.field_count}`,
    }),
  );

  checks.push(
    buildCheck({
      id: `${entry.role}.template_assets`,
      category: "assets",
      label: "Assets institucionales",
      status:
        entry.role === "institutional"
          ? entry.db_payload.asset_count > 0
            ? "pass"
            : "warn"
          : entry.db_payload.asset_count > 0
            ? "pass"
            : "warn",
      message:
        entry.db_payload.asset_count > 0
          ? "La plantilla conserva assets en BD."
          : "La plantilla no conserva assets; el render usara fallback sin imagen institucional.",
      expected: ">= 1 asset",
      actual: `${entry.db_payload.asset_count}`,
    }),
  );

  return checks;
}

function buildEntryContract(
  entry: TemplateRuntimeInspectionEntry,
): TemplateQualityContractEntry {
  const checks = buildTemplateChecks(entry);
  const status = combineStatus(checks.map((check) => check.status));
  const citationResolution = resolveCitationStyle(entry);
  const blockers = checks
    .filter((check) => check.status === "blocked")
    .map((check) => `${check.label}: ${check.message}`);
  const warnings = checks
    .filter((check) => check.status === "warn")
    .map((check) => `${check.label}: ${check.message}`);

  return {
    role: entry.role,
    status,
    template_key: entry.identity.template_key,
    template_version_id: entry.identity.version_id,
    resolved_citation_style: citationResolution.style,
    citation_style_source: citationResolution.source,
    can_continue_generation: status !== "blocked",
    can_continue_docx_render: status !== "blocked",
    blockers,
    warnings,
    checks,
  };
}

function buildCrossTemplateChecks(
  inspection: TemplateRuntimeInspectionArtifact,
): TemplateQualityCheck[] {
  const institutionalCoreMissing = inspection.comparison.master_required_missing_in_institutional.filter(
    (key) => CORE_RESEARCH_PLAN_KEYS.includes(key as (typeof CORE_RESEARCH_PLAN_KEYS)[number]),
  );

  return [
    buildCheck({
      id: "cross.institutional_not_master",
      category: "selection",
      label: "Institucional distinto al Master",
      status: inspection.comparison.institutional_same_version_as_master ? "blocked" : "pass",
      message: inspection.comparison.institutional_same_version_as_master
        ? "El institucional apunta a la misma version que el Master."
        : "El institucional usa una plantilla diferente al Master.",
      expected: "version institucional distinta",
      actual: inspection.comparison.institutional_same_version_as_master ? "misma version" : "distinta",
    }),
    buildCheck({
      id: "cross.no_generic_fallback",
      category: "selection",
      label: "Sin fallback generico institucional",
      status: inspection.comparison.institutional_uses_generic_fallback ? "blocked" : "pass",
      message: inspection.comparison.institutional_uses_generic_fallback
        ? "El institucional resolvio a fallback generico."
        : "El institucional no usa fallback generico.",
      expected: "template institucional especifico",
      actual: inspection.institutional.resolution.source,
    }),
    buildCheck({
      id: "cross.lab_override_declared",
      category: "selection",
      label: "Override de laboratorio declarado",
      status:
        inspection.institutional.resolution.source === "lab_institutional_example_override"
          ? "warn"
          : "pass",
      message:
        inspection.institutional.resolution.source === "lab_institutional_example_override"
          ? "Se usa PUCP como ejemplo institucional desde BD; no es seleccion productiva UPC."
          : "No se uso override de laboratorio.",
      expected: "sin override en produccion",
      actual: inspection.institutional.resolution.source,
    }),
    buildCheck({
      id: "cross.master_core_coverage_in_institutional",
      category: "sections",
      label: "Cobertura institucional frente al Master",
      status: institutionalCoreMissing.length === 0 ? "pass" : "blocked",
      message:
        institutionalCoreMissing.length === 0
          ? "El institucional cubre las secciones centrales requeridas por el Master."
          : `El institucional no cubre claves centrales del Master: ${institutionalCoreMissing.join(", ")}.`,
      expected: "core keys del Master",
      actual: `faltantes centrales: ${institutionalCoreMissing.join(", ") || "ninguno"}`,
    }),
  ];
}

export function buildTemplateQualityContractArtifact(
  inspection: TemplateRuntimeInspectionArtifact,
): TemplateQualityContractArtifact {
  const master = buildEntryContract(inspection.master);
  const institutional = buildEntryContract(inspection.institutional);
  const crossTemplateChecks = buildCrossTemplateChecks(inspection);
  const overallStatus = combineStatus([
    master.status,
    institutional.status,
    ...crossTemplateChecks.map((check) => check.status),
  ]);
  const blockers = [
    ...master.blockers.map((item) => `Master: ${item}`),
    ...institutional.blockers.map((item) => `Institucional: ${item}`),
    ...crossTemplateChecks
      .filter((check) => check.status === "blocked")
      .map((check) => `${check.label}: ${check.message}`),
  ];
  const warnings = [
    ...master.warnings.map((item) => `Master: ${item}`),
    ...institutional.warnings.map((item) => `Institucional: ${item}`),
    ...crossTemplateChecks
      .filter((check) => check.status === "warn")
      .map((check) => `${check.label}: ${check.message}`),
  ];

  return {
    artifact_type: "template_quality_contract",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    read_only: true,
    llm_used: false,
    overall_status: overallStatus,
    can_continue_step_8: master.can_continue_generation,
    can_continue_docx_steps:
      master.can_continue_docx_render &&
      institutional.can_continue_docx_render &&
      !crossTemplateChecks.some((check) => check.status === "blocked"),
    master,
    institutional,
    cross_template_checks: crossTemplateChecks,
    blockers,
    warnings,
  };
}
