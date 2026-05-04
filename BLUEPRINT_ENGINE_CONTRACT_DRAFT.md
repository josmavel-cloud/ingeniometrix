# Blueprint Engine Contract Draft

Status: draft for integration audit only.  
Scope: Lab B, also called Master Blueprint Lab.  
Date: 2026-05-03.  
Rule for this draft: no runtime behavior changes, no Lab A changes, no template changes.

## Purpose Of Lab B

Lab B is the second half of the Ingeniometrix MVP pipeline. It consumes a frozen evidence handoff from Lab A and produces a traceable academic blueprint package plus DOCX outputs.

In production terms, Lab B should become the Blueprint Engine. The engine should not search sources, resolve PDFs, extract evidence, or mutate Evidence Engine artifacts. It should receive a formal Evidence Engine handoff, validate that handoff, plan section generation, generate supported drafts, derive a consistency matrix, compose a persistible blueprint, validate provenance, and render deliverables.

Non-negotiable behavior:

- Do not invent citations.
- Do not invent data.
- Do not invent results.
- Keep every meaningful output traceable to source evidence, assumptions, or declared gaps.
- Prefer `original_excerpt` and citable asset references.
- Treat interpreted signals as editorial guidance, not as bibliographic evidence.
- Treat local/project/regulatory gaps as assumptions or pending validation, not as facts.

## Current Flow

Current Lab B uses these conceptual steps:

| Product step | Lab key | Current role | Current entry point |
| --- | --- | --- | --- |
| 7 | `master_template_runtime` | Load `MASTER_TEMPLATE_LATAM`, inspect template quality, build `templateImportContext` from Lab A state and consolidated evidence. | `server/blueprint-v2/lab/template-import-context.ts`, `server/blueprint-v2/lab/pipeline.ts` |
| 8 | `prompt_planning` | Build section plan, waves, prompt manifest, citation plan, asset policy, and evidence hydration plan. | `server/blueprint-v2/lab/prompt-planning-hybrid.ts` |
| 9 | `section_generation` | Generate section drafts by plan order/wave with LLM, runtime prompt context, retries, fallbacks, traceability fields. | `server/blueprint-v2/sections/section-generation-engine.ts` |
| 10 | `consistency_matrix` | Derive matrix from generated drafts, optionally using a low-cost LLM plus deterministic validation. | `server/blueprint-v2/sections/consistency-matrix-engine.ts` |
| 11 | `blueprint_composition` | Compose legacy blueprint, validation report, provenance report, university blueprint, package quality summary. | `server/blueprint-v2/compose/blueprint-composition-engine.ts`, validation modules |
| 12 | `master_docx_render` | Render master DOCX using the compiled academic document model. | `server/blueprint-v2/lab/steps-11-13-runner.ts`, `docx-renderer.ts` |
| 13 | `university_docx_render` | Render institutional DOCX from derived university blueprint and institutional runtime. | `server/blueprint-v2/lab/steps-11-13-runner.ts`, `docx-renderer.ts` |

Current developer UI and API surfaces:

- UI routes: `app/lab/master-blueprint/page.tsx`, `step-7/page.tsx`, `step-8/page.tsx`, `step-9/page.tsx`, `step-10/page.tsx`, `sections/page.tsx`, `final/page.tsx`.
- UI components: `components/labs/master-blueprint/*`.
- API routes: `app/api/labs/master-blueprint/execute/route.ts`, `artifacts/latest/route.ts`, `artifact-file/route.ts`, `generate-section/route.ts`, `repo-asset/route.ts`, `repo-pdf/route.ts`, `template-inspection/route.ts`.
- Local artifact reader: `server/blueprint-v2/lab/artifact-reader.ts`.
- External DOCX runner: `scripts/run-master-blueprint-steps-11-13.ts`.
- Current smoke script: `scripts/smoke-master-blueprint-lab-current-state.ts`.

Current output artifact directory:

