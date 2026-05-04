# Evidence Engine Contract Draft

Status: draft only

Date: 2026-05-03

Scope: Lab A, currently implemented under `blueprint_launch`, steps 1 through 6.

This document is an integration-focused audit. It does not refactor runtime
logic, change behavior, delete artifacts, modify frontend code, or integrate
with Lab B.

## Purpose Of Lab A

Lab A is the first half of the Ingeniometrix MVP pipeline. Its production role
should become the Evidence Engine: a callable service/job that turns a structured
research intake into a traceable evidence handoff package.

The Evidence Engine should answer:

- What is the normalized research context?
- Which sources were selected and why?
- Which selected sources have complete public content?
- Where are the downloaded/captured source artifacts?
- What text, chunks, snippets, tables, equations, and images were extracted?
- Which evidence units are citable, asset-backed, interpretive, or context-only?
- Which thesis/proposal sections have enough support?
- Which method/framework direction is currently best supported?
- What should downstream generation labs read, and what must they not claim?

The Evidence Engine must not become a thesis generator. It prepares evidence,
traceability, and section-level inputs for later blueprint/drafting steps.

## Current Flow

Current implementation lives mostly in:

- `blueprint_launch/server/step1-intake-context.ts`
- `blueprint_launch/server/local-reference-search.ts`
- `blueprint_launch/server/source-access-resolution.ts`
- `blueprint_launch/server/source-evidence-planning.ts`
- `blueprint_launch/server/source-content-materialization.ts`
- `blueprint_launch/server/source-signal-extraction.ts`
- `blueprint_launch/server/consolidated-evidence.ts`
- `blueprint_launch/server/local-playground-store.ts`

Current API routes are under:

- `app/api/blueprint-launch/intake/route.ts`
- `app/api/blueprint-launch/search/route.ts`
- `app/api/blueprint-launch/references/route.ts`
- `app/api/blueprint-launch/step-2/route.ts`
- `app/api/blueprint-launch/step-3/route.ts`
- `app/api/blueprint-launch/step-4/route.ts`
- `app/api/blueprint-launch/step-5/route.ts`
- `app/api/blueprint-launch/step-6/route.ts`

Current steps:

- Step 1: structured intake, Spanish normalization, canonical topic, problem
  core, method preference, target scope, and retrieval brief.
- Step 2: source access resolution for selected references.
- Step 3: evidence and materialization planning.
- Step 4: deterministic content materialization.
- Step 5: source signal extraction from PDFs/web text.
- Step 6: consolidated evidence package and downstream handoff.

Current key output:

- `artifacts-local/blueprint_launch/consolidated_evidence/latest-consolidated-evidence.json`

Current local state:

- `artifacts-local/blueprint_launch/lab-state.json`

## Proposed Production Role

The production Evidence Engine should be a backend module with one public
orchestrator and a compact public contract:

```ts
runEvidenceEngine(input: EvidenceEngineRunRequest): Promise<EvidenceEngineRunResult>
```

For the main app, this should usually be asynchronous:

```ts
enqueueEvidenceEngineRun(input: EvidenceEngineRunRequest): Promise<EvidenceEngineRunReceipt>
getEvidenceEngineRun(runId: string): Promise<EvidenceEngineRunResult>
```

Lab B and later workers should not depend on local UI state. They should read a
stable handoff contract plus artifact storage references.

## Minimal Public Contract

The exact minimal public contract is:

- One input object that identifies the project, intake, source policy, and run
  options.
- One compact result object for app UI/status.
- One durable handoff artifact for Lab B and later generation workers.
- Stable artifact URIs for large files.

The contract should not expose current local implementation details such as
`lab-state.json` as the production API. Those can remain debug artifacts.

## Public Input Schema Draft

