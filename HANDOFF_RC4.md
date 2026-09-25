# RC4 handoff

## Latest checkpoint - Phase 1 intake UX refinement (2026-09-25)

The conversational definition step now presents a wide chat, a bottom composer
with Enter/Shift+Enter behavior, and a secondary six-field summary. Advanced
fields remain editable under "Más detalles". The existing Ingeniometrix logo,
palette, typography, surfaces and button system were retained. Project header
and navigation are compact only while a new conversational project is on Define.

Fresh projects request one initial, idempotent advisor interpretation of the
owner's idea. Prompt `conversational-academic-intake` v2.0.0 proposes first;
a deterministic filter permits at most three material clarifications. An
unreviewed proposal can suppress a redundant question but cannot become a
confirmed field or make search readiness pass. ProjectDraft/Intake authority,
provenance, ETag, explicit confirmation and SearchIntent are unchanged.

Validation: three simulated cases ask 0 / 1 / at most 3 questions; four-discipline
service checks PASS; 62/62 existing offline suites PASS; local Chrome desktop
and mobile PASS; Prisma, TypeScript, full/worker builds and frontend-only build
PASS, with 24 production traces and no backend/private module leaks. All model
outputs in these checks were simulated; no application model calls, retrieval,
scientific generation or payments were made.

Commit `a3f9fa0` was pushed normally. The isolated staging app was rebuilt and
recreated; local/Funnel liveness and readiness are 200. DB, worker and proxy
retain their original start times and zero restarts. New Vercel Preview
`dpl_9TWc6MzM1TJ7buF93nLfmKo6Pzn8` is Ready and the alias
https://staging.ingeniometrix.com points to it. Homepage, workspace, new-project
page and same-origin session API respond 200. Public frontend health routes
intentionally return 404; backend health is checked through Funnel.

Owner must now test live advisor quality and visual flow manually in staging.
Use the [UX refinement report](docs/quality/rc4-phase1-ux-refinement.md) and
[Phase 1 manual checklist](docs/runbooks/RC4_PHASE1_STAGING.md). Do not resume
G5 scientific E2E until this acceptance passes; retrieval quality remains the
separate Phase 2 issue. Existing staging entitlement work in five files remains
unstaged and untouched.

## Latest checkpoint - conversational intake Phase 1 (2026-09-25)

Implementation Gates 1-4 and software validation are complete. **Frontend staging
deployment is BLOCKED by Vercel commit-author permissions; manual UX acceptance is
PENDING. Do not claim Phase 1 PASS or resume G5 scientific E2E.**

New projects use Define tu investigacion -> Evidencia -> Plan de tesis, with
proposal-only conversation, a live editable definition, immutable bounded turns,
field provenance and exact revision/hash confirmation. ProjectDraft is mutable
authority; Intake is the explicitly confirmed snapshot. Retrieval/G1/G3 semantics
are unchanged. Historical projects retain compatibility.

Scoped feature commits: `3dc50e7`, `a4edad1`, `08aadc2`, `01e6d31`; pushed normally
to `feat/rc4-scientific-commercial`. Five pre-existing staging-entitlement files
remain unstaged and byte-identical; do not include them in Phase 1 commits.

All 62 existing offline suites PASS, as do new definition/conversation/navigation
tests, local Chrome software checks, Prisma, TypeScript, full/worker builds and
frontend-only build (24 dependency traces, no backend modules). Simulated model
tests do not establish empirical advisor quality. Zero real model calls, retrieval
calls, scientific generations or payments were made.

Staging migration `20260925120000_conversational_intake` applied successfully.
Only the isolated staging app was recreated; DB, worker, proxy and Funnel were not
restarted. Backend readiness/liveness and protected aggregate operational health
are healthy. With owner authorization, the original project's OPENAI_API_KEY was
reused privately in ignored mode-0600 `.env.g5-staging`; runtime presence verified
without displaying it. A disposable public Vercel-to-Ubuntu API fixture passed
creation/replay, revisioned edit, explicit confirmation, search-intent and owner
denial, with zero provider calls/jobs; its records were removed afterward.

