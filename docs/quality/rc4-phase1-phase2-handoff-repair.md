# RC4 Phase 1 closure / Phase 2 entry repair

Date: 2026-09-26. Scope: intake readiness, confirmation and Sources navigation.
No planner, provider, acquisition, upload, scientific-design or payment changes.
No migration. No historical staging project mutation.

## Baseline and real reproduction

- Branch: `feat/rc4-scientific-commercial`.
- Baseline local/remote HEAD: `60d131bf298397285fbe09b652ffb10ded79c555`.
- Baseline frontend: `dpl_DDWyidGGw6EtBsiNZFKZGLiY67Dt` (Preview).
- Baseline backend image: `sha256:3accbdcd06ce343f9313cc4de28c59d19538c6a3c91410e72aee757493169d0f`.
- Web and Funnel readiness: HTTP 200 before changes.
- Five pre-existing G5 files remain unmodified and outside scoped staging:
  `package.json`, `docs/runbooks/STAGING_RUNBOOK.md`,
  `scripts/g5-staging-entitlement.ts`, `scripts/test-g5-staging-entitlement.ts`,
  `server/commercial/staging-entitlement-policy.ts`.
- Read Phase 1 reports, Phase 2.1 report and architecture docs. The revised
  Sources plan and Phase 2A acceptance were supplied in the task history;
  there was no separate checked-in global Sources/2A report at baseline.

The latest project for the previously authorized owner is
`ef20fd1a-f8ff-41ef-aefb-bce4854129f3`, created 2026-09-25T15:21:03Z:
"Quiero diseñar y evaluar un protocolo de retroalimentación automática para
actividades digitales de matemáticas en estudiantes de secundaria."
Draft revision 9; no confirmed revision or Intake. Diagnosis was read-only.
The owner's active session metadata was present; no session token was accessed.
This is not proof that the owner's current browser uses that same account.

### Exact disabled-button chain

At baseline, the confirm button expression was
`readiness.evidenceSearch.status !== 'READY' || dirty`.
Review itself was disabled by `modelBusy || conflict`.
Both client and confirmation service already shared `definitionReadiness`.

| Condition | Authority / actual persisted state | Classification |
| --- | --- | --- |
| Accepted topic | Draft, KNOWN / ACCEPTED | Satisfied |
| Accepted object or concepts | Object accepted at revision 5 | Satisfied |
| Academic level | Explicit MAESTRIA | Not a search blocker |
| Taxonomy | UNKNOWN | Not a search blocker |
| Method, data, institutional fields | UNKNOWN | Optional, not blockers |
| Pending proposals | Several, including answer to context question | Not independently blocking; not silently accepted |
| Context ambiguity | Old `blocksSearch=true`, `resolved=false` | Actual blocking reason |
| Latest conversational turns | COMPLETE; latest proposed the user's answer | Not a running-turn lock |
| Confirmed revision | null | Expected before confirmation |
| Local dirty/debounce/conflict state | Not observable from persisted DB | Tested in isolated browser, not guessed for owner's session |

The user answered the context question in the chat. The next model result
proposed that answer, but old ambiguities were only appended and never retired
by proposal acceptance or direct field editing. Only the separate RESOLVE form,
hidden in advanced controls, could resolve one. The first two proposal cards
also hid the relevant context proposal behind unrelated pending suggestions.

Even after a successful confirmation, `router.refresh()` retained
`?step=define`; there was no transition to Evidence. Separately, old confirmed
conversational projects retained Project.status DRAFT, causing the misleading
"Base por definir" label despite readiness being satisfied.

### Visibility finding (not an invented ownership failure)

Both earlier reference projects and the latest project belong to the supplied
owner. `listProjectsForUser` filters only by owner, orders by updatedAt and takes
60 by default; all three fall within that list. There is no archive, step or
feature-version exclusion. No server-side omission was reproduced. The actual
browser account must be checked manually if a project is still absent.
The list now adopts refreshed server props instead of retaining an old initial
React array. Foreign-owner projects remain inaccessible; no ownership bypass.

## Repairs

1. Shared `initial-evidence.v2` readiness uses the same material-field policy as
   conversational questioning, including for historical optional ambiguities.
   Methods, data access, taxonomy, academic level and adviser details cannot
   become accidental model-supplied search prerequisites.
2. Ambiguities may carry an additive JSON `createdRevision`. Explicit acceptance
   of a later answer proposal resolves that field's older ambiguity. Same-turn
   or older proposals do not. Existing records can be dated conservatively from
   their turn/proposal IDs; insufficient history requires a manual answer.
