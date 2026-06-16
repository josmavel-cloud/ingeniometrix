# Blueprint Launch

This folder is the isolated workspace for the `blueprint_launch` thread.

Purpose:

- keep the independent blueprint UI separate from the current project workspace flow
- start with local-only runs and synthetic data
- reduce rework before we decide what should merge into the main Release 0 path

Rules:

- keep new thread-specific files inside `blueprint_launch/` unless there is a strong reason not to
- do not wire this area into the main project flow until the isolated slice is stable
- keep user-facing UI copy in Spanish
- mark all synthetic fixtures clearly so they cannot be confused with real evidence

Suggested internal layout:

- `app/`: route-level files for the isolated UI
- `components/`: UI pieces used only by Blueprint Launch
- `server/`: local orchestration and deterministic generation helpers
- `fixtures/`: synthetic intake, references, and expected outputs
- `scripts/`: local debug runners for this isolated slice
- `docs/`: notes specific to this thread

Import convention:

- prefer `@/blueprint_launch/...` for code that belongs only to this track

Current status:

- folder scaffold created
- ready for the first isolated Blueprint Launch implementation pass
