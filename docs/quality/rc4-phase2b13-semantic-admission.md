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

Live acceptance and deployment results are pending. Do not claim model precision
or Gate 2B1 closure from mocked labels. Stop after the authorized acceptance;
2C, Astra web and acquisition remain outside scope.
