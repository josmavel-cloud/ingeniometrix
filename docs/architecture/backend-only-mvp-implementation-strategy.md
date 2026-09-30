# Backend-Only MVP Implementation Strategy

Branch/worktree: `mvp/backend-core-clean`  
Date: 2026-05-11  
Scope: backend only. Frontend work is out of scope for this worktree except stable API contracts/DTOs.

## Correction of scope

This worktree should not implement or polish frontend screens.

It should deliver a backend core that the existing/new frontend can call later:

```text
services + DB + API routes + backend E2E runner + export artifacts
```

Frontend considerations are limited to:

- stable route shapes;
- DTOs;
- status values;
- user-action messages in Spanish;
- export/download gates.

No React component work belongs in this backend-only pass.

## Business goal

Depurar el flujo Lab A/B en un backend único, reducirlo al mínimo vendible y dejarlo listo para monetizar esta semana.

Paid MVP promise:

> Ingeniometrix entrega un plan inicial de investigación editable, trazable y revisable, con fuentes seleccionadas, matriz de coherencia, referencias exportables y un DOCX único con estilo Ingeniometrix.

Do not promise thesis generation.

## What I investigated

### Existing backend/product path already present

The clean worktree already contains product-oriented backend pieces:

- `app/api/projects/route.ts`
- `app/api/projects/[id]/route.ts`
- `app/api/projects/[id]/intake/route.ts`
- `app/api/projects/[id]/search/route.ts`
- `app/api/projects/[id]/references/route.ts`
- `app/api/projects/[id]/blueprints/route.ts`
- `server/projects/*`
- `server/retrieval/*`
- `server/blueprint/*`
- `server/blueprint/blueprint-export.ts`

This means the fastest backend path is not to import Lab B wholesale. It is to harden the existing product backend and selectively harvest guards from Lab A/B.

### Existing schema already supports a thin MVP

Current Prisma schema already has:

- `User`
- `Project`
- `Intake`
- `Reference`
- `ProjectReference`
- `BlueprintVersion`
- `AuditLog`
- template/taxonomy models

For speed, the first backend MVP should avoid large schema rewrites unless a missing table is essential.

### Existing export helpers are usable

`server/blueprint/blueprint-export.ts` already has deterministic helpers for:

- evidence log JSON;
- BibTeX;
- RIS.

These should stay in the MVP.

### Billing plan already exists

Existing thread brief recommends:

- one-time project payment;
- hosted checkout;
- billing state separated from `Project.status`;
- paywall at delivery;
- provider-neutral `PaymentOrder` seam;
- avoid subscriptions for Release 0.5.

For this week, we can implement backend entitlement/payment gate minimally without coupling it to research pipeline logic.

## Deep Research placement correction

I originally placed Deep Research too early as a fallback for weak initial discovery. That is wrong for the clean backend.

Correct placement:

```text
source discovery
→ human source selection
→ access/materialization or limited inspection
→ post-inspection source sufficiency
→ evidence gaps identified
→ Deep Research Light repair, if eligible
→ new candidates return to source selection/evidence processing
```

Incorrect placement:

```text
source discovery weak
→ immediately call Deep Research
```

Why: initial weak discovery usually means query/intake/source-provider problems. Deep Research should not guess around that. It should only answer precise gaps discovered after real selected sources were inspected.

Original policy evidence from the diagnostic code:

- `rapid-deep-research-fallback-decision.ts` sets `based_on_post_inspection_only: true`.
- It sets `does_not_use_step_3_pre_materialization_gate_as_trigger: true`.
- It skips when `post_inspection_not_available`.
- It skips when no sources were inspected.
- It skips when no usable inspected source text exists.
- It skips when manual PDF/document identity review is required first.

So in the MVP backend, Deep Research is an **evidence repair action**, not a discovery-stage fallback.

## Simplification decisions

### Keep for MVP backend

1. Project/intake persistence.
2. OpenAlex/Crossref source discovery.
3. Human source selection persistence.
4. Deep Research Light fallback as post-inspection evidence-gap rescue, not initial discovery.
5. Minimal evidence package/readiness report.
6. Blueprint generation from selected/verified source context.
7. Coherence/citation/readiness validation.
8. Evidence log JSON.
9. BibTeX.
10. RIS.
11. One DOCX with Ingeniometrix style.
12. Payment/export gate at delivery.
13. Backend E2E runner.

### Cut from MVP backend

