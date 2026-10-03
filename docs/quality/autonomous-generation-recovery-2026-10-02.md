# Autonomous generation: staging recovery and budget audit (2026-10-02)

## Current handoff — 2026-10-03 UTC

**NOT_CLOSED. PR #16 stays draft; main and production are unchanged.**
The integrated support path ran on the technical staging account, acquired a
methodological guideline, and reached the evidence-aware patch dispatch. The
provider returned `credit_balance_exhausted` on a durable response, with no usage
or output. The USD 0.283325 reservation remains unknown. No second job was started.
See the current matrix and cost account below; earlier USD 2 and disconnected
mini-research descriptions are historical findings, not current policy/state.

## Historical scope and outcome

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

The current Design Mini Research integration cannot close this gap as written:
`resolveAutonomousDesignBundle` leaves `researchSupport` unused, while
`designSupportGaps` only selects first-critic **BLOCKING** method findings;
the methodological-support finding here was a **WARNING** that the targeted
critic later found unsupported. The discovery service currently verifies
observed bibliographic metadata and abstracts, which are leads rather than
inspectable substantive evidence. A safe repair must classify this targeted
critic outcome, obtain/prepare genuine methodological evidence within the
existing budget and provenance rules, and rerun the independent review from
a versioned checkpoint. It must never promote metadata alone as proof.

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


## Integrated scientific closure — verified state, 2026-10-03 UTC

### Causal acceptance record

Technical project `a0700f50-e3b5-4213-a9da-7f71243c12c1`, job
`4a9d3189-4d48-4ed7-a3e3-5fa115784d8c`, separate from every owner incident.
Source search returned 10 CORE and 10 EXPLORATORY candidates; three CORE works
were explicitly selected. The confirmed scope was not changed during recovery.

| Problem | Proven cause | Change and evidence | Live limit |
| --- | --- | --- | --- |
| Methodological support disconnected | Initial warning/final evidence rejection had no substantive recovery path | Explicit gap contract, resolver invocation, immutable support addendum, shared evidence ledger, evidence-aware patch and critic; DB/offline regressions pass | Real discovery and acquisition executed; final scientific validation is pending |
| Document fetch fails immediately | Node 24 asks pinned DNS lookup for `all=true`; callback returned one string (`ERR_INVALID_IP_ADDRESS`) | Reproduced in staging runtime; both lookup shapes now retain the validated public IP; same observed guideline yields 12 passages | One publisher denies access; another candidate reaches redirect limit; neither is admitted |
| Operational caveat treated as scope change | Text mentioning future scope review overrode independent structured `PRESERVED`/no-confirmation finding | Structured scope authority preserved; immutable scope and independent critic still required; regression passes | Evidence-aware repair reached provider, no scientific output yet |
| Generic final provider failure | Background terminal error omitted provider error code | Safe code retained, nonretryable funding category, terminal replay cannot create/poll again; DB test passes | Historical failure remains intact, independently read response proves funding error |
| Duplicate Spanish title | Work-level language/translation also paraphrased an already Spanish title | Conservative title-level presentation check; canonical metadata/cache unchanged | Verified on mounted Sources card in staging |
| Browser PDF transfer | Staging backend returned loopback upload URL; local Tailscale resolution also needs Chromium local-network permission | Staging public HTTPS upload origin corrected; normal browser permission granted to staging only | Real benign PDF upload/remove passed; historical PDF unavailable |

Timeline: source search and selection → enqueue (23:30 UTC) → evidence → selector
→ independent first critic → automatic Design Mini Research (one paid operation)
→ document transport failure → explicit authenticated versioned recovery,
reusing selector/critic/discovery → acquired guideline → scope-classification
failure → corrected continuation → evidence-aware patch response failed
(23:55 UTC). Attempts are now 3/3. No counter was reset and no paid response was
repeated. The acquired support checkpoint is retained, as are earlier failures.
The final response was read with `responses.retrieve`, never recreated:
`resp_03ee7ad2bc0f7642006ac04470f13487d298299c7599822066`, status `failed`, error
`credit_balance_exhausted`, usage null, output empty. Usage recovery, scientific
patch, subsequent critic, composition and real DOCX did **not** complete.

### Evidence and safety

Support source: observed open-access PRISMA-S guideline, acquired from Springer
Nature through pinned-DNS/redirect controls, original SHA-256 and private file,
12 located HTML passages. This is inspected text, not a claim that its support
has passed the scientific critic. The first provider finding specifically needed
methodological support beyond the selected abstracts. Passage ranking uses the
observed title as well as the gap, with procedural passages prioritized; lexical
matches never certify evidence. Metadata-only candidates remain excluded.

The addendum is owner/project/job/definition scoped. The frozen user EvidenceSet
and original source selection are unchanged. Offline tests show the same derived
context reaches patch, critic, composition and bibliography and reject other-job
pointers. These contracts are **not** a live DOCX acceptance.

Astra produced two distinct completed web calls. Three raw web output items are
conservatively counted for estimated billing; these are different metrics. The
same paid discovery result was reused in both technical recoveries. No second
mini-research operation or complete acceptance job was started.

