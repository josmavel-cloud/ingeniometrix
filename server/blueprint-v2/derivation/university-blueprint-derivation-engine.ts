import { getConfiguredLlmProvider } from "@/llm";
import type { TextGenerationResult } from "@/llm/provider";
import { normalizeLanguageCode } from "@/lib/language";
import type {
  MasterBlueprintEngineProject,
  MasterSectionDraft,
  UniversityBlueprintBrandingAsset,
  UniversityBlueprintPackage,
  UniversityBlueprintReductionPlan,
  UniversityBlueprintSection,
} from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";
import { resolveBlueprintTemplateRuntime } from "@/server/reporting/template-runtime/resolve-blueprint-template-runtime";

type TemplateSectionNode = {
  title?: string | null;
  semantic_key?: string | null;
  children?: TemplateSectionNode[];
};

type TemplateSectionEntry = {
  title: string;
  semanticKey: string;
  level: number;
  pathTitles: string[];
  parentSemanticKey: string | null;
  childSemanticKeys: string[];
};

type SectionMapping = {
  entry: TemplateSectionEntry;
  selectedDrafts: MasterSectionDraft[];
  selectedMasterKeys: string[];
  strategy: UniversityBlueprintSection["reduction_strategy"];
  reason: string;
  warnings: string[];
};

type LlmReducedSection = {
  section_key: string;
  content: string;
  derived_from_master_keys?: string[];
  reduction_summary?: string;
  warnings?: string[];
};

type LlmReductionResponse = {
  sections?: LlmReducedSection[];
  global_warnings?: string[];
};

type RuntimeAssetLike = {
  assetKey?: string | null;
  kind?: string | null;
  storedFilePath?: string | null;
  fileBase64?: string | null;
  mimeType?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
};

type RuntimeWithAssets = {
  templateCandidate?: {
    logo_policy?: {
      primary_asset_key?: string | null;
    } | null;
  } | null;
  assets?: RuntimeAssetLike[];
};

export type UniversityBlueprintTemplateRuntimeOverride = {
  templateKey: string;
  templateName: string;
  versionId: string;
  templateCandidate: {
    sections: TemplateSectionNode[];
  };
};

const REDUCTION_TRACKING_LABEL = "step11_university_blueprint_reduction";

const SEMANTIC_REDUCTION_GROUPS: Record<string, string[]> = {
  abstract: ["abstract", "problem_statement", "general_objective", "methodology"],
  keywords: ["keywords", "abstract", "problem_statement", "theoretical_framework"],
  introduction: ["introduction", "problem_statement", "justification", "scope_and_limitations"],
  introduction_justification: [
    "introduction",
    "problem_statement",
    "research_questions",
    "general_research_question",
    "specific_research_questions",
    "justification",
    "theoretical_justification",
    "practical_justification",
    "methodological_justification",
  ],
  problem_statement: [
    "problem_statement",
    "research_questions",
    "general_research_question",
    "specific_research_questions",
  ],
  research_questions: [
    "research_questions",
    "general_research_question",
    "specific_research_questions",
    "problem_statement",
  ],
  general_research_question: ["general_research_question", "research_questions"],
  specific_research_questions: ["specific_research_questions", "research_questions"],
  objectives: ["objectives", "general_objective", "specific_objectives"],
  general_objective: ["general_objective", "objectives"],
  specific_objectives: ["specific_objectives", "objectives"],
  hypotheses: ["hypotheses", "general_hypothesis", "specific_hypotheses"],
  general_hypothesis: ["general_hypothesis", "hypotheses"],
  specific_hypotheses: ["specific_hypotheses", "hypotheses"],
  justification: [
    "justification",
    "theoretical_justification",
    "practical_justification",
    "methodological_justification",
  ],
  theoretical_justification: ["theoretical_justification", "justification"],
  practical_justification: ["practical_justification", "justification"],
  methodological_justification: ["methodological_justification", "justification"],
  theoretical_framework: [
    "theoretical_framework",
    "research_antecedents",
    "state_of_the_art",
    "theoretical_bases",
    "terms_definition",
  ],
  research_antecedents: ["research_antecedents", "state_of_the_art", "theoretical_framework"],
  state_of_the_art: ["state_of_the_art", "research_antecedents", "theoretical_framework"],
  theoretical_bases: ["theoretical_bases", "theoretical_framework", "terms_definition"],
  terms_definition: ["terms_definition", "theoretical_bases"],
  variables_or_categories: ["variables_or_categories", "methodology", "consistency_matrix"],
  consistency_matrix: ["consistency_matrix"],
  methodology: [
    "methodology",
    "methodological_approach",
    "research_design",
    "population_and_sample",
    "data_collection_techniques",
    "research_instruments",
    "research_procedure",
    "analysis_plan",
  ],
  methodological_approach: ["methodological_approach", "methodology"],
  research_design: ["research_design", "methodology"],
  population_and_sample: ["population_and_sample", "methodology"],
  data_collection_techniques: [
    "data_collection_techniques",
    "research_instruments",
    "methodology",
  ],
  research_instruments: ["research_instruments", "data_collection_techniques"],
  research_procedure: ["research_procedure", "methodology"],
  analysis_plan: ["analysis_plan", "methodology"],
  ethics: ["ethics", "methodology"],
  scope: ["scope_and_limitations", "problem_statement", "methodology"],
  scope_and_limitations: ["scope_and_limitations", "problem_statement", "methodology"],
  schedule: ["schedule"],
  budget: ["budget"],
  schedule_budget: ["schedule", "budget"],
  references: ["references"],
  annexes: ["annexes", "asset_plan", "consistency_matrix"],
};

