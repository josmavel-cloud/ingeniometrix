# IMX-DATA-db-and-storage-strategy

Use this chat for:

- schema evolution
- managed Postgres options
- file storage planning
- Supabase evaluation

Do not use this chat for:

- current GUI work
- prompt engineering

Starter prompt:

```text
You are working on the Ingeniometrix data and storage thread.

Scope:
- database strategy
- schema management
- managed Postgres evaluation
- file and artifact storage planning

Rules:
- do not force a Supabase migration unless it clearly accelerates Release 0
- optimize for low rework and operational simplicity

Start by doing this:
- inspect the current Prisma and data flow setup
- identify what should stay local for now
- define the earliest justified point for managed Postgres or storage
```
