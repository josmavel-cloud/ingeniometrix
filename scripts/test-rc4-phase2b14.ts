import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import accepted from "./fixtures/phase2b14-accepted-plan.json";
import seismic from "./fixtures/phase2b1-seismic.json";
import { semanticPlannerInput, validateSearchEnrichment, type SearchEnrichment } from "@/lib/retrieval-semantic-plan";
import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";
import { composeSemanticQueries, validateScientificFamily } from "@/lib/retrieval-query-composition";
import { recoverCentralTranslations, missingCentralTranslations } from "@/server/retrieval/search-concept-translation";
import { emptyDefinition, searchIntent, userValue } from "@/lib/conversational-intake";

async function main() {
  const input = semanticPlannerInput(seismic.intent as ResearchSearchIntent, accepted.enrichment.searchIntentHash);
  // Separate cache namespace per offline run without changing production cache logic.
  const taxonomy = input.signals.find(s => s.sourceField === "taxonomy")!;
  taxonomy.value = `${taxonomy.value} ${randomUUID()}`;
  const base = accepted.enrichment as unknown as SearchEnrichment;
  const missing = missingCentralTranslations(base.scientificConceptPlan!);
  assert.deepEqual(missing.map(c => c.value).sort(), ["albañilería", "especímenes de albañilería", "respuesta sísmica", "simulación sísmica"].sort());
  const english = new Map([["albañilería", "masonry"], ["especímenes de albañilería", "masonry specimens"],
    ["respuesta sísmica", "seismic response"], ["simulación sísmica", "seismic simulation"]]);
  let calls = 0;
  const provider = { async generateStructuredObject<T>(request: {schemaName:string; prompt:string}) {
    calls++; assert.equal(request.schemaName, "search_concept_translation_v1");
    const batch = JSON.parse(request.prompt.split("Input:\n")[1]) as {concepts: Array<{conceptId:string;originalText:string;sourceLanguage:"es"|"en"|"pt"|"und";targetLanguage:"en"|"es"|"pt";role:string}>};
    assert.equal(batch.concepts.length, 4);
    return { translations: batch.concepts.map(c => ({ conceptId:c.conceptId, status:"TRANSLATED", sourceLanguage:c.sourceLanguage,targetLanguage:c.targetLanguage,role:c.role,
      translatedTerm:english.get(c.originalText), academicEquivalent:null, confidence:"HIGH", notes:null })) } as T;
  } };
  const recovered = await recoverCentralTranslations(input, base, provider);
  assert.equal(calls,1); assert.equal(recovered.translationRecovery?.status,"COMPLETE");
  assert.equal(recovered.translationTrace?.filter(t => t.origin === "TRANSLATION_RECOVERY" && t.validationStatus === "ACCEPTED").length,4);
  assert.equal(missingCentralTranslations(recovered.scientificConceptPlan!).length,0);
  const family = composeSemanticQueries({necessary:[],complementary:[],optional:[],conceptPlan:recovered.scientificConceptPlan});
  assert.equal(family.coverageMode,"MULTILINGUAL");
  assert(family.plannedQueries.some(q => q.query.includes("seismic response") && q.query.includes("masonry")));
  assert(family.plannedQueries.some(q => q.query.includes("seismic simulation") && q.query.includes("masonry")));
  assert(!family.plannedQueries.slice(0,3).some(q => q.query.includes("Perú") || q.query.includes("2026")));
  for(const concept of recovered.scientificConceptPlan!.concepts) {
    const old=base.scientificConceptPlan!.concepts.find(c=>c.id===concept.id)!;
    assert.equal(concept.role,old.role); assert.equal(concept.authority,old.authority);
  }
  const again = await recoverCentralTranslations(input, base, provider);
  assert.equal(calls,1,"durable cache hit prevents duplicate paid call");
  assert.equal(again.translationRecovery?.cacheHits,4);
  assert.equal(again.translationTrace?.filter(t=>t.origin==="TRANSLATION_CACHE").length,4);
  const noRecovery = await recoverCentralTranslations(input,recovered,provider);
  assert.equal(calls,1); assert.equal(noRecovery.translationRecovery?.status,"NOT_NEEDED");
  const raw = { terms: [
    { sourceField:"problem", anchor:"respuesta sísmica", text:"respuesta sísmica", type:"EXACT_TERM", confidence:"HIGH", scientificRole:"PHENOMENON", language:"es" },
    { sourceField:"problem", anchor:"respuesta sísmica", text:"seismic response 2039", type:"TRANSLATION", confidence:"HIGH", scientificRole:"PHENOMENON", language:"en" },
    { sourceField:"problem", anchor:"respuesta sísmica", text:"seismic response", type:"TRANSLATION", confidence:"HIGH", scientificRole:"PHENOMENON", language:"und" },
    { sourceField:"concepts", anchor:"albañilería", text:"albañilería", type:"EXACT_TERM", confidence:"HIGH", scientificRole:"OBJECT_OR_SYSTEM", language:"es" },
  ], ambiguities:[] };
  const parsed = validateSearchEnrichment(input,raw as any);
  assert.equal(parsed.plannerOutputTermCount,4);
  assert.equal(parsed.translationTrace?.length,2);
  assert.deepEqual(parsed.translationTrace?.map(t=>t.validationReason).sort(),["TARGET_LANGUAGE_UNVERIFIED","UNSUPPORTED_NUMBER"].sort());
  assert(parsed.translationTrace?.every(t=>t.validationStatus==="REJECTED"));
  assert(!parsed.scientificConceptPlan?.concepts.some(c=>c.terms.some(t=>t.language==="en")));
  // Rejected planner output triggers recovery without being promoted to science.
  assert(missingCentralTranslations(parsed.scientificConceptPlan!).length>=2);
  const rejectedInput=structuredClone(input);
  rejectedInput.signals.find(s=>s.sourceField==="taxonomy")!.value+=randomUUID();
  let rejectedRecoveryCalls=0;
  const rejectedRecovered=await recoverCentralTranslations(rejectedInput,parsed,{async generateStructuredObject<T>(request:{prompt:string}) {
    rejectedRecoveryCalls++;
    const batch=JSON.parse(request.prompt.split("Input:\n")[1]) as {concepts:Array<{conceptId:string;originalText:string;sourceLanguage:string;targetLanguage:string;role:string}>};
    return {translations:batch.concepts.map(c=>({conceptId:c.conceptId,status:"TRANSLATED",sourceLanguage:c.sourceLanguage,targetLanguage:c.targetLanguage,role:c.role,
      translatedTerm:c.originalText==="respuesta sísmica"?"seismic response":"masonry",academicEquivalent:null,confidence:"HIGH",notes:null}))} as T;
  }});
  assert.equal(rejectedRecoveryCalls,1);
  assert.equal(rejectedRecovered.translationRecovery?.status,"COMPLETE");
  assert(rejectedRecovered.translationTrace?.some(t=>t.origin==="MAIN_PLANNER" && t.validationStatus==="REJECTED"));
  assert(rejectedRecovered.translationTrace?.some(t=>t.origin==="TRANSLATION_RECOVERY" && t.validationStatus==="ACCEPTED"));
  const optionalMissing = structuredClone(recovered) as SearchEnrichment;
  optionalMissing.scientificConceptPlan!.concepts.find(c=>c.role==="GEOGRAPHY")!.terms = [];
  assert.equal(missingCentralTranslations(optionalMissing.scientificConceptPlan!).length,0);
  // One failed batch leaves original-language families usable with limited coverage.
  const failedInput = structuredClone(input);
  failedInput.signals.find(s=>s.sourceField==="taxonomy")!.value += randomUUID();
  const failure = await recoverCentralTranslations(failedInput,base,{async generateStructuredObject<T>():Promise<T>{throw new Error("offline timeout")}});
  assert.equal(failure.translationRecovery?.status,"LIMITED");
  assert.equal(composeSemanticQueries({necessary:[],complementary:[],optional:[],conceptPlan:failure.scientificConceptPlan}).coverageMode,"DEGRADED_ORIGINAL_LANGUAGE");
  // A translation changes wording only. Generic verbs and qualifiers still fail.
  const bad = structuredClone(recovered.scientificConceptPlan!);
  const qualifier = bad.concepts.find(c=>c.role==="QUALIFIER")!;
  const object = bad.concepts.find(c=>c.value==="albañilería")!;
  const good=family.plannedQueries[0];
  const invalid={...good,requiredConceptIds:[qualifier.id,object.id],requiredConcepts:[qualifier.value,object.value]};
  assert(validateScientificFamily(invalid,bad).length>0);
  assert(!family.plannedQueries.some(q=>q.query.includes('"evaluate"') && q.query.includes('"masonry"')));
  // The source projection cannot contain unknown or unaccepted proposals.
  assert.equal(input.signals.find(s=>s.sourceField==="methodPreference")!.value,null);
  assert.equal(input.signals.find(s=>s.sourceField==="pendingDecisions")!.value,null);
  for(const [name,phenomenon,object,translatedPhenomenon,translatedObject,sourceLanguage,targetLanguage] of [
    ["engineering","respuesta dinámica","uniones de acero","dynamic response","steel joints","es","en"],
    ["education","retroalimentación formativa","actividades matemáticas digitales","formative feedback","digital mathematics activities","es","en"],
    ["qualitative","experiência vivida","relatos de migrantes","lived experience","migrant narratives","pt","en"],
    ["health","adesão ao tratamento","cuidados de diabetes","treatment adherence","diabetes care","pt","en"],
    ["humanities","memoria narrativa","corpus histórico","narrative memory","historical corpus","es","en"],
    ["english-to-spanish","lived experience","migration narratives","experiencia vivida","relatos de migración","en","es"],
  ] as const) {
    const d=emptyDefinition();
    for(const [field,value] of Object.entries({originalIdea:`${phenomenon}: ${object}`,topic:`${phenomenon}: ${object}`,problem:phenomenon,object,taxonomy:`fixture ${randomUUID()}`}))
      d.fields[field as keyof typeof d.fields]=userValue(value,1,"offline");
    const fi=semanticPlannerInput(searchIntent(`offline-${name}`,1,"offline",d),`intent-${name}`);
    const raw={terms:[
      {sourceField:"problem",anchor:phenomenon,text:phenomenon,type:"EXACT_TERM",confidence:"HIGH",scientificRole:"PHENOMENON",language:sourceLanguage},
      {sourceField:"object",anchor:object,text:object,type:"EXACT_TERM",confidence:"HIGH",scientificRole:"OBJECT_OR_SYSTEM",language:sourceLanguage},
    ],ambiguities:[]};
    const local=validateSearchEnrichment(fi,raw as any);
    assert.equal(missingCentralTranslations(local.scientificConceptPlan!,targetLanguage).length,2,name);
    let fixtureCalls=0;
    const resolved=await recoverCentralTranslations(fi,local,{async generateStructuredObject<T>(request:{prompt:string}) {
      fixtureCalls++;
      const payload=JSON.parse(request.prompt.split("Input:\n")[1]) as {concepts:Array<{conceptId:string;originalText:string;sourceLanguage:string;targetLanguage:string;role:string}>};
      return {translations:payload.concepts.map(c=>({conceptId:c.conceptId,status:"TRANSLATED",sourceLanguage:c.sourceLanguage,targetLanguage:c.targetLanguage,role:c.role,
        translatedTerm:c.originalText===phenomenon?translatedPhenomenon:translatedObject,
        academicEquivalent:null,confidence:"HIGH",notes:null}))} as T;
    }},targetLanguage);
    assert.equal(fixtureCalls,1,name);
    assert.equal(resolved.translationRecovery?.status,"COMPLETE",name);
    const queries=composeSemanticQueries({necessary:[],complementary:[],optional:[],conceptPlan:resolved.scientificConceptPlan});
    if(targetLanguage==="en") {
      assert(queries.plannedQueries[0].query.includes(translatedPhenomenon),name);
      assert(queries.plannedQueries[0].query.includes(translatedObject),name);
    } else {
      assert.equal(missingCentralTranslations(resolved.scientificConceptPlan!,"es").length,0,name);
      assert(resolved.scientificConceptPlan!.concepts.some(c=>c.terms.some(t=>t.language==="es" && t.value===translatedPhenomenon)),name);
    }
    assert.equal(resolved.scientificConceptPlan?.concepts.find(c=>c.value===phenomenon)?.role,"PHENOMENON",name);
    assert.equal(resolved.scientificConceptPlan?.concepts.find(c=>c.value===object)?.role,"OBJECT_OR_SYSTEM",name);
  }
  // In a domain ambiguous word or acronym, abstention is safer than a false friend.
  const ambiguousInput=structuredClone(input);
  ambiguousInput.signals.find(s=>s.sourceField==="taxonomy")!.value+=randomUUID();
  const abstained=await recoverCentralTranslations(ambiguousInput,base,{async generateStructuredObject<T>(request:{prompt:string}) {
    const batch=JSON.parse(request.prompt.split("Input:\n")[1]) as {concepts:Array<{conceptId:string;sourceLanguage:string;targetLanguage:string;role:string}>};
    return {translations:batch.concepts.map(c=>({conceptId:c.conceptId,status:"NO_SAFE_TRANSLATION",sourceLanguage:c.sourceLanguage,targetLanguage:c.targetLanguage,role:c.role,
      translatedTerm:null,academicEquivalent:null,confidence:"LOW",notes:"Ambiguous technical term"}))} as T;
  }});
  assert.equal(abstained.translationRecovery?.status,"LIMITED");
  assert.equal(missingCentralTranslations(abstained.scientificConceptPlan!).length,4);
  const abstainedAgain=await recoverCentralTranslations(ambiguousInput,base,{async generateStructuredObject<T>():Promise<T>{throw new Error("negative cache miss")}});
  assert.equal(abstainedAgain.translationRecovery?.cacheHits,4);
  assert.equal(abstainedAgain.translationRecovery?.status,"LIMITED");
  const wrongRoleInput=structuredClone(input);
  wrongRoleInput.signals.find(s=>s.sourceField==="taxonomy")!.value+=randomUUID();
  let wrongRoleCalls=0;
  const wrongRole=await recoverCentralTranslations(wrongRoleInput,base,{async generateStructuredObject<T>(request:{prompt:string}) {
    wrongRoleCalls++;
    const batch=JSON.parse(request.prompt.split("Input:\n")[1]) as {concepts:Array<{conceptId:string;sourceLanguage:string;targetLanguage:string;role:string}>};
    return {translations:batch.concepts.map(c=>({conceptId:c.conceptId,status:"TRANSLATED",sourceLanguage:c.sourceLanguage,targetLanguage:c.targetLanguage,
      role:"QUALIFIER",translatedTerm:"unrelated bridge 2039",academicEquivalent:null,confidence:"HIGH",notes:null}))} as T;
  }});
  assert.equal(wrongRoleCalls,1,"invalid batch is not retried");
  assert.equal(wrongRole.translationRecovery?.status,"LIMITED");
  assert.equal(missingCentralTranslations(wrongRole.scientificConceptPlan!).length,4);
  console.log(JSON.stringify({status:"PASS",historicalRawAvailable:false,missingCentral:missing.map(c=>c.value),recoveredEnglish:family.plannedQueries.map(q=>q.query),cacheHits:again.translationRecovery?.cacheHits,plannerRejectReasons:parsed.translationTrace?.map(t=>t.validationReason),calls,multidisciplinaryFixtures:6}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