### Requirement matrix

| ID | Implemented | Offline | Provider | Browser | Published to production |
| --- | --- | --- | --- | --- | --- |
| R01 Search/recovery | Preserved | Reliability six-domain/long-object/failed-operation PASS | Technical search PASS | Sources reached | Prior implementation only |
| R02 CORE/EXPLORATORY/Astra | Preserved | Sufficiency and DB PASS | Standard retrieval PASS; design Astra separate PASS | CORE visible, selected 3 | Existing effective flags ON; new changes NO |
| R03 Selection/counts | Preserved | 0–3 saves/idempotency PASS | Not required | Three selected, sidebar coherent, retained across refresh/navigation | New candidate NO |
| R04 Translation/HTML/JATS | Preserved + Spanish-title dedup | Safe text/title checks PASS | Cached translations displayed; later background batch failed without usage | Original + Spanish secondary, Spanish abstract, no visible JATS/entity markers, selected state retained | New candidate NO |
| R05 Internal evidence/CTA | Preserved | Generation contracts PASS | Evidence stage completed | One CTA, no preparation rows, internal account copy | New candidate NO |
| R06 No post-Sources questions | Implemented | Resolver/B4 PASS | Zero questions through stopped job | No design-approval step reached | New candidate NO; complete path unverified |
| R07 Method support | Implemented | Initial/late gaps, scope, pointers, immutable context PASS | Discovery/acquisition PASS; patch funding failure | Not applicable | NO |
| R08 Recovery/accounting | Implemented | Background/reconciliation/concurrency/QA PASS | Same job/checkpoints reused; unknown held | Authenticated resume API | NO |
| R09 Internal no-package | Preserved | Ownership/internal authorization PASS | Enqueue/evidence/design allowed without package | Internal authorization message | Existing capability only; settlement/download incomplete |
| R10 Taxonomy/ideas/chat | Preserved | FORD 50/6, three ideas, provenance/confirmation PASS | No new idea LLM call | Existing refinement control visible; full idea/chat workflow not repeated | Existing only |
| R11 Isolation | Preserved | Ownership, user isolation, addendum and response isolation PASS | No owner work used | A→B→A, two tabs, reload/back PASS; separate-user browser not performed | New candidate NO |
| R12 PDF/DOCX | Private transfer preserved | Storage/limits/ownership PASS | No inference required for benign upload | PDF upload/remove PASS, 360px no overflow | Historical PDF PENDING_EXACT_FILE; real DOCX/download NOT_RUN |
| R13 Publication | Prepared, blocked by scientific gate | Builds/TypeScript/bundle/diff checks PASS | Not applicable | Staging candidate only | NO merge/deployment/backup in this task |

### QA authorization and cost

Campaign `scientific-closure-qa-20261002`, existing authenticated technical user,
expires **2026-10-04T00:00:00Z**, USD 10 additional total commitment, USD 5/job,
maximum two jobs. One job used. Ordinary internal policy remains target 2 / soft
2.50 / hard 3; commercial packages and historical policies are unchanged.

Known additional estimated cost: **USD 1.01609705**. New unknown reserve:
**USD 0.47744000**. Total additional commitment: **USD 1.49353705**.
Remaining QA authorization: **USD 8.50646295**. The job itself has known
USD 0.96625105 + unknown USD 0.283325 = USD 1.24957605. Historical USD 0.41215
and USD 0.94293750 remain untouched and excluded only from the *additional QA*
figure, not cleared from their original policies/ledgers.

Input tokens 69,444; cached input subset 3,584;
output 30,971; reasoning subset 9,626;
total input+output 100,415. These cover calls with returned usage;
unknown response tokens are not invented. Reasoning/cached subsets are not added
twice. Nested Astra job/PaidOperation records are deduplicated.

| Stage/model | Known estimated USD | Unknown reserved USD |
| --- | ---: | ---: |
| EVIDENCE / gpt-5.4-mini-2026-03-17 | 0.0147885 | 0.00000000 |
| EVIDENCE / gpt-5.4-mini-2026-03-17 | 0.0147579 | 0.00000000 |
| EVIDENCE / gpt-5.4-mini-2026-03-17 | 0.01510215 | 0.00000000 |
| DESIGN_SELECTOR_0 / gpt-6-astra | 0.3707375 | 0.00000000 |
| DESIGN_CRITIC_0_RESPONSE / gpt-5.6-sol | 0.15569 | 0.00000000 |
| DESIGN_MINI_RESEARCH_V2_1 / gpt-6-astra | 0.3951750000000001 | 0.00000000 |
| AUTONOMOUS_DESIGN_PATCH_EVIDENCE_1 / gpt-6-astra | unknown | 0.28332500 |
| REFERENCE_DISPLAY language detection / gpt-5.4 | unknown | 0.06999500 |
| REFERENCE_DISPLAY text fallback / gpt-5.4 | unknown | 0.06206000 |
| REFERENCE_DISPLAY legacy text retry / gpt-5.4 | unknown | 0.06206000 |
| SOURCE_SUFFICIENCY / gpt-5.4-nano-2026-03-17 | 0.002235 | 0.00000000 |
| SOURCE_SUFFICIENCY / gpt-5.4-mini-2026-03-17 | 0.001393 | 0.00000000 |
| SOURCE_SUFFICIENCY / gpt-5.4-mini-2026-03-17 | 0.041316 | 0.00000000 |
| SOURCE_SUFFICIENCY / gpt-5.4-mini-2026-03-17 | 0.004902 | 0.00000000 |

