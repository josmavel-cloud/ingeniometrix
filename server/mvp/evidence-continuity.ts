import { createHash } from "node:crypto";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";

export type EvidenceLevel = "METADATA_ONLY" | "ABSTRACT_AVAILABLE" | "FULL_TEXT_AVAILABLE" | "FULL_TEXT_MATERIALIZED" | "UNUSABLE";

export function inspectEvidenceLevel(input: { title: string; abstract?: string | null; accessiblePdf?: boolean; text?: string; identity?: string }): EvidenceLevel {
  if (!input.title.trim() || input.identity === "mismatch") return "UNUSABLE";
  if (input.text?.trim() && input.identity === "matched") return "FULL_TEXT_MATERIALIZED";
  if (input.abstract?.trim()) return "ABSTRACT_AVAILABLE";
  if (input.accessiblePdf) return "FULL_TEXT_AVAILABLE";
  return "METADATA_ONLY";
}

export function intakeFingerprint(intake: object) {
  const fields = ["topic", "problemContext", "researchLine", "academicConstraints", "targetPopulation", "availableData", "preferredMethodology", "advisorNotes"];
  const value = intake as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify(fields.map((key) => value[key] ?? null))).digest("hex");
}

export function excerptOccurs(excerpt: string | undefined, texts: string[]) {
  // Undo only PDF line-end hyphenation, never paraphrase or fuzzy-match evidence.
  const normalize = (text: string) => text.normalize("NFKC").replace(/(\p{L})-\r?\n\s*(?=\p{Ll})/gu, "$1").replace(/\s+/g, " ").trim();
  const quote = normalize(excerpt ?? "");
  return quote.length >= 20 && texts.some((text) => normalize(text).includes(quote));
}

export type RecoveredEvidenceChunk = { chunk_id: string | null; page_start: number | null; page_end: number | null; text: string };
export function excerptSupportedAtAnchor(excerpt: string | undefined, anchor: { chunk_id?: string | null; page_number?: number | null } | null | undefined, chunks: RecoveredEvidenceChunk[]) {
  // A true quote on page 2 must not certify a fabricated page-7/chunk locator.
  const candidates = chunks.filter((chunk) => (!anchor?.chunk_id || chunk.chunk_id === anchor.chunk_id)
    && (anchor?.page_number == null || chunk.page_start != null && chunk.page_end != null && anchor.page_number >= chunk.page_start && anchor.page_number <= chunk.page_end));
  return excerptOccurs(excerpt, candidates.map((chunk) => chunk.text));
}

export function sourceDisposition(ledger: MvpStep5EvidenceLedger, usedSourceIds: string[]) {
  const usable = inspectableEvidence(ledger);
  return ledger.source_registry.map((source) => {
    const extraction = ledger.semantic_extractions.find((item) => item.reference_id === source.reference_id);
    const eligible = usable.some(({ item }) => item.source_id === source.source_id);
    const used = usedSourceIds.includes(source.source_id);
    if (used && !eligible) throw new Error(`EVIDENCE_USE_WITHOUT_SUPPORT: ${source.source_id}`);
    return {
      source_id: source.source_id, reference_id: source.reference_id, selected: true,
      extraction_status: extraction?.status ?? "NOT_RUN", evidence_level: extraction?.evidence_basis ?? "UNKNOWN",
      extracted_items: extraction?.evidence_items.length ?? 0,
      verified_items: extraction?.evidence_items.filter((item) => item.support_verified).length ?? 0,
      eligible, considered: eligible, used,
      exclusion_reason: used ? null : !extraction ? "EXTRACTION_NOT_RUN" : extraction.status !== "completed" ? "EXTRACTION_NOT_COMPLETED"
        : extraction.evidence_basis === "VERIFIED_METADATA_ONLY" ? "METADATA_NOT_SUBSTANTIVE_EVIDENCE"
        : extraction.quality_decision === "insufficient" ? "EXTRACTION_INSUFFICIENT"
        : !eligible ? "NO_VERIFIED_NON_GAP_EVIDENCE" : "CONSIDERED_NOT_CITED_IN_FINAL_PLAN",
    };
  });
}

export function assertEvidenceContinuity(ledger: MvpStep5EvidenceLedger, input: { projectId: string; stepRunId: string; intake: object; referenceIds: string[] }) {
  if (ledger.project_id !== input.projectId || ledger.step_run_id !== input.stepRunId) throw new Error("EVIDENCE_CONTINUITY: proyecto/ejecucion no coincide.");
  if (ledger.intake_fingerprint !== intakeFingerprint(input.intake)) throw new Error("EVIDENCE_CONTINUITY: intake modificado o ledger sin revision verificable; ejecutar Step 5.");
  const ids = ledger.source_registry.map((source) => source.reference_id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...input.referenceIds].sort())) throw new Error("EVIDENCE_CONTINUITY: seleccion de fuentes modificada; ejecutar Step 5.");
}

export function inspectableEvidence(ledger: MvpStep5EvidenceLedger) {
  return ledger.semantic_extractions.filter((extraction) => extraction.status === "completed" && extraction.quality_decision !== "insufficient" && extraction.evidence_basis !== "VERIFIED_METADATA_ONLY")
    .flatMap((extraction) => extraction.evidence_items.filter((item) => item.allowed_use !== "gap_only" && item.traceable_summary_es.trim() && item.support_verified === true)
      .map((item) => ({ item, basis: extraction.evidence_basis })));
}

export function evaluateEvidenceGate(ledger: MvpStep5EvidenceLedger) {
  const usable = inspectableEvidence(ledger);
  const status = usable.length === 0 ? "INSUFFICIENT" : usable.every(({ basis }) => basis === "PDF_FULLTEXT") ? "SUFFICIENT" : "LIMITED";
  return { status, inspectable_items: usable.length, limitations: status === "SUFFICIENT" ? [] : ["La evidencia disponible no permite certificar cobertura completa; el plan debe declarar limites y decisiones pendientes."] } as const;
}
