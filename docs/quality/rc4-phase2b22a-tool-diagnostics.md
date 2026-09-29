# RC4 2B2.2a: web-tool diagnostic instrumentation

Date: 2026-09-28. Scope: instrumentation only; no new provider operation.

The preceding one-call smoke persisted a raw web-output-item count of two and
one completed search action, but not the final output items or wire request.
That evidence cannot distinguish a second processed call from an incomplete,
duplicate-ID, or non-search item. The previous failure and the application-side
tool cap remain unchanged.

The adapter now writes an allowlisted diagnostic into the owner-scoped private
`PaidOperation.resultJson` **before** `responses.create`, using the same params
object passed to the SDK. It records model, `max_tool_calls`, tool choice/types,
external-web flag, include fields, presence/value of stream, reasoning effort,
output limit, and policy/schema versions. `stream: null` means the field was
omitted from the application params; it does not claim a captured HTTP request.
No prompt, research context, header, credential, cookie, or environment value
is recorded.

On a returned response it records the response ID/status, an echoed
`max_tool_calls` if present, safe incomplete reason, and each final
`web_search_call` output index, ID, status, action, optional safe smoke query,
and source count. Raw item count, unique IDs, completed items, and action-type
counts are separate. Completed-search observations retain source index and
tool-call linkage. Query-bearing URLs and project research queries are omitted
from the additional diagnostic trace. The existing candidate/source result
contract and application-side rejection policy are unchanged.

The settlement trace records the **existing** raw item count used for
PaidOperation, model token counts, and separate estimated model/tool/total
costs. Provider-invoiced cost remains unknown. There is no filesystem-backed
diagnostic artifact; 0600 permissions are therefore not applicable. A trace
write failure cannot cause an unaccounted provider call: the request trace
must persist before dispatch, and a response trace failure is followed by
normal cost settlement before surfacing the error.

Offline fixtures cover one or two final items, same/different IDs, completed,
searching and failed states, search/open/find actions, 33 sources under one
call, echoed/absent response limit, redaction, and PaidOperation persistence.
The excess-item fixture still returns `INVALID_TOOL_PROVENANCE` and settles the
same two-item estimate. No Reference or ProjectReference mutation occurs.

2B2.2a, 2B2.2, 2B2.1, pre-job/B4, G4 auth, G2, SearchIntent, 2C, and evidence
continuity tests passed offline. Typecheck, backend and worker builds, and
24-trace Vercel boundary check passed. The two unchanged Turbopack warnings
about broad artifact paths in source-selection-service remain. Production
instrumentation contains no fixture-specific scientific or project terms.

Code revision `b967e9f` (diagnostics and tests) was deployed to the staging app
from a clean worktree. Image: `sha256:603edad99e5904a05644093d63d2e0400923d331a4a1af13b286a9416b859bbc`.
The app was healthy and readiness returned HTTP 200; DB, worker, and proxy
were not restarted. The five uncommitted G5 files were excluded from the image.

The one-off smoke fixture now uses a new versioned gap-set identity. Without
that change, PaidOperation would correctly replay the previous completed
invalid result and could not capture new diagnostics. This does not change
idempotency policy and does not execute a smoke.

Next: one **separately authorized** diagnostic compatibility smoke. No policy,
counter, cost, acceptance, source-pool, or scientific change is approved by
this instrumentation. The historical response cannot be reconstructed from
the new trace.
