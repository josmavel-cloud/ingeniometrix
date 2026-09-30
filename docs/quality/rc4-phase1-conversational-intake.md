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

Prerequisite: deploy the new frontend after resolving the Vercel authorization
block documented below. The existing staging UI is not yet the Phase 1 UI.

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

## Final software and staging evidence (2026-09-25)

- Final existing offline suite: **62/62 PASS**. Evidence:
  `artifacts-local/rc4/offline/2026-09-25T13-58-54-135Z/results.json`.
- Definition, conversation, save/navigation and real local Chrome tests PASS.
  New model-service fixtures are simulated, not paid provider requests.
- Prisma validation, TypeScript, full/backend and worker builds PASS.
- Final frontend package: `dist/vercel-1790344988721`; build PASS; boundary
  guard reports 24 production traces and no private/backend dependencies.
- Additive migration applied to live isolated staging with migration-role
  `prisma migrate deploy`; runtime privilege restrictions reapplied.
- Only staging app recreated. DB, worker and proxy retain their prior start times
  and zero restart counters; Funnel configuration was not touched.
- Local backend and Funnel `/api/health/live` and `/api/health/ready`: 200.
  Authorized operational health: 200, worker/backup/storage healthy.
- `.env.g5-staging` remains gitignored, mode 0600. Owner authorized reuse of
  original-project OPENAI_API_KEY; running app reports CONFIGURED. Key values
  were never printed, committed, passed to Vercel or used for provider calls.
- Public staging contract fixture PASS through Vercel: authenticated disposable
  test session, idempotent creation, revisioned edit, no Intake before explicit
  confirmation, confirmed search-intent, unauthenticated denial, zero paid
  operations/jobs. All disposable fixture users/projects and copied harness were
  removed; real user/reference project data was not modified.
- Direct outbound Funnel fetch from inside the app container failed before
  project creation; the successful acceptance above uses the required public
  Vercel boundary instead. This is not a failed browser direct-upload test.
- Reference draft revision/hash and zero-job baseline rechecked unchanged.

### Preview deployment blocker

Preview ID: `dpl_7zj6d4LAMJ7jSbQr8EwC1oB6wciz`.
URL: https://ingeniometrix-32hd5wjf8-josmavel-clouds-projects.vercel.app
Target: Preview, not Production. Vercel status: **Blocked**, before build.
Reason: commit author lacks deployment permission in this Vercel project.
Commit author is ClawOps. No author rewrite, permission workaround, production
configuration change or staging alias switch was performed.

The existing alias remains on `ingeniometrix-dmn76hqh3-josmavel-clouds-projects.vercel.app`.
Homepage, workspace and session API return 200. The existing frontend intentionally
blocks `/api/health/*` with 404; backend health must be checked on Funnel.
Backend API validation through that existing frontend does not mean the new
conversational interface is deployed.

Smallest next prerequisite: owner resolves commit-author/team access in Vercel's
official project authorization controls. Then deploy the already validated
frontend-only package, alias only `staging.ingeniometrix.com`, and perform the
three manual cases above. Do not rewrite Git author identity to bypass access.

### Final decision

PHASE1_IMPLEMENTATION_STATUS = COMPLETE_SOFTWARE_VALIDATED

STAGING_DEPLOYMENT_STATUS = BACKEND_DEPLOYED_FRONTEND_BLOCKED_AUTHORIZATION

READY_FOR_MANUAL_STAGING_ACCEPTANCE = NO

PHASE1_FINAL_STATUS = PENDING_FRONTEND_DEPLOYMENT_AND_OWNER_ACCEPTANCE

REAL_MODEL_CALLS_DURING_IMPLEMENTATION = 0

SCIENTIFIC_GENERATIONS = 0

REAL_PAYMENTS = 0

Implementation commits: `3dc50e7`, `a4edad1`, `08aadc2`, `01e6d31`.
The final documentation commit records this partial deployment truthfully.
Pre-existing entitlement work remains intentionally uncommitted and untouched.