```text
artifacts-local/blueprint-v2-lab/steps-5-11/<caseName>/<runId>/
```

Observed current artifact filenames include:

- `10-section-prompt-plan.json`
- `20-master-section-drafts.json`
- `31-consistency-matrix-artifact.json`
- `40-legacy-blueprint.json`
- `50-provenance-report.json`
- `60-validation-report.json`
- `61-coherence-report.json`
- `70-university-blueprint.json`
- `71-university-reduction-plan.json`
- `80-lab-result.json`
- `90-package-quality-summary.json`
- `110-blueprint-composition-artifact.json`
- `115-master-academic-document-model.json`
- `120-master-docx-manifest.json`
- `121-master-docx-qa-report.json`
- `12-master-docx-preview.docx`
- `130-university-docx-manifest.json`
- `131-university-docx-qa-report.json`
- `135-university-academic-document-model.json`
- `13-university-docx-preview.docx`
- `140-steps-11-13-summary.json`

## Proposed Production Role

The Blueprint Engine should be a worker-executed domain service with a stable public contract:

1. Accept a validated Evidence Engine handoff by immutable id or payload.
2. Pin template versions for master and institutional outputs.
3. Produce a traceable blueprint package with section drafts, matrix, validation, provenance, reference/asset intents, and export artifacts.
4. Persist metadata and reviewable outputs in PostgreSQL/Neon.
5. Store large immutable artifacts in object storage.
6. Notify the frontend when the run finishes or blocks.

Lab B should remain as a developer harness for inspecting the contract, fixture runs, prompt behavior, artifact quality, and DOCX rendering.

## How Lab B Currently Reads Lab A

Current Lab B has two main Lab A dependency paths.

### Fixture Reconstruction Path

`server/blueprint-v2/lab/blueprint-launch-fixture.ts` imports `readBlueprintLaunchLocalState()` from Lab A code:

```text
blueprint_launch/server/local-playground-store.ts
```

It reconstructs a `LoadedMasterBlueprintLabFixtureSet` from Lab A local state. This includes saved intake, selected sources, source gate, acquisition, pseudo PDF downloads, evidence packs, assumptions, snippets, assets, and an `EvidenceLedger`.

Risk: this is not a formal handoff. It depends on Lab A implementation types, local filesystem layout, mutable state shape, and fixture assumptions.

### Consolidated Evidence Path

`server/blueprint-v2/lab/template-import-context.ts` reads:

```text
artifacts-local/blueprint_launch/consolidated_evidence/latest-consolidated-evidence.json
```

It imports consolidated evidence fields into `templateImportContext`, including:

- `proposal_method_candidate`
- `proposal_framework_candidate`
- `dominant_methods`
- `dominant_frameworks`
- `key_findings`
- `section_input_packets`
- `weak_section_completion_packets`
- `source_priorities`
- `section_readiness_map`
- `evidence_units`
- `followup_requirements`
- `quality_gate`
- `quality_comparison`
- `downstream_handoff_manifest`

Step 9 then reloads the consolidated evidence through `loadReadonlyConsolidatedEvidence()` using:

```text
templateImportContext.source_snapshot.latest_consolidated_evidence_path
```

Step 12/13 also reloads the current latest consolidated handoff for:

- `asset_usage_plan`
- `source_priorities`

Risk: `latest` is mutable and not an immutable run contract. Step 12/13 also contains a hardcoded extracted assets run directory.

## Minimal Input Lab B Needs From Lab A

Lab B does not need the whole Lab A runtime. It needs a compact but lossless-reference handoff with these fields.

### Handoff Identity And Integrity

- `handoff_id`: immutable id.
- `handoff_version`: schema version.
- `project_id`: stable project id.
- `evidence_run_id`: immutable Lab A run id.
- `created_at`: ISO timestamp.
- `source_engine`: expected `EvidenceEngine`.
- `source_engine_version`: semantic version or git sha.
- `artifact_hash`: hash of canonical handoff JSON.
- `readiness`: global readiness, such as `alta`, `media`, `baja`, `blocked`.
- `quality_gate`: status, warnings, blockers.
- `warnings`: handoff-level warnings.
- `source_snapshot`: references to original Lab A immutable artifacts.

