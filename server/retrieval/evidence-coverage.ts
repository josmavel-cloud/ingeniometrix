import { createHash } from "node:crypto";
import { semanticPlannerInput, type SearchEnrichment } from "@/lib/retrieval-semantic-plan";
import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";
import { containsConcept, highAuthorityTerms } from "@/lib/retrieval-scientific-concepts";
import { candidateEvidenceUnits, candidateMetadataHash, CANDIDATE_REVIEW_VERSION } from "./candidate-review-policy";
import { currentCoverageConcepts, deriveCoverageRequirements } from "./evidence-gap-requirements";
import { COVERAGE_POLICY_VERSION, GAP_POLICY_VERSION, SOURCE_POOL_VERSION,
  type CoverageRequirement, type CoverageSource, type CoverageObservation, type DimensionCoverage,
  type EvidenceCoverage, type EvidenceGap, type GapKind } from "./evidence-gap-contract";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, canonical(v)]));
  return value;
}
export const coverageHash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const unique = <T extends string>(xs: T[]) => [...new Set(xs)].sort();
const textHas = (text: string, quote: string) => text.replace(/\s+/g, " ").includes(quote.replace(/\s+/g, " "));

// This is a pure, internal projection. No model, provider, filesystem or DB adapter is imported.
export function evaluateEvidenceCoverage(input: {
  intent: ResearchSearchIntent; searchIntentHash: string; sourcePoolIntentHash: string;
  sources: CoverageSource[]; enrichment?: SearchEnrichment; requirements?: CoverageRequirement[];
}): EvidenceCoverage {
  if (input.intent.sourceKind !== "CONFIRMED_DEFINITION" || input.intent.readiness !== "READY") throw new Error("COVERAGE_CONFIRMED_INTENT_REQUIRED");
  if (!input.searchIntentHash || input.sourcePoolIntentHash !== input.searchIntentHash) throw new Error("COVERAGE_STALE_POOL");
  const projection = semanticPlannerInput(input.intent, input.searchIntentHash);
  const concepts = currentCoverageConcepts(projection, input.enrichment);
  const byConcept = new Map(concepts.map(c => [c.id, c]));
  const ignoredSources: EvidenceCoverage["ignoredSources"] = [];
  const current = new Map<string, CoverageSource>();
  for (const source of input.sources) {
    if (source.projectId !== input.intent.projectId || source.searchIntentHash !== input.searchIntentHash) {
      ignoredSources.push({ candidateId: source.candidateId, reason: "STALE_OR_FOREIGN_SOURCE" }); continue;
    }
    if (!source.candidateId || !source.provenanceRef) throw new Error("COVERAGE_SOURCE_PROVENANCE_REQUIRED");
    const prior = current.get(source.candidateId);
    if (prior && coverageHash(prior) !== coverageHash(source)) throw new Error("COVERAGE_CONFLICTING_DUPLICATE_SOURCE");
    current.set(source.candidateId, source);
  }
  const sources = [...current.values()].sort((a,b) => a.candidateId.localeCompare(b.candidateId));
  const sourcePoolVersion = `${SOURCE_POOL_VERSION}:${coverageHash({ searchIntentHash: input.searchIntentHash, sources })}`;
  const seenSetHash = coverageHash(sources.map(s => s.candidateId));
  const rejectedRequirements: EvidenceCoverage["rejectedRequirements"] = [];
  const dimensions = new Map<string, DimensionCoverage>();
  const proposals = input.requirements ?? deriveCoverageRequirements(projection, input.enrichment);

  for (const proposed of proposals) {
    const requirement: CoverageRequirement = { ...proposed,
      anchors: [...new Map(proposed.anchors.map(a => [`${a.field}:${a.quote}`, a])).values()].sort((a,b) => `${a.field}:${a.quote}`.localeCompare(`${b.field}:${b.quote}`)),
      conceptGroups: proposed.conceptGroups.map(unique).sort((a,b) => a.join().localeCompare(b.join())),
      acceptedRoles: unique(proposed.acceptedRoles), preferredSourceTypes: unique(proposed.preferredSourceTypes),
      contextualRequirements: unique(proposed.contextualRequirements),
    };
    const reject = (reason: string) => rejectedRequirements.push({ requiredDimension: requirement.requiredDimension, reason });
    const eligible = requirement.anchors.length > 0 && requirement.anchors.every(a => {
      const field = projection.signals.find(s => s.sourceField === a.field);
      return a.quote.trim().length > 1 && field?.value && field.knowledge === "KNOWN" &&
        !["academicLevel", "pendingDecisions"].includes(a.field) && containsConcept(field.value, a.quote);
    });
    if (!eligible) { reject("INELIGIBLE_OR_UNGROUNDED_INTENT_DIMENSION"); continue; }
    if (!requirement.requiredDimension.trim() || !requirement.materialityJustification.trim()) { reject("DIMENSION_JUSTIFICATION_REQUIRED"); continue; }
    if (["STANDARD_OR_CODE", "OFFICIAL_OR_POLICY"].includes(requirement.type) && !requirement.requiresOfficialAuthority) {
      reject("AUTHORITATIVE_SOURCE_REQUIREMENT_MISSING"); continue;
    }
    if (["EXPERIMENTAL_OR_METHOD", "MODELING_OR_ANALYSIS"].includes(requirement.type) &&
        !requirement.anchors.some(a => a.field === "methodPreference") &&
        !requirement.conceptGroups.flat().some(id => byConcept.get(id)?.role === "METHOD_OR_TECHNIQUE")) {
      reject("METHOD_NOT_EXPLICITLY_GROUNDED"); continue;
    }
    if (requirement.conceptGroups.some(group => !group.length || group.some(id => {
      const c = byConcept.get(id);
      return !c || !requirement.anchors.some(a => c.sourceFields.includes(a.field) &&
        (containsConcept(a.quote, c.value) || containsConcept(c.value, a.quote)));
    }))) { reject("UNSUPPORTED_CONCEPT_GROUP"); continue; }
    // Without enrichment, use exact confirmed spans only; never synthesize synonyms.
    const groups = requirement.conceptGroups.length ? requirement.conceptGroups.map(ids =>
      unique(ids.flatMap(id => highAuthorityTerms(byConcept.get(id)!).map(t => t.value)))) : requirement.anchors.map(a => [a.quote]);
    const dimensionId = coverageHash({ policy: GAP_POLICY_VERSION, intent: input.searchIntentHash,
      type: requirement.type, anchors: requirement.anchors, groups: requirement.conceptGroups, dimension: requirement.requiredDimension });
    const prior = dimensions.get(dimensionId);
    if (prior) {
      if (coverageHash(prior.requirement) !== coverageHash(requirement)) throw new Error("COVERAGE_CONFLICTING_REQUIREMENT");
      continue;
    }
    const observations = sources.map(source => observeSource(source, requirement, groups, input.searchIntentHash));
    const supported = observations.some(o => o.state === "SUPPORTED");
    const potential = observations.some(o => o.state !== "NOT_MATCHED");
    dimensions.set(dimensionId, { dimensionId, requirement,
      intentProvenance: requirement.anchors.map(anchor => ({ anchor, provenance: projection.signals.find(s => s.sourceField === anchor.field)!.provenance })),
      status: supported ? "SUPPORTED_BY_AVAILABLE_METADATA" : potential ? "PARTIAL_OR_UNASSESSED" : "NOT_IDENTIFIED_IN_CURRENT_POOL",
      existence: potential ? "PRESENT_IN_CURRENT_POOL" : "NOT_IDENTIFIED_IN_CURRENT_POOL",
      inspectedSourceCount: sources.length, coverageObservations: observations });
  }
  const ordered = [...dimensions.values()].sort((a,b) => a.dimensionId.localeCompare(b.dimensionId));
  const gaps = ordered.flatMap(d => dimensionGaps(d, input.searchIntentHash, sourcePoolVersion));
  return { schemaVersion: "EvidenceCoverage.v1", coveragePolicyVersion: COVERAGE_POLICY_VERSION,
    gapPolicyVersion: GAP_POLICY_VERSION, searchIntentHash: input.searchIntentHash, sourcePoolVersion,
    gapsHash: coverageHash({ policy: GAP_POLICY_VERSION, gaps }), seenSetHash,
    eligibleIntentSignals: projection.signals,
    unmappedIntentFieldRefs: projection.signals.filter(s => s.value && !ordered.some(d => d.requirement.anchors.some(a => a.field === s.sourceField)))
      .map(s => s.sourceField).sort(), dimensions: ordered, gaps,
    ignoredSources: ignoredSources.sort((a,b) => a.candidateId.localeCompare(b.candidateId)), rejectedRequirements,
    diagnostics: [...(!concepts.length ? ["VALIDATED_CONCEPT_PLAN_UNAVAILABLE"] : []),
      ...(!ordered.length ? ["NO_GROUNDED_REQUIREMENTS"] : [])] };
}

