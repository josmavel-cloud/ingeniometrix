import assert from "node:assert/strict";
import {normalizeDeclaredPrimaryMethod} from "../server/mvp/method-primary-normalization";
import {fingerprint} from "../server/mvp/job-execution-context";
const components=[{name:"Revisión documental",kind:"method",dependencies:[],inputs:["corpus"],outputs:["matriz"],support:[{source_id:"verified",evidence_id:"passage"}]},
 {name:"Síntesis configurativa",kind:"method",dependencies:["Revisión documental"],inputs:["matriz"],outputs:["síntesis"],support:[]}];
const edges=[{from:"Revisión documental",to:"Síntesis configurativa",transferred_output:"matriz",use_by_next_method:"Integrar preservando procedencia"}];
const primary="Revisión documental con síntesis diferenciada e integración configurativa";
const before=fingerprint({components,edges});const result=normalizeDeclaredPrimaryMethod(primary,components,edges);
assert.equal(fingerprint({components,edges}),before);assert.equal(result.components[0].name,primary);assert.equal(result.primaryMethod,primary);
assert.deepEqual(result.components[0].support,components[0].support);assert.deepEqual(result.components[1].dependencies,[primary]);assert.equal(result.handoffs[0].from,primary);
assert.deepEqual(result.audit.alias,{declaredComponentName:components[0].name,declaredPrimaryMethod:primary});
assert.equal(normalizeDeclaredPrimaryMethod(primary,result.components,result.handoffs).audit.alias,null);
assert.throws(()=>normalizeDeclaredPrimaryMethod("Revisión documental ampliada a otra población",components,edges),/AMBIGUOUS_OR_UNDECLARED/);
assert.throws(()=>normalizeDeclaredPrimaryMethod(primary,[...components,{...components[0]}],edges),/DUPLICATE/);
assert.throws(()=>normalizeDeclaredPrimaryMethod("A con B con C",[{name:"A",kind:"method",dependencies:[]},{name:"A con B",kind:"method",dependencies:[]}],[]),/AMBIGUOUS_OR_UNDECLARED/);
assert.throws(()=>normalizeDeclaredPrimaryMethod(primary,[{...components[0],kind:"technique"},components[1]],edges),/AMBIGUOUS_OR_UNDECLARED/);
assert.throws(()=>normalizeDeclaredPrimaryMethod("X"+primary,components,edges),/AMBIGUOUS_OR_UNDECLARED/);
assert.equal(normalizeDeclaredPrimaryMethod("Evidence synthesis with class-specific appraisal",[{name:"Evidence synthesis",kind:"method",dependencies:[]}],[]).components[0].name,"Evidence synthesis with class-specific appraisal");
console.log("Declared primary method normalization PASS: exact unique composition label, graph/support preserved, duplicates and ambiguity rejected.");