### Project And Intake Context

- `language`: expected `es`.
- `country_context`: expected `PE` for MVP unless changed by intake.
- `degree_level`: maestria, posgrado, or equivalent.
- `target_template_key`: user-selected institutional template key, if any.
- `master_template_key`: expected `MASTER_TEMPLATE_LATAM`.
- `topic`.
- `problem_context`.
- `research_line`.
- `methodology_preference`.
- `population_or_context`.
- `constraints`.
- `academic_program`.
- `university`.
- `advisor_or_user_notes`.
- `normalized_problem_core`.
- `retrieval_brief` or equivalent short source-selection rationale.

### Source Registry

Each source needs:

- `source_id`: stable Evidence Engine id.
- `reference_id`: OpenAlex, DOI, or internal reference id.
- `title`.
- `authors`.
- `year`.
- `venue`.
- `doi`.
- `landing_page_url`.
- `pdf_url`.
- `openalex_id`.
- `crossref_id`.
- `is_open_access`.
- `selected_order`.
- `eligible_for_formal_reference`.
- `citation_metadata`.
- `materialization_refs`: object/file refs for extracted text, chunks, PDF, and derived assets.

### Evidence Units

Each evidence unit needs:

- `evidence_id`.
- `source_id`.
- `unit_type`: `original_excerpt`, `table`, `image`, `equation`, `interpreted_signal`, `context_only`, or similar.
- `section_keys`.
- `label`.
- `original_text`.
- `summary_es`.
- `page_start`.
- `page_end`.
- `char_start`.
- `char_end`.
- `quote_hash`.
- `asset_key`, if applicable.
- `asset_ref`, if applicable.
- `caption`, if applicable.
- `original_language`.
- `citation_eligibility`: `direct_quote`, `paraphrase_only`, `asset_reference`, `not_citable`, etc.
- `confidence`.
- `relevance_score`.
- `claim_scope`: allowed use in generation.

### Section Dossiers And Packets

For each imported dossier/section packet:

- `section_key`.
- `readiness`.
- `summary`.
- `source_ids`.
- `snippet_ids`.
- `evidence_ids`.
- `asset_keys`.
- `key_points`.
- `open_questions`.
- `missing_elements`.
- `do_not_claim`.
- `assumptions_allowed`.
- `recommended_chunk_refs`.
- `required_original_fragments`.

### Assets

Each asset needs:

- `asset_key`.
- `source_id`.
- `asset_kind`: `figure`, `image`, `table`, `equation`.
- `title`.
- `caption`.
- `page_number`.
- `text_content`.
- `latex`, for equations if available.
- `file_ref`: formal object/file reference.
- `mime_type`.
- `width_px`.
- `height_px`.
- `content_hash`.
- `extraction_origin`.
- `citation_eligibility`.
- `recommended_section_keys`.
- `usage_reason`.
- `handling_notes`.

Text-only assets should generally be normalized into evidence units or snippets, not inserted as visual DOCX assets.

### Chunks And Materialized Content

Lab B should not require raw local paths. It needs references:

- `chunk_refs`: ids and object/file refs for relevant chunks.
- `materialized_text_refs`: full text object/file refs, available for retrieval if prompt hydration needs more context.
- `pdf_refs`: immutable PDF refs for audit or rendering only.
- `content_hashes`: hashes for reproducibility.

### Proposal Context

- `proposal_method_candidate`.
- `proposal_framework_candidate`.
- `dominant_methods`.
- `dominant_frameworks`.
- `key_findings`.
- `methodology_decision_packet`.
- `framework_decision_packet`.
- `source_priorities`.
- `asset_usage_plan`.
- `gap_resolution_plan`.
- `followup_requirements`.
- `context_preservation_contract`.