New frontend Preview `dpl_7zj6d4LAMJ7jSbQr8EwC1oB6wciz` was blocked before build:
the commit author lacks deployment permission for this Vercel project. No identity
was changed to bypass the check. `staging.ingeniometrix.com` still points to the
previous frontend; its homepage/workspace and session API respond 200. Public web
`/api/health/*` intentionally returns 404; use the Funnel backend health routes.
Owner must resolve Vercel author/team authorization, then deploy the validated
frontend package and update only the staging alias before manual acceptance.

Reference project `ca610ddb-82c7-4854-9592-0d961c7e595b` remains revision 1 with
unchanged hash and zero jobs. See the [Phase 1 report](docs/quality/rc4-phase1-conversational-intake.md),
[architecture](docs/architecture/RC4_CONVERSATIONAL_INTAKE.md) and
[manual staging runbook](docs/runbooks/RC4_PHASE1_STAGING.md).

## Latest checkpoint — G5 local implementation (2026-09-23)

G5 starts from `b6f0cf8a1917f39eb34650805a5f63f52782539a` on
`feat/rc4-scientific-commercial`. Hybrid HTTP boundary, frontend-only packaging,
private 30 MiB upload/download capabilities, isolated least-privilege Compose,
Caddy, health/heartbeat and encrypted backup/restore tooling are implemented.
15 relevant offline suites PASS; HTTP boundary 29 assertions PASS; 30 MiB PDF
streamed through Caddy/Next successfully. Fresh migration and upgrade PASS.
App/idle-worker restart and isolated encrypted restore PASS (local repository only).
No paid LLM calls, payments, push, DNS writes or external deployment in G5.

### G5.1 staging connection checkpoint (2026-09-23)

Vercel Preview environment variables were configured only for branch
`feat/rc4-scientific-commercial`: `IMX_RUNTIME_ROLE=frontend`,
`PUBLIC_APP_ORIGIN`/`APP_ORIGIN`/`AUTH_ORIGIN=https://staging.ingeniometrix.com`,
and `BACKEND_API_ORIGIN`/`UPLOAD_ORIGIN=https://pepe-thinkpad-t470s.tailbcdf27.ts.net:10000`.
The application origin remains the browser/cookie authority; ordinary API routes
use the same-origin Vercel rewrite, while one-use upload/download capabilities use
the Funnel origin. Preview-only variables do not alter Vercel Production.

Funnel serves the isolated Caddy ingress on port 10000. Public liveness/readiness
return 200; an unsigned Mercado Pago probe is rejected with 401; an authorized
synthetic PDF upload of 30 MiB passed and remained quarantined. A Funnel restart
restored readiness and left existing Tailscale Serve mappings unchanged. PostgreSQL
and worker have no published ports. Vercel Preview for this branch is deployed Ready
at `https://ingeniometrix-lz6wbofh7-josmavel-clouds-projects.vercel.app`; `/`,
`/workspace`, same-origin session API, authenticated owner detail, and logout were
verified through Vercel's protection-aware CLI, with backend requests reaching Caddy.
The generated bundle has 23 production traces and no backend/private dependencies.
This is not browser acceptance: Wix DNS still has no `staging` A record, and Vercel
Deployment Protection remains enabled. The custom staging URL and Google browser
login remain unverified.

G5 remains BLOCKED for full external acceptance, not production-ready. Vercel project
is linked and the Preview environment is branch-scoped; Production settings were
not changed. Owner authorized only staging DNS changes, but this task explicitly
did not modify Wix. `api-staging.ingeniometrix.com` is a future named-tunnel option;
the active staging backend for this test is the Tailscale Funnel origin above.
Named-tunnel credentials/identity are unavailable. Owner supplied a dedicated
Simetrika Google Drive folder; read-only permission metadata shows `anyone: writer`.
External backup paused until owner restricts it and authorizes local rclone access.

### G5.2 close attempt (2026-09-24)

Status remains **BLOCKED**. Read-only probes: Vercel staging root and `/workspace`
200; Funnel `/api/health/live` and `/api/health/ready` 200. Latest available signed
webhook diagnostic (05:16:15 UTC) passed signature validation and returned 200 as
`VALID_UNSUPPORTED_NOTIFICATION`, with zero commercial mutations. Vercel traversal
of that specific event is unproven from retained logs; no provider test was repeated.

