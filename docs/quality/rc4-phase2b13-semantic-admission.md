# RC4 2B1.3: bounded semantic candidate admission

## Scope and baseline

Baseline commit: c71f9962851b6aaee7c99d914f263d433e9f15df.
The preceding mini/OpenAlex acceptance produced 105 deduplicated candidates:
8 highly relevant, 19 relevant, 40 partial, 2 insufficient metadata and 36
off-topic under independent metadata-only review. Six were admitted and five
recommended. This gate preserves the confirmed-intent/semantic-plan/acquisition
architecture and repairs candidate assessment, not provider clients.

## Contracts and decisions

- Scientific composition v4 excludes generic research verbs as sole scientific
  anchors; long qualified objects remain optional when a grounded domain exists.
- Planner prompt 2.3.0 explicitly requests faithful English equivalents for
  central scientific concepts. Missing equivalents are not invented in code.
- `candidate-semantic-review.v1` is contextual to searchIntentHash and the
  title/abstract metadataHash. It records relevance, primary role, confidence,
  matched intent fields, mismatches, rationale and exact supporting quotations.
- Deterministic prefilter screens clear unsupported metadata and explicit
  exclusions; strong independent scientific/domain title matches with abstract
  can pass without a model. Plausible uncertain candidates form one batch of at
  most 40, with at most 1800 abstract characters per candidate.
- Reviewer uses existing structured provider/accounting, configurable
  SOURCE_CANDIDATE_REVIEW_MODEL (default gpt-5.4-mini), low effort, 14000 output
  tokens. It cannot fetch documents or verify normative/full-text claims.
- Backend checks exact batch membership/completeness, intent-field references,
  enums and quotations against supplied metadata. Invalid/unavailable review
  fails closed to inspection; no service-level retry or per-source model calls.
- Final admission is deterministic: supported HIGHLY_RELEVANT/RELEVANT with
  non-low confidence may be admitted; partial/insufficient stay inspection;
  off-topic is rejected. Diversity sees admitted records only. Presentation cap
  is 20, not a target; human selection cap/semantics are unchanged.
- Reported PDF/OA breaks ties after relevance. No reported link becomes a
  verified PDF. Assessment and batch diagnostics persist in existing search
  audit JSON, not as universal DOI truth. No migration.

## Offline evidence

Fixture `scripts/fixtures/phase2b13-live-pool.json` preserves the prior pool and
independent labels. Simulated semantic responses recover 19/27 known positives
(previous recommendations 5/27), precision 19/19; 40 reviewed, 13 coarse-rejected,
50 deferred. This measures policy against known labels, NOT live model accuracy.
Role checks are fixtures/contract tests, not an empirical role-accuracy score.

Canonical integration uses isolated DB and mocked network: eight reviewed
positives persist/list, no five-item padding/cap, no read-time network, no
selected-row mutation, historical audit unchanged. Tests reject incomplete,
duplicate, unknown-candidate and ungrounded review responses. Six disciplines
and stored nano/mini outputs protect anchors, translation and optional context.

## Acceptance procedure

Operator CLI `scripts/accept-rc4-phase2b11.ts` separates paid plan from search.
`mode=plan model=gpt-5.4-mini` permits one Responses request. Inspect the stored
plan before `mode=search review=1 planOperationId=...`; this permits at most four
sequential OpenAlex requests and one Responses review request, no redirects,
no Crossref/web/document hosts, no retries. Both use normal PaidOperation.
An acceptance model override is process-local, not a runtime model migration.

## Validation and deployment

PASS: 2B1.3 fixture/contract tests; 2B1, 2B1.1/2B1.2 and six disciplines;
canonical persisted/listed eight-source test; 2A policy/listing; 2.1 SearchIntent;
Phase 1 handoff/conversation/UX/navigation; G2; G4 auth/commercial; pre-job durable
budget/idempotency; B2 continuity; TypeScript; full backend, frontend-only and
worker builds; Vercel isolation (24 traces); diff-check. Local full build retains
the pre-existing artifact-glob warnings; clean Docker build succeeds.

Implementation cb87912b74d8e4620383086ca01f64976fd543ff pushed and deployed to
staging app image 36c45e001d74. App recreated 2026-09-27T22:09:09Z. DB, worker
and proxy IDs/creation times unchanged. Public staging web HTTP 200; app readiness
and liveness ready/ok. No frontend executable change or separate alias update.
Five unrelated G5 files remain uncommitted and unchanged. No migration.

## Live acceptance: STOPPED / FAIL

Project 9843af3a-d1cc-421c-a02f-a309f751a0c8 remains confirmed at revision 10;
all 11 eligible fields reach the planner, six optional fields remain UNKNOWN.
Definition hash d169f9a0cfd7d567a6b82cca3e1cd769d7138cddbe42e286bc6ec4611b272cdc;
intent hash d429d5848bc11736ad558184fba9411487b1f5dbbf5d10b842de4e40f9f345b3.

One planner call, gpt-5.4-mini (actual gpt-5.4-mini-2026-03-17), prompt 2.3.0,
HTTP 200, 2200 input / 1233 output tokens (141 reasoning), USD 0.007199,
7.589 seconds provider response / 7.769 seconds operation. PaidOperation
4cc6a32c-6951-4ad1-9b70-0889f6b81536 COMPLETED, one settled call, no bound breach.

The accepted plan has scientific/object anchors and no generic evaluate+masonry
family, but NO English representation for central seismic response, simulation,
masonry or specimen concepts. All four families are ORIGINAL_ONLY_ENGLISH_INCOMPLETE:

1. ("respuesta sismica") AND ("albanileria")
2. ("respuesta sismica") AND ("especimenes de albanileria")
3. ("simulacion sismica") AND ("albanileria")
4. ("respuesta sismica") AND ("albanileria") AND ("Peru")

Queries above are accent-normalized for documentation; exact rendered strings,
complete accepted concepts and accounting are preserved in private artifact
`artifacts-local/rc4/phase2b13-live-acceptance-2026-09-27.json` and the paid plan.
The second family is still a narrower object variant, not new scientific coverage.
The provider returned a structurally usable plan, but it does not meet the required
international-coverage precheck. Backend preserved original terms instead of
inventing translations. Accepted-enrichment diagnostics report discarded unsafe
terms; this result does not retain raw rejected terms, so omission versus term
rejection cannot be distinguished without additional diagnostic evidence.

STOPPED BEFORE OpenAlex per authorization. OpenAlex=0, semantic review=0,
Crossref/web/documents/DeepResearch/scientific generations=0. No live candidate
pool/shortlist or precision/retention/role-accuracy measurement exists for this
run; historical recommendations and human selections were not changed.

Gate 2B1 is NOT closed; not ready for 2C or a new owner source review. The batch
review implementation is offline-tested/deployed but not live-validated. Next:
review the failed accepted plan and repair/diagnose multilingual completeness
offline, retaining rejected-term diagnostics, before authorizing another bounded
acceptance. No second planner call in this task, no automatic retry or 2C.
