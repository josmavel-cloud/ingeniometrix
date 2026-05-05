import type {
  DocumentProvenanceReport,
  MasterSectionDraft,
  SectionProvenanceBreakdown,
} from "@/server/blueprint-v2/types";
import { normalizePercent } from "@/server/blueprint-v2/utils";

type SectionEvidenceProvenanceBreakdown = SectionProvenanceBreakdown & {
  used_evidence_count: number;
  used_original_excerpt_count: number;
  used_source_count: number;
  evidence_support_summary?: MasterSectionDraft["evidence_support_summary"];
  support_tier?: NonNullable<
    MasterSectionDraft["section_evidence_binding"]
  >["support_tier"];
  section_evidence_binding_score?: number;
  unsupported_or_cautious_claim_warnings?: string[];
};

function computeSectionBreakdown(section: MasterSectionDraft): SectionEvidenceProvenanceBreakdown {
  const wordCount = Math.max(1, section.content.split(/\s+/).filter(Boolean).length);
  let sourceWeight = section.supported_source_ids.length;
  let pdfWeight = section.supported_pdf_source_ids.length;
  let webWeight = section.supported_web_source_ids.length;
  let assumptionWeight = section.supported_assumption_ids.length;

  if (sourceWeight + pdfWeight + webWeight + assumptionWeight === 0) {
    assumptionWeight = 1;
  }

  const totalWeight = sourceWeight + pdfWeight + webWeight + assumptionWeight;

  return {
    section_key: section.section_key,
    word_count: wordCount,
    from_sources_pct: normalizePercent((sourceWeight / totalWeight) * 100),
    from_pdfs_pct: normalizePercent((pdfWeight / totalWeight) * 100),
    from_websearch_pct: normalizePercent((webWeight / totalWeight) * 100),
    from_assumption_backed_pct: normalizePercent((assumptionWeight / totalWeight) * 100),
    used_evidence_count: section.used_evidence_ids?.length ?? 0,
    used_original_excerpt_count: section.used_original_excerpt_ids?.length ?? 0,
    used_source_count: section.section_evidence_binding?.used_source_ids.length ?? section.supported_source_ids.length,
    evidence_support_summary: section.evidence_support_summary,
    support_tier: section.section_evidence_binding?.support_tier,
    section_evidence_binding_score:
      section.section_evidence_binding?.section_evidence_binding_score,
    unsupported_or_cautious_claim_warnings:
      section.unsupported_or_cautious_claim_warnings,
  };
}

export function buildDocumentProvenanceReport(
  sections: MasterSectionDraft[],
): DocumentProvenanceReport {
  const sectionBreakdown = sections.map(computeSectionBreakdown);
  const totalWords = Math.max(
    1,
    sectionBreakdown.reduce((total, section) => total + section.word_count, 0),
  );
  const weightedValue = (
    field:
      | "from_sources_pct"
      | "from_pdfs_pct"
      | "from_websearch_pct"
      | "from_assumption_backed_pct",
  ) =>
    sectionBreakdown.reduce(
      (total, section) => total + (section[field] / 100) * section.word_count,
      0,
    );
  const sectionsWithEvidenceIds = sectionBreakdown.filter(
    (section) => (section.used_evidence_count ?? 0) > 0,
  ).length;
  const sectionsWithOriginalExcerpts = sectionBreakdown.filter(
    (section) => (section.used_original_excerpt_count ?? 0) > 0,
  ).length;
  const sectionsWithOnlyContextualSupport = sectionBreakdown.filter(
    (section) => section.support_tier === "context_only",
  ).length;
  const sectionsWithAdjacentSourceWarnings = sectionBreakdown.filter((section) =>
    (section.unsupported_or_cautious_claim_warnings ?? []).some((warning) =>
      /adjacent|adyacente|background/i.test(warning),
    ),
  ).length;
  const bindingScore =
    sectionBreakdown.length === 0
      ? 0
      : Number(
          (
            sectionBreakdown.reduce(
              (total, section) =>
                total + (section.section_evidence_binding_score ?? 0),
              0,
            ) / sectionBreakdown.length
          ).toFixed(3),
        );

  return {
    from_sources_pct: normalizePercent((weightedValue("from_sources_pct") / totalWords) * 100),
    from_pdfs_pct: normalizePercent((weightedValue("from_pdfs_pct") / totalWords) * 100),
    from_websearch_pct: normalizePercent((weightedValue("from_websearch_pct") / totalWords) * 100),
    from_assumption_backed_pct: normalizePercent(
      (weightedValue("from_assumption_backed_pct") / totalWords) * 100,
    ),
    sections_with_evidence_ids: sectionsWithEvidenceIds,
    sections_with_original_excerpts: sectionsWithOriginalExcerpts,
    sections_with_only_contextual_support: sectionsWithOnlyContextualSupport,
    sections_with_adjacent_source_warnings: sectionsWithAdjacentSourceWarnings,
    section_evidence_binding_score: bindingScore,
    section_breakdown: sectionBreakdown,
  };
}
