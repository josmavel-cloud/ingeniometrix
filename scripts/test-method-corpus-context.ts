import assert from "node:assert/strict";
import { fixture } from "./test-method-coverage";
import { compactMethodCorpusContext, compactMethodAuthorityContext } from "../server/mvp/method-coverage-resolution";
import { fingerprint, stableJson } from "../server/mvp/job-execution-context";
const {profile}=fixture(["EMPIRICAL_QUANTITATIVE","EMPIRICAL_QUALITATIVE","EMPIRICAL_MIXED_METHODS"]);
const current=structuredClone(profile);
current.corpusClasses[0].roleInResearch="Papel derivado explícito sin cambio de fuente ni cita";
current.profileFingerprint="derived-test-fingerprint";
const before=stableJson([profile,current]), compact=compactMethodCorpusContext(profile,current);
const expanded={...compact.originalCorpus,profileFingerprint:compact.currentCorpus.profileFingerprint,
 corpusClasses:compact.originalCorpus.corpusClasses.map(row=>({...row,...compact.currentCorpus.roles.find(role=>role.classId===row.classId)!}))};
assert.equal(fingerprint(expanded),fingerprint(current));
assert.equal(stableJson([profile,current]),before);
assert.ok(Buffer.byteLength(stableJson(compact))<Buffer.byteLength(stableJson({originalCorpus:profile,corpus:current})));
const bad=structuredClone(current);bad.sourceAssignments[0].sourceId="other-project-source";
assert.throws(()=>compactMethodCorpusContext(profile,bad),/CONTEXT_IDENTITY_CHANGED/);
const badCount=structuredClone(current);badCount.observedClassCounts["EMPIRICAL_QUANTITATIVE"]=99;
assert.throws(()=>compactMethodCorpusContext(profile,badCount),/CONTEXT_IDENTITY_CHANGED/);
console.log("method corpus context PASS: lossless reconstruction, smaller payload, immutable originals, identity/count tampering rejected");

assert.equal(compact.currentCorpus.roles.length,1);
assert.equal(compactMethodCorpusContext(profile,profile).currentCorpus.roles.length,0);
assert.equal(compactMethodCorpusContext(profile,profile).currentCorpus.unchangedRolesInheritOriginal,true);
const authority={id:"A1",definition:{problem:"Exact frozen problem",questions:[{id:"Q1",text:"Exact frozen question"}],objectives:[{id:"O1",text:"Exact frozen objective"}]},research_design:{scope:"Unchanged scope"}};
const projected=compactMethodAuthorityContext(authority);
assert.deepEqual(projected.historicalAlternative.definition,{inheritsExactValueFrom:"immutableDefinition"});
assert.equal(fingerprint({...projected.historicalAlternative,definition:projected.immutableDefinition}),fingerprint(authority));
