# RC4 Phase 1: conversational academic intake

## Authority and scope

`ProjectDraft.contentJson.researchDefinition` is the only mutable definition.
`Intake.confirmedDefinitionJson` is the last explicit confirmed snapshot; its
legacy string projection is generated in the same transaction. `IntakeTurn` is
bounded input/proposal history, not replay-based authority. Completed, failed and
stale turns cannot be updated. No legacy record is backfilled or reinterpreted.
Historical URLs/editor remain usable; new projects use three visible stages.

`Project.program` is nullable because the old create UI supplied a fictitious
default program. Existing non-null values are unchanged. Compatibility consumers
serialize absent program as empty text rather than an invented academic program.
This is not a scientific-design or document-policy change.

Each field records origin, acceptance, knowledge, source message IDs, revision and
optional interpretation confidence. User acceptance never erases AI provenance.
Unknown and not-applicable have empty values. Operational country is not a
scientific-context fallback. Original idea is immutable. Legacy intake readers
stay compatible; new definitions reject old direct-intake mutation paths.

## API and producer/consumer contracts

| Contract | Producer | Consumer | Authority |
| --- | --- | --- | --- |
| POST projects, intakeMode=conversation | idea + explicitly selected level + UUID requestId | stable project URL | deterministic, no model, owner-scoped idempotency |
| GET projects/:id/definition | stored ProjectDraft and bounded turns | conversation and live panel | observational, owner-only |
| PUT definition | explicit field edit / accept / reject / resolve | revisioned draft | requestId + baseRevision + ETag; project row lock |
| POST definition (message) | user message, model proposal contract | pending proposals | one bounded PaidOperation, no canonical Intake write |
| POST definition (confirm) | explicit revision + definition hash | Intake projection, structured snapshot, audit | owner and current revision/hash atomically checked |
| GET definition?view=search-intent | confirmed Intake only | Phase 2 integration / inspection | rejects unconfirmed current edits; no retrieval calls |

An action replay returns current authority, not an old state over newer edits.
A lost model response reuses its requestId; RUNNING never creates another call.
Process interruption can leave RUNNING for operator review: no speculative paid
recovery. Failed/stale turns remain visible and manual editing stays available.
There are at most 12 model turns and 200 total input/action turns per project.

Readiness explains missing topic/object/concepts and explicitly blocking
ambiguities. Method, theory, university, sample size and dataset are not required
for search. Scientific-design readiness always requires the separate evidence/G1
review. Search-route change is only a confirmation precondition; its query planner,
provider calls, translation, ranking and admission are unchanged.

## Model governance

Prompt: `server/projects/prompts/conversational-intake.v2.ts`, ID
`conversational-academic-intake`, version `2.0.0`.
Input: current definition and at most 12 recent owner inputs; max serialized
context 100 KB. Output: strict `intake-turn.v1`, one question, up to 8 proposals,
up to 3 ambiguities. Reject unauthorized fields, foreign input references, repeated
rejected proposals, invalid knowledge/value pairs and old base revisions.

`intake-model-policy.ts`: default gpt-5.4-mini / low / 3000 output tokens.
Config: IMX_INTAKE_MODEL, IMX_INTAKE_REASONING (low/medium). No automatic escalation.
Existing B4 cost bounds reject unpriced models and reserve full configured output
ceiling plus conservative input before dispatch. PaidOperation handles user daily
and request limits. No new GPT-6 runtime model is activated.

The v2 intake behavior analyzes the user's original idea once when a fresh
project first opens. The user idea is the model input; its request is persisted
with an `initial` marker and protected by the existing idempotency key. A reload
or an already edited project does not create another initial call. The model
proposes before asking. A deterministic material-question filter permits at most
three visible clarifications and suppresses questions already covered by
accepted values or unreviewed proposals. It never treats the proposals as
confirmed search intent. Questions about final methodology and other later
design details are deferred. No new table or search-readiness rule was added.
Official model reference checked 2026-09-25:
[GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
Existing standard rates match the documented $0.75 input / $0.075 cached input /
$4.50 output per million tokens. Account access and scientific quality still
require controlled manual acceptance; this implementation made no paid calls.

## UX, persistence and rollback

Creation requires only idea and level; retry identity survives reload in
owner-scoped sessionStorage. Pending field text is also owner/project-scoped there
solely for recovery, never a second canonical definition. 800 ms debounce, explicit
save, serial action queue, visible status, query-navigation flush and beforeunload
warning preserve edits. Browser popstate cannot be cancelled: pending local text
is retained and the save remains revision-protected. A recovered local edit is
held for explicit conflict review, not silently merged.

Flush never confirms. Confirmation shows exact accepted values and omitted
proposals/unknowns. Later edits invalidate downstream readiness while historical
artifacts remain unchanged. Project resume chooses definition while unconfirmed,
evidence when confirmed, and plan when versions exist. Navigation itself does not
change the definition hash.

The Phase 1 UX refinement keeps the existing brand tokens and project shell. On
the definition step, its header and three-stage navigation are compact so the
chat and bottom composer fit sooner on desktop and mobile. The secondary panel
shows only topic, purpose/problem, object, relevant context, concepts and output;
all other fields remain editable under "Más detalles". Enter sends; Shift+Enter
adds a line. Confirmation review starts with those visible values and offers a
disclosure for every other accepted value, preserving exact snapshot transparency.

Set IMX_CONVERSATIONAL_INTAKE=0 on backend to stop new conversational project/model
operations without losing draft/history; manual edits/read/confirmation remain
available. Rollback application code only with compatible additive schema retained;
do not reverse migrations or null-program data. No reference-fixture mutation.

Deferred: retrieval relevance repair, PDF materialization, scientific design,
paid plan generation, assistant streaming and cross-device unsaved local text.
