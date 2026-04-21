# Linux Server Delegation Runbook

## Purpose

Use the Linux server as a worker for heavy tasks after the codebase is stable enough to benefit from offloading.

Current status note:

- if the repo does not yet have a clean first commit and remote baseline, treat the Linux server as optional only
- do not let the server become the source of truth for code, data, or environment knowledge

## Best First Uses

- repeated debug workflow runs
- export rendering experiments
- long provider comparison runs
- large local validation batches
- repeatable `npm run typecheck` and `npm run build` verification on Ubuntu

## Do Not Use First For

- primary deployment
- core product development
- active branch editing without Git discipline
- exploratory debugging with undefined scope

## Task Triage

### Move To Linux Now

Use the local-network Ubuntu server now only for heavy, repeatable, bounded jobs that already have a known local command.

- `npm run debug:workflow`
- `npm run debug:providers`
- repeated `npm run typecheck`
- repeated `npm run build`
- export generation or packaging experiments that can write raw outputs into `artifacts-local/`

### Move Later

Move these only after the Git baseline exists, the remote is established, and staging smoke checks are working.

- staging smoke verification such as `npm run smoke:deployment`
- scheduled recurring runs under `systemd`
- longer pre-release validation batches tied to a branch or tag
- dedicated Linux server setup for shared team use

### Do Not Move For Release 0

Keep these local or defer them entirely.

- landing page design work
- blueprint section design iteration
- undefined bug hunts
- day-to-day feature editing on the server
- primary app hosting or database migration

## Adoption Order

1. local Windows or WSL validation
2. Git baseline
3. remote push
4. Linux server pull and environment setup
5. run heavy jobs in tmux
6. collect outputs in server-local artifact paths

Do not skip steps 2 and 3 for normal use. Until the repo has a first commit and push target, keep Linux delegation limited to controlled experiments and document that the run was not tied to a commit SHA.

## Safe First Delegation Workflow

Use the local-network server as a pull-only worker, not as a development environment.

1. Pick one bounded command that already succeeds locally.
2. Record the exact command, expected inputs, and output folder before touching the server.
3. Make sure required environment variables are listed in `.env.example` or a runbook note.
4. After the first clean commit exists, push the branch and capture the commit SHA to run remotely.
5. On the Ubuntu server, clone or pull the repo into a dedicated working directory owned by a non-root user.
6. Install only the minimum runtime needed for the chosen job:
   - Node 20+
   - npm
   - Docker Compose only if the job needs Postgres
7. Start a named tmux session for the run.
8. Run the command with stdout and stderr redirected into a timestamped folder under `artifacts-local/remote/`.
9. Summarize only the essential result back into the thread:
   - commit SHA
   - command run
   - env group used
   - artifact path
   - exit status
   - next action

## First Workflow Shape

Preferred first delegated job:

- local validation of `npm run debug:workflow` or `npm run debug:providers`

Reason:

- both are heavy enough to justify offloading
- both are repeatable
- both fit the Release 0 priorities of traceability and reproducibility
- neither requires turning the Linux box into the primary runtime

Avoid using the first delegated run for a broad multi-step setup. One job, one tmux session, one artifact folder, one summary.

## Command Pattern

Example shape for a remote run after the commit has been pushed:

```bash
COMMIT_SHA="<commit-sha>"
JOB_ID="workflow-$(date +%Y%m%d-%H%M%S)"
ARTIFACT_DIR="artifacts-local/remote/${JOB_ID}"
mkdir -p "${ARTIFACT_DIR}"
tmux new-session -d -s "${JOB_ID}" \
  "cd ~/ingeniometrix && git fetch --all && git checkout ${COMMIT_SHA} && npm ci && npm run debug:workflow >\"${ARTIFACT_DIR}/stdout.log\" 2>\"${ARTIFACT_DIR}/stderr.log\""
```

Replace `COMMIT_SHA` with the exact pushed commit for the run. Adjust only the command body per job. Keep the surrounding pattern stable so runs remain comparable.

## Dedicated Server Migration

Treat dedicated server migration as a later phase, not the first use of Linux.

Readiness gate:

- first commit exists
- remote push flow exists
- environment inventory is documented
- staging target is validated
- smoke checks pass against staging

Before those gates, Linux should help with worker jobs only.

## Thread Guidance

Create a dedicated thread for server delegation:

`IMX-OPS-linux-delegation`

Use separate bug threads when remote runs fail for reasons unrelated to the task itself.

## Minimum Context Prompt

Use this when opening the Linux delegation chat:

```text
You are working in the Ingeniometrix operations thread.

Scope:
- remote execution only
- long-running jobs only
- no product redesign

Current task:
- set up or run a heavy job on the Linux server

Rules:
- keep all commands reproducible
- assume Ubuntu is the reference runtime
- use tmux for long jobs
- store raw outputs outside committed repo files
- summarize only the essential result back into the thread
```
