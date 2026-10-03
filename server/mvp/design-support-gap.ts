import type { ScientificDecisionBundle } from "./scientific-decision-service";
import type { targetedAutonomousCriticSchema } from "./scientific-decision-contracts";
import { createHash } from "node:crypto";

export type DesignSupportGap = {
  gapId: string; alternativeId: string; findingCodes: string[];
  origin: "INITIAL_CRITIC" | "TARGETED_CRITIC";
  question: string; whyMaterial: string; affectedClaim: string;
  requiredEvidenceType: "SCHOLARLY_METHOD_OR_STANDARD";
  searchProjection: string; existingEvidenceIds: string[];
  availableEvidence: Array<{ evidenceId: string; level: string; allowedUse: string }>;
  scopeBoundary: string; maxCandidates: 5; status: "OPEN";
};

// Evidence sufficiency is a critic judgement, not a keyword-relevance score.
// Field paths merely locate a finding; its severity alone never triggers a search.
export function scientificFindingFields(value: string) {
  return value.split(/[;,|]/).map(field => field.trim()).filter(Boolean);
}
// A compound finding may concern a future access task and the procedure that
// depends on it. Method validity, evidence and scope cannot be deferred here.
export function isFutureRequirementFinding(value: string) {
  const fields = scientificFindingFields(value);
  return fields.some(field => /^(data_requirements|feasibility)(\.|$)/.test(field)) &&
    fields.every(field => /^(data_requirements|feasibility|pending_user_decisions|procedure|research_design\.procedure)(\.|$)/.test(field));
}
export function designSupportGaps(bundle: ScientificDecisionBundle,
  late?: typeof targetedAutonomousCriticSchema._output): DesignSupportGap[] {
  const alternativeId = late?.alternativeId ?? bundle.decision.recommended_id;
  const alternative = bundle.decision.alternatives.find(item => item.id === alternativeId);
  const assessment = bundle.critique.assessments.find(item => item.alternative_id === alternativeId);
  if (!alternative || !assessment || !("primary_method" in alternative)) return [];
  const evidenceFields = new Set(["methodological_support", "evidence_support", "research_design.methodological_support", "transferability"]);
  const findings = assessment.critical_findings.filter(finding => scientificFindingFields(finding.affected_field)
    .some(field => evidenceFields.has(field)));
  const explicitFailure = late ? !late.evidenceSupported : assessment.evidence_support === "FAIL";
  const supportedWarning = !late && assessment.evidence_support === "PASS_WITH_LIMITATIONS" && findings.length > 0;
  if (!explicitFailure && !supportedWarning) return [];
  const whyMaterial = [ ...findings.map(f => `${f.issue}: ${f.required_action}`), ...(late?.limitations ?? []) ].join("\n") || "El dictamen independiente no acredita respaldo metodológico suficiente.";
  const method = String(alternative.primary_method);
  const codes = findings.map(f => f.code);
  const identity = createHash("sha256").update(JSON.stringify([bundle.contextFingerprint, alternativeId, codes, method])).digest("hex").slice(0, 20);
  return [{ gapId: `method-support-${identity}`, alternativeId: alternative.id, findingCodes: codes,
    origin: late ? "TARGETED_CRITIC" : "INITIAL_CRITIC", affectedClaim: method,
    question: `¿Qué procedimientos verificables respaldan ${method} y cuáles son sus condiciones de aplicación al alcance confirmado?`,
    whyMaterial, requiredEvidenceType: "SCHOLARLY_METHOD_OR_STANDARD", searchProjection: whyMaterial,
    existingEvidenceIds: bundle.evidence_pack.items.map(item => item.evidence_id),
    availableEvidence: bundle.evidence_pack.items.map(item => ({ evidenceId: item.evidence_id, level: item.evidence_level, allowedUse: item.allowed_use })),
    scopeBoundary: bundle.intent.scope, maxCandidates: 5, status: "OPEN" }];
}
