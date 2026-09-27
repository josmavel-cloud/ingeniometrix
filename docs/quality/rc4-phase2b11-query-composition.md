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

Live status remains pending until the bounded staging run is recorded below.