function observeSource(source: CoverageSource, requirement: CoverageRequirement, groups: string[][], hash: string): CoverageObservation {
  const text = `${source.title}\n${source.abstract ?? ""}`;
  const matchedGroupIndexes = groups.flatMap((terms,i) => terms.some(t => containsConcept(text,t)) ? [i] : []);
  const assessment = source.assessment;
  const result = (state: CoverageObservation["state"], reason: string): CoverageObservation => ({
    candidateId: source.candidateId, provenanceRef: source.provenanceRef, state, reason,
    assessmentOrigin: assessment?.origin ?? null, assessmentPolicy: assessment?.policyVersion ?? null,
    matchedGroupIndexes, role: assessment?.role ?? null,
    basis: source.access.materializedFullText && source.access.materializationRef ? "MATERIALIZED_FULL_TEXT" : source.abstract?.trim() ? "ABSTRACT" : "TITLE_ONLY",
    sourceType: source.sourceType, officialAuthority: source.officialAuthority.status,
  });
  if (matchedGroupIndexes.length !== groups.length) return result("NOT_MATCHED", "REQUIRED_DIMENSION_NOT_IDENTIFIED_IN_METADATA");
  if (source.identity === "UNCERTAIN" || source.identity === "CONFLICT") return result("IDENTITY_UNCERTAIN", "IDENTITY_RECONCILIATION_REQUIRED");
  if (!assessment) return source.abstract?.trim() ? result("PENDING_REVIEW", "NO_VALID_ASSESSMENT") : result("ACCESS_LIMITED", "METADATA_ONLY_CANNOT_ESTABLISH_COVERAGE");
  if (source.assessmentValidation === "UNVERIFIED") return result("UNVERIFIABLE_REVIEW", "VALIDATION_PROVENANCE_UNAVAILABLE");
  if ((assessment.origin === "MODEL_REVIEW" && source.assessmentValidation !== "VALID") ||
      (assessment.origin === "DETERMINISTIC" && source.assessmentValidation !== "DETERMINISTIC") ||
      assessment.candidateId !== source.candidateId || assessment.searchIntentHash !== hash ||
      assessment.metadataHash !== candidateMetadataHash(source) || assessment.policyVersion !== CANDIDATE_REVIEW_VERSION) {
    return result("INVALID_REVIEW", "INVALID_OR_STALE_ASSESSMENT_CANNOT_COVER_DIMENSION");
  }
  // Existing accepted assessments still need source-owned support. No rationale/role alone is evidence.
  const units = new Map(candidateEvidenceUnits(source).map(u => [u.evidenceId, u]));
  const support = assessment.supportingEvidenceIds ?? [], mismatch = assessment.mismatchEvidenceIds ?? [];
  if (!assessment.evidence.length || assessment.evidence.some(e => !e.quote.trim() || !textHas(e.field === "title" ? source.title : source.abstract ?? "", e.quote)) ||
      (assessment.origin === "MODEL_REVIEW" && (!support.length || [...support,...mismatch].some(id => !units.has(id)) ||
        new Set(support).size !== support.length || new Set(mismatch).size !== mismatch.length))) {
    return result("INVALID_REVIEW", "ASSESSMENT_GROUNDING_UNAVAILABLE");
  }
  if (!["HIGHLY_RELEVANT", "RELEVANT"].includes(assessment.relevance) || assessment.confidence === "LOW" ||
      !requirement.acceptedRoles.includes(assessment.role as Exclude<typeof assessment.role, "NONE">) ||
      !assessment.matchedIntentDimensions.some(f => requirement.anchors.some(a => a.field === f))) {
    return result("PARTIAL", "ASSESSMENT_DOES_NOT_ESTABLISH_DIMENSION_COVERAGE");
  }
  if (requirement.requiresOfficialAuthority && (source.officialAuthority.status !== "VERIFIED" ||
      !source.officialAuthority.provenanceRef || !requirement.preferredSourceTypes.includes(source.sourceType))) {
    return result("PARTIAL", "AUTHORITATIVE_CORROBORATION_NOT_ESTABLISHED");
  }
  if (!source.abstract?.trim() || requirement.minimumBasis === "MATERIALIZED_FULL_TEXT" &&
      !(source.access.materializedFullText && source.access.materializationRef)) {
    return result("ACCESS_LIMITED", "INSPECTION_OR_ACCESS_REQUIRED_NOT_NEW_DISCOVERY");
  }
  return result("SUPPORTED", "RELEVANT_GROUNDED_METADATA_MATCHES_REQUIRED_DIMENSION");
}

