import type { MvpStep5EvidenceLedger, MvpStep5SemanticExtraction } from "./evidence-materialization-types";
import type { MethodEvidencePack } from "./scientific-decision-contracts";
import type { SupportDocument } from "./design-support-document";
import { fingerprint } from "./job-execution-context";

export type DesignSupportSource = {
  sourceId: string; gapId: string; title: string; authors: string[]; year: number | null;
  doi: string | null; observationIds: string[]; document: SupportDocument;
  provenance: "SYSTEM_DESIGN_SUPPORT";
  reusedFrom?: { policyVersion: string; jobId: string; checkpointId: string; checkpointHash: string;
    originalGapId: string; scientificIdentityHash: string; discoveryOperationId: string };
};
export type DesignSupportAddendum = {
  version: "design-support-addendum.v1"; userId: string; projectId: string; jobId: string;
  definitionHash: string; policyVersion: string; sources: DesignSupportSource[]; checksum: string;
};
export function sealDesignSupport(input: Omit<DesignSupportAddendum, "version" | "checksum">): DesignSupportAddendum {
  const value = { ...input, version: "design-support-addendum.v1" as const };
  return { ...value, checksum: fingerprint(value) };
}
export function validateDesignSupport(addendum: DesignSupportAddendum,
  identity: Pick<DesignSupportAddendum, "userId" | "projectId" | "jobId" | "definitionHash">) {
  const { checksum, ...value } = addendum;
  if (fingerprint(value) !== checksum || Object.entries(identity).some(([key, val]) => value[key as keyof typeof identity] !== val))
    throw new Error("DESIGN_SUPPORT_CONTEXT_MISMATCH");
  if (new Set(value.sources.map(source => source.sourceId)).size !== value.sources.length || value.sources.length > (value.policyVersion === "method-coverage-reconstruction.v1" ? 8 : 4))
    throw new Error("DESIGN_SUPPORT_SOURCE_LIMIT_OR_DUPLICATE");
  for (const source of value.sources) if (source.provenance !== "SYSTEM_DESIGN_SUPPORT" || !source.observationIds.length ||
    !/^[a-f0-9]{64}$/.test(source.document.sha256) || !source.document.passages.length)
    throw new Error("DESIGN_SUPPORT_PROVENANCE_INVALID");
}
export function supportEvidenceItems(source: DesignSupportSource): MethodEvidencePack["items"] {
  return source.document.passages.map((passage, index) => {
    // Legacy HTML must be annotated from its hash-verified retained body first.
    // A file format alone never grants methodological use.
    const kind = passage.contentKind ?? "METADATA";
    const substantive = kind === "FULL_TEXT_PASSAGE";
    return { source_id: source.sourceId, evidence_id: `${source.sourceId}:P${index + 1}`,
      section: substantive ? "methodology" : "context", excerpt: passage.text,
      summary: substantive ? "Pasaje original de apoyo metodológico; su aplicabilidad debe ser evaluada por el dictamen independiente." :
        kind === "ABSTRACT" ? "Resumen original disponible como contexto; no acredita procedimientos omitidos del resumen." :
        "Texto bibliográfico o descriptivo disponible como contexto; no constituye respaldo metodológico sustantivo.",
      evidence_level: substantive ? source.document.mediaType === "application/pdf" ? "PDF_SAMPLE_TEXT" : "HTML_PASSAGE" :
        kind === "ABSTRACT" ? "ABSTRACT_METADATA" : "VERIFIED_METADATA_ONLY",
      allowed_use: substantive ? "theory_or_method_support" : "context_only", locator: { citation_key: source.sourceId, reference_id: source.sourceId,
        source_id: source.sourceId, page_number: passage.page, chunk_id: passage.locator } };
  });
}
function sourceEvidenceBasis(source: DesignSupportSource) {
  const items = supportEvidenceItems(source);
  return items.find(item => item.allowed_use === "theory_or_method_support")?.evidence_level ??
    (items.some(item => item.evidence_level === "ABSTRACT_METADATA") ? "ABSTRACT_METADATA" : "VERIFIED_METADATA_ONLY");
}

