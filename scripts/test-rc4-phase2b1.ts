import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyDefinition, searchIntent, userValue, type DefinitionField, type ConfirmedResearchSearchIntent } from "@/lib/conversational-intake";
import { plannerIntake } from "@/lib/retrieval-search-input";
import { semanticPlannerInput, validateSearchEnrichment, fallbackSearchEnrichment, enrichmentGroups, semanticQueryPack, type EnrichmentOutput } from "@/lib/retrieval-semantic-plan";
import { buildSearchMetadata, buildRelevanceScore, pickDiverseCandidates } from "@/server/retrieval/reference-search-v2";
import { admittedOnly, decideReferenceAdmission } from "@/server/retrieval/reference-admission";
import { planSemanticSearch } from "@/server/retrieval/semantic-search-planner";

let networkAttempts = 0;
global.fetch = async () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
const term = (sourceField: DefinitionField, anchor: string, text = anchor, type: EnrichmentOutput["terms"][number]["type"] = "EXACT_TERM") => ({ sourceField, anchor, text, type, confidence: "HIGH" as const });
function intent(values: Partial<Record<DefinitionField, string>>) {
  const definition = emptyDefinition();
  for (const [field, value] of Object.entries(values)) definition.fields[field as DefinitionField] = userValue(value!, 1, "offline");
  return searchIntent("offline-project", 1, "offline-definition", definition);
}
const fixtures = [
  { name: "seismic-masonry", topic: "Simulación sísmica de especímenes de albañilería", object: "especímenes de albañilería", concepts: "respuesta sísmica; albañilería", context: "Perú y norma 2026",
    anchors: ["respuesta sísmica", "albañilería"], equivalents: ["seismic response", "masonry"], positive: "Experimental modeling of seismic response of masonry", role: "METHODOLOGICAL" },
  { name: "education-digital-math", topic: "Retroalimentación en matemáticas digitales", object: "actividades de secundaria", concepts: "retroalimentación; matemáticas digitales", context: "Lima",
    anchors: ["retroalimentación", "matemáticas digitales"], equivalents: ["feedback", "digital mathematics"], positive: "Feedback in digital mathematics learning", role: "DIRECT" },
  { name: "structural-engineering", topic: "Fatiga de puentes de acero", object: "puentes de acero", concepts: "fatiga; puentes de acero", context: "Perú",
    anchors: ["fatiga", "puentes de acero"], equivalents: ["fatigue", "steel bridges"], positive: "Experimental fatigue testing of steel bridges", role: "METHODOLOGICAL" },
  { name: "qualitative-social-science", topic: "Memoria colectiva en relatos de migración", object: "relatos de migración", concepts: "memoria colectiva; relatos de migración", context: "Argentina",
    anchors: ["memoria colectiva", "relatos de migración"], equivalents: ["collective memory", "migration narratives"], positive: "A theoretical framework for collective memory in migration narratives", role: "THEORETICAL" },
  { name: "biomedical", topic: "Adherencia terapéutica en diabetes", object: "atención de diabetes", concepts: "adherencia terapéutica; diabetes", context: "Chile",
    anchors: ["adherencia terapéutica", "diabetes"], equivalents: ["medication adherence", "diabetes"], positive: "Medication adherence in diabetes care", role: "DIRECT" },
  { name: "humanities", topic: "Traducción y recepción literaria", object: "corpus literario", concepts: "traducción; recepción literaria", context: "Siglo XIX",
    anchors: ["traducción", "recepción literaria"], equivalents: ["translation", "literary reception"], positive: "A theory of translation and literary reception", role: "THEORETICAL" },
] as const;

function score(title: string, abstract: string | null, groups: ReturnType<typeof enrichmentGroups>, overrides: Record<string, unknown> = {}) {
  const relevance = buildRelevanceScore({ title, abstract, keywordGroups: groups, matchedQuery: "offline", matchedQueryStage: "necessary_only",
    citationCount: 0, year: 1975, hasPdfUrl: false, hasDoi: false, workType: "book", venue: null, language: "en", activeLanguage: "es",
    localObjectTerms: ["palabras", "espanolas"], ...overrides });
  const admission = decideReferenceAdmission({ title, abstract, score: relevance.score, breakdown: relevance.breakdown });
  return { ...relevance, admission };
}

