import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LlmProvider } from "@/llm/provider";
import { composeSemanticQueries } from "@/lib/retrieval-query-composition";
import { highAuthorityTerms, normalizeConcept, type ScientificConcept, type ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import type { SearchEnrichment, SemanticPlannerInput, TranslationTrace } from "@/lib/retrieval-semantic-plan";
import { SEARCH_CONCEPT_TRANSLATION_PROMPT } from "@/server/mvp/prompts/search-concept-translation.v1";
import { renderVersionedPrompt } from "@/server/mvp/prompts/render-versioned-prompt";
import { currentPaidOperation } from "@/server/mvp/pre-job-budget";
import { SCIENTIFIC_ROLES } from "@/lib/retrieval-scientific-concepts";

const RESPONSE = z.object({ translations: z.array(z.object({
  conceptId: z.string(), status: z.enum(["TRANSLATED", "NO_SAFE_TRANSLATION"]),
  sourceLanguage: z.enum(["es", "en", "pt", "und"]), targetLanguage: z.enum(["en", "es", "pt"]),
  role: z.enum(SCIENTIFIC_ROLES),
  translatedTerm: z.string().nullable(), academicEquivalent: z.string().nullable(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]), notes: z.string().max(240).nullable(),
}).strict()).max(16) }).strict();
type TargetLanguage = "en" | "es" | "pt";
type Item = { conceptId: string; originalText: string; role: ScientificConcept["role"]; sourceLanguage: string; targetLanguage: TargetLanguage; domainContext: string };
const CACHE_ROOT = path.join(process.cwd(), "artifacts-local", "search-concept-translation-v1");
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const recoveryModel = () => process.env.SOURCE_TRANSLATION_RECOVERY_MODEL?.trim() || "gpt-5.4-mini";
export const translationCacheKey = (item: Item, model = recoveryModel()) => digest({
  source: normalizeConcept(item.originalText), from: item.sourceLanguage, to: item.targetLanguage,
  role: item.role, domain: normalizeConcept(item.domainContext), prompt: SEARCH_CONCEPT_TRANSLATION_PROMPT.version, model,
});
type Cached = { status: "TRANSLATED"; translatedTerm: string; academicEquivalent: string | null; confidence: "HIGH" } |
  { status: "NO_SAFE_TRANSLATION"; translatedTerm: null; academicEquivalent: null; confidence: "LOW" };
async function readCache(key: string): Promise<Cached | null> {
  try { const raw = JSON.parse(await readFile(path.join(CACHE_ROOT, `${key}.json`), "utf8"));
    if (raw.key !== key || raw.version !== SEARCH_CONCEPT_TRANSLATION_PROMPT.version) return null;
    return cachedSchema.parse(raw.result);
  } catch { return null; }
}
const cachedSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("TRANSLATED"), translatedTerm: z.string().min(2).max(100), academicEquivalent: z.string().nullable(), confidence: z.literal("HIGH") }).strict(),
  z.object({ status: z.literal("NO_SAFE_TRANSLATION"), translatedTerm: z.null(), academicEquivalent: z.null(), confidence: z.literal("LOW") }).strict(),
]);
async function writeCache(key: string, value: Cached) {
  await mkdir(CACHE_ROOT, { recursive: true });
  const target = path.join(CACHE_ROOT, `${key}.json`), temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: SEARCH_CONCEPT_TRANSLATION_PROMPT.version, key, result: value }));
  await rename(temporary, target);
}
async function writeCacheBestEffort(key: string, value: Cached) {
  try { await writeCache(key, value); } catch { /* Cache loss must not block a safe search plan. */ }
}
const sourceLanguage = (concept: ScientificConcept): string => {
  const exact = concept.terms.find(t => t.expansionType === "EXACT_ORIGINAL" && t.language !== "original" && t.language !== "und");
  return exact?.language ?? "und";
};
const translationPresent = (concept: ScientificConcept, language: TargetLanguage) => highAuthorityTerms(concept).some(t => t.language === language &&
  ["EXACT_ORIGINAL", "VALIDATED_TRANSLATION", "ACADEMIC_EQUIVALENT"].includes(t.expansionType));
