# Release 0 scientific acceptance

Date: 2026-09-18

Branch: `mvp/backend-core-clean`

Baseline: `ca6dc5293d9d0333c4ffca10f70ce5ef45d0b841`

Evaluation DB: isolated PostgreSQL 16 on a disposable `tmpfs` volume

## Verdict

`ENGINE_STATUS: BLOCKED`

`PUBLIC_RELEASE_STATUS: BLOCKED`

The canonical backend can execute intake through BlueprintVersion/DOCX and its
negative gate behaves correctly. It is not yet a scientifically defensible
release candidate: the quantitative case produced no semantic evidence, both
live DOCX samples contain clipped public text, and no selected PDF was
materialized. The fixes added after inspection prevent a future zero-evidence
run from passing coherence and prevent word-budget clipping, but the paid-run
limit did not permit regeneration. This is a technical and AI-assisted content
review, not human scientific peer review.

## Defects addressed

| Defect | Root cause | Change |
| --- | --- | --- |
| Five safe-suite failures | Four tests depended on deleted developer-specific artifacts; the methodological gate counted derived questions instead of declared questions | Added a small synthetic fixture/helper; preserved assertions; gate now compares declared objectives/questions; added valid qualitative and invalid-design regressions |
| OpenAlex discovery aborted | Complex Boolean requests exceeded the anonymous 1 request/second limit and any 429 aborted the whole search | Added anonymous complex-query throttling, one bounded 429 retry, and status/body diagnostics |
| Unbounded evaluation output/spend | Provider abstraction could not set a response cap; image calls bypassed the text budget | Added `maxOutputTokens`/`LLM_MAX_OUTPUT_TOKENS`; evaluation-only image-disable switch; missing provider usage is no longer recorded as zero |
| Retrieved content could influence instructions | Step 2/5/6 prompts did not explicitly classify retrieved material as untrusted | Added versioned v2 prompts with untrusted-content boundaries; no legacy-wide migration |
| Method gate false warning | Derived fallback questions masked a mismatch in declared questions/objectives | Declared counts now control the blocking rule; qualitative designs remain valid without statistical hypotheses |
| DOCX text clipped mid-sentence | Page-budget compaction truncated indivisible sentences and every bullet to 28 words | Future compaction preserves complete sentences and bullet items; dangling-fragment detection expanded; regression added |
| Zero evidence still passed coherence | `references_available` checked metadata rows, not inspectable evidence items | Added `inspectable_evidence_available`; zero evidence now makes Step 6 partial/failed coherence |
| Critical runtime advisories | Next 16.2.4 and its image/runtime dependencies were vulnerable | Updated Next to 16.3.3 and compatible transitives; audit moved from 9 issues including 1 critical to 4 issues, 0 critical |

No API model was changed. No public API was intentionally broken. Hero image
generation was disabled only for evaluation; the deterministic SVG path was
used.

## Checks executed

- Repository/branch/baseline: exact expected path and branch; baseline is HEAD
  and an ancestor; initial tree was clean.
- Offline scripts under Node 20.20.2 with network disabled: **39/39 passed**.
- Prisma validation under Node 20.20.2: passed.
- TypeScript `tsc --noEmit`: passed.
- Next 16.3.3 production build under Node 20.20.2: passed, with 10 existing
  dynamic-filesystem tracing warnings.
- OpenAlex regression: two complex queries issued consecutively completed
  `1/1` after throttling.
- DOI identity: all six selected DOI records resolved through Crossref and
  titles/years matched the ledgers.
- DOCX render: LibreOffice rendered engineering as 11 A4 pages and qualitative
  as 12 A4 pages; cover, middle and reference pages were visually inspected.
- Export continuity: each DOCX, BibTeX, RIS and evidence log derives from the
  same case-specific BlueprintVersion; `selectedReferences` and
  `referencesUsed` agree.
- `npm audit`: 4 remaining (3 high, 1 low, 0 critical). The high findings are
  Prisma CLI/`@prisma/config`/`deepmerge-ts` build-time exposure; npm proposes
  an incompatible Prisma downgrade. The low issue is `esbuild` through `tsx`.
  No forced upgrade was applied.

