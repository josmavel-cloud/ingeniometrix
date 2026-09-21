# RC4 G1b: approval-bound scientific design

Status: IMPLEMENTED / OFFLINE VALIDATED; scientific improvement NOT YET VERIFIED.
RC3 is unchanged. No paid calls, production migrations or deployment.

## Production sequence

`POST /api/projects/:id/blueprints` marks new jobs `scientificProfile=rc4`.
The existing worker completes Step 5, proposes a design, then persists
`WAITING_USER_DECISION`. Polling and worker acquisition cannot progress this state.
Owned GET/POST/PATCH `/scientific-design` reads, approves or explicitly revises it.
Approval is bound to the decision, intake/evidence hash and academic level.
Scope changes require an affirmative checkbox. Concurrent approval is idempotent.

After approval, drafting consumes the fixed questions/objectives/ResearchDesign;
it does not pay to generate those objects again. Narrative contradictions block
instead of overriding the approved definition. Matrix and scientific review remain
the existing canonical implementations. Existing RC3 jobs retain their old path.

Revising saved constraints is explicit and bounded to two user-requested input
revisions per job, separate from one model repair per proposal. It keeps the same
cost ledger and cumulative failure count; old checkpoints are archived, not deleted.
Because existing Step 5 extraction is intake-dependent, changed intake invalidates
that extraction and its descendants conservatively. A replay never schedules twice.
This is not an unlimited free retry. A presentation failure cannot enter this path.

## Contracts and provenance

| Record | Producer | Consumer | Retention |
| --- | --- | --- | --- |
| ResearchIntentContract | Deterministic intake adapter | Selector/critic, user approval | Private job checkpoint |
| MethodEvidencePack | Inspectable ledger items; explicit budget exclusions | Selector/critic | Private job checkpoint |
| DESIGN_SELECTOR_0/1 | Astra, strict schema | Independent critic | Private checkpoint |
| DESIGN_CRITIC_0/1 | Sol, eight review dimensions | Approval eligibility | Private checkpoint |
| SCIENTIFIC_DECISION | Bounded selector/critic coordinator | Owned approval UI | Private checkpoint |
| approval:SCIENTIFIC_DESIGN | Explicit authenticated user decision | Scientific drafting | Private authoritative record |
| control:design-revisions | Explicit changed-input request | Re-entry bound/idempotency | Audit and control, not orphan |
| archive:design-revision-* | Invalidation | Investigation/history | Audit-only, MONITOR retention |
| approved-scientific-design.json | Drafting | Reproduction/diagnostics | Private audit copy, not independent authority |

Mixed methods requires qualitative and quantitative components plus integration.
The evidence pack includes only verified excerpts, with intact source/evidence IDs.
Missing method support and insufficient coverage block; metadata does not become
methodological evidence. The critic must report all eight dimensions; passing this
schema is not proof of scientific validity.

## Prompts, actual request and cost

Full final templates and schemas are linked here, not duplicated:

| Purpose | Template | Model / reasoning | Output ceiling |
| --- | --- | --- | --- |
| Select up to three viable alternatives | [selector v1](../../server/mvp/prompts/scientific-design-selector.v1.ts) | gpt-6-astra / high | 8192 tokens |
| Independent critical review | [critic v1](../../server/mvp/prompts/scientific-design-critic.v1.ts) | gpt-5.6-sol / high | 4096 tokens |
| Draft using approved objects | [approved-plan v1](../../server/mvp/prompts/scientific-plan-approved.v1.ts) | Existing gpt-5.4 configuration | Existing per-phase B4 limits |

Selector/critic schemas: [contracts](../../server/mvp/scientific-decision-contracts.ts).
Actual arrangement is one concatenated Responses `input`, not invented separate
system/user roles; strict JSON schema, `store=false`, `reasoning.effort=high`.
No temperature/top_p. Context over 60000 UTF-8 bytes fails without silent clipping.
Every dispatched attempt reserves through the existing persistent job ledger.
At most selector+critic and one repair+critic; transient provider retries remain
bounded and separately reserved. USD2 job ceiling remains unchanged.

Official documentation checked 2026-09-21:
[Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol).
Rates per million input/cached/output tokens: Astra 10/1/50; Sol 4/0.4/20.
Bounds include potential cache-write premium and long-context pricing. Usage USD
is conservative estimated spend, not a provider invoice. Actual account access,
response quality and completion within the job cap have NOT been live-validated.
OpenAI Docs guided supported parameters and bounded pricing; no drafting downgrade.

## Verification and remaining gate

52/52 offline suites passed, including RC3/B4 and the new scientific-decision suite.
New tests cover insufficient evidence before calls, mixed-method integration,
evidence pointers, max one repair, worker pause, cross-user rejection, concurrent
approval, changed-input rejection/revision, preserved cost and approved-object reuse.
They use synthetic provider output and do NOT establish scientific improvement.

G1 remains PARTIAL until frozen-corpus comparative evaluation and real API checks.
G2 follow-up adds mutable draft revisions and immutable worker inputs; see
[G2a](rc4-g2-drafts-snapshots.md). Scientific evaluation remains separate.
No current document is claimed to satisfy the new compact RC4 profile yet.
