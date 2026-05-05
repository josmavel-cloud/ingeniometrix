import type {
  ConsolidatedEvidenceArtifact,
} from "@/blueprint_launch/server/local-playground-store";
import type {
  DomainGenerationProfile,
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterSectionDraft,
} from "@/server/blueprint-v2/types";
import { clipText } from "@/server/blueprint-v2/utils";

import { buildMethodBundle } from "@/server/blueprint-v2/sections/section-method-bundles";
import {
  buildEvidenceUnitMap,
  createContentHash,
  type EnrichedPromptPlan,
  type ExtendedManifestItem,
  type ExtendedPlanItem,
  getClaimsGuidanceItem,
  getMethodGuidanceItem,
  getSectionHydrationItem,
  isMethodSection,
  isTheoreticalSection,
  type PriorSection,
  type RuntimePromptContext,
  sanitizeRecoveredText,
  type SectionExecutionProfile,
  type SectionEvidenceHydrationPlanItem,
  uniqueEvidenceUnits,
  type WaveContextState,
} from "@/server/blueprint-v2/sections/section-generation-shared";
import { buildTheoryBundle } from "@/server/blueprint-v2/sections/section-theory-bundles";

const runtimePromptCache = new Map<string, RuntimePromptContext>();

export function buildCitationPolicy(input: {
  sectionKey: string;
  wave?: string;
  domainProfile: DomainGenerationProfile;
}): {
  expected_density: "none" | "low" | "medium" | "high";
  citation_mode:
    | "inline_required"
    | "inline_optional"
    | "references_only"
    | "deferred_to_docx";
} {
  if (input.sectionKey === "references") {
    return {
      expected_density: "none",
      citation_mode: "references_only",
    };
  }

  if (
    input.sectionKey === "general_objective" ||
    input.sectionKey === "specific_objectives" ||
    input.sectionKey === "general_research_question" ||
    input.sectionKey === "specific_research_questions" ||
    input.sectionKey === "keywords"
  ) {
    return {
      expected_density: "low",
      citation_mode: "deferred_to_docx",
    };
  }

  if (input.wave === "development") {
    return {
      expected_density: "high",
      citation_mode: "deferred_to_docx",
    };
  }

  if (input.wave === "support_integration") {
    return {
      expected_density:
        input.domainProfile.evidence_style === "technical" ? "medium" : "low",
      citation_mode: "deferred_to_docx",
    };
  }

  if (input.wave === "citation_and_references") {
    return {
      expected_density: "medium",
      citation_mode: "deferred_to_docx",
    };
  }

  return {
    expected_density: "medium",
    citation_mode: "deferred_to_docx",
  };
}

