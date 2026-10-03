import assert from "node:assert/strict";
import {fixture}from"./test-method-coverage";
import {fingerprint}from"../server/mvp/job-execution-context";
import {projectMethodCoverageContext,reconstructMethodCoverageContext,projectMethodEvidenceContext,reconstructMethodEvidenceContext,projectMethodResearchAudit,methodContextAdmissionDiagnostic,validateMethodContextRecoveryBinding,METHOD_CONTEXT_ADMISSION_VERSION}from"../server/mvp/method-coverage-context";
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

const fullAudit=[{ordinal:1,question:{cellIds:["EMPIRICAL_MIXED_METHODS:QUALITY_APPRAISAL"],question:"Exact methodological question",rationale:"Material gap"},status:"REINSPECTED_COMPLETED_DISCOVERY",addedSources:["DS-verified"],limitations:["No empirical transfer presumed"],checkpoints:[{reason:"DOCUMENT_PROCEDURAL_SUPPORT_NOT_SUBSTANTIVE",manifest:{privateArtifactPath:"/private/source.pdf"}}],requestId:"provider-private-identity"}];
const auditBefore=JSON.stringify(fullAudit),auditProjection=projectMethodResearchAudit(fullAudit);
assert.equal(JSON.stringify(fullAudit),auditBefore);assert.equal(auditProjection.privateAuditFingerprint,fingerprint(fullAudit));
assert.deepEqual(auditProjection.operations[0].question,fullAudit[0].question);assert.deepEqual(auditProjection.operations[0].limitations,fullAudit[0].limitations);
assert.ok(!JSON.stringify(auditProjection).includes("/private/")&&!JSON.stringify(auditProjection).includes("provider-private-identity"));
const request={prompt:"Private scientific material not appropriate for logs",schema:{type:"object"},maxOutputTokens:34816,model:"fixture"};
const rejected=methodContextAdmissionDiagnostic(request,{inputTokens:30837,tokenCountProvenance:"EXACT_PROVIDER_COUNT",maximumUsd:2});assert.equal(rejected.contextAllowed,false);assert.equal(rejected.contextTotal,65653);assert.ok(!JSON.stringify(rejected).includes(request.prompt));
assert.equal(methodContextAdmissionDiagnostic(request,null).countProvenance,"UNAVAILABLE");
assert.equal(methodContextAdmissionDiagnostic(request,{inputTokens:29000,tokenCountProvenance:"EXACT_PROVIDER_COUNT",maximumUsd:2}).contextAllowed,true);
console.log("Method audit/admission PASS: scientific fields preserved, private operational details excluded, rejected exact count recorded safely.");

const binding={key:"METHOD_RECONSTRUCTION_V1_1",request,schema:request.schema,promptVersion:"method-coverage-reconstruction.v5",effectiveEvidenceFingerprint:"frozen-effective",digestFingerprint:"verified-digest"};
const grant={version:"method-context-admission-recovery.v1",admissionVersion:METHOD_CONTEXT_ADMISSION_VERSION,requestFingerprint:fingerprint(request),schemaFingerprint:fingerprint(request.schema),promptVersion:binding.promptVersion,effectiveEvidenceFingerprint:binding.effectiveEvidenceFingerprint,digestFingerprint:binding.digestFingerprint};
validateMethodContextRecoveryBinding({...binding,grant});
validateMethodContextRecoveryBinding({...binding,grant:undefined});
for(const field of ["version","admissionVersion","requestFingerprint","schemaFingerprint","promptVersion","effectiveEvidenceFingerprint","digestFingerprint"])
  assert.throws(()=>validateMethodContextRecoveryBinding({...binding,grant:{...grant,[field]:"tampered"}}),/RECOVERY_REQUEST_MISMATCH/);
assert.throws(()=>validateMethodContextRecoveryBinding({...binding,grant,request:{...request,prompt:"Changed context"}}),/RECOVERY_REQUEST_MISMATCH/);
validateMethodContextRecoveryBinding({...binding,key:"METHOD_RECONSTRUCTION_V1_2",grant:{...grant,requestFingerprint:"first-request-only"}});
validateMethodContextRecoveryBinding({...binding,key:"METHOD_COVERAGE_CRITIC_V1_1",grant:{...grant,requestFingerprint:"first-request-only"}});
console.log("Method recovery binding PASS: first corrected request identity enforced, later rounds and critic unaffected.");
