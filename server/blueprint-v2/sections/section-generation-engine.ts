import { setTimeout as delay } from "node:timers/promises";

import { getConfiguredLlmProvider } from "@/llm";
import {
  buildSourceHealthLookup,
  evaluateSectionEvidenceBinding,
} from "@/server/blueprint-engine/quality/section-evidence-binding";
import {
  isCentralClaimSection,
  semanticSourceRoleForSource,
} from "@/server/blueprint-engine/quality/semantic-source-use-policy";
import { resolveDomainGenerationProfile } from "@/server/blueprint-v2/lab/domain-generation-profile";
import type { MasterTemplateImportContextArtifact } from "@/server/blueprint-v2/lab/template-import-context";
import { deriveSectionWithoutLlm } from "@/server/blueprint-v2/sections/section-generation-fallback";
import {
  buildCitationPolicy,
  buildGenerationPrompt,
  buildWorkingReferenceLines,
} from "@/server/blueprint-v2/sections/section-generation-prompt";
import {
  type EnrichedPromptPlan,
  type ExtendedManifestItem,
  type ExtendedPlanItem,
  getDraftText,
  getMethodGuidanceItem,
  loadReadonlyConsolidatedEvidence,
  type PriorSection,
  resolveSectionExecutionProfile,
  type SectionExecutionProfile,
  type WaveContextState,
} from "@/server/blueprint-v2/sections/section-generation-shared";
import {
  buildRetryPrompt,
  validateDraftAgainstPlan,
} from "@/server/blueprint-v2/sections/section-generation-validator";
import { enforceEditorialWordBudget } from "@/server/blueprint-v2/editorial/academic-editorial-policy";
import { normalizeGeneratedSectionContent } from "@/server/blueprint-v2/sections/section-output-normalizer";
import type {
  DomainGenerationProfile,
  EvidenceLedger,
  MasterBlueprintEngineProject,
  MasterSectionDraft,
  MasterTemplateRuntime,
  SectionContentBlock,
  SectionPromptPlan,
  SectionSupportLevel,
} from "@/server/blueprint-v2/types";
import { clipText, parseBulletLines } from "@/server/blueprint-v2/utils";

const WAVE_ORDER = [
  "intake_refinement",
  "foundation",
  "development",
  "support_integration",
  "refinement_and_final",
  "citation_and_references",
] as const;

function resolveSupportLevel(input: {
  pdfSourceCount: number;
  sourceCount: number;
  webSourceCount: number;
  assumptionCount: number;
}): SectionSupportLevel {
  if (input.pdfSourceCount > 0) {
    return "pdf_supported";
  }

  if (input.sourceCount > 0) {
    return "reference_supported";
  }

  if (input.webSourceCount > 0) {
    return "web_supported";
  }

  if (input.assumptionCount > 0) {
    return "assumption_backed";
  }

  return "intake_supported";
}

function resolveModelForProfile(profile: SectionExecutionProfile) {
  if (profile.model_tier === "deterministic") {
    return undefined;
  }

  const explicit =
    profile.model_tier === "high"
      ? process.env.LLM_MODEL_HIGH
      : profile.model_tier === "medium"
        ? process.env.LLM_MODEL_MEDIUM
        : process.env.LLM_MODEL_LOW;

  if (explicit?.trim()) {
    return explicit.trim();
  }

  if (profile.model_tier === "high") {
    return process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";
  }

  if (profile.model_tier === "medium") {
    return "gpt-5.4-mini";
  }

  return "gpt-5.4-nano";
}

function buildWaveContextState(input: {
  drafts: MasterSectionDraft[];
  project: MasterBlueprintEngineProject;
}): WaveContextState {
  const summarizeSections = (keys: string[], fallback: string) => {
    const lines = input.drafts
      .filter((draft) => keys.includes(draft.section_key))
      .map(
        (draft) =>
          `${draft.title}: ${
            clipText(draft.content.replace(/\s+/g, " ").trim(), 220) ??
            draft.content
          }`,
      );

    return lines.length > 0 ? lines.join("\n") : fallback;
  };

  return {
    foundation_context: summarizeSections(
      [
        "problem_statement",
        "research_questions",
        "general_objective",
        "specific_objectives",
        "justification",
      ],
      `Contexto base del proyecto: ${input.project.intake.topic}`,
    ),
    development_context: summarizeSections(
      [
        "introduction",
        "theoretical_framework",
        "research_antecedents",
        "state_of_the_art",
        "theoretical_bases",
        "terms_definition",
      ],
      "NO_DISPONIBLE",
    ),
    support_integration_context: summarizeSections(
      [
        "methodology",
        "methodological_approach",
        "research_design",
        "analysis_plan",
        "variables_or_categories",
        "variables_indicators",
        "categories_subcategories",
      ],
      "NO_DISPONIBLE",
    ),
    final_synthesis_inputs: summarizeSections(
      [
        "problem_statement",
        "general_objective",
        "methodology",
        "scope_and_limitations",
        "abstract",
      ],
      "NO_DISPONIBLE",
    ),
    refined_title:
      clipText(
        [
          getDraftText(input.drafts, "problem_statement"),
          getDraftText(input.drafts, "general_objective"),
          getDraftText(input.drafts, "methodology"),
        ]
          .filter(Boolean)
          .join(" | "),
        180,
      ) ?? input.project.intake.topic,
  };
}

