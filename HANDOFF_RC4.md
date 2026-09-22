# RC4 handoff

Branch: `feat/rc4-scientific-commercial`.
Base: `02a0a4c0e3b87c41538766e786ec2e090661bff8` / `release0-secure-pilot-rc3`.
RC3 worktree, containers, database, secrets and Tailscale are not modified.

## Gates

| Gate | Requirement | Implementation | Verification | State |
| --- | --- | --- | --- | --- |
| G0 | Isolated branch/worktree; local-only changes | This worktree | Git branch/tag/status | COMPLETE |
| G1a | Reconcile selected/considered/used/excluded; asset QA; terminal costs | Canonical Step 6, export, job control | Reference run read-only + regressions | IN_PROGRESS |
| G1b | Intent, methodological evidence, Astra selector, Sol critic, approval | Explicit scope semantics; compact critic v3; one recovery; bounded repair and approval | Geo improves conditionally; qualitative recovery COMPLETE; applied selector timed out; insufficient PASS | FAIL / NOT ACCEPTED |
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
explicit bounded revision, fixed approved design consumed by drafting. Historical report:
`docs/quality/rc4-g1-scientific-decision.md`. Current scientific evaluation:
`docs/quality/rc4-g1-design-acceptance.md` (FAIL, do not treat as accepted).
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
Final offline suite remains 54/54; Prisma, typecheck and both builds PASS. No commit was
created because G1 acceptance did not pass.

Next action: authorize one isolated applied-selector retry with a longer transport
timeout and run its critic only if complete. Do not rerun geospatial or qualitative;
do not advance to G3 or payments on a G1 PASS claim. RC3 remains untouched.
