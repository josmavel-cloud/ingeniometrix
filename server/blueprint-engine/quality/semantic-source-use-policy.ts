import type { EvidenceEngineHandoffV1 } from "@/server/blueprint-engine/contracts";
import type { MethodGenerationContractV1 } from "@/server/blueprint-engine/quality/method-generation-contract";
import type { ReducedEvidencePackV1 } from "@/server/blueprint-engine/quality/evidence-budget";
import {
  summarizeSourceHealthFromHandoff,
  type SourceHealthClassification,
} from "@/server/blueprint-engine/quality/source-health";
import type { AcademicDocument } from "@/server/blueprint-v2/lab/academic-document-model";
import type { MasterSectionDraft } from "@/server/blueprint-v2/types";

export type SemanticSourceRole =
  | "central_method_source"
  | "direct_topic_source"
  | "contextual_background_source"
  | "adjacent_source"
  | "do_not_use_for_claims";

export type SemanticSourceFindingScope =
  | "public_docx"
  | "draft_generation"
  | "reduced_pack_context";

export type SectionEvidenceUsePolicy = {
  section_key: string;
  policy: "central_only" | "direct_or_cautious" | "context_allowed" | "no_claim_support";
  allowed_roles: SemanticSourceRole[];
  blocked_roles_for_direct_claims: SemanticSourceRole[];
};

export type SemanticSourceUseFinding = {
  scope: SemanticSourceFindingScope;
  section_key: string;
  source_id: string;
  role: SemanticSourceRole;
  finding: "allowed" | "cautious" | "blocked_for_central_claims";
  reason: string;
  public_docx_visible: boolean;
};

export type SemanticSourceUseReport = {
  artifact_type: "semantic_source_use_report";
  artifact_version: "v1";
  generated_at: string;
  handoff_id: string;
  project_id: string;
  source_roles: Array<{
    source_id: string;
    role: SemanticSourceRole;
    source_health: SourceHealthClassification["source_health"];
    topic_fit: SourceHealthClassification["topic_fit"];
    allowed_evidence_use: SourceHealthClassification["allowed_evidence_use"];
    reason: string;
  }>;
  reduced_pack_role_distribution: Array<{
    source_id: string;
    role: SemanticSourceRole;
    reduced_evidence_unit_count: number;
    reduced_share: number;
  }>;
  section_findings: SemanticSourceUseFinding[];
  public_docx_source_use_findings: SemanticSourceUseFinding[];
  draft_generation_source_use_findings: SemanticSourceUseFinding[];
  reduced_pack_context_findings: SemanticSourceUseFinding[];
  adjacent_source_count: number;
  adjacent_reduced_evidence_unit_count: number;
  public_docx_central_section_adjacent_source_count: number;
  public_docx_central_section_context_only_source_count: number;
  draft_generation_central_section_adjacent_source_count: number;
  draft_generation_central_section_context_only_source_count: number;
  reduced_pack_central_section_adjacent_source_count: number;
  reduced_pack_central_section_context_only_source_count: number;
  central_section_adjacent_source_count: number;
  central_section_context_only_source_count: number;
  warnings: string[];
  blockers: string[];
};

const CENTRAL_SECTION_PATTERNS = [
  /theoretical/i,
  /teor/i,
  /framework/i,
  /marco/i,
  /method/i,
  /metod/i,
  /design/i,
  /dise/i,
  /objective/i,
  /objetivo/i,
  /question/i,
  /pregunta/i,
  /hypoth/i,
  /hipotes/i,
  /variable/i,
  /indicator/i,
  /indicador/i,
  /consistency_matrix/i,
  /matriz/i,
];

const CONTEXT_SECTION_PATTERNS = [
  /background/i,
  /antecedent/i,
  /antecedente/i,
  /context/i,
  /contexto/i,
  /state_of_the_art/i,
  /estado/i,
  /limitation/i,
  /limitacion/i,
];

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function isCentralClaimSection(sectionKey: string) {
  return CENTRAL_SECTION_PATTERNS.some((pattern) => pattern.test(sectionKey));
}

