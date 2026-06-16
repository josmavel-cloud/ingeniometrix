import type {
  DocumentProvenanceReport,
  MasterSectionDraft,
  SectionProvenanceBreakdown,
} from "@/server/blueprint-v2/types";
import { normalizePercent } from "@/server/blueprint-v2/utils";

function computeSectionBreakdown(section: MasterSectionDraft): SectionProvenanceBreakdown {
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
    field: keyof Omit<SectionProvenanceBreakdown, "section_key" | "word_count">,
  ) =>
    sectionBreakdown.reduce(
      (total, section) => total + (section[field] / 100) * section.word_count,
      0,
    );

  return {
    from_sources_pct: normalizePercent((weightedValue("from_sources_pct") / totalWords) * 100),
    from_pdfs_pct: normalizePercent((weightedValue("from_pdfs_pct") / totalWords) * 100),
    from_websearch_pct: normalizePercent((weightedValue("from_websearch_pct") / totalWords) * 100),
    from_assumption_backed_pct: normalizePercent(
      (weightedValue("from_assumption_backed_pct") / totalWords) * 100,
    ),
    section_breakdown: sectionBreakdown,
  };
}