## Public Input Schema Draft

This is a TypeScript-style draft, not an implemented schema.

```ts
type BlueprintEngineInput = {
  schema_version: "blueprint_engine_input.v1";
  run_request: {
    blueprint_run_id?: string;
    project_id: string;
    user_id: string;
    requested_at: string;
    target_steps: Array<7 | 8 | 9 | 10 | 11 | 12 | 13>;
    execution_mode: "full" | "resume" | "render_only" | "dry_run";
    language: "es";
  };
  templates: {
    master_template_key: "MASTER_TEMPLATE_LATAM";
    master_template_version_id: string;
    institutional_template_key?: string | null;
    institutional_template_version_id?: string | null;
    citation_style?: "APA7" | "ISO690" | "VANCOUVER" | "IEEE" | null;
  };
  project_context: {
    topic: string;
    problem_context: string | null;
    research_line: string | null;
    methodology_preference: string | null;
    population_or_context: string | null;
    constraints: string | null;
    degree_level: string;
    university: string | null;
    program: string | null;
    country_context: "PE" | string;
  };
  evidence_handoff: EvidenceEngineHandoffV1;
  generation_options?: {
    allow_llm: boolean;
    require_llm_for_sections: boolean;
    model_policy: "default" | "cost_optimized" | "quality_first";
    use_prompt_cache: boolean;
    reuse_cached_artifacts: boolean;
    max_cost_cad?: number | null;
    max_runtime_ms?: number | null;
  };
};

type ArtifactRef = {
  ref_id: string;
  uri: string;
  storage_kind: "local_file" | "object_storage" | "db_blob" | "external_url";
  content_type: string;
  byte_size?: number | null;
  sha256?: string | null;
};

type EvidenceEngineHandoffV1 = {
  handoff_id: string;
  handoff_version: "evidence_engine_handoff.v1";
  evidence_run_id: string;
  created_at: string;
  source_engine: "EvidenceEngine";
  source_engine_version: string;
  readiness: "alta" | "media" | "baja" | "blocked";
  quality_gate: {
    status: "pass" | "warn" | "blocked";
    warnings: string[];
    blockers: string[];
  };
  project_context: Record<string, unknown>;
  source_registry: SourceHandoffRecord[];
  evidence_units: EvidenceUnitHandoffRecord[];
  section_packets: SectionPacketHandoffRecord[];
  weak_section_packets: SectionPacketHandoffRecord[];
  source_priorities: Array<Record<string, unknown>>;
  asset_registry: AssetHandoffRecord[];
  asset_usage_plan: Array<Record<string, unknown>>;
  materialized_content_refs: ArtifactRef[];
  chunk_index_refs: ArtifactRef[];
  proposal_context: {
    method_candidate: unknown | null;
    framework_candidate: unknown | null;
    dominant_methods: unknown[];
    dominant_frameworks: unknown[];
    key_findings: unknown[];
    evidence_gaps: string[];
    followup_requirements: unknown | null;
    gap_resolution_plan: unknown | null;
  };
  assumptions: Array<{
    assumption_id: string;
    statement: string;
    reason: string;
    section_keys: string[];
  }>;
  traceability: {
    source_artifacts: ArtifactRef[];
    immutable_snapshot_hash: string;
  };
};
```

## Public Output Schema Draft

This is also a TypeScript-style draft.