G5 offline 15/15; isolated G4 auth/commercial/webhook/recovery and B4 48 checks;
Prisma, typecheck, frontend/full/worker builds and 24-trace Vercel boundary passed.
Drive remains `anyone:writer`; no external backup/restore or external monitoring was
performed. No authenticated staging session was available, so no paid generation,
downloads/settlement, in-flight worker recovery or external two-user test ran. See
`docs/quality/rc4-g5-hybrid-acceptance.md` G5.2 for evidence and prerequisites.
Production and real payments remain disabled.
No Drive write performed. Optional Drive/restic configuration is prepared. Local
backup is not off-machine.

See [G5 acceptance](docs/quality/rc4-g5-hybrid-acceptance.md),
[hybrid architecture](docs/architecture/HYBRID_DEPLOYMENT.md), and
[staging runbook](docs/runbooks/STAGING_RUNBOOK.md). Uploaded PDFs are quarantined,
not yet approved/ingested as scientific evidence. Admin MFA remains a production
blocker. Existing G4/RC3 stacks and Tailscale mappings were preserved.

### G5.3 infrastructure prerequisite recheck (2026-09-24)

At `e2a5b4b4d68c6328150071717b24695e67ca6467`, the RC4 feature worktree and remote
branch were clean and aligned. The Drive backup folder ACL is now restricted (only
named user permissions; no anyone/link/domain-wide permission), but this is not a
least-privilege rclone identity. No host rclone config, `/etc/ingeniometrix/g5.env`,
or dedicated backup identity exists. The backup image includes rclone/restic but no
remote was configured; no upload or remote restore occurred. The exact manual
prerequisite is to authorize a dedicated identity for only the folder, configure
`imx-drive` plus `imx-drive-crypt`, and independently escrow rclone-crypt/restic
recovery secrets before running the documented remote backup/restore procedure.

No off-host monitor was installed: GitHub CLI/workflow secret administration is
unavailable in this environment, and staging `/api/health/operational` returns 404.
The current checks are point-in-time only: staging `/` 200, `/workspace` 500, backend
Funnel liveness/readiness 200. Do not claim staging healthy while the workspace route
is failing. No monitoring failure/recovery or stale-backup test was run. No paid LLM,
payment, Drive write, DNS change, or app/worker restart was performed. Prisma
validation, typecheck, frontend/full builds, and worker build passed locally; build
output retains the existing broad `artifacts-local` tracing warnings.

### G5 external encrypted backup and isolated remote restore (2026-09-24)

Follow-up to the prerequisite recheck above: owner confirmed external custody of
the rclone crypt password/password2 and Restic repository password. On the clean
`feat/rc4-scientific-commercial` worktree at `04ec1daefd2cbdf5f7471594c15ab4ca4c89188f`,
created and verified a real encrypted remote backup:
`imx-drive-crypt:staging/2026/09/24/ed5d7458-5586-441d-8990-60da933cd6da`;
Restic snapshot `62703b86`, manifest SHA-256
`21d71550fe57301aa662eb14540089ef9c0c21a48c5f6a5044cef19d704b2e0b`.
Restic full-data check and a restore downloaded from Google Drive passed. Restore
used tmpfs for decrypted data, a temporary PostgreSQL 16 instance with no network,
and an isolated socket; source/restored counts and ledger invariants matched, and
all six private artifact file hashes passed. No production/staging DB mutations,
payments, or LLM calls occurred. Staging app/worker recovered healthy and
`/api/health/ready` returned 200. Exact counts, recovery steps, and provisional
retention are recorded in `docs/runbooks/BACKUP_RESTORE.md`.

Operational caveat: the first Compose attempt revealed that
`docker-compose.g5-drive.yml` hard-codes the base remote repository. Before catching
this, one separate Restic-encrypted snapshot was also written to
`rclone:imx-drive:restic-g5`; that copy did not pass through rclone crypt. It was not
used for the accepted remote restore and remains preserved pending separately
authorized cleanup. The accepted snapshot above was explicitly initialized,
backed up, checked, and restored through `imx-drive-crypt`. Do not claim an
exclusive-crypt transfer history until the extra repository is reviewed.

