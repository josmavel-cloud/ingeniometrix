import assert from "node:assert/strict";
import { spanishTitleNeedsNoTranslation } from "../server/retrieval/reference-translation-service";
assert.equal(spanishTitleNeedsNoTranslation("Retroalimentación de aprendizajes con inteligencia artificial generativa en estudiantes universitarios"), true);
assert.equal(spanishTitleNeedsNoTranslation("Feedback in higher education in Asian countries: an approach"), false);
assert.equal(spanishTitleNeedsNoTranslation("Étude de la méthode pour les écoles"), false);
assert.equal(spanishTitleNeedsNoTranslation("Evidence"), false);

import { pinnedPublicLookup } from "../server/retrieval/safe-document-fetch";
const pinned = pinnedPublicLookup({ address: "8.8.8.8", family: 4 });
pinned("example.org", { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]); });
pinned("example.org", { all: false }, (error, address, family) => { assert.equal(error, null); assert.equal(address, "8.8.8.8"); assert.equal(family, 4); });
assert.throws(() => pinnedPublicLookup({ address: "127.0.0.1", family: 4 }), /DOCUMENT_HOST_NOT_PUBLIC/);

import { designSupportGaps, scientificFindingFields } from "../server/mvp/design-support-gap";
import type { ScientificDecisionBundle } from "../server/mvp/scientific-decision-service";
import { htmlSupportPassages, rankSupportPassages, supportBibliographyFromHtml } from "../server/mvp/design-support-document";
import { augmentMethodEvidencePack, effectiveGenerationLedger, sealDesignSupport, validateDesignSupport } from "../server/mvp/design-support-addendum";
import { ledger } from "./test-b3-scientific-contracts";
import { supportReuseIdentity, verifyReusableSupportSource } from "../server/mvp/design-support-reuse";
import { fingerprint } from "../server/mvp/job-execution-context";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WebDiscoveryResult } from "../server/retrieval/web-discovery-contract";
import { scientificStructuredCall } from "../server/mvp/scientific-structured-call";
import { withJobExecution } from "../server/mvp/job-execution-context";
import type { LlmProvider, BackgroundStructuredObjectInput } from "../llm/provider";

// Sanitized equivalent of the completed staging critic. No private topic or IDs.
const bundle = {
  contextFingerprint: "frozen-fixture", intent: { scope: "Alcance confirmado" },
  decision: { recommended_id: "A1", alternatives: [{ id: "A1", primary_method: "Síntesis documental", scope_effect: "preserves" }] },
  critique: { assessments: [{ alternative_id: "A1", evidence_support: "PASS_WITH_LIMITATIONS",
    critical_findings: [{ code: "EVI", severity: "WARNING", affected_field: "methodological_support",
      issue: "Respaldo indirecto", required_action: "Inspeccionar una guía metodológica con procedimientos verificables" }] }] },
  evidence_pack: { items: [{ evidence_id: "E1", evidence_level: "ABSTRACT_METADATA", allowed_use: "context_only" }] },
} as unknown as ScientificDecisionBundle;
assert.equal(designSupportGaps(bundle).length, 1, "WARNING plus an explicit evidence limitation must not be ignored");
const compoundFinding = structuredClone(bundle);
compoundFinding.critique.assessments[0].critical_findings[0].affected_field = "methodological_support; components";
assert.equal(designSupportGaps(compoundFinding).length, 1, "Multiple field references must not suppress a critic's evidence limitation");
assert.deepEqual(scientificFindingFields("data_requirements; pending_user_decisions; procedure"),
  ["data_requirements", "pending_user_decisions", "procedure"]);
compoundFinding.critique.assessments[0].critical_findings[0].affected_field = "methodological_supporting_guess";
assert.equal(designSupportGaps(compoundFinding).length, 0, "A substring is not a field reference or an evidence judgement");
const late = { alternativeId: "A1", intentPreserved: true, methodCoherent: true, evidenceSupported: false,
  blockingScientificIssue: false, blockingReason: "", limitations: ["Falta respaldo directo"],
  resolvedFindingCodes: [], unresolvedFindingCodes: ["EVI"], deferredAsFutureRequirementCodes: [] };