function buildContentBlocks(input: {
  draft: {
    section_key: string;
    title: string;
    content: string;
    content_kind: string;
    supported_source_ids: string[];
    supported_pdf_source_ids: string[];
    supported_web_source_ids: string[];
    supported_assumption_ids: string[];
    evidence_snippet_ids: string[];
    used_evidence_ids?: string[];
    used_original_excerpt_ids?: string[];
    used_asset_keys: string[];
    evidence_support_summary?: MasterSectionDraft["evidence_support_summary"];
  };
  evidenceLedger: EvidenceLedger;
}) {
  const blocks: SectionContentBlock[] = [];
  const baseMeta = {
    source_ids: input.draft.supported_source_ids,
    pdf_source_ids: input.draft.supported_pdf_source_ids,
    web_source_ids: input.draft.supported_web_source_ids,
    assumption_ids: input.draft.supported_assumption_ids,
    snippet_ids: input.draft.evidence_snippet_ids,
    evidence_ids: input.draft.used_evidence_ids ?? [],
    original_excerpt_ids: input.draft.used_original_excerpt_ids ?? [],
    asset_keys: input.draft.used_asset_keys ?? [],
    evidence_support_summary: input.draft.evidence_support_summary,
  };
  const parseDelimitedTable = (value: string) => {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const tableLines = lines.filter((line) => line.includes("\t"));

    if (tableLines.length < 2) {
      return null;
    }

    const rows = tableLines.map((line) =>
      line.split("\t").map((cell) => cell.trim()).filter(Boolean),
    );
    const columnCount = Math.max(...rows.map((row) => row.length));

    if (columnCount < 2) {
      return null;
    }

    const [columns, ...bodyRows] = rows;
    return {
      columns,
      rows: bodyRows,
    };
  };
  const parsedTable = parseDelimitedTable(input.draft.content);

  if (parsedTable) {
    const nonTableText = input.draft.content
      .split(/\r?\n/)
      .filter((line) => !line.includes("\t"))
      .join("\n")
      .trim();

    if (nonTableText) {
      blocks.push({
        block_id: `${input.draft.section_key}:paragraph:0`,
        kind: "rich_text",
        role: "paragraph",
        text: nonTableText,
        ...baseMeta,
      });
    }

    blocks.push({
      block_id: `${input.draft.section_key}:table:0`,
      kind: "structured_data",
      role:
        input.draft.section_key === "schedule"
          ? "timeline"
          : input.draft.section_key === "budget"
            ? "budget"
            : "table",
      title: input.draft.title,
      text: null,
      structured_data: {
        schema_type:
          input.draft.section_key === "schedule"
            ? "timeline"
            : input.draft.section_key === "budget"
              ? "table"
              : "table",
        columns: parsedTable.columns,
        rows: parsedTable.rows,
      },
      ...baseMeta,
    });
  } else if (
    input.draft.content_kind === "bullet_list" ||
    input.draft.content_kind === "numbered_list"
  ) {
    const items = parseBulletLines(input.draft.content);
    blocks.push({
      block_id: `${input.draft.section_key}:list`,
      kind: "rich_text",
      role: "list",
      text: input.draft.content,
      children: items.map((item, index) => ({
        block_id: `${input.draft.section_key}:item:${index}`,
        kind: "rich_text",
        role: "list_item",
        text: item,
        ...baseMeta,
      })),
      ...baseMeta,
    });
  } else {
    blocks.push({
      block_id: `${input.draft.section_key}:paragraph:0`,
      kind: "rich_text",
      role:
        input.draft.section_key === "abstract"
          ? "abstract"
          : input.draft.section_key === "references"
            ? "reference_entry"
            : "paragraph",
      text: input.draft.content,
      ...baseMeta,
    });
  }

  input.draft.used_asset_keys.forEach((assetKey, index) => {
    const asset = input.evidenceLedger.assets.find(
      (item) => item.asset_key === assetKey,
    );

    if (!asset) {
      return;
    }

    if (asset.kind === "table") {
      blocks.push({
        block_id: `${input.draft.section_key}:asset:${index}`,
        kind: "structured_data",
        role:
          input.draft.section_key === "consistency_matrix" ? "matrix" : "table",
        title: asset.title,
        text: asset.caption ?? null,
        structured_data: {
          schema_type: "table",
          values: {
            asset_key: asset.asset_key,
            page_number: asset.page_number,
            text_content: asset.text_content,
          },
        },
        asset_ref: {
          asset_key: asset.asset_key,
          asset_kind: asset.kind,
          title: asset.title,
          caption: asset.caption,
          mime_type: asset.mime_type,
          source_ids: [asset.source_id],
          page_number: asset.page_number,
        },
        ...baseMeta,
      });
      return;
    }

    if (asset.kind === "equation") {
      blocks.push({
        block_id: `${input.draft.section_key}:asset:${index}`,
        kind: "structured_data",
        role: "equation",
        title: asset.title,
        text: asset.text_content ?? asset.caption ?? null,
        structured_data: {
          schema_type: "equation",
          values: {
            asset_key: asset.asset_key,
            page_number: asset.page_number,
            text_content: asset.text_content,
          },
        },
        asset_ref: {
          asset_key: asset.asset_key,
          asset_kind: asset.kind,
          title: asset.title,
          caption: asset.caption,
          mime_type: asset.mime_type,
          source_ids: [asset.source_id],
          page_number: asset.page_number,
        },
        ...baseMeta,
      });
      return;
    }

    blocks.push({
      block_id: `${input.draft.section_key}:asset:${index}`,
      kind: "asset",
      role: "figure",
      title: asset.title,
      text: asset.caption ?? null,
      asset_ref: {
        asset_key: asset.asset_key,
        asset_kind: asset.kind,
        title: asset.title,
        caption: asset.caption,
        mime_type: asset.mime_type,
        source_ids: [asset.source_id],
        page_number: asset.page_number,
      },
      ...baseMeta,
    });
  });

  return blocks;
}