export function isContextSection(sectionKey: string) {
  return CONTEXT_SECTION_PATTERNS.some((pattern) => pattern.test(sectionKey));
}

export function semanticSourceRoleForSource(input: {
  source: SourceHealthClassification;
  methodContractSourceIds?: Set<string>;
}): { role: SemanticSourceRole; reason: string } {
  const methodSourceIds = input.methodContractSourceIds ?? new Set<string>();

  if (
    input.source.allowed_evidence_use === "do_not_use" ||
    input.source.source_health === "unresolved" ||
    input.source.source_health === "wrong_document_suspected"
  ) {
    return {
      role: "do_not_use_for_claims",
      reason: "source is unresolved, wrong-document-suspected, or explicitly unavailable for claims",
    };
  }

  if (
    input.source.allowed_evidence_use === "gap_only" ||
    input.source.source_health === "metadata_only" ||
    input.source.source_health === "unextractable_pdf"
  ) {
    return {
      role: "contextual_background_source",
      reason: "source is metadata-only, unextractable, or gap-only",
    };
  }

  if (input.source.topic_fit === "adjacent" || input.source.allowed_evidence_use === "cautious_support") {
    return {
      role: "adjacent_source",
      reason: "source is adjacent/cautious and cannot support central claims",
    };
  }

  if (methodSourceIds.has(input.source.source_id)) {
    return {
      role: "central_method_source",
      reason: "source supports the selected method/theory/model contract",
    };
  }

  if (input.source.topic_fit === "direct" && input.source.allowed_evidence_use === "direct_claim_support") {
    return {
      role: "direct_topic_source",
      reason: "source is direct-topic full evidence but not specifically selected as method source",
    };
  }

  return {
    role: "contextual_background_source",
    reason: "source is retained for context, not central claims",
  };
}

export function sectionEvidenceUsePolicy(sectionKey: string): SectionEvidenceUsePolicy {
  if (isCentralClaimSection(sectionKey)) {
    return {
      section_key: sectionKey,
      policy: "central_only",
      allowed_roles: ["central_method_source", "direct_topic_source"],
      blocked_roles_for_direct_claims: [
        "adjacent_source",
        "contextual_background_source",
        "do_not_use_for_claims",
      ],
    };
  }

  if (isContextSection(sectionKey)) {
    return {
      section_key: sectionKey,
      policy: "context_allowed",
      allowed_roles: [
        "central_method_source",
        "direct_topic_source",
        "contextual_background_source",
        "adjacent_source",
      ],
      blocked_roles_for_direct_claims: ["do_not_use_for_claims"],
    };
  }

  return {
    section_key: sectionKey,
    policy: "direct_or_cautious",
    allowed_roles: ["central_method_source", "direct_topic_source", "adjacent_source"],
    blocked_roles_for_direct_claims: ["contextual_background_source", "do_not_use_for_claims"],
  };
}

function sourceIdSetFromMethodContract(contract?: MethodGenerationContractV1 | null) {
  return new Set(contract?.source_ids ?? []);
}

function sectionSourcePairsFromDrafts(drafts?: MasterSectionDraft[] | null) {
  return (drafts ?? []).flatMap((draft) =>
    unique([
      ...(draft.supported_source_ids ?? []),
      ...(draft.supported_pdf_source_ids ?? []),
      ...((draft as { used_source_ids?: string[] }).used_source_ids ?? []),
    ]).map((sourceId) => ({ section_key: draft.section_key, source_id: sourceId })),
  );
}

function sectionSourcePairsFromDocuments(documents?: AcademicDocument[] | null) {
  return (documents ?? []).flatMap((document) =>
    document.sections.flatMap((section) =>
      unique(section.source_ids ?? []).map((sourceId) => ({
        section_key: section.section_key,
        source_id: sourceId,
      })),
    ),
  );
}

function sectionSourcePairsFromReducedPack(pack: ReducedEvidencePackV1) {
  return pack.evidence_units.flatMap((unit) =>
    unit.section_keys.map((sectionKey) => ({ section_key: sectionKey, source_id: unit.source_id })),
  );
}

