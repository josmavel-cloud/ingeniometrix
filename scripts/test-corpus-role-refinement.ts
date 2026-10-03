import assert from "node:assert/strict";
import { z } from "zod";
import { buildCorpusMethodProfile, deriveCorpusMethodRoles, corpusRoleRefinementProposalSchema, buildUnresolvedMethodCoverageMatrix,
  buildMethodCoverageMatrix, validateMethodCoverageCritique, methodCoverageCells } from "../server/mvp/method-coverage-contracts";
import {fixture,intent,critiqueFor} from "./test-method-coverage";
const data=fixture(["EMPIRICAL_QUALITATIVE","SYSTEMATIC_OR_SCOPING_REVIEW"]);
data.proposal.classes.push({classId:"OTHER",presence:"CONTINGENT",roleInResearch:"Género futuro no identificado",claimsExpectedFromClass:["Por determinar según género"],appraisalNeeded:true,synthesisNeeded:true,integrationNeeded:true,
 basis:[{kind:"FROZEN_INTENT",field:"scope",source_id:null,evidence_id:null,quote:intent.scope,rationale:"El alcance admite publicaciones pertinentes sin identificar todos los géneros futuros."}],limitations:["No hay obra observada de esta clase."]});
const original=buildCorpusMethodProfile({intent,pack:data.pack,frozenInputFingerprint:"frozen-original",proposal:data.proposal});
const proposals=original.corpusClasses.map(row=>({classId:row.classId,roleInResearch:row.roleInResearch,claimsExpectedFromClass:row.claimsExpectedFromClass,
 appraisalNeeded:row.appraisalNeeded,synthesisNeeded:row.synthesisNeeded,integrationNeeded:row.integrationNeeded,justification:"Conservar valoración y síntesis de las afirmaciones de esta clase observada."}));
Object.assign(proposals[2],{roleInResearch:"Admisión abierta, clasificación y determinación futura de papel antes de utilizar la obra.",claimsExpectedFromClass:[],appraisalNeeded:false,synthesisNeeded:false,integrationNeeded:false,
 justification:"Sin género ni obra identificados no existe aún afirmación sustantiva que valorar o sintetizar; se requiere extracción y clasificación antes de definir su papel, sin excluir su admisión."});
const before=JSON.stringify(original);const derived=deriveCorpusMethodRoles(original,proposals);
assert.equal(JSON.stringify(original),before);
assert.deepEqual(derived.profile.sourceAssignments,original.sourceAssignments);
assert.deepEqual(derived.profile.observedClassCounts,original.observedClassCounts);
assert.deepEqual(derived.profile.selectedSourceIds,original.selectedSourceIds);
assert.equal(derived.profile.frozenInputFingerprint,original.frozenInputFingerprint);
assert.equal(derived.profile.intentFingerprint,original.intentFingerprint);
assert.deepEqual(derived.profile.corpusClasses.map(row=>({classId:row.classId,presence:row.presence,basis:row.basis,includedSourceIds:row.includedSourceIds})),original.corpusClasses.map(row=>({classId:row.classId,presence:row.presence,basis:row.basis,includedSourceIds:row.includedSourceIds})));
assert.notEqual(derived.profile.profileFingerprint,original.profileFingerprint);
assert.equal(deriveCorpusMethodRoles(original,proposals).audit.derivationFingerprint,derived.audit.derivationFingerprint);
assert.equal(derived.audit.scientificStatus,"PROPOSED_REQUIRES_INDEPENDENT_ROLE_AND_SCOPE_REVIEW");
assert.throws(()=>deriveCorpusMethodRoles(original,proposals.slice(0,2)),/CLASS_SET_MISMATCH/);
assert.throws(()=>deriveCorpusMethodRoles(original,[...proposals,proposals[0]]),/CLASS_SET_MISMATCH/);
assert.throws(()=>corpusRoleRefinementProposalSchema.parse([{...proposals[0],presence:"OBSERVED"}]),/unrecognized/i);
assert.throws(()=>corpusRoleRefinementProposalSchema.parse([{...proposals[0],justification:""}]),/small/i);
const matrix=buildUnresolvedMethodCoverageMatrix(derived.profile,"effective");
const other=matrix.corpusClasses.find(row=>row.classId==="OTHER")!;
assert.equal(other.operations.find(cell=>cell.operation==="DATA_EXTRACTION")!.required,true);
assert.equal(other.operations.find(cell=>cell.operation==="DATA_EXTRACTION")!.requiredWhen,"IF_CLASS_ENCOUNTERED");
assert.equal(other.operations.find(cell=>cell.operation==="QUALITY_APPRAISAL")!.coverageStatus,"NOT_APPLICABLE");
assert.ok(matrix.corpusClasses.filter(row=>row.classId!=="OTHER").every(row=>row.operations.find(cell=>cell.operation==="QUALITY_APPRAISAL")!.required));
for(const cell of methodCoverageCells(matrix)){if(!cell.required)continue;cell.coverageStatus="SUPPORTED";cell.strategy="Procedimiento explícito sujeto a revisión.";cell.supportPointers=[{source_id:"M1",evidence_id:"P1"}];}
const valid=buildMethodCoverageMatrix({proposal:{corpusClasses:matrix.corpusClasses,crossClassIntegration:matrix.crossClassIntegration},profile:derived.profile,pack:data.pack,effectiveEvidenceFingerprint:"effective"});
const review=critiqueFor(valid);review.corpusClassificationValid=false;review.blockingScientificIssue=true;review.blockingReason="La exención de una operación no está científicamente justificada.";
assert.equal(validateMethodCoverageCritique(review,{matrix:valid,profile:derived.profile,pack:data.pack,effectiveEvidenceFingerprint:"effective",alternativeId:"A1-R1",findingCodes:["NOV"]}).evidenceSupported,false,"Derived roles never self-approve scientific validity");
const missingExtraction=structuredClone(valid);const extraction=missingExtraction.corpusClasses.find(row=>row.classId==="OTHER")!.operations.find(cell=>cell.operation==="DATA_EXTRACTION")!;extraction.required=false;extraction.requiredWhen="NOT_NEEDED_FOR_ROLE";extraction.coverageStatus="NOT_APPLICABLE";
assert.throws(()=>buildMethodCoverageMatrix({proposal:{corpusClasses:missingExtraction.corpusClasses,crossClassIntegration:missingExtraction.crossClassIntegration},profile:derived.profile,pack:data.pack,effectiveEvidenceFingerprint:"effective"}),/REQUIRED_OPERATION_OMITTED/);
const schema=z.toJSONSchema(corpusRoleRefinementProposalSchema) as any;assert.equal(schema.items.additionalProperties,false);assert.deepEqual(new Set(schema.items.required),new Set(Object.keys(schema.items.properties)));
console.log("Corpus role refinement: PASS (immutable classification, justified proposed roles, independent rejection retained).");
