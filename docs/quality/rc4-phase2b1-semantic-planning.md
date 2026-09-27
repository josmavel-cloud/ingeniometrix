# RC4 Gate 2B1 - complete confirmed-intent semantic planning

Date: 2026-09-27. Baseline: ce562c0030e01007f9aafc2f7ae1f2de1dd9359c.
Branch: feat/rc4-scientific-commercial.

The revised remaining plan is [RC4_PHASE2_EVIDENCE_PLAN](../architecture/RC4_PHASE2_EVIDENCE_PLAN.md).
Only 2B1 is implemented. No schema migration, provider/web/model/document call,
scientific generation or payment was executed. Staging fixture reads were
read-only; mutation tests ran only in imx_b4_validation_rc4 on port 55440.

## Implementation

- research-planner-input.v1 exposes all 17 confirmed definition fields with
  deterministic role/tier/category, knowledge and provenance. Unknown/default/
  rejected data is excluded; pending decisions remain uncertainty. Advanced
  advisor/data/constraint fields inform interpretation, not positive keywords.
- search-enrichment.v1 is retrieval-only, with source anchors, typed expansions,
  authority and AI_DERIVED_FOR_SEARCH provenance. It never updates Intake/draft.
  Numeric inventions, unknown sources, ungrounded anchors and query-syntax
  injection are rejected. Related/low-confidence terms are exploratory.
  Semantic faithfulness of model translations still needs live acceptance;
  deterministic checks are not a proof that every proposed synonym is correct.
- Prompt reference-search-v2-semantic 2.0.0 uses the existing configurable
  SOURCE_DISCOVERY_PLAN_MODEL (default gpt-5.4-nano), low, 4500 output-token cap.
  One structured invocation per planning attempt, no second text fallback.
  Transport retries remain governed by existing runtime/budget policy.
  A stable cache identity is recorded, but durable cross-attempt reuse is 2C.
- Confirmed-only phrase fallback is DEGRADED with UNASSESSED semantic confidence;
  inadequate core input fails before scholarly execution as NEEDS_CLARIFICATION.
  Mode/reasons are visible in response/snapshot metadata. The existing frontend
  hides its planner diagnostics; a user-facing degraded banner is not implemented
  in this backend gate and must be handled with Sources UX in 2D.
- Existing necessary/complementary/optional groups now retain roles/source fields.
  Core queries do not universally require context/year/country/method. No
  positional assumption that group 2 is population. Legacy planner stays intact.
- Role-aware admission removes Spanish local-term and group-position penalties
  for new plans. Two independent supported core anchors plus abstract are needed
  for high-relevance admission; partial/sparse evidence stays reviewable.
  Explicit `Excluir: phrase` / `Exclude: phrase` constraints can reject a title;
  arbitrary natural-language negation is not claimed as fully machine-verified.
  The policy is conservative lexical matching over semantically planned terms,
  not a new embedding or LLM reranker. Source role is a supported preliminary
  recommendation, not certification of methodological transferability.
- No DOI/citation-count/abstract/type hard filters on the new initial OpenAlex
  path; retraction/paratext filters remain. Admission, not popularity or quota,
  controls display. Missing abstract never becomes a high-confidence admission.
- Access URLs remain provider claims: REPORTED_PDF, pdfAccessible=false. No
  document verification/download. Historical audit rows are not rewritten.
- SEARCH_INPUT_FROZEN includes the complete typed input before execution;
  completed snapshots retain enrichment, model/prompt/policy/cache identity,
  role evidence and admission reasons. Existing reads apply that policy.

## Offline evidence

- Focused 2B1 six-discipline fixtures PASS: seismic masonry, digital mathematics,
  structural engineering, qualitative social science, biomedical, humanities.
- Direct/methodological/theoretical controls PASS; old/international positives
  retained; popularity/PDF/geography cannot rescue unrelated sources.
