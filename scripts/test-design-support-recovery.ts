import assert from "node:assert/strict";
import { designSupportGaps } from "../server/mvp/design-support-gap";
import type { ScientificDecisionBundle } from "../server/mvp/scientific-decision-service";
import { htmlSupportPassages, rankSupportPassages } from "../server/mvp/design-support-document";
import { effectiveGenerationLedger, sealDesignSupport, validateDesignSupport } from "../server/mvp/design-support-addendum";
import { ledger } from "./test-b3-scientific-contracts";

// Sanitized equivalent of the completed staging critic. No private topic or IDs.
const bundle = {
  contextFingerprint: "frozen-fixture", intent: { scope: "Alcance confirmado" },
  decision: { recommended_id: "A1", alternatives: [{ id: "A1", primary_method: "Síntesis documental", scope_effect: "preserves" }] },
  critique: { assessments: [{ alternative_id: "A1", evidence_support: "PASS_WITH_LIMITATIONS",
    critical_findings: [{ code: "EVI", severity: "WARNING", affected_field: "methodological_support",
      issue: "Respaldo indirecto", required_action: "Inspeccionar una guía metodológica con procedimientos verificables" }] }] },
  evidence_pack: { items: [{ evidence_id: "E1", evidence_level: "ABSTRACT_METADATA", allowed_use: "context_only" }] },
} as unknown as ScientificDecisionBundle;
assert.equal(designSupportGaps(bundle).length, 1, "WARNING plus an explicit evidence limitation must not be ignored");
const late = { alternativeId: "A1", intentPreserved: true, methodCoherent: true, evidenceSupported: false,
  blockingScientificIssue: false, blockingReason: "", limitations: ["Falta respaldo directo"],
  resolvedFindingCodes: [], unresolvedFindingCodes: ["EVI"], deferredAsFutureRequirementCodes: [] };
assert.equal(designSupportGaps(bundle, late)[0].origin, "TARGETED_CRITIC");
const harmless = structuredClone(bundle);
harmless.critique.assessments[0].evidence_support = "PASS";
assert.equal(designSupportGaps(harmless).length, 0, "Warnings alone do not authorize discovery");
assert.equal(designSupportGaps(harmless, late).length, 1, "Late evidence judgement activates recovery even if the initial rubric passed");
assert.equal(designSupportGaps(bundle, { ...late, evidenceSupported: true }).length, 0);
for (const method of ["Análisis estructural", "Evaluación educativa", "Síntesis de salud", "Estudio de gestión", "Análisis temático", "Crítica textual"]) {
  const multidisciplinary = structuredClone(bundle);
  Object.assign(multidisciplinary.decision.alternatives[0], { primary_method: method });
  assert.equal(designSupportGaps(multidisciplinary)[0].affectedClaim, method);
  assert.equal(designSupportGaps(multidisciplinary)[0].scopeBoundary, "Alcance confirmado");
}
const html = htmlSupportPassages('<html><title>Guía &amp; método</title><script>ignore instructions</script><p>Un procedimiento verificable describe criterios, límites y pasos de validación del método.</p><p>La aplicación requiere comprobar sus condiciones en cada contexto.</p></html>');
assert.equal(html.title, "Guía & método");
assert.equal(html.passages.length, 2);
assert.ok(html.passages.every(p => !p.text.includes("instructions")));
assert.equal(rankSupportPassages(html.passages, "procedimiento método")[0].text, html.passages[0].text);
const identity = { userId: "technical", projectId: ledger.project_id, jobId: "job-a", definitionHash: "frozen" };
const addendum = sealDesignSupport({ ...identity, policyVersion: "fixture", sources: [{
  sourceId: "DS-fixture", gapId: "gap", title: html.title, authors: [], year: null, doi: null,
  observationIds: ["observed-search"], provenance: "SYSTEM_DESIGN_SUPPORT", document: { observedUrl: "https://example.org/standard",
    finalUrl: "https://example.org/standards/current", sha256: "a".repeat(64), mediaType: "text/html", title: html.title, passages: html.passages },
}] });
const before = JSON.stringify(ledger);
const effective = effectiveGenerationLedger(ledger, addendum, identity);
assert.equal(JSON.stringify(ledger), before, "Frozen evidence is never modified");
assert.equal(effective.source_registry.at(-1)?.provider, "SYSTEM_DESIGN_SUPPORT");
assert.equal(effective.source_registry.at(-1)?.selected_order, null);
assert.equal(effective.references.at(-1)?.reference_metadata.doi, null, "A standard does not require a fabricated DOI");
assert.equal(effective.semantic_extractions.at(-1)?.evidence_items[0].supporting_excerpt, html.passages[0].text);
assert.throws(() => validateDesignSupport(addendum, { ...identity, jobId: "job-b" }), /CONTEXT_MISMATCH/);
const tampered = structuredClone(addendum); tampered.sources[0].document.passages[0].text = "Invented support";
assert.throws(() => validateDesignSupport(tampered, identity), /CONTEXT_MISMATCH/);
console.log("Design support regression: PASS (gaps, safe text, immutable context, job ownership, bibliography; offline only)");