1. Separate Lab A/B runtime.
2. 13-step product orchestration.
3. Two DOCX outputs.
4. Institutional DOCX reduction.
5. Template ingestion pipeline.
6. Template marketplace/custom institution templates.
7. Hero image generation.
8. AI-generated visuals/infographics.
9. Equation image fallback.
10. Complex Gantt/budget visual generation.
11. Public developer traceability appendices.
12. `artifacts-local/latest-*` production dependency.
13. Diagnostic continuation after blocked gates.
14. Broad admin dashboard.
15. Subscriptions, coupons, invoices, tax engine, saved cards.
16. Email automation unless needed after payment confirmation.
17. Browser scraping/CAPTCHA workarounds for restricted PDFs.
18. LaTeX/PDF export.
19. Multi-provider payment routing.
20. Frontend implementation in this worktree.

### Keep but constrain

#### Deep Research Light

Keep because it can save cases where selected/inspected sources leave real evidence gaps.

Correct placement: **after source selection + limited inspection/source-health/evidence sufficiency**, not during initial OpenAlex/Crossref discovery. The original diagnostic code explicitly says Rapid Deep Research is based on post-inspection evidence only and must not use Step 3 pre-materialization gates as trigger.

Constrain it strictly:

```text
Selected sources inspected
→ evidence gaps detected
→ Deep Research Light result
→ candidate only
→ user selection
→ evidence/source verification
→ only then allowed into blueprint/export
```

Never treat Deep Research output as final citable evidence by itself.

#### DOCX

Keep one DOCX because it is important for monetization.

But constrain it:

- one Ingeniometrix style;
- no institutional variant;
- no AI cover image;
- no public internal-trace appendices;
- no advanced visual QA requirements;
- use deterministic sections and references first.

#### Templates

Keep one fixed MVP document profile:

```text
INGENIOMETRIX_MVP_PLAN_V1
```

Do not use the template ingestion subsystem for MVP.

## Recommended backend architecture

### Product-facing stages

Keep 5 user/product stages in API status summaries:

```text
intake
sources
evidence
blueprint
export
```

Internally map to the 7-stage analysis:

```text
1. Intake & Project Setup
2. Source Discovery & Selection
3. Evidence Acquisition
4. Evidence Synthesis
5. Blueprint Planning & Drafting
6. Validation & Readiness
7. Export & Delivery
```

### Minimal status model

For speed, avoid a huge status migration in pass 1.

Use existing `ProjectStatus` where possible:

| Existing status | MVP meaning |
| --- | --- |
| `DRAFT` | intake/project incomplete |
| `INTAKE_READY` | intake complete, source discovery available |
| `SEARCHING` | normal source discovery running; Deep Research should not run here except as a later post-inspection repair action |
| `SOURCES_REVIEW` | candidates ready for selection |
| `SOURCES_SELECTED` | selected source set persisted |
| `BLUEPRINT_GENERATING` | evidence/blueprint run active |
| `BLUEPRINT_READY` | preview/output package ready |
| `EXPORT_READY` | export bundle generated |
| `ARCHIVED` | no active work |

Represent more specific states with run/readiness DTOs and `AuditLog` until schema cleanup:

- `EVIDENCE_BLOCKED`
- `NEEDS_USER_ACTION`
- `BLUEPRINT_BLOCKED`
- `PAYMENT_REQUIRED`
- `PAID`

These can be API-level statuses without immediately changing the enum.

## Minimal backend modules to implement/refactor

### 1. `server/mvp/status-service.ts`

Purpose:

- compute backend status DTO from DB;
- keep frontend/API status stable;
- hide internal implementation details.

API shape:

```ts
type MvpProjectStatusDto = {
  project_id: string;
  project_status: string;
  product_stage: "intake" | "sources" | "evidence" | "blueprint" | "export";
  backend_phase: string;
  progress: number;
  label_es: string;
  next_action_es: string;
  blockers: string[];
  warnings: string[];
  payment_required: boolean;
  export_available: boolean;
  updated_at: string;
};
```

### 2. `server/mvp/intake-orchestrator.ts`

Purpose:

- validate intake completeness;
- normalize Spanish planning context;
- derive search query;
- update project to `INTAKE_READY`.

Reuse:

- `server/projects/*`
- existing `Intake` model.

### 3. `server/mvp/source-discovery-service.ts`

Purpose:

- run OpenAlex/Crossref discovery;
- persist normalized references using existing `Reference`/`ProjectReference`;
- update status to `SOURCES_REVIEW`;
- produce snapshot/readiness summary.

Reuse:

- `server/retrieval/reference-search-v2.ts`
- `server/retrieval/reference-service.ts`

### 4. `server/mvp/deep-research-light-service.ts`