3. Explicit field replacement resolves questions for that field when the new
   value is usable. UNKNOWN never becomes an answer. RESOLVE also retires stale
   pending proposals. No automatic transcript replay or AI acceptance.
4. An explicit, audited DEFER action can leave a non-core precision unresolved
   while searching only accepted values. Core topic/problem/object/concept
   ambiguities cannot use this action. Deferral keeps UNKNOWN and provenance.
5. Blocking questions and their answer/defer controls are visible near review;
   relevant pending proposals are prioritized. The CTA explains saving,
   conflict, pending response or semantic blockers.
6. Review captures exact revision/hash. Concurrent actions/confirmation are
   guarded; 409 offers explicit reload/comparison. Autosave flush never confirms.
   A conversation request times out after 90 seconds without creating an
   automatic retry, releasing the UI for manual repair. Persistent RUNNING
   operations are not resumed or billed speculatively.
7. Successful confirmation pushes `?step=evidence` and refreshes canonical data.
   Existing deterministic resume logic already chooses Evidence for confirmed
   projects without a plan, Define for unconfirmed ones. Presentation status
   derives from confirmation for early-stage conversational projects, without
   rewriting historical Project.status.
8. Pre-search: "Busca fuentes académicas para comenzar". Post-search zero
   admission: "No encontramos fuentes suficientemente pertinentes en este lote."
   Entering Sources, confirming, reading and resuming never initiate a search.

## Automated evidence

- New `test-phase1-handoff`: real failure shape, old-vs-new proposal dating,
  explicit defer, UNKNOWN/rejection, optional taxonomy/method, core ambiguity,
  failed-model manual recovery, exact snapshot/hash/revision, stale rejection,
  audit count, SearchIntent v2 derivation, owner listing/isolation, zero network.
- Existing Phase 1 definition, mocked conversation, navigation and UX-policy
  suites PASS. No model routing or prompt change.
- Real local Chromium against isolated DB: canonical project creation;
  autosave and pending-edit navigation flush; simulated conversational question
  and answer; disabled CTA becomes enabled after explicit acceptance; second-tab
  update causes 409 and explicit recovery; confirmation enters Sources; reload,
  project-list reopen and fresh-session resume preserve Sources; missing session
  denied; desktop/mobile layout checked.
- Browser verifies both initial and zero-admission states. The latter uses a
  labelled isolated audit fixture, not a provider execution or staging mutation.
  No SEARCH_INPUT_FROZEN event; no search events before the fixture is inserted.
- Phase 2.1, Phase 2A admission/listing, G2, G4 auth, B2 continuity, secure-pilot
  and B4 resilience suites PASS. Phase 2A's five historical negatives remain
  zero recommendations; selection and snapshots remain unchanged.
- Prisma validate, TypeScript, full/backend and worker builds PASS.
  Full build has existing broad artifact-path tracing warnings, not errors.
- Frontend-only package build and boundary validation PASS (24 traces).
  Final deployment package is revalidated from the scoped commit.

Tests use disposable identities in the isolated validation DB. They do not
claim Google login or owner-authenticated staging manual acceptance.
No provider, application LLM, document, scientific-generation or payment calls.

## Manual staging acceptance (no foreign fixture IDs)

At https://staging.ingeniometrix.com/projects, verify the account shown is yours.

1. Open your existing conversational project (or create your own).
2. Provide a reasonable definition and review only proposals you agree with.
3. For the reported project, the context proposal now appears first. Accept it
   if correct, edit/answer it, or explicitly leave that non-core precision
   pending. No change has been applied to your project by the repair.
4. See "Confirmar para buscar evidencia" enabled; optional methodology/taxonomy
   may remain unknown. Review the included values and confirm.
5. Verify arrival in Evidencia, without pressing Buscar fuentes.
6. Reload, leave, then reopen from the project list; remain in Evidencia.
7. Optionally log out/in and reopen; the same confirmed definition must resume.
8. Verify no search starts automatically and the initial state says to search.
   A historical searched project with no admitted sources uses the distinct
   insufficient-results message. Do not run a new search for this acceptance.

If a project is missing, report the account discrepancy and title rather than
sharing credentials. Do not loosen owner filtering. Gate 2B remains stopped
until this authenticated manual check is reported.

## Rollback / boundaries

Rollback the application image and Preview alias only. No schema migration or
data rollback required. Additive ambiguity JSON remains compatible with the new
code; do not run an older strict parser against drafts containing createdRevision
without first assessing compatibility. Do not remove that data automatically.
The five G5 changes, staging sessions, DB, worker, proxy, Funnel, payments and
entitlements are preserved. No change to Phase 2A ranking/admission or Phase 2B.
