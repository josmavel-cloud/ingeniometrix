# Lab A/B Read-only Flow Remap Plan

Branch/worktree: `mvp/backend-core-clean`  
Original read-only source: `codex/lab-a-b-diagnostic-pipeline`  
Rule: Lab A/B is the original flow reference only. Do not mutate it while building the new backend flow.

## 1. Original Lab A/B flow at high level

The existing diagnostic pipeline is conceptually valuable, but too entangled for direct MVP product work. Its useful product shape is:

```text
Structured intake
  -> candidate source search
  -> human source selection
  -> evidence access/materialization
  -> evidence extraction and quality gates
  -> formal evidence handoff
  -> blueprint/template planning
  -> section generation
  -> consistency/provenance/validation
  -> exportable academic package
```

The original pipeline is split into three practical areas:

### Area 0 — Candidate discovery before Lab A

Purpose: produce candidate sources for human review.

Current entry point:

```bash
npx tsx scripts/run-evidence-candidate-search.ts --case <case_id> --expand --max-candidates 15
```

Current responsibilities:

1. Load structured intake fixture.
2. Normalize/parse intake fields.
3. Build category-based keyword expansion.
4. Query OpenAlex/Crossref through local search helpers.
5. Deduplicate/rerank candidates.
6. Detect stale-topic contamination.
7. Write review artifacts.

Main outputs:

- `candidate-sources.json`
- `candidate-sources-summary.md`
- `source-selection-template.json`
- `run-summary.json`

Product meaning:

- This is the **source discovery** stage.
- It must not create citable evidence yet.
- It should feed a human selection step.

### Area 1 — Lab A / Evidence Engine

Purpose: convert selected sources into a traceable evidence handoff.

Current entry point:

```bash
npx tsx scripts/run-evidence-selected-sources-steps-2-6.ts --case <case_id>
```

Current conceptual steps:

| Step | Product meaning | Current role |
| --- | --- | --- |
| Step 1 / pre-step | intake normalization | Builds project/intake snapshots and global context. |
| Step 2 | source access resolution | Checks selected sources, access, public metadata/PDF availability. |
| Step 3 | evidence planning | Decides what evidence each selected source can support. |
| Step 4 | content materialization | Retrieves/materializes text/PDF/user-provided files when possible. |
| Step 5 | signal extraction | Extracts snippets, source signals, assets, secondary reference candidates. |
| Step 6 | evidence consolidation | Produces consolidated evidence and formal handoff shape. |

Important current gates:

- Block if source access/evidence planning is insufficient unless explicit diagnostic override.
- User-provided PDFs are diagnostic until human production review.
- Deep Research supplement is discovery-only, not citable evidence.
- Secondary references are queued, not silently treated as validated.

Main outputs:

- selected-source bundle
- access resolution report
- evidence planning report
- materialization manifest
- signal extraction summary
- consolidated evidence artifact
- `evidence-handoff-v1.json`
- reduced evidence pack
- source health report
- citation semantics report
- production readiness/dashboard
- telemetry

Product meaning:

- This is the **Evidence Engine**.
- Its only production-grade output should be an immutable, validated evidence handoff.
- It should not generate the final academic document.

### Area 2 — Lab B / Blueprint Engine

Purpose: consume the Lab A handoff and produce a traceable academic package.

Current entry points:

```bash
npx tsx scripts/run-lab-b-full-diagnostic-docx.ts --handoff <path-to-evidence-handoff-v1.json>
```

or older lab runners:

```bash
npx tsx scripts/run-master-blueprint-lab-steps-5-11.ts
npx tsx scripts/run-master-blueprint-steps-11-13.ts
```

Current conceptual steps:

| Product step | Lab key | Current role |
| --- | --- | --- |
| 7 | template runtime/import context | Load master/institutional template and map evidence to sections. |
| 8 | prompt planning | Build section plan, generation waves, citation plan, asset policy. |
| 9 | section generation | Generate evidence-bound section drafts. |
| 10 | consistency matrix | Derive/validate problem-objective-hypothesis-method alignment. |
| 11 | blueprint composition | Compose blueprint, provenance, validation, institutional reduction. |
| 12 | master DOCX render | Render master academic DOCX and QA it. |
| 13 | institutional DOCX render | Render university-specific DOCX and QA it. |

Current guardrails:

- Validate Evidence Engine handoff schema.
- Build reduced evidence pack to avoid evidence overload/source dominance.
- Run production safety checks.
- Scan for stale content/previous-topic contamination.
- Select method only from evidence-bound context.
- Enforce semantic source-use policy.
- Validate public text quality, equations, DOCX package structure, citations, and appendices.

Main outputs:

- `blueprint-engine-input.json`
- `reduced-evidence-pack.json`
- `production-safety-report.json`
- `fresh-run-isolation-report.json`
- `stale-content-scan-report.json`
- `method-selection-report.md/json`
- `method-generation-contract.json`
- `10-section-prompt-plan.json`
- `20-master-section-drafts.json`
- `30/31-consistency-matrix*.json`
- `40-legacy-blueprint.json`
- `50-provenance-report.json`
- `60-validation-report.json`
- `61-coherence-report.json`
- `70-university-blueprint.json`
- `90-package-quality-summary.json`
- `115/135-academic-document-model.json`
- `12-master-docx-preview.docx`
- `13-university-docx-preview.docx`
- DOCX QA reports
- `full-diagnostic-summary.json`

Product meaning:

- This is the **Blueprint Engine**.
- It should only consume a formal evidence handoff.
- It should not search sources or mutate Evidence Engine artifacts.

## 2. Why not port Lab A/B directly

The original flow is useful but not clean enough to become the MVP backend as-is:

- It mixes product logic, diagnostic artifacts, reports, filesystem IO, and CLI concerns.
- It depends on `artifacts-local` and mutable `latest` paths in places.
- It contains large runners that are hard to debug.
- It has lab-only routes mixed into the Next app.
- It has compatibility logic from multiple iterations.
- It can produce impressive diagnostic DOCX output while still being production-ineligible.

Therefore the new worktree should preserve the **flow semantics**, not copy the implementation shape.

## 3. New clean flow at high level

The new backend should express the same pipeline as explicit, small engines:

```text
Project Intake
  -> Source Discovery
  -> Human Source Selection
  -> Evidence Engine
  -> Evidence Handoff
  -> Blueprint Engine
  -> Export Engine
  -> Review/Delivery State
```

### New Stage 1 — Project Intake

Goal: capture the user's academic request in a normalized backend object.

Inputs:

- user id/session
- project metadata
- structured intake
- university/template target

Outputs:

- `Project`
- `Intake`
- normalized search brief
- audit event

Backend contract:

```text
POST /api/projects
PUT /api/projects/:id/intake
```

### New Stage 2 — Source Discovery

Goal: produce candidate sources, not evidence.

Inputs:

- intake/search brief
- provider policy
- max candidates

Outputs:

- `SourceCandidate[]`
- discovery run summary
- warnings/coverage notes

Rules:

- no source is citable yet;
- no claims are generated here;
- stale-topic contamination checks are mandatory;
- OpenAlex/Crossref adapters stay isolated.

Backend contract:

```text
POST /api/projects/:id/source-discovery-runs
GET /api/projects/:id/source-discovery-runs/:runId
```

MVP shortcut: can initially reuse existing `/api/projects/:id/search` if service boundaries are clean.

### New Stage 3 — Human Source Selection

Goal: convert candidates into selected/rejected/undecided source decisions.

Inputs:

- candidate ids
- reviewer notes
- selection policy

Outputs:

- `SourceSelectionRun`
- selected source registry
- audit event

Rules:

- no automatic source promotion to evidence;
- selected source count and quality gate must be explicit;
- rejected/undecided sources stay recorded.

Backend contract:

```text
PUT /api/projects/:id/source-selection
```

MVP shortcut: can initially map to existing references route if it persists enough detail.

### New Stage 4 — Evidence Engine

Goal: transform selected sources into a validated evidence package.

Substeps:

1. access resolution
2. evidence planning
3. materialization/reference capture
4. extraction/snippet building
5. source health/citation semantics
6. evidence handoff creation

Outputs:

- `EvidenceRun`
- `SourceHealthReport`
- `EvidenceUnit[]`
- `SectionPacket[]`
- `EvidenceEngineHandoffV1`
- production readiness state

Rules:

- citable evidence requires selected source + validated metadata + eligible evidence unit;
- user PDFs are not production-valid until explicit review;
- secondary references become queue items, not citations;
- Deep Research remains discovery supplement unless passed through this engine.

Backend contract:

```text
POST /api/projects/:id/evidence-runs
GET /api/projects/:id/evidence-runs/:runId
GET /api/projects/:id/evidence-runs/:runId/handoff
```

MVP shortcut: first implementation may create a minimal evidence handoff from selected metadata and explicit assumptions, then expand materialization later.

### New Stage 5 — Blueprint Engine

Goal: consume only `EvidenceEngineHandoffV1` and create the academic blueprint package.

Substeps:

1. validate handoff
2. select/pin template runtime
3. reduce evidence pack
4. plan sections
5. generate section drafts
6. derive consistency matrix
7. compose blueprint
8. validate provenance/coherence
9. produce institutional package

Outputs:

- `BlueprintRun`
- `BlueprintVersion`
- section drafts
- consistency matrix
- provenance report
- validation/coherence report
- package quality summary

