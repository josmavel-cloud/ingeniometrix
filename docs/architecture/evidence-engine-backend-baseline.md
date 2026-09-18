# Evidence Engine Backend Baseline

Status: PASS_WITH_WARNINGS

Date: 2026-09-18

## Authority

Active backend:

```text
/home/pepe/.openclaw/workspace/ingeniometrix-wt-mvp-backend-core
```

Canonical branch:

```text
mvp/backend-core-clean
```

Historical reference only:

```text
/home/pepe/.openclaw/workspace/ingeniometrix/app/lab/master-blueprint
```

The historical path is not a source of truth, must not receive current MVP work,
and must not be used to reset or replace the active backend.

## Baseline decision

The Release 0 backend is the seven-step contract in
`server/mvp/release0-contracts.ts`. Steps 1 through 6 are the current canonical
implementation. Step 7 remains planned and is explicitly outside B0.

The following directories are not equivalent alternatives to the canonical
pipeline:

- `server/blueprint/`: legacy blueprint and current individual export helpers.
- `server/blueprint-v2/`: Lab-derived engine used by adapters and historical routes.
- `server/blueprint-engine/`: contracts and quality helpers shared with older flows.
- `server/mvp/autonomous-pipeline-service.ts`: parallel diagnostic/autonomous path.
- `server/mvp/thesis-plan-*`: predecessor thesis-plan path.
- `server/mvp/final-docx-service.ts` and `advanced-thesis-docx-service.ts`:
  domain-contaminated predecessor output paths.

Preserve these paths until their remaining consumers are removed with evidence.

## Canonical pipeline

| Step | Status | Entry point | Service | Input | Output | Persistence | Downstream |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Intake normalization | IMPLEMENTED_CANONICAL | runner; Step 2 fallback | `intake-normalization-service.ts` | `Project`, `Intake` | normalized intake, quality, retrieval hints | `MvpStepRun`, `AuditLog`, artifact manifest | Step 2 |
| 2 Evidence-informed refinement | IMPLEMENTED_CANONICAL | `POST /api/projects/[id]/mvp/step-2` | `topic-refinement-service.ts` | Step 1 snapshot plus exploratory references | three alternatives and selected option contract | `MvpStepRun`, selection `AuditLog`, manifest | Step 3 |
| 3 First source batch | IMPLEMENTED_CANONICAL | `GET/POST /api/projects/[id]/source-selection` | `source-selection-service.ts` | selected refinement plus `Reference`/`ProjectReference` | candidate batch and selected reference ids | `ProjectReference`, `MvpStepRun`, manifest | Step 4 or Step 5 |
| 4 Additional sources | IMPLEMENTED_CANONICAL | `POST /api/projects/[id]/mvp/step-4` | `source-selection-service.ts` | first batch and selected refinement | expanded batch and final selection | `ProjectReference`, `MvpStepRun`, manifest | Step 5 |
| 5 Evidence materialization | IMPLEMENTED_CANONICAL | `POST /api/projects/[id]/mvp/step-5` | `evidence-materialization-service.ts` | selected references and recovered source material | ledger, cards, materializations, assets, semantic extraction | evidence models, `MvpStepRun`, filesystem | Step 6 |
| 6 Blueprint DOCX | IMPLEMENTED_CANONICAL | `POST /api/projects/[id]/mvp/step-6` | `step6-blueprint-docx-service.ts` | latest Step 5 ledger and artifacts | blueprint package, DOCX, `BlueprintVersion` | `BlueprintVersion`, `MvpStepRun`, filesystem | Step 7 |
| 7 Export package | PLANNED | individual legacy GET routes only | `server/blueprint/blueprint-export.ts` | Step 6 version/package/ledger | DOCX, BibTeX, RIS, evidence log, manifest | incomplete | delivery |

Step 1 does not have a dedicated product API. The intake route persists raw
input. Step 2 invokes Step 1 when no valid Step 1 run exists. This is functional
but is an API-contract gap to monitor.

## Working tree classification

The matrix below classifies the complete pre-B0 dirty working tree. B0-created
baseline files are listed separately.

### Modified tracked files

