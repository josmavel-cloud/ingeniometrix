# RC4 handoff

Branch: `feat/rc4-scientific-commercial`.
Base: `02a0a4c0e3b87c41538766e786ec2e090661bff8` / `release0-secure-pilot-rc3`.
RC3 worktree, containers, database, secrets and Tailscale are not modified.

## Gates

| Gate | Requirement | Implementation | Verification | State |
| --- | --- | --- | --- | --- |
| G0 | Isolated branch/worktree; local-only changes | This worktree | Git branch/tag/status | COMPLETE |
| G1a | Reconcile selected/considered/used/excluded; asset QA; terminal costs | Canonical Step 6, export, job control | Reference run read-only + regressions | IN_PROGRESS |
| G1b | Intent, methodological evidence, Astra selector, Sol critic, approval | Extend ResearchDesign | Frozen comparative evaluation + negative cases | PENDING |
| G2 | Versioned draft, autosave, taxonomy, four steps, uploads/HTML | Additive persistence and canonical routes | Concurrent drafts, sources, SSRF, uploads | PENDING |
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
49/49 offline suites PASS on new isolated DB (loopback 55440); B4 has 48 assertions.
Report: `docs/quality/rc4-g1-integrity.md`. G1 still PARTIAL: pre-job budgets and
scientific selector/critic/approval remain pending. RC3 runtime remains untouched.
Next command: `node --env-file=.env.rc4-test --import tsx scripts/rc4-offline-suite.ts`.
Paid evaluation spend: USD0. No external acceptance claimed.
