# Autonomous generation: staging recovery and budget audit (2026-10-02)

## Scope and outcome

The technical staging project `1427241c-d2b0-437d-a794-6ca69c575295` ran job
`02777909-d929-4b22-a753-20573b31feca` (`secure-pilot-02777909-d929-4b22-a753-20573b31feca`)
on the `fdb85af` app/worker image. This is separate from the owner's production
job `67f5dd0d-b451-4248-b973-f30141b82a63`, which remains untouched in
`WAITING_USER_DECISION`.

The staging job completed evidence extraction, selector and first independent
critic. The first autonomous design revision used foreground Responses with
`store:false`. It was dispatched once, then produced no response, usage or
`response_id` in the local records. The reservation became
`failed_unknown_usage`. The foreground timeout default was 120 seconds; the
observed interval was about 120 seconds. The exact SDK exception was not
persisted, so a timeout is strongly indicated but not proven from a saved
exception. The foreground retry policy allowed a second attempt. Its
reservation was rejected before another provider dispatch. That budget error
overwrote the first cause in the checkpoint and job error.

There is no recorded identifier with which to retrieve the old response. Its
usage cannot be attributed from an aggregate invoice. The reservation remains
uncertain; no scientific output was recovered or validated. No attempt was
made to rerun this paid call or the owner's job.

## Exact saved budget equation

| Quantity | USD |
| --- | ---: |
| Five completed calls, estimated from returned usage | 0.46472755 |
| First autonomous revision, unknown usage reservation | 0.94293750 |
| Committed before attempted retry | 1.40766505 |
| Maximum requested by attempted retry | 0.94293750 |
| Mandatory remaining reserve | 0.25000000 |
| Required by retry guard | **2.60060255** |
| Saved hard cap and commercial cap | **2.00000000** |
| Unallocated headroom before retry | 0.59233495 |

The commercial and job guards evaluate the same job entries against separate
USD 2 caps; the records are not added together. The application process cap
was not configured for this staging worker. The source-sufficiency and
translation PaidOperations are separate pre-job operations and are not added
to this job's `control:cost` record. The attempted retry has no second cost
entry, confirming rejection before dispatch.

## Complete-path reservation feasibility

For this reviewed design, the revision's saved maximum is USD 0.94293750. A
post-revision independent critic allows 8192 output tokens on gpt-5.6-sol:
USD 0.16384 of output reservation before input. The mandatory compact
scientific composition uses four 4500-token phases, one 6500-token phase, one
3500-token review, one 1500-token title and one 5000-token matrix on gpt-5.4:
USD 0.51750 of output reservation before input. Thus even **without** another
revision call, the existing known plus uncertain amount, those mandatory
output reservations and USD 0.25 remaining reserve total USD 2.33900505.
Actual costs may be lower than maxima, but a full-chain hard reservation cannot
be promised under the saved USD 2 cap. Optional mini web research and document
presentation can only add cost. A new paid acceptance must not start until a
versioned, scientifically evaluated lower-cost route and complete-path preflight
fit the same cap; neither a fresh account nor resetting the old reservation is
an acceptable workaround.

## Scoped repair prepared on the feature branch

- Job-scoped foreground structured calls no longer retry an uncertain dispatch.
- Autonomous revision and independent critic use the existing durable
  background response/checkpoint transport when available. It persists the
  response ID and retrieves the same response without `responses.create` again.
- A late background response can record provider usage after job closure and
  reconcile one reservation transactionally. It verifies job, logical attempt,
  response ID, request fingerprint, model and usage, writes an audit event,
  rejects contradictory repeats, and never reopens the job.
- An operator-only retrieval script issues `responses.retrieve` for a previously
  saved ID; it does not create a new response or print scientific output.
- Isolated DB tests cover one foreground dispatch on timeout, background
  restart, terminal-state late reconciliation, duplicate/concurrent evidence,
  contradictory evidence and same-account cross-project isolation.

The old staging call had no saved response ID, so this mechanism cannot
reconcile it. The prepared repair has **not** been deployed or accepted as a
complete production correction. A successful real staging plan and authorized
DOCX download remain required before promotion.

The existing selector already uses `background:true, store:true`. Extending
that transport to critic and revision also extends provider-side response
retention for those inputs. [OpenAI's background guide](https://developers.openai.com/api/docs/guides/background)
documents temporary polling storage with `store:false` and longer retention
when `store:true` is explicit. The pilot privacy page does not promise a fixed
provider retention term. Review that exposure before deployment; the prepared
branch does not silently turn it into an accepted production policy.

## MVP closure attempt on PR #16 (2026-10-02)

The USD 2 feasibility restriction above describes the **historical** job and
its saved policy. PR #16 now snapshots `internal-generation-pilot.v2` for new
internal jobs only: target USD 2, soft warning USD 2.50, hard USD 3. Customer
packages and the historical job are unchanged. Exact Responses input-token
counts are used when available, with explicit estimate provenance otherwise.

One new staging technical project, `7daf49f2-8bd4-4c03-af74-5c11e08a4b00`,
used normal authenticated access and an audited staging-only internal
generation grant. Its job `0fe8b5ad-4e0d-48ba-9336-15634a58abf4` reached
evidence extraction, selector and the first independent critic. Three selected
CORE sources and the frozen EvidenceSet were retained across every attempt.
Neither this project nor its job is the owner's production project.

The first resolution failed because an operational coverage question was
treated as a confirmed-scope conflict. A versioned classifier correction
allowed a compact repair. Responses then rejected the v1 strict JSON schema
with HTTP 400 because `samplingSelection` was optional in `required`; the
response had no ID. Its USD 0.41215 reservation remains **unknown**. A v2
required-nullable schema produced a saved response, but the patch still asked
for a post-Sources user approval and left a blocking scope finding. The v3
prompt replaced that request with conservative coverage and future validation
requirements. The saved v3 patch resolved scope but left documentary access
unverified. Its independent targeted critic was run once from the saved patch
under a versioned v2 contract. It accepted the conditional access deferral but
reported `evidenceSupported=false`: direct methodological support remains
insufficient. The job therefore stopped at `resolving_design`. No composition,
scientific review, DOCX or authorized download occurred.

| Known staging job usage | Value |
| --- | ---: |
| Input tokens | 31,693 |
| Cached input tokens (subset of input) | 3,584 |
| Output tokens | 24,075 |
| Reasoning tokens (subset of output) | 7,666 |
| Estimated known cost | USD 0.82798130 |
| Unknown reservation retained | USD 0.41215000 |
| Known plus reserved | USD 1.24013130 |

The real scientific gate remains open: targeted Design Mini Research must find
inspectable methodological support, or the plan must state an honest limitation
without claiming an unsupported method. That path needs a separate bounded
implementation and staging acceptance. The same job has exhausted its audited
recovery attempts; it must not be replayed blindly or have its unknown
reservation cleared. PR #16 remains draft, `main` and production remain
unchanged. **Staging health and offline fixtures are not a complete E2E PASS.**