function buildReferenceLines(input: {
  evidenceLedger: EvidenceLedger;
  sourceIds: string[];
  limit?: number;
}) {
  return input.sourceIds
    .map((sourceId) =>
      input.evidenceLedger.source_registry.find(
        (source) => source.source_id === sourceId,
      ),
    )
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .slice(0, input.limit ?? 6)
    .map((source, index) => {
      const authorLabel =
        source.authors.slice(0, 2).join(", ") || "Autor no disponible";
      return [
        `Referencia candidata ${index + 1}:`,
        `reference_id: ${source.reference_id ?? "NO_DISPONIBLE"}`,
        `autores: ${authorLabel}`,
        `anio: ${source.year ?? "s/f"}`,
        `titulo_solo_trazabilidad_no_copiar: ${sanitizeRecoveredText(source.title)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildOriginalExcerptLines(input: {
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  excerptLimit: number;
}) {
  const evidenceUnitMap = buildEvidenceUnitMap(input.consolidatedEvidence);
  const units = uniqueEvidenceUnits([
    ...((input.hydrationItem?.priority_original_excerpt_ids ?? []).map((id) =>
      evidenceUnitMap.get(id),
    )),
    ...((input.hydrationItem?.priority_evidence_ids ?? []).map((id) =>
      evidenceUnitMap.get(id),
    )),
  ])
    .filter(
      (unit) =>
        unit.unit_type === "original_excerpt" ||
        unit.citation_eligibility === "direct_quote" ||
        unit.citation_eligibility === "paraphrase_only",
    )
    .slice(0, input.excerptLimit);

  const lines = units.map((unit, index) =>
    [
      `Extracto original ${index + 1}:`,
      `evidence_id: ${unit.evidence_id}`,
      `fuente_solo_trazabilidad_no_copiar: ${sanitizeRecoveredText(unit.source_title)}`,
      `paginas: ${unit.page_start ?? "NO_DISPONIBLE"}${
        unit.page_end && unit.page_end !== unit.page_start
          ? `-${unit.page_end}`
          : ""
      }`,
      `texto: ${
        clipText(
          sanitizeRecoveredText(unit.original_text ?? unit.summary_es ?? ""),
          340,
        ) || "NO_DISPONIBLE"
      }`,
    ].join("\n"),
  );

  if (lines.length > 0) {
    return {
      lines: lines.join("\n\n"),
      usedEvidenceIds: units.map((unit) => unit.evidence_id),
      usedOriginalExcerptIds: units.map((unit) => unit.evidence_id),
    };
  }

  const fallbackLines = (input.hydrationItem?.required_original_fragments ?? [])
    .slice(0, input.excerptLimit)
    .map((fragment, index) =>
      [
        `Extracto original ${index + 1}:`,
        `texto: ${
          clipText(sanitizeRecoveredText(fragment), 340) ??
          sanitizeRecoveredText(fragment)
        }`,
      ].join("\n"),
    );

  return {
    lines: fallbackLines.join("\n\n"),
    usedEvidenceIds: [],
    usedOriginalExcerptIds: [],
  };
}

function buildHydratedAssetKeys(input: {
  planItem: ExtendedPlanItem;
  manifestItem: ExtendedManifestItem;
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
  executionProfile: SectionExecutionProfile;
}) {
  if (!input.executionProfile.use_assets) {
    return [];
  }

  const prioritized = [
    ...(input.hydrationItem?.critical_asset_keys ?? []),
    ...(input.planItem.critical_asset_keys ?? []),
    ...(input.hydrationItem?.useful_asset_keys ?? []),
    ...(input.planItem.useful_asset_keys ?? []),
    ...(input.manifestItem.critical_asset_keys ?? []),
    ...(input.manifestItem.useful_asset_keys ?? []),
  ];

  const limited = Array.from(new Set(prioritized));
  const maxAssets = input.executionProfile.complexity === "heavy" ? 2 : 1;
  return limited.slice(0, maxAssets);
}

function buildAssetLines(input: {
  evidenceLedger: EvidenceLedger;
  assetKeys: string[];
}) {
  return input.assetKeys
    .map((assetKey) =>
      input.evidenceLedger.assets.find((asset) => asset.asset_key === assetKey),
    )
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    .slice(0, 3)
    .map((asset, index) =>
      [
        `Asset ${index + 1}:`,
        `asset_key: ${asset.asset_key}`,
        `kind: ${asset.kind}`,
        `title: ${sanitizeRecoveredText(asset.title)}`,
        `caption: ${sanitizeRecoveredText(asset.caption) || "NO_DISPONIBLE"}`,
        `page_number: ${asset.page_number ?? "NO_DISPONIBLE"}`,
        `text_content: ${
          clipText(sanitizeRecoveredText(asset.text_content ?? ""), 260) ||
          "NO_DISPONIBLE"
        }`,
      ].join("\n"),
    )
    .join("\n\n");
}

function buildDependencySummary(priorSections: PriorSection[]) {
  return priorSections
    .slice(0, 3)
    .map(
      (section) =>
        `- ${section.title}: ${clipText(sanitizeRecoveredText(section.content), 180) ?? sanitizeRecoveredText(section.content)}`,
    )
    .join("\n");
}

function buildReferencesWorkingSet(drafts: MasterSectionDraft[]) {
  return {
    reference_ids: Array.from(
      new Set(drafts.flatMap((draft) => draft.used_reference_ids ?? [])),
    ),
  };
}

export function buildWorkingReferenceLines(input: {
  drafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
}) {
  const workingSet = buildReferencesWorkingSet(input.drafts);

  return workingSet.reference_ids
    .map((referenceId) =>
      input.evidenceLedger.source_registry.find(
        (source) =>
          source.source_id === referenceId || source.reference_id === referenceId,
      ),
    )
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .slice(0, 6)
    .map((source, index) => {
      const authorLabel =
        source.authors.slice(0, 2).join(", ") || "Autor no disponible";
      return [
        `Referencia ya usada ${index + 1}:`,
        `reference_id: ${source.reference_id ?? "NO_DISPONIBLE"}`,
        `autores: ${authorLabel}`,
        `anio: ${source.year ?? "s/f"}`,
        `titulo_solo_trazabilidad_no_copiar: ${sanitizeRecoveredText(source.title)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildWaveContextBlock(input: {
  upstreamContextKeys: string[];
  waveContexts: WaveContextState;
}) {
  const blocks = input.upstreamContextKeys
    .map((contextKey) => {
      const value = input.waveContexts[contextKey as keyof WaveContextState];
      return value
        ? `${contextKey}:\n${clipText(sanitizeRecoveredText(value), 260) ?? sanitizeRecoveredText(value)}`
        : null;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);

  return blocks.join("\n\n");
}

function buildSupplementarySnippetLines(input: {
  evidenceLedger: EvidenceLedger;
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
  manifestItem: ExtendedManifestItem;
  limit: number;
}) {
  return (
    input.hydrationItem?.priority_snippet_ids ?? input.manifestItem.evidence_snippet_ids
  )
    .map((snippetId) =>
      input.evidenceLedger.snippets.find((snippet) => snippet.snippet_id === snippetId),
    )
    .filter((snippet): snippet is NonNullable<typeof snippet> => Boolean(snippet))
    .slice(0, input.limit)
    .map((snippet, index) =>
      [
        `Snippet complementario ${index + 1}:`,
        `label: ${sanitizeRecoveredText(snippet.label)}`,
        `texto: ${
          clipText(sanitizeRecoveredText(snippet.text), 220) ??
          sanitizeRecoveredText(snippet.text)
        }`,
      ].join("\n"),
    )
    .join("\n\n");
}

function buildResearchFrameLines(promptPlan: EnrichedPromptPlan) {
  return [
    promptPlan.research_frame_light?.study_purpose
      ? `- proposito: ${sanitizeRecoveredText(promptPlan.research_frame_light.study_purpose)}`
      : null,
    promptPlan.research_frame_light?.study_question_type
      ? `- tipo de pregunta: ${sanitizeRecoveredText(promptPlan.research_frame_light.study_question_type)}`
      : null,
    promptPlan.research_frame_light?.methodological_orientation
      ? `- orientacion metodologica: ${
          clipText(
            sanitizeRecoveredText(
              promptPlan.research_frame_light.methodological_orientation,
            ),
            160,
          ) ??
          sanitizeRecoveredText(
            promptPlan.research_frame_light.methodological_orientation,
          )
        }`
      : null,
    promptPlan.research_frame_light?.claims_ceiling
      ? `- techo de claims: ${
          clipText(
            sanitizeRecoveredText(promptPlan.research_frame_light.claims_ceiling),
            160,
          ) ?? sanitizeRecoveredText(promptPlan.research_frame_light.claims_ceiling)
        }`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildClaimsLines(input: {
  promptPlan: EnrichedPromptPlan;
  sectionKey: string;
}) {
  const claimsGuidance = getClaimsGuidanceItem(input.promptPlan, input.sectionKey);
  return {
    claimsGuidance,
    lines: [
      claimsGuidance?.allowed_claims?.length
        ? `- claims permitidos: ${claimsGuidance.allowed_claims.slice(0, 3).join(" | ")}`
        : null,
      claimsGuidance?.claims_to_avoid?.length
        ? `- claims a evitar: ${claimsGuidance.claims_to_avoid.slice(0, 3).join(" | ")}`
        : null,
      claimsGuidance?.claims_conditioned?.length
        ? `- claims condicionados: ${claimsGuidance.claims_conditioned
            .slice(0, 2)
            .join(" | ")}`
        : null,
      claimsGuidance?.validation_needs?.length
        ? `- validaciones pendientes: ${claimsGuidance.validation_needs
            .slice(0, 2)
            .join(" | ")}`
        : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  };
}

function buildMethodLines(input: {
  promptPlan: EnrichedPromptPlan;
  sectionKey: string;
  project: MasterBlueprintEngineProject;
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  evidenceLedger: EvidenceLedger;
}) {
  const methodGuidance = getMethodGuidanceItem(input.promptPlan, input.sectionKey);
  const methodBundle = isMethodSection(input.sectionKey)
    ? buildMethodBundle({
        sectionKey: input.sectionKey,
        project: input.project,
        hydrationItem: input.hydrationItem,
        methodGuidance,
        consolidatedEvidence: input.consolidatedEvidence,
        evidenceLedger: input.evidenceLedger,
      })
    : null;

  const guidanceLines = [
    methodGuidance?.treatment
      ? `- tratamiento: ${sanitizeRecoveredText(methodGuidance.treatment)}`
      : null,
    methodGuidance?.expected_elements?.length
      ? `- elementos esperados: ${methodGuidance.expected_elements
          .slice(0, 3)
          .map((value) => sanitizeRecoveredText(value))
          .join(" | ")}`
      : null,
    methodGuidance?.avoid?.length
      ? `- evitar: ${methodGuidance.avoid
          .slice(0, 2)
          .map((value) => sanitizeRecoveredText(value))
          .join(" | ")}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const bundleLines = methodBundle
    ? [
        methodBundle.study_type.length
          ? `- tipo de estudio: ${methodBundle.study_type.join(" | ")}`
          : null,
        methodBundle.design_type.length
          ? `- diseno: ${methodBundle.design_type.join(" | ")}`
          : null,
        methodBundle.unit_of_analysis.length
          ? `- unidad de analisis: ${methodBundle.unit_of_analysis.join(" | ")}`
          : null,
        methodBundle.analysis_strategy.length
          ? `- estrategia analitica: ${methodBundle.analysis_strategy.join(" | ")}`
          : null,
        methodBundle.limits_and_conditions.length
          ? `- limites: ${methodBundle.limits_and_conditions.join(" | ")}`
          : null,
      ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
    : "";

  return {
    methodGuidance,
    methodBundle,
    lines: [guidanceLines, bundleLines].filter(Boolean).join("\n"),
  };
}

function buildTheoryLines(input: {
  sectionKey: string;
  hydrationItem: SectionEvidenceHydrationPlanItem | null;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  evidenceLedger: EvidenceLedger;
}) {
  if (!isTheoreticalSection(input.sectionKey)) {
    return {
      theoryBundle: null,
      lines: "",
    };
  }

  const theoryBundle = buildTheoryBundle({
    sectionKey: input.sectionKey,
    hydrationItem: input.hydrationItem,
    consolidatedEvidence: input.consolidatedEvidence,
    evidenceLedger: input.evidenceLedger,
  });

  const modeLine =
    theoryBundle.focus_mode === "framework"
      ? "- organiza la seccion por conceptos o marcos explicativos utiles para el problema"
      : theoryBundle.focus_mode === "antecedents"
        ? "- organiza la seccion comparando antecedentes, aportes y utilidad para el estudio"
        : theoryBundle.focus_mode === "state_of_art"
          ? "- organiza la seccion por tendencias, enfoques dominantes y vacios"
          : "- organiza la seccion por conceptos, definiciones operativas y utilidad en el proyecto";

  return {
    theoryBundle,
    lines: [
      modeLine,
      theoryBundle.core_constructs.length
        ? `- constructos nucleares: ${theoryBundle.core_constructs.join(" | ")}`
        : null,
      theoryBundle.framework_candidates.length
        ? `- marcos o ideas centrales: ${theoryBundle.framework_candidates.join(" | ")}`
        : null,
      theoryBundle.field_gaps.length
        ? `- vacios del campo: ${theoryBundle.field_gaps.join(" | ")}`
        : null,
      theoryBundle.priority_quotes.length
        ? `- extractos teoricos prioritarios: ${theoryBundle.priority_quotes.join(" || ")}`
        : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  };
}

function buildDeterministicPrompt(input: {
  basePrompt: string;
  planItem: ExtendedPlanItem;
  executionProfile: SectionExecutionProfile;
  researchFrameLines: string;
}) {
  return [
    `Seccion objetivo: ${input.planItem.title} (${input.planItem.section_key})`,
    "Modo de ejecucion:",
    `- perfil: ${input.executionProfile.execution_mode}`,
    `- prompt_budget: ${input.executionProfile.prompt_budget}`,
    "",
    "Contexto minimo para ruta deterministica:",
    input.researchFrameLines || "NO_DISPONIBLE",
    "",
    `- content_kind: ${input.planItem.content_kind}`,
    `- min_words: ${input.planItem.min_words ?? "NO_ESPECIFICADO"}`,
    `- max_words: ${input.planItem.max_words ?? "NO_ESPECIFICADO"}`,
    "",
    "Esta seccion se resuelve con codigo o plantilla controlada. No requiere llamada LLM salvo contingencia explicita.",
  ].join("\n");
}

function buildCompactRuntimeBasePrompt(input: {
  planItem: ExtendedPlanItem;
  project: MasterBlueprintEngineProject;
}) {
  return [
    "Eres un redactor academico para un proyecto de investigacion de maestria.",
    "No redactas una tesis completa. Solo produces la seccion solicitada.",
    "Reglas obligatorias:",
    "- escribe en espanol academico claro",
    "- no inventes citas, datos, resultados ni validaciones locales",
    "- usa el intake como ancla del caso y la evidencia solo como soporte comparativo",
    "- si falta soporte, declara el limite como alcance pendiente o validacion futura",
    "- no escribas titulos de papers, reference_id, source_id, evidence_id ni snippet_id dentro del contenido",
    "- no insertes citas visibles; el sistema guardara citation_intents para el DOCX",
    "- no uses Markdown visible: sin encabezados ##, sin **negritas**, sin cursivas con asteriscos",
    "- evita repetir el titulo de la seccion en la primera frase",
    "- evita aperturas genericas como 'La presente seccion', 'Este apartado' o 'El planteamiento del problema es'",
    "",
    "Caso actual:",
    `- linea de investigacion: ${sanitizeRecoveredText(input.project.intake.researchLine ?? "NO_DISPONIBLE")}`,
    `- tema: ${clipText(sanitizeRecoveredText(input.project.intake.topic), 320) ?? "NO_DISPONIBLE"}`,
    `- problema: ${clipText(sanitizeRecoveredText(input.project.intake.problemContext), 520) ?? "NO_DISPONIBLE"}`,
    `- metodologia preferida: ${clipText(sanitizeRecoveredText(input.project.intake.preferredMethodology), 320) ?? "NO_DISPONIBLE"}`,
    `- unidad o caso: ${clipText(sanitizeRecoveredText(input.project.intake.targetPopulation), 280) ?? "NO_DISPONIBLE"}`,
    "",
    "Seccion objetivo:",
    `- section_key: ${input.planItem.section_key}`,
    `- titulo: ${input.planItem.title}`,
    `- content_kind: ${input.planItem.content_kind}`,
    `- min_words: ${input.planItem.min_words ?? "NO_ESPECIFICADO"}`,
    `- max_words: ${input.planItem.max_words ?? "NO_ESPECIFICADO"}`,
    `- target_word_budget: ${input.planItem.target_word_budget ?? "NO_ESPECIFICADO"}`,
    input.planItem.instructions.length > 0
      ? `- instrucciones: ${input.planItem.instructions
          .slice(0, 4)
          .map((instruction) => sanitizeRecoveredText(instruction))
          .join(" | ")}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildEditorialPolicyLines(input: {
  planItem: ExtendedPlanItem;
  promptPlan: EnrichedPromptPlan;
}) {
  const finalGuidance = input.promptPlan.final_sections_guidance;
  const lines = [
    finalGuidance?.section_opening_rule
      ? `- apertura: ${sanitizeRecoveredText(finalGuidance.section_opening_rule)}`
      : null,
    finalGuidance?.objective_repetition_rule
      ? `- objetivos: ${sanitizeRecoveredText(finalGuidance.objective_repetition_rule)}`
      : null,
    input.planItem.target_word_budget
      ? `- presupuesto objetivo: ${input.planItem.target_word_budget} palabras`
      : finalGuidance?.length_budget_rule
        ? `- presupuesto general: ${sanitizeRecoveredText(finalGuidance.length_budget_rule)}`
        : null,
    input.planItem.bullet_policy
      ? `- vinetas: ${sanitizeRecoveredText(input.planItem.bullet_policy)}`
      : finalGuidance?.bullet_policy
        ? `- vinetas: ${sanitizeRecoveredText(finalGuidance.bullet_policy)}`
        : null,
    ...(input.planItem.editorial_constraints ?? []).slice(0, 5).map(
      (constraint) => `- ${sanitizeRecoveredText(constraint)}`,
    ),
  ];

  return Array.from(new Set(lines.filter((line): line is string => Boolean(line)))).join("\n");
}

function buildResearchLogicContractLines(input: {
  sectionKey: string;
  promptPlan: EnrichedPromptPlan;
}) {
  const contract = input.promptPlan.research_logic_contract_plan;
  const logicSectionKeys = new Set([
    "research_questions",
    "general_research_question",
    "specific_research_questions",
    "general_objective",
    "specific_objectives",
    "general_hypothesis",
    "specific_hypotheses",
    "hypotheses",
    "variables_or_categories",
    "variables_indicators",
    "methodology",
    "methodological_approach",
    "research_design",
    "data_collection_techniques",
    "research_instruments",
    "analysis_plan",
  ]);

  if (!contract?.enabled || !logicSectionKeys.has(input.sectionKey)) {
    return "";
  }

  return [
    `- modo: ${contract.mode ?? "light_master_thesis_project"}`,
    `- formato interno de correspondencia: ${contract.row_id_format ?? "P{n}/OE{n}/H{n}"}`,
    ...(contract.correspondence_rules ?? []).slice(0, 4).map((rule) => `- regla: ${sanitizeRecoveredText(rule)}`),
    ...(contract.step9_prompt_rules ?? []).slice(0, 3).map((rule) => `- salida Step 9: ${sanitizeRecoveredText(rule)}`),
    "- no muestres IDs tecnicos si empobrecen el texto final, pero conserva orden y correspondencia semantica entre filas",
  ].join("\n");
}

export function buildGenerationPrompt(input: {
  basePrompt: string;
  planItem: ExtendedPlanItem;
  manifestItem: ExtendedManifestItem;
  promptPlan: EnrichedPromptPlan;
  priorSections: PriorSection[];
  waveContexts: WaveContextState;
  workingDrafts: MasterSectionDraft[];
  evidenceLedger: EvidenceLedger;
  consolidatedEvidence: ConsolidatedEvidenceArtifact | null;
  domainProfile: DomainGenerationProfile;
  executionProfile: SectionExecutionProfile;
  project: MasterBlueprintEngineProject;
}): RuntimePromptContext {
  const cacheKey = createContentHash(
    input.planItem.section_key,
    input.executionProfile.execution_mode,
    input.executionProfile.prompt_budget,
    input.basePrompt,
    JSON.stringify(input.manifestItem.source_ids ?? input.manifestItem.supporting_source_ids),
    JSON.stringify(input.manifestItem.evidence_snippet_ids),
    input.priorSections.map((section) => `${section.section_key}:${section.content}`).join("|"),
    JSON.stringify(input.waveContexts),
    input.workingDrafts.map((draft) => draft.section_key).join("|"),
  );
  const cached = runtimePromptCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const theoreticalSection = isTheoreticalSection(input.planItem.section_key);
  const methodSection = isMethodSection(input.planItem.section_key);
  const citationPolicy = buildCitationPolicy({
    sectionKey: input.planItem.section_key,
    wave: input.planItem.wave,
    domainProfile: input.domainProfile,
  });
  const hydrationItem = getSectionHydrationItem(
    input.promptPlan,
    input.planItem.section_key,
  );
  const { claimsGuidance, lines: claimsLines } = buildClaimsLines({
    promptPlan: input.promptPlan,
    sectionKey: input.planItem.section_key,
  });
  const originalExcerptBlock = buildOriginalExcerptLines({
    hydrationItem,
    consolidatedEvidence: input.consolidatedEvidence,
    excerptLimit: theoreticalSection ? 3 : methodSection ? 4 : 2,
  });
  const usedAssetKeys = buildHydratedAssetKeys({
    planItem: input.planItem,
    manifestItem: input.manifestItem,
    hydrationItem,
    executionProfile: input.executionProfile,
  });
  const referenceLines = buildReferenceLines({
    evidenceLedger: input.evidenceLedger,
    sourceIds:
      hydrationItem?.priority_source_ids ??
      input.manifestItem.source_ids ??
      input.manifestItem.supporting_source_ids,
    limit:
      input.executionProfile.prompt_budget === "tiny"
        ? 1
        : theoreticalSection
          ? 2
          : 3,
  });
  const assetLines = buildAssetLines({
    evidenceLedger: input.evidenceLedger,
    assetKeys: usedAssetKeys,
  });
  const dependencySummary = buildDependencySummary(input.priorSections);
  const upstreamContextBlock = buildWaveContextBlock({
    upstreamContextKeys:
      input.manifestItem.upstream_context_keys ??
      input.planItem.upstream_context_keys ??
      [],
    waveContexts: input.waveContexts,
  });
  const workingReferenceLines = input.executionProfile.use_working_references
    ? buildWorkingReferenceLines({
        drafts: input.workingDrafts,
        evidenceLedger: input.evidenceLedger,
      })
    : "";
  const compactEvidenceLines = buildSupplementarySnippetLines({
    evidenceLedger: input.evidenceLedger,
    hydrationItem,
    manifestItem: input.manifestItem,
    limit:
      input.executionProfile.prompt_budget === "tiny"
        ? 0
        : theoreticalSection
          ? 1
          : 2,
  });
  const researchFrameLines = buildResearchFrameLines(input.promptPlan);
  const { methodBundle, lines: methodLines } = buildMethodLines({
    promptPlan: input.promptPlan,
    sectionKey: input.planItem.section_key,
    project: input.project,
    hydrationItem,
    consolidatedEvidence: input.consolidatedEvidence,
    evidenceLedger: input.evidenceLedger,
  });
  const { theoryBundle, lines: theoryLines } = buildTheoryLines({
    sectionKey: input.planItem.section_key,
    hydrationItem,
    consolidatedEvidence: input.consolidatedEvidence,
    evidenceLedger: input.evidenceLedger,
  });
  const finalGuidance = input.promptPlan.final_sections_guidance ?? null;
  const finalSectionLines =
    finalGuidance?.late_section_keys?.includes(input.planItem.section_key)
      ? [
          input.planItem.section_key === "abstract"
            ? finalGuidance.abstract_rule
            : null,
          input.planItem.section_key === "keywords"
            ? finalGuidance.keywords_instruction ?? finalGuidance.keywords_rule
            : null,
          input.planItem.section_key === "references"
            ? finalGuidance.references_rule
            : null,
          input.planItem.section_key === "title_refined"
            ? finalGuidance.final_title_instruction ??
              finalGuidance.title_refinement_rule
            : null,
          input.planItem.section_key === "title_refined"
            ? finalGuidance.short_header_title_instruction
            : null,
        ]
          .filter((line): line is string => Boolean(line))
          .map((line) => `- ${sanitizeRecoveredText(line)}`)
          .join("\n")
      : "";
  const researchLogicContractLines = buildResearchLogicContractLines({
    sectionKey: input.planItem.section_key,
    promptPlan: input.promptPlan,
  });
  const editorialPolicyLines = buildEditorialPolicyLines({
    planItem: input.planItem,
    promptPlan: input.promptPlan,
  });

  const compactBasePrompt = buildCompactRuntimeBasePrompt({
    planItem: input.planItem,
    project: input.project,
  });
  const prompt =
    input.executionProfile.execution_mode === "deterministic"
      ? buildDeterministicPrompt({
          basePrompt: compactBasePrompt,
          planItem: input.planItem,
          executionProfile: input.executionProfile,
          researchFrameLines,
        })
      : [
          compactBasePrompt,
          "",
          "Contexto adicional para la generacion del draft:",
          `- wave: ${input.planItem.wave ?? "NO_DISPONIBLE"}`,
          `- execution_profile: ${input.executionProfile.execution_mode}`,
          `- prompt_budget: ${input.executionProfile.prompt_budget}`,
          `- timeout_ms: ${input.executionProfile.timeout_ms}`,
          `- generation_strategy: ${
            input.planItem.generation_strategy ?? "NO_DISPONIBLE"
          }`,
          `- domain_family: ${input.domainProfile.domain_family}`,
          `- evidence_style: ${input.domainProfile.evidence_style}`,
          `- citation_density: ${citationPolicy.expected_density}`,
          `- citation_mode: ${citationPolicy.citation_mode}`,
          input.planItem.needs_followup_before_strong_draft
            ? "- followup_warning: hay followups pendientes; no sobreafirmes"
            : null,
          "",
          "Marco ligero del estudio:",
          researchFrameLines || "NO_DISPONIBLE",
          researchLogicContractLines ? "" : null,
          researchLogicContractLines
            ? "Contrato de correspondencia metodologica para secciones logicas:"
            : null,
          researchLogicContractLines || null,
          "",
          "Contextos heredados resumidos:",
          upstreamContextBlock || "NO_DISPONIBLE",
          "",
          "Dependencias directas resumidas:",
          dependencySummary || "NO_DISPONIBLE",
          "",
          "Extractos originales prioritarios para la seccion:",
          originalExcerptBlock.lines || "NO_DISPONIBLE",
          compactEvidenceLines
            ? ""
            : null,
          compactEvidenceLines
            ? "Snippets complementarios para la seccion:"
            : null,
          compactEvidenceLines || null,
          referenceLines ? "" : null,
          referenceLines ? "Referencias candidatas disponibles:" : null,
          referenceLines || null,
          assetLines ? "" : null,
          assetLines ? "Assets criticos disponibles:" : null,
          assetLines || null,
          "",
          "Claims y limites operativos:",
          claimsLines || "NO_DISPONIBLE",
          "",
          methodSection ? "Guia metodologica ligera para esta seccion:" : null,
          methodSection ? methodLines || "NO_APLICA" : null,
          methodSection ? "" : null,
          theoreticalSection ? "Guia teorica especifica:" : null,
          theoreticalSection ? theoryLines || "NO_APLICA" : null,
          theoreticalSection ? "" : null,
          "Reglas de cierre si aplica:",
          finalSectionLines || "NO_APLICA",
          "",
          "Politica editorial Batch 2A:",
          editorialPolicyLines || "NO_DISPONIBLE",
          workingReferenceLines ? "" : null,
          workingReferenceLines
            ? "Referencias ya usadas en el documento hasta ahora:"
            : null,
          workingReferenceLines || null,
          "",
          "Indicaciones finales de salida:",
          "- no inventes referencias que no aparezcan arriba",
          "- prohibido insertar citas visibles, autores, anios entre parentesis, titulos de fuentes o nombres de papers dentro del contenido",
          "- usa la evidencia para redactar, pero deja las citas como coordenadas internas; el sistema registrara citation_intents para el DOCX",
          "- si necesitas una tabla, usa filas separadas por tabuladores; no uses tablas Markdown con |---|",
          "- no uses Markdown visible: sin ##, sin **, sin cursivas con asteriscos",
          "- no conviertas el proyecto en validacion definitiva, cumplimiento normativo cerrado o factibilidad total demostrada",
          "- si la evidencia no alcanza, declara el limite o deja la formulacion como propuesta preliminar",
          "- no repitas objetivos, preguntas ni encabezados; usa vinetas solo donde mejoren la lectura",
          "- devuelve solo el contenido final de la seccion",
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n");

  const runtimeContext: RuntimePromptContext = {
    prompt,
    used_evidence_ids:
      hydrationItem?.priority_evidence_ids?.slice(0, 8) ??
      theoryBundle?.evidence_ids ??
      methodBundle?.evidence_ids ??
      [],
    used_original_excerpt_ids:
      originalExcerptBlock.usedOriginalExcerptIds.length > 0
        ? originalExcerptBlock.usedOriginalExcerptIds
        : hydrationItem?.priority_original_excerpt_ids?.slice(0, 4) ?? [],
    used_snippet_ids:
      hydrationItem?.priority_snippet_ids?.slice(
        0,
        input.executionProfile.prompt_budget === "tiny" ? 0 : 4,
      ) ?? input.manifestItem.evidence_snippet_ids.slice(0, 4),
    used_source_ids:
      hydrationItem?.priority_source_ids?.slice(0, theoreticalSection ? 3 : 4) ??
      input.manifestItem.source_ids ??
      input.manifestItem.supporting_source_ids,
    used_asset_keys: usedAssetKeys,
    blocked_claims: claimsGuidance?.claims_to_avoid?.slice(0, 5) ?? [],
    conditioned_claims:
      claimsGuidance?.claims_conditioned?.slice(0, 4) ?? [],
    prompt_char_count: prompt.length,
    prompt_hash: createContentHash(prompt),
    bundle_hash: theoryBundle?.bundle_hash ?? methodBundle?.bundle_hash ?? null,
  };

  runtimePromptCache.set(cacheKey, runtimeContext);
  return runtimeContext;
}