export function augmentMethodEvidencePack(pack: MethodEvidencePack, addendum: DesignSupportAddendum): MethodEvidencePack {
  const items = [...pack.items, ...addendum.sources.flatMap(supportEvidenceItems)];
  return { ...pack, items, context_chars: JSON.stringify(items).length,
    // Supplemental sources are inspectable, but never represented as user-selected.
    selected_sources: pack.selected_sources,
    source_accounting: [...pack.source_accounting, ...addendum.sources.map(source => ({ source_id: source.sourceId,
      selected: false, inspected: true, evidence_level: sourceEvidenceBasis(source),
      extracted_items: source.document.passages.length, verified_items: source.document.passages.length,
      considered_by_selector: false, exclusion_reason: null }))] };
}

// Derived per-job context. The frozen ledger and the user's selection remain unchanged.
export function effectiveGenerationLedger(base: MvpStep5EvidenceLedger, addendum: DesignSupportAddendum,
  identity: Pick<DesignSupportAddendum, "userId" | "projectId" | "jobId" | "definitionHash">): MvpStep5EvidenceLedger {
  validateDesignSupport(addendum, identity);
  if (base.project_id !== identity.projectId) throw new Error("DESIGN_SUPPORT_CONTEXT_MISMATCH");
  const ledger = structuredClone(base);
  for (const source of addendum.sources) {
    if (ledger.source_registry.some(row => row.source_id === source.sourceId)) throw new Error("DESIGN_SUPPORT_ID_COLLISION");
    const reference = source.authors.length
      ? `${source.authors.join(", ")}. (${source.year ?? "s. f."}). ${source.title}. ${source.document.finalUrl}`
      : `${source.title}. (${source.year ?? "s. f."}). ${source.document.finalUrl}`;
    ledger.source_registry.push({ source_id: source.sourceId, reference_id: source.sourceId, project_reference_id: source.sourceId,
      selected_order: null, provider: "SYSTEM_DESIGN_SUPPORT", relevance_score: null, citation_key: source.sourceId,
      title: source.title, authors: source.authors, year: source.year, venue: null, doi: source.doi,
      landing_page_url: source.document.finalUrl, work_type: "METHODOLOGICAL_SUPPORT", has_abstract: source.document.passages.some(passage => passage.contentKind === "ABSTRACT"),
      has_doi: Boolean(source.doi), has_landing_page: true, formatted_reference: reference,
      formatting_status: "fallback_apa7_pending_renderer", selection_reason: "SYSTEM_DESIGN_SUPPORT" });
    ledger.references.push({ citation_key: source.sourceId, reference_id: source.sourceId, project_reference_id: source.sourceId,
      citation_style: ledger.citation_style, formatted_reference: reference, inline_citation_hint: source.title,
      reference_metadata: { title: source.title, authors: source.authors, year: source.year, venue: null, doi: source.doi,
        landing_page_url: source.document.finalUrl } });
    const items = supportEvidenceItems(source);
    const extraction: MvpStep5SemanticExtraction = { source_id: source.sourceId, reference_id: source.sourceId,
      citation_key: source.sourceId, prompt_version: addendum.version, model: null, status: "completed",
      evidence_basis: sourceEvidenceBasis(source),
      input_chunk_count: items.length, input_char_count: items.reduce((sum, item) => sum + item.excerpt!.length, 0),
      extracted_at: "", quality_score_100: null, quality_decision: "needs_more_evidence", technique_method_theory: [],
      variables_or_constructs: [], limitations: [], asset_reviews: [], section_coverage: [], gaps: [], warnings: [], errors: [], artifact_path: null,
      evidence_items: items.map(item => ({ evidence_basis: item.evidence_level, evidence_id: item.evidence_id, source_id: item.source_id, citation_key: source.sourceId,
        section_key: item.section, claim_type: item.allowed_use === "theory_or_method_support" ? "INSPECTABLE_METHODOLOGICAL_PASSAGE" : "INSPECTABLE_CONTEXT_ONLY", traceable_summary_es: item.summary,
        supporting_quote_or_paraphrase_es: "Consultar el pasaje original; no se ha generado una traducción.",
        supporting_excerpt: item.excerpt, support_verified: true, citation_anchor: item.locator,
        confidence_100: 0, allowed_use: item.allowed_use, gaps: ["La extracción literal no certifica aplicabilidad metodológica."] })) };
    ledger.semantic_extractions.push(extraction);
  }
  return ledger;
}
