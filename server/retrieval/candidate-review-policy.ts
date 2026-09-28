import { z } from "zod";
import { createHash } from "node:crypto";
import { containsConcept, highAuthorityTerms, normalizeConcept, type ScientificConceptPlan } from "@/lib/retrieval-scientific-concepts";
import { genericResearchAction } from "@/lib/retrieval-query-composition";

export const CANDIDATE_REVIEW_VERSION = "candidate-semantic-review.v2";
export const MAX_REVIEW_CANDIDATES = 30;
export const MAX_REVIEW_BATCHES = 2;
export const MAX_RECOMMENDATIONS = 20; // Presentation cap, independent of scientific admission/selection.
export const reviewItemSchema = z.object({
  candidateId: z.string(),
  relevance: z.enum(["HIGHLY_RELEVANT", "RELEVANT", "PARTIALLY_RELEVANT", "INSUFFICIENT_METADATA", "OFF_TOPIC"]),
  role: z.enum(["DIRECT", "METHODOLOGICAL", "THEORETICAL", "CONTEXTUAL", "NONE"]),
  matchedIntentDimensions: z.array(z.string()), mismatches: z.array(z.string()),
  rationale: z.string(), confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  supportingEvidenceIds: z.array(z.string()), mismatchEvidenceIds: z.array(z.string()),
}).strict();
export const candidateReviewSchema = z.object({ reviews: z.array(reviewItemSchema) }).strict();
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type CandidateAssessment = Omit<ReviewItem, "supportingEvidenceIds" | "mismatchEvidenceIds"> & {
  evidence: Array<{ field: "title" | "abstract"; quote: string; evidenceId?: string }>;
  supportingEvidenceIds?: string[]; mismatchEvidenceIds?: string[];
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
export type CandidateEvidenceUnit = { evidenceId: string; sourceField: "TITLE" | "ABSTRACT"; text: string };
export type ReviewTask = "RELEVANCE_AND_ROLE" | "ROLE_ONLY";
export type CandidateReviewRequest = ReviewCandidate & { reviewTask: ReviewTask; evidenceUnits: CandidateEvidenceUnit[] };
export type ItemValidationStatus = "VALID" | "INVALID_UNGROUNDED" | "INVALID_SCHEMA" | "INVALID_CANDIDATE" | "INCOMPLETE";
export function candidateEvidenceUnits(candidate: ReviewCandidate): CandidateEvidenceUnit[] {
  const units: CandidateEvidenceUnit[] = [];
  const add = (sourceField: CandidateEvidenceUnit["sourceField"], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const evidenceId = digest(`${candidate.candidateId}:${sourceField}:${units.length}:${digest(clean)}`).slice(0, 20);
    units.push({ evidenceId, sourceField, text: clean });
  };
  add("TITLE", candidate.title);
  const abstract = candidate.abstract?.slice(0, 1800) ?? "";
  // Bounded, deterministic segments; no sentence inference or model-generated evidence.
  for (const sentence of abstract.split(/(?<=[.!?])\s+/)) {
    for (let offset = 0; offset < sentence.length; offset += 360) add("ABSTRACT", sentence.slice(offset, offset + 360));
  }
  return units;
}
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
  const roleOnly: ReviewCandidate[] = [];
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
      decide("HIGHLY_RELEVANT", role, "INDEPENDENT_SCIENTIFIC_AND_DOMAIN_PHRASES_IN_TITLE");
      if (role === "DIRECT" && precedentSignal(text)) roleOnly.push(c);
      continue;
    }
    pending.push({ candidate: c, priority: Number(Boolean(c.abstract)) * 6 + Math.min(titleScientific, 3) * 3 + Math.min(titleObject, 3) * 3 + Math.min(scientific, 3) + Math.min(object, 3) });
  }
  pending.sort((a, b) => b.priority - a.priority || a.candidate.candidateId.localeCompare(b.candidate.candidateId));
  roleOnly.sort((a, b) => Number(precedentSignal(b.title)) - Number(precedentSignal(a.title)) || a.candidateId.localeCompare(b.candidateId));
  const capacity = MAX_REVIEW_CANDIDATES * MAX_REVIEW_BATCHES;
  // Reserve a small bounded part of the review budget for ambiguous roles on
  // already-admitted positives; never evict the entire plausible pending pool.
  const roleBudget = Math.min(6, roleOnly.length, Math.max(0, capacity - pending.length));
  const selected = [
    ...pending.slice(0, capacity - roleBudget).map(x => ({ ...x.candidate, reviewTask: "RELEVANCE_AND_ROLE" as const, evidenceUnits: candidateEvidenceUnits(x.candidate) })),
    ...roleOnly.slice(0, roleBudget).map(c => ({ ...c, reviewTask: "ROLE_ONLY" as const, evidenceUnits: candidateEvidenceUnits(c) })),
  ];
  const batches = [selected.slice(0, MAX_REVIEW_CANDIDATES), selected.slice(MAX_REVIEW_CANDIDATES)].filter(b => b.length);
  return { assessments, batch: batches[0] ?? [], batches, deferredIds: [
    ...pending.slice(capacity - roleBudget).map(x => x.candidate.candidateId), ...roleOnly.slice(roleBudget).map(x => x.candidateId),
  ] };
}