const INSTITUTIONAL_METADATA_SECTION_KEYS = new Set([
  "student_name",
  "advisors",
  "mention",
  "project_title",
]);

function isEnglishProject(project: MasterBlueprintEngineProject) {
  return normalizeLanguageCode(project.language) === "en";
}

function uniqueItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function cleanDerivedContent(value: string | null | undefined) {
  return (value ?? "")
    .replace(/```(?:json|markdown|md)?/gi, "")
    .replace(/```/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+\./g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForMatch(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectChildSemanticKeys(nodes: TemplateSectionNode[] | undefined, keys: string[] = []) {
  for (const node of nodes ?? []) {
    const semanticKey = node.semantic_key?.trim();
    if (semanticKey) {
      keys.push(semanticKey);
    }

    collectChildSemanticKeys(node.children, keys);
  }

  return keys;
}

function flattenTemplateSectionEntries(
  sections: TemplateSectionNode[],
  entries: TemplateSectionEntry[] = [],
  pathTitles: string[] = [],
  parentSemanticKey: string | null = null,
  level = 1,
) {
  for (const section of sections) {
    const title = section.title?.trim();
    const semanticKey = section.semantic_key?.trim();
    const currentPath = title ? [...pathTitles, title] : pathTitles;

    if (title && semanticKey) {
      entries.push({
        title,
        semanticKey,
        level,
        pathTitles: currentPath,
        parentSemanticKey,
        childSemanticKeys: collectChildSemanticKeys(section.children),
      });
    }

    if (Array.isArray(section.children) && section.children.length > 0) {
      flattenTemplateSectionEntries(
        section.children,
        entries,
        currentPath,
        semanticKey ?? parentSemanticKey,
        level + 1,
      );
    }
  }

  return entries;
}

function sourceIdsFromDrafts(drafts: MasterSectionDraft[]) {
  return uniqueItems(
    drafts.flatMap((draft) => [
      ...draft.supported_source_ids,
      ...draft.supported_pdf_source_ids,
      ...draft.supported_web_source_ids,
    ]),
  );
}

function evidenceSnippetIdsFromDrafts(drafts: MasterSectionDraft[]) {
  return uniqueItems(drafts.flatMap((draft) => draft.evidence_snippet_ids));
}

function assetKeysFromDrafts(drafts: MasterSectionDraft[]) {
  return uniqueItems(drafts.flatMap((draft) => draft.used_asset_keys ?? []));
}

function desiredWordBudget(entry: TemplateSectionEntry) {
  if (entry.semanticKey === "abstract") {
    return "180-260 palabras";
  }

  if (entry.semanticKey === "keywords") {
    return "5-8 terminos separados por punto y coma";
  }

  if (entry.semanticKey === "references") {
    return "breve nota tecnica; las referencias formales se renderizan aparte";
  }

  if (entry.semanticKey === "consistency_matrix") {
    return "breve introduccion; la tabla se renderiza aparte en horizontal";
  }

  if (entry.childSemanticKeys.length > 0) {
    return "120-220 palabras como encuadre, sin duplicar subsecciones hijas";
  }

  if (entry.level >= 3) {
    return "90-180 palabras";
  }

  return "180-360 palabras";
}

function selectMasterDraftsForEntry(input: {
  entry: TemplateSectionEntry;
  masterDrafts: MasterSectionDraft[];
  masterByKey: Map<string, MasterSectionDraft>;
}) {
  const candidateKeys = uniqueItems([
    input.entry.semanticKey,
    ...(SEMANTIC_REDUCTION_GROUPS[input.entry.semanticKey] ?? []),
    ...input.entry.childSemanticKeys,
  ]);
  const selected: MasterSectionDraft[] = [];

  for (const key of candidateKeys) {
    const draft = input.masterByKey.get(key);
    if (draft && !selected.some((item) => item.section_key === draft.section_key)) {
      selected.push(draft);
    }
  }

  if (selected.length > 0) {
    return selected.slice(0, 8);
  }

  const normalizedTarget = normalizeForMatch(`${input.entry.title} ${input.entry.semanticKey}`);
  const targetTerms = new Set(normalizedTarget.split(" ").filter((term) => term.length >= 5));
  const fuzzy = input.masterDrafts
    .map((draft) => {
      const normalizedDraft = normalizeForMatch(`${draft.title} ${draft.section_key}`);
      let score = 0;
      for (const term of targetTerms) {
        if (normalizedDraft.includes(term)) {
          score += 1;
        }
      }
      return { draft, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((item) => item.draft);

  return fuzzy;
}

function buildSectionMappings(input: {
  templateEntries: TemplateSectionEntry[];
  masterDrafts: MasterSectionDraft[];
}) {
  const masterByKey = new Map(input.masterDrafts.map((draft) => [draft.section_key, draft]));

  return input.templateEntries.map((entry): SectionMapping => {
    const selectedDrafts = selectMasterDraftsForEntry({
      entry,
      masterDrafts: input.masterDrafts,
      masterByKey,
    });
    const selectedMasterKeys = selectedDrafts.map((draft) => draft.section_key);
    const exact = selectedMasterKeys.includes(entry.semanticKey);
    const strategy: UniversityBlueprintSection["reduction_strategy"] =
      selectedDrafts.length === 0
        ? "deterministic_gap"
        : exact && selectedDrafts.length === 1
          ? "llm_reduced_exact"
          : "llm_reduced_merge";

    return {
      entry,
      selectedDrafts,
      selectedMasterKeys,
      strategy,
      reason:
        selectedDrafts.length === 0
          ? "No se encontro una seccion Master alineada; se declarara brecha."
          : exact && selectedDrafts.length === 1
            ? "Coincidencia exacta por semantic_key; se limpia y adapta al formato institucional."
            : "Se fusionan secciones Master relacionadas para ajustarlas al template institucional.",
      warnings:
        selectedDrafts.length === 0
          ? ["Sin soporte Master directo para esta seccion institucional."]
          : [],
    };
  });
}

function makeMasterPacket(draft: MasterSectionDraft) {
  return {
    section_key: draft.section_key,
    title: draft.title,
    source_ids: sourceIdsFromDrafts([draft]).slice(0, 8),
    evidence_snippet_ids: draft.evidence_snippet_ids.slice(0, 12),
    asset_keys: (draft.used_asset_keys ?? []).slice(0, 12),
    content_excerpt: clipText(cleanDerivedContent(draft.content), 1200) ?? "",
  };
}

function buildReductionPrompt(input: {
  project: MasterBlueprintEngineProject;
  templateName: string;
  mappings: SectionMapping[];
}) {
  const english = isEnglishProject(input.project);
  const outputLanguageRule = english
    ? "- OUTPUT LANGUAGE LOCK: write every section content, reduction_summary, and warning in English. Spanish template titles are identifiers/context and must not define the output language."
    : "- BLOQUEO DE IDIOMA: redacta todo el contenido, reduction_summary y warnings en espanol academico.";
  const selectedKeys = new Set(input.mappings.flatMap((mapping) => mapping.selectedMasterKeys));
  const selectedDrafts = input.mappings
    .flatMap((mapping) => mapping.selectedDrafts)
    .filter((draft, index, drafts) => drafts.findIndex((item) => item.section_key === draft.section_key) === index)
    .filter((draft) => selectedKeys.has(draft.section_key));
  const targetSections = input.mappings.map((mapping) => ({
    section_key: mapping.entry.semanticKey,
    title: mapping.entry.title,
    level: mapping.entry.level,
    path: mapping.entry.pathTitles.join(" > "),
    desired_length: desiredWordBudget(mapping.entry),
    selected_master_keys: mapping.selectedMasterKeys,
    has_child_sections_in_template: mapping.entry.childSemanticKeys.length > 0,
    child_section_keys: mapping.entry.childSemanticKeys,
  }));

  return `
Actua como editor academico de Ingeniometrix para adaptar un Master Template a una plantilla institucional mas compacta.

Tarea:
- Reducir y fusionar contenido del Master Template hacia las secciones exactas de la plantilla institucional.
- Mantener solo contenido soportado por el Master provisto.
- No inventar citas, datos, resultados, validaciones locales ni normativa.
- No agregar encabezados markdown dentro del contenido.
- No insertar referencias bibliograficas inline por titulo; las citas formales se insertaran despues en DOCX.
- Si una seccion padre tiene subsecciones hijas en la plantilla, redacta solo un encuadre breve y deja el detalle para las hijas.
- Si una seccion institucional tiene menos granularidad que el Master, fusiona las secciones Master relacionadas en una narrativa compacta.
${outputLanguageRule}
- ${english ? "Use clear, defensible academic English for master's level." : "Redacta siempre en espanol academico, claro y defendible para nivel maestria."}

Proyecto:
${JSON.stringify(
    {
      title: input.project.title,
      university: input.project.university,
      program: input.project.program,
      degreeLevel: input.project.degreeLevel,
      templateName: input.templateName,
    },
    null,
    2,
  )}

Secciones destino de la plantilla institucional:
${JSON.stringify(targetSections, null, 2)}

Paquetes Master disponibles:
${JSON.stringify(selectedDrafts.map(makeMasterPacket), null, 2)}

${english ? "Return exclusively valid JSON with this shape:" : "Devuelve exclusivamente JSON valido con esta forma:"}
{
  "sections": [
    {
      "section_key": "semantic_key destino",
      "content": "contenido final reducido para esta seccion",
      "derived_from_master_keys": ["keys usadas"],
      "reduction_summary": "como se adapto/fusiono",
      "warnings": []
    }
  ],
  "global_warnings": []
}
`.trim();
}

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
    } catch {
      return null;
    }
  }
}

function deterministicContentForMapping(
  mapping: SectionMapping,
  project: MasterBlueprintEngineProject,
) {
  const english = isEnglishProject(project);
  if (mapping.selectedDrafts.length === 0) {
    return english
      ? `The institutional template requests the section "${mapping.entry.title}", but the available master content does not provide enough support to develop it without additional assumptions. It must be completed during academic review.`
      : `La plantilla institucional solicita la seccion "${mapping.entry.title}", pero el contenido maestro disponible no contiene soporte suficiente para desarrollarla sin supuestos adicionales. Debe completarse durante la revision academica.`;
  }

  if (mapping.entry.semanticKey === "references") {
    return english
      ? "Formal references are consolidated in the bibliography section and rendered from the recovered source registry."
      : "Las referencias formales se consolidan en la seccion bibliografica del documento y se renderizan a partir del registro de fuentes recuperadas.";
  }

  if (mapping.entry.semanticKey === "consistency_matrix") {
    return english
      ? "The consistency matrix is presented as a horizontal table aligning questions, objectives, hypotheses, variables, and methodological components."
      : "La matriz de consistencia se presenta como tabla horizontal con correspondencia entre interrogantes, objetivos, hipotesis, variables y componentes metodologicos.";
  }

  const parts = mapping.selectedDrafts.map((draft) => {
    const excerpt = clipText(cleanDerivedContent(draft.content), mapping.selectedDrafts.length > 1 ? 900 : 2200);
    return excerpt ? excerpt : "";
  });

  return cleanDerivedContent(parts.filter(Boolean).join("\n\n"));
}

function buildSectionFromMapping(input: {
  mapping: SectionMapping;
  project: MasterBlueprintEngineProject;
  llmSection?: LlmReducedSection | null;
  forceDeterministic?: boolean;
}): UniversityBlueprintSection {
  const llmContent = input.forceDeterministic
    ? null
    : cleanDerivedContent(input.llmSection?.content);
  const content = llmContent || deterministicContentForMapping(input.mapping, input.project);
  const derivedKeys = uniqueItems(
    input.llmSection?.derived_from_master_keys?.length
      ? input.llmSection.derived_from_master_keys
      : input.mapping.selectedMasterKeys,
  );
  const deterministicStrategy = deterministicStrategyForMapping(input.mapping);
  const strategy = input.forceDeterministic ? deterministicStrategy : input.mapping.strategy;

  return {
    section_key: input.mapping.entry.semanticKey,
    title: input.mapping.entry.title,
    level: input.mapping.entry.level,
    path_titles: input.mapping.entry.pathTitles,
    content,
    derived_from_master_keys: derivedKeys,
    generated_for_template: derivedKeys.length === 0,
    source_ids: sourceIdsFromDrafts(input.mapping.selectedDrafts),
    evidence_snippet_ids: evidenceSnippetIdsFromDrafts(input.mapping.selectedDrafts),
    used_asset_keys: assetKeysFromDrafts(input.mapping.selectedDrafts),
    reduction_strategy: strategy,
    reduction_summary:
      cleanDerivedContent(input.llmSection?.reduction_summary) ||
      input.mapping.reason,
    warnings: uniqueItems([
      ...input.mapping.warnings,
      ...(input.llmSection?.warnings ?? []).map(String),
      content.length < 80 && input.mapping.entry.semanticKey !== "keywords"
        ? "Contenido institucional reducido demasiado corto; revisar antes de render final."
        : "",
    ]),
  };
}

function deterministicStrategyForMapping(
  mapping: SectionMapping,
): UniversityBlueprintSection["reduction_strategy"] {
  if (mapping.selectedDrafts.length === 0) {
    return "deterministic_gap";
  }

  if (
    mapping.selectedDrafts.length === 1 &&
    mapping.selectedDrafts[0]?.section_key === mapping.entry.semanticKey
  ) {
    return "deterministic_exact";
  }

  return "deterministic_merge";
}

function planFromMappings(input: {
  mappings: SectionMapping[];
  reducer: UniversityBlueprintReductionPlan["reducer"];
  llmUsed: boolean;
  detailedResult?: TextGenerationResult | null;
  warnings: string[];
}) {
  const usage = input.detailedResult?.usage;

  return {
    artifact_type: "university_blueprint_reduction_plan",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    reducer: input.reducer,
    llm_used: input.llmUsed,
    llm_generation: usage
      ? {
          provider: usage.provider,
          model: usage.model,
          tracking_label: REDUCTION_TRACKING_LABEL,
          input_tokens: usage.inputTokens,
          cached_input_tokens: usage.cachedInputTokens,
          output_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens,
          cost_usd: usage.costUsd,
          cost_cad: usage.costCad,
          duration_ms: usage.durationMs,
        }
      : null,
    master_section_count: new Set(input.mappings.flatMap((mapping) => mapping.selectedMasterKeys)).size,
    template_section_count: input.mappings.length,
    generated_section_count: input.mappings.length,
    section_mappings: input.mappings.map((mapping) => ({
      target_section_key: mapping.entry.semanticKey,
      target_title: mapping.entry.title,
      target_level: mapping.entry.level,
      matched_master_keys: mapping.selectedMasterKeys,
      strategy:
        input.reducer === "deterministic_fallback"
          ? deterministicStrategyForMapping(mapping)
          : mapping.strategy,
      reason: mapping.reason,
      warnings: mapping.warnings,
    })),
    warnings: input.warnings,
  } satisfies UniversityBlueprintReductionPlan;
}

function extractBrandingAssetsFromRuntime(runtime: RuntimeWithAssets) {
  const assets = runtime.assets ?? [];
  const primaryAssetKey = runtime.templateCandidate?.logo_policy?.primary_asset_key ?? null;
  const logoAsset =
    assets.find((asset) => primaryAssetKey && asset.assetKey === primaryAssetKey) ??
    assets.find((asset) => asset.kind?.toUpperCase() === "LOGO") ??
    null;

  if (!logoAsset) {
    return [] satisfies UniversityBlueprintBrandingAsset[];
  }

  const hasPayload = Boolean(logoAsset.storedFilePath || logoAsset.fileBase64);

  return [
    {
      role: "institution_logo",
      label: "Logo institucional",
      asset_key: logoAsset.assetKey ?? "institution_logo",
      file_path: logoAsset.storedFilePath ?? null,
      content_base64: logoAsset.fileBase64 ?? null,
      mime_type: logoAsset.mimeType ?? null,
      width_px: logoAsset.widthPx ?? null,
      height_px: logoAsset.heightPx ?? null,
      source: "template_runtime_db",
      warnings: hasPayload
        ? []
        : ["La plantilla institucional declara logo, pero no expone archivo ni base64 renderizable."],
    },
  ] satisfies UniversityBlueprintBrandingAsset[];
}

async function reduceWithLlm(input: {
  project: MasterBlueprintEngineProject;
  templateName: string;
  mappings: SectionMapping[];
}) {
  const provider = getConfiguredLlmProvider();
  const model = process.env.LLM_FAST_MODEL?.trim() || "gpt-5.4-mini";
  const prompt = buildReductionPrompt(input);
  const detailedResult = await provider.generateTextDetailed({
    prompt,
    model,
    trackingLabel: REDUCTION_TRACKING_LABEL,
  });
  const parsed = safeJsonParse<LlmReductionResponse>(detailedResult.text);

  if (!parsed?.sections || parsed.sections.length === 0) {
    throw new Error("El LLM no devolvio un JSON de reduccion institucional utilizable.");
  }

  return {
    detailedResult,
    response: parsed,
  };
}

export async function deriveUniversityBlueprint(input: {
  project: MasterBlueprintEngineProject;
  masterDrafts: MasterSectionDraft[];
  templateRuntimeOverride?: UniversityBlueprintTemplateRuntimeOverride;
}): Promise<UniversityBlueprintPackage> {
  const runtime =
    input.templateRuntimeOverride ??
    (
      await resolveBlueprintTemplateRuntime({
        projectTemplateKey: input.project.templateKey,
        projectUniversity: input.project.university,
        projectDegreeLevel: input.project.degreeLevel,
        projectProgram: input.project.program,
      })
    ).runtime;
  const templateEntries = flattenTemplateSectionEntries(
    runtime.templateCandidate.sections as TemplateSectionNode[],
  ).filter((entry) => !INSTITUTIONAL_METADATA_SECTION_KEYS.has(entry.semanticKey));
  const brandingAssets = extractBrandingAssetsFromRuntime(runtime as RuntimeWithAssets);
  const sourceDrafts = input.masterDrafts.filter(
    (draft) => draft.section_key !== "consistency_matrix" || draft.content_kind === "table",
  );
  const mappings = buildSectionMappings({
    templateEntries,
    masterDrafts: sourceDrafts,
  });
  const warnings: string[] = [];

  try {
    const reduced = await reduceWithLlm({
      project: input.project,
      templateName: runtime.templateName,
      mappings,
    });
    const sectionsByKey = new Map(
      (reduced.response.sections ?? []).map((section) => [section.section_key, section]),
    );
    const sections = mappings.map((mapping) => {
      const llmSection = sectionsByKey.get(mapping.entry.semanticKey);

      return buildSectionFromMapping({
        mapping,
        project: input.project,
        llmSection,
        forceDeterministic: !llmSection,
      });
    });
    const missingKeys = mappings
      .map((mapping) => mapping.entry.semanticKey)
      .filter((key) => !sectionsByKey.has(key));
    const allWarnings = uniqueItems([
      ...(reduced.response.global_warnings ?? []).map(String),
      ...warnings,
      ...missingKeys.map(
        (key) => `El LLM no devolvio contenido para ${key}; se uso reduccion deterministica local.`,
      ),
      ...sections.flatMap((section) => section.warnings ?? []),
    ]);

    return {
      template_key: runtime.templateKey,
      template_name: runtime.templateName,
      template_version_id: runtime.versionId,
      sections,
      branding_assets: brandingAssets,
      reduction_plan: planFromMappings({
        mappings,
        reducer: "llm_global_reducer",
        llmUsed: true,
        detailedResult: reduced.detailedResult,
        warnings: allWarnings,
      }),
      warnings: allWarnings,
    };
  } catch (error) {
    const fallbackWarnings = uniqueItems([
      `No se pudo ejecutar la reduccion institucional con LLM: ${
        error instanceof Error ? error.message : "error desconocido"
      }`,
      "Se aplico reduccion deterministica para mantener trazabilidad sin inventar contenido.",
      ...mappings.flatMap((mapping) => mapping.warnings),
    ]);
    const sections = mappings.map((mapping) =>
      buildSectionFromMapping({
        mapping,
        project: input.project,
        forceDeterministic: true,
      }),
    );

    return {
      template_key: runtime.templateKey,
      template_name: runtime.templateName,
      template_version_id: runtime.versionId,
      sections,
      branding_assets: brandingAssets,
      reduction_plan: planFromMappings({
        mappings,
        reducer: "deterministic_fallback",
        llmUsed: false,
        detailedResult: null,
        warnings: fallbackWarnings,
      }),
      warnings: fallbackWarnings,
    };
  }
}