function buildCitationIntents(input: {
  draft: {
    section_key: string;
    content: string;
    content_blocks?: SectionContentBlock[];
    used_reference_ids?: string[];
    supported_source_ids: string[];
    used_evidence_ids?: string[];
    citation_policy?: {
      expected_density: "none" | "low" | "medium" | "high";
      citation_mode:
        | "inline_required"
        | "inline_optional"
        | "references_only"
        | "deferred_to_docx";
    };
  };
}) {
  if (
    !input.draft.used_reference_ids?.length ||
    input.draft.citation_policy?.citation_mode === "references_only"
  ) {
    return [];
  }

  const firstBlockId = input.draft.content_blocks?.[0]?.block_id ?? null;
  const sentenceHint =
    clipText(input.draft.content.replace(/\s+/g, " ").trim(), 180) ?? null;

  return input.draft.used_reference_ids.slice(0, 3).map((referenceId, index) => ({
    reference_id: referenceId,
    source_id:
      input.draft.supported_source_ids[index] ??
      input.draft.supported_source_ids[0] ??
      "NO_DISPONIBLE",
    evidence_id: input.draft.used_evidence_ids?.[index] ?? null,
    target_block_id: firstBlockId,
    target_sentence_hint: sentenceHint,
    citation_role:
      input.draft.section_key === "methodology"
        ? ("methodological" as const)
        : [
              "theoretical_framework",
              "theoretical_bases",
              "state_of_the_art",
              "research_antecedents",
            ].includes(input.draft.section_key)
          ? ("theoretical" as const)
          : input.draft.section_key === "analysis_plan"
            ? ("comparative" as const)
            : ("supporting" as const),
    strength:
      input.draft.citation_policy?.expected_density === "high"
        ? ("required" as const)
        : input.draft.citation_policy?.expected_density === "medium"
          ? ("recommended" as const)
          : ("optional" as const),
    insertion_mode: "defer_to_docx" as const,
  }));
}

