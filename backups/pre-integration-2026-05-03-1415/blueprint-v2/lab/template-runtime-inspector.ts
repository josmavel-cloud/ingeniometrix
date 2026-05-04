import { MASTER_TEMPLATE_LATAM_KEY } from "@/server/reporting/template-runtime/master-template";
import {
  loadTemplateVersionRuntime,
  type LoadedTemplateVersionRuntime,
} from "@/server/reporting/template-runtime/load-template-version";
import { resolveBlueprintTemplateRuntime } from "@/server/reporting/template-runtime/resolve-blueprint-template-runtime";
import type { TemplateCandidateSection } from "@/server/reporting/template-ingestion-types";
import type { LoadedMasterBlueprintLabFixtureSet } from "@/server/blueprint-v2/lab/types";

type TemplateRuntimeRole = "master" | "institutional";
type TemplateRuntimeInspectionStatus = "loaded" | "failed";

type SectionPreview = {
  semantic_key: string | null;
  title: string;
  level: number;
  required: boolean;
  content_kind: string;
  path: string[];
};

type RuleGroupStatus = {
  group: string;
  complete: boolean;
  summary: string;
};

export type TemplateRuntimeInspectionEntry = {
  role: TemplateRuntimeRole;
  status: TemplateRuntimeInspectionStatus;
  requested: Record<string, string | null>;
  resolution: {
    source:
      | "template_key_exact"
      | "ranked_match"
      | "template_hint"
      | "generic_fallback"
      | "lab_institutional_example_override"
      | "failed";
    selected_template_version_id: string | null;
    selected_template_key: string | null;
    selected_template_name: string | null;
    selected_score: number | null;
    guidance_notes: string[];
  };
  identity: {
    template_id: string | null;
    template_key: string | null;
    template_name: string | null;
    version_id: string | null;
    version_number: number | null;
    language: string | null;
    methodology_mode: string | null;
    citation_style: string | null;
    document_kind: string | null;
    review_status: string | null;
    template_family: string | null;
    university_name: string | null;
    program_name: string | null;
    degree_level: string | null;
  };
  db_payload: {
    has_normalized_document: boolean;
    has_semantic_analysis: boolean;
    source_count: number;
    asset_count: number;
    source_ids: string[];
    asset_keys: string[];
  };
  cover: {
    document_label: string | null;
    field_count: number;
    required_field_count: number;
    logo_strategy: string | null;
    primary_asset_key: string | null;
    normalized_logo_asset_key: string | null;
  };
  sections: {
    total: number;
    required: number;
    semantic_key_count: number;
    explicit_semantic_key_count: number;
    required_section_keys: string[];
    semantic_keys: string[];
    explicit_semantic_keys_sample: string[];
    semantic_keys_sample: string[];
    missing_minimum_semantic_keys: string[];
    preview: SectionPreview[];
  };
  element_rules: {
    profile_key: string | null;
    complete_group_count: number;
    groups: RuleGroupStatus[];
  };
  assets: Array<{
    id: string;
    asset_key: string;
    kind: string;
    source_strategy: string;
    file_name: string | null;
    stored_file_path: string | null;
    mime_type: string | null;
    width_px: number | null;
    height_px: number | null;
    has_binary_payload: boolean;
  }>;
  sources: Array<{
    id: string;
    source_id: string;
    source_type: string;
    document_kind: string;
    file_name: string | null;
    stored_file_path: string | null;
    mime_type: string | null;
    has_binary_payload: boolean;
  }>;
  warnings: string[];
  error: string | null;
};

export type TemplateRuntimeInspectionArtifact = {
  artifact_type: "template_runtime_inspection";
  artifact_version: "v1";
  generated_at: string;
  read_only: true;
  llm_used: false;
  fixture_case: string;
  project_context: {
    project_id: string;
    title: string;
    university: string;
    template_key: string;
    degree_level: string;
    program: string;
  };
  master: TemplateRuntimeInspectionEntry;
  institutional: TemplateRuntimeInspectionEntry;
  comparison: {
    institutional_same_version_as_master: boolean;
    institutional_uses_generic_fallback: boolean;
    semantic_overlap_count: number;
    master_required_missing_in_institutional: string[];
    institutional_extra_semantic_keys_sample: string[];
  };
  warnings: string[];
};

