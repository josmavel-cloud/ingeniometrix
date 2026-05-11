# MVP Frontend Cables And Scope Cuts

Branch/worktree: `mvp/backend-core-clean`  
Goal: depurar el pipeline unificado, conectarlo al frontend y dejarlo monetizable esta semana.  
Original reference: frozen Lab A/B branch, read-only.

## Executive decision

For the paid MVP, do **not** ship the old Lab A/B surface.

Ship one product flow:

```text
Landing / Campaign
→ checkout / paid access
→ project workspace
→ intake
→ source review
→ evidence/build run
→ blueprint preview
→ single Ingeniometrix DOCX + support exports
```

The old 13 lab steps become internal/debug lineage only.

## Frontend reality found in the frozen branch

The existing repo already has useful frontend surfaces:

- `/campana` — campaign landing page with a manual `mailto:` snapshot form.
- `/projects` — project list/workspace entry.
- `/projects/new` — project creation.
- `/projects/[id]` — project detail page.
- `/projects/[id]/topic` — topic stage.
- Components already present:
  - `components/projects/intake-form.tsx`
  - `components/projects/reference-search-panel.tsx`
  - `components/projects/blueprint-panel.tsx`
  - `components/projects/export-panel.tsx`
  - `components/projects/workflow-stage-nav.tsx`
  - `components/projects/project-shell.tsx`

The existing `/projects/[id]` UI currently exposes a 5-step product-facing nav:

```text
Tema
Intake
Fuentes semilla
Blueprint
Exportacion
```

This is close to the MVP and should be reused. The backend can internally use the 7-stage unified pipeline while the frontend shows 5 simpler user stages.

## Recommended frontend stages

Keep the UI simple:

```text
1. Tema
2. Intake
3. Fuentes
4. Blueprint
5. Exportación
```

Map them to backend stages:

| Frontend stage | Backend stages | User-visible purpose |
| --- | --- | --- |
| Tema | Stage 1 partial | choose/refine topic seed. |
| Intake | Stage 1 | structured academic context. |
| Fuentes | Stages 2-4 | discover, select, verify, synthesize evidence. |
| Blueprint | Stages 5-6 | plan/draft, validate, show readiness. |
| Exportación | Stage 7 | download paid deliverables. |

Important: Do not expose 13 technical steps in the UI.

## Backend cables to leave for frontend

The clean backend should expose stable route-level cables even before every internal implementation is complete.

### 1. Project status cable

Endpoint:

```text
GET /api/projects/:projectId/status
```

Returns:

```ts
type ProjectStatusDto = {
  project_id: string;
  status:
    | "DRAFT"
    | "INTAKE_READY"
    | "SOURCE_DISCOVERY_RUNNING"
    | "SOURCES_READY_FOR_REVIEW"
    | "SOURCES_SELECTED"
    | "EVIDENCE_RUNNING"
    | "EVIDENCE_READY"
    | "EVIDENCE_BLOCKED"
    | "BLUEPRINT_RUNNING"
    | "BLUEPRINT_READY"
    | "BLUEPRINT_BLOCKED"
    | "EXPORT_READY"
    | "NEEDS_USER_ACTION"
    | "FAILED";
  frontend_stage: "topic" | "intake" | "sources" | "blueprint" | "export";
  progress: number; // 0-100
  label_es: string;
  next_action_es: string;
  blockers: string[];
  warnings: string[];
  updated_at: string;
};
```

Used by:

- `WorkflowStageNav`
- project header/ribbon
- polling while background runs execute.

### 2. Intake cable

Endpoints:

```text
GET /api/projects/:projectId/intake
PUT /api/projects/:projectId/intake
POST /api/projects/:projectId/intake/complete
```

Used by:

- `IntakeForm`
- stage unlock logic.

Must return backend validation errors in Spanish.

### 3. Source discovery cable

Endpoints:

```text
POST /api/projects/:projectId/source-discovery/runs
GET /api/projects/:projectId/source-discovery/runs/:runId
GET /api/projects/:projectId/source-candidates
POST /api/projects/:projectId/source-selection
```

Used by:

- `ReferenceSearchPanel`

Selection payload:

```ts
type SourceSelectionDto = {
  selected_candidate_ids: string[];
  rejected_candidate_ids?: string[];
  notes?: Record<string, string>;
};
```

Rules:

- source discovery may use OpenAlex/Crossref first;
- if discovery is weak, trigger Deep Research Light fallback;
- Deep Research results are candidates only, not citable evidence;
- user must select/review sources before evidence acquisition.

### 4. Deep Research Light cable

Keep this for MVP. It is the safety net when normal discovery/materialization underperforms.

Endpoints:

```text
POST /api/projects/:projectId/deep-research-light/runs
GET /api/projects/:projectId/deep-research-light/runs/:runId
POST /api/projects/:projectId/deep-research-light/promote-candidates
```

Use cases:

- OpenAlex/Crossref returns insufficient sources;
- selected sources fail health/materialization;
- pipeline needs secondary reference recovery;
- user topic is too narrow or too local.

Rules:

- Deep Research Light output is `candidate_only_not_citable_yet`;
- promoted candidates must go through source selection and Evidence Acquisition;
- it may inform search queries and recommendations, but not final citations directly;
- show it in frontend as `Buscando fuentes de respaldo`, not as magic thesis generation.

User-facing label:

```text
Búsqueda académica de respaldo
```

### 5. Evidence run cable

Endpoints:

```text
POST /api/projects/:projectId/evidence/runs
GET /api/projects/:projectId/evidence/runs/:runId
GET /api/projects/:projectId/evidence/package/latest
GET /api/projects/:projectId/evidence/readiness
```

Used by:

- sources panel progress state;
- blueprint panel unlock state;
- readiness messages.

Frontend should show:

- selected source count;
- recovered/source-health count;
- direct evidence count;
- blockers requiring user action.

Do not show raw lab artifact paths.

### 6. Blueprint run cable

Endpoints:

```text
POST /api/projects/:projectId/blueprint/runs
GET /api/projects/:projectId/blueprint/runs/:runId
GET /api/projects/:projectId/blueprint/latest
GET /api/projects/:projectId/blueprint/readiness
```

Used by:

- `BlueprintPanel`

Rules:

- blueprint consumes only persisted `EvidencePackageV1`;
- if evidence readiness is blocked, production blueprint must not run;
- blueprint preview should be readable in-app before export.

### 7. Export cable

Endpoints:

```text
POST /api/projects/:projectId/exports
GET /api/projects/:projectId/exports/latest
GET /api/projects/:projectId/exports/:exportId/download/docx
GET /api/projects/:projectId/exports/:exportId/download/bibtex
GET /api/projects/:projectId/exports/:exportId/download/ris
GET /api/projects/:projectId/exports/:exportId/download/evidence-log
```

Used by:

- `ExportPanel`

MVP export set:

- one DOCX with Ingeniometrix style;
- BibTeX;
- RIS;
- evidence log JSON;
- readiness/QA report JSON if useful for internal support.

## Monetization cable

The current `/campana` page uses a `mailto:` form. That is fine for manual pre-sales, but weak for monetization this week.

Recommended minimum paid flow:

```text
/campana
→ CTA: Comprar acceso MVP / Reservar snapshot
→ checkout link or hosted checkout
→ payment success page
→ create/access project workspace
```

### Fastest option this week

Use hosted checkout outside the core backend first:

- Stripe Payment Link, Lemon Squeezy, Gumroad, Hotmart, or manual WhatsApp/payment link.
- After payment, user receives access link or manual invite.
- The app only needs a simple `entitlement` flag initially.

### Backend cable for entitlement

```ts
type Entitlement = {
  user_id: string;
  plan: "snapshot" | "mvp_blueprint" | "admin";
  status: "active" | "pending" | "expired" | "refunded";
  source: "manual" | "stripe" | "external_payment_link";
  activated_at: string | null;
  expires_at: string | null;
};
```

Suggested endpoints:

```text
GET /api/me/entitlement
POST /api/admin/entitlements/manual-activate
```

For the first paid test, manual activation is acceptable if it avoids delaying the backend.

## Single DOCX decision

Eliminate the two-DOCX flow for MVP.

Old behavior:

```text
master DOCX
institutional DOCX
```

MVP behavior:

```text
one Ingeniometrix DOCX
```

The single DOCX should be:

- editable;
- Spanish-only;
- branded with Ingeniometrix style;
- concise enough for review;
- evidence-bound;
- not a final thesis;
- not institution-specific unless a template option is explicitly selected later.

Recommended export name:

```text
plan-investigacion-ingeniometrix.docx
```

Later, after monetization validation, we can reintroduce institutional templates as a paid tier.

## What to eliminate from MVP

These should be removed, hidden, or deferred from the product path for MVP.

### 1. Second DOCX / institutional reduction

Remove from MVP path.

Reason:

- doubles QA burden;
- caused separate failures around media assets and layout;
- less important than one reliable paid deliverable.

Keep only as future module:

```text
advanced_institutional_templates
```

### 2. Hero image / generated cover visual

Defer.

Reason:

- visual polish is not required to monetize this week;
- image generation adds cost, latency, and failure modes;
- old backlog already had hero policy issues.

