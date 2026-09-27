# RC4 Sources / Evidence delivery plan

Revised 2026-09-27. Only Gate 2B1 is authorized for implementation now.
No live scholarly, model, web or document calls are authorized by this plan.

## Boundaries and ordering

Confirmed ResearchSearchIntent v2 -> retrieval-only SearchEnrichment/plan ->
OpenAlex high precision -> contextual admission -> candidate coverage/gaps ->
authorized Astra web gap discovery -> common identity/dedupe -> recommendations
and human selection -> acquisition/inspection -> optional user PDFs -> frozen,
human-confirmed EvidenceSet. ScientificDesign consumes that package, not a new
search. Candidate coverage is not verified evidence coverage.

Order: **2B1 -> 2C -> 2B2 -> 2D -> 2E -> 2F -> 2G**. Shared provenance,
identity and bounded operation state must precede the new web discovery channel.

| Gate | Scope and reuse | Offline / staging acceptance | Models / schema |
| --- | --- | --- | --- |
| 2B1 | Full typed confirmed-intent projection; retrieval-only terminology enrichment in existing planner; role-aware groups, conservative fallback and admission; reported access only. | Six disciplines, real seismic snapshot, historical negatives, sparse metadata, no unknown promotion. Deploy, STOP before providers. | Keep existing configurable nano planner; one structured invocation per planning attempt, no text fallback call. No migration. Codex Astra High, Fast OFF. |
| 2C | Cache/reuse enrichment by intent/prompt/model/policy; explicit more batch and unseen query/candidate state; cross-channel observations, DOI/URL dedupe; Crossref metadata/identity/links first, separately rendered bounded discovery fallback. | No repeated planning on unchanged input, no lost selections/provenance, mock cross-channel identity. One later authorized small scholarly search. | Deterministic. Prefer current audit snapshots/JSON; justify additive persistence only for integrity. Codex Sol High, Fast OFF. |
| 2B2 | Astra + actual web tool for material gaps only; observed-source URL provenance; structured candidates into same downstream pipeline. Never model-memory bibliography or automatic selection. | Fake/unobserved URLs rejected; tool/model/account/cost compatibility verified before one authorized operation. Max initially one response, two tool invocations, six candidates, 120s; no automatic retry. | New versioned prompt and bounded web adapter. Astra medium subject to evaluation; reserve tokens/tool/reasoning usage before dispatch. Codex Astra High, Fast OFF. |
| 2D | Existing Sources UI: role, supported relevance reason, honest access states, durable selection and partial/empty states. | Public authenticated select/deselect/reload/resume/concurrency; reads make zero external calls. | No per-card LLM. Codex Sol High, Fast OFF. |
| 2E | Reuse DOI, locations, Unpaywall, Crossref links, PDF discovery/validation, pdftotext, identity, caches, materialization/ledger. Add narrowly scoped HTML full text only if needed. Conditional ambiguous-source review, not all-source reranking. | Selected 2-3 documents only after authorization; wrong identity/blocked PDFs/HTML landing vs full text tested. Verify excerpts/locators, preserve degraded evidence. | Keep extraction routing; evaluate small model only for budgeted ambiguity. No lab subsystem import. Codex Sol High, Fast OFF. |
| 2F | Up to two optional private user PDFs become durable source assets, not loose uploads; see asset contract below. | Real upload plus duplicate, off-topic, encrypted/invalid PDF, retry/remove and third-file rejection; no implied relevance. | Reuse storage/transfers/quarantine; additive linking migration only if referential integrity requires it. Codex Sol High, Fast OFF. |
| 2G | Freeze versioned EvidenceSet, human confirmation, gap/limitation acceptance and complete source continuity. | Every selected source accounted for; changed intent/selection invalidates current set without rewriting history; downstream consumes frozen set without search. | Reuse snapshots and ledger, no parallel evidence store. Codex Astra High, Fast OFF. |

Every gate: implement -> offline -> staging -> manual UX -> backend inspection ->
PASS/repair before next gate. Never run a thesis generation for these gates.

Current listing projects suggested selection into the UI selected boolean while
the DB remains unselected. Gate 2D must distinguish recommendation/check state
from confirmed human selection; 2B1 does not change that existing UI contract.

## Complete intake, importance and enrichment

All accepted KNOWN non-system scientific fields remain accessible to the planner
with source field, provenance, role and deterministic tier. Identity: original
idea/topic/problem/purpose/object/concepts. Delimiters: context/scope/output/
taxonomy. Refinement: academic level, method preference, data access, research
line, constraints and advisor notes. Pending decisions/unknowns are uncertainty,
not terms. Geography/time/codes can be dedicated branches; they are never
universal requirements for international precedents. Material context can inform
the core plan, but the planner may not silently promote account defaults.