function dimensionGaps(d: DimensionCoverage, hash: string, poolVersion: string): EvidenceGap[] {
  if (d.status === "SUPPORTED_BY_AVAILABLE_METADATA") return [];
  const observations = d.coverageObservations.filter(o => o.state !== "NOT_MATCHED");
  const kinds: GapKind[] = [];
  if (observations.some(o => o.state === "IDENTITY_UNCERTAIN")) kinds.push("IDENTITY");
  if (observations.some(o => o.state === "ACCESS_LIMITED")) kinds.push("ACCESS");
  const pending = observations.some(o => ["PENDING_REVIEW", "INVALID_REVIEW", "UNVERIFIABLE_REVIEW"].includes(o.state));
  if (pending || observations.some(o => o.state === "PARTIAL")) kinds.push("EVIDENCE");
  if (!observations.length) kinds.push("DISCOVERY");
  // Access, identity and unassessed candidates must be resolved before declaring a paid discovery need.
  const reviewRequired = pending || kinds.includes("ACCESS") || kinds.includes("IDENTITY");
  return kinds.map(kind => {
    const eligible = ["DISCOVERY", "EVIDENCE"].includes(kind) && d.requirement.importance === "MATERIAL" && !reviewRequired;
    const reason = kind === "DISCOVERY" ? "NOT_IDENTIFIED_IN_CURRENT_POOL" : kind === "ACCESS" ? "INSPECTION_OR_ACCESS_REQUIRED" :
      kind === "IDENTITY" ? "IDENTITY_RECONCILIATION_REQUIRED" : pending ? "ASSESSMENT_PENDING_OR_INVALID" : "ASSESSED_COVERAGE_INSUFFICIENT";
    return { schemaVersion: "EvidenceGap.v1", gapPolicyVersion: GAP_POLICY_VERSION,
      gapId: `gap:${coverageHash({ intent: hash, dimension: d.dimensionId, kind, policy: GAP_POLICY_VERSION })}`,
      searchIntentHash: hash, sourcePoolVersion: poolVersion, dimensionId: d.dimensionId,
      kind, importance: d.requirement.importance, type: d.requirement.type,
      intentFieldRefs: unique(d.requirement.anchors.map(a => a.field)), requiredDimension: d.requirement.requiredDimension,
      coverageObservations: d.coverageObservations, insufficiencyReason: reason,
      desiredEvidenceRole: d.requirement.desiredEvidenceRole, preferredSourceTypes: d.requirement.preferredSourceTypes,
      contextualRequirements: d.requirement.contextualRequirements,
      unresolvedPremises: d.requirement.premise === "UNVERIFIED_USER_PREMISE" ? d.requirement.anchors.map(anchor => ({ anchor, status: "UNVERIFIED_USER_PREMISE" as const })) : [],
      accessPreference: "RELEVANCE_BEFORE_ACCESS", uncertainty: ["FINITE_POOL_NOT_PROOF_OF_LITERATURE_ABSENCE", "METADATA_COVERAGE_NOT_SCIENTIFIC_CERTIFICATION"],
      decisionOrigin: d.requirement.decisionOrigin, status: reviewRequired ? "REVIEW_REQUIRED" : "OPEN",
      webDiscoveryEligible: eligible, eligibilityReason: eligible ? "EXPLICIT_MATERIAL_DIMENSION_WITH_INSPECTED_INSUFFICIENCY" :
        kind === "ACCESS" ? "ROUTE_TO_ACQUISITION" : kind === "IDENTITY" ? "ROUTE_TO_RECONCILIATION" :
          d.requirement.importance !== "MATERIAL" ? "NOT_MATERIAL" : "RESOLVE_EXISTING_COVERAGE_UNCERTAINTY_FIRST",
      route: eligible ? "WEB_DISCOVERY_CANDIDATE" : kind === "ACCESS" ? "ACQUISITION_OR_LOCATION" :
        kind === "IDENTITY" ? "IDENTITY_RECONCILIATION" : "COVERAGE_REVIEW" };
  });
}
