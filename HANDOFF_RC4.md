# RC4 handoff

Branch: `feat/rc4-scientific-commercial`.
Base: `02a0a4c0e3b87c41538766e786ec2e090661bff8` / `release0-secure-pilot-rc3`.
RC3 worktree, containers, database, secrets and Tailscale are not modified.

## Gates

| Gate | Requirement | Implementation | Verification | State |
| --- | --- | --- | --- | --- |
| G0 | Isolated branch/worktree; local-only changes | This worktree | Git branch/tag/status | COMPLETE |
| G1a | Reconcile selected/considered/used/excluded; asset QA; terminal costs | Canonical Step 6, export, job control | Reference run read-only + regressions | IN_PROGRESS |
| G1b | Intent, methodological evidence, Astra selector, Sol critic, approval | Owned decision UI + persistent job pause/approval | Offline contracts PASS; real comparison pending | PARTIAL |
| G2 | Versioned draft, autosave, taxonomy, four steps, uploads/HTML | Revisioned draft, FORD catalog, immutable versions, four-step UI; PDF upload is contract-only | 54/54 offline suites; fresh/RC3 migrations; Prisma, typecheck and builds | COMPLETE |
| G3 | latam-compact-v1, 7-12 body pages, editable matrix, five assets | Existing document renderers | DOCX/PDF/all-page review | PENDING |
| G4 | OIDC, credits, sandbox payments, administration | Ubuntu identity + transactional ledgers | Isolation/concurrency/webhooks/OAuth | PENDING |
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
explicit bounded revision, fixed approved design consumed by drafting. Report:
`docs/quality/rc4-g1-scientific-decision.md`. Scientific comparison still pending.
G1b commit: `e16cdde`. G2a draft persistence and immutable worker inputs commit:
`8229393`; see `docs/quality/rc4-g2-drafts-snapshots.md`. G2 now adds the
versioned `FORD-2015` catalog, accent/alias/code lookup, explicit
`CUSTOM_UNRESOLVED` mappings, optional university, advanced draft fields,
conservative downstream invalidation, multiple immutable plan versions, four
visible steps and a deterministic research summary. User PDF upload remains an
honest disabled contract for G3/G4 (maximum two, hash/provenance/consent fields);
no file is accepted yet. Interactive browser validation NOT_RUN. RC3 untouched.
Final G2 suite: `node --env-file=.env.rc4-test --import tsx scripts/rc4-offline-suite.ts`.
Paid evaluation spend: USD0. No external acceptance claimed. Next gate after G2:
G1 scientific evaluation or G3 compact document profile; do not start payments here.