| File | Purpose / current consumer | Step | Canonical | Risk if removed | Classification | Action |
| --- | --- | --- | --- | --- | --- | --- |
| `compose.yml` | bind Postgres to loopback | infra | yes | exposes or changes local DB behavior | SUPPORTING | KEEP_AND_VERSION |
| `llm/provider.ts` | adds structured vision contract used by Step 5 | 5 | yes | visual evidence calls fail | CANONICAL | KEEP_AND_VERSION |
| `llm/providers/openai.ts` | Responses API vision implementation and usage tracking | 5 | yes | visual extraction fails | CANONICAL | KEEP_AND_VERSION |
| `next-env.d.ts` | generated Next route type reference | build | supporting | typegen mismatch | GENERATED | KEEP_AND_VERSION |
| `package.json` | canonical diagnostics and pipeline commands | all | yes | baseline cannot be operated | SUPPORTING | KEEP_AND_VERSION |
| `prisma/schema.prisma` | run/evidence persistence and indexes | all | yes | schema and code diverge | CANONICAL | KEEP_AND_VERSION |
| `scripts/mvp/run-normalized-intake-discovery-first-batch.ts` | older Step 1/discovery runner updated for `MvpStepRun` | 1-3 | no | historical diagnostic lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `server/llm-usage-registry.ts` | token/cost attribution by run/stage/source | all LLM | yes | traceability is reduced | SUPPORTING | KEEP_AND_VERSION |
| `server/mvp/intake-normalization-service.ts` | canonical Step 1 | 1 | yes | Step 1 lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/source-inspection-service.ts` | pre-Step-5 source inspection consumed by readiness/materialization | 5 support | partial | source health degrades | SUPPORTING | KEEP_AND_VERSION |
| `server/retrieval/reference-access.ts` | truthful OA/PDF access classification | 3-5 | yes | access claims regress | SUPPORTING | KEEP_AND_VERSION |
| `server/retrieval/reference-search-v2.ts` | search plan/scoring/venue penalty | 2-4 | yes | discovery quality regresses | CANONICAL | KEEP_AND_VERSION |

### Untracked recent files

| File | Purpose / current consumer | Step | Canonical | Risk if removed | Classification | Action |
| --- | --- | --- | --- | --- | --- | --- |
| `CODEX_HANDOFF_2026-05-12.md` | historical recovery context | all | no | provenance lost | LEGACY | KEEP_AND_VERSION |
| `app/api/projects/[id]/mvp/step-2/route.ts` | refinement and human selection API | 2 | yes | no product entry point | CANONICAL | KEEP_AND_VERSION |
| `app/api/projects/[id]/mvp/step-4/route.ts` | additional source API | 4 | yes | no product entry point | CANONICAL | KEEP_AND_VERSION |
| `app/api/projects/[id]/mvp/step-5/route.ts` | evidence materialization API | 5 | yes | no product entry point | CANONICAL | KEEP_AND_VERSION |
| `app/api/projects/[id]/mvp/step-6/route.ts` | blueprint/DOCX API | 6 | yes | no product entry point | CANONICAL | KEEP_AND_VERSION |
| `app/api/projects/[id]/source-selection/route.ts` | Step 3 source gate | 3 | yes | human selection is lost | CANONICAL | KEEP_AND_VERSION |
| `docs/architecture/release0-backend-contracts.md` | human-readable Release 0 contract | all | yes | pipeline ambiguity returns | SUPPORTING | KEEP_AND_VERSION |
| `scripts/mvp/fixtures/seismic-engineering-intake.ts` | domain fixture | test | no | one diagnostic fixture lost | FIXTURE | KEEP_AND_VERSION |
| `scripts/mvp/lib/step1-fixture-project.ts` | fixture project helper | test | no | Step 1 diagnostics fail | FIXTURE | KEEP_AND_VERSION |
| `scripts/mvp/python/step5_pdf_layout_inventory.py` | PDF layout inventory helper | 5 | yes | Step 5 asset extraction degrades | SUPPORTING | KEEP_AND_VERSION |
| `scripts/mvp/python/__pycache__/*.pyc` | generated Python bytecode | none | no | none | CACHE | CLEAN_NOW |
| `scripts/mvp/run-autonomous-pipeline.ts` | parallel autonomous runner | parallel | no | experimental path lost | LEGACY | KEEP_AND_VERSION |
| `scripts/mvp/run-custom-bridge-cpr-step1-3.ts` | bridge/CPR diagnostic | 1-3 | no | domain diagnostic lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-release0-contracts-diagnostics.ts` | static contract healthcheck | all | yes | canonical static healthcheck lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-source-readiness.ts` | parallel readiness runner | pre-5 | no | predecessor diagnostic lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step1-intake-diagnostics.ts` | Step 1 diagnostic | 1 | yes | Step 1 verification lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step1-intake-normalization.ts` | Step 1 runner | 1 | yes | direct runner lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step2-topic-refinement-diagnostics.ts` | Step 2 diagnostic | 2 | yes | Step 2 verification lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step3-source-selection-diagnostics.ts` | Step 3 diagnostic | 3 | yes | Step 3 verification lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step5-asset-inspection-report.ts` | human asset inspection PDF | 5 | no | manual QA tool lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step5-completion-pack.ts` | aggregates Step 5 diagnostics | 5 | no | diagnostic pack lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step5-evidence-materialization-diagnostics.ts` | Step 5 diagnostic | 5 | yes | Step 5 verification lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-step6-blueprint-docx-diagnostics.ts` | Step 6 diagnostic | 6 | yes | Step 6 verification lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-steps1-4-diagnostics.ts` | integrated handoff diagnostic | 1-4 | yes | continuity verification lost | DIAGNOSTIC | KEEP_AND_VERSION |
| `scripts/mvp/run-topic-refinement-step3-diagnostics.ts` | older refinement/source diagnostic | 2-3 | no | historical comparison lost | LEGACY | KEEP_AND_VERSION |
| `server/mvp/autonomous-pipeline-quality.ts` | QA for parallel runner | parallel | no | autonomous diagnostic breaks | LEGACY | KEEP_AND_VERSION |
| `server/mvp/autonomous-pipeline-service.ts` | parallel 10-step, fixture-heavy pipeline | parallel | no | recent experimental work lost | LEGACY | KEEP_AND_VERSION |
| `server/mvp/bibliographic-map-service.ts` | map/readiness predecessor used by parallel diagnostics | pre-5 | no | parallel diagnostics break | LEGACY | KEEP_AND_VERSION |
| `server/mvp/evidence-materialization-service.ts` | canonical Step 5 | 5 | yes | Step 5 lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/evidence-materialization-types.ts` | Step 5 contracts | 5 | yes | Step 5 type contract lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step5-asset-visual-localization.v1.ts` | versioned visual localization prompt | 5 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step5-equation-latex-ocr.v1.ts` | versioned equation prompt | 5 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step5-source-evidence-extraction.v1.ts` | versioned evidence extraction prompt | 5 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step6-editorial-review.v1.ts` | versioned editorial prompt | 6 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step6-hero-image.v1.ts` | versioned image prompt | 6 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step6-section-draft.v1.ts` | versioned section prompt | 6 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/prompts/step6-title-generation.v1.ts` | versioned title prompt | 6 | yes | prompt provenance lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/release0-contracts.ts` | executable seven-step contract | all | yes | canonical identity lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/source-readiness-service.ts` | parallel source readiness | pre-5 | no | autonomous path breaks | LEGACY | KEEP_AND_VERSION |
| `server/mvp/source-selection-service.ts` | canonical Steps 3 and 4 | 3-4 | yes | source gate lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/step-run-service.ts` | creates/completes/fails `MvpStepRun` | 1-6 | yes | execution tracking lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/step5-blueprint-v2-adapter.ts` | maps Step 5 ledger to reused v2 shape | 5-6 | yes | Step 6 handoff breaks | SUPPORTING | KEEP_AND_VERSION |
| `server/mvp/step5-llm-cache.ts` | cache key/read/write for Step 5 LLM | 5 | yes | repeatability/cost control degrades | SUPPORTING | KEEP_AND_VERSION |
| `server/mvp/step6-blueprint-docx-service.ts` | canonical Step 6 | 6 | yes | Step 6 lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/step6-blueprint-docx-types.ts` | Step 6 contracts | 6 | yes | Step 6 type contract lost | CANONICAL | KEEP_AND_VERSION |
| `server/mvp/topic-refinement-service.ts` | canonical Step 2 | 2 | yes | Step 2 lost | CANONICAL | KEEP_AND_VERSION |

### B0-created or confirmed baseline files

| File | Classification | Action |
| --- | --- | --- |
| existing `.nvmrc` pin (`20.20.2`) | SUPPORTING | KEEP_AND_VERSION |
| `.gitignore` Python cache rules | SUPPORTING | KEEP_AND_VERSION |
| `prisma/migrations/20260918000000_baseline/migration.sql` | CANONICAL | KEEP_AND_VERSION |
| `prisma/migrations/migration_lock.toml` | CANONICAL | KEEP_AND_VERSION |
| this document | SUPPORTING | KEEP_AND_VERSION |
| `docs/thread-briefs/20260918-IMX-ARCH-backend-baseline-recovery.md` | SUPPORTING | KEEP_AND_VERSION |

No application artifact under `artifacts-local/` is committed. `node_modules/`,
`.next/`, logs and TypeScript build info remain ignored.

## Step-to-step continuity

| Producer | Entity or field | Consumer | Consumed | Source of truth | Redundant / action |
| --- | --- | --- | --- | --- | --- |
| Intake route | `Project.intake` | Step 1 | yes | DB | keep |
| Step 1 | `MvpStepRun.outputSnapshotJson.normalized` | Step 2 | yes | latest completed Step 1 run | keep |
| Step 1 | filesystem manifest | audit/diagnostic | not by Step 2 | DB snapshot | monitor |
| Step 2 selection | `AuditLog` event `MVP_STEP2_REFINEMENT_OPTION_SELECTED` | Step 3 | yes | DB audit event | keep; typed table could be considered later |
| Step 2 | `first_batch_candidate_ids` | Step 3 presentation | yes | selected option payload | keep |
| Step 3/4 | `ProjectReference.selected`, `selectedOrder` | Step 5 | yes | DB | keep |
| Step 3/4 | batch manifests | human/audit | not authoritative for Step 5 | DB selection | cleanup_after_next_step |
| Step 5 | latest `ProjectEvidenceLedger.ledgerJson` | Step 6 | yes | DB ledger | keep |
| Step 5 | cards/materializations/assets | Step 6 and audit | yes | DB plus referenced files | keep |
| Step 5 | asset inspection PDF | human diagnostic | no product consumer | diagnostic filesystem | cleanup_later |
| Step 6 | `BlueprintVersion` | export routes | yes | DB | keep |
| Step 6 | blueprint package and DOCX path | future Step 7 | contract only | filesystem plus run snapshot | monitor until Step 7 |
| Step 7 routes | response-only BibTeX/RIS/evidence log | user | yes individually | generated response | package/manifest missing |

Cleanup candidates are flags, not deletion instructions.

## Canonical LLM and prompt inventory

Provider behavior for text/structured calls:

- OpenAI Responses API.
- `store: false`.
- structured calls use strict JSON Schema.
- request timeout defaults to 120 seconds and retry count to one.
- no temperature/top-p override.
- the provider sends a single text `input`; registry `systemPrompt` and
  `userPromptTemplate` values are concatenated by callers rather than sent as
  separate API roles.

### Step 1 normalization

- Call ID: `mvp_intake_normalization`.
- Function: `normalizeIntakeForMvpProject`.
- Model: `input.model`, then `INTAKE_NORMALIZATION_MODEL`, then
  `gpt-5.4-nano`.
- Prompt location: `intake-normalization-service.ts::buildPrompt`.
- Version: `ingeniometrix-step1-intake-normalization-v3`.
- Classification: BUILDER_HARDCODED.
- System prompt: none as a separate API role.
- User prompt: normalize the structured intake, preserve intent, remove minor
  ambiguity, produce Spanish UI fields and English retrieval hints, never
  invent data/results/locations/norms/conclusions. Dynamic variables are all
  eight intake fields.
- Output schema: `NormalizedMvpIntake` inline JSON schema.
- Tracking: project, user, run, stage `intake`, model, prompt version and token
  registry delta.
- Consumer: Step 2.

### Step 2 exploratory search planning

- Call ID: `reference_search_v2_plan`.
- Function: `reference-search-v2.ts::buildPrompt`.
- Model: `SOURCE_DISCOVERY_PLAN_MODEL` or `gpt-5.4-nano`.
- Version: no explicit prompt version.
- Classification: BUILDER_HARDCODED.
- System prompt: none as a separate role.
- User prompt: act as a senior literature retrieval specialist; turn the
  Spanish intake into necessary/complementary/optional multilingual keyword
  groups and concise OpenAlex query packs without inventing facts or methods.
  Dynamic variables are topic, context, population, methodology, line, data,
  constraints and notes.
- Output schema: `reference-search-plan.schema.json`.
- Tracking: provider token registry; stage attribution is less complete than
  the canonical MVP step calls.
- Consumer: source discovery and Step 2 evidence map.

### Step 2 evidence-informed refinement

- Call ID: `mvp_evidence_informed_topic_refinement`.
- Function: `runMvpEvidenceInformedTopicRefinement`.
- Model: `input.model`, `TOPIC_REFINEMENT_MODEL`, or `gpt-5.4-mini`.
- Version: `ingeniometrix-step2-evidence-informed-refinement-v1`.
- Classification: BUILDER_HARDCODED.
- System prompt: none as a separate role.
- User prompt: act as an applied-research strategist using only supplied
  bibliographic signals; return exactly conservative, balanced and ambitious
  alternatives, with real persisted source ids and explicit risk. Dynamic
  variables are normalized intake, coverage/access signals, recurring concepts
  and reference metadata/abstract excerpts.
- Output schema: inline `alternatives`, `recommended_option_id`,
  `coverage_notes` schema.
- Tracking: full project/user/run/stage attribution and prompt version.
- Consumer: human selection, then Step 3.

### Source translation support

- Calls: `reference_language_detection_batch` and
  `reference_translation_batch`.
- Function: `ensureReferenceTranslationsForLanguage`.
- Model: provider default (`LLM_DEFAULT_MODEL` or `gpt-5.4`).
- Version: none.
- Classification: BUILDER_HARDCODED.
- System prompt: none.
- User templates: detect language from title+abstract without translation; or
  translate title+abstract to the requested UI language without summarizing or
  inventing content.
- Output schemas: versioned JSON schemas under `ai/schemas/`.
- Tracking: stage `source_translation`.
- Consumer: source presentation/search results.

### Step 5 evidence extraction

- Call ID: `mvp_step5_source_evidence_extraction`.
- Function: Step 5 semantic extraction loop.
- Model: `IMX_STEP5_EXTRACTION_MODEL`, `LLM_FAST_MODEL`,
  `LLM_DEFAULT_MODEL`, then the service fallback.
- Prompt: `server/mvp/prompts/step5-source-evidence-extraction.v1.ts`.
- Version: `ingeniometrix-step5-source-evidence-extraction-v1`.
- Classification: VERSIONED_REGISTRY.
- System prompt, exact policy: extract traceable evidence only from supplied
  text/metadata; never invent citations, pages, findings, methods, data or
  equations; user-facing fields are Spanish.
- User template variables: final intake, section plan, source registry record,
  evidence basis, recovered chunks, asset candidates and source health.
- Output schema: quality, methods/theories, variables, limitations,
  traceable evidence items, asset reviews, section coverage, gaps and warnings.
- Tracking: prompt/schema/hash/cache/source attribution plus tokens/cost.
- Consumer: ledger/cards and Step 6.

### Step 5 visual localization

- Call ID: `mvp_step5_asset_visual_localization`.
- Function: Step 5 asset vision loop.
- Model: `IMX_STEP5_VISION_MODEL`, fast/default model, then service fallback.
- Prompt: `server/mvp/prompts/step5-asset-visual-localization.v1.ts`.
- Version: `ingeniometrix-step5-asset-visual-localization-v1`.
- Classification: VERSIONED_REGISTRY.
- System prompt, exact policy: validate one academic PDF asset image and return
  a tight bounding box; do not infer data or invent content.
- User variables: asset/source/kind/page/caption/description/section plus image.
- Output: localization status, normalized bbox, confidence, description,
  warnings.
- Tracking: full Step 5 vision attribution.
- Consumer: curated source assets.

### Step 5 equation OCR

- Call ID: `mvp_step5_equation_latex_ocr`.
- Model: Step 5 vision model.
- Prompt: `server/mvp/prompts/step5-equation-latex-ocr.v1.ts`.
- Version: `ingeniometrix-step5-equation-latex-ocr-v1`.
- Classification: VERSIONED_REGISTRY.
- System prompt, exact policy: transcribe one academic equation image into
  LaTeX using only visible notation; do not infer missing terms.
- User variables: asset/source/page/caption plus crop image.
- Output: status, LaTeX or null, confidence, Spanish description, warnings.
- Tracking: full Step 5 vision attribution.
- Consumer: structured assets and Step 6 renderer.

### Step 6 section generation

- Call ID: `mvp_step6_section_draft`.
- Function: Step 6 per-section generation.
- Model: `IMX_STEP6_SECTION_MODEL`, `LLM_DEFAULT_MODEL`, or `gpt-5.4`.
- Prompt: `server/mvp/prompts/step6-section-draft.v1.ts`.
- Version: `ingeniometrix-step6-section-draft-v1`.
- Classification: VERSIONED_REGISTRY.
- System prompt: responsible Spanish academic drafting from provided context
  only; no invented citations/data/results; declare gaps; preserve source,
  evidence, snippet and asset traceability; do not generate a complete thesis.
- User variables: project/style/page-budget/section/wave/evidence/source/assets
  and prior-section summaries.
- Output: section text, used ids, citation coordinates, assumptions,
  limitations, warnings and blocked flag.
- Tracking: run/stage/prompt/schema/cache plus detailed token/cost totals.
- Consumer: Step 6 package and DOCX.

### Step 6 editorial review

- Call ID: `mvp_step6_editorial_review`.
- Model: `IMX_STEP6_EDITORIAL_MODEL` or `gpt-5.4-mini`.
- Prompt: `server/mvp/prompts/step6-editorial-review.v1.ts`.
- Version: `ingeniometrix-step6-editorial-review-v1`.
- Classification: VERSIONED_REGISTRY.
- System prompt: superficial Spanish academic editing and compression only;
  preserve claims, citations and cross-references; add no new information.
- User variables: style contract, page budget, summaries and sections.
- Output: revised sections, notes and warnings.
- Tracking: Step 6 token/cost attribution.
- Consumer: final drafts and DOCX.

### Step 6 title generation

- Call ID: `mvp_step6_title_generation`.
- Model: `IMX_STEP6_TITLE_MODEL`, default, or `gpt-5.4`.
- Prompt: `server/mvp/prompts/step6-title-generation.v1.ts`.
- Version: `ingeniometrix-step6-title-generation-v1`.
- Classification: VERSIONED_REGISTRY.
- System prompt: generate a defensible Spanish academic title using only
  supplied content; introduce no unsupported object, method or context.
- User variables: project context, section summaries, constraints and evidence.
- Output: title, rationale, alternatives and warnings.
- Tracking: Step 6 token/cost attribution.
- Consumer: blueprint metadata and DOCX.

### Step 6 hero image

- Call ID: direct `images.generate`.
- Model: `OPENAI_IMAGE_MODEL` or `gpt-image-2`.
- Prompt: `server/mvp/prompts/step6-hero-image.v1.ts`.
- Version: `ingeniometrix-step6-hero-image-v1`.
- Classification: VERSIONED_REGISTRY.
- Prompt policy: sober methodological infographic; no fake data/results,
  citations, DOI, logos, brands or internal metadata. Dynamic variables are
  title, topic, knowledge area, country, methodology and section summary.
- Parameters: vertical or landscape size, configured quality or `high`, opaque
  PNG, one image.
- Output: PNG or deterministic SVG fallback.
- Tracking: model/status in Step 6 artifacts; image usage is not integrated
  with the text token registry.
- Consumer: Step 6 DOCX.

Prompts under `server/blueprint/`, `server/blueprint-v2/`,
`server/blueprint-engine/quality/`, template ingestion and the autonomous
pipeline are preserved but classified as parallel or legacy for Release 0.

## Database baseline

Engine: PostgreSQL. ORM: Prisma 6.19.3.

Core models:

- `User`, `Project`, `Intake`.
- `Reference`, `ProjectReference`.
- `BlueprintVersion`, `AuditLog`, `MvpStepRun`.

Evidence models:

- `ProjectTemplateContentPlan`.
- `ProjectEvidenceLedger`.
- `ProjectEvidenceCard`.
- `ProjectSourceMaterialization`.
- `ProjectSourceAsset`.

Catalog/template support models:

- taxonomy, topic suggestion and reference classification models;
- `Template`, `TemplateVersion`, `TemplateSource`, `TemplateAsset`.

Execution tracking is in `MvpStepRun`: identity, state, provider/model/prompt,
timing, retries, fallback, hashes, JSON snapshots, warnings/errors and artifact
paths. Token/cost detail remains in `artifacts-local/llm-usage/registry.json`,
not in a relational table.

### Migration strategy

`prisma/migrations/20260918000000_baseline/migration.sql` is a full initial
migration generated from an empty PostgreSQL database. Inspection found only
schema/type/table/index/foreign-key creation statements and no destructive SQL.

For a fresh empty database:

```bash
npx prisma migrate deploy
```

For any existing/shared database, do not run the initial migration blindly.
First compare it read-only:

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma
```

That self-comparison only checks connectivity and command behavior. A real
existing-database adoption must dump/backup the database, compare its live
schema against the migration/schema, review drift, and only then use
`prisma migrate resolve --applied 20260918000000_baseline` if and only if the
database is already structurally equivalent. Never use `db push` as migration
history.

Current configured DB was unavailable at `localhost:5433`, so no live drift
claim and no migration application were made during B0.

Cleanup candidates:

- `Intake.searchQuery`: no current canonical consumer found.
- free-form evidence status/type fields: active but weakly typed.
- token/cost tracking only in filesystem: adequate for diagnostics, weaker for
  production audit durability.
- `TemplateSource.fileData` and `TemplateAsset.fileData`: parallel template
  storage path; monitor object-storage boundary.

## Artifacts

`artifacts-local/` is ignored and measured about 1 GB during B0.

| Pattern | Classification | Policy |
| --- | --- | --- |
| `mvp-step1-*` through `mvp-step6-*` | CANONICAL_RUN_OUTPUT or DIAGNOSTIC | keep unversioned; never infer current health solely from latest historical run |
| `llm-usage/` | CANONICAL_RUN_OUTPUT | keep unversioned; contains local usage ledger |
| `asset-inspection/`, `step5-completion/` | DIAGNOSTIC | regenerable; clean later by explicit retention policy |
| `mvp-autonomous-*`, `mvp-thesis-plan-*`, `mvp-final-docx`, `mvp-advanced-docx` | LEGACY | keep unversioned until legacy retirement decision |
| `tmp-*` | TEMPORARY | cleanup later after owner/run confirmation |
| Python `__pycache__`, `*.pyc` | CACHE | clean now and ignore |

No bulk artifact deletion occurred.

## Contamination register

| Area | Classification | Finding | Action |
| --- | --- | --- | --- |
| `scripts/mvp/fixtures/*` | FIXTURE_ONLY | seismic/bridge examples | keep isolated |
| diagnostic runners with CPR/bridge inputs | TEST_ONLY | domain-specific test cases | keep, label diagnostic |
| `autonomous-pipeline-service.ts` | PRODUCTIVE_CONTAMINATION in parallel path | embeds bridge, credit, SEIR and hospital intakes in service module | preserve; isolate before production use |
| `final-docx-service.ts` | PRODUCTIVE_CONTAMINATION in legacy path | hardcoded bridge/seismic/FORM narrative | do not route canonical product through it |
| `advanced-thesis-docx-service.ts` | PRODUCTIVE_CONTAMINATION in legacy path | extensive Warren bridge/FORM narrative | do not route canonical product through it |
| `thesis-plan-*` services | LEGACY_ONLY | bridge/reliability-specific sections | preserve pending retirement evidence |
| `source-enrichment-service.ts` | PRODUCTIVE_CONTAMINATION in predecessor path | bridge/reliability keyword and gap recommendations | audit before reuse |
| Step 1 heuristics | GENERIC_LOGIC_WITH_DOMAIN_EXAMPLE | includes seismic/structural vocabulary among broader heuristics | monitor with cross-domain fixtures |
| country/university defaults | GENERIC_LOGIC_WITH_DOMAIN_EXAMPLE | Peru and supported universities are Release 0 scope | keep; avoid treating as universal engine behavior |

## Diagnostics and side effects

Canonical backend healthcheck candidate:

```text
npm run mvp:release0:contracts:diagnose
```

It performs static contract/file/schema checks and writes a report under
`artifacts-local/`; it does not intentionally mutate product DB state or call
LLMs.

Other canonical diagnostics create fixture users/projects/runs, write local
artifacts, and may call OpenAlex, Crossref or OpenAI. They require an isolated
test database and explicit credentials before execution:

- `mvp:step1:intake:diagnose`
- `mvp:step2:refinement:diagnose`
- `mvp:step3:source-selection:diagnose`
- `mvp:steps1-4:diagnose`
- `mvp:step5:evidence-materialization:diagnose`
- `mvp:step6:blueprint-docx:diagnose`

## Reproducible checkout

Use Node 20.x. `.nvmrc` pins `20.20.2`.

```bash
git clone <repository>
cd ingeniometrix
nvm use
npm ci
cp .env.example .env
# Configure local secrets outside Git.
docker compose up -d
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
npm run typecheck
npm run mvp:release0:contracts:diagnose
npm run dev
```

For an existing database, replace `migrate deploy` with the reviewed adoption
procedure above. Do not run any DB-backed diagnostic against shared data.

## B0 validation record

The host has Node 24.15.0, but the reproducibility checks were repeated in an
ephemeral Node 20.20.2 container.

| Check | Result | Side effects / note |
| --- | --- | --- |
| `npm ci` | PASS | passed with Node 20.20.2; lockfile unchanged |
| `npm run prisma:generate` | PASS | passed with Node 20.20.2; generated ignored client in `node_modules` |
| `npm run prisma:validate` | PASS | schema valid under Node 20.20.2 |
| `npm run typecheck` | PASS | generated ignored `.next` route types; TypeScript passed under Node 20.20.2 |
| JSON parse of schemas/fixtures | PASS | none |
| `git diff --check` | PASS before freeze | none |
| `npm audit --json` | FAIL/RISK | 9 vulnerabilities: 1 low, 1 moderate, 6 high, 1 critical; no fix applied in B0 |
| baseline migration on ephemeral PostgreSQL 16 | PASS | 1 migration, 26 public tables, schema up to date; container/tmpfs removed |
| `mvp:release0:contracts:diagnose` | PASS_WITH_GAPS | 84/84 static checks; Step 7 remains intentionally open |
| 31 safe in-memory tests | 26 PASS / 5 FAIL | four require missing historical artifacts; method-generation contract expected `blocked` but received `warn` |
| configured DB `prisma migrate status` | BLOCKED | PostgreSQL at localhost:5433 unavailable; it was not changed |

`npm run build` was not executed because static rendering includes Lab/server
pages that can load filesystem artifacts or backend state. It is deferred to
the isolated full-environment validation rather than treated as a pure compile
check.

## Cleanup flags

### CLEAN_NOW

- Python `__pycache__` and `.pyc` only; completed during B0.

### CLEAN_AFTER_NEXT_STEP

- old Step 3/4 batch manifests once Step 5 handoff retention is defined;
- duplicate local diagnostic outputs under explicit retention rules.

### CLEAN_BEFORE_PRODUCTION

- resolve dependency vulnerabilities, especially current Next.js advisory;
- execute and verify migrations against a controlled PostgreSQL instance;
- isolate fixture content from autonomous/legacy services;
- choose one supported product path and prevent legacy routing ambiguity;
- decide durable DB-backed LLM usage storage and artifact object storage.

### MONITOR

- Step 1 implicit execution from Step 2;
- source inspection/readiness names that collide with canonical Step 4;
- image API usage not represented in token registry;
- `Intake.searchQuery` and response-only export artifacts;
- historical artifacts being mistaken for current validation.

## Next action after B0

Make the safe validation suite self-contained and green under Node 20 and an
isolated PostgreSQL database: replace dependencies on missing historical local
artifacts with committed minimal fixtures and resolve the method-generation
gate mismatch. Do not implement Step 7 as part of that action.
