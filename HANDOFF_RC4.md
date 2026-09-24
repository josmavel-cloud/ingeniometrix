# RC4 handoff

## Latest checkpoint — G4 (2026-09-23)

G4 authentication/commercial candidate implemented on G3 commit
`1ada2d036244fc7a7df79e79a46aa79a688ca1cf`. Local/offline acceptance
PASS_WITH_LIMITATIONS; Google OIDC external acceptance PASS (G4.1), Mercado Pago
signed simulator PASS and first sandbox Order recovered to `CHECKOUT_READY` without
creating a second Order. Manual checkout/payment remains NOT_RUN. No real payments,
paid LLM calls, push or deployment.
Google OIDC + explicit account linking reuse opaque sessions. Sandbox-only candidate
offer, immutable policy snapshots, transactional plan/credit reservations, authoritative
payment verification and append-only ledger are reachable through production paths.
G1/G2/G3/B4 remain green. Google browser authentication was accepted externally in
the isolated RC4 stack: `APP_ORIGIN=https://pepe-thinkpad-t470s.tailbcdf27.ts.net:8448`,
`GOOGLE_REDIRECT_URI=https://pepe-thinkpad-t470s.tailbcdf27.ts.net:8448/api/auth/google/callback`,
Tailscale Serve `:8448 -> 127.0.0.1:3308`; login, callback, reload persistence,
logout and relogin PASS, with no errors. Production commercial actions and admin
adjustments stay blocked pending payment acceptance, approved terms/price and administrator MFA.

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
| G4 | OIDC, credits, sandbox payments, administration | Google OIDC + opaque sessions + transactional ledgers + Orders sandbox | offline regressions green; Google external PASS; signed simulator PASS; sandbox Order recovered | PASS_WITH_LIMITATIONS; manual checkout/payment pending; public commerce BLOCKED |
| G5 | Vercel UI / Ubuntu backend, portable private storage | Typed API boundary; isolated build targets | Bundles, proxy, restore | PENDING |
| G6 | Regression, scientific acceptance, budget, handoff | Existing suites + RC4 evaluations | <=2 full paid runs; <=USD15 total | PENDING |

## Constraints and decisions

- One writer. No push, deployment, real charges or production DB writes.
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

Next action: implement G4 authentication federation, credit ledger and sandbox payments
without changing the accepted G1-G3 scientific/document contracts.