function evaluateSectionSourcePairs(input: {
  pairs: Array<{ section_key: string; source_id: string }>;
  scope: SemanticSourceFindingScope;
  roles: Map<string, { source: SourceHealthClassification; role: SemanticSourceRole; reason: string }>;
}) {
  return unique(input.pairs.map((pair) => `${pair.section_key}::${pair.source_id}`))
    .map((pairKey) => {
      const [section_key, source_id] = pairKey.split("::");
      return { section_key: section_key ?? "unknown", source_id: source_id ?? "unknown" };
    })
    .map((pair) => {
      const role = input.roles.get(pair.source_id)?.role ?? "contextual_background_source";
      const policy = sectionEvidenceUsePolicy(pair.section_key);
      const blocked = policy.blocked_roles_for_direct_claims.includes(role);
      return {
        scope: input.scope,
        section_key: pair.section_key,
        source_id: pair.source_id,
        role,
        finding: blocked
          ? ("blocked_for_central_claims" as const)
          : role === "adjacent_source" || role === "contextual_background_source"
            ? ("cautious" as const)
            : ("allowed" as const),
        reason: blocked
          ? `Role ${role} is not allowed as direct claim support under ${policy.policy}.`
          : `Role ${role} is permitted under ${policy.policy}.`,
        public_docx_visible: input.scope === "public_docx",
      };
    })
    .filter((finding) => finding.source_id && finding.source_id !== "unknown");
}

function centralAdjacentFindings(findings: SemanticSourceUseFinding[]) {
  return findings.filter(
    (finding) =>
      isCentralClaimSection(finding.section_key) &&
      finding.role === "adjacent_source" &&
      finding.finding === "blocked_for_central_claims",
  );
}

function centralContextFindings(findings: SemanticSourceUseFinding[]) {
  return findings.filter(
    (finding) =>
      isCentralClaimSection(finding.section_key) &&
      (finding.role === "contextual_background_source" || finding.role === "do_not_use_for_claims"),
  );
}

