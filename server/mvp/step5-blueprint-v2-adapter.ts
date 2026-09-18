import type {
  BlueprintSourceRecord,
  EvidenceLedger,
  EvidenceSnippet,
  ExtractedEvidencePack,
  PdfAssetRecord,
} from "@/server/blueprint-v2/types";
import type {
  MvpStep5EvidenceCard,
  MvpStep5EvidenceLedger,
  MvpStep5SemanticExtraction,
  MvpStep5SourceAsset,
  MvpStep5SourceRegistryRecord,
  MvpStep5VisualLocalizedAsset,
} from "@/server/mvp/evidence-materialization-types";

function clip(value: string | null | undefined, maxChars: number) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).trim()}...` : text;
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, " ").replace(/\s+/g, " ").trim();
}

function confidence(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value / 100));
}

function mapSource(source: MvpStep5SourceRegistryRecord): BlueprintSourceRecord {
  return {
    source_id: source.source_id,
    reference_id: source.reference_id,
    origin: "selected_source",
    label: source.citation_key,
    title: source.title,
    normalized_title: normalizeTitle(source.title),
    doi: source.doi,
    authors: source.authors,
    year: source.year,
    venue: source.venue,
    abstract: null,
    landing_page_url: source.landing_page_url,
    pdf_url: null,
    query: null,
    snippet: source.selection_reason,
    selected_order: source.selected_order,
    citation_count: null,
    is_open_access: false,
    raw_openalex_json: null,
    raw_crossref_json: null,
    eligible_for_formal_reference: true,
  };
}

function snippetFromEvidenceItem(input: {
  extraction: MvpStep5SemanticExtraction;
  item: MvpStep5SemanticExtraction["evidence_items"][number];
}): EvidenceSnippet {
  return {
    snippet_id: `${input.extraction.source_id}:ev:${input.item.evidence_id}`,
    source_id: input.extraction.source_id,
    origin: input.extraction.evidence_basis === "PDF_FULLTEXT" || input.extraction.evidence_basis === "PDF_SAMPLE_TEXT"
      ? "pdf"
      : "source",
    label: input.item.claim_type,
    text: clip(input.item.supporting_quote_or_paraphrase_es || input.item.traceable_summary_es, 1200) ?? "",
    section_hint_keys: [input.item.section_key],
    confidence: confidence(input.item.confidence_100, 0.65),
  };
}

function fallbackSnippetFromCard(card: MvpStep5EvidenceCard): EvidenceSnippet {
  return {
    snippet_id: `${card.source_id}:card:${card.card_id}`,
    source_id: card.source_id,
    origin: card.evidence_basis === "PDF_FULLTEXT" || card.evidence_basis === "PDF_SAMPLE_TEXT" ? "pdf" : "source",
    label: "Resumen trazable de fuente",
    text: clip(card.traceable_summary || card.text_excerpt, 1200) ?? "",
    section_hint_keys: card.assigned_section_keys,
    confidence: confidence(card.quality_score_100, 0.55),
  };
}

function mapAssetKind(kind: MvpStep5SourceAsset["asset_kind"]): PdfAssetRecord["kind"] {
  return kind === "figure" ? "image" : kind;
}

function mapAsset(input: {
  sourceAsset: MvpStep5SourceAsset;
  visual: MvpStep5VisualLocalizedAsset | null;
}): PdfAssetRecord {
  const visual = input.visual;
  const sourceAsset = input.sourceAsset;
  const filePath = visual?.cropped_image_path ?? sourceAsset.body_image_path ?? sourceAsset.structured_path ?? sourceAsset.image_path;
  const latex = visual?.equation_latex ?? null;
  return {
    source_id: sourceAsset.source_id,
    asset_key: sourceAsset.asset_id,
    title: clip(sourceAsset.caption_text ?? sourceAsset.caption_or_signal_text ?? visual?.visual_description_es, 180) ??
      `${sourceAsset.asset_kind} ${sourceAsset.asset_id}`,
    kind: mapAssetKind(sourceAsset.asset_kind),
    caption: sourceAsset.caption_text ?? sourceAsset.caption_or_signal_text,
    page_number: sourceAsset.page_number,
    file_path: filePath,
    mime_type: filePath ? "image/png" : null,
    width_px: visual?.bbox_pixels?.width ?? sourceAsset.coordinates?.page_width ?? null,
    height_px: visual?.bbox_pixels?.height ?? sourceAsset.coordinates?.page_height ?? null,
    text_content: sourceAsset.asset_kind === "equation" ? latex : clip(sourceAsset.nearby_text_excerpt, 900),
    extraction_origin: "pdf_native",
    extracted: Boolean(filePath || latex),
  };
}

function firstSectionText(extraction: MvpStep5SemanticExtraction | null, sectionKey: string) {
  return clip(
    extraction?.evidence_items.find((item) => item.section_key === sectionKey)?.traceable_summary_es,
    900,
  );
}

function firstClaimText(extraction: MvpStep5SemanticExtraction | null, matcher: RegExp) {
  return clip(
    extraction?.evidence_items.find((item) => matcher.test(item.claim_type) || matcher.test(item.section_key))
      ?.traceable_summary_es,
    900,
  );
}

function buildPack(input: {
  source: MvpStep5SourceRegistryRecord;
  extraction: MvpStep5SemanticExtraction | null;
  card: MvpStep5EvidenceCard | null;
  snippets: EvidenceSnippet[];
  assets: PdfAssetRecord[];
}): ExtractedEvidencePack {
  const methodSignal = firstSectionText(input.extraction, "methodology") ??
    input.extraction?.technique_method_theory[0]?.description_es ??
    null;
  const limitationSignal = input.extraction?.limitations[0]?.limitation_es ?? null;
  const summary = clip(
    input.extraction?.evidence_items.map((item) => item.traceable_summary_es).filter(Boolean).join(" ") ||
      input.card?.traceable_summary,
    1500,
  );

  return {
    source_id: input.source.source_id,
    problem_signal: firstSectionText(input.extraction, "problem_statement"),
    method_signal: clip(methodSignal, 900),
    context_signal: firstSectionText(input.extraction, "theoretical_framework") ??
      firstClaimText(input.extraction, /context|definition|theory|framework|marco|teor/i),
    finding_signal: firstClaimText(input.extraction, /finding|result|hallazgo|resultado|antecedent/i),
    limitation_signal: clip(limitationSignal, 900),
    future_line_signal: firstClaimText(input.extraction, /future|gap|brecha|linea/i),
    abstract_summary: input.card?.evidence_basis === "ABSTRACT_METADATA" ? clip(input.card.text_excerpt, 1200) : null,
    pdf_summary: input.card?.evidence_basis === "PDF_FULLTEXT" || input.card?.evidence_basis === "PDF_SAMPLE_TEXT"
      ? summary
      : null,
    pdf_sections: {
      abstract: null,
      methodology: clip(methodSignal, 900),
      results: firstClaimText(input.extraction, /result|finding|resultado|hallazgo/i),
      conclusions: null,
      limitations: clip(limitationSignal, 900),
      future_work: firstClaimText(input.extraction, /future|linea|gap|brecha/i),
    },
    snippets: input.snippets,
    assets: input.assets,
  };
}

export function adaptStep5LedgerToBlueprintV2(input: MvpStep5EvidenceLedger): EvidenceLedger {
  const sourceRegistry = input.source_registry.map(mapSource);
  const cardsBySource = new Map(input.evidence_cards.map((card) => [card.source_id, card]));
  const extractionsBySource = new Map(input.semantic_extractions.map((extraction) => [extraction.source_id, extraction]));
  const visualByAssetId = new Map(input.visual_localized_assets.map((asset) => [asset.asset_id, asset]));
  const curatedAssetIds = new Set(input.curated_assets.map((asset) => asset.asset_id));
  const assetsBySource = new Map<string, PdfAssetRecord[]>();

  for (const sourceAsset of input.source_assets) {
    if (!visualByAssetId.has(sourceAsset.asset_id) && !curatedAssetIds.has(sourceAsset.asset_id)) {
      continue;
    }
    const visual = visualByAssetId.get(sourceAsset.asset_id) ?? null;
    const mapped = mapAsset({ sourceAsset, visual });
    assetsBySource.set(sourceAsset.source_id, [...(assetsBySource.get(sourceAsset.source_id) ?? []), mapped]);
  }

  const snippetsBySource = new Map<string, EvidenceSnippet[]>();
  for (const extraction of input.semantic_extractions) {
    for (const item of extraction.evidence_items) {
      const snippets = snippetsBySource.get(extraction.source_id) ?? [];
      snippets.push(snippetFromEvidenceItem({ extraction, item }));
      snippetsBySource.set(extraction.source_id, snippets);
    }
  }
  for (const card of input.evidence_cards) {
    if ((snippetsBySource.get(card.source_id) ?? []).length > 0) continue;
    snippetsBySource.set(card.source_id, [fallbackSnippetFromCard(card)]);
  }

  const evidencePacks = input.source_registry.map((source) => buildPack({
    source,
    extraction: extractionsBySource.get(source.source_id) ?? null,
    card: cardsBySource.get(source.source_id) ?? null,
    snippets: snippetsBySource.get(source.source_id) ?? [],
    assets: assetsBySource.get(source.source_id) ?? [],
  }));

  const warnings = [
    ...input.warnings,
    ...input.evidence_cards.flatMap((card) =>
      card.extraction_gaps.map((gap) => `${card.source_id}: ${gap}`),
    ),
  ];

  return {
    source_registry: sourceRegistry,
    evidence_packs: evidencePacks,
    assets: evidencePacks.flatMap((pack) => pack.assets),
    assumptions: [],
    snippets: evidencePacks.flatMap((pack) => pack.snippets),
    warnings: Array.from(new Set(warnings)).filter(Boolean),
  };
}