SearchEnrichment is versioned retrieval-only derived terminology, never an
Intake edit. Typed terms distinguish exact phrases, linguistic variants,
translations, academic synonyms and exploratory related terms; each names its
source fields and exact grounding excerpt. AI terms remain
AI_DERIVED_FOR_SEARCH, not accepted scientific facts. Unknown factual method,
population, institution, data, devices and standards stay unknown. Low-confidence
terms remain exploratory. Backend owns tiers/provenance/hashes/syntax/permissions.
One structured planning invocation, not one per field. Cache key includes intent
hash, prompt version, model and policy; durable reuse is 2C, not secretly included
in 2B1. If planning fails, use confirmed phrases only, mark DEGRADED. Inadequate
core signals yield NEEDS_CLARIFICATION before scholarly execution.

Relevance roles: DIRECT, METHODOLOGICAL, THEORETICAL, CONTEXTUAL. Admission uses
positive title/abstract support and contradiction/uncertainty, not a universal
numeric threshold. Preserve 2A no-padding and historical selections. Repair
language/position-based false negatives without declaring every masonry record
relevant. Quality, geography, citations, recency and access cannot rescue an
off-topic candidate. Among similarly relevant/credible sources prefer usable
PDF/full text, usable HTML, abstract, metadata. REPORTED_PDF is not VERIFIED_PDF
or MATERIALIZED_FULL_TEXT. Reads never verify/download documents.

## Durable PDF asset and source convergence (2F, not implemented by 2B1)

Reuse UploadedPdf as upload/ownership/byte identity and private ArtifactStore
for bytes. Use Reference/ProjectReference for scientific identity/selection;
ProjectSourceMaterialization for text/chunks/hashes. GeneratedArtifact is for
generated outputs, not a place to disguise an uploaded source. Do not overload
rawOpenAlexJson, selectionReason or unrelated asset fields.

SourceAsset view/link: assetId, projectId, sourceId?, origin=USER_UPLOADED,
uploadId, originalFilename, MIME, bytes, sha256, private storage reference,
createdAt/by; bibliographic identity (nullable title/authors/year/DOI/issuer);
validation (PDF validity/encryption/pages/identity); processing states;
evidence level/contentHash/materializationId/locators; provenance/continuity.
Paths are never public. Strong links may need an additive FK/representation
contract in 2F; do not create a second source or evidence ledger.

Receive/quarantine -> validate -> deterministic metadata/text -> bibliographic
identity -> relevance -> materialization -> usable source asset. Missing data
remains null. LLM only if deterministic extraction is insufficient and budgeted.
Valid bytes can be a durable excluded asset without becoming usable evidence.
DOI then validated bibliographic identity then document hash reconcile uploaded
and discovered sources: one Source, multiple Representations and discovery
observations. Weak matches require confirmation. Removing current selection
does not erase immutable history; explicit deletion follows retention/privacy
policy rather than silent cascade. Reconcile existing 20MB inactive contract
with active 30MB transfer path before shipping 2F.

## Astra, gaps and final output

Gaps are applicable, explained evidence roles, not universal checkboxes. Separate
missing discovery, missing access and unverified coverage. Astra candidates
require observed external URL, title/issuer/type, DOI if available, gap/rationale,
tool-call provenance and unverified access signals. URL safety/redirect limits,
identity, dedupe/admission apply equally. No source bypass because Astra found it.
Crossref is not removed. Deep Research remains OFF; separate user/budget-approved
escalation only after normal channels and acquisition leave material gaps. Never
reuse historical automatic supplement selection.

EvidenceSet: schemaVersion, project/intake IDs, definition/search intent hashes,
confirmed revision, source-set/selection revisions, sources, representations,
roles/evidence levels, materializations, gaps/limitations, continuity and human
confirmation hash/actor/time. Every selected source is used/considered/excluded
with reason. Metadata alone is not substantive evidence. No requirement for all
sources to have PDF; material gaps block, explicit nonblocking limits may remain.

## Primary regression fixture

Owner seismic project 9843af3a-d1cc-421c-a02f-a309f751a0c8, confirmed revision 10.
Historical latest audited batch: 47 OpenAlex candidates, all score zero;
46 NEEDS_INSPECTION, one rejected. Preserve history. Do not approve all 47.
Shake-table, masonry response/modeling and methodological precedents may be
useful; unrelated structural types and direct claims of validating a user-stated
2026 standard require separate evidence. Existence/edition of that standard is
not verified by accepting the user's research intent.

Protect G1/G3/G4, source continuity, commercial budgets, auth, storage and
historical snapshots. No live calls or production changes are implied here.