export function buildSemanticSourceUseReport(input: {
  handoff: EvidenceEngineHandoffV1;
  reducedEvidencePack: ReducedEvidencePackV1;
  methodContract?: MethodGenerationContractV1 | null;
  drafts?: MasterSectionDraft[] | null;
  academicDocuments?: AcademicDocument[] | null;
  generatedAt?: string;
}): SemanticSourceUseReport {
  const sourceHealth = summarizeSourceHealthFromHandoff(input.handoff).sources;
  const methodSourceIds = sourceIdSetFromMethodContract(input.methodContract);
  const roles = new Map(
    sourceHealth.map((source) => {
      const role = semanticSourceRoleForSource({ source, methodContractSourceIds: methodSourceIds });
      return [source.source_id, { source, ...role }];
    }),
  );
  const reducedCounts = new Map<string, number>();
  for (const unit of input.reducedEvidencePack.evidence_units) {
    reducedCounts.set(unit.source_id, (reducedCounts.get(unit.source_id) ?? 0) + 1);
  }
  const reducedTotal = input.reducedEvidencePack.evidence_units.length || 1;
  const publicDocxFindings = evaluateSectionSourcePairs({
    pairs: sectionSourcePairsFromDocuments(input.academicDocuments),
    scope: "public_docx",
    roles,
  });
  const draftGenerationFindings = evaluateSectionSourcePairs({
    pairs: sectionSourcePairsFromDrafts(input.drafts),
    scope: "draft_generation",
    roles,
  });
  const reducedPackFindings = evaluateSectionSourcePairs({
    pairs: sectionSourcePairsFromReducedPack(input.reducedEvidencePack),
    scope: "reduced_pack_context",
    roles,
  });
  const sectionFindings = [
    ...publicDocxFindings,
    ...draftGenerationFindings,
    ...reducedPackFindings,
  ];
  const adjacentReducedCount = Array.from(reducedCounts.entries()).reduce((sum, [sourceId, count]) => {
    return sum + (roles.get(sourceId)?.role === "adjacent_source" ? count : 0);
  }, 0);
  const publicCentralAdjacent = centralAdjacentFindings(publicDocxFindings);
  const publicCentralContext = centralContextFindings(publicDocxFindings);
  const draftCentralAdjacent = centralAdjacentFindings(draftGenerationFindings);
  const draftCentralContext = centralContextFindings(draftGenerationFindings);
  const reducedCentralAdjacent = centralAdjacentFindings(reducedPackFindings);
  const reducedCentralContext = centralContextFindings(reducedPackFindings);
  const warnings = unique([
    adjacentReducedCount > 0
      ? `reduced_pack_context: adjacent_source_quarantined: ${adjacentReducedCount} reduced evidence units may be used only as contextual/cautious support.`
      : null,
    publicCentralAdjacent.length > 0
      ? `public_docx_source_use: ${publicCentralAdjacent.length} visible central section/source pairs cite adjacent sources as direct support.`
      : null,
    publicCentralContext.length > 0
      ? `public_docx_source_use: ${publicCentralContext.length} visible central section/source pairs rely on context-only or unavailable sources.`
      : null,
    draftCentralAdjacent.length > 0
      ? `draft_generation_source_use: ${draftCentralAdjacent.length} internal draft central section/source pairs carried adjacent-source context before public filtering.`
      : null,
    draftCentralContext.length > 0
      ? `draft_generation_source_use: ${draftCentralContext.length} internal draft central section/source pairs carried context-only/unavailable source context.`
      : null,
    reducedCentralAdjacent.length > 0
      ? `reduced_pack_context: ${reducedCentralAdjacent.length} reduced-pack central section/source pairs are adjacent-source context only.`
      : null,
    reducedCentralContext.length > 0
      ? `reduced_pack_context: ${reducedCentralContext.length} reduced-pack central section/source pairs are context-only or unavailable source context.`
      : null,
  ]);

  return {
    artifact_type: "semantic_source_use_report",
    artifact_version: "v1",
    generated_at: input.generatedAt ?? new Date().toISOString(),
    handoff_id: input.handoff.handoff_id,
    project_id: input.handoff.project_id,
    source_roles: sourceHealth.map((source) => {
      const role = roles.get(source.source_id);
      return {
        source_id: source.source_id,
        role: role?.role ?? "contextual_background_source",
        source_health: source.source_health,
        topic_fit: source.topic_fit,
        allowed_evidence_use: source.allowed_evidence_use,
        reason: role?.reason ?? "fallback role assignment",
      };
    }),
    reduced_pack_role_distribution: Array.from(reducedCounts.entries()).map(([sourceId, count]) => ({
      source_id: sourceId,
      role: roles.get(sourceId)?.role ?? "contextual_background_source",
      reduced_evidence_unit_count: count,
      reduced_share: Number((count / reducedTotal).toFixed(3)),
    })),
    section_findings: sectionFindings,
    public_docx_source_use_findings: publicDocxFindings,
    draft_generation_source_use_findings: draftGenerationFindings,
    reduced_pack_context_findings: reducedPackFindings,
    adjacent_source_count: Array.from(roles.values()).filter((entry) => entry.role === "adjacent_source").length,
    adjacent_reduced_evidence_unit_count: adjacentReducedCount,
    public_docx_central_section_adjacent_source_count: publicCentralAdjacent.length,
    public_docx_central_section_context_only_source_count: publicCentralContext.length,
    draft_generation_central_section_adjacent_source_count: draftCentralAdjacent.length,
    draft_generation_central_section_context_only_source_count: draftCentralContext.length,
    reduced_pack_central_section_adjacent_source_count: reducedCentralAdjacent.length,
    reduced_pack_central_section_context_only_source_count: reducedCentralContext.length,
    central_section_adjacent_source_count: publicCentralAdjacent.length,
    central_section_context_only_source_count: publicCentralContext.length,
    warnings,
    blockers: [],
  };
}