```ts
type EvidenceEngineRunRequest = {
  project_id: string;
  user_id: string;
  run_id?: string;
  idempotency_key?: string;

  project_context: {
    title?: string | null;
    degree_level: "MAESTRIA" | "DOCTORADO" | "POSGRADO" | "PROFESIONAL" | string;
    university?: "UPC" | "UCV" | "USMP" | string | null;
    program?: string | null;
    knowledge_area_label: string;
    template_key?: string | null;
    country: "PE" | string;
    language: "es";
  };

  intake: {
    topic: string;
    problemContext: string;
    researchLine: string;
    academicConstraints: string;
    targetPopulation: string;
    availableData: string;
    preferredMethodology: string;
    advisorNotes: string;
  };

  source_policy: {
    mode: "auto_search" | "provided_references" | "provided_selected_sources";
    max_selected_sources: number;
    min_selected_sources?: number;
    providers: Array<"openalex" | "crossref">;
    allow_public_pdf_download: boolean;
    allow_web_fulltext_capture: boolean;
    require_complete_public_content: boolean;
  };

  provided_references?: Array<{
    id: string;
    title: string;
    doi?: string | null;
    year?: number | null;
    venue?: string | null;
    abstract?: string | null;
    landingPageUrl?: string | null;
    pdfUrl?: string | null;
    authorsJson?: string[];
    sourceLanguage?: string | null;
  }>;

  selected_reference_ids?: string[];

  execution_options?: {
    run_steps?: Array<1 | 2 | 3 | 4 | 5 | 6>;
    force_rerun?: boolean;
    use_llm?: boolean;
    persist_debug_prompts?: boolean;
    persist_full_text?: boolean;
    persist_pdfs?: boolean;
    cache_namespace?: string;
    prompt_version?: string;
  };
};
```

Minimum required fields for a full run:

- `project_id`
- `user_id`
- `project_context.knowledge_area_label`
- `project_context.language = "es"`
- all `intake` fields
- `source_policy.mode`
- `source_policy.max_selected_sources`
- `source_policy.providers`

## Public Output Schema Draft

For the main app, return a compact result:

```ts
type EvidenceEngineRunResult = {
  run_id: string;
  project_id: string;
  user_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "blocked" | "succeeded_with_warnings";
  started_at: string;
  completed_at: string | null;

  current_step: 1 | 2 | 3 | 4 | 5 | 6 | null;
  completed_steps: Array<1 | 2 | 3 | 4 | 5 | 6>;

  summary: {
    selected_source_count: number;
    complete_public_source_count: number;
    materialized_source_count: number;
    pdf_count: number;
    web_text_count: number;
    extracted_text_char_count: number;
    source_chunk_count: number;
    evidence_unit_count: number;
    direct_quote_count: number;
    asset_reference_count: number;
    section_dossier_count: number;
    overall_readiness: "alta" | "media" | "baja";
    quality_gate_status: "pass" | "warn" | "block";
  };

  artifacts: {
    handoff_artifact_uri: string;
    compact_summary_uri?: string;
    state_artifact_uri?: string;
    materialized_content_prefix_uri?: string;
    extracted_assets_prefix_uri?: string;
    prompts_artifact_uri?: string;
  };

  lab_b_handoff: EvidenceEngineLabBHandoff;

  warnings: string[];
  blocking_reasons: string[];
  usage?: {
    llm_call_count: number;
    input_tokens?: number;
    output_tokens?: number;
    cost_cad?: number;
  };
};
```

For Lab B, return or expose a handoff object:

```ts
type EvidenceEngineLabBHandoff = {
  artifact_type: "evidence_engine_handoff";
  artifact_version: "v1";
  run_id: string;
  project_id: string;

  handoff_artifact_uri: string;

  project_context: {
    project_title: string;
    intake_topic: string;
    canonical_topic_es?: string;
    problem_core_es?: string;
    method_preference_es?: string | null;
    target_scope_es?: string | null;
  };

  source_priorities: ConsolidatedEvidenceSourcePriority[];
  section_readiness_map: ConsolidatedEvidenceSectionReadiness[];
  section_input_packets: ConsolidatedEvidenceSectionInputPacket[];
  weak_section_completion_packets: ConsolidatedEvidenceWeakSectionCompletionPacket[];
  section_dossiers_uri: string;
  evidence_units_uri: string;
  source_text_registry_uri: string;
  asset_registry_uri: string;

  methodology_decision_packet: ConsolidatedEvidenceProposalMethodCandidate;
  framework_decision_packet: ConsolidatedEvidenceProposalFrameworkCandidate;
  dominant_methods: string[];
  dominant_frameworks: string[];
  key_findings: string[];
  asset_usage_plan: ConsolidatedEvidenceAssetUsagePlanItem[];
  gap_resolution_plan: ConsolidatedEvidenceGapResolutionPlan;
  quality_gate: ConsolidatedEvidenceQualityGate;
  context_preservation_contract: ConsolidatedEvidenceContextPreservationContract;

  usage_notes_es: string[];
};
```

## Handoff Artifact Schema Summary

The current `latest-consolidated-evidence.json` is about 918 KB.

Top-level structure, largest fields first:

- `llm_prompts`: array, 3 items, about 567 KB.
- `evidence_units`: array, 155 items, about 254 KB.
- `section_dossiers`: array, 11 items, about 27 KB.
- `section_input_packets`: array, 11 items, about 13 KB.
- `downstream_handoff_manifest`: object, about 11 KB.
- `asset_usage_plan`: array, 30 items, about 10 KB.
- `quality_gate`: object, about 6 KB.
- `quality_comparison`: object, about 4 KB.
- `section_readiness_map`: array, 11 items.
- `key_findings`: array, 10 items.
- `proposal_method_candidate` and `methodology_decision_packet`.
- `proposal_framework_candidate` and `framework_decision_packet`.
- `gap_resolution_plan`.
- `source_priorities`: array, 6 items.
- `dominant_methods`, `dominant_frameworks`, `evidence_gaps`,
  `proposal_directions`, `followup_requirements`, `warnings`.
- metadata fields: `artifact_type`, `artifact_version`, `generated_at`,
  `consolidation_mode`, `llm_status`, `run_dir`, `artifact_path`,
  `latest_artifact_path`.

Current evidence breakdown:

- `original_excerpt`: 84.
- `equation`: 4.
- `table`: 13.
- `image`: 17.
- `interpreted_signal`: 36.
- `intake_context`: 1.

Citation eligibility:

- `direct_quote`: 84.
- `asset_reference`: 34.
- `paraphrase_only`: 36.
- `context_only`: 1.

Current quality:

- `coverage_map.overall_readiness = alta`.
- `quality_gate.status = warn`.
- `quality_comparison.status = warn`.

## Fields Needed By Lab B

Lab B needs these fields directly or via storage URIs:

- `project_context`
- `coverage_map`
- `dominant_methods`
- `dominant_frameworks`
- `key_findings`
- `proposal_method_candidate`
- `proposal_framework_candidate`
- `section_readiness_map`
- `section_input_packets`
- `weak_section_completion_packets`
- `source_priorities`
- `evidence_units`
- `section_dossiers`
- `methodology_decision_packet`
- `framework_decision_packet`
- `asset_usage_plan`
- `gap_resolution_plan`
- `downstream_handoff_manifest`
- `quality_gate`
- `context_preservation_contract`
- selected source metadata from `selectedSourcesBundle`
- source text/chunk registry from `sourceSignalExtraction.sources`

Lab B should treat:

- `original_excerpt` as the main citable text evidence.
- `asset_reference` as the main source for tables, images, and equations.
- `interpreted_signal` as editorial guidance only.
- `context_only` as researcher-provided context only.

## Optional Or Debug-Only Fields

These are useful for debugging, reproducibility, and prompt tuning, but should
not be required in the main app API response:

- `llm_prompts`
- `quality_comparison`
- `warnings` beyond compact user-facing warnings
- `searchSnapshot.attemptedQueries`
- `searchSnapshot.metadata`
- `sourceAccessResolution.items[].attempts`
- `sourceAccessResolution.items[].candidateSummary`
- `evidencePlanning.sourceCards`
- `evidencePlanning.sectionCoverage`
- full `sourceSignalExtraction.llmPrompts`
- full `sourceSignalExtraction.sources[].sourceOverview`
- full `evidencePacksArtifact`
- `debug_runs`
- old benchmark artifacts
- `lab-state.json` as a monolithic object

Prompts may need to remain available in admin/debug views, but they are too
large and sensitive to return by default.

## Fields Too Large For Direct API Responses

These should remain in file/object storage and be referenced by URI:

- PDFs under `materialized_content`.
- HTML captures and raw text captures.
- extracted plain text files.
- `*-chunks.json` files.
- extracted image/table assets.
- full `llm_prompts` arrays.
- full `sourceSignalExtraction`.
- full `evidencePacksArtifact`.
- full `lab-state.json`.
- full `evidence_units` when returning to the main app UI.

`evidence_units` can be returned to Lab B if Lab B runs inside the same worker
or trusted backend context, but the main app should usually receive only counts,
readiness, section summaries, and artifact URIs.

## Storage Recommendations

### Persist In PostgreSQL/Neon

Use relational rows for run state and compact indexes:

- `evidence_engine_runs`
  - `id`
  - `project_id`
  - `user_id`
  - `status`
  - `current_step`
  - `started_at`
  - `completed_at`
  - `quality_gate_status`
  - `overall_readiness`
  - `selected_source_count`
  - `evidence_unit_count`
  - `direct_quote_count`
  - `asset_reference_count`
  - `cost_cad`
  - `handoff_artifact_uri`
  - `error_message`
- `evidence_engine_steps`
  - `run_id`
  - `step_number`
  - `status`
  - `started_at`
  - `completed_at`
  - `summary`
  - `artifact_uri`
  - `warning_count`