The verified encrypted backup/restore sub-gate passes. This does not close all of
G5: external monitoring, final paid staging E2E, and other pending acceptance items
remain independent gates. No repository code changed; this handoff/runbook update
is documentation-only.

### G5.3 monitoring implementation (2026-09-24)

After the encrypted-backup docs commit, implemented `/api/health/operational` as a
read-only bearer-token endpoint exposing only aggregate worker heartbeat (120s),
backup freshness (26h), and free-storage threshold (15%) states. Caddy allows only
the three health routes; app receives `IMX_MONITORING_TOKEN`, worker explicitly
does not. Added an every-15-minute GitHub Actions workflow plus manual dispatch and
offline healthy/outage/recovery/stale fixtures. Retention intent remains daily 7,
weekly 4, monthly 3; no pruning occurred. The extra
`rclone:imx-drive:restic-g5` repository remains preserved and requires explicit
cleanup authorization (`CLEANUP_AUTHORIZATION_REQUIRED = YES`).

Local tests, typecheck, Vercel build, full backend build and worker build pass.
Activation follow-up (2026-09-24): owner-configured token was present in
`.env.g5-staging`; the rebuilt isolated app loaded it. App-only recreation left DB
and worker running. App-local unauthenticated/authenticated requests returned
401/200. The old proxy returned 404 until it was recreated to load the health-route
allowlist. Public Funnel requests then returned 401 without auth and 200 with auth;
the response exposed only aggregate enums and all states were healthy. The backup
age marker was initialized conservatively from the creation time of the previously
verified external snapshot (not a new backup). Feature branch push at `6403af8` was
verified. The workflow is now self-contained for a workflow-only `main` commit.
GitHub dispatch/list-runs API tooling is unavailable here; no Actions run or
notification delivery is claimed. No outage was induced. No DB, worker, OAuth,
payment, DNS or Funnel changes were made.

## Previous checkpoint — G4 (2026-09-23)

G4 authentication/commercial candidate implemented on G3 commit
`1ada2d036244fc7a7df79e79a46aa79a688ca1cf`. Local/offline and external sandbox
acceptance PASS. Google OIDC external acceptance PASS (G4.1). Mercado Pago external
acceptance PASS: a PEN 99.00 sandbox Order reached `processed/accredited`, its
case-sensitive Orders webhook authenticated, Purchase became `PAID`, and the normal
commercial path granted five plan slots plus 10,000 compute credits exactly once.
Replaying the same webhook produced no second grant. Real money charged: 0. No paid
LLM calls, push or deployment.
Google OIDC + explicit account linking reuse opaque sessions. Sandbox-only candidate
offer, immutable policy snapshots, transactional plan/credit reservations, authoritative
payment verification and append-only ledger are reachable through production paths.
G1/G2/G3/B4 remain green. Google browser authentication was accepted externally in
the isolated RC4 stack: `APP_ORIGIN=https://pepe-thinkpad-t470s.tailbcdf27.ts.net:8448`,
`GOOGLE_REDIRECT_URI=https://pepe-thinkpad-t470s.tailbcdf27.ts.net:8448/api/auth/google/callback`,
Tailscale Serve `:8448 -> 127.0.0.1:3308`; login, callback, reload persistence,
logout and relogin PASS, with no errors. Production commercial actions and admin
adjustments stay blocked pending approved terms/price, administrator MFA and G5 deployment controls.

Read [G4 acceptance](docs/quality/rc4-g4-commercial-acceptance.md),
[architecture](docs/architecture/RC4_G4_AUTH_AND_COMMERCIAL.md) and
[runbook](docs/runbooks/rc4-g4-commercial.md) before continuing. Older checkpoints
below preserve chronology and must not be mistaken for current G4 status.

Branch: `feat/rc4-scientific-commercial`.
Base: `02a0a4c0e3b87c41538766e786ec2e090661bff8` / `release0-secure-pilot-rc3`.
RC3 worktree, containers, database, secrets and Tailscale are not modified.

## Gates