```ts
type BlueprintEngineOutput = {
  schema_version: "blueprint_engine_output.v1";
  blueprint_run: {
    blueprint_run_id: string;
    project_id: string;
    user_id: string;
    evidence_handoff_id: string;
    status: "completed" | "warn" | "blocked" | "failed";
    started_at: string;
    completed_at: string | null;
    template_versions: {
      master_template_key: string;
      master_template_version_id: string;
      institutional_template_key?: string | null;
      institutional_template_version_id?: string | null;
    };
    cost_summary: {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      cost_usd: number;
      cost_cad: number;
      duration_ms: number;
    };
  };
  steps: Array<{
    step_number: 7 | 8 | 9 | 10 | 11 | 12 | 13;
    step_key: string;
    status: "completed" | "warn" | "blocked" | "failed" | "skipped";
    artifact_refs: ArtifactRef[];
    warnings: string[];
    blockers: string[];
  }>;
  artifacts: {
    template_import_context: TemplateImportContextOutput;
    section_prompt_plan: SectionPromptPlanOutput;
    section_drafts: MasterSectionDraftOutput[];
    consistency_matrix: ConsistencyMatrixOutput;
    blueprint_composition: BlueprintCompositionOutput;
    validation_report: ValidationReportOutput;
    provenance_report: ProvenanceReportOutput;
    university_blueprint?: UniversityBlueprintOutput | null;
    master_docx?: DocumentRenderOutput | null;
    institutional_docx?: DocumentRenderOutput | null;
    references_working_set: ReferenceUseOutput[];
    asset_placement_plan: AssetPlacementOutput[];
    package_quality_summary: PackageQualityOutput;
  };
};

type DocumentRenderOutput = {
  docx_ref: ArtifactRef;
  pdf_ref?: ArtifactRef | null;
  manifest_ref: ArtifactRef;
  qa_report_ref: ArtifactRef;
  qa_passed: boolean;
  qa_score_100: number;
  warnings: string[];
};
```

## Storage Recommendations

### PostgreSQL/Neon

Store normalized, queryable, user-visible, and audit-critical metadata:

- `BlueprintEngineRun`: run id, project id, user id, evidence handoff id, template version ids, status, timestamps, cost summary, quality status.
- `BlueprintEngineStep`: step status, timings, warnings, blockers, artifact refs.
- `BlueprintSectionDraft`: section key, title, content, content format version, support level, prompt hash, bundle hash, fallback cause, quality checks, warning summary.
- `BlueprintSectionEvidenceUse`: section key, evidence ids, snippet ids, source ids, original excerpt ids.
- `BlueprintAssetUse`: asset key, section key, placement intent, caption, figure/table/equation number, source id, artifact ref.
- `BlueprintReferenceUse`: reference id, source id, section key, citation intent, style-independent coordinates.
- `ConsistencyMatrix`: general block, specific rows, methodology block, validation status.
- `BlueprintComposition`: persisted legacy/new blueprint fields needed by the application.
- `BlueprintValidationReport`: quality score, blocked reasons, warnings, provenance percentages.
- `DocumentExport`: DOCX/PDF refs, manifest ref, QA score, render status.
- `LlmUsage`: provider, model, tracking label, tokens, cost, cache usage, duration, run id.

Postgres should store enough content to render UI and resume/retry runs. It should not store huge raw PDFs, full extracted corpora, or binary DOCX/PDF content.

### Files Or Object Storage

Keep large, immutable, or binary artifacts outside Postgres:

- Evidence handoff canonical JSON snapshot.
- Full prompt manifests and raw model responses, if retained for audit.
- Full materialized texts and chunk indexes.
- Original PDFs and extracted image/table/equation assets.
- Generated DOCX/PDF files.
- Render manifests and QA reports.
- Hero images and generated visual assets.
- Full academic document model JSON if too large for DB.
- Debug-only lab bundles under `artifacts-local/`.

Production object keys should be content-addressed or run-addressed, not `latest`.

## Vercel And Worker Split

Safe for Vercel route handlers:

- Validate small request payloads.
- Create a `BlueprintEngineRun` record.
- Return run status and artifact refs.
- Serve signed URLs or proxied artifact downloads.
- Render developer/status UI from Postgres metadata.
- Run cheap deterministic schema checks on small JSON payloads.

Should be worker jobs:

- Step 7 if it loads large handoff files or template runtime with DB plus artifact access.
- Step 8 LLM planning and evidence hydration planning.
- Step 9 section generation.
- Step 10 LLM matrix generation and repair.
- Step 11 semantic validation, university reduction, provenance over many drafts.
- Step 12 master DOCX render.
- Step 13 institutional DOCX render.
- Image generation.
- Any operation using local filesystem output, object storage writes, retries, large prompt construction, DOCX validation, or long-running LLM calls.

Recommended production model:

1. Vercel creates run and enqueues job.
2. Worker fetches immutable handoff and pinned template versions.
3. Worker writes step artifacts and DB progress.
4. Frontend subscribes/polls run status.
5. Exports become downloadable only after render QA finishes.

## OpenAI And API Call Classification

Current OpenAI usage observed:

| Module | API usage | Classification | Notes |
| --- | --- | --- | --- |
| `llm/providers/openai.ts` | Responses API text/structured outputs | Required for MVP where generation is needed | Central provider; records usage/cost through local usage registry. |
| `prompt-planning-hybrid.ts` | Structured planning calls | Required or strongly recommended | Cacheable by handoff hash plus template version. Can use low/medium model. |
| `section-generation-engine.ts` | Text generation per section | Required for MVP | Expensive and async. Cache per section by prompt hash, bundle hash, template version, evidence handoff id. |
| `consistency-matrix-engine.ts` | Low-cost LLM matrix alignment and hypothesis repair | Required for quality, optional fallback deterministic | Use cheap model, enforce schema, validate with code. |
| `university-blueprint-derivation-engine.ts` | Text generation/reduction | Required when institutional template is smaller/different | Cache by master blueprint hash plus institutional template version. |
| `blueprint-semantic-review-engine.ts` | Structured semantic review | Optional enhancement | Should be async and skippable for Release 0 if deterministic gates suffice. |
| `academic-document-editorial-pass.ts` | Text editorial pass | Optional enhancement | Expensive; cache by document model hash. |
| `academic-document-layout-pass.ts` | Layout/caption planning | Optional enhancement | Useful for high-quality DOCX; cacheable. |
| `academic-document-hero-image.ts` | Images API | Optional enhancement | Expensive, async, cacheable by prompt hash. Fallback SVG exists. |
| `template-ingestion/*` | Template analysis with LLM | Admin/setup only | Not part of per-project MVP run. |
| `evidence/evidence-extraction-engine.ts` | Evidence extraction LLM | Lab A/Evidence Engine responsibility | Should not be owned by Blueprint Engine. |

Environment variables currently relevant:

- `OPENAI_API_KEY`
- `LLM_PROVIDER`
- `LLM_DEFAULT_MODEL`
- `LLM_MODEL_HIGH`
- `LLM_MODEL_MEDIUM`
- `LLM_MODEL_LOW`
- `LLM_FAST_MODEL`
- `LLM_REQUEST_TIMEOUT_MS`
- `LLM_REQUEST_MAX_RETRIES`
- `LLM_MODEL_PRICES_JSON`
- `OPENAI_IMAGE_MODEL`

## Cost Reduction Opportunities

- Use immutable handoff hashes to cache Step 7 import context.
- Cache Step 8 prompt plan by handoff id, master template version id, institutional template version id, and planner policy.
- Cache Step 9 per section by prompt hash, bundle hash, execution profile, model, and template version.
- Reuse Step 9 drafts when only downstream DOCX rendering changes.
- Cache Step 10 matrix by draft hash and matrix schema version.
- Cache Step 11 university reduction by master blueprint hash and institutional template version.
- Cache Step 12/13 academic document model and render manifests by document model hash.
- Keep hero image generation optional and cache by prompt hash.
- Validate format, duplicates, dates, section completeness, citation leakage, Markdown residue, and asset repetition with TypeScript before asking the LLM.
- Prefer low/medium models for planning, matrix alignment, institutional reduction, editorial cleanup, and captions.
- Reserve high model tier for critical long-form sections only.
- Use prompt caching by keeping stable system/policy blocks identical across calls.
- Do not inline full PDFs in prompts. Rehydrate only selected excerpts/chunks by section.
- Prefer asset references and captions over large image payloads in text prompts.