- `evidence_sources`
  - `run_id`
  - `source_id`
  - `title`
  - `doi`
  - `year`
  - `venue`
  - `landing_page_url`
  - `resolved_content_url`
  - `access_status`
  - `access_kind`
  - `has_complete_public_content`
  - `local_or_object_storage_uri`
- `evidence_unit_index`
  - `run_id`
  - `evidence_id`
  - `source_id`
  - `unit_type`
  - `citation_eligibility`
  - `section_keys`
  - `page_start`
  - `page_end`
  - `quote_hash`
  - `asset_key`
  - `artifact_uri`
- `evidence_section_dossiers`
  - `run_id`
  - `section_key`
  - `readiness`
  - `source_ids`
  - `evidence_unit_ids`
  - `asset_keys`
  - `missing_evidence_count`
- `llm_usage_calls` or reuse the existing LLM usage registry in DB form.

JSONB can be used for compact objects such as:

- `coverage_map`
- `quality_gate`
- `context_preservation_contract`
- compact `proposal_method_candidate`
- compact `proposal_framework_candidate`

### Keep In Artifact Storage

Use object storage for heavy/reproducibility artifacts:

- PDFs.
- raw HTML/text captures.
- plain-text extraction outputs.
- chunk files.
- extracted assets.
- full evidence unit JSON with original text.
- full prompt records.
- full debug state.
- full handoff artifact.
- per-step manifests.

Recommended object storage prefixes:

```text
evidence-engine/{project_id}/{run_id}/state/lab-state.json
evidence-engine/{project_id}/{run_id}/selected-sources/selected-sources.json
evidence-engine/{project_id}/{run_id}/materialized-content/...
evidence-engine/{project_id}/{run_id}/extracted-assets/...
evidence-engine/{project_id}/{run_id}/consolidated-evidence/consolidated-evidence.json
evidence-engine/{project_id}/{run_id}/prompts/...
evidence-engine/{project_id}/{run_id}/debug/...
```

## Worker And Vercel Split Recommendation

### Safe For Vercel Request/Response

- Validate an Evidence Engine run request.
- Persist run request and enqueue a job.
- Return run receipt/status.
- Serve compact run summaries.
- Serve signed URLs or proxied asset previews.
- Read compact DB rows for readiness, source list, and quality gate.

### Possibly Safe For Vercel, But Prefer Worker

- Step 1 normalization if run synchronously and within timeout budget.
- Initial OpenAlex/Crossref search if short and cached.
- Reading compact handoff summaries.

### Should Be Worker Jobs

- Step 2 source access resolution.
- Step 3 evidence planning with LLM.
- Step 4 content materialization/downloads.
- Step 5 PDF extraction and LLM source signal extraction.
- Step 6 consolidated evidence LLM strategy/dossier/audit.
- Any DSpace/Figshare/Handle crawling.
- Any Python PDF processing.
- Any job that writes artifacts.

Reasons:

- Public web retrieval is slow and failure-prone.
- PDF downloads and parsing can exceed Vercel function limits.
- Python/Pillow/pypdf runtime is a worker concern.
- LLM prompts in Step 5 and Step 6 are large.
- Artifact writes should be resumable and idempotent.

## OpenAI And API Call Classification

### Required For MVP

- OpenAlex search in `local-reference-search.ts`.
  - Required for initial source discovery.
  - Cache by normalized query and provider version.
- PDF/source URL verification in `reference-access.ts` and Step 2.
  - Required if the Evidence Engine promises complete public content.
  - Cache by URL and response headers/status.
- Step 5 LLM source signal extraction in `source-signal-extraction.ts`.
  - Required for high-quality downstream Lab B inputs.
  - Expensive and should be async.
  - Cache by source text hash, prompt version, model, and intake hash.
- Step 6 LLM consolidation in `consolidated-evidence.ts`.
  - Required for high-quality method/framework/dossier handoff.
  - Expensive and should be async.
  - Cache by evidence unit hash, prompt version, model, and intake hash.

### Optional Enhancement

- Step 1 LLM intake improvement in `step1-intake-context.ts`.
  - Improves Spanish quality and retrieval context.
  - Can fallback deterministically.
  - Cache by intake hash.
- Step 2 LLM access assessment in `source-access-resolution.ts`.
  - Helps ambiguous landing pages.
  - Should not be required for direct PDF/OpenAlex cases.
  - Cache by URL plus visible text/html digest.
- Step 3 LLM evidence planning in `source-evidence-planning.ts`.
  - Useful for semantic planning.
  - Deterministic fallback exists.
  - Cache by selected source metadata plus intake hash.