assert.equal(designSupportGaps(bundle, late)[0].origin, "TARGETED_CRITIC");
const harmless = structuredClone(bundle);
harmless.critique.assessments[0].evidence_support = "PASS";
assert.equal(designSupportGaps(harmless).length, 0, "Warnings alone do not authorize discovery");
assert.equal(designSupportGaps(harmless, late).length, 1, "Late evidence judgement activates recovery even if the initial rubric passed");
assert.equal(designSupportGaps(bundle, { ...late, evidenceSupported: true }).length, 0);
for (const method of ["Análisis estructural", "Evaluación educativa", "Síntesis de salud", "Estudio de gestión", "Análisis temático", "Crítica textual"]) {
  const multidisciplinary = structuredClone(bundle);
  Object.assign(multidisciplinary.decision.alternatives[0], { primary_method: method });
  assert.equal(designSupportGaps(multidisciplinary)[0].affectedClaim, method);
  assert.equal(designSupportGaps(multidisciplinary)[0].scopeBoundary, "Alcance confirmado");
}
const html = htmlSupportPassages('<html><title>Guía &amp; método</title><script>ignore instructions</script><p>Un procedimiento verificable describe criterios, límites y pasos de validación del método.</p><p>La aplicación requiere comprobar sus condiciones en cada contexto.</p></html>');
assert.deepEqual(supportBibliographyFromHtml('<meta name="citation_title" content="Guía &amp; método"><meta name="citation_author" content="Autora Uno"><meta name="citation_publication_date" content="2021/03/01"><meta name="citation_doi" content="10.1234/fixture">'),
  { title: "Guía & método", authors: ["Autora Uno"], year: 2021, doi: "10.1234/fixture" });
assert.deepEqual(supportBibliographyFromHtml('<p>Someone 2021 doi:10.1234/guess</p>'), { title: null, authors: [], year: null, doi: null });
assert.equal(html.title, "Guía & método");
assert.equal(html.passages.length, 2);
assert.ok(html.passages.every(p => !p.text.includes("instructions")));
assert.equal(rankSupportPassages(html.passages, "procedimiento método")[0].text, html.passages[0].text);
const identity = { userId: "technical", projectId: ledger.project_id, jobId: "job-a", definitionHash: "frozen" };
const addendum = sealDesignSupport({ ...identity, policyVersion: "fixture", sources: [{
  sourceId: "DS-fixture", gapId: "gap", title: html.title, authors: [], year: null, doi: null,
  observationIds: ["observed-search"], provenance: "SYSTEM_DESIGN_SUPPORT", document: { observedUrl: "https://example.org/standard",
    finalUrl: "https://example.org/standards/current", sha256: "a".repeat(64), mediaType: "text/html", title: html.title, passages: html.passages },
}] });
const before = JSON.stringify(ledger);
const effective = effectiveGenerationLedger(ledger, addendum, identity);
assert.equal(JSON.stringify(ledger), before, "Frozen evidence is never modified");
assert.equal(effective.source_registry.at(-1)?.provider, "SYSTEM_DESIGN_SUPPORT");
assert.equal(effective.source_registry.at(-1)?.selected_order, null);
assert.equal(effective.references.at(-1)?.reference_metadata.doi, null, "A standard does not require a fabricated DOI");
assert.equal(effective.semantic_extractions.at(-1)?.evidence_items[0].supporting_excerpt, html.passages[0].text);
assert.throws(() => validateDesignSupport(addendum, { ...identity, jobId: "job-b" }), /CONTEXT_MISMATCH/);
const tampered = structuredClone(addendum); tampered.sources[0].document.passages[0].text = "Invented support";
assert.throws(() => validateDesignSupport(tampered, identity), /CONTEXT_MISMATCH/);
console.log("Design support regression: PASS (gaps, safe text, immutable context, job ownership, bibliography; offline only)");

