# RC4 Phase 1 software acceptance and manual handoff

Implementation baseline: b479e97f7820e3a550cbdca197988c1004a8ced4.
Final UX acceptance: **PENDING OWNER MANUAL TEST**. Deployment is not Phase 1 PASS.
G5 scientific E2E remains paused. No retrieval, scientific generation or payment
was performed for this implementation.

## Preserved work

Pre-existing uncommitted files were not changed or staged:
`package.json`, `docs/runbooks/STAGING_RUNBOOK.md`,
`scripts/g5-staging-entitlement.ts`, `scripts/test-g5-staging-entitlement.ts`,
`server/commercial/staging-entitlement-policy.ts`.
Their SHA256 values were recorded before work and compared afterward.
Reference project ca610ddb-82c7-4854-9592-0d961c7e595b stays revision 1,
content hash 9f5ba7ae97ecf3f4828e1c2b95f57c99d8d8befd8e973c5493db77685a0c467d,
zero BlueprintJobs. It was queried read-only, never migrated as user-confirmed.

## Gates and software evidence

- Gate 1: additive schema, provenance, immutable turns, exact confirmation,
  owner isolation and revision conflicts. `test-conversational-definition.ts`.
- Gate 2: versioned prompt, strict proposal-only result, PaidOperation,
  idempotency, delayed/stale response and provider-unavailable fallback.
  `test-intake-conversation.ts` uses simulated outputs across four disciplines.
- Gates 3/4: conversation/live panel, single-field advanced editor, taxonomy
  suggestions, review, no automatic confirmation, query navigation and resume.
  `test-intake-navigation.ts` covers serial saves and lost-response identity.
- Real local Chrome against isolated test DB: canonical project creation,
  manual edit, autosave, query navigation, explicit snapshot, search-intent,
  reload, missing-session denial and mobile overflow check. No borrowed cookie.
  `test-intake-browser.ts`; private screenshots under
  `artifacts-local/rc4/phase1-browser/`. Model unavailable was tested honestly.
- Initial 62-suite regression run: 61 PASS, one old G2 assertion expected four
  visible stages. Updated that assertion to the approved three-stage UX while
  retaining historical Idea URL checks; G2 rerun PASS. Final rerun recorded below.
- Additive migration applied to isolated validation database before staging.
- Full Next build, worker build, Prisma validate and frontend-only package build
  passed; frontend trace guard found no backend/private dependencies.

## Manual staging checklist (required)

Use https://staging.ingeniometrix.com/projects/new while logged in. Do not search
for evidence or generate a plan during these tests. Conversation turns are bounded
pre-job model operations; they are not thesis generation.

| Case | Owner action | Backend verification afterward |
| --- | --- | --- |
| A detailed engineering idea | Specify intended system, purpose and constraints; choose level | Project created once; originalIdea USER_EXPLICIT; no fictitious program or Intake before confirmation |
| B vague education idea | Enter a broad idea; use a quick reply, then No lo sé | one material question; turn persisted; UNKNOWN, no fabricated population/method |
| C qualitative social research | Describe experiences/narratives; reject an unsuitable suggestion | rejected proposal retained; no forced hypotheses/variables/sample |
| Any case | Accept a proposal, then edit it | origin retained on acceptance; later explicit edit gets new revision and invalidates old confirmation |
| Any case | Change suggested taxonomy; try a custom area | same draft; no invented code; canonical/custom resolution only on confirmation |
| Any case | Edit advanced data/access or constraint | same ProjectDraft; not a separate form truth |
| Any case | Back/forward, query-step navigation, reload | saves not confirmations; pending text recovered or explicit conflict shown |
| Any case | Logout/login and reopen from project list | saved revision and turn history retained; deterministic resume |
| Any case | Edit from two tabs | stale write rejected; local text retained; explicit comparison/reapply |
| Any case | Review and confirm | owner + exact revision/hash + Intake snapshot + RESEARCH_DEFINITION_CONFIRMED audit; search-intent excludes unaccepted values |

Owner supplies project IDs only, never browser cookies. Inspect each project's
revision, field origin/acceptance/knowledge, confirmation hash, Intake snapshot,
search-intent and audit. Manual quality/latency remains unmeasured until these tests.

## Known limits

- No empirical model-quality PASS from mocked responses.
- A crashed RUNNING model turn requires operator review; no automatic paid retry.
- Legacy projects retain the old editor; no fabricated provenance backfill.
- Pending local edits survive in the same browser session, not across devices.
- Phase 2 must consume the new confirmed search-intent; retrieval is not redesigned.
- PDF AWAITING_UPLOAD remains pending, not received evidence.