## Structured Output And Zod Enforcement

Structured validation should be enforced at these boundaries:

- Evidence Engine handoff input.
- Step 7 `templateImportContext`.
- Step 8 `section_prompt_plan`, including `section_evidence_hydration_plan`, waves, citation plan, retry policy, asset policy.
- Step 9 `MasterSectionDraft`, including content metadata, evidence usage, asset placement intents, citation intents, LLM metrics, fallback cause.
- Step 10 `ConsistencyMatrixArtifact`.
- Step 11 blueprint composition, validation report, provenance report, university blueprint, package quality summary.
- Step 12/13 academic document model, DOCX manifest, DOCX QA report.
- LLM structured outputs before persistence.

Recommended implementation approach:

- Zod schemas at public/service/storage boundaries.
- JSON Schema derived from Zod for OpenAI structured outputs where practical.
- Deterministic post-validation after every LLM call.
- Fail closed for traceability gaps that affect citations or source-backed claims.
- Warn, not block, for stylistic DOCX issues unless export quality threshold fails.

## Dependencies On Local Files To Replace

Replace these local filesystem assumptions with formal `ArtifactRef` records:

- `artifacts-local/blueprint_launch/lab-state.json`
- `artifacts-local/blueprint_launch/consolidated_evidence/latest-consolidated-evidence.json`
- `artifacts-local/blueprint_launch/materialized_content/...`
- `artifacts-local/blueprint_launch/extracted_assets/...`
- Hardcoded extracted asset run in `steps-11-13-runner.ts`
- Local output run directory under `artifacts-local/blueprint-v2-lab/steps-5-11/...`
- DOCX output paths such as `12-master-docx-preview.docx` and `13-university-docx-preview.docx`
- Hero image/generated image local paths
- QA report JSON paths

Lab-local paths can remain in the development harness, but production code should read/write through an artifact store interface.

## Implicit Assumptions About Lab A Artifacts

Current Lab B assumes:

- Lab A code is importable from `blueprint_launch/server/local-playground-store.ts`.
- The current process cwd is the repo root.
- `latest-consolidated-evidence.json` points to the intended Evidence Engine run.
- `lab-state.json` and `latest-consolidated-evidence.json` describe the same intake/run.
- Selected source ids can be bridged to fixture source ids.
- Selected source ids are usually OpenAlex-like ids.
- `source_priorities` contains all selected source ids.
- `sourceSignalExtraction.runDir` exists or can be derived from the handoff manifest.
- Asset filenames can be found by sanitized source id directory plus asset key substring.
- Evidence units contain `original_text`, page metadata, citation eligibility, section keys, and asset metadata.
- Section packets contain enough `snippet_ids`, `asset_keys`, and source ids for prompt planning.
- The `MASTER_TEMPLATE_LATAM` runtime is available from DB/runtime helpers.
- The PUCP institutional runtime can be resolved from DB for the lab example.
- Cached Step 11-13 artifacts are compatible with latest Step 9/10 artifacts.
- DOCX rendering has filesystem access and required local runtime support.

These assumptions should become explicit schema validations or artifact-store lookups.

## Stable Module Boundary Proposal

Future production boundary:

```text
server/blueprint-engine/
  contracts/
    blueprint-engine-input.schema.ts
    blueprint-engine-output.schema.ts
    evidence-handoff.schema.ts
    artifact-ref.schema.ts
  handoff/
    validate-handoff.ts
    normalize-handoff.ts
    source-id-bridge.ts
  templates/
    resolve-master-template.ts
    resolve-institutional-template.ts
    template-contract.ts
  step-7-template-context/
    build-template-import-context.ts
  step-8-planning/
    plan-sections.ts
    build-section-evidence-hydration-plan.ts
  step-9-generation/
    runtime-prompt-context-builder.ts
    generate-sections.ts
    section-cache.ts
  step-10-matrix/
    build-consistency-matrix.ts
    validate-matrix.ts
  step-11-composition/
    compose-blueprint.ts
    validate-blueprint.ts
    provenance.ts
    derive-institutional-blueprint.ts
  step-12-13-docx/
    academic-document-model.ts
    render-master-docx.ts
    render-institutional-docx.ts
    validate-docx.ts
  storage/
    blueprint-run-repository.ts
    artifact-store.ts
  llm/
    model-policy.ts
    usage-recorder.ts
  workers/
    blueprint-engine-job.ts
```

Development harness should remain separate:

```text
server/blueprint-v2/lab/
app/lab/master-blueprint/
app/api/labs/master-blueprint/
components/labs/master-blueprint/
```

The lab can adapt to the contract, but production should not import lab fixture loaders.

## Refactor Priorities

Do not start these until the contract is accepted.

1. Introduce `EvidenceEngineHandoffV1` and `BlueprintEngineInput` schemas.
2. Build a read-only handoff adapter that can load current Lab A artifacts into the new schema without changing Lab A.
3. Replace direct Lab A TypeScript imports in Lab B production path with validated handoff input.
4. Replace `latest` path reads with immutable handoff/artifact refs.
5. Replace hardcoded extracted asset run path with asset refs from handoff.
6. Split lab execution from production worker execution.
7. Add persistent run records and step status records in PostgreSQL/Neon.
8. Add object storage abstraction for DOCX/PDF/assets/prompts/manifests.
9. Add structured output schemas for Step 8, Step 9, Step 10, Step 11, and DOCX manifests.
10. Add cache keys and resume behavior for expensive steps.
11. Move DOCX rendering and image generation exclusively to worker execution.
12. Keep the current lab UI as a read-only inspector for artifacts and contract conformance.

## Integration Risks

- Mutable `latest` artifacts can make runs non-reproducible.
- Direct imports from Lab A make Lab B fragile when Lab A changes internal types.
- Local file paths will not work reliably on Vercel or across worker machines.
- Step 12/13 currently has a hardcoded extracted asset run path.
- Artifact state can become stale after DB template changes.
- LLM calls are expensive and time-sensitive, especially Step 9 and DOCX semantic passes.
- Fallbacks can make outputs formally complete but semantically weak if not surfaced clearly.
- Source title leakage can contaminate final content if post-validation is not enforced.
- DOCX rendering quality depends on style contracts, asset placement, and QA checks that must be deterministic.
- Institutional reduction can lose traceability if LLM output is not schema-validated against original section ids.
- Large prompts can become slow/costly if chunk hydration is not selective.
- Asset insertion can duplicate assets or use text-only assets unless the asset registry defines renderability and placement rules.

## Questions For The Product Owner

- Should the default citation style for Release 0 be APA 7 when the user does not choose a style?
- Which institutional templates are mandatory for Release 0: UPC, UCV, USMP only, or should PUCP remain as a lab example?
- What is the acceptable cost ceiling per full Blueprint Engine run in CAD?
- What is the acceptable latency target for Step 9 alone and for full Steps 7-13?
- Should DOCX rendering happen in the same worker job as blueprint composition, or as a separate export job?
- How much prompt/raw LLM output should be retained for audit, and for how long?
- Which validation failures should block export versus only warn the user?
- Should users see gaps and assumptions inside the final DOCX, or only in an evidence/audit appendix?
- Should hero image generation be included in MVP or kept as an optional enhancement?
- Should institutional output be generated only after master output passes a quality threshold?
- What is the minimum acceptable traceability level for each section type?
- Should Evidence Engine handoffs be immutable forever, or can they be superseded with explicit version lineage?