function buildAssetPlacementIntents(input: {
  draft: {
    content_blocks?: SectionContentBlock[];
    used_asset_keys?: string[];
  };
  evidenceLedger: EvidenceLedger;
}) {
  if (!input.draft.used_asset_keys?.length) {
    return [];
  }

  const anchorBlockId =
    input.draft.content_blocks?.find((block) => block.role === "paragraph")?.block_id ??
    input.draft.content_blocks?.[0]?.block_id ??
    null;

  return input.draft.used_asset_keys
    .map((assetKey) =>
      input.evidenceLedger.assets.find((asset) => asset.asset_key === assetKey),
    )
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    .map((asset) => ({
      asset_key: asset.asset_key,
      placement_role:
        asset.kind === "table"
          ? ("table" as const)
          : asset.kind === "equation"
            ? ("equation" as const)
            : ("figure" as const),
      anchor_block_id: anchorBlockId,
      insert_after_block_id: anchorBlockId,
      caption_override: asset.caption ?? null,
      required_for_docx: true,
    }));
}

function buildUsedReferenceIds(input: {
  evidenceLedger: EvidenceLedger;
  sourceIds: string[];
}) {
  return Array.from(
    new Set(
      input.sourceIds
        .map((sourceId) =>
          input.evidenceLedger.source_registry.find(
            (source) =>
              source.source_id === sourceId || source.reference_id === sourceId,
          ),
        )
        .flatMap((source) => (source?.source_id ? [source.source_id] : [])),
    ),
  );
}

function canonicalizeSourceIds(input: {
  evidenceLedger: EvidenceLedger;
  sourceIds: string[];
}) {
  return Array.from(
    new Set(
      input.sourceIds.map((sourceId) => {
        const source = input.evidenceLedger.source_registry.find(
          (item) => item.source_id === sourceId || item.reference_id === sourceId,
        );

        return source?.source_id ?? sourceId;
      }),
    ),
  );
}

function shouldUseLlm(input: {
  providerAvailable: boolean;
  generationStrategy?: string;
  executionProfile: SectionExecutionProfile;
}) {
  if (input.executionProfile.execution_mode === "deterministic") {
    return false;
  }

  if (!input.providerAvailable) {
    return false;
  }

  if (input.generationStrategy === "blocked") {
    return false;
  }

  return true;
}

function buildPriorSections(
  planItem: ExtendedPlanItem,
  drafts: MasterSectionDraft[],
): PriorSection[] {
  return drafts
    .filter((draft) => planItem.depends_on_keys.includes(draft.section_key))
    .map((draft) => ({
      section_key: draft.section_key,
      title: draft.title,
      content: draft.content,
    }));
}

async function runLlmAttempt(input: {
  provider: NonNullable<ReturnType<typeof getConfiguredLlmProvider>>;
  prompt: string;
  sectionKey: string;
  profile: SectionExecutionProfile;
}) {
  return Promise.race([
    input.provider.generateTextDetailed({
      prompt: input.prompt,
      model: resolveModelForProfile(input.profile),
      trackingLabel: `section:${input.sectionKey}`,
    }),
    delay(input.profile.timeout_ms).then(() => {
      throw new Error(
        `Se excedio el tiempo operativo por seccion (${input.profile.timeout_ms} ms).`,
      );
    }),
  ]);
}