- Crossref fallback search.
  - Useful when OpenAlex has insufficient results.
  - Cache by query.

### Expensive Or Should Be Async

- Step 5 per-source LLM extraction.
- Step 6 strategy, dossier, and audit calls.
- PDF downloads for long theses.
- PDF extraction with images/tables.
- Repository crawling through DSpace/Figshare/Handle candidates.

### Cacheable

- OpenAlex query results.
- Crossref query results.
- DOI redirect outcomes.
- URL inspection responses when allowed by policy.
- PDF URL validation.
- DSpace item/bitstream metadata.
- Figshare article/file metadata.
- Step 1 normalized intake.
- Step 2 ambiguous access LLM assessment.
- Step 3 evidence planning.
- Step 5 source signal extraction by content hash.
- Step 6 consolidation by evidence pack hash.

## Stable File/Folder/Module Boundary

Do not move code yet. Future target boundary:

```text
server/evidence-engine/
  contracts.ts
  run-evidence-engine.ts
  enqueue-evidence-engine-run.ts
  steps/
    step-1-intake-context.ts
    step-2-source-access.ts
    step-3-evidence-planning.ts
    step-4-materialization.ts
    step-5-signal-extraction.ts
    step-6-consolidation.ts
  ports/
    artifact-store.ts
    evidence-repository.ts
    llm-provider.ts
    reference-provider.ts
    pdf-runtime.ts
    job-queue.ts
  adapters/
    local-artifact-store.ts
    neon-evidence-repository.ts
    openalex-reference-provider.ts
    crossref-reference-provider.ts
    openai-llm-provider.ts
    python-pdf-runtime.ts
  schemas/
    evidence-engine-run-request.schema.json
    evidence-engine-run-result.schema.json
    evidence-engine-handoff.schema.json
  cache/
    cache-keys.ts
  diagnostics/
    quality-gates.ts
    artifact-size-report.ts
```

Keep `blueprint_launch/` as the lab/debug UI until the engine contract is stable.
Then call the engine from the lab UI rather than moving UI code into the engine.

## Refactor Priorities

Do these only after this contract is approved:

1. Extract TypeScript contract types without changing behavior.
2. Add an artifact store interface and local adapter.
3. Add a run repository interface and local/Neon adapter.
4. Add idempotent run IDs and content hashes.
5. Split compact API result from full handoff artifact.
6. Add DB persistence for run status and compact indexes.
7. Add worker job orchestration.
8. Add cache keys for provider calls and LLM calls.
9. Move Step 5 PDF runtime behind a `PdfRuntime` port.
10. Add contract tests around current frozen artifact.

## Integration Risks

- Current lab state is file-based and mutable.
- Current API routes are step-specific and UI-oriented, not production service
  endpoints.
- Large artifacts are too big for normal app responses.
- Step 5 depends on Python, Pillow, and pypdf.
- Source access can break due to publisher/repository changes.
- Current selected source set can drift if search is rerun without fixed source
  selection.
- Prompts are large and costly.
- Some fields duplicate meaning, for example `proposal_method_candidate` and
  `methodology_decision_packet`.
- Some current fields are debug-rich but production-noisy.
- `quality_gate.status = warn` must not be treated as failure, but it must remain
  visible to downstream steps.
- Copyright and retention policy for storing PDFs/full text must be explicit
  before production cloud storage.
- Lab B must hydrate from artifact URIs rather than assuming all evidence is in
  the API response.

## Questions For The Product Owner

- Should source selection be automatic for MVP, user-confirmed, or both?
- What is the maximum number of selected sources per Evidence Engine run?
- Are PDFs/full-text files allowed in production storage for Release 0, or only
  local/private worker storage?
- What is the retention period for PDFs, extracted text, prompts, and debug
  artifacts?
- Should prompt templates and final prompts be visible to admins only, or
  exportable for audit?
- What cost ceiling per run is acceptable in CAD?
- Should a `warn` quality gate allow Lab B to proceed automatically?
- Which warning types should block downstream generation?
- Should Lab B receive full evidence units inline in worker memory, or only
  storage URIs plus compact indexes?
- Do we need per-university differences before Lab B, or only after blueprint
  composition?
- Should Crossref remain a fallback provider, or become part of the standard
  retrieval set?
- How much human validation is required before storing a source as selected?
- Should assets be included in generated outputs by default, or only when
  critical to a section?
- What is the expected cloud worker target: Vercel background jobs, separate Node
  worker, Python-capable worker, or another queue/runtime?