Astra's known estimate includes USD 0.03 of conservatively counted tool costs.
These are estimates from provider usage and versioned prices, not invoices.
Ordinary USD 3 full-document compatibility is still **unverified**: no completed
scientific document exists in this run. The blocker is provider balance, not the remaining QA authorization. No second
full job was started. A queued display-translation job, triggered while checking
Sources, subsequently exposed a separate legacy defect: any structured failure
entered a text fallback, and transient classification repeated that text call.
It left three unknown reservations (0.069995, 0.062060, 0.062060; total 0.194115).
They remain fully reserved. The corrected contract permits text fallback only
for a completed, accounted structured-JSON parse failure. Funding, transport,
unattributed parse/schema failures cannot trigger it. A failed foreground
dispatch is marked usage-uncertain and cannot be retried automatically. Offline
regressions verify both structured and text dispatch counts; no live call was
made to test this guard after funding exhaustion.

### Additional regression: provider failure cannot change output mode

A reference display worker batch failed after the provider balance was exhausted.
The old wrapper incorrectly treated this as structured-output trouble and tried
a second output mode. The fix propagates the original error unless parsing a
completed response with known usage genuinely failed. Foreground transport
exceptions retain their original cause and an explicit uncertainty marker, so a
transient error classification alone cannot authorize another create. Terminal
background failures return the stored cause; separate late reconciliation remains
available. All three added unknown reservations are retained, never rewritten.

### Deployment inventory and handoff

- Runtime code commit: `279ab80876083dbd29a72ea2eb7da33919948551`.
- PR #16 remains draft on `fix/autonomous-recovery-20261002`.
- Main remains `a396451af8c0c1b5a3b51567db4ac990ef2517dd`.
- Staging app/worker: `imx-rc4-method-support:qa7`, both digest
  `sha256:6ec86d857b9c5e03a62417fd002aea6db49195ef68f5f413abf67b1ee299c5aa`.
  The real run used qa2 → qa3 → qa5; qa7 adds tested causal error persistence and guards against uncertain foreground/text-mode retries,
  no new paid run. Do not claim qa7 has a completed live E2E.
- Staging frontend deployment `8kXbgah2aCFPCo8wgY2yjT79GR1u`, URL
  `ingeniometrix-fplfdws80-josmavel-clouds-projects.vercel.app`, aliased normally
  to staging. Frontend source remains compatible with qa7 backend responses.
- Additive migration `20261002190000_qa_acceptance_campaign` applied/rehearsed in
  isolated DB and staging. It is **not** applied to production.
- Effective app **and** worker, staging and production: Sources Astra=ON,
  automatic minimum fallback=ON, Design Mini Research=ON, full Deep Research=OFF,
  authless workspace=OFF. Production payments remain disabled. Flags are not E2E.
- Production remains `imx-rc4-autonomous:fdb85af`, digest
  `sha256:0bd478cf31a0fdf21cc752ac423b19073e1b6e45e4e3289d41818981a738a951`.
  Public web/readiness 200 observed; no new production scientific smoke claimed.
- Staging deployment includes `docker-compose.source-sufficiency-staging.yml`
  and explicit public HTTPS `UPLOAD_ORIGIN` in app/worker. Do not accidentally
  revert to `.env.g5-staging`'s loopback upload origin when redeploying.
- Private QA evidence/logs/screenshots are under `/tmp/imx-*` in this host and
  technical artifacts under the staging private operations/design-support volume.
  Never commit credentials, storage state, provider output or source documents.

External prerequisite: restore provider API funding. Then recalculate all
aggregate budgets, respecting unknown reservations and campaign expiry. This
job has exhausted its attempts and a terminal provider failure: do not reset it.
Use the remaining authorized second technical job only after confirming funding,
with the same technical account and normal authentication; do not copy checkpoints
between projects as if generated there. Inspect the support before dispatch and
retain the existing discovery/diagnostic artifacts as evidence, not fake outputs.

Remaining scientific gates: repaired design, independent targeted critic,
composition/review, real DOCX and authorized download, editorial/visual review.
Only then: encrypted canonical production backup and integrity check; active-job
inventory/drain; additive migration; compatible tested backend/worker; normal
PR checks/merge; Vercel Production; authenticated ownership/download/flags smoke.
Use the production runbook's exact backup/restore commands. Roll back runtime to
the captured production digest/frontend while retaining additive tables and all
immutable data; never clear usage or restart owner jobs as a deployment effect.
No backup or production mutation is necessary while this release gate is blocked.

Owner scientific projects, historical uncertain usage and original G5 worktree
remain untouched. No full Deep Research, customer pricing change, real payment,
new account, auth bypass or scientific scope expansion was introduced.
