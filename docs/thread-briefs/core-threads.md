# Core Thread Map

## Permanent Threads

`IMX-ARCH-core`

- purpose: architecture, repo boundaries, durable workflow rules
- never include: bug hunts, UI polish, provider logs

`IMX-WEB-workspace`

- purpose: dashboard, project UI, intake UX, project shell
- never include: prompt engineering, Crossref/OpenAlex debugging

`IMX-PIPELINE-retrieval`

- purpose: query building, retrieval, deduplication, source selection
- never include: landing page work, auth or billing

`IMX-AI-blueprint`

- purpose: blueprint prompt, schema, coherence checks, traceability validation
- never include: CSS, marketing copy, unrelated DB work

`IMX-REPORT-exports`

- purpose: LaTeX, DOCX, RIS, BibTeX, evidence log packaging
- never include: auth and provider debugging unless export-specific

`IMX-AUTH-billing`

- purpose: session management, auth minima, Stripe, subscriptions, access control
- never include: retrieval ranking or prompt wording

`IMX-GTM-marketing`

- purpose: landing page, messaging, conversion assets
- never include: product debugging or pipeline changes