async function main() {
  for (const f of fixtures) {
    const current = intent({ originalIdea: f.topic, topic: f.topic, object: f.object, concepts: f.concepts, context: f.context, academicLevel: "MAESTRIA" });
    const input = semanticPlannerInput(current, "intent-hash");
    const before = JSON.stringify(current);
    const output: EnrichmentOutput = { terms: [
      ...f.anchors.flatMap((anchor, i) => [term("concepts", anchor), term("concepts", anchor, f.equivalents[i], "TRANSLATION")]),
      term("object", f.object),
      term("context", f.context),
    ], ambiguities: [] };
    const enrichment = validateSearchEnrichment(input, output);
    const groups = enrichmentGroups(enrichment);
    const queries = semanticQueryPack(groups);
    assert.equal(enrichment.status, "READY", f.name);
    assert.ok(queries.validation.valid, f.name);
    assert.ok(queries.plannedQueries.filter(q => q.family !== "CONTEXTUAL_OR_LOCAL").every(q => !q.query.includes(f.context)));
    assert.ok(queries.necessaryOnly.some(q => q.includes(`"${f.anchors[1]}"`) || q.includes(`"${f.object}"`)), "original compound phrase preserved; legacy translation language is unverified");
    assert.ok(enrichment.terms.every(t => t.provenance === "AI_DERIVED_FOR_SEARCH"));
    const positive = score(f.positive, `${f.positive}. A relevant scholarly precedent.`, groups);
    assert.equal(positive.admission.state, "ADMITTED", f.name);
    assert.equal(positive.breakdown.semanticRelevance?.role, f.role);
    const reordered = { ...groups, necessary: [...groups.necessary].reverse() };
    assert.equal(score(f.positive, f.positive, reordered).admission.state, "ADMITTED", "no positional population assumption");
    assert.equal(score(f.positive, null, groups).admission.state, "NEEDS_INSPECTION");
    assert.notEqual(score("Vaccine production in livestock", "Veterinary vaccine production.", groups, { citationCount: 999999, hasPdfUrl: true, year: 2026 }).admission.state, "ADMITTED");
    assert.equal(score(f.positive, f.positive, groups, { explicitExclusions: [f.positive] }).admission.state, "REJECTED_OFF_TOPIC");
    assert.equal(JSON.stringify(current), before);
    console.log(`PASS ${f.name}: core compounds/roles preserved; context optional; no invented method/data/population; old international positive admitted`);
  }

  const complete = intent(Object.fromEntries([
    ["topic", "Feedback digital mathematics"], ["object", "secondary school activities"], ["concepts", "feedback; digital mathematics"],
    ["originalIdea", "Feedback digital mathematics"], ["problem", "Feedback quality"], ["purpose", "Improve feedback"],
    ["context", "Lima"], ["scope", "school activities"], ["intendedOutput", "feedback protocol"], ["taxonomy", "Education"],
    ["academicLevel", "MAESTRIA"], ["methodPreference", "Qualitative preference"], ["dataAccess", "Public archives only"],
    ["constraints", "Excluir: livestock; no institution confirmed"], ["researchLine", "Digital learning"], ["advisorNotes", "Compare conceptual approaches"], ["pendingDecisions", "Instrument unknown"],
  ]) as Partial<Record<DefinitionField, string>>);
  const fullInput = semanticPlannerInput(complete, "complete-hash");
  assert.equal(fullInput.signals.filter(s => s.value).length, 17);
  assert.equal(fullInput.signals.find(s => s.sourceField === "advisorNotes")?.tier, 3);
  const fullPlan = fallbackSearchEnrichment(fullInput);
  assert.equal(fullPlan.planMode, "DEGRADED");
  assert.ok(!fullPlan.terms.some(t => ["pendingDecisions", "advisorNotes", "constraints", "dataAccess"].includes(t.sourceField)));
  assert.deepEqual(fullPlan.explicitExclusions, ["livestock"]);
  assert.ok(fullPlan.terms.every(t => t.provenance === "CONFIRMED_EXTRACT"));

  const d = emptyDefinition();
  d.fields.topic = userValue("Feedback mathematics", 1, "test");
  d.fields.concepts = userValue("feedback; mathematics", 1, "test");
  d.fields.methodPreference = { ...userValue("Invented experiment", 1, "test"), origin: "AI_PROPOSED", acceptance: "REJECTED" };
  d.fields.context = { ...userValue("Account country", 1, "test"), origin: "SYSTEM_DEFAULT" };
  const guarded = semanticPlannerInput(searchIntent("guarded", 1, "hash", d), "hash");
  assert.equal(guarded.signals.find(s => s.sourceField === "methodPreference")?.value, null);
  assert.equal(guarded.signals.find(s => s.sourceField === "context")?.value, null);
  const guardedPlan = validateSearchEnrichment(guarded, { terms: [term("methodPreference", "Invented experiment"), term("context", "Account country"), term("concepts", "feedback", "feedback 2037", "TRANSLATION"), term("concepts", "not present", "unfounded")], ambiguities: [] });
  assert.equal(guardedPlan.terms.length, 0);
  const exploratory = validateSearchEnrichment(guarded, { terms: [term("concepts", "feedback", "artificial intelligence", "RELATED_TERM")], ambiguities: [] });
  assert.equal(exploratory.terms[0].authority, "EXPLORATORY");
  assert.equal(exploratory.status, "NEEDS_CLARIFICATION");

  let invocations = 0;
  const unavailable = { async generateStructuredObject<T>(): Promise<T> { invocations++; throw new Error("offline timeout"); } };
  assert.equal((await planSemanticSearch(fullInput, unavailable)).planMode, "DEGRADED");
  assert.equal(invocations, 1, "no second text fallback");
  const sparse = semanticPlannerInput(intent({ topic: "Technology" }), "sparse");
  await planSemanticSearch(sparse, unavailable);
  assert.equal(invocations, 1, "clarification before model/provider work");
  const invalid = await planSemanticSearch(fullInput, { async generateStructuredObject<T>() { return { bad: true } as T; } });
  assert.equal(invalid.planMode, "DEGRADED");

  const historical = JSON.parse(readFileSync("scripts/fixtures/phase2b1-seismic.json", "utf8")) as {
    intent: ConfirmedResearchSearchIntent; candidates: Array<{ title: string; doi: string; abstract: string | null; oldScore: number; oldState: string }>;
  };
  assert.equal(historical.candidates.length, 47);
  assert.equal(historical.candidates.filter(c => c.oldState === "NEEDS_INSPECTION").length, 46);
  assert.ok(historical.candidates.every(c => c.oldScore === 0));
  const seismicTerms: EnrichmentOutput = { terms: [term("concepts", "sísmica", "seismic", "TRANSLATION"), term("concepts", "albañilería", "masonry", "TRANSLATION"), term("context", "Perú"), term("concepts", "2026")], ambiguities: [] };
  let metadataCalls = 0;
  const metadata = await buildSearchMetadata({ intakeId: "offline", intent: historical.intent, plannerInput: plannerIntake(historical.intent) }, {
    async generateStructuredObject<T>(request: import("@/llm/provider").StructuredObjectInput) {
      metadataCalls++;
      if (request.schemaName !== "search_concept_translation_v1") { assert.match(request.prompt, /intendedOutput/); assert.match(request.prompt, /UNKNOWN/); }
      return seismicTerms as T;
    },
  });
  assert.equal(metadataCalls, 2, "incomplete historical language coverage requests one bounded recovery batch");
  assert.deepEqual(metadata.enrichment?.rawPlannerOutput, seismicTerms, "raw structured planner terms survive normalization in the paid plan audit");
  assert.equal(metadata.enrichment?.translationRecovery?.status, "LIMITED", "invalid simulated recovery preserves original-language queries");
  assert.equal(metadata.enrichment?.planMode, "SEMANTIC");
  assert.ok(metadata.queryPack.necessaryOnly.some(q => !q.includes("2026") && !q.includes("Perú")));
  const groups = metadata.keywordGroups as ReturnType<typeof enrichmentGroups>;
  const scored = historical.candidates.map(c => ({ title: c.title, ...score(c.title, c.abstract, groups) }));
  const admitted = scored.filter(c => c.admission.state === "ADMITTED");
  assert.ok(admitted.length < 47, "no blanket approval of historical candidates");
  assert.ok(scored.filter(c => !historical.candidates.find(h => h.title === c.title)?.abstract).every(c => c.admission.state !== "ADMITTED"));
  // The immutable audit lacks most abstracts. Synthetic controls are labelled as
  // simulated, never substituted for the missing real abstracts.
  const methodological = score("Shake-table testing of full-scale masonry specimens", "Experimental methodology for seismic response of full-scale masonry specimens.", groups);
  assert.equal(methodological.admission.state, "ADMITTED");
  assert.notEqual(score("Reinforced concrete frame response", "Seismic response of reinforced concrete frames.", groups).admission.state, "ADMITTED");
  assert.equal(metadata.enrichment?.terms.some(t => t.text === "2026" && t.authority === "CENTRAL"), false);

  const ranked = scored.map((c, i) => ({ candidate: { doi: String(i), title: c.title }, score: c.score, admission: c.admission }));
  const selected = pickDiverseCandidates({ rankedCandidates: admittedOnly(ranked) as Parameters<typeof pickDiverseCandidates>[0]["rankedCandidates"], desiredTotal: 50, metadata, activeLanguage: "es" });
  assert.equal(selected.length, admitted.length);
  assert.equal(networkAttempts, 0);
  console.log(JSON.stringify({ historicalCandidates: 47, abstractsAvailable: historical.candidates.filter(c => c.abstract).length,
    admittedOffline: admitted.length, missingAbstractsNotPromoted: true, simulatedMethodologicalControl: "PASS", liveCalls: 0 }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