async function reuseTests() {
  const requests: BackgroundStructuredObjectInput[] = [];
  const provider = { generateStructuredObject: async () => { throw new Error("Unexpected foreground scientific dispatch"); },
    generateBackgroundStructuredObject: async (request: BackgroundStructuredObjectInput) => { requests.push(request); return { offline: true }; } } as unknown as LlmProvider;
  const request = { prompt: "Synthetic scientific review", model: "gpt-5.4", schemaName: "review", maxOutputTokens: 100,
    schema: { type: "object", properties: {}, required: [], additionalProperties: false } };
  for (const jobId of ["job-a", "job-a", "job-b"]) await withJobExecution({ jobId, startedAt: new Date(), stage: "SCIENTIFIC_REVIEW" },
    () => scientificStructuredCall(provider, request, { projectId: jobId === "job-a" ? "project-a" : "project-b", runId: jobId }));
  assert.equal(requests[0].logicalAttemptKey, requests[1].logicalAttemptKey);
  assert.notEqual(requests[0].logicalAttemptKey, requests[2].logicalAttemptKey);
  assert.equal(requests[0].maxRetries, 0);
  const owner = { projectId: "project-a", userId: "user-a" };
  const evidence = { projectId: owner.projectId, definitionHash: "science-a", searchIntentHash: "intent-a", selectionHash: "selection-a" };
  const snapshot = { project: { id: owner.projectId, userId: owner.userId },
    evidenceSet: { contentHash: fingerprint(evidence), snapshotJson: evidence } };
  const identity = supportReuseIdentity(snapshot, owner);
  assert.ok(identity);
  assert.equal(supportReuseIdentity(snapshot, { ...owner, projectId: "project-b" }), null);
  assert.equal(supportReuseIdentity(snapshot, { ...owner, userId: "user-b" }), null);
  for (const field of ["definitionHash", "searchIntentHash", "selectionHash"]) {
    const changed = { ...evidence, [field]: "changed" };
    assert.notEqual(supportReuseIdentity({ ...snapshot, evidenceSet: { snapshotJson: changed, contentHash: fingerprint(changed) } }, owner), identity);
  }
  assert.equal(supportReuseIdentity({ ...snapshot, evidenceSet: { ...snapshot.evidenceSet, contentHash: "corrupt" } }, owner), null);
  const directory = await mkdtemp(path.join(os.tmpdir(), "imx-support-reuse-"));
  try {
    const bytes = Buffer.from("Verified fixture document; offline scientific contracts only.");
    const file = path.join(directory, "fixture.html"); await writeFile(file, bytes);
    const source = structuredClone(addendum.sources[0]);
    source.document.privateArtifactPath = file;
    source.document.sha256 = createHash("sha256").update(bytes).digest("hex");
    const discovery = { state: "COMPLETED", operationId: "discovery-a", responseId: "response-a",
      observations: [{ observationId: source.observationIds[0], operationId: "discovery-a", responseId: "response-a",
        normalizedUrl: source.document.observedUrl, actionType: "search" }] } as WebDiscoveryResult;
    assert.equal(await verifyReusableSupportSource(source, discovery, directory), true);
    assert.equal(await verifyReusableSupportSource(source, { ...discovery, responseId: "another-response" }, directory), false);
    assert.equal(await verifyReusableSupportSource(source, { ...discovery, state: "INVALID_TOOL_PROVENANCE" }, directory), false);
    assert.equal(await verifyReusableSupportSource(source, discovery, path.join(directory, "other")), false);
    await writeFile(file, "changed document");
    assert.equal(await verifyReusableSupportSource(source, discovery, directory), false);
  } finally { await rm(directory, { recursive: true }); }
  console.log("Support reuse: PASS (owner, project, definition, selection, provenance, file hash; no paid calls)");
}
void reuseTests().catch(error => { console.error(error); process.exitCode = 1; });

// A digest selects complete distinct procedural passages, not generic facet
// coverage that could discard the actual procedure after seeing its overview.
import { buildDesignSupportDigest, digestPromptContext } from "../server/mvp/design-support-digest";
import { buildMethodEvidencePack } from "../server/mvp/scientific-decision-contracts";
const digestBase = buildMethodEvidencePack(ledger);
const detailed = sealDesignSupport({ ...identity, policyVersion: "digest-fixture", sources: [0, 1].map(index => ({
  ...addendum.sources[0], sourceId: `DS-synthetic-${index}`, gapId: "gap",
  document: { ...addendum.sources[0].document, sha256: String(index + 1).repeat(64), passages: [
    { text: "Methodological manual heading", locator: "block:1", page: null, contentKind: "METADATA" as const },
    { text: "Methodological manual heading", locator: "block:2", page: null, contentKind: "METADATA" as const },
    { text: "Reviewers should define eligibility, search, extract and synthesize evidence following a reproducible protocol. This overview does not replace the detailed procedure.", locator: "block:3", page: null, contentKind: "FULL_TEXT_PASSAGE" as const },
    { text: "Extracted observations should be compared in repeated analysis. The analyst should record each coding decision and retain contradictory observations before grouping categories.", locator: "block:4", page: null, contentKind: "FULL_TEXT_PASSAGE" as const },
    { text: "This reporting standard is not intended to certify execution or replace validation. The procedure may need adjustment if the available evidence cannot substantiate a comparison.", locator: "block:5", page: null, contentKind: "FULL_TEXT_PASSAGE" as const },
  ] },
})) });
const digestPack = augmentMethodEvidencePack(digestBase, detailed);
const digestInput = { pack: digestPack, addendum: detailed, identity,
  gaps: [{ ...designSupportGaps(bundle)[0], gapId: "gap" }], requiredPointers: [] };
