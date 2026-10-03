import assert from "node:assert/strict";
import { fixture, intent } from "./test-method-coverage";
import type { ScientificDecisionBundle } from "../server/mvp/scientific-decision-service";
import { fingerprint } from "../server/mvp/job-execution-context";
import { buildCorpusMethodProfile, methodCoverageAssessmentSchema } from "../server/mvp/method-coverage-contracts";
import { validateHistoricalMethodAssessment, revalidateHistoricalCoverage } from "../server/mvp/method-assessment-reuse";
const data=fixture(["EMPIRICAL_QUALITATIVE","EMPIRICAL_QUANTITATIVE"]);
const bundle={intent,evidence_pack:data.pack,contextFingerprint:"frozen-fixture"} as unknown as ScientificDecisionBundle;
const assessment=methodCoverageAssessmentSchema.parse({corpusProposal:data.proposal,
  coverageProposal:{corpusClasses:data.matrix.corpusClasses,crossClassIntegration:data.matrix.crossClassIntegration},researchQuestions:[]});
const profile=buildCorpusMethodProfile({intent,pack:data.pack,frozenInputFingerprint:bundle.contextFingerprint,proposal:data.proposal});
const rows=[{id:"assessment-fixture",stageKey:"checkpoint:METHOD_COVERAGE_ASSESSMENT_V1:context:abcdef",status:"COMPLETED",
 outputJson:{value:assessment,outputHash:fingerprint(assessment),fingerprint:"original-request",files:[]}},
 {id:"profile-fixture",stageKey:"checkpoint:CORPUS_METHOD_PROFILE_V1",status:"COMPLETED",outputJson:{value:profile,outputHash:fingerprint(profile),
 fingerprint:fingerprint({version:"b4.v1",jobId:"job-fixture",inputs:{source:fingerprint(assessment),context:bundle.contextFingerprint}})}}];
assert.ok(validateHistoricalMethodAssessment(rows,"job-fixture",bundle));
assert.equal(validateHistoricalMethodAssessment(rows,"other-job",bundle),null);
assert.equal(validateHistoricalMethodAssessment(rows,"job-fixture",{...bundle,contextFingerprint:"other-frozen-input"}),null);
const tampered=structuredClone(rows); (tampered[0].outputJson as any).value.researchQuestions.push({question:"untracked alteration"});
assert.equal(validateHistoricalMethodAssessment(tampered,"job-fixture",bundle),null);
const corrupt=structuredClone(rows); corrupt[1].outputJson.outputHash="wrong";
assert.equal(validateHistoricalMethodAssessment(corrupt,"job-fixture",bundle),null);
const before=JSON.stringify(assessment.coverageProposal);
const pack=structuredClone(data.pack); const supported=pack.items.find(item=>item.source_id==="M1")!;
supported.allowed_use="context_only"; supported.evidence_level="ABSTRACT_METADATA";
const revalidated=revalidateHistoricalCoverage(assessment.coverageProposal,pack);
assert.ok(revalidated.audit.invalidated.length);
for(const row of revalidated.audit.invalidated){
 const cell=[...revalidated.proposal.corpusClasses.flatMap(c=>c.operations),revalidated.proposal.crossClassIntegration].find(c=>c.cellId===row.cellId)!;
 if(cell.required) assert.equal(cell.coverageStatus,"UNSUPPORTED");
 assert.ok(!cell.supportPointers.some(p=>p.source_id===supported.source_id&&p.evidence_id===supported.evidence_id));
}
assert.equal(JSON.stringify(assessment.coverageProposal),before);
assert.equal(revalidateHistoricalCoverage(assessment.coverageProposal,data.pack).audit.invalidated.length,0);
console.log("method assessment reuse PASS: frozen identity, corruption, cross-job denial, honest evidence downgrade, no history mutation");