async function generateDraftForPlanItem(input: {
  project: MasterBlueprintEngineProject;
  evidenceLedger: EvidenceLedger;
  promptPlan: EnrichedPromptPlan;
  provider: ReturnType<typeof getConfiguredLlmProvider> | null;
  domainProfile: DomainGenerationProfile;
  templateImportContext: MasterTemplateImportContextArtifact | null;
  planItem: ExtendedPlanItem;
  drafts: MasterSectionDraft[];
  waveContexts: WaveContextState;
  consolidatedEvidence: Awaited<
    ReturnType<typeof loadReadonlyConsolidatedEvidence>
  >;
}): Promise<MasterSectionDraft | null> {
  const manifestItem = input.promptPlan.prompt_manifest.find(
    (item) => item.section_key === input.planItem.section_key,
  ) as ExtendedManifestItem | undefined;

  if (!manifestItem) {
    return null;
  }

  const executionProfile = resolveSectionExecutionProfile(
    input.planItem.section_key,
    input.planItem.wave,
  );
  const priorSections = buildPriorSections(input.planItem, input.drafts);
  const runtimePromptContext = buildGenerationPrompt({
    basePrompt: manifestItem.prompt,
    planItem: input.planItem,
    manifestItem,
    promptPlan: input.promptPlan,
    priorSections,
    waveContexts: input.waveContexts,
    workingDrafts: input.drafts,
    evidenceLedger: input.evidenceLedger,
    consolidatedEvidence: input.consolidatedEvidence,
    domainProfile: input.domainProfile,
    executionProfile,
    project: input.project,
  });
  const prompt = runtimePromptContext.prompt;
  const useLlm = shouldUseLlm({
    providerAvailable: Boolean(input.provider),
    generationStrategy: input.planItem.generation_strategy,
    executionProfile,
  });
  let supportedSourceIds = canonicalizeSourceIds({
    evidenceLedger: input.evidenceLedger,
    sourceIds:
      runtimePromptContext.used_source_ids.length > 0
        ? runtimePromptContext.used_source_ids
        : (manifestItem.source_ids ?? manifestItem.supporting_source_ids ?? []),
  });
  if (isCentralClaimSection(input.planItem.section_key)) {
    const sourceHealthLookup = buildSourceHealthLookup(
      (input.templateImportContext?.source_priorities ?? []) as Array<Record<string, unknown>>,
    );
    const directSourceIds = supportedSourceIds.filter((sourceId) => {
      const health = sourceHealthLookup.get(sourceId);
      if (!health) return true;
      const role = semanticSourceRoleForSource({ source: health }).role;
      return role === "central_method_source" || role === "direct_topic_source";
    });
    if (directSourceIds.length > 0) {
      supportedSourceIds = directSourceIds;
    }
  }
  const usedAssetKeys = runtimePromptContext.used_asset_keys;
  const fallbackContent = deriveSectionWithoutLlm({
    sectionKey: input.planItem.section_key,
    title: input.planItem.title,
    project: input.project,
    evidenceLedger: input.evidenceLedger,
    drafts: input.drafts,
    runtimePromptContext,
    consolidatedEvidence: input.consolidatedEvidence,
    methodGuidance: getMethodGuidanceItem(
      input.promptPlan,
      input.planItem.section_key,
    ),
  });
  const usedReferenceIds = buildUsedReferenceIds({
    evidenceLedger: input.evidenceLedger,
    sourceIds: supportedSourceIds,
  });
  const sourceTitlesForGuards = input.evidenceLedger.source_registry
    .filter(
      (source) =>
        supportedSourceIds.includes(source.source_id) ||
        (source.reference_id
          ? supportedSourceIds.includes(source.reference_id)
          : false),
    )
    .map((source) => source.title);

  let content = fallbackContent;
  let finalPrompt = prompt;
  let llmSucceeded = false;
  let attemptCount = 0;
  let retryReasons: string[] = [];
  let fallbackCause: string | null = null;
  let draftLlmMetrics:
    | {
        provider: string;
        model: string;
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        cost_usd: number;
        cost_cad: number;
        duration_ms: number;
      }
    | undefined;
  let qualityChecks = {
    min_words_pass: true,
    max_words_pass: true,
    required_structure_pass: true,
    critical_assets_pass: true,
    claims_guard_pass: true,
    language_pass: true,
    format_contamination_pass: true,
    citation_deferred_pass: true,
    punctuation_pass: true,
    section_opening_pass: true,
    objective_repetition_pass: true,
    keywords_one_line_pass: true,
    editorial_word_budget_pass: true,
    opening_phrase_diversity_pass: true,
  };
  let cleanupWarnings: string[] = [];

  if (useLlm) {
    const maxAttempts = Math.max(
      executionProfile.max_retry_attempts,
      input.planItem.retry_policy?.max_attempts ?? 1,
    );
    let attemptPrompt = prompt;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptCount = attempt;
      const candidate = await runLlmAttempt({
        provider: input.provider!,
        prompt: attemptPrompt,
        sectionKey: input.planItem.section_key,
        profile: executionProfile,
      }).catch(() => null);

      if (!candidate?.text?.trim()) {
        if (attempt === maxAttempts) {
          fallbackCause = "empty_or_unusable_llm_response";
          break;
        }

        retryReasons = [
          ...retryReasons,
          "La respuesta anterior quedo vacia o no fue usable.",
        ];
        attemptPrompt = buildRetryPrompt({
          originalPrompt: prompt,
          previousContent: content,
        failures: ["La respuesta anterior quedo vacia o no fue usable."],
        planItem: input.planItem,
        executionProfile,
        targetLanguage: input.project.language,
      });
        finalPrompt = attemptPrompt;
        continue;
      }

      const normalizedCandidate = normalizeGeneratedSectionContent({
        content: candidate.text,
        title: input.planItem.title,
        sectionKey: input.planItem.section_key,
        sourceTitles: sourceTitlesForGuards,
      });
      const budgetCandidate = enforceEditorialWordBudget({
        content: normalizedCandidate.content,
        max_words: input.planItem.max_words,
        content_kind: input.planItem.content_kind,
      });
      const quality = validateDraftAgainstPlan({
        content: budgetCandidate.content,
        planItem: input.planItem,
        usedAssetKeys,
        blockedClaims: runtimePromptContext.blocked_claims,
        executionProfile,
        usedReferenceIds,
        sourceTitles: sourceTitlesForGuards,
        targetLanguage: input.project.language,
      });

      content = budgetCandidate.content;
      cleanupWarnings = [
        ...cleanupWarnings,
        ...normalizedCandidate.warnings,
        ...budgetCandidate.warnings,
      ];
      finalPrompt = attemptPrompt;
      qualityChecks = {
        ...quality.qualityChecks,
        ...normalizedCandidate.qualityChecks,
      };
      draftLlmMetrics = {
        provider: candidate.usage.provider,
        model: candidate.usage.model,
        input_tokens: candidate.usage.inputTokens,
        cached_input_tokens: candidate.usage.cachedInputTokens,
        output_tokens: candidate.usage.outputTokens,
        total_tokens: candidate.usage.totalTokens,
        cost_usd: candidate.usage.costUsd,
        cost_cad: candidate.usage.costCad,
        duration_ms: candidate.usage.durationMs,
      };

      if (quality.passed || attempt === maxAttempts) {
        llmSucceeded = quality.passed || content.length > 0;
        if (!quality.passed && attempt === maxAttempts) {
          retryReasons = [...retryReasons, ...quality.failures];
        }
        break;
      }

      retryReasons = [...retryReasons, ...quality.failures];
      attemptPrompt = buildRetryPrompt({
        originalPrompt: prompt,
        previousContent: content,
        failures: quality.failures,
        planItem: input.planItem,
        executionProfile,
        targetLanguage: input.project.language,
      });
      finalPrompt = attemptPrompt;
    }
  }

  if (!useLlm || !llmSucceeded) {
    if (!useLlm) {
      fallbackCause =
        executionProfile.execution_mode === "deterministic"
          ? "deterministic_section"
          : "provider_unavailable_or_blocked_strategy";
    }

    const normalizedFallback = normalizeGeneratedSectionContent({
      content: content.trim() || fallbackContent,
      title: input.planItem.title,
      sectionKey: input.planItem.section_key,
      sourceTitles: sourceTitlesForGuards,
    });
    const budgetFallback = enforceEditorialWordBudget({
      content: normalizedFallback.content,
      max_words: input.planItem.max_words,
      content_kind: input.planItem.content_kind,
    });
    content = budgetFallback.content;
    cleanupWarnings = [
      ...cleanupWarnings,
      ...normalizedFallback.warnings,
      ...budgetFallback.warnings,
    ];
    const fallbackQuality = validateDraftAgainstPlan({
      content,
      planItem: input.planItem,
      usedAssetKeys,
      blockedClaims: runtimePromptContext.blocked_claims,
      executionProfile,
      usedReferenceIds,
      sourceTitles: sourceTitlesForGuards,
      targetLanguage: input.project.language,
    });
    qualityChecks = {
      ...fallbackQuality.qualityChecks,
      ...normalizedFallback.qualityChecks,
    };
    retryReasons = [...retryReasons, ...fallbackQuality.failures];
  }

  const citationPolicy = buildCitationPolicy({
    sectionKey: input.planItem.section_key,
    wave: input.planItem.wave,
    domainProfile: input.domainProfile,
  });
  const draft: MasterSectionDraft = {
    section_key: input.planItem.section_key,
    title: input.planItem.title,
    phase: input.planItem.phase,
    wave: input.planItem.wave,
    generation_strategy: input.planItem.generation_strategy,
    prompt_mode: input.planItem.prompt_mode,
    domain_profile: input.domainProfile,
    content: content.trim(),
    content_kind: input.planItem.content_kind,
    content_format_version: "v2",
    support_level: resolveSupportLevel({
      pdfSourceCount: manifestItem.supporting_pdf_source_ids.length,
      sourceCount: manifestItem.supporting_source_ids.length,
      webSourceCount: manifestItem.supporting_web_source_ids.length,
      assumptionCount: manifestItem.supporting_assumption_ids.length,
    }),
    supported_source_ids: supportedSourceIds,
    supported_pdf_source_ids: manifestItem.supporting_pdf_source_ids,
    supported_web_source_ids: manifestItem.supporting_web_source_ids,
    supported_assumption_ids:
      manifestItem.assumption_ids ?? manifestItem.supporting_assumption_ids,
    evidence_snippet_ids: runtimePromptContext.used_snippet_ids,
    used_evidence_ids: runtimePromptContext.used_evidence_ids,
    used_original_excerpt_ids: runtimePromptContext.used_original_excerpt_ids,
    used_asset_keys: usedAssetKeys,
    used_reference_ids: usedReferenceIds,
    citation_policy: citationPolicy,
    execution_profile: {
      complexity: executionProfile.complexity,
      execution_mode: executionProfile.execution_mode,
      timeout_ms: executionProfile.timeout_ms,
      max_retry_attempts: executionProfile.max_retry_attempts,
      prompt_budget: executionProfile.prompt_budget,
      model_tier: executionProfile.model_tier,
    },
    llm_metrics: draftLlmMetrics,
    attempt_count: attemptCount,
    retry_reasons: Array.from(new Set(retryReasons)),
    fallback_cause: fallbackCause,
    prompt_hash: runtimePromptContext.prompt_hash,
    bundle_hash: runtimePromptContext.bundle_hash ?? null,
    quality_checks: qualityChecks,
    warnings: [
      ...(runtimePromptContext.used_snippet_ids.length === 0 &&
      runtimePromptContext.used_original_excerpt_ids.length === 0
        ? [
            "La seccion se redacto con soporte directo limitado y depende mas del intake/assumptions.",
          ]
        : []),
      ...(input.planItem.needs_followup_before_strong_draft
        ? [
            "La seccion conserva followups pendientes; revisar prudencia antes de persistir.",
          ]
        : []),
      ...(fallbackCause
        ? [`La seccion uso fallback local por: ${fallbackCause}.`]
        : []),
      ...Array.from(new Set(cleanupWarnings)),
    ],
    prompt: finalPrompt,
  };
  const evidenceBinding = evaluateSectionEvidenceBinding({
    section_key: draft.section_key,
    title: draft.title,
    content: draft.content,
    used_evidence_ids: draft.used_evidence_ids ?? [],
    used_source_ids: draft.supported_source_ids,
    used_original_excerpt_ids: draft.used_original_excerpt_ids ?? [],
    used_asset_keys: draft.used_asset_keys ?? [],
    evidence_units: input.consolidatedEvidence?.evidence_units ?? [],
    source_health: (input.templateImportContext?.source_priorities ?? []) as Array<
      Record<string, unknown>
    >,
  });
  draft.section_evidence_binding = evidenceBinding;
  draft.evidence_support_summary = evidenceBinding.evidence_support_summary;
  draft.unsupported_or_cautious_claim_warnings =
    evidenceBinding.unsupported_or_cautious_claim_warnings;
  draft.warnings = Array.from(
    new Set([
      ...draft.warnings,
      ...evidenceBinding.unsupported_or_cautious_claim_warnings,
    ]),
  );
  const existingQualityChecks = draft.quality_checks;
  draft.quality_checks = {
    min_words_pass: existingQualityChecks?.min_words_pass ?? true,
    max_words_pass: existingQualityChecks?.max_words_pass ?? true,
    required_structure_pass: existingQualityChecks?.required_structure_pass ?? true,
    critical_assets_pass: existingQualityChecks?.critical_assets_pass ?? true,
    claims_guard_pass:
      (existingQualityChecks?.claims_guard_pass ?? true) &&
      evidenceBinding.guard_failures.length === 0,
    language_pass: existingQualityChecks?.language_pass ?? true,
    format_contamination_pass:
      existingQualityChecks?.format_contamination_pass ?? true,
    citation_deferred_pass: existingQualityChecks?.citation_deferred_pass ?? true,
    punctuation_pass: existingQualityChecks?.punctuation_pass ?? true,
    research_logic_shape_pass: existingQualityChecks?.research_logic_shape_pass,
    section_opening_pass: existingQualityChecks?.section_opening_pass,
    objective_repetition_pass: existingQualityChecks?.objective_repetition_pass,
    keywords_one_line_pass: existingQualityChecks?.keywords_one_line_pass,
    editorial_word_budget_pass:
      existingQualityChecks?.editorial_word_budget_pass,
    opening_phrase_diversity_pass:
      existingQualityChecks?.opening_phrase_diversity_pass,
  };

  draft.content_blocks = buildContentBlocks({
    draft: {
      section_key: draft.section_key,
      title: draft.title,
      content: draft.content,
      content_kind: draft.content_kind,
      supported_source_ids: draft.supported_source_ids,
      supported_pdf_source_ids: draft.supported_pdf_source_ids,
      supported_web_source_ids: draft.supported_web_source_ids,
      supported_assumption_ids: draft.supported_assumption_ids,
      evidence_snippet_ids: draft.evidence_snippet_ids,
      used_evidence_ids: draft.used_evidence_ids,
      used_original_excerpt_ids: draft.used_original_excerpt_ids,
      used_asset_keys: draft.used_asset_keys ?? [],
      evidence_support_summary: draft.evidence_support_summary,
    },
    evidenceLedger: input.evidenceLedger,
  });
  draft.citation_intents = buildCitationIntents({
    draft: {
      section_key: draft.section_key,
      content: draft.content,
      content_blocks: draft.content_blocks,
      used_reference_ids: draft.used_reference_ids,
      supported_source_ids: draft.supported_source_ids,
      used_evidence_ids: draft.used_evidence_ids,
      citation_policy: draft.citation_policy,
    },
  });
  draft.asset_placement_intents = buildAssetPlacementIntents({
    draft: {
      content_blocks: draft.content_blocks,
      used_asset_keys: draft.used_asset_keys,
    },
    evidenceLedger: input.evidenceLedger,
  });

  return draft;
}

