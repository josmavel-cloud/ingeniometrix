import { inspectableEvidence } from "./evidence-continuity";
import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";

export const COVERAGE_DIMENSIONS = ["problem_background", "state_of_knowledge", "conceptual_basis", "methodological_precedent", "context_system", "measurement_analysis"] as const;
export type CoverageDimension = typeof COVERAGE_DIMENSIONS[number];
// Planning precedents can inform a proposed method; neither class certifies transferability.
// Context-only material cannot be promoted to methodological support.
export function permitsMethodologicalSupport(allowedUse: string) { return allowedUse === "theory_or_method_support" || allowedUse === "blueprint_planning"; }
const sections: Record<CoverageDimension, string[]> = {
  problem_background: ["problem_statement", "problem_definition", "justification"],
  state_of_knowledge: ["research_antecedents", "state_of_knowledge"],
  conceptual_basis: ["theoretical_framework", "conceptual_framework", "variables_or_categories"],
  methodological_precedent: ["methodology"], context_system: ["problem_statement", "scope_and_limitations"],
  measurement_analysis: ["methodology", "variables_or_categories"],
};
export function assessEvidenceCoverage(ledger: MvpStep5EvidenceLedger) {
  const evidence = inspectableEvidence(ledger);
  const dimensions = COVERAGE_DIMENSIONS.map((dimension) => {
    const matches = evidence.filter(({ item }) => sections[dimension].includes(item.section_key) && (dimension !== "methodological_precedent" || permitsMethodologicalSupport(item.allowed_use)));
    const status = !matches.length ? "UNCOVERED" : matches.every(({ basis, item }) => basis === "PDF_FULLTEXT" && item.allowed_use !== "context_only") ? "COVERED" : "LIMITED";
    return { dimension, status, evidence_ids: matches.map(({ item }) => `${item.source_id}:${item.evidence_id}`), reason: !matches.length ? "Sin extracto verificado asignado a esta dimension." : status === "LIMITED" ? "Soporte contextual o abstract; no acredita transferibilidad al caso local." : "Extractos de texto completo inspeccionables; pertinencia metodologica requiere revision." };
  });
  const covered = dimensions.filter((d) => d.status !== "UNCOVERED");
  const core = dimensions.find((d) => d.dimension === "methodological_precedent")!;
  const status = covered.length < 2 || core.status === "UNCOVERED" ? "INSUFFICIENT" : dimensions.every((d) => d.status === "COVERED") ? "SUFFICIENT" : "LIMITED";
  return { status, dimensions, uncovered_dimensions: dimensions.filter((d) => d.status === "UNCOVERED").map((d) => d.dimension), inspectable_items: evidence.length, scientific_certification: false } as const;
}
export function shouldExpandEvidence(coverage: ReturnType<typeof assessEvidenceCoverage>) { return coverage.status === "INSUFFICIENT"; }