export function validateCandidateReviews(raw: unknown, batch: CandidateReviewRequest[], originals: ReviewCandidate[], allowedFields: string[], searchIntentHash: string,
  prior: Map<string, CandidateAssessment> = new Map()) {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { reviews?: unknown }).reviews)) throw new Error("REVIEW_TOP_LEVEL_INVALID");
  const rows = (raw as { reviews: unknown[] }).reviews;
  const byId = new Map(batch.map(c => [c.candidateId, c]));
  const originalById = new Map(originals.map(c => [c.candidateId, c]));
  const result = new Map<string, CandidateAssessment>();
  const statuses = new Map<string, ItemValidationStatus>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = row && typeof row === "object" && typeof (row as { candidateId?: unknown }).candidateId === "string"
      ? (row as { candidateId: string }).candidateId : null;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const knownRows = rows.filter(row => row && typeof row === "object" && byId.has((row as { candidateId?: string }).candidateId ?? "")).length;
  if (!rows.length || knownRows === 0 || rows.length > 2 && knownRows < rows.length / 2) throw new Error("REVIEW_GROSS_CANDIDATE_SET_MISMATCH");
  for (const row of rows) {
    const parsed = reviewItemSchema.safeParse(row);
    const id = row && typeof row === "object" && typeof (row as { candidateId?: unknown }).candidateId === "string"
      ? (row as { candidateId: string }).candidateId : null;
    if (!id || !byId.has(id)) { statuses.set(id ?? `unknown:${statuses.size}`, "INVALID_CANDIDATE"); continue; }
    if ((counts.get(id) ?? 0) > 1) { statuses.set(id, "INVALID_CANDIDATE"); continue; }
    if (!parsed.success) { statuses.set(id, "INVALID_SCHEMA"); continue; }
    const item = parsed.data, candidate = byId.get(id)!, original = originalById.get(id);
    if (!original || item.rationale.length > 1000 || item.matchedIntentDimensions.some(f => !allowedFields.includes(f))) {
      statuses.set(id, "INVALID_SCHEMA"); continue;
    }
    const evidenceById = new Map(candidate.evidenceUnits.map(u => [u.evidenceId, u]));
    const citedIds = [...item.supportingEvidenceIds, ...item.mismatchEvidenceIds];
    if (citedIds.some(eid => !evidenceById.has(eid)) || new Set(citedIds).size !== citedIds.length) {
      statuses.set(id, "INVALID_UNGROUNDED"); continue;
    }
    const positive = item.relevance === "HIGHLY_RELEVANT" || item.relevance === "RELEVANT";
    if (positive && (!item.supportingEvidenceIds.length || !item.matchedIntentDimensions.length || item.role === "NONE")) {
      statuses.set(id, "INVALID_UNGROUNDED"); continue;
    }
    if (candidate.reviewTask === "ROLE_ONLY" && (item.role === "NONE" || !item.supportingEvidenceIds.length)) {
      statuses.set(id, "INVALID_UNGROUNDED"); continue;
    }
    const retained = candidate.reviewTask === "ROLE_ONLY" ? prior.get(id) : undefined;
    // Role-only review cannot silently downgrade deterministic relevance.
    const relevance = retained?.relevance ?? item.relevance;
    const evidence = item.supportingEvidenceIds.map(eid => { const unit = evidenceById.get(eid)!;
      return { field: unit.sourceField.toLowerCase() as "title" | "abstract", quote: unit.text, evidenceId: eid }; });
    result.set(id, { candidateId: id, relevance, role: item.role, rationale: item.rationale, confidence: retained?.confidence ?? item.confidence,
      matchedIntentDimensions: item.matchedIntentDimensions.length ? item.matchedIntentDimensions : retained?.matchedIntentDimensions ?? [],
      mismatches: item.mismatches, evidence: evidence.length ? evidence : retained?.evidence ?? [],
      supportingEvidenceIds: item.supportingEvidenceIds, mismatchEvidenceIds: item.mismatchEvidenceIds,
      policyVersion: CANDIDATE_REVIEW_VERSION, searchIntentHash, metadataHash: candidateMetadataHash(original), origin: "MODEL_REVIEW" });
    statuses.set(id, "VALID");
  }
  for (const candidate of batch) if (!statuses.has(candidate.candidateId)) statuses.set(candidate.candidateId, "INCOMPLETE");
  return { assessments: result, statuses };
}

export function finalCandidateAdmission(a: CandidateAssessment) {
  if (a.relevance === "OFF_TOPIC") return "REJECTED_OFF_TOPIC" as const;
  if (["HIGHLY_RELEVANT", "RELEVANT"].includes(a.relevance) && a.confidence !== "LOW" && a.role !== "NONE" && a.evidence.length && a.matchedIntentDimensions.length) return "ADMITTED" as const;
  return "NEEDS_INSPECTION" as const;
}
