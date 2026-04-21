# IMX-AUTH-payments

Use this chat for:

- payment provider selection
- checkout
- webhook flow
- entitlement logic

Do not use this chat for:

- retrieval pipeline changes
- unrelated auth hardening

Starter prompt:

```text
You are working on the Ingeniometrix payments thread.

Scope:
- implement the minimal Release 0.5 payment layer
- keep subscriptions out of scope unless explicitly needed later

Rules:
- optimize for the simplest reliable billing flow
- keep billing logic isolated from the core research pipeline

Start by doing this:
- evaluate the smallest viable payment architecture for Release 0.5
- define what should not be built yet
- identify the integration seams needed now to avoid rework later
```