Rules:

- no direct source search in Blueprint Engine;
- no claims without evidence/assumptions/gaps;
- blocked/degraded states must be surfaced to frontend;
- LLM output is schema-validated before persistence.

Backend contract:

```text
POST /api/projects/:id/blueprint-runs
GET /api/projects/:id/blueprint-runs/:runId
GET /api/projects/:id/blueprints/:versionId
```

MVP shortcut: can initially generate a deterministic blueprint skeleton plus evidence/assumption log before real section LLM generation.

### New Stage 6 — Export Engine

Goal: generate delivery artifacts from a saved blueprint version.

Outputs:

- evidence log JSON
- BibTeX
- RIS
- DOCX when stable

Rules:

- exports read from persisted blueprint/evidence records;
- exports do not regenerate research claims;
- DOCX renderer can remain internal/manual until stable enough.

Backend contract:

```text
GET /api/projects/:id/blueprints/:versionId/evidence-log
GET /api/projects/:id/blueprints/:versionId/bibtex
GET /api/projects/:id/blueprints/:versionId/ris
GET /api/projects/:id/blueprints/:versionId/docx
```

## 4. First clean implementation plan

### Phase A — Flow contracts before code movement

Write stable TypeScript contracts under a new backend-core area before importing old lab logic.

Proposed new files:

```text
server/mvp-core/contracts/project-intake.ts
server/mvp-core/contracts/source-discovery.ts
server/mvp-core/contracts/source-selection.ts
server/mvp-core/contracts/evidence-run.ts
server/mvp-core/contracts/evidence-handoff.ts
server/mvp-core/contracts/blueprint-run.ts
server/mvp-core/contracts/export-artifact.ts
server/mvp-core/contracts/api-result.ts
```

Do not duplicate everything from Lab A/B. Start with the minimum fields needed for a backend E2E run.

### Phase B — Backend E2E skeleton with mock adapters

Create:

```text
scripts/mvp/run-backend-core-e2e.ts
```

First version should run without OpenAI/OpenAlex/Crossref keys:

1. create project/intake;
2. create mock candidate sources;
3. select mock sources;
4. create minimal evidence handoff;
5. generate deterministic blueprint skeleton;
6. generate evidence log JSON;
7. print IDs and statuses.

This proves the application state machine before provider complexity.

### Phase C — Add real adapters one by one

After the mock flow passes:

1. wire OpenAlex/Crossref for candidate discovery;
2. persist selected sources;
3. build minimal source health;
4. build formal `EvidenceEngineHandoffV1`;
5. only then introduce LLM section generation.

### Phase D — Harvest Lab B quality gates selectively

Bring in safeguards as small functions, not the entire runner:

- production safety;
- source health;
- citation semantics;
- evidence budget/reduced pack;
- fresh-run isolation;
- semantic source-use policy;
- method selection only when evidence handoff is strong enough.

### Phase E — Frontend cables

Once backend E2E passes, document and stabilize:

```text
docs/api/mvp-frontend-contract.md
```

Frontend should connect to statuses and artifacts, not to lab folders.

## 5. New high-level backend milestones

### Milestone 1 — Deterministic backend skeleton

Exit criteria:

- local DB works;
- mock E2E runner reaches `BLUEPRINT_READY` or explicit blocked state;
- evidence log export works;
- no lab route or `artifacts-local/latest` dependency.

### Milestone 2 — Real source discovery

Exit criteria:

- OpenAlex/Crossref candidate discovery works;
- candidates are persisted;
- human selection is persisted;
- stale-topic contamination guard exists.

### Milestone 3 — Minimal Evidence Engine

Exit criteria:

- selected sources become `EvidenceEngineHandoffV1`;
- source health and citation eligibility are explicit;
- insufficient evidence blocks production blueprint generation cleanly.

### Milestone 4 — Minimal Blueprint Engine

Exit criteria:

- blueprint generation consumes only handoff;
- deterministic fallback works;
- LLM generation is schema-validated;
- provenance/coherence reports exist.

### Milestone 5 — Exportable package

Exit criteria:

- evidence log JSON works;
- BibTeX/RIS works;
- DOCX either works or is clearly marked internal/manual;
- frontend contract is stable.

## 6. Immediate next action

Before coding, read the current product path files and verify whether they already support pieces of Milestone 1:

1. `prisma/schema.prisma`
2. `server/projects/project-service.ts`
3. `server/projects/project-validation.ts`
4. `server/retrieval/reference-service.ts`
5. `server/blueprint/blueprint-service.ts`
6. `server/blueprint/blueprint-export.ts`
7. `app/api/projects/[id]/blueprints/route.ts`

Then implement the mock backend E2E runner against the local DB.