Purpose:

- evaluate whether post-inspection evidence gaps justify Deep Research;
- refuse to run from initial discovery weakness alone;
- persist only candidate metadata or audit payload;
- mark every result as non-citable until selected and verified.

Reuse/harvest:

- `server/blueprint-engine/quality/deep-research-light.ts`
- `server/blueprint-engine/quality/rapid-deep-research-fallback.ts`
- `server/blueprint-engine/quality/rapid-deep-research-fallback-decision.ts`

Implementation rule:

- isolate imports carefully;
- if the diagnostic code drags Lab A dependencies, copy/adapt the small decision/candidate types instead of importing the whole chain.

### 5. `server/mvp/evidence-package-service.ts`

Purpose:

Build a minimal `EvidencePackageV1` from selected sources.

For this week, keep it pragmatic:

- selected reference metadata;
- abstracts when available;
- source health flags;
- access URL/DOI fields;
- citation eligibility;
- evidence limitations;
- readiness blockers.

Do not pretend metadata/abstracts are full-text direct quotes.

Suggested type:

```ts
type MvpEvidencePackageV1 = {
  artifact_type: "mvp_evidence_package";
  artifact_version: "v1";
  project_id: string;
  generated_at: string;
  source_count: number;
  selected_sources: Array<{
    project_reference_id: string;
    reference_id: string;
    title: string;
    doi: string | null;
    year: number | null;
    venue: string | null;
    abstract: string | null;
    landing_page_url: string | null;
    source_origin: "openalex" | "crossref" | "deep_research_candidate" | "manual";
    citation_eligibility: "metadata_only" | "abstract_supported" | "full_text_verified" | "not_citable";
    warnings: string[];
  }>;
  readiness: {
    status: "ready" | "ready_with_warnings" | "blocked" | "needs_user_action";
    blockers: string[];
    warnings: string[];
    user_actions_es: string[];
  };
};
```

Persistence options:

- fastest: store latest evidence package in `AuditLog.payloadJson` and snapshot into `BlueprintVersion` when generating;
- cleaner: add `EvidencePackage` model.

Recommendation:

- if coding speed matters this week, use `AuditLog` first;
- add `EvidencePackage` only if the runner becomes awkward.

### 6. `server/mvp/blueprint-orchestrator.ts`

Purpose:

- call existing `generateBlueprintVersion` only after evidence readiness passes;
- enforce no Deep Research candidate enters citations unless verified;
- validate blueprint schema and traceability;
- persist `BlueprintVersion`.

Reuse:

- `server/blueprint/blueprint-service.ts`
- `server/blueprint/blueprint-validation.ts`
- `server/blueprint/blueprint-readiness.ts`

Potential simplification:

- do not use Lab B Step 7-13 runner;
- do not use `server/blueprint-v2/lab/*` for production MVP;
- use existing product blueprint v1 service first.

### 7. `server/mvp/export-bundle-service.ts`

Purpose:

Generate one backend export bundle.

Outputs:

- `evidence_log.json`
- `.bib`
- `.ris`
- one `.docx`
- `export-manifest.json`

Reuse:

- `server/blueprint/blueprint-export.ts` for evidence/BibTeX/RIS.
- DOCX should use the simplest stable renderer available, not Lab B dual-DOCX.

MVP output rule:

```text
one project → latest accepted blueprint version → one export bundle
```

No rerunning evidence/blueprint during export.

### 8. `server/mvp/payment-gate-service.ts`

Purpose:

- keep commercial gating backend-only;
- do not mix payment with `Project.status`;
- allow manual or hosted-checkout activation.

Fastest this-week implementation:

```ts
type ProjectDeliveryGate = {
  project_id: string;
  blueprint_version_id: string;
  payment_required: boolean;
  paid: boolean;
  export_download_allowed: boolean;
  reason_es: string | null;
};
```

Phase 1:

- config flag for payment required;
- manual paid marker in AuditLog or minimal `PaymentOrder` table;
- export endpoint checks gate before download.

Phase 2:

- hosted checkout provider;
- webhook idempotency;
- provider-neutral `PaymentOrder`.

If we implement billing schema now, use the older thread brief shape:

- `PaymentOrder`
- `PaymentWebhookReceipt`

But do not build subscriptions.

## Backend API contracts to expose

These are route contracts only. No frontend implementation here.

### Status

```text
GET /api/projects/:id/status
```

### Intake

```text
PUT /api/projects/:id/intake
POST /api/projects/:id/intake/complete
```

Existing intake route can be reused/adapted.

### Source discovery

