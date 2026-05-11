# Unified Pipeline Simplification

Branch/worktree: `mvp/backend-core-clean`  
Original reference: Lab A steps 1-6 + Lab B steps 7-13 from `codex/lab-a-b-diagnostic-pipeline`  
Rule: original Lab A/B remains read-only reference.

## Problem

The original diagnostic architecture has 13 steps:

- Lab A / Evidence Engine: steps 1-6
- Lab B / Blueprint Engine: steps 7-13

This separation made sense during experimentation, but it creates unnecessary complexity for the MVP backend:

- artificial boundary between evidence and blueprint work;
- duplicate compatibility adapters;
- too many artifact formats;
- too many places where diagnostic mode can continue despite production blockers;
- Lab B sometimes needs to reread Lab A artifacts through mutable/local paths;
- frontend would have to understand lab-specific state instead of product state.

The new backend should keep the **semantic checkpoints** but collapse the implementation into fewer, more product-useful stages.

## Original 13 steps

| Original step | Lab | Meaning |
| --- | --- | --- |
| 1 | Lab A | Intake capture, Spanish normalization, canonical topic, problem core, retrieval brief. |
| 2 | Lab A | Source access resolution for selected references. |
| 3 | Lab A | Evidence/materialization planning by source and section. |
| 4 | Lab A | Content materialization: PDF/web text capture. |
| 5 | Lab A | Source signal extraction: snippets, chunks, assets, tables, equations. |
| 6 | Lab A | Consolidated evidence package and downstream handoff. |
| 7 | Lab B | Load template runtime and build import context from evidence. |
| 8 | Lab B | Prompt/section planning, citation plan, generation waves, asset policy. |
| 9 | Lab B | Section generation. |
| 10 | Lab B | Consistency matrix. |
| 11 | Lab B | Blueprint composition, validation, provenance, institutional reduction. |
| 12 | Lab B | Master DOCX render. |
| 13 | Lab B | Institutional DOCX render. |

## New unified flow: 7 product stages

The recommended MVP backend flow should have **7 product stages**, not 13 lab steps.

```text
1. Intake & Project Setup
2. Source Discovery & Selection
3. Evidence Acquisition
4. Evidence Synthesis & Handoff
5. Blueprint Planning & Drafting
6. Validation & Readiness
7. Export & Delivery
```

This keeps the meaningful gates while making the system easier to reason about.

## Mapping: old 13 steps to new 7 stages

| New stage | Absorbs old steps | Purpose |
| --- | --- | --- |
| 1. Intake & Project Setup | Step 1 | Normalize user intent and create project/intake state. |
| 2. Source Discovery & Selection | Pre-Lab candidate search + source selection + part of Step 2 | Find candidate sources and record human selection decisions. |
| 3. Evidence Acquisition | Steps 2, 3, 4, 5 | Resolve access, plan evidence, materialize content, extract signals. |
| 4. Evidence Synthesis & Handoff | Step 6 + Lab B input contract | Produce canonical evidence package used by all downstream generation. |
| 5. Blueprint Planning & Drafting | Steps 7, 8, 9, 10, 11 | Load template, plan sections, draft, matrix, compose blueprint. |
| 6. Validation & Readiness | Cross-cutting steps 3, 6, 10, 11, QA gates | Decide if output is production-ready, diagnostic-only, blocked, or needs user action. |
| 7. Export & Delivery | Steps 12, 13 + evidence/BibTeX/RIS exports | Generate deliverables from persisted blueprint/evidence state. |

## Why 7 stages are better than 13

### 1. They match the product user journey

Users do not think in Lab A/B terms. They think:

1. I enter my topic.
2. I review sources.
3. The system builds evidence.
4. The system prepares a proposal package.
5. I download/review it.

The backend should expose states close to that journey.

### 2. They preserve the hard gates

The 13-step flow had useful gates, especially around:

- insufficient sources;
- materialization failure;
- weak citation eligibility;
- blocked consistency matrix;
- stale contamination;
- production safety.

Those gates should not disappear. They become validation checkpoints inside stages 3, 4, 5, and 6.

### 3. They remove artificial Lab A/B adapters

In the old architecture, Lab B consumes Lab A via a handoff adapter. In production, there should still be a canonical `EvidencePackage`, but it should be an internal persisted domain artifact, not a lab compatibility bridge.

### 4. They make frontend integration simpler

Frontend can show one project status timeline:

```text
Draft intake
Sources pending review
Evidence running
Blueprint running
Needs review / blocked / ready
Exports ready
```

Instead of exposing 13 technical lab steps.

## Recommended canonical backend stages

### Stage 1 — Intake & Project Setup

Old source: Lab A Step 1.