| Gate | Requirement | Implementation | Verification | State |
| --- | --- | --- | --- | --- |
| G0 | Isolated branch/worktree; local-only changes | This worktree | Git branch/tag/status | COMPLETE |
| G1a | Reconcile selected/considered/used/excluded; asset QA; terminal costs | Canonical Step 6, export, job control | Reference run read-only + regressions | IN_PROGRESS |
| G1b | Intent, methodological evidence, Astra selector, Sol critic, approval | Explicit scope semantics; compact critic v3; persistent background selector; bounded recovery and approval | Geo and qualitative PASS_WITH_LIMITATIONS; applied cross-domain PASS_WITH_LIMITATIONS; insufficient PASS | COMPLETE / ACCEPTED |
| G2 | Versioned draft, autosave, taxonomy, four steps, uploads/HTML | Revisioned draft, FORD catalog, immutable versions, four-step UI; PDF upload is contract-only | 54/54 offline suites; fresh/RC3 migrations; Prisma, typecheck and builds | COMPLETE |
| G3 | latam-compact-v1, 7-12 body pages, editable matrix, evidence-driven assets | Versioned compact profile, deterministic renderer and bounded presentation repair | 56/56 suites; 12 body/14 total pages; all-page review; USD0.5566905 | COMPLETE / PASS_WITH_LIMITATIONS |
| G4 | OIDC, credits, sandbox payments, administration | Google OIDC + opaque sessions + transactional ledgers + Orders sandbox | regressions green; Google external PASS; sandbox checkout, webhook and idempotent grant PASS | COMPLETE / PASS; public commerce BLOCKED |
| G5 | Vercel UI / Ubuntu backend, portable private storage | HTTP boundary, package guard, transfer capabilities, Caddy, roles, backup/restore | Local offline + HTTP + restore green; external credentials/dependencies pending | IMPLEMENTED LOCALLY / EXTERNAL BLOCKED |
| G6 | Regression, scientific acceptance, budget, handoff | Existing suites + RC4 evaluations | <=2 full paid runs; <=USD15 total | PENDING |

## Constraints and decisions

- One writer. No push, real charges or production DB writes. G5 staging deployment
  authorized; production domain cutover prohibited until the explicit readiness gate.
- Scientific selector `gpt-6-astra/high`; critic `gpt-5.6-sol/high`.
- Existing scientific drafting models retained. Deep Research OFF.
- Existing USD2 job cap retained. No paid call before bounded reservations.
- Package PEN9900 is a candidate, not approved for real sale.
- Merchant country/entity and public web/API origins are unconfirmed.
- Training disabled; optional consent never conditions service.
- Historical documentation describing RC3 as an unpromoted candidate is stale;
  the verified Git base above is authoritative for this task.

## Current checkpoint

G0 verified clean RC3 and created isolated worktree. G1 incident repairs implemented:
reading-order PDF extraction, exact citation locators, full selected-source snapshot,
exclusion accounting, rejected-image omission and terminal cost closure.
54/54 offline suites PASS on new isolated DB (loopback 55440); B4 has 48 assertions.
Prisma, typecheck, app and worker builds PASS. Pre-job durable budgets, request/revision
attribution, idempotency and 10 externalized prompt templates now implemented.
Reports: `docs/quality/rc4-g1-integrity.md`, `docs/quality/rc4-g1-prejob.md`.
G1b selector/critic/approval implemented: one model repair, approval by input hash,
explicit bounded revision, fixed approved design consumed by drafting. Historical report:
`docs/quality/rc4-g1-scientific-decision.md`. Current scientific evaluation:
`docs/quality/rc4-g1-design-acceptance.md` (PASS as a selector gate; not universal scientific validation).
G1b commit: `e16cdde`. G2a draft persistence and immutable worker inputs commit:
`8229393`; see `docs/quality/rc4-g2-drafts-snapshots.md`. G2 now adds the
versioned `FORD-2015` catalog, accent/alias/code lookup, explicit
`CUSTOM_UNRESOLVED` mappings, optional university, advanced draft fields,
conservative downstream invalidation, multiple immutable plan versions, four
visible steps and a deterministic research summary. User PDF upload remains an
honest disabled contract for G3/G4 (maximum two, hash/provenance/consent fields);
no file is accepted yet. Interactive browser validation NOT_RUN. RC3 untouched.
Final G2 suite: `node --env-file=.env.rc4-test --import tsx scripts/rc4-offline-suite.ts`.
G1 evaluation spent estimated USD1.580950 across five provider calls / 65123 tokens.
Geospatial: selector v2 truncated at 8192; ONE repair completed it, ONE Sol critique
found a conditional implementation design superior to RC3's feasibility-oriented
proposal, but access/parameters/validation still block approval. No evidence enrichment.
Qualitative: selector v3 preserved methodology, no sample/hypothesis invention; Sol
critic v2 exhausted 4096 tokens (3865 reasoning). Its JSON was rejected, not certified.
There is also an unresolved representation issue: a proposed single case is marked
scope-preserving while awaiting user acceptance. Applied case NOT_RUN under systemic
failure stop rule. Insufficient case blocks at USD0. Existing harness locks prevent
duplicate case runs; paid evaluation was stopped, do not resume it blindly.

