import { z } from "zod";
import { createHash } from "node:crypto";
import { containsConcept, highAuthorityTerms, normalizeConcept, type ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { genericResearchAction } from "@/lib/retrieval-query-composition";

export const CANDIDATE_REVIEW_VERSION = "candidate-semantic-review.v1";
export const MAX_REVIEW_CANDIDATES = 40;
export const MAX_RECOMMENDATIONS = 20; // Presentation cap, independent of scientific admission/selection.
export const reviewItemSchema = z.object({
  candidateId: z.string(),
  relevance: z.enum(["HIGHLY_RELEVANT", "RELEVANT", "PARTIALLY_RELEVANT", "INSUFFICIENT_METADATA", "OFF_TOPIC"]),
  role: z.enum(["DIRECT", "METHODOLOGICAL", "THEORETICAL", "CONTEXTUAL", "NONE"]),
  matchedIntentDimensions: z.array(z.string()), mismatches: z.array(z.string()),
  rationale: z.string(), confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  evidence: z.array(z.object({ field: z.enum(["title", "abstract"]), quote: z.string() })),
}).strict();
export const candidateReviewSchema = z.object({ reviews: z.array(reviewItemSchema) }).strict();
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type CandidateAssessment = ReviewItem & {
  policyVersion: typeof CANDIDATE_REVIEW_VERSION; searchIntentHash: string;
  metadataHash: string; origin: "DETERMINISTIC" | "MODEL_REVIEW";
};
export type ReviewCandidate = {
  candidateId: string; title: string; abstract: string | null; year: number | null;
  authors?: string[]; venue?: string | null; workType?: string | null; query?: string;
  deterministicSignals?: unknown;
};
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export const candidateMetadataHash = (c: ReviewCandidate) => digest(JSON.stringify([c.title, c.abstract]));
const generic = new Set("the and for with from this that study studies research analysis evaluation response behavior behaviour design results model models scientific investigation investigar investigar estudiar evaluar diseno respuesta comportamiento estudio investigacion analisis criterios criterion criteria using mediante para sobre como con los las del una unos unas por ante entre este esta son que of in on to a an is de la el y en".split(" "));
const stems = (s: string) => [...new Set(normalizeConcept(s).split(" ").filter(w => w.length > 3 && !generic.has(w)).map(w => w.slice(0, 5)))];
const support = (text: string, values: string[]) => {
  const words = new Set(stems(text));
  return new Set(values.flatMap(stems).filter(w => words.has(w))).size;
};
const precedentSignal = (s: string) => /\b(?:model\w*|analys\w*|analis\w*|experiment\w*|test\w*|ensay\w*|teori\w*|theor\w*|framework|marco|concept\w*|interpret\w*|simula\w*)\b/.test(normalizeConcept(s));

export function prepareCandidateReview(candidates: ReviewCandidate[], plan: ScientificConceptPlan, exclusions: string[] = []) {
  const assessments = new Map<string, CandidateAssessment>();
  const science = plan.concepts.filter(c => c.authority !== "EXPLORATORY" && !genericResearchAction(c) && ["PHENOMENON", "CORE_CONCEPT", "RESEARCH_ACTION", "METHOD_OR_TECHNIQUE", "THEORY_OR_FRAMEWORK"].includes(c.role));
  const domains = plan.concepts.filter(c => c.authority === "CENTRAL" && ["OBJECT_OR_SYSTEM", "CORE_CONCEPT"].includes(c.role));
  const values = (cs: typeof science) => cs.flatMap(c => highAuthorityTerms(c).map(t => t.value));
  const pending: Array<{ candidate: ReviewCandidate; priority: number }> = [];
  for (const original of candidates) {
    const c = { ...original, abstract: original.abstract?.slice(0, 1800) ?? null };
    const text = `${c.title} ${c.abstract ?? ""}`;
    const scientific = support(text, values(science)), object = support(text, values(domains));
    const titleScientific = support(c.title, values(science)), titleObject = support(c.title, values(domains));
    const exactScience = science.find(a => highAuthorityTerms(a).some(t => containsConcept(c.title, t.value)));
    const exactDomain = domains.find(a => a.id !== exactScience?.id && highAuthorityTerms(a).some(t => containsConcept(c.title, t.value)));
    const decide = (relevance: ReviewItem["relevance"], role: ReviewItem["role"], rationale: string) => assessments.set(c.candidateId, {
      candidateId: c.candidateId, relevance, role, rationale, confidence: "HIGH", mismatches: [],
      matchedIntentDimensions: [...new Set([...(exactScience?.sourceFields ?? []), ...(exactDomain?.sourceFields ?? [])])],
      evidence: [{ field: "title", quote: c.title }], policyVersion: CANDIDATE_REVIEW_VERSION,
      searchIntentHash: plan.searchIntentHash, metadataHash: candidateMetadataHash(original), origin: "DETERMINISTIC",
    });
    if (!c.title.trim()) { decide("INSUFFICIENT_METADATA", "NONE", "TITLE_MISSING"); continue; }
    if (exclusions.some(e => containsConcept(c.title, e))) { decide("OFF_TOPIC", "NONE", "EXPLICIT_EXCLUSION"); continue; }
    if (!scientific && !object || (!scientific && object && !precedentSignal(text))) {
      // Screening decision, not a claim that unseen full text is irrelevant.
      decide("OFF_TOPIC", "NONE", "NO_SCIENTIFIC_OR_PRECEDENT_SUPPORT_IN_AVAILABLE_METADATA"); continue;
    }
    if (exactScience && exactDomain && exactScience.id !== exactDomain.id && c.abstract?.trim()) {
      const role = exactScience.role === "METHOD_OR_TECHNIQUE" ? "METHODOLOGICAL" : exactScience.role === "THEORY_OR_FRAMEWORK" ? "THEORETICAL" : "DIRECT";
      decide("HIGHLY_RELEVANT", role, "INDEPENDENT_SCIENTIFIC_AND_DOMAIN_PHRASES_IN_TITLE"); continue;
    }
    pending.push({ candidate: c, priority: Number(Boolean(c.abstract)) * 6 + Math.min(titleScientific, 3) * 3 + Math.min(titleObject, 3) * 3 + Math.min(scientific, 3) + Math.min(object, 3) });
  }
  pending.sort((a, b) => b.priority - a.priority || a.candidate.candidateId.localeCompare(b.candidate.candidateId));
  return { assessments, batch: pending.slice(0, MAX_REVIEW_CANDIDATES).map(x => x.candidate), deferredIds: pending.slice(MAX_REVIEW_CANDIDATES).map(x => x.candidate.candidateId) };
}

export function validateCandidateReviews(raw: unknown, batch: ReviewCandidate[], originals: ReviewCandidate[], allowedFields: string[], searchIntentHash: string) {
  const parsed = candidateReviewSchema.parse(raw);
  const ids = new Set(batch.map(c => c.candidateId));
  if (parsed.reviews.length !== ids.size || new Set(parsed.reviews.map(r => r.candidateId)).size !== ids.size) throw new Error("REVIEW_BATCH_INCOMPLETE_OR_DUPLICATE");
  const result = new Map<string, CandidateAssessment>();
  for (const item of parsed.reviews) {
    const candidate = batch.find(c => c.candidateId === item.candidateId);
    if (!candidate || !ids.has(item.candidateId)) throw new Error("REVIEW_UNKNOWN_CANDIDATE");
    if (item.rationale.length > 1000 || item.matchedIntentDimensions.some(f => !allowedFields.includes(f))) throw new Error("REVIEW_INVALID_INTENT_REFERENCE");
    if (item.evidence.some(e => e.quote.trim().length < 12 || !containsConcept(candidate[e.field] ?? "", e.quote))) throw new Error("REVIEW_UNGROUNDED_EVIDENCE");
    const positive = ["HIGHLY_RELEVANT", "RELEVANT"].includes(item.relevance);
    if (positive && (!item.evidence.length || !item.matchedIntentDimensions.length || item.role === "NONE")) throw new Error("REVIEW_POSITIVE_WITHOUT_SUPPORT");
    result.set(item.candidateId, { ...item, policyVersion: CANDIDATE_REVIEW_VERSION, searchIntentHash,
      metadataHash: candidateMetadataHash(originals.find(c => c.candidateId === item.candidateId)!), origin: "MODEL_REVIEW" });
  }
  return result;
}

export function finalCandidateAdmission(a: CandidateAssessment) {
  if (a.relevance === "OFF_TOPIC") return "REJECTED_OFF_TOPIC" as const;
  if (["HIGHLY_RELEVANT", "RELEVANT"].includes(a.relevance) && a.confidence !== "LOW" && a.role !== "NONE" && a.evidence.length && a.matchedIntentDimensions.length) return "ADMITTED" as const;
  return "NEEDS_INSPECTION" as const;
}
