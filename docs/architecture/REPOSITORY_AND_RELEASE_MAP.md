# Repository And Release Map

STATUS: CURRENT - Release 0 secure pilot.

## Canonical Release

- Branch: `release/secure-pilot`
- Commit: `5442a9ba29abed0aabaa4b882e4ca5a0ca057760`
- Message: `feat(release): assemble secure pilot`
- Contains engine/visual commit: `be9c72bf849496721741c987aa90d1a914d82315` - verified ancestor.
- Contains frontend commit: `7f6b615ea8b57c661f5d55cdf94f12152d195aa4` - verified ancestor.
- Contains backend baseline ancestor: `341a524bac2e1e370316ceff5ca57ad073d216ab` - verified ancestor.

Future release work should start from `release/secure-pilot` unless a newer documented release branch supersedes it.

## Worktrees

| Branch / worktree | HEAD | Relation to release | Unique value | Source of truth? | Action |
| --- | --- | --- | --- | --- | --- |
| `release/secure-pilot` at `/home/pepe/.openclaw/workspace/ingeniometrix-wt-release0` | `5442a9b` | CANONICAL_RELEASE | Secure pilot assembly, merged frontend and engine, deployment package. | YES | KEEP |
| `mvp/backend-core-clean` at `/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core` | `be9c72b` | BACKEND_LINEAGE | Scientific/visual engine development line. | Reference for engine history, not release start point. | KEEP_REFERENCE |
| `codex/lab-a-b-diagnostic-pipeline` at `/home/pepe/.openclaw/workspace/ingeniometrix` | `c59a44d` | SUPERSEDED / BACKEND_LINEAGE | Earlier diagnostic/lab handoff docs. | NO | DO_NOT_USE_FOR_NEW_WORK |
| Historical path `/home/pepe/.openclaw/workspace/ingeniometrix/app/lab/master-blueprint` | UNKNOWN in current release graph | REFERENCE_ONLY | Historical conceptual backend. | NO | DO_NOT_USE_FOR_NEW_WORK |
| Windows frontend path `C:\projects\ingeniometrix` | NOT VERIFIED locally | FRONTEND_LINEAGE | Human-provided location of frontend lineage. | NO | REVIEW_BEFORE_ARCHIVE |

## Branches

| Branch | HEAD | Relation to release | Unique value | Source of truth? | Action |
| --- | --- | --- | --- | --- | --- |
| `release/secure-pilot` | `5442a9b` | CANONICAL_RELEASE | Current secure pilot. | YES | KEEP |
| `mvp/backend-core-clean` | `be9c72b` | BACKEND_LINEAGE | Engine/visual parent of release. | NO | KEEP_REFERENCE |
| `origin/codex/stable-release0-blueprint-flow` | `7f6b615` | FRONTEND_LINEAGE | Approved frontend parent of release. | NO | KEEP_REFERENCE |
| `codex/lab-a-b-diagnostic-pipeline` / `origin/codex/lab-a-b-diagnostic-pipeline` | local `c59a44d`, remote `c59a44d` | SUPERSEDED | Diagnostic/lab branch. | NO | REVIEW_BEFORE_ARCHIVE |
| `main` / `origin/main` | `1430be8` | SUPERSEDED for Release 0 | Repo baseline. | NO | KEEP_REFERENCE |
| `origin/staging` | `8a90427` | UNKNOWN | Staging line not inspected for this freeze. | NO | REVIEW_BEFORE_ARCHIVE |

No branches were deleted or rewritten during the documentation freeze.

## Important Paths

- Canonical release: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-release0`
- Backend development lineage: `/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core`
- Historical reference only: `/home/pepe/.openclaw/workspace/ingeniometrix/app/lab/master-blueprint`
- User-provided Windows frontend path: `C:\projects\ingeniometrix` (not locally verified in this Linux worktree)

## Stale Documentation Classes

- CURRENT: `CURRENT_STATE.md`, this file, `ARCHITECTURE.md`, `EVIDENCE_ENGINE.md`, `DATA_MODEL_AND_ARTIFACTS.md`, `LLM_AND_PROMPT_REGISTRY.md`, `docs/runbooks/deployment.md`.
- CURRENT SUPPORTING EVIDENCE: `docs/quality/release0-secure-pilot.md`, `docs/quality/release0-visual-acceptance.md`, `docs/quality/release0-backend-mvp-b3.md`.
- SUPERSEDED BY LATER REPORTS: `docs/quality/release0-scientific-acceptance.md`, `docs/quality/release0-scientific-acceptance-b2.md`.
- HISTORICAL / PLANNING: older architecture plans such as `mvp-backend-core-plan.md`, `backend-only-mvp-implementation-strategy.md`, `unified-pipeline-simplification.md`, `mvp-frontend-cables-and-scope-cuts.md` and thread briefs.

Historical documents may still explain decisions, but they are not source of truth for current release state.