Responsibilities:

- create project;
- validate structured intake;
- normalize Spanish academic context;
- derive search brief;
- store project assumptions and constraints;
- initialize audit log.

Output artifact:

```ts
type IntakeBrief = {
  project_id: string;
  language: "es";
  country_context: "PE" | string;
  topic: string;
  normalized_problem_core: string;
  research_line: string | null;
  methodology_preference: string | null;
  target_population: string | null;
  available_data: string | null;
  academic_constraints: string | null;
  retrieval_brief: string;
  assumptions: string[];
};
```

Main status:

```text
DRAFT -> INTAKE_READY
```

### Stage 2 — Source Discovery & Selection

Old source: candidate search runner + human selection UI + part of Step 2.

Responsibilities:

- query OpenAlex/Crossref;
- normalize candidate metadata;
- deduplicate/rank;
- detect stale-topic contamination;
- present candidates for human selection;
- persist selected/rejected/undecided state.

Important simplification:

Discovery and selection should be one product stage with two substates:

```text
DISCOVERY_RUNNING -> SOURCES_READY_FOR_REVIEW -> SOURCES_SELECTED
```

Output artifacts:

- `SourceDiscoveryRun`
- `SourceCandidate[]`
- `SourceSelectionDecision[]`

Rules:

- candidates are not citable;
- selected sources are not evidence yet;
- source review is mandatory before evidence acquisition.

### Stage 3 — Evidence Acquisition

Old source: Lab A Steps 2-5.

Responsibilities:

- resolve source access;
- classify source health;
- plan what each source can support;
- materialize PDF/web text when allowed;
- extract chunks/snippets/assets;
- classify evidence units.

This stage should contain internal checkpoints but not expose four separate product steps unless debugging:

```text
access_resolution
source_health
materialization
extraction
```

Output artifacts:

- `EvidenceRun`
- `SourceHealthRecord[]`
- `MaterializedSourceRef[]`
- `EvidenceUnit[]`
- `AssetRecord[]`
- `SecondaryReferenceQueue`

Rules:

- metadata-only sources cannot provide direct quotes;
- unresolved sources cannot satisfy production source floor;
- adjacent sources can support context only;
- user PDFs remain non-production until human review;
- extraction failure creates replacement/action request, not fake evidence.

### Stage 4 — Evidence Synthesis & Handoff

Old source: Lab A Step 6 + `EvidenceEngineHandoffV1`.

Responsibilities:

- consolidate evidence units;
- build section packets;
- build source priorities;
- build method/framework candidate packets;
- build gap/follow-up plan;
- hash canonical evidence package;
- persist a canonical evidence package.

Important simplification:

In the unified system, this is not a handoff between labs. It is the canonical persisted **Evidence Package**.

Recommended name:

```ts
type EvidencePackageV1 = EvidenceEngineHandoffV1;
```

We can preserve the existing contract shape but rename its product meaning.

Output artifact:

- `EvidencePackageV1`

Main status:

```text
EVIDENCE_READY
EVIDENCE_BLOCKED
EVIDENCE_READY_WITH_WARNINGS
```

### Stage 5 — Blueprint Planning & Drafting

Old source: Lab B Steps 7-11.

Responsibilities:

- validate evidence package;
- pin master/institutional template;
- build reduced evidence pack;
- plan sections and citation policy;
- generate evidence-bound section drafts;
- build consistency matrix;
- compose blueprint record;
- derive institutional package if selected.

Important simplification:

Steps 7-11 are one product stage because they all create the same user-facing thing: a proposal blueprint.

Internal checkpoints:

```text
template_context
section_plan
section_drafts
consistency_matrix
blueprint_composition
```

Output artifacts:

- `BlueprintRun`
- `SectionPlan`
- `SectionDraft[]`
- `ConsistencyMatrix`
- `BlueprintVersion`
- `ProvenanceReport`
- `CoherenceReport`

Rules:

- no source search here;
- no raw Lab A paths here;
- only read persisted EvidencePackage;
- if matrix is blocked, production blueprint is blocked;
- LLM output must pass schema validation before persistence.

### Stage 6 — Validation & Readiness

Old source: cross-cutting gates from Steps 3, 6, 10, 11, 12, 13 and remediation Batch 1.

This should become a first-class stage, even though validation happens throughout the pipeline.

Responsibilities:

- separate schema compatibility from production readiness;
- enforce source floor;
- enforce citation semantics;
- enforce no stale contamination;
- enforce matrix readiness;
- enforce public appendix policy;
- produce user-action blockers.

Output artifact:

```ts
type ReadinessReport = {
  schema_compatible: boolean;
  diagnostic_compatible: boolean;
  production_eligible: boolean;
  status: "ready" | "ready_with_warnings" | "blocked" | "needs_user_action";
  blockers: string[];
  warnings: string[];
  user_actions: Array<{
    action: "select_more_sources" | "upload_source_pdf" | "review_source" | "revise_intake" | "accept_assumption";
    message_es: string;
  }>;
};
```

Main insight:

Validation should not be a hidden report at the end. It should drive the product state.

### Stage 7 — Export & Delivery

Old source: Lab B Steps 12-13 plus existing export endpoints.

Responsibilities:

- evidence log JSON;
- BibTeX;
- RIS;
- DOCX master;
- DOCX institutional;
- package manifest;
- QA reports.

Important simplification:

Exports must read from persisted `BlueprintVersion` and `EvidencePackage`. They should not rerun evidence or blueprint generation.

Output artifacts:

- `evidence_log.json`
- `.bib`
- `.ris`
- `.docx`
- `export-manifest.json`

Rules:

- DOCX can be delayed/manual if needed for MVP;
- evidence log, BibTeX, and RIS are easier and should be part of the backend core first;
- public DOCX must not include developer traceability appendices.

## Product statuses after simplification

Recommended canonical project statuses:

```text
DRAFT
INTAKE_READY
SOURCE_DISCOVERY_RUNNING
SOURCES_READY_FOR_REVIEW
SOURCES_SELECTED
EVIDENCE_RUNNING
EVIDENCE_READY
EVIDENCE_BLOCKED
BLUEPRINT_RUNNING
BLUEPRINT_READY
BLUEPRINT_BLOCKED
EXPORT_READY
NEEDS_USER_ACTION
FAILED
ARCHIVED
```

Recommended run statuses:

```text
queued
running
succeeded
succeeded_with_warnings
blocked
failed
cancelled
```

## What becomes optional/internal

The following original ideas are useful but should not drive the first clean MVP path:

- separate Lab A and Lab B UI routes;
- mutable `latest` artifact readers;
- diagnostic continuation after blocked gates;
- full DOCX QA before evidence/BibTeX/RIS are stable;
- Deep Research fallback as citable source path;
- image/hero generation;
- equation image fallback;
- second/institutional DOCX generation;
- complex institutional template reduction beyond the selected MVP scope.

## What must remain non-negotiable

From the original 13-step system, preserve these safeguards:

1. no invented citations;
2. no invented data/results;
3. source selection before evidence;
4. explicit source health;
5. direct quote only from recovered/verified text;
6. adjacent/background evidence cannot support central claims;
7. old-run contamination checks;
8. consistency matrix gates;
9. production readiness separate from diagnostic compatibility;
10. public outputs do not leak internal/developer artifacts.

## Recommended implementation order in the clean worktree

### Pass 1 — Backend state machine

Implement the 7-stage state model with mock data.

Exit criteria:

- local DB can persist a project through all stages;
- E2E runner reaches `EXPORT_READY` using mocks;
- no dependency on Lab A/B files or `artifacts-local/latest`.

### Pass 2 — Real source discovery

Bring in OpenAlex/Crossref discovery behind clean adapters, with Deep Research Light as fallback.

Exit criteria:

- candidate search works;
- candidates are persisted;
- human selection state is persisted;
- Deep Research Light can produce rescue candidates when normal discovery is weak;
- Deep Research Light candidates are never citable until selected and verified through Evidence Acquisition.

### Pass 3 — Minimal evidence package

Implement EvidencePackageV1 from selected sources and simple extracted/metadata evidence.

Exit criteria:

- selected sources become a canonical evidence package;
- weak sources are classified correctly;
- insufficient evidence creates `NEEDS_USER_ACTION`.

### Pass 4 — Minimal blueprint package

Implement deterministic blueprint skeleton first, then LLM generation.

Exit criteria:

- blueprint consumes only EvidencePackage;
- consistency matrix exists;
- readiness report governs whether exports are allowed.

### Pass 5 — Exports

Implement evidence log, BibTeX, RIS, then one branded Ingeniometrix DOCX.

Exit criteria:

- exports are reproducible;
- export generation never changes evidence/blueprint claims;
- the MVP produces one DOCX only, not master + institutional variants;
- the public DOCX excludes developer traces, internal paths, provider diagnostics, hashes, and debug appendices.

## Final recommendation

Do not preserve 13 steps in the new product backend.

Preserve them as an internal debug lineage only. The MVP backend should expose 7 product stages, with internal substeps and artifacts available for debugging.

This gives us the best balance:

- simpler backend;
- cleaner frontend contract;
- fewer places for stale artifacts to leak;
- same ethical guardrails;
- faster path to a sellable MVP.
