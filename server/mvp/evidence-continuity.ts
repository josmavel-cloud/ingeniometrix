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
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const quote = normalize(excerpt ?? "");
  return quote.length >= 20 && texts.some((text) => normalize(text).includes(quote));
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
