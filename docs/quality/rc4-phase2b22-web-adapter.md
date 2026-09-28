# RC4 Phase 2B2.2: bounded web discovery adapter

Date: 2026-09-28. Code revision: `57bedf74d525c2d0696615b6242908af2c7de3b3`.

## Scope and offline result

Implemented a server-only `WebDiscoveryProvider` for a single material EvidenceGap,
using GPT-6 Astra, Responses, required `web_search`, strict JSON-schema output,
and an application-side tool-event cap. It creates candidate proposals only. A
candidate URL must match a public URL actually observed in a completed search
action for that operation. Other bibliographic/access fields remain proposals.
There is no project route, source-pool insertion, selection change, document
fetch, or real-project discovery in this gate. The project feature flag remains
disabled on staging.

The separate `astra-web-cost-policy.v1` reserves a conservative bound through
PaidOperation before dispatch (USD 2.50 ceiling), accounts for model usage and
recorded web tool events afterward, and retains uncertain usage after a transport
failure. The ordinary USD 0.25 pre-job ceiling is unchanged. Stable operation
identity prevents an automatic repeat charge.

Offline tests passed for observed-URL matching, model-only/unsafe URL rejection,
tool-use verification, one-item isolation, idempotency, uncertain usage,
cost-bound failure before dispatch, five disciplines, and unchanged scientific
source tables. The 2B2.1, 2C, relevant 2B1, SearchIntent, continuity, and B4
regressions passed. Typecheck, backend and worker builds, 24-trace Vercel
isolation check, and diff check passed. The production diff contains no fixture-
specific domain, country, title, DOI, candidate, or operation rule.

Staging app only was rebuilt from the clean pushed commit, not from the five
uncommitted G5 files. Image: `sha256:b10153d22d1b5731fb51bdaa4d02cfc5443580837351930aede078b866888793`.
App health was `healthy`; readiness returned HTTP 200. DB, worker, and proxy
were not restarted.

## One isolated compatibility smoke

The sole live operation used a public RFC Editor technical-record fixture, not
the real research project. The API accepted the `gpt-6-astra` Responses request
with low reasoning, required web search, included sources, and strict schema
configuration. The completed response reported one search action, 33 observed
source URLs, and usage of 9,362 input / 284 output tokens (36 reasoning tokens).
However, it contained **two `web_search_call` events** with `max_tool_calls=1`
requested. The application-side cap correctly returned
`INVALID_TOOL_PROVENANCE`; no candidate was accepted. Because validation stops at
that cap, the smoke does **not** establish JSON candidate-to-observation matching
or end-to-end structured-output success. Do not reinterpret the 33 observations
as accepted sources.

PaidOperation and its call settled as `COMPLETED`, with a conservative estimated
cost of USD 0.151225 including both observed tool events. This is an application
estimate, not an independently reconciled invoice. The pre/post scientific-state
hash matched: source pool and selection mutations were zero. Planner, OpenAlex,
Crossref, document, Deep Research, and real-project Astra calls were zero.

Compatibility status: **FAIL / not ready for 2B2.3**. The first task is a
read-only investigation of why the service emitted two web tool events despite
the requested cap and whether the documented control counts search actions or
all web events in this workflow. Do not make another paid call or relax the
application-side cap without a new explicit authorization and reviewed policy.
No workaround call was made.
