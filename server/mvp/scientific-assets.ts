import type { MvpStep5EvidenceLedger, MvpStep5SourceAsset } from "./evidence-materialization-types";
import type { MvpStep6SectionDraft } from "./step6-blueprint-docx-types";

export function assessAssetQuality(asset: MvpStep5SourceAsset) {
  const box = asset.coordinates?.bbox;
  const width = asset.coordinates?.page_width ?? 0, height = asset.coordinates?.page_height ?? 0;
  const reasons: string[] = [];
  if (!box || !width || !height || asset.coordinates?.status !== "exact_bbox") reasons.push("unknown_geometry");
  if (asset.render_strategy !== "layout_crop" || !asset.body_image_path) reasons.push("arbitrary_page_fragment");
  if (!asset.caption_text?.trim() && asset.asset_kind !== "equation") reasons.push("missing_caption");
  if (asset.warnings.some((flag) => /inferred from caption|no native object bbox/i.test(flag))) reasons.push("unverified_caption_region");
  if (asset.caption_text && asset.asset_kind !== "equation" && !/^(?:figure|figura|fig\.?|table|tabla)\s*\d/i.test(asset.caption_text.trim())) reasons.push("body_mention_not_caption");
  if (asset.status !== "ready_for_review" || asset.errors.length) reasons.push("extraction_failed");
  if (box && width && height) {
    const ratio = box.width * box.height / (width * height);
    if (ratio > 0.65 || ratio < 0.003) reasons.push("implausible_extent");
    if (box.x < 0 || box.y < 0 || box.x + box.width > width + 1 || box.y + box.height > height + 1) reasons.push("clipped");
    if (box.y + box.height < height * 0.09 || box.y > height * 0.92) reasons.push("header_footer");
    if (box.width < 55 || box.height < 18) reasons.push("unreadable");
  }
  if ([...(asset.quality_flags ?? []), ...asset.warnings].some((flag) => /clipp|truncat|unrelated|overlap|large|partial|fragment|caption.only/i.test(flag))) reasons.push("geometry_warning");
  return { accepted: reasons.length === 0, reasons };
}

export function attachScientificAssets(drafts: MvpStep6SectionDraft[], ledger: MvpStep5EvidenceLedger, citedSources: Array<{ source_id: string; citation_label: string }>) {
  const results = ledger.source_assets.map((asset) => ({ asset_id: asset.asset_id, ...assessAssetQuality(asset) }));
  const used = new Set<string>();
  const placements: unknown[] = [];
  // Semantic relevance must be explicit; a geometric crop alone is not sufficient.
  for (const extraction of ledger.semantic_extractions) for (const review of extraction.asset_reviews) {
    if (!review.keep_for_blueprint || review.rendering_strategy === "do_not_use" || used.size >= 3) continue;
    const asset = ledger.source_assets.find((a) => a.asset_id === review.asset_id);
    const source = ledger.source_registry.find((s) => s.source_id === extraction.source_id);
    const label = citedSources.find((s) => s.source_id === extraction.source_id)?.citation_label;
    if (!asset || !source || !label || !assessAssetQuality(asset).accepted || used.has(asset.asset_id)) continue;
    const key = ({ theoretical_framework: "conceptual_framework", research_antecedents: "state_of_knowledge", problem_statement: "problem_definition", variables_or_categories: "conceptual_framework" } as Record<string, string>)[review.section_key] ?? review.section_key;
    const draft = drafts.find((d) => d.section_key === key);
    if (!draft || draft.blocks.some((b) => b.kind === "figure")) continue;
    const note = `Fuente: ${label.slice(1, -1).replace(/, (\d{4}[a-z]?)$/, " ($1)")}, p. ${asset.page_number}.`;
    draft.blocks.push({ kind: "figure", caption_type: asset.asset_kind, title: asset.caption_text ?? asset.caption_or_signal_text ?? "Expresion recuperada de la fuente", image_path: asset.body_image_path!, source_note: note, asset_key: asset.asset_id, source_id: source.source_id });
    draft.used_asset_keys.push(asset.asset_id); used.add(asset.asset_id);
    placements.push({ asset_id: asset.asset_id, source_reference_id: source.reference_id, doi: source.doi, source_document: ledger.pdf_materializations.find((m) => m.source_id === source.source_id)?.source_pdf_path, page: asset.page_number, asset_type: asset.asset_kind, bbox: asset.coordinates?.bbox, original_caption: asset.caption_text, extraction_method: asset.detection_method, confidence: null, relevance_score_100: review.relevance_score_100, confidence_note: "Deterministic geometry accepted; no calibrated confidence estimate.", section: key });
  }
  return { candidates: results, accepted_for_document: placements };
}
