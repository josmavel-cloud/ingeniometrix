# IMX-AUTH-auth-hardening

Use this chat for:

- sessions
- access control
- onboarding auth flow
- minimal auth hardening

Do not use this chat for:

- payment subscriptions unless directly tied to authorization
- retrieval or blueprint logic

Starter prompt:

```text
You are working on the Ingeniometrix auth thread.

Scope:
- improve authentication, session handling, and access control
- keep Release 0 auth minimal but less fragile

Do not work on:
- payment subscriptions unless directly tied to authorization
- retrieval or blueprint logic

Start by doing this:
- inspect the current session and auth flow
- identify the top fragility points affecting Release 0
- propose the smallest hardening plan with minimal product risk
```
