# RC4 2B1.1: bounded query composition repair

## Scope and cause

The 2026-09-27 failed acceptance preserved the Intake correctly. Its planner
returned 30 terms, 28 eligible. The composer grouped equivalent anchors by
source field, then took the first three Cartesian pairs. All three required
the same long original-idea phrase. Phrase protection amplified that defect.
The original private acceptance artifact remains unchanged.

This gate preserves SearchIntent v2, complete field projection, provenance,
typed enrichment, admission-before-diversity and acquisition. It does not
implement 2C, Crossref adaptation, caching, Buscar mas, web discovery or PDFs.

## Policy

`scientific-query-composition.v2` merges equivalent anchored concepts and
constructs up to four grounded coverage intentions: phenomenon + object,
qualified object, supported precedent, and separate context. Short compound
concepts remain phrases; the original sentence is not a universal literal.
Levels 0/1/2/3 distinguish qualified precision, core-only, contextual branch
and role-specific precedent. Context never constrains all international queries.
No translation, method or scientific fact is generated deterministically.

Validation rejects composite/constituent conjunctions, duplicate concept sets
(Jaccard >= 0.8), universal long literals, overlong queries and weak identities.
No query-count padding. Insufficient decomposition fails closed.
Externalized prompt `reference-search-v2-semantic` is version 2.1.0.

## Controlled acceptance

`scripts/accept-rc4-phase2b11.ts` has inspect/plan/search modes, staging guards,
owner checks and durable PaidOperation idempotency. Plan mode permits one
OpenAI Responses request without retries. Compare nano and mini once each.
Search mode requires an already completed, owner/project/hash/version-bound
plan operation. Review its output before executing search mode.

The canonical search service accepts an internal OpenAlex-only capability,
not a public API request flag. It caps queries at four, disables 429 retries,
never falls back to Crossref, and preserves candidate inspection metadata in
the normal search snapshot. The CLI additionally denies other network hosts
and redirects. No document acquisition occurs.

Do not rerun with new request IDs after uncertainty: inspect PaidOperation.
The CLI does not provide a new customer search architecture or bypass auth
in the public API. Administrative acceptance is explicitly owner-scoped.

## Offline verification

- Original 30-term fixture becomes four nonredundant grounded queries.
- Six disciplines retain core concepts without mandatory geography/population.
- Integrated isolated-DB search tests prove prepared-plan reuse, no extra LLM,
  no Crossref on zero results, immutable draft and historical audit, no padding,
  and owner/hash/limit guards.
- Transport test proves one 429 attempt with no hidden retry.

## Live result: FAIL, stopped before OpenAlex

Backend implementation revision: `69ea2089b8b78fb2aef644813197dd420e998193`.
App recreated at 2026-09-27T20:19:24Z. Local/public readiness and staging web
returned HTTP 200. DB, worker and proxy start timestamps were unchanged.
Frontend modules did not change; frontend-only build and dependency isolation
passed. No frontend redeployment was needed.

Both evaluations used identical confirmed input, prompt 2.1.0, low reasoning,
normal PaidOperation reservation/settlement and no retry. Both provider requests
returned HTTP 200 and their operations completed without exceeding reservations.

| Model | Input/output tokens | Estimated USD (settled micros) | Request/operation latency | Assessment |
| --- | --- | --- | --- | --- |
| gpt-5.4-nano-2026-03-17 | 1828 / 879 | 0.001465 | 5335 / 5488 ms | FAIL: untranslated object; limited coverage |
| gpt-5.4-mini-2026-03-17 | 1828 / 1165 | 0.006614 | 7203 / 7367 ms | FAIL: qualifier promoted to phenomenon |

Total: two model requests, 5700 tokens, USD 0.008079. Zero OpenAlex, Crossref,
web, document, Deep Research or scientific-generation calls.
No runtime model migration: neither model clearly passes the full rubric.

Nano produced:

1. `("Simulación sísmica" OR "Seismic simulation") AND ("albañilería")`
2. `("Simulación sísmica" OR "Seismic simulation") AND ("especímenes de albañilería de escala natural")`

Mini produced:

1. `("full-scale") AND ("masonry")`
2. `("seismic simulation") AND ("masonry")`

The mini first query drops the seismic phenomenon. The deterministic composer
accepted a qualifier as a CONCEPT and selected it using its generic tie-break.
Its redundancy validator passes structurally distinct queries but does not yet
prove scientific-role adequacy. The live semantic review caught this before any
scholarly request. Mini also attached distinct contextual concepts to one broad
anchor; those were not executed. No invented scientific facts were established,
but semantic composition is not adequate for live approval.

The historical replay and six-domain synthetic fixtures pass; these two live
plans expose gaps in that offline coverage. Do not interpret green tests as a
live PASS. Further repair needs explicit qualifier/phenomenon separation and
anchor/equivalence validation, with both outputs retained as regressions, before
another authorized live evaluation. Do not start 2C.

Private complete plans and accounting receipts:
`artifacts-local/rc4/phase2b11-live-acceptance-2026-09-27.json`.
The reference project's confirmed revision 10, definitionHash and
searchIntentHash remain unchanged, with all 11 eligible fields available.
Only normal planning audit/PaidOperation records were created; no new search
results, user selections, project science, or balances were manually edited.

Validation passed: 2B1/2B1.1 unit and isolated integration tests, 2A admission and
listing, 2.1 SearchIntent, Phase 1 definition/conversation/readiness/navigation,
G2, evidence continuity, keyword expansion, TypeScript, full build, worker build,
frontend-only build, Vercel isolation and diff-check. Full local build retains
pre-existing broad artifact-glob warnings; the clean container build passed.