- Unknown/rejected/default/unsupported numeric additions excluded; degraded,
  invalid output, no-model-on-insufficient-input and immutable intent checks PASS.
- Mocked canonical DB path PASS: confirmed input -> one simulated planner ->
  mock records -> score/admission -> diversity -> persist -> recommendation read.
  Reads make no provider calls; history/draft and DB human selection unchanged.
- Phase 2A unit/listing, Phase 2.1, Phase 1 definition/conversation/handoff/UX/
  navigation, G2, keyword expansion and B2 continuity regressions PASS.
- TypeScript, frontend-only build, full backend build and worker build PASS.
  Frontend isolation: 24 production traces, no backend/private dependencies.
  Existing broad-pattern Turbopack warnings in source-selection-service persist.
- No worker bundle inclusion of the changed retrieval path; app-only deployment.

## Real fixture limitation

Immutable fixture: project 9843af3a-d1cc-421c-a02f-a309f751a0c8 revision 10;
47 historical candidates, 46 NEEDS_INSPECTION and one rejected, all old score 0.
Only ONE abstract is available from already persisted Reference records. Tests
using explicitly simulated faithful terminology admit that one; the other 46
are not silently promoted. Simulated shake-table/masonry controls pass separately.
This does not establish new empirical precision on 47 complete documents.
The input's 2026 standard remains a user premise, not a verified norm/publication.

## Deferred gates and acceptance

2C retains responsibility for durable plan cache, provider-specific Crossref
rendering and the browser's missing batchKind. Those known defects are not
claimed fixed by 2B1. 2D must separate suggested checkboxes from persisted human
selection. Astra web, acquisition, PDFs/assets and EvidenceSet remain plan only.

Next acceptance requires a separate explicit authorization: inspect one real
planner output first, then a capped OpenAlex-only run with Crossref fallback
excluded by the acceptance harness. No automatic search on deployment. Review
false negatives and false positives before expanding the provider batch.

Rollback: deploy the prior app image; no migration/data rollback is needed.
Five pre-existing G5 files are excluded from this commit and byte-preserved.

## Staging deployment evidence

- Implementation commit: `763d84ebe62d6792acceff4c2981acd66e545478`, pushed normally
  to `feat/rc4-scientific-commercial`. The later evidence-only commit does not
  change executable code or require another deployment.
- Runtime built from a clean `git archive` of that commit, excluding all five
  uncommitted G5 files. Full backend/worker builds also passed inside Docker.
- Image: `sha256:081c7274c2978c50edd76d27cd3bead7e2d5d8f7c80f6c56f1286a38c93d2eca`;
  OCI revision label matches the implementation commit. The deployed server
  contains research-planner-input.v1, search-enrichment.v1 and role-admission.v1.
- Only `imx-rc4-g5-staging-app-1` recreated, started
  `2026-09-27T19:47:16.215276794Z`, healthy. DB, worker and proxy start times
  remained unchanged; no migrations, env changes or worker restart.
- Local readiness, public Funnel readiness/liveness, staging homepage and
  same-origin session endpoint all HTTP 200. Session check was unauthenticated;
  it is not a new Google/browser acceptance claim.
- Vercel inspection of `https://staging.ingeniometrix.com` resolves to unchanged
  READY Preview `dpl_5neDvpymjJFcCKZEx3142suuir2d`. Its previously recorded
  frontend package source is `b5fbf72fb99b4deaa7c2b98460860465db53f23e`.
  The CLI inspection exposes deployment identity, not an independent source-SHA
  attestation. No frontend executable changes are included in 2B1; the current
  frontend-only package was nevertheless built and isolation-checked offline.
- No scholarly/model/web/document requests or staging search were executed.
  Real precision/model quality remains pending separately authorized acceptance.

Software gate: offline tests/builds and app deployment PASS. This is NOT live
retrieval acceptance. Stop here; do not start 2C or execute providers implicitly.