## Acceptance cases

### Quantitative engineering — FAIL

- Project: `553a625d-95dc-4b51-8b5b-095cdc80893a`
- BlueprintVersion: `dfd41bd5-ced4-4e1e-b652-800c0723a841`
- Technical execution: `PASS_WITH_LIMITATIONS` (Steps 2 and 5 partial; Step 6
  completed under the pre-fix coherence rule).
- Evidence integrity: `FAIL`.
- Methodological coherence: `PASS_WITH_LIMITATIONS`.
- Document/export integrity: `FAIL`.
- Three real DOI sources were selected, but all remained
  `ABSTRACT_METADATA`; PDF count and full-text chunk count were zero.
- All three structured Step 5 calls and their three JSON fallbacks reached the
  3,500-token evaluation ceiling. Semantic extraction count and evidence-item
  count were zero. Section drafts therefore used zero source IDs and zero
  citation anchors while clearly declaring the missing evidence.
- The proposal preserved the intended quantitative simulation topic and did
  not fabricate numerical results or real-building safety claims. Problem,
  comparison design and indicators are conceptually aligned, but objectives
  and table cells are visibly clipped in the live DOCX.
- The live coherence report's `references_available=3` was insufficient and
  falsely optimistic; the new evidence-item gate corrects future runs.

Artifacts:

- DOCX: `artifacts-local/release0-scientific-validation/engineering/release0-engineering-2026-09-18T17-15-31-591Z/engineering-thesis-plan.docx`
- Evidence ledger: `artifacts-local/release0-scientific-validation/engineering/release0-engineering-2026-09-18T17-15-31-591Z/evidence-ledger.json`
- Evidence log: `artifacts-local/release0-scientific-validation/engineering/release0-engineering-2026-09-18T17-15-31-591Z/evidence_log.json`
- BibTeX/RIS: same directory, `references.bib` and `references.ris`
- Case prompt record: same directory, `PROMPTS_USED.md`

### Qualitative education — PASS_WITH_LIMITATIONS, export FAIL

- Project: `4d1bdb89-f5a9-4062-9a4b-a12136fa2bc3`
- BlueprintVersion: `dfb80d2c-99b3-4235-a924-71630fd4d2f0`
- Technical execution: `PASS_WITH_LIMITATIONS` (the core path completed after
  an interrupted optional expansion was skipped).
- Evidence integrity: `PASS_WITH_LIMITATIONS`.
- Methodological coherence: `PASS_WITH_LIMITATIONS`.
- Document/export integrity: `FAIL`.
- Three real DOI sources yielded 19 evidence items, all explicitly
  abstract/metadata-only. The plan repeatedly prevents extrapolation to rural
  Peru and identifies the absence of Peru-specific evidence.
- Sections 3, 4, 8 and 9 preserve a qualitative interpretive case-study design:
  no statistical hypothesis, fixed sample size or presumed saturation; access,
  consent, ethics, region and institutions remain unresolved.
- One AI-feedback article is tangential to the non-AI topic. The draft labels
  it as comparative context, but source selection precision remains a quality
  limitation.
- Objectives and several table cells are visibly clipped in the live DOCX.
  The post-run compaction fix has offline coverage but was not regenerated.
- The first optional Step 4 expansion remained `RUNNING` until the disposable
  process was interrupted. This demonstrates missing bounded/recoverable job
  behavior; continuation reused the same project and its ten candidates.

Artifacts:

- DOCX: `artifacts-local/release0-scientific-validation/qualitative/release0-qualitative-2026-09-18T17-33-46-372Z/qualitative-thesis-plan.docx`
- Evidence ledger: `artifacts-local/release0-scientific-validation/qualitative/release0-qualitative-2026-09-18T17-33-46-372Z/evidence-ledger.json`
- Evidence log: `artifacts-local/release0-scientific-validation/qualitative/release0-qualitative-2026-09-18T17-33-46-372Z/evidence_log.json`
- BibTeX/RIS: same directory, `references.bib` and `references.ris`
- Case prompt record: same directory, `PROMPTS_USED.md`