```text
POST /api/projects/:id/source-discovery/runs
GET /api/projects/:id/source-candidates
POST /api/projects/:id/source-selection
```

Existing routes may remain as compatibility wrappers:

```text
POST /api/projects/:id/search
GET/PUT /api/projects/:id/references
```

### Deep Research Light repair action

This API belongs under evidence repair, not initial source discovery.

```text
POST /api/projects/:id/evidence/deep-research-light/runs
GET /api/projects/:id/evidence/deep-research-light/latest
POST /api/projects/:id/evidence/deep-research-light/promote-candidates
```

Compatibility aliases can exist later, but the product/backend meaning should remain post-inspection repair.

### Evidence

```text
POST /api/projects/:id/evidence/runs
GET /api/projects/:id/evidence/latest
GET /api/projects/:id/evidence/readiness
```

### Blueprint

```text
POST /api/projects/:id/blueprints
GET /api/projects/:id/blueprints
GET /api/projects/:id/blueprints/:versionId
```

Existing blueprint routes can be reused.

### Exports

```text
POST /api/projects/:id/exports
GET /api/projects/:id/exports/latest
GET /api/projects/:id/exports/:exportId/download/docx
GET /api/projects/:id/exports/:exportId/download/bibtex
GET /api/projects/:id/exports/:exportId/download/ris
GET /api/projects/:id/exports/:exportId/download/evidence-log
```

Existing version-based download routes can remain initially:

```text
GET /api/projects/:id/blueprints/:versionId/docx
GET /api/projects/:id/blueprints/:versionId/bibtex
GET /api/projects/:id/blueprints/:versionId/ris
GET /api/projects/:id/blueprints/:versionId/evidence-log
```

But they must check payment/export gate before production downloads if paywall is enabled.

### Payment/delivery gate

```text
GET /api/projects/:id/delivery-gate
POST /api/projects/:id/payment/manual-activate
POST /api/billing/checkout
POST /api/billing/webhook
```

For this week, `manual-activate` can be admin/dev only and `checkout/webhook` can remain planned if the external payment link is manual.

## Backend E2E runner

Primary proof target:

```bash
npx tsx scripts/mvp/run-backend-core-e2e.ts
```

Modes:

```bash
# deterministic; no external calls
npx tsx scripts/mvp/run-backend-core-e2e.ts --mode mock

# real retrieval, mock LLM/export if needed
npx tsx scripts/mvp/run-backend-core-e2e.ts --mode retrieval

# full local MVP path
npx tsx scripts/mvp/run-backend-core-e2e.ts --mode full
```

Runner flow:

1. ensure local DB connection;
2. create/reuse test user;
3. create project;
4. save/complete intake;
5. run source discovery;
6. select sources;
7. perform limited source inspection/source-health/readiness;
8. if post-inspection evidence gaps remain, run Deep Research Light repair;
9. select/promote any repair candidates and re-inspect them;
10. build evidence package/readiness;
11. generate blueprint version;
12. generate export bundle;
13. evaluate payment/delivery gate;
14. print artifact paths/IDs and final status.

Pass condition:

- exits 0;
- no dependency on Lab A/B routes;
- no dependency on `artifacts-local/latest-*`;
- if providers are missing, result is mock success or explicit blocked state;
- final output is either `EXPORT_READY` or a Spanish blocker explaining what user must do.

## Implementation order

### Pass 0 — Lock backend-only scope

- Keep frontend docs as contracts only.
- Do not touch `components/*` or app pages except API routes if needed.
- Rename or supersede frontend-cables doc with backend contract language.

### Pass 1 — Status + E2E skeleton

- Add `server/mvp/status-service.ts`.
- Add `scripts/mvp/run-backend-core-e2e.ts` in mock mode.
- Use existing schema first.
- Prove project → intake → selected mock sources → blueprint stub → export stub.

### Pass 2 — Source discovery

- Wrap existing `/search` and retrieval service behind `source-discovery-service`.
- Persist references with current models.
- Add source selection helper.
- Add source readiness summary.

### Pass 3 — Limited inspection + evidence sufficiency

- Add source-health/limited-inspection summary for selected sources.
- Determine whether selected sources are usable, need manual review, need replacement, or have category gaps.
- Do not call Deep Research before this post-inspection report exists.

### Pass 4 — Deep Research Light repair

- Add fallback decision only after post-inspection sufficiency says gaps remain.
- Skip if no sources were inspected, no usable inspected text exists, or manual PDF/identity review is required first.
- Persist candidate-only results.
- Add promote-to-candidate/selection path.
- Add tests to prove fallback candidates are not citable directly.