export function missingCentralTranslations(plan: ScientificConceptPlan, language: TargetLanguage = "en") {
  const pack = composeSemanticQueries({ necessary: [], complementary: [], optional: [], conceptPlan: plan });
  const required = new Set(pack.plannedQueries.flatMap(q => q.requiredConceptIds));
  return plan.concepts.filter(c => required.has(c.id) && c.authority === "CENTRAL" && !translationPresent(c, language));
}
// Mechanical checks cannot prove translation equivalence. They only reject
// structurally unsafe additions; semantic quality remains an evaluation gate.
function validateTranslation(item: Item, translated: string | null, equivalent: string | null, confidence: string) {
  if (!translated || confidence !== "HIGH") return "NO_HIGH_CONFIDENCE_TRANSLATION";
  const text = translated.trim(), original = normalizeConcept(item.originalText);
  if (item.sourceLanguage !== "und" && item.sourceLanguage !== item.targetLanguage && normalizeConcept(text) === original) return "TARGET_LANGUAGE_NOT_ESTABLISHED";
  if (text.length < 2 || text.length > 100 || /[\n\r"(){};:]/.test(text) || /\b(?:AND|OR|NOT)\b/.test(text)) return "INVALID_TERM_SHAPE";
  if (normalizeConcept(text).split(" ").length > Math.max(4, original.split(" ").length * 2 + 1)) return "TRANSLATION_ADDS_UNSUPPORTED_DETAIL";
  if ((text.match(/\d+/g) ?? []).some(n => !original.includes(n))) return "UNSUPPORTED_NUMBER_OR_STANDARD";
  if (/\b(?:using|via|among|within|in|at|from|with)\b/i.test(text) && !/\b(?:mediante|usando|ubicad[oa]|com|usando|via|using|en|con|desde)\b/i.test(original)) return "UNSUPPORTED_CONTEXT_OR_METHOD";
  if (equivalent && (equivalent.length > 100 || /[\n\r"(){};:]/.test(equivalent))) return "INVALID_EQUIVALENT_SHAPE";
  return "ACCEPTED";
}
function traceFor(item: Item, translatedText: string, origin: TranslationTrace["origin"], status: TranslationTrace["validationStatus"], reason: string,
  concept: ScientificConcept, expansionType: TranslationTrace["expansionType"] = "TRANSLATION"): TranslationTrace {
  return { translationId: digest([item.conceptId, item.targetLanguage, translatedText, expansionType, origin]),
    sourceConceptId: item.conceptId, originalText: item.originalText, translatedText,
    sourceLanguage: item.sourceLanguage, targetLanguage: item.targetLanguage,
    expansionType, origin, authority: concept.authority, sourceFields: concept.sourceFields,
    plannerOperationId: currentPaidOperation()?.id ?? null, validationStatus: status, validationReason: reason };
}
export async function recoverCentralTranslations(input: SemanticPlannerInput, enrichment: SearchEnrichment,
  provider: Pick<LlmProvider, "generateStructuredObject">, language: TargetLanguage = "en") {
  const plan = enrichment.scientificConceptPlan ? structuredClone(enrichment.scientificConceptPlan) : undefined;
  if (!plan || enrichment.status !== "READY") return enrichment;
  const missing = missingCentralTranslations(plan, language);
  if (!missing.length) return { ...enrichment, translationRecovery: { status: "NOT_NEEDED" as const, model: recoveryModel(), promptVersion: SEARCH_CONCEPT_TRANSLATION_PROMPT.version, requestedIds: [], cacheHits: 0 } };
  const domainContext = input.signals.find(s => s.sourceField === "taxonomy" && s.value)?.value?.slice(0, 200) ?? "";
  const items: Item[] = missing.map(c => ({ conceptId: c.id, originalText: c.value, role: c.role, sourceLanguage: sourceLanguage(c), targetLanguage: language, domainContext }));
  const traces: TranslationTrace[] = [...enrichment.translationTrace ?? []];
  const pending: Item[] = [];
  const cached = new Map<string, Cached>();
  for (const item of items) {
    const hit = await readCache(translationCacheKey(item));
    if (hit && (hit.status === "NO_SAFE_TRANSLATION" || validateTranslation(item, hit.translatedTerm, hit.academicEquivalent, hit.confidence) === "ACCEPTED")) cached.set(item.conceptId, hit);
    else pending.push(item);
  }
  let status: "COMPLETE" | "LIMITED" = "COMPLETE";
  let response: z.infer<typeof RESPONSE> | null = null;
  if (pending.length) {
    try {
      response = RESPONSE.parse(await provider.generateStructuredObject({ maxRetries: 0, model: recoveryModel(), reasoningEffort: "low", maxOutputTokens: 2500,
        schemaName: "search_concept_translation_v1", schema: z.toJSONSchema(RESPONSE),
        prompt: renderVersionedPrompt(SEARCH_CONCEPT_TRANSLATION_PROMPT, { var_0: JSON.stringify({ searchIntentHash: input.searchIntentHash, concepts: pending }) }),
        trackingLabel: "structured:search_concept_translation", trackingAttribution: { stage: "source_discovery", promptVersion: SEARCH_CONCEPT_TRANSLATION_PROMPT.version },
      }));
      if (response.translations.length !== pending.length || new Set(response.translations.map(r => r.conceptId)).size !== pending.length ||
        response.translations.some(r => !pending.some(p => p.conceptId === r.conceptId && p.role === r.role &&
          p.sourceLanguage === r.sourceLanguage && p.targetLanguage === r.targetLanguage))) throw new Error("TRANSLATION_BATCH_MEMBERSHIP_OR_ROLE_INVALID");
    } catch { status = "LIMITED"; response = null; }
  }
  for (const item of items) {
    const concept = plan.concepts.find(c => c.id === item.conceptId)!;
    const row = response?.translations.find(r => r.conceptId === item.conceptId);
    const hit = cached.get(item.conceptId);
    const term = hit?.translatedTerm ?? row?.translatedTerm ?? null;
    const equivalent = hit?.academicEquivalent ?? row?.academicEquivalent ?? null;
    const confidence = hit?.confidence ?? row?.confidence ?? "LOW";
    const reason = row?.status === "NO_SAFE_TRANSLATION" || hit?.status === "NO_SAFE_TRANSLATION" ? "NO_SAFE_TRANSLATION" : validateTranslation(item, term, equivalent, confidence);
    if (reason !== "ACCEPTED") {
      status = "LIMITED";
      traces.push(traceFor(item, term ?? "", hit ? "TRANSLATION_CACHE" : "TRANSLATION_RECOVERY", "REJECTED", reason, concept));
      if (!hit && reason === "NO_SAFE_TRANSLATION") await writeCacheBestEffort(translationCacheKey(item), { status: "NO_SAFE_TRANSLATION", translatedTerm: null, academicEquivalent: null, confidence: "LOW" });
      continue;
    }
    concept.terms.push({ value: term!, language, expansionType: "VALIDATED_TRANSLATION", translationOf: concept.id,
      origin: "AI_DERIVED_FOR_SEARCH", confidence: confidence as "HIGH" | "MEDIUM" });
    traces.push(traceFor(item, term!, hit ? "TRANSLATION_CACHE" : "TRANSLATION_RECOVERY", "ACCEPTED", "STRUCTURALLY_VALIDATED", concept));
    if (equivalent && normalizeConcept(equivalent) !== normalizeConcept(term!)) {
      const equivalentReason = validateTranslation(item, equivalent, null, confidence);
      if (equivalentReason === "ACCEPTED") {
        concept.terms.push({ value: equivalent, language, expansionType: "ACADEMIC_EQUIVALENT", origin: "AI_DERIVED_FOR_SEARCH", confidence: confidence as "HIGH" | "MEDIUM" });
        traces.push(traceFor(item, equivalent, hit ? "TRANSLATION_CACHE" : "TRANSLATION_RECOVERY", "ACCEPTED", "STRUCTURALLY_VALIDATED", concept, "ACADEMIC_SYNONYM"));
      } else traces.push(traceFor(item, equivalent, hit ? "TRANSLATION_CACHE" : "TRANSLATION_RECOVERY", "REJECTED", equivalentReason, concept, "ACADEMIC_SYNONYM"));
    }
    if (!hit) await writeCacheBestEffort(translationCacheKey(item), { status: "TRANSLATED", translatedTerm: term!, academicEquivalent: equivalent, confidence: "HIGH" });
  }
  return { ...enrichment, translationTrace: traces, scientificConceptPlan: plan,
    translationRecovery: { status, model: recoveryModel(), promptVersion: SEARCH_CONCEPT_TRANSLATION_PROMPT.version, requestedIds: items.map(i => i.conceptId), cacheHits: cached.size } };
}

// Planning degradation may reuse previously validated terminology without a
// provider call. Cache misses are deliberately left as literal source terms.
export async function recoverCachedCentralTranslations(input: SemanticPlannerInput, enrichment: SearchEnrichment): Promise<SearchEnrichment> {
  const plan = enrichment.scientificConceptPlan ? structuredClone(enrichment.scientificConceptPlan) : undefined;
  if (!plan || enrichment.status !== "READY") return enrichment;
  const domainContext = input.signals.find(s => s.sourceField === "taxonomy" && s.value)?.value?.slice(0, 200) ?? "";
  const traces = [...enrichment.translationTrace ?? []];
  const missing = missingCentralTranslations(plan, "en");
  let hits = 0;
  for (const concept of missing) {
    const item: Item = { conceptId: concept.id, originalText: concept.value, role: concept.role,
      sourceLanguage: sourceLanguage(concept), targetLanguage: "en", domainContext };
    const hit = await readCache(translationCacheKey(item));
    if (hit?.status !== "TRANSLATED" || validateTranslation(item, hit.translatedTerm, hit.academicEquivalent, hit.confidence) !== "ACCEPTED") continue;
    const target = plan.concepts.find(row => row.id === concept.id)!;
    target.terms.push({ value: hit.translatedTerm, language: "en", expansionType: "VALIDATED_TRANSLATION",
      translationOf: target.id, origin: "AI_DERIVED_FOR_SEARCH", confidence: "HIGH" });
    traces.push(traceFor(item, hit.translatedTerm, "TRANSLATION_CACHE", "ACCEPTED", "STRUCTURALLY_VALIDATED", target));
    if (hit.academicEquivalent && validateTranslation(item, hit.academicEquivalent, null, hit.confidence) === "ACCEPTED") {
      target.terms.push({ value: hit.academicEquivalent, language: "en", expansionType: "ACADEMIC_EQUIVALENT",
        origin: "AI_DERIVED_FOR_SEARCH", confidence: "HIGH" });
      traces.push(traceFor(item, hit.academicEquivalent, "TRANSLATION_CACHE", "ACCEPTED", "STRUCTURALLY_VALIDATED", target, "ACADEMIC_SYNONYM"));
    }
    hits++;
  }
  return { ...enrichment, scientificConceptPlan: plan, translationTrace: traces,
    translationRecovery: { status: hits === missing.length ? "COMPLETE" : "LIMITED", model: recoveryModel(),
      promptVersion: SEARCH_CONCEPT_TRANSLATION_PROMPT.version, requestedIds: [], cacheHits: hits } };
}