const MINIMUM_RESEARCH_PLAN_SEMANTIC_KEYS = [
  "abstract",
  "keywords",
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

const LAB_INSTITUTIONAL_EXAMPLE_TEMPLATE_KEYS = [
  "PONTIFICIA_UNIVERSIDAD_CATOLICA_DEL_PERU_MAESTRIA_INGENIERIA_CIVIL",
] as const;

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Fallo no identificado.";
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function hasObjectPayload(value: unknown) {
  return typeof value === "object" && value !== null;
}

function normalizeForTitleMatch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSemanticKeyFromTitle(title: string) {
  const normalized = normalizeForTitleMatch(title);

  if (!normalized) return null;
  if (/palabras clave|keywords/.test(normalized)) return "keywords";
  if (/resumen|abstract/.test(normalized)) return "abstract";
  if (/titulo tentativo|titulo de/.test(normalized)) return "title";
  if (/area de investigacion/.test(normalized)) return "research_area";
  if (/linea de investigacion/.test(normalized)) return "research_line";
  if (/planteamiento del problema/.test(normalized)) return "problem_statement";
  if (/formulacion del problema/.test(normalized)) return "research_questions";
  if (/problema general/.test(normalized)) return "general_research_question";
  if (/problemas especificos|interrogantes especificas/.test(normalized)) {
    return "specific_research_questions";
  }
  if (/objetivos de la investigacion/.test(normalized)) return "objectives";
  if (/objetivo general/.test(normalized)) return "general_objective";
  if (/objetivos especificos/.test(normalized)) return "specific_objectives";
  if (/hipotesis general/.test(normalized)) return "general_hypothesis";
  if (/hipotesis especificas/.test(normalized)) return "specific_hypotheses";
  if (/hipotesis/.test(normalized)) return "hypotheses";
  if (/variables e indicadores|variables indicadores|operacionalizacion de variables/.test(normalized)) {
    return "variables_indicators";
  }
  if (/marco teorico/.test(normalized)) return "theoretical_framework";
  if (/antecedentes/.test(normalized)) return "research_antecedents";
  if (/bases teoricas/.test(normalized)) return "theoretical_bases";
  if (/definicion de conceptos|conceptos basicos|definicion de terminos/.test(normalized)) {
    return "terms_definition";
  }
  if (/justificacion/.test(normalized)) return "justification";
  if (/metodologia/.test(normalized)) return "methodology";
  if (/tipo de investigacion|nivel de investigacion|enfoque/.test(normalized)) {
    return "methodological_approach";
  }
  if (/diseno de investigacion/.test(normalized)) return "research_design";
  if (/poblacion|muestra/.test(normalized)) return "population_and_sample";
  if (/tecnicas de recoleccion|recoleccion de datos/.test(normalized)) {
    return "data_collection_techniques";
  }
  if (/validacion del instrumento|instrumento/.test(normalized)) return "research_instruments";
  if (/analisis de datos|procesamiento de datos|estadistica inferencial/.test(normalized)) {
    return "analysis_plan";
  }
  if (/cronograma|plan de acciones/.test(normalized)) return "schedule";
  if (/presupuesto|financiamiento/.test(normalized)) return "budget";
  if (/referencias|bibliografia/.test(normalized)) return "references";
  if (/matriz de consistencia/.test(normalized)) return "consistency_matrix";
  if (/apendice|anexo/.test(normalized)) return "annexes";

  return null;
}

function collectExplicitSemanticKeys(sections: TemplateCandidateSection[] | undefined) {
  const keys: string[] = [];

  for (const section of sections ?? []) {
    if (section.semantic_key?.trim()) {
      keys.push(section.semantic_key.trim());
    }

    keys.push(...collectExplicitSemanticKeys(section.children));
  }

  return keys;
}

function collectCandidateSections(
  sections: TemplateCandidateSection[] | undefined,
  path: string[] = [],
): SectionPreview[] {
  const output: SectionPreview[] = [];

  for (const section of sections ?? []) {
    const title = section.title?.trim() || "Seccion sin titulo";
    const nextPath = [...path, title];

    output.push({
      semantic_key: section.semantic_key?.trim() || inferSemanticKeyFromTitle(title),
      title,
      level: section.level,
      required: Boolean(section.required),
      content_kind: section.content_kind,
      path: nextPath,
    });

    output.push(...collectCandidateSections(section.children, nextPath));
  }

  return output;
}

function summarizeRuleGroups(runtime: LoadedTemplateVersionRuntime): RuleGroupStatus[] {
  const rules = runtime.effectiveElementRules;

  return [
    {
      group: "page",
      complete:
        Boolean(rules.page.paper_size) &&
        Number.isFinite(rules.page.margin_left_cm) &&
        Number.isFinite(rules.page.margin_right_cm) &&
        Number.isFinite(rules.page.margin_top_cm) &&
        Number.isFinite(rules.page.margin_bottom_cm),
      summary: `${rules.page.paper_size}, margenes ${rules.page.margin_left_cm}/${rules.page.margin_right_cm}/${rules.page.margin_top_cm}/${rules.page.margin_bottom_cm} cm`,
    },
    {
      group: "titles",
      complete: rules.titles.length > 0,
      summary: `${rules.titles.length} niveles configurados`,
    },
    {
      group: "paragraph",
      complete:
        Boolean(rules.paragraph.font_family) &&
        Number.isFinite(rules.paragraph.font_size_pt) &&
        Number.isFinite(rules.paragraph.line_spacing) &&
        Boolean(rules.paragraph.alignment),
      summary: `${rules.paragraph.font_family} ${rules.paragraph.font_size_pt} pt, interlineado ${rules.paragraph.line_spacing}, ${rules.paragraph.alignment}`,
    },
    {
      group: "table",
      complete: Boolean(rules.table.caption_position) && Boolean(rules.table.label),
      summary: `${rules.table.label}, caption ${rules.table.caption_position}, fuente requerida ${rules.table.source_note_required ? "si" : "no"}`,
    },
    {
      group: "figure",
      complete: Boolean(rules.figure.caption_position) && Boolean(rules.figure.label),
      summary: `${rules.figure.label}, caption ${rules.figure.caption_position}, fuente requerida ${rules.figure.source_note_required ? "si" : "no"}`,
    },
    {
      group: "equation",
      complete: Boolean(rules.equation.alignment) && Boolean(rules.equation.label_prefix),
      summary: `${rules.equation.label_prefix}, ${rules.equation.alignment}, numeracion ${rules.equation.numbering ? "si" : "no"}`,
    },
    {
      group: "citation",
      complete: Boolean(rules.citation.inline_style),
      summary: `${rules.citation.inline_style}, numeracion ${rules.citation.numbering ? "si" : "no"}`,
    },
    {
      group: "reference_list",
      complete:
        Boolean(rules.reference_list.heading_title) &&
        Boolean(rules.reference_list.ordering) &&
        Boolean(rules.reference_list.doi_policy),
      summary: `${rules.reference_list.heading_title}, ${rules.reference_list.ordering}, DOI ${rules.reference_list.doi_policy}`,
    },
  ];
}

function emptyEntry(input: {
  role: TemplateRuntimeRole;
  requested: Record<string, string | null>;
  error: string;
}): TemplateRuntimeInspectionEntry {
  return {
    role: input.role,
    status: "failed",
    requested: input.requested,
    resolution: {
      source: "failed",
      selected_template_version_id: null,
      selected_template_key: null,
      selected_template_name: null,
      selected_score: null,
      guidance_notes: [],
    },
    identity: {
      template_id: null,
      template_key: null,
      template_name: null,
      version_id: null,
      version_number: null,
      language: null,
      methodology_mode: null,
      citation_style: null,
      document_kind: null,
      review_status: null,
      template_family: null,
      university_name: null,
      program_name: null,
      degree_level: null,
    },
    db_payload: {
      has_normalized_document: false,
      has_semantic_analysis: false,
      source_count: 0,
      asset_count: 0,
      source_ids: [],
      asset_keys: [],
    },
    cover: {
      document_label: null,
      field_count: 0,
      required_field_count: 0,
      logo_strategy: null,
      primary_asset_key: null,
      normalized_logo_asset_key: null,
    },
    sections: {
      total: 0,
      required: 0,
      semantic_key_count: 0,
      explicit_semantic_key_count: 0,
      required_section_keys: [],
      semantic_keys: [],
      explicit_semantic_keys_sample: [],
      semantic_keys_sample: [],
      missing_minimum_semantic_keys: [...MINIMUM_RESEARCH_PLAN_SEMANTIC_KEYS],
      preview: [],
    },
    element_rules: {
      profile_key: null,
      complete_group_count: 0,
      groups: [],
    },
    assets: [],
    sources: [],
    warnings: [input.error],
    error: input.error,
  };
}

function summarizeRuntime(input: {
  role: TemplateRuntimeRole;
  requested: Record<string, string | null>;
  runtime: LoadedTemplateVersionRuntime;
  resolution: TemplateRuntimeInspectionEntry["resolution"];
}): TemplateRuntimeInspectionEntry {
  const sectionPreview = collectCandidateSections(input.runtime.templateCandidate.sections);
  const semanticKeys = unique(sectionPreview.map((section) => section.semantic_key));
  const explicitSectionKeys = unique(
    collectExplicitSemanticKeys(input.runtime.templateCandidate.sections),
  );
  const requiredSectionKeys = unique(
    input.runtime.templateCandidate.validations?.required_section_keys ?? [],
  );
  const ruleGroups = summarizeRuleGroups(input.runtime);
  const normalizedLogoAssetKey =
    input.runtime.normalizedDocument.cover?.logo_asset_key?.trim() || null;

  return {
    role: input.role,
    status: "loaded",
    requested: input.requested,
    resolution: input.resolution,
    identity: {
      template_id: input.runtime.templateId,
      template_key: input.runtime.templateKey,
      template_name: input.runtime.templateName,
      version_id: input.runtime.versionId,
      version_number: input.runtime.versionNumber,
      language: input.runtime.language,
      methodology_mode: input.runtime.methodologyMode,
      citation_style: input.runtime.citationStyle,
      document_kind: input.runtime.documentKind,
      review_status: input.runtime.reviewStatus,
      template_family: input.runtime.templateCandidate.template_family ?? null,
      university_name:
        input.runtime.templateCandidate.institution?.university_name ??
        input.runtime.normalizedDocument.institution?.university_name ??
        null,
      program_name:
        input.runtime.templateCandidate.institution?.program_name ??
        input.runtime.normalizedDocument.institution?.program_name ??
        null,
      degree_level:
        input.runtime.templateCandidate.institution?.degree_level ??
        input.runtime.normalizedDocument.institution?.degree_level ??
        null,
    },
    db_payload: {
      has_normalized_document: hasObjectPayload(input.runtime.normalizedDocument),
      has_semantic_analysis: hasObjectPayload(input.runtime.semanticAnalysis),
      source_count: input.runtime.sources.length,
      asset_count: input.runtime.assets.length,
      source_ids: input.runtime.sources.map((source) => source.sourceId),
      asset_keys: input.runtime.assets.map((asset) => asset.assetKey),
    },
    cover: {
      document_label: input.runtime.templateCandidate.cover_template?.document_label ?? null,
      field_count: input.runtime.templateCandidate.cover_template?.fields?.length ?? 0,
      required_field_count:
        input.runtime.templateCandidate.cover_template?.fields?.filter((field) => field.required)
          .length ?? 0,
      logo_strategy: input.runtime.templateCandidate.logo_policy?.strategy ?? null,
      primary_asset_key: input.runtime.templateCandidate.logo_policy?.primary_asset_key ?? null,
      normalized_logo_asset_key: normalizedLogoAssetKey,
    },
    sections: {
      total: sectionPreview.length,
      required: sectionPreview.filter((section) => section.required).length,
      semantic_key_count: semanticKeys.length,
      explicit_semantic_key_count: explicitSectionKeys.length,
      required_section_keys: requiredSectionKeys,
      semantic_keys: semanticKeys,
      explicit_semantic_keys_sample: explicitSectionKeys.slice(0, 40),
      semantic_keys_sample: semanticKeys.slice(0, 40),
      missing_minimum_semantic_keys: MINIMUM_RESEARCH_PLAN_SEMANTIC_KEYS.filter(
        (key) => !semanticKeys.includes(key),
      ),
      preview: sectionPreview.slice(0, 40),
    },
    element_rules: {
      profile_key: input.runtime.effectiveEditorialProfileKey,
      complete_group_count: ruleGroups.filter((group) => group.complete).length,
      groups: ruleGroups,
    },
    assets: input.runtime.assets.slice(0, 30).map((asset) => ({
      id: asset.id,
      asset_key: asset.assetKey,
      kind: asset.kind,
      source_strategy: asset.sourceStrategy,
      file_name: asset.fileName,
      stored_file_path: asset.storedFilePath,
      mime_type: asset.mimeType,
      width_px: asset.widthPx,
      height_px: asset.heightPx,
      has_binary_payload: Boolean(asset.fileBase64),
    })),
    sources: input.runtime.sources.slice(0, 30).map((source) => ({
      id: source.id,
      source_id: source.sourceId,
      source_type: source.sourceType,
      document_kind: source.documentKind,
      file_name: source.fileName,
      stored_file_path: source.storedFilePath,
      mime_type: source.mimeType,
      has_binary_payload: Boolean(source.fileBase64),
    })),
    warnings: unique([
      ...input.runtime.runtimeWarnings,
      ...(input.runtime.templateCandidate.warnings ?? []),
      ...(input.runtime.normalizedDocument.warnings ?? []),
    ]),
    error: null,
  };
}

async function inspectMasterRuntime(): Promise<TemplateRuntimeInspectionEntry> {
  const requested = {
    template_key: MASTER_TEMPLATE_LATAM_KEY,
  };

  try {
    const runtime = await loadTemplateVersionRuntime({
      templateKey: MASTER_TEMPLATE_LATAM_KEY,
    });

    return summarizeRuntime({
      role: "master",
      requested,
      runtime,
      resolution: {
        source: "template_key_exact",
        selected_template_version_id: runtime.versionId,
        selected_template_key: runtime.templateKey,
        selected_template_name: runtime.templateName,
        selected_score: null,
        guidance_notes: [],
      },
    });
  } catch (error) {
    return emptyEntry({
      role: "master",
      requested,
      error: asErrorMessage(error),
    });
  }
}

function shouldUseLabInstitutionalExample(runtime: LoadedTemplateVersionRuntime) {
  if (runtime.templateKey === MASTER_TEMPLATE_LATAM_KEY) {
    return true;
  }

  if (runtime.documentKind !== "THESIS_PLAN_INSTANCE") {
    return true;
  }

  return false;
}

function isUsableInstitutionalExample(runtime: LoadedTemplateVersionRuntime) {
  const sections = collectCandidateSections(runtime.templateCandidate.sections);
  const semanticKeys = unique(sections.map((section) => section.semantic_key));
  const missing = MINIMUM_RESEARCH_PLAN_SEMANTIC_KEYS.filter(
    (key) => !semanticKeys.includes(key),
  );

  return (
    runtime.templateKey !== MASTER_TEMPLATE_LATAM_KEY &&
    runtime.documentKind === "THESIS_PLAN_INSTANCE" &&
    runtime.reviewStatus === "REVIEWED" &&
    runtime.citationStyle !== "UNKNOWN" &&
    sections.length >= 25 &&
    runtime.sources.length > 0 &&
    runtime.assets.length > 0 &&
    missing.length <= 4
  );
}

async function loadLabInstitutionalExampleRuntime() {
  for (const templateKey of LAB_INSTITUTIONAL_EXAMPLE_TEMPLATE_KEYS) {
    try {
      const runtime = await loadTemplateVersionRuntime({ templateKey });

      if (isUsableInstitutionalExample(runtime)) {
        return runtime;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function inspectInstitutionalRuntime(
  fixtures: LoadedMasterBlueprintLabFixtureSet,
): Promise<TemplateRuntimeInspectionEntry> {
  const requested = {
    project_template_key: fixtures.project.templateKey,
    project_university: fixtures.project.university,
    project_degree_level: fixtures.project.degreeLevel,
    project_program: fixtures.project.program,
  };

  try {
    const resolved = await resolveBlueprintTemplateRuntime({
      projectTemplateKey: fixtures.project.templateKey,
      projectUniversity: fixtures.project.university,
      projectDegreeLevel: fixtures.project.degreeLevel,
      projectProgram: fixtures.project.program,
    });
    const shouldUseExample = shouldUseLabInstitutionalExample(resolved.runtime);
    const exampleRuntime = shouldUseExample ? await loadLabInstitutionalExampleRuntime() : null;

    if (exampleRuntime) {
      return summarizeRuntime({
        role: "institutional",
        requested: {
          ...requested,
          lab_example_template_key: exampleRuntime.templateKey,
          original_resolved_template_key: resolved.runtime.templateKey,
        },
        runtime: exampleRuntime,
        resolution: {
          source: "lab_institutional_example_override",
          selected_template_version_id: exampleRuntime.versionId,
          selected_template_key: exampleRuntime.templateKey,
          selected_template_name: exampleRuntime.templateName,
          selected_score: resolved.resolution.selectedScore,
          guidance_notes: [
            `El resolver del intake selecciono ${resolved.runtime.templateKey}; para este lab se usa una plantilla institucional completa de BD como ejemplo controlado.`,
            ...resolved.resolution.guidanceNotes,
          ],
        },
      });
    }

    return summarizeRuntime({
      role: "institutional",
      requested,
      runtime: resolved.runtime,
      resolution: {
        source: resolved.resolution.source,
        selected_template_version_id: resolved.resolution.selectedTemplateVersionId,
        selected_template_key: resolved.resolution.selectedTemplateKey,
        selected_template_name: resolved.resolution.selectedTemplateName,
        selected_score: resolved.resolution.selectedScore,
        guidance_notes: resolved.resolution.guidanceNotes,
      },
    });
  } catch (error) {
    return emptyEntry({
      role: "institutional",
      requested,
      error: asErrorMessage(error),
    });
  }
}

function compareTemplateRuntimes(input: {
  master: TemplateRuntimeInspectionEntry;
  institutional: TemplateRuntimeInspectionEntry;
}): TemplateRuntimeInspectionArtifact["comparison"] {
  const institutionalSemanticKeys = input.institutional.sections.semantic_keys;
  const masterAllSemanticKeys = input.master.sections.semantic_keys;
  const institutionalKeySet = new Set(institutionalSemanticKeys);
  const masterRequired =
    input.master.sections.required_section_keys.length > 0
      ? input.master.sections.required_section_keys
      : masterAllSemanticKeys;

  return {
    institutional_same_version_as_master:
      Boolean(input.master.identity.version_id) &&
      input.master.identity.version_id === input.institutional.identity.version_id,
    institutional_uses_generic_fallback:
      input.institutional.resolution.source === "generic_fallback",
    semantic_overlap_count: masterAllSemanticKeys.filter((key) => institutionalKeySet.has(key)).length,
    master_required_missing_in_institutional: masterRequired.filter(
      (key) => !institutionalKeySet.has(key),
    ),
    institutional_extra_semantic_keys_sample: institutionalSemanticKeys
      .filter((key) => !masterAllSemanticKeys.includes(key))
      .slice(0, 20),
  };
}

export async function buildTemplateRuntimeInspectionArtifact(
  fixtures: LoadedMasterBlueprintLabFixtureSet,
): Promise<TemplateRuntimeInspectionArtifact> {
  const [master, institutional] = await Promise.all([
    inspectMasterRuntime(),
    inspectInstitutionalRuntime(fixtures),
  ]);
  const comparison = compareTemplateRuntimes({ master, institutional });
  const warnings = unique([
    ...(master.status === "failed" ? [`No se pudo cargar el template Master: ${master.error}`] : []),
    ...(institutional.status === "failed"
      ? [`No se pudo cargar el template institucional: ${institutional.error}`]
      : []),
    ...(comparison.institutional_uses_generic_fallback
      ? [
          "El runtime institucional resolvio a fallback generico; antes del DOCX institucional hay que declarar o corregir esta decision.",
        ]
      : []),
    ...(institutional.resolution.source === "lab_institutional_example_override"
      ? [
          "El runtime institucional usa un override de laboratorio con una plantilla institucional completa de BD; no representa aun una seleccion UPC productiva.",
        ]
      : []),
    ...(comparison.institutional_same_version_as_master
      ? [
          "El runtime institucional apunta a la misma version que el Master; revisar si es intencional o si falta plantilla institucional.",
        ]
      : []),
  ]);

  return {
    artifact_type: "template_runtime_inspection",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    read_only: true,
    llm_used: false,
    fixture_case: fixtures.caseName,
    project_context: {
      project_id: fixtures.project.id,
      title: fixtures.project.title,
      university: fixtures.project.university,
      template_key: fixtures.project.templateKey,
      degree_level: fixtures.project.degreeLevel,
      program: fixtures.project.program,
    },
    master,
    institutional,
    comparison,
    warnings,
  };
}
