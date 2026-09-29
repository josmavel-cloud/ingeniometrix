// Offline stdin-only evaluator. Feed existing private snapshots; no DB/network/writes.
import { readFileSync } from "node:fs";
import type { ResearchSearchIntent } from "@/lib/retrieval-search-input";
import type { ProjectReferenceSearchSnapshot } from "@/server/retrieval/reference-search-v2";
import { evaluateSnapshotCoverage } from "@/server/retrieval/evidence-coverage-snapshot";

global.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
const { intent, snapshot, history } = JSON.parse(readFileSync(0, "utf8")) as {
  intent: ResearchSearchIntent; snapshot: ProjectReferenceSearchSnapshot; history: ProjectReferenceSearchSnapshot[];
};
const coverage = evaluateSnapshotCoverage(intent, snapshot, history);
console.log(JSON.stringify({ searchIntentHash: coverage.searchIntentHash, sourcePoolVersion: coverage.sourcePoolVersion,
  gapsHash: coverage.gapsHash, seenSetHash: coverage.seenSetHash,
  sourceCount: snapshot.candidateAdmissions?.length, ignored: coverage.ignoredSources, rejectedRequirements: coverage.rejectedRequirements,
  diagnostics: coverage.diagnostics, unmappedIntentFieldRefs: coverage.unmappedIntentFieldRefs,
  dimensions: coverage.dimensions.map(d => ({ dimension: d.requirement.requiredDimension, type: d.requirement.type,
    importance: d.requirement.importance, status: d.status, existence: d.existence, inspected: d.inspectedSourceCount,
    observationCounts: d.coverageObservations.reduce((o,x) => { o[x.state] = (o[x.state] ?? 0) + 1; return o; }, {} as Record<string,number>),
    supportedBy: d.coverageObservations.filter(o => o.state === "SUPPORTED").map(o => ({ candidateId: o.candidateId,
      title: snapshot.candidateAdmissions?.find(c => c.candidateKey === o.candidateId)?.title, origin: o.assessmentOrigin, basis: o.basis })),
    potential: d.coverageObservations.filter(o => o.state !== "NOT_MATCHED" && o.state !== "SUPPORTED").slice(0,5)
      .map(o => ({ candidateId: o.candidateId, state: o.state, reason: o.reason })) })),
  gaps: coverage.gaps.map(g => ({ dimension: g.requiredDimension, kind: g.kind, type: g.type, importance: g.importance,
    webDiscoveryEligible: g.webDiscoveryEligible, eligibilityReason: g.eligibilityReason, insufficiencyReason: g.insufficiencyReason,
    route: g.route, unresolvedPremises: g.unresolvedPremises.length })),
  eligibleCount: coverage.gaps.filter(g => g.webDiscoveryEligible).length,
  limitations: { metadataOnly: (snapshot.candidateAdmissions ?? []).filter(c => !c.inspectionMetadata?.abstract).length,
    materializedInSnapshot: 0, diagnosisNotApplied: true } }, null, 2));
