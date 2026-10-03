import assert from "node:assert/strict";
import { normalizeDeclaredMethodHandoffs } from "../server/mvp/method-handoff-normalization";
import { designAlternativeV2Schema, validateAlternativeV2 } from "../server/mvp/scientific-decision-contracts";
import { intent } from "./test-method-coverage";

const components = [
  {name:"Revisión documental", kind:"method" as const, role:"Seleccionar documentos pertinentes.", inputs:["Alcance confirmado"], outputs:["Corpus y registro"], dependencies:[], support:[{source_id:"M1",evidence_id:"E1"}]},
  {name:"Extracción", kind:"technique" as const, role:"Conservar afirmaciones y procedencia.", inputs:["Corpus elegible"], outputs:["Fichas"], dependencies:["Revisión documental"], support:[{source_id:"M1",evidence_id:"E1"}]},
];
const handoffs=[{from:"Revisión documental",to:"Extracción",transferred_output:"Corpus elegible e identificadores de obra y estudio.",use_by_next_method:"Extraer afirmaciones trazables conservando su identidad."}];
const before=JSON.stringify({components,handoffs});
const result=normalizeDeclaredMethodHandoffs(components,handoffs);
assert.equal(JSON.stringify({components,handoffs}),before,"The original provider output is immutable");
assert.deepEqual(result.components[0].outputs,[...components[0].outputs,handoffs[0].transferred_output]);
assert.deepEqual(result.components[1].inputs,[...components[1].inputs,handoffs[0].transferred_output]);
assert.deepEqual(result.components[1].dependencies,components[1].dependencies,"No inferred dependency");
assert.equal(result.audit.changes.length,1);
assert.equal(result.audit.changes[0].declaredArtifact,handoffs[0].transferred_output,"No paraphrase, truncation or fabricated artifact");
assert.equal(normalizeDeclaredMethodHandoffs(result.components,handoffs).audit.changes.length,0,"Idempotent normal form");
assert.notEqual(result.audit.originalFingerprint,result.audit.normalizedFingerprint);
assert.throws(()=>normalizeDeclaredMethodHandoffs(components,[{...handoffs[0],from:"Unknown component"}]),/INVALID_EDGE/);
assert.throws(()=>normalizeDeclaredMethodHandoffs(components.map(c=>({...c,dependencies:[]})),handoffs),/INVALID_EDGE/);
assert.throws(()=>normalizeDeclaredMethodHandoffs(components,[{...handoffs[0],transferred_output:" "}]),/INVALID_EDGE/);
assert.throws(()=>normalizeDeclaredMethodHandoffs([...components,components[0]],handoffs),/DUPLICATE_COMPONENT/);
const design=designAlternativeV2Schema.parse({id:"A1",label:"Síntesis documental",scope_fulfilled:intent.scope,primary_method:"Revisión documental",scope_effect:"preserves",scope_change_impact:null,
  definition:{problem:intent.problem,questions:[{id:"Q1",text:"¿Qué condiciones describe la evidencia?",kind:"general"}],objectives:[{id:"O1",text:"Sintetizar condiciones documentadas.",question_ids:["Q1"]}],hypotheses_or_propositions:[]},
  research_design:{paradigm:"Pragmatismo delimitado",approach:"other",design:"Síntesis documental",unit_population_corpus:intent.unit_population_corpus,sampling_selection:"Selección conforme al alcance.",constructs:[],data_material_sources:[intent.unit_population_corpus],techniques:["Extracción"],instruments:["Ficha trazable"],procedure:["Seleccionar y extraer."],analysis_method:"Síntesis delimitada.",quality_criteria:["Trazabilidad"],ethical_considerations:["Acceso autorizado"],assumptions:[],limitations:[],pending_decisions:[],methodological_support:[{source_id:"M1",evidence_id:"E1"}]},
  components,scope_changes:[],applicability_conditions:[],baselines_or_comparisons:[],transfer_limits:[],feasibility:"Disponibilidad documental por verificar.",discarded_alternative_reasons:[],qualitative_component:null,quantitative_component:null,integration_strategy:"Síntesis delimitada",integration_purpose:"Conservar evidencia",method_handoffs:handoffs,data_requirements:[{description:"Documentos pertinentes por localizar.",availability:"PENDING",confirmation_or_action:"Verificar disponibilidad durante la ejecución."}],pending_user_decisions:[]});
assert.throws(()=>validateAlternativeV2(design,intent),/METHOD_HANDOFF_INVALID/,"Before: generic stated artifact is absent from endpoint labels");
validateAlternativeV2({...design,components:result.components},intent);
const cycle=result.components.map(c=>({...c,dependencies:c.name==="Revisión documental"?["Extracción"]:c.dependencies}));
assert.throws(()=>validateAlternativeV2({...design,components:cycle},intent),/METHOD_DEPENDENCY_CYCLE/,"Normal scientific graph validation is not bypassed");
console.log("Declared method handoff normalization: PASS (16 checks; structural normalization, no scientific approval).");
