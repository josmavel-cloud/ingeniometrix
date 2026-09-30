# RC4 G1: pre-job cost and prompt governance

Implementation verified offline, not scientific acceptance. RC3 runtime unchanged.

## Persistent operation boundary

`PaidOperation` records authenticated user, optional owned project, request ID,
explicit content-hash revision, input fingerprint, limits and immutable result.
`PaidOperationCall` records each reservation, configured/actual model, estimated
micro-USD and provider usage. These are business costs, NOT customer credits.
Both use integer micro-USD; no claim of provider-invoice accuracy.

Producers: authenticated idea/intake/area/search/refinement POST routes.
Consumers: provider adapter, usage registry, idempotent replay, diagnostics.
Draft ID is a reserved optional field pending G2; not falsely inferred from time.
Retention: private audit records; cleanup classification MONITOR, not disposable.

Before a provider request, lock the owner row and reserve against both operation
and user rolling-day limits. Defaults: USD0.25/request, USD1/rolling day and
100 operation requests/rolling day. These are pilot anti-abuse controls, not a
commercial package promise. Configurable variables:
`IMX_PRE_JOB_REQUEST_CAP_USD`, `IMX_PRE_JOB_DAILY_CAP_USD` (each <=USD2).
The existing generation-job hard cap remains USD2 and is not reset.

Unknown usage holds its full reservation, including after the rolling day expires.
Late settlement is idempotent and cannot reopen a terminal operation. A bound
overrun freezes further automatic pre-job spend for that owner pending review.
Repeated request ID with different input is a conflict; concurrent requests with
the same ID cannot execute twice. Successful replay returns stored output.

Provider calls without a persistent job or operation context now fail closed.
An in-process evaluation budget is an ADDITIONAL limit, not an alternative to
persistent accounting. This intentionally blocks previously unscoped paid scripts.
No provider usage is recorded as zero when absent; cancellation before dispatch
is separately labelled. Missing output bound/pricing cannot schedule an API call.
Pre-job text calls without an explicit token limit use a 4096-output-token ceiling.

The topic-suggestions GET is now observational; generation remains POST. Source
selection GET cannot authorize an LLM translation through an unscoped fallback.
Frontend paid-operation errors currently use existing 400 handling; dedicated
friendly credit/limit handling remains G2/G4 work.

## Prompt inventory

All files below are under `server/mvp/prompts/`; each carries complete template,
variable-to-caller-expression definitions, version, schema consumer and actual
call arrangement (single concatenated Responses input, NOT separate roles).

| File | Purpose / caller |
| --- | --- |
| `quick-idea-draft-generator.v1.ts` | Initial/improved idea; `server/projects/quick-idea-draft-generator.ts` |
| `topic-suggestion-generator.v1.ts` | Research-topic alternatives; same-named project service |
| `topic-area-normalizer.v1.ts` | Area classification; same-named project service |
| `intake-draft-service.v1.ts` | Editable intake drafts; same-named project service |
| `intake-normalization-service.v1.ts` | Step 1 normalization; same-named MVP service |
| `reference-search-v2.v1.ts` | Canonical query planning; retrieval service |
| `search-query-planner.v1.ts` | Secondary query planner; retrieval service |
| `reference-translation-service.v1.ts` | Language detection and translation; retrieval service |
| `retrieval-llm-json.v1.ts` | Bounded structured-output text fallback |

Rendered instruction text is unchanged in this extraction. Ten template hashes
are checked against the reviewed pre-extraction versions. This does NOT certify
old ideation behaviour as RC4 compliant: university/Peru assumptions and novelty
wording must change in versioned G2 prompts, not silently during extraction.
Runtime models remain as configured before this gate. New selectors are not enabled.

## Validation

51/51 offline suites PASS; Prisma, typecheck, app build and worker build PASS.
Results: `artifacts-local/rc4/offline/2026-09-21T22-06-35-342Z/results.json`.
Tests include concurrency, owner checks, request replay/conflict, unknown usage
across days, late settlement, unscoped diagnostic rejection, template parity and
single-pass interpolation. No provider API calls made (USD0).

Migration `20260921220000_rc4_paid_operations` applied only to the isolated RC4 DB.
No OAuth/payment credentials or public backend origin have been supplied yet.
G1 scientific-design comparison and G2-G6 are not accepted by these tests.
