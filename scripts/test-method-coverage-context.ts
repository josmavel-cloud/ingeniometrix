import assert from "node:assert/strict";
import {fixture}from"./test-method-coverage";
import {fingerprint}from"../server/mvp/job-execution-context";
import {projectMethodCoverageContext,reconstructMethodCoverageContext,projectMethodEvidenceContext,reconstructMethodEvidenceContext}from"../server/mvp/method-coverage-context";
const data=fixture(["EMPIRICAL_QUALITATIVE","EMPIRICAL_QUANTITATIVE","EMPIRICAL_MIXED_METHODS","THEORETICAL_CONCEPTUAL","SYSTEMATIC_OR_SCOPING_REVIEW","OTHER_REVIEW_SYNTHESIS","POLICY_STANDARD_GUIDANCE","OTHER"]);
const matrix=structuredClone(data.matrix);const original=JSON.stringify(matrix);const context=projectMethodCoverageContext(matrix);
assert.equal(fingerprint(reconstructMethodCoverageContext(context)),fingerprint(matrix));assert.equal(JSON.stringify(matrix),original);
const changed=structuredClone(context);changed.crossClassIntegration[4]="An altered claim";assert.throws(()=>reconstructMethodCoverageContext(changed),/INTEGRITY/);
const row=structuredClone(context);row.crossClassIntegration.pop();assert.throws(()=>reconstructMethodCoverageContext(row),/ROW_INVALID/);
const columns=structuredClone(context);columns.cellColumns=[...columns.cellColumns].reverse();assert.throws(()=>reconstructMethodCoverageContext(columns),/CONTRACT_INVALID/);
const refs=structuredClone(context);refs.crossClassIntegration[4]={textRef:9999};assert.throws(()=>reconstructMethodCoverageContext(refs),/TEXT_REFERENCE_INVALID/);
console.log("Method coverage context PASS: exact round trip, all classes/cells/pointers/text preserved, tampering rejected.");

const digest:any={version:"DesignSupportDigest.v2",digestFingerprint:"canonical-digest",effectiveEvidenceFingerprint:"canonical-evidence",inspectedPackFingerprint:"canonical-pack",supportAssessment:"INSPECTION_CANDIDATES_NOT_SCIENTIFIC_APPROVAL",claimsToSupport:[{gapId:"gap",findingCodes:["F1"],claim:"Preserve the literal methodological requirement.",requirement:"Future verification is required."}],sources:[{source_id:"source-with-repeated-identity",title:"Title, with non-ASCII español and π",provenance:"SYSTEM_DESIGN_SUPPORT"}],passages:[
{source_id:"source-with-repeated-identity",evidence_id:"source-with-repeated-identity:P1",evidence_level:"PDF_SAMPLE_TEXT",allowed_use:"theory_or_method_support",locator:{citation_key:"source-with-repeated-identity",reference_id:"source-with-repeated-identity",source_id:"source-with-repeated-identity",page_number:4,chunk_id:"pdf:page:4:paragraph:6"},excerpt:"The original complete paragraph must not be truncated, paraphrased or stripped of its transfer conditions.",supports:["F1"],selectionReasons:["WHOLE_PROCEDURE"]},
{source_id:"selected-source",evidence_id:"E2",evidence_level:"ABSTRACT_METADATA",allowed_use:"context_only",locator:{citation_key:"selected-source",reference_id:"private-reference-identity",source_id:"selected-source",page_number:null,chunk_id:null},excerpt:"An actual abstract is context, not a detailed procedure.",summary:"Resumen de contexto conservado.",supports:[],selectionReasons:["CLASSIFICATION_CONTEXT"]} ]};
const evidenceContext=projectMethodEvidenceContext(digest);assert.equal(fingerprint(reconstructMethodEvidenceContext(evidenceContext)),fingerprint(digest));
assert.equal(evidenceContext.digestFingerprint,digest.digestFingerprint);assert.equal(evidenceContext.effectiveEvidenceFingerprint,digest.effectiveEvidenceFingerprint);
const wrong=structuredClone(evidenceContext);wrong.passageValues[0][5]="altered quotation";assert.throws(()=>reconstructMethodEvidenceContext(wrong),/INTEGRITY/);
const foreign=structuredClone(evidenceContext);foreign.effectiveEvidenceFingerprint="another-job";assert.throws(()=>reconstructMethodEvidenceContext(foreign),/INTEGRITY/);
console.log("Method evidence context PASS: literal excerpts, exact pointers/locators, context-only roles and shared digest identity preserved.");
