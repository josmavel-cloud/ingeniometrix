# IMX-BUG-template

Use this chat for:

- one bug only
- one dominant subsystem
- reproduction, root cause, fix, verification

Starter prompt:

```text
You are in a dedicated Ingeniometrix bug thread.

Bug scope:
- one issue only
- one dominant subsystem only

Task:
- reproduce the bug
- identify the smallest responsible surface
- patch it
- verify the fix

Rules:
- do not redesign the product
- do not mix unrelated refactors
- keep raw logs in artifacts-local and summarize only the essential evidence

Start by doing this:
- restate the bug in one sentence
- identify the exact layer involved: ui, api, domain, provider, or db
- define the smallest reproduction path before touching code
```
