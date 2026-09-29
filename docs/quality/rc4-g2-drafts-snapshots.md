# RC4 G2a: persistent drafts and generation inputs

Status: implementation and offline validation; G2 overall remains PARTIAL.
Only isolated RC4 database migrations have been applied. No RC3 mutation.

## Product path

- Intake form restores an owner-scoped draft without paid generation on mount.
- Partial values are saved after 800 ms of inactivity. The UI shows saving,
  saved revision, conflict or pending changes; it never reports failed writes saved.
- Requests in one tab are serialized. Different tabs must supply the saved revision;
  stale writes return 409 rather than silently overwriting.
- Explicit retry preserves local text after a connection failure. Conflict resolution
  requires reviewing/loading the saved version; reloading warns about local changes.
- Navigation with unsaved edits waits for saving; closing the browser warns. This is
  not an offline-first guarantee against device/browser crashes before server acknowledgement.
- Confirming the definition applies all eight existing intake fields, including
  advanced fields and intentional clearing. The generation button first flushes and
  confirms the form, then submits that exact revision. The server rechecks it.
- Existing explicit intake/topic writes synchronize confirmed drafts transactionally;
  they cannot overwrite unconfirmed draft work. Normalization rejects results if its
  source intake changed while the provider request was in flight.

## Immutable execution

New RC4 jobs append `GenerationInputSnapshot`: complete project/intake metadata,
selected links and reference metadata, draft content/revision, existing source
inspection output, and scientific prompt/configuration hashes. It contains no PDF
bytes. PostgreSQL rejects UPDATE; authorized project deletion retains existing
cascade semantics. Revision creates another row, not an overwrite.

The worker activates this snapshot in its execution context. Step 5, scientific
selection and Step 6 consume it, even if another session edits the project, changes
reference metadata or deselects sources afterward. Step 5 uses the pinned inspection,
not whichever inspection later becomes latest. Step 6 uses the job's exact Step 5.
Current ownership is still checked against the live DB.

Approval requires compatible current confirmed inputs; changing them before
approval requires explicit revision. After approval, subsequent draft edits do not
rewrite the inputs of work already authorized. Runtime configuration changes pause
instead of silently switching scientific prompts/models/budgets mid-job.

RC4 cannot auto-select extra sources during drafting. Insufficient frozen evidence
requires a new human selection/revision. RC3 retains its compatibility reader.

`BlueprintVersion.blueprintJson.generation_input_snapshot_id` connects the final
version to the immutable input. Existing evidence, approved design, prompts, costs
and artifacts remain in their owned job/step records. No heavy files are duplicated.

## Producers and consumers

| Entity/field | Producer | Consumer | Authority/retention |
| --- | --- | --- | --- |
| ProjectDraft.contentJson/revision | Autosave or explicit canonical intake mutation | Restore, confirm, generation preflight | Mutable private workspace authority |
| ProjectDraft.confirmedRevision | Explicit definition/generation confirmation | Enqueue, immutable snapshot | Distinguishes saved from generation-approved inputs |
| GenerationInputSnapshot | Enqueue / explicit design revision | Worker, Step 5, selector, Step 6 | Append-only private generation authority |
| stageDataJson.inputSnapshotId | Enqueue / explicit revision | Worker snapshot reader | Current revision pointer; historical rows retained |
| BlueprintVersion generation_input_snapshot_id | Canonical Step 6 | Version audit/lineage | Private, not printed in academic output |
| PaidOperation.draftId/revision | Pre-job request wrapper | Usage attribution | Explicit draft ID plus request/content fingerprint |

No confirmed orphan was introduced. Snapshot policies/inspection metadata are
audit and compatibility inputs, not cleanup candidates merely because private.

## Verification

New `test:rc4-draft-snapshots` covers partial saves, cross-user denial, two-tab
concurrency, conflict-safe client queue, repeated confirmation, generation revision
checks, SQL immutability, runtime configuration changes, frozen worker consumption,
reference metadata isolation and existing canonical-write synchronization.

53/53 offline suites PASS. Prisma validation, TypeScript and app/worker builds PASS.
Tests are offline and use synthetic provider results. No paid API calls.
Interactive browser UX review is NOT_RUN (no installed browser automation runtime).

## Remaining G2 scope

This is NOT completion of OECD taxonomy, optional-university migration, the full
four-step UX, pre-project idea autosave, source-ranking/provider backoff, PDF upload
quarantine/malware checks, lawful HTML acquisition, consent or version-history UI.
The new compact publication profile and final asset policy belong to G3 and remain
pending. Final configuration/artifact manifests need acceptance with those stages.
