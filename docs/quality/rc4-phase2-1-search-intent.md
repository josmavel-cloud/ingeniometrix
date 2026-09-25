# RC4 Phase 2.1: canonical search-intent handoff

New projects: ProjectDraft -> explicitly confirmed Intake -> ResearchSearchIntent
v2 -> typed SearchInput -> existing reference-search-v2 planner. Only accepted
scientific values reach the planner. Accepted context is included; unknown
values and unresolved question text are not query terms. Scope and the full
structured intent remain in the frozen snapshot for Phase 2.2.

Legacy projects use an explicit `LEGACY_COMPATIBILITY` adapter and
`LEGACY_UNVERIFIED` provenance. The historical planner field mapping is
preserved. Operational Project.country is not scientific geography; no raw
conversation replay occurs.

`SEARCH_INPUT_FROZEN` is written before provider/model work. Its private audit
payload contains the intent and exact planner input, plus project/intake IDs,
confirmed revision and definition hash (null for legacy), intent hash,
engine/planner versions, attempt ID and timestamp. The completed search event
carries the same trace. Historic snapshots remain unchanged after edits or
new confirmations; snapshot readers compute a `stale` flag against the current
draft revision/hash. An unconfirmed current draft blocks a new search. No
migration or new public endpoint was needed.

Query-planner logic, OpenAlex/Crossref clients, ranking, diversity and admission
are unchanged. This gate does not claim improved relevance. No real retrieval,
provider/model call or scientific generation is part of acceptance.

Read-only fixture: staging project `af9c3d79-a4ca-41d9-ab95-53a57221b7ec`.
Its confirmed definition contains the original idea, purpose, object, accepted
Lima context, accepted taxonomy and MAESTRIA level; rejected combined-feedback
concepts and unknown methodology/data remain excluded.

## Offline verification (2026-09-25)

- Focused Phase 2.1 integration test PASS on the isolated RC4 test DB:
  accepted Lima context reaches planner input; unknown/rejected/default values
  do not; legacy mapping is explicit; frozen audit precedes provider work;
  stale input is rejected; a later confirmation changes the hash but not the
  old snapshot. A synthetic completed-search record reports stale after edit.
- Phase 1 definition, conversation, navigation and UX policy tests PASS.
- RC4 G2 PASS. Candidate keyword expansion, source sufficiency, evidence
  planning and limited-source-inspection offline tests PASS.
- Real staging project read-only derivation PASS: revision 10, original idea,
  purpose, object, Lima, taxonomy and MAESTRIA preserved; rejected concepts,
  unknown method/data and placeholders excluded. No provider call occurred.
- Prisma validate, TypeScript, full Next build, frontend-only package build
  (24 traces; no backend dependencies), worker bundle and `git diff --check`
  PASS. Existing Turbopack broad-pattern warnings are unrelated.
