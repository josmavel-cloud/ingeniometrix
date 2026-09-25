# Conversational intake: staging acceptance

Phase 1 ends at explicit definition confirmation. Do not search sources, run a
BlueprintJob, purchase credits or resume G5 scientific acceptance in this gate.

## Deployment boundary

- Frontend: Vercel Preview, https://staging.ingeniometrix.com.
- Ordinary API: same-origin rewrite to existing Funnel HTTPS port 10000.
- Backend: isolated `docker-compose.g5.yml`, app behind Caddy on localhost 3310.
- Apply `20260925120000_conversational_intake` with the migration role before
  recreating only app. Retain additive schema on rollback.
- No PostgreSQL, worker, proxy or Funnel restart is required for this change.
- Backend runtime needs `OPENAI_API_KEY` for conversation, never Vercel.
  `.env.g5-staging` is ignored and mode 0600. Never print its contents.
- Model configuration: `IMX_INTAKE_MODEL`, `IMX_INTAKE_REASONING`; default
  gpt-5.4-mini / low, 3000 output-token ceiling, no automatic escalation.
- `IMX_CONVERSATIONAL_INTAKE=0` disables new conversational creation/model
  operations while retaining existing draft data and manual review.

## Software checks

Run focused definition, conversation, navigation and browser tests against an
isolated validation DB. Model outputs in tests are simulated; there is no HTTP
mock-provider bypass on staging.

`scripts/check-phase1-staging.ts` is a disposable, explicitly guarded staging
fixture. It creates a dedicated test user and normal server-issued session,
calls the public staging product APIs, then removes only that fixture. It never
borrows the owner's browser session, calls a provider, selects sources or creates
a generation job. Compile it with the existing worker bundler/dependency pattern
and run inside the staging app with `IMX_RUN_PHASE1_STAGING_CHECK=1` only.

Verify readiness, additive migration, idempotent project creation, revisioned edit,
absence of Intake before confirmation, explicit confirmation, clean search-intent,
unauthenticated denial, and zero fixture PaidOperations/BlueprintJobs.

## Owner browser acceptance

Open https://staging.ingeniometrix.com/projects/new using your existing login.
Create independent test projects, not the read-only regression reference project.

1. Detailed engineering idea: include system, purpose and constraints. Expect no
   redundant long interview or invented program, theory or dataset.
2. Vague education idea: answer one clarification with a quick reply, then use
   "No lo se" where appropriate. Expect uncertainty rather than invented facts.
3. Qualitative social research: accept a useful proposal and reject an unsuitable
   one. Expect no compulsory hypothesis, numerical sample or variables.
4. In one case, edit a field manually, change taxonomy and an advanced constraint;
   use back/forward, reload, logout/login and resume from the project list.
5. Open two tabs and edit the same revision. Expect conflict handling that retains
   local text, not silent overwrite.
6. Review the exact included values and confirm the definition. Stop there: do not
   press source-search or plan-generation actions.

Send only the test project IDs and observed behavior to Codex. Backend follow-up
checks revision, provenance, acceptance/knowledge, immutable turns, confirmation
hash, Intake snapshot, search-intent and audit events. Never send session cookies.

Deployment/software checks are not empirical conversational quality acceptance.
Phase 1 final PASS requires this manual UX test and matching persisted-state review.