If visual needed, use deterministic branded cover block, not AI image generation.

### 3. Public developer traceability appendices

Remove from public DOCX.

Reason:

- user-facing DOCX should not expose internal paths, hashes, debug/provider details;
- traceability remains as JSON/evidence log.

### 4. Duplicate lab pages

Do not ship:

```text
/blueprint-launch/*
/lab/master-blueprint/*
/lab/evidence-source-selection
```

Reason:

- useful internally but confusing commercially;
- product must route through `/projects/[id]`.

Keep behind dev/admin only if needed.

### 5. Mutable latest artifact readers

Eliminate from production path.

Reason:

- contamination risk;
- old runs leaked assets/content;
- DB-persisted run IDs and artifact refs are required.

### 6. Diagnostic continuation after blocked gates

Eliminate from production path.

Reason:

- old pipeline generated DOCX despite blocked matrix/degraded handoff;
- commercial output must stop and ask for user action.

Diagnostic mode may remain only with explicit dev flag.

### 7. Complex DOCX QA scope

Defer full QA around:

- two TOCs;
- generated figures;
- schedule Gantt visual;
- equation image fallback;
- media assets in institutional version.

MVP QA should focus on:

- one DOCX generated;
- no invented citations;
- references resolve;
- no internal traceability leaks;
- reasonable length;
- Spanish sections present;
- no blocked readiness report.

### 8. Advanced template marketplace

Defer.

Reason:

- MVP needs one Ingeniometrix style;
- institutional templates can become monetized upsell later.

### 9. Full automation of restricted PDFs

Defer.

Reason:

- avoid CAPTCHA/browser scraping;
- if a PDF is blocked, ask user to upload/provide it;
- source health should remain explicit.

### 10. Large-scale admin/dashboard analytics

Defer.

Reason:

- useful later;
- not needed to validate paid demand this week.

## What must stay for MVP

### 1. Deep Research Light fallback

Keep.

Reason:

- it rescues weak source discovery;
- it can propose secondary references;
- it reduces dead ends for narrow topics.

But keep it constrained:

```text
candidate discovery only → source selection → evidence acquisition → citable only after verification
```

### 2. Human source selection

Keep.

Reason:

- ethical boundary;
- reduces hallucinated bibliographies;
- gives user control.

### 3. Evidence readiness gates

Keep.

Reason:

- monetization will fail if output looks polished but academically unsafe.

### 4. Single branded export

Keep.

Reason:

- paid users need a concrete deliverable;
- one DOCX is easier to QA and support.

### 5. Support exports

Keep if cheap:

- BibTeX;
- RIS;
- evidence log JSON.

These create differentiation: traceable academic planning, not generic text generation.

## MVP product promise

Avoid promising:

```text
"Generamos tu tesis"
```

Promise instead:

```text
Ingeniometrix te entrega un plan inicial de investigación, trazable y editable, con fuentes revisables, estructura académica y recomendaciones para avanzar con criterio.
```

## Recommended this-week build order

### Day 1 — Backend skeleton and frontend cables

- Implement DB-backed 7-stage status model.
- Add project status endpoint.
- Wire `/projects/[id]` to real backend status DTO.
- Keep exports disabled until blueprint exists.

### Day 2 — Source discovery + Deep Research Light fallback

- OpenAlex/Crossref search adapter.
- Candidate persistence.
- Human selection endpoint.
- Deep Research Light run endpoint as fallback.
- UI shows fallback candidates separately.

### Day 3 — Minimal EvidencePackage + readiness

- Selected sources become `EvidencePackageV1`.
- Source health/readiness report.
- User action blockers.
- No citable claims from Deep Research until verified.

### Day 4 — Minimal Blueprint + preview

- Generate deterministic/LLM blueprint sections from EvidencePackage.
- Add consistency/readiness report.
- Preview in `BlueprintPanel`.

### Day 5 — Single DOCX + payment/manual entitlement

- One branded Ingeniometrix DOCX.
- BibTeX/RIS/evidence log.
- Entitlement flag gates export/download.
- Campaign CTA points to checkout/payment link or manual access process.

## Definition of done for paid MVP

A paid user can:

1. start from `/campana` or `/projects/new`;
2. create one project;
3. complete intake;
4. run source discovery;
5. select sources;
6. use Deep Research Light if normal discovery is weak;
7. generate evidence/readiness;
8. generate blueprint preview;
9. pay or be manually entitled;
10. download one Ingeniometrix DOCX plus support exports.

Production must block instead of generating if:

- no sufficient sources;
- source health is too weak;
- citations cannot resolve;
- readiness is blocked;
- output would include unverified Deep Research candidates as citations.
