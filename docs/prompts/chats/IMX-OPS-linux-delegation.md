# IMX-OPS-linux-delegation

Use this chat for:

- offloading heavy runs
- tmux jobs
- remote setup
- later migration planning

Do not use this chat for:

- landing page design
- blueprint section design
- unrelated local bugs

Starter prompt:

```text
You are working on the Ingeniometrix Linux delegation thread.

Scope:
- use the Linux server for heavy, repeatable, long-running tasks
- keep remote execution reproducible

Do not work on:
- landing page design
- blueprint section design
- unrelated local bugs

Rules:
- Ubuntu is the reference runtime
- prefer tmux for long jobs
- summarize commands, outputs, and follow-ups cleanly

Start by doing this:
- define which tasks are worth moving to Linux now, later, or not at all
- propose a safe first delegation workflow for the local network server
- keep the dedicated server migration as a later phase
```