export async function generateSectionDraftsForKeys(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  promptPlan: SectionPromptPlan;
  templateImportContext?: Record<string, unknown>;
  sectionKeys: string[];
  existingDrafts?: MasterSectionDraft[];
  llmRequired?: boolean;
}): Promise<MasterSectionDraft[]> {
  let provider: ReturnType<typeof getConfiguredLlmProvider> | null = null;
  const llmRequired = input.llmRequired ?? true;

  try {
    provider = getConfiguredLlmProvider();
  } catch (error) {
    if (llmRequired) {
      throw error;
    }
    provider = null;
  }

  const templateImportContext =
    (input.templateImportContext as
      | MasterTemplateImportContextArtifact
      | null
      | undefined) ?? null;
  const promptPlan = input.promptPlan as EnrichedPromptPlan;
  const consolidatedEvidence = await loadReadonlyConsolidatedEvidence(
    templateImportContext?.source_snapshot.latest_consolidated_evidence_path ??
      templateImportContext?.source_snapshot.downstream_handoff_manifest_path ??
      null,
  );
  const domainProfile = resolveDomainGenerationProfile({
    project: input.project,
    evidenceLedger: input.evidenceLedger,
    templateImportContext,
  });
  const workingDrafts = [...(input.existingDrafts ?? [])];
  const generatedDrafts: MasterSectionDraft[] = [];
  const requestedKeys = new Set(input.sectionKeys);
  const orderedPlan = promptPlan.generation_plan
    .slice()
    .sort((left, right) => left.order - right.order) as ExtendedPlanItem[];
  let waveContexts = buildWaveContextState({
    drafts: workingDrafts,
    project: input.project,
  });
  waveContexts.references_working_set = buildWorkingReferenceLines({
    drafts: workingDrafts,
    evidenceLedger: input.evidenceLedger,
  });

  for (const waveKey of WAVE_ORDER) {
    const waveItems = orderedPlan.filter(
      (item) => (item.wave ?? "development") === waveKey,
    );

    for (const planItem of waveItems) {
      if (planItem.section_key === "consistency_matrix") {
        continue;
      }

      if (!requestedKeys.has(planItem.section_key)) {
        continue;
      }

      if (workingDrafts.some((draft) => draft.section_key === planItem.section_key)) {
        continue;
      }

      const draft = await generateDraftForPlanItem({
        project: input.project,
        evidenceLedger: input.evidenceLedger,
        promptPlan,
        provider,
        domainProfile,
        templateImportContext,
        planItem,
        drafts: workingDrafts,
        waveContexts,
        consolidatedEvidence,
      });

      if (!draft) {
        continue;
      }

      workingDrafts.push(draft);
      generatedDrafts.push(draft);
    }

    if (waveItems.length > 0) {
      waveContexts = buildWaveContextState({
        drafts: workingDrafts,
        project: input.project,
      });
      waveContexts.references_working_set = buildWorkingReferenceLines({
        drafts: workingDrafts,
        evidenceLedger: input.evidenceLedger,
      });
    }
  }

  return generatedDrafts;
}

export async function runSectionGenerationEngine(input: {
  project: MasterBlueprintEngineProject;
  masterTemplate: MasterTemplateRuntime;
  evidenceLedger: EvidenceLedger;
  promptPlan: SectionPromptPlan;
  templateImportContext?: Record<string, unknown>;
  llmRequired?: boolean;
}): Promise<MasterSectionDraft[]> {
  const sectionKeys = input.promptPlan.generation_plan
    .map((planItem) =>
      planItem.section_key === "consistency_matrix"
        ? null
        : planItem.section_key,
    )
    .filter((sectionKey): sectionKey is string => Boolean(sectionKey));

  return generateSectionDraftsForKeys({
    ...input,
    sectionKeys,
  });
}