### Pass 5 — Evidence package

- Add minimal `MvpEvidencePackageV1` builder.
- Add citation eligibility classification.
- Block if no sufficient selected sources.
- Snapshot evidence package into audit/export logs.

### Pass 6 — Blueprint orchestration

- Gate existing `generateBlueprintVersion` behind evidence readiness.
- Ensure Spanish-only output direction.
- Validate citations resolve to selected sources.
- Keep Lab B runner out.

### Pass 7 — Export bundle

- Reuse evidence log/BibTeX/RIS helpers.
- Generate one DOCX using the simplest stable renderer.
- Add public DOCX sanitizer/no-internal-path check.
- Mark project `EXPORT_READY` only after bundle exists.

### Pass 8 — Payment gate

- Add backend delivery gate.
- Start with manual paid marker or fixed config.
- If time permits, add hosted checkout provider seam.
- Never mix payment status into research `Project.status`.

## What to check before coding each pass

### Before Pass 1

- `server/projects/project-service.ts`
- `server/projects/project-validation.ts`
- `server/auth/session.ts`
- `lib/prisma.ts`

### Before Pass 2

- `server/retrieval/reference-search-v2.ts`
- `server/retrieval/reference-service.ts`
- `server/retrieval/openalex-client.ts`
- `server/retrieval/crossref-client.ts`

### Before Pass 3

- `server/blueprint-engine/quality/deep-research-light.ts`
- `server/blueprint-engine/quality/rapid-deep-research-fallback.ts`
- `scripts/test-rapid-deep-research-fallback*.ts`

### Before Pass 5

- `server/blueprint/blueprint-service.ts`
- `server/blueprint/blueprint-validation.ts`
- `server/blueprint/blueprint-readiness.ts`

### Before Pass 6

- `server/blueprint/blueprint-export.ts`
- existing DOCX export route(s)
- simplest stable DOCX renderer path

## Risks and mitigations

### Risk: trying to clean the whole Lab A/B system

Mitigation:

- treat Lab A/B as read-only reference;
- do not import lab runners;
- only harvest small functions or contracts after inspection.

### Risk: selling an academically unsafe artifact

Mitigation:

- readiness gate blocks exports;
- Deep Research candidates are non-citable;
- no direct quotes unless full text is verified;
- evidence log explains limitations.

### Risk: billing delays the launch

Mitigation:

- delivery gate first;
- manual entitlement/payment activation acceptable for first sales;
- hosted checkout seam later.

### Risk: schema expansion slows progress

Mitigation:

- use existing schema and AuditLog for pass 1;
- add only missing tables when implementation pain is real.

### Risk: DOCX renderer is too tangled

Mitigation:

- one simple DOCX;
- no institutional variant;
- no visuals;
- fallback to evidence/BibTeX/RIS + preview if DOCX blocks, but prioritize DOCX because it matters commercially.

## My additional simplification recommendations

1. **Do not build source PDF upload in the first backend pass.**  
   Keep the API seam later. For this week, ask user action when full text is unavailable.

2. **Do not build template ingestion at all for MVP.**  
   Use `INGENIOMETRIX_MVP_PLAN_V1` as a fixed profile.

3. **Do not build institutional adaptation.**  
   Sell one Ingeniometrix plan first. Institutional formatting can be upsell.

4. **Do not build payment provider integration before export gate.**  
   If export gate works, payment can be manual/external for first sales.

5. **Do not require perfect evidence extraction before first monetization.**  
   The artifact should clearly label evidence levels. It can be useful as a planning package without claiming full-text quote support.

6. **Do not expose debug artifacts to the paid user.**  
   Keep traceability machine-readable and internal where needed.

7. **Do not attempt multi-template or multi-DOCX.**  
   One clean export beats two fragile outputs.

## Definition of done for backend-only MVP

- [ ] `npm run prisma:validate` passes.
- [ ] `npm run typecheck` passes.
- [ ] Backend E2E mock runner passes.
- [ ] Backend E2E retrieval mode either passes or blocks with Spanish user-action message.
- [ ] Source selection persists.
- [ ] Deep Research Light repair exists after post-inspection sufficiency and is candidate-only.
- [ ] Evidence package/readiness exists.
- [ ] Blueprint generation is gated by readiness.
- [ ] Export bundle produces evidence log, BibTeX, RIS, and one DOCX or an explicit blocker.
- [ ] Delivery/payment gate can block or allow export download.
- [ ] No production path depends on Lab A/B routes, mutable latest artifacts, or two-DOCX Lab B runner.
