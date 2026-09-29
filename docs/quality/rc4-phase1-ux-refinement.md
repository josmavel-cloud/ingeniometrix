# Phase 1 conversational intake UX refinement

Scope: chat hierarchy, brief advisor behavior and the compact definition panel.
ProjectDraft, Intake, provenance, revision/ETag, confirmation and search-intent
authority stay unchanged. No schema or migration was added.

## Behavior

- A fresh project starts one idempotent initial analysis of the owner's idea.
  It creates proposals only. Reload, completed history and manual edits do not
  create another initial call.
- Prompt `conversational-academic-intake` version 2.0.0 proposes a concise
  interpretation before deciding whether a material clarification is needed.
- Deterministic policy suppresses redundant or later-stage questions. Maximum
  three visible material clarifications. A pending proposal can remove the need
  for a question but cannot make evidence-search readiness pass.
- An unavailable model leaves manual editing and explicit confirmation usable.

## Simulated cases (no provider calls)

| Case | Clarification questions | Quick reply choices shown | Confirmed fields in fixture | Unknown fields highlighted | Evidence-search readiness |
| --- | ---: | ---: | --- | --- | --- |
| Detailed educational intervention | 0 | 0 | Topic only | Object remains unconfirmed until proposal acceptance | Needs clarification |
| Medium feedback topic | 1 | 2 | Topic and explicitly edited object | Method remains unknown | Ready |
| Vague technology and education | 3 maximum | 6 across three turns | Topic only | Object and concepts | Needs clarification |

These are deterministic simulated policy checks, not measured live model quality.
They prove that fewer questions do not silently promote AI proposals. The user
still has to accept or edit any proposal needed for search readiness.

## Visual and interaction acceptance

No global theme tokens changed. The chat reuses the existing plum, warm white,
heading/body fonts, rounded surfaces, button styles, navbar and project layout.
The chat is wider, its message area scrolls, and the composer stays at the
bottom of that area. The project header and step navigation are compact only
for the conversational definition step. The panel defaults to at most six
research elements and keeps all other fields behind "Más detalles".

Validation on 2026-09-25:

- Three-case deterministic simulation PASS: detailed 0 questions/0 quick replies;
  medium 1 question/2 choices; vague 3 questions/6 choices across the session.
  Unaccepted object/concepts stay UNKNOWN and search readiness stays blocked.
- Four-discipline conversation-service test PASS with simulated model, initial
  analysis idempotency, redundant-question suppression, proposal-only state,
  stale response and provider-unavailable fallback.
- Local headless Chrome PASS: creation, autosave, navigation, confirmation,
  reload, mobile width and unauthorized denial. Reviewed desktop and mobile
  screenshots in `artifacts-local/rc4/phase1-browser/`; the composer and send
  button are visible in the mobile viewport used for inspection.
- Existing offline regression suite: **62/62 PASS** at
  `artifacts-local/rc4/offline/2026-09-25T15-04-42-691Z/results.json`.
- TypeScript, Prisma validation, full app build, worker build and frontend-only
  build PASS. Frontend trace guard: 24 production traces, zero backend leaks.
- No application model calls, retrieval, scientific generation or payments were
  made by these tests.

## Staging deployment

Feature commit `a3f9fa0` pushed normally. Only the isolated G5 staging app was
rebuilt/recreated; DB, worker and proxy start times and restart counts were
unchanged. App and Funnel liveness/readiness returned 200. Runtime has the
configured model key without exposing its value.

Vercel Preview `dpl_9TWc6MzM1TJ7buF93nLfmKo6Pzn8` completed as Ready and
was assigned only to https://staging.ingeniometrix.com. The public homepage,
workspace, new-project page and same-origin session API return 200. The public
frontend intentionally hides `/api/health/*`; Funnel backend health is 200.
Frontend package tracing found 24 production traces with no Prisma, worker,
private storage or scientific backend dependency.

Staging owner UX retest is still required for live assistant quality, initial
proposal helpfulness, actual question count and mobile feel. Do not infer a
scientific acceptance from the deterministic simulations. No retrieval or plan
generation was run.