export function applySemanticSourceUsePolicyToAcademicDocument(input: {
  document: AcademicDocument;
  handoff: EvidenceEngineHandoffV1;
  methodContract?: MethodGenerationContractV1 | null;
}): AcademicDocument {
  const sourceHealth = summarizeSourceHealthFromHandoff(input.handoff).sources;
  const methodSourceIds = sourceIdSetFromMethodContract(input.methodContract);
  const roleBySourceId = new Map(
    sourceHealth.map((source) => [
      source.source_id,
      semanticSourceRoleForSource({ source, methodContractSourceIds: methodSourceIds }).role,
    ]),
  );
  let touched = 0;
  const sections = input.document.sections.map((section) => {
    if (!isCentralClaimSection(section.section_key)) {
      return section;
    }

    const allowedSourceIds = new Set(
      section.source_ids.filter((sourceId) => {
        const role = roleBySourceId.get(sourceId);
        return !role || role === "central_method_source" || role === "direct_topic_source";
      }),
    );

    if (allowedSourceIds.size === section.source_ids.length) {
      return section;
    }

    touched += 1;
    return {
      ...section,
      source_ids: section.source_ids.filter((sourceId) => allowedSourceIds.has(sourceId)),
      citation_anchors: section.citation_anchors.filter((anchor) =>
        anchor.source_ids.every((sourceId) => allowedSourceIds.has(sourceId)),
      ),
      warnings: unique([
        ...section.warnings,
        "Fuentes adyacentes/contextuales fueron retiradas como soporte directo de esta seccion central.",
      ]),
    };
  });

  if (touched === 0) {
    return input.document;
  }

  return {
    ...input.document,
    sections,
    warnings: unique([
      ...input.document.warnings,
      `semantic_source_use_policy_applied_to_${touched}_central_section(s)`,
    ]),
  };
}

export function renderSemanticSourceUseReport(report: SemanticSourceUseReport) {
  const renderFindings = (title: string, findings: SemanticSourceUseFinding[]) => [
    title,
    findings.length
      ? findings
          .filter((finding) => finding.finding !== "allowed")
          .slice(0, 25)
          .map(
            (finding) =>
              `- ${finding.section_key} / ${finding.source_id}: ${finding.finding} (${finding.role}); visible=${finding.public_docx_visible}`,
          )
          .join("\n") || "- only allowed findings"
      : "- none",
    "",
  ];

  return [
    "# Semantic Source Use Report",
    "",
    `- handoff_id: ${report.handoff_id}`,
    `- adjacent_source_count: ${report.adjacent_source_count}`,
    `- adjacent_reduced_evidence_unit_count: ${report.adjacent_reduced_evidence_unit_count}`,
    `- public_docx_central_section_adjacent_source_count: ${report.public_docx_central_section_adjacent_source_count}`,
    `- public_docx_central_section_context_only_source_count: ${report.public_docx_central_section_context_only_source_count}`,
    `- draft_generation_central_section_adjacent_source_count: ${report.draft_generation_central_section_adjacent_source_count}`,
    `- draft_generation_central_section_context_only_source_count: ${report.draft_generation_central_section_context_only_source_count}`,
    `- reduced_pack_central_section_adjacent_source_count: ${report.reduced_pack_central_section_adjacent_source_count}`,
    `- reduced_pack_central_section_context_only_source_count: ${report.reduced_pack_central_section_context_only_source_count}`,
    "",
    "Interpretation: public DOCX findings describe visible citation/support behavior. Draft and reduced-pack findings are internal diagnostics and should not be described as public DOCX citation violations.",
    "",
    "## Source Roles",
    ...report.source_roles.map(
      (source) =>
        `- ${source.source_id}: ${source.role} (${source.source_health}, ${source.topic_fit}, ${source.allowed_evidence_use})`,
    ),
    "",
    "## Finding Split",
    ...renderFindings("### Public DOCX Source Use Findings", report.public_docx_source_use_findings),
    ...renderFindings("### Draft Generation Source Use Findings", report.draft_generation_source_use_findings),
    ...renderFindings("### Reduced Pack Context Findings", report.reduced_pack_context_findings),
    "## Warnings",
    report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "- none",
    "",
  ].join("\n");
}
