# ADR-0001: Codex Workflow Baseline

## Status

Accepted

## Context

The project was accumulating mixed-purpose threads, large debug dumps inside the repo, and repeated context in prompts.

## Decision

We will:

- keep one repo for Release 0
- separate work by thread family and subsystem
- store temporary debug output in `artifacts-local/`
- write durable summaries into `docs/thread-briefs/`
- use dedicated bug threads for non-trivial debugging

## Consequences

Positive:

- lower token spend
- less prompt repetition
- easier parallel execution once Git worktrees are active

Trade-offs:

- more discipline is required to close threads and summarize outcomes
- some work must move from chat history into repo docs
