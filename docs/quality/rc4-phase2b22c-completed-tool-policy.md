# RC4 Phase 2B2.2c: completed web-tool calls and provenance

Scope: offline policy correction only. No Astra, web, OpenAlex, Crossref, PDF,
or Deep Research call was made. No project discovery or source insertion.

## Root cause and rule

The 2B2.2b diagnostic response echoed `max_tool_calls=1` and contained two
distinct final `web_search_call` output IDs: a completed `search` and a
non-completed `open_page` (`searching`). The adapter used the raw output-item
count for both acceptance and estimated billing, so it rejected the response
before parsing Structured Output. A second output item was not evidence of a
second completed/processed call.

The adapter now records raw output items, unique ID attempts, and unique IDs
whose **final observed status** is `completed`. Only the last status per ID
governs acceptance and provenance. Acceptance compares completed unique calls
to the configured cap. An echoed `response.max_tool_calls`, when present, must
match the configured cap; a mismatch or a completed-call excess rejects the
operation. An item without a usable ID also rejects safely. Unknown-status
attempts remain visible in diagnostics but do not acquire completed status by
inference.

Only completed `search` calls contribute URL observations. URLs attached to
non-completed or unknown-status output items cannot ground a candidate, even
if the same URL is also present in a completed observation. No model-only URL
is admitted. Non-completed attempts remain in the private response trace.

The legacy `toolCallCount` and future estimated billable count still use raw
output items. Actual provider web-tool billing is not exposed by this response,
so this is deliberately conservative. The reservation ceiling, pricing policy,
PaidOperation settlement calculation and historical records were not changed.
The diagnostic shape is `web-discovery-diagnostic.v2`; the proposal wire/schema
and scientific admission policy are unchanged. Earlier v1 traces remain
readable and are not rewritten.

## Historical trace replay

The private PaidOperation for the 2B2.2b smoke was read without mutation.
The sanitized persisted final-item trace yields raw=2, unique attempts=2,
completed unique=1; the revised tool-limit check passes. The first completed
search owns the usable observations; the second, searching `open_page` owns
none. Its search item announced 33 sources, of which 31 had accepted URL
observations in the persisted trace. The historical estimated settlement
remains two raw tool items / 150438 micros. The trace does **not** preserve the
missing Structured Output payload; this replay proves tool-limit/provenance
semantics only, not candidate validation or end-to-end compatibility.

## Verification and boundary

Offline fixtures cover 1/1/1; 2/2/1; 2/2/2; duplicate IDs; completed search
plus searching or completed open-page; unknown status; absent/foreign/overlapping
provenance; echoed-limit consistency; and separate acceptance/billing counts.
An isolated PaidOperation fixture proves that the 2/2/1 case reaches Structured
Output parsing while preserving a two-item conservative cost estimate. Tests
for 2B2.2a, 2B2.2, 2B2.1, B4/pre-job, G4 auth, SearchIntent, 2C, G2 and evidence
integrity passed. Typecheck, backend build, worker build, 24-trace Vercel
isolation and diff check passed. The backend build retained two pre-existing
Turbopack broad-path warnings in source-selection-service.

Production changes contain no fixture-specific scientific, geographic, DOI,
response-ID, or RFC branch. Five unrelated G5 worktree changes were not included.
The staging project web-discovery feature remains disabled. The next step is a
separately authorized compatibility acceptance; this gate does not start 2B2.3.