### Insufficient/unsupported intake — PASS

- Project: `d2c81ca4-5b97-4b03-938d-23eb274dec42`
- Paid generation: none.
- Step 1 returned `partially_completed`, completeness 50/100,
  `ready_for_step_2=false`, and named four missing/short fields.
- Discovery and generation were not called; BlueprintVersion count remained
  zero. The engine did not present scientific success or fabricate a plan.
- Evidence: `artifacts-local/release0-scientific-validation/negative/release0-negative-2026-09-18T17-08-31-118Z/negative-result.json`

## Prompts, models, usage and duration

Complete templates, role arrangement, schema references, observed calls and
before/after prompt notes are recorded at:

`artifacts-local/release0-scientific-validation/PROMPTS_USED.md`

Actually used application models: `gpt-5.4-nano`, `gpt-5.4-mini`, `gpt-5.4`.
Configured models were retained. Responses API used strict JSON Schema where
configured, `store:false`, `max_output_tokens=3500` for evaluation and zero
transport retries. Provider-reported aggregate usage for this task was 53
calls, 203,958 input tokens, 44,800 cached input tokens, 86,673 output tokens
and 290,631 total tokens. Estimated cost was **USD 0.845482**, below USD 5.
Missing usage was not recorded as zero.

Backend Step duration, excluding human/frontend time and the interrupted
optional expansion: engineering 329,623 ms; qualitative 310,517 ms; negative
40 ms. Detailed evidence is in
`artifacts-local/release0-scientific-validation/ACCEPTANCE_RUN_SUMMARY.md`.

## Files intentionally changed

- Provider/budgeting: `llm/provider.ts`, `llm/providers/openai.ts`.
- Prompt versions/services: `server/mvp/prompts/step2-evidence-informed-refinement.v2.ts`,
  `step5-source-evidence-extraction.v2.ts`, `step6-section-draft.v2.ts`, and
  their Step 2/5/6 consumers/types.
- Scientific/export gates: `server/blueprint-v2/sections/consistency-matrix-engine.ts`,
  `server/mvp/step6-blueprint-docx-service.ts`.
- Retrieval: `server/retrieval/openalex-client.ts`.
- Reproducible tests/fixtures: five repaired test scripts,
  `scripts/fixtures/blueprint-engine/`, qualitative fixture, B1 runner and
  Step 6 release-readiness regression.
- Security dependency update: `package.json`, `package-lock.json`.
- This acceptance report.

## Unresolved release blockers

1. The latest generated engineering output has zero inspectable evidence; the
   evaluation cap and large extraction schema need a bounded configuration
   that completes reliably.
2. Source inspection is not invoked by the canonical Step 4 → Step 5 API path;
   both positive runs remained abstract/metadata-only despite available access
   signals.
3. The corrected evidence gate and text compactor have offline tests but no
   fresh live DOCX acceptance sample within the paid-run limit.
4. Authentication is not launch-safe: `imx_session` contains an unsigned raw
   user ID, and the session endpoint upserts/logs in any supplied email without
   verification. Ownership checks cannot compensate for a forgeable identity.
5. Production adoption remains unresolved: existing-DB migration strategy,
   durable artifact/run storage, bounded/recoverable jobs, and protection or
   exclusion of legacy/lab routes. The build also warns that dynamic filesystem
   access may over-trace project files into deployment bundles.

## Exactly one next action

Wire deterministic source inspection into the selected-source → Step 5 path,
then run one fresh bounded two-domain acceptance cycle with a Step 5-specific
output allowance and verify that the new evidence gate and non-clipping DOCX
behavior pass on actual artifacts.

`RECOMMENDED_CODEX_MODEL = gpt-5.6-sol`

`REASONING_EFFORT = high`

`REASON = The next action spans retrieval continuity, bounded execution, structured-output sizing, evidence semantics and rendered DOCX inspection; it needs strong cross-module reasoning without a broad redesign.`