New source accounting/DAG/data-availability/scope-impact contracts and one shared
repair allowance are documented in `docs/architecture/RC4_SCIENTIFIC_DECISION.md`.
Prompts/inputs/results remain private under
`artifacts-local/rc4/scientific-design-evaluation-v1/`; complete `PROMPTS_USED.md` there.
Frozen source S5 remains explicitly excluded for unverified RC3 excerpts; its newer
extraction is not used to make the comparison appear better.

G1.1 repaired critic completeness and scope semantics without rerunning the geospatial
selector. Qualitative used the frozen selector and one Sol/high recovery: COMPLETE,
11331 tokens, estimated USD0.117750. It preserved qualitative methodology, introduced
no hypothesis or numeric sample and correctly classified the unresolved case boundary
as `PENDING_USER_DECISION`; the design remains blocked pending user/access/evidence.
The distinct applied-education selector used the single allowed Astra call but timed
out after 240 seconds with no JSON or provider usage. Its USD0.9490875 maximum remains
reserved as UNKNOWN usage, never zero. No critic or retry followed. New calls 2/3;
known tokens 11331; known estimate USD0.117750; conservative committed USD1.0668375.
Private closure evidence: `artifacts-local/rc4/scientific-design-evaluation-g1-1/`.
The independently valid G1.1 changes were committed as `7ba51f3`; background transport
hardening is `aa2543c`. G1.2 replaced
foreground timeout semantics for the long selector with one persisted Responses
background create plus retrieval by the same `response_id`. The applied education case
completed with exactly one Astra selector and one Sol critic, no recovery: 21567 tokens,
estimated USD0.4848225. The old timed-out request remains UNKNOWN with its USD0.9490875
maximum commitment; conservative combined commitment is USD1.43391. The design preserved
scope, avoided mixed/engineering overfit and correctly remained unapprovable until five
user decisions, evidence support per criterion and validation separation are resolved.
All sources were considered; S1/S2 exclusions are explicit and S3 is the sole cited
full-text support. Final suite: 55/55; Prisma, typecheck and both builds PASS. Private
evidence: `artifacts-local/rc4/scientific-design-evaluation-g1-2/`.

G3 introduced `latam-compact-v1` without rerunning G1. The accepted geospatial
ScientificDecision/ResearchDesign produced four questions, one general objective and
three aligned specific objectives, no forced hypothesis, an editable native matrix and
one deterministic final methodological infographic. No cover or matrix image and no
legacy extracted figure were used. The first scientific review stopped publication on
five unsupported attributions; one localized citation repair plus one independent review
closed them without changing the approved design. Final cumulative usage: 12 calls,
116476 input + 20091 output tokens, estimated USD0.5566905. A zero-provider presentation
repair removed duplicated rendered citations and a partially inserted optional diagram,
fixed lists/footers/references and regenerated only the deterministic infographic.
Final artifacts have 12 body pages (14 total), so the gate is PASS_WITH_LIMITATIONS:
within the 7-12 hard contract but one page above the 9-11 target, with pending researcher
decisions still visible. Report: `docs/quality/rc4-g3-document-acceptance.md`.

Next action: implement and validate G5 hybrid deployment architecture without enabling
production payments or changing the accepted G1-G3 scientific/document contracts.