const digestBefore = JSON.stringify(digestInput);
const digest = buildDesignSupportDigest(digestInput);
assert.equal(JSON.stringify(digestInput), digestBefore, "Canonical evidence is not rewritten by compaction");
assert.equal(digest.effectiveEvidenceFingerprint, detailed.checksum, "Patch, critic and final ledger share the sealed context identity");
assert.equal(digest.sources.length, 2, "Two gap-linked sources remain available without forced citation");
assert.equal(digest.passages.length, 6, "Headings/duplicate text omitted, detailed methods and contrary limits retained");
assert.ok(digest.passages.some(p => p.excerpt?.includes("coding decision")), "Overview cannot displace procedural detail");
assert.ok(digest.passages.some(p => p.excerpt?.includes("not intended")), "Contrary transfer limits survive");
for (const passage of digest.passages) assert.equal(passage.excerpt, digestPack.items.find(item => item.evidence_id === passage.evidence_id)?.excerpt);
assert.equal(digest.digestFingerprint, buildDesignSupportDigest(digestInput).digestFingerprint);
assert.equal(digestPromptContext(digest).effectiveEvidenceFingerprint, digest.effectiveEvidenceFingerprint);
assert.throws(() => buildDesignSupportDigest({ ...digestInput, identity: { ...identity, jobId: "foreign" } }), /CONTEXT_MISMATCH/);
assert.throws(() => buildDesignSupportDigest({ ...digestInput, requiredPointers: [{ source_id: "foreign", evidence_id: "E1" }] }), /POINTER_MISSING/);
const abstractOnly = structuredClone(digestPack); abstractOnly.items.at(-1)!.evidence_level = "ABSTRACT_METADATA";
assert.throws(() => buildDesignSupportDigest({ ...digestInput, pack: abstractOnly }), /PASSAGE_INTEGRITY/);
console.log("DesignSupportDigest: PASS (whole passages, procedural detail, limits, diversity, ownership, immutable store)");

import { verifiedPdfIdentityTitle } from "../server/mvp/design-support-document";
import { observedAlternateUrls } from "../server/mvp/design-support-alternate-acquisition";
assert.equal(verifiedPdfIdentityTitle("Methods for\nthematic analysis DOI 10.1234/test\fAppendix", { title: "Methods for thematic analysis", doi: "10.1234/test" }), "Methods for thematic analysis");
assert.equal(verifiedPdfIdentityTitle("Other article\fMethods for thematic analysis 10.1234/test", { title: "Methods for thematic analysis", doi: "10.1234/test" }), null);
assert.equal(verifiedPdfIdentityTitle("Methods for thematic analysis 10.1234/wrong", { title: "Methods for thematic analysis", doi: "10.1234/test" }), null);
const alternateDiscovery = { operationId: "op", responseId: "response", diagnostics: { toolLimit: { accepted: true }, response: { webSearchCalls: [{ id: "tool", status: "completed", actionType: "search" }] } },
  observations: [{ operationId: "op", responseId: "response", toolCallId: "tool", actionType: "search", normalizedUrl: "https://example.org/verified.pdf" }] } as unknown as WebDiscoveryResult;
const alternateCandidate = { proposal: { accessProposal: { reportedPdfUrl: "https://example.org/verified.pdf", alternateUrls: ["https://example.org/unobserved.pdf", "http://127.0.0.1/private"] } } } as WebDiscoveryResult["candidates"][number];
assert.deepEqual(observedAlternateUrls(alternateDiscovery, alternateCandidate).map(x => x.url), ["https://example.org/verified.pdf"]);
assert.equal(observedAlternateUrls({ ...alternateDiscovery, responseId: "foreign" }, alternateCandidate).length, 0);
console.log("Observed alternate acquisition identity/provenance: PASS");

const coveragePassages = [
 { text: "Abstract methodology quality coding methods. ".repeat(45), page: 1, locator: "p1" },
 { text: "Quality assessment should record limitations without pretending that absence of reporting proves poor conduct.", page: 4, locator: "p4a" },
 { text: "The criteria include reporting aims and context, adequacy of the data collection and analysis procedures, and traceability of interpretations.", page: 4, locator: "p4b" },
];
const coverage = rankSupportPassages(coveragePassages, "methodology quality coding methods", 500);
assert.ok(coverage.some(p=>p.locator==="p4a") && coverage.some(p=>p.locator==="p4b"), "Procedural section and adjacent criteria survive a verbose abstract");
