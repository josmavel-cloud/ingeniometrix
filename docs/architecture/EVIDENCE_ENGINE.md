# Evidence Engine

STATUS: CURRENT - Release 0 secure pilot.

The canonical engine produces a proposed thesis-plan document, not a finished thesis. It must preserve uncertainty and never invent citations, findings, data or results.

## Pipeline

```text
Intake
  -> research definition / normalization
  -> evidence discovery
  -> human source selection
  -> source inspection
  -> materialization
  -> evidence extraction
  -> evidence sufficiency
  -> research design
  -> section generation
  -> consistency matrix
  -> cross-section review
  -> visual generation
  -> DOCX
  -> PDF
```

## Stages

| Stage | Purpose | Input | Output | Source of truth | DB entities | Artifacts | LLM calls | Downstream consumer | Failure behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Intake | Capture project topic, context, constraints and method preference. | User form. | `Intake`. | PostgreSQL. | `Project`, `Intake`. | None. | Optional draft/suggestion helpers. | Normalization/discovery. | Missing intake blocks generation. |
| Research definition / normalization | Normalize student intent without changing topic/context. | `Project`, `Intake`. | Structured definition, search terms. | `MvpStepRun` snapshots and service output. | `MvpStepRun`. | Local run artifacts. | `scientific-plan` phases and older step helpers depending path. | Discovery/refinement. | Invalid/insufficient intake blocks or asks for more data. |
| Evidence discovery | Search for scholarly candidates. | Intake/search definition. | Candidate `Reference` rows. | PostgreSQL. | `Reference`, `ProjectReference`. | Provider raw JSON in DB fields. | Query planning may use `gpt-5.4-nano`; providers are OpenAlex/Crossref. | Human source selection. | Weak discovery returns blocked/candidate status; not enough by itself to generate. |
| Human source selection | Preserve human decision over what sources are used. | Candidate references. | Selected `ProjectReference` rows. | PostgreSQL. | `ProjectReference.selected`, `selectedOrder`, `selectionReason`. | None. | None. | Source inspection. | No selected sources blocks generation job. |
| Source inspection | Determine evidence level and access/materialization options. | Selected references. | Metadata/abstract/full-text availability classification. | Step 5 output and materialization rows. | `ProjectSourceMaterialization`, `MvpStepRun`. | PDFs, chunks, manifests in private artifact dir. | Deterministic first; LLM only for extraction/asset tasks when needed. | Evidence extraction. | Inaccessible full text degrades to abstract/metadata honestly; unusable sources cannot support claims. |
| Materialization | Fetch lawful accessible text/PDF and chunk it. | Inspected sources. | Text/chunks/pages and metrics. | Private artifacts plus DB metadata. | `ProjectSourceMaterialization`. | PDF/text/chunks/pages files. | None for deterministic extraction. | Step 5 extraction. | Failed retrieval records errors; metadata-only stays limited. |
| Evidence extraction | Extract supportable evidence items/cards and assets. | Chunks/abstracts/metadata/source health. | Evidence ledger/cards/assets. | `ProjectEvidenceLedger` and `ProjectEvidenceCard`. | `ProjectEvidenceLedger`, `ProjectEvidenceCard`, `ProjectSourceAsset`. | Evidence ledger JSON, asset files. | `step5-source-evidence-extraction.v3`, optional asset/equation prompts. | Sufficiency and plan generation. | Insufficient verified evidence blocks or limits generation. |
| Evidence sufficiency | Classify coverage by dimension, not reference count. | Ledger/cards/source levels. | SUFFICIENT/LIMITED/INSUFFICIENT with gaps. | Step output/artifacts. | `MvpStepRun`; card/ledger rows. | Coverage JSON. | Deterministic/structured logic; Deep Research only if enabled. | Research design. | INSUFFICIENT blocks; LIMITED may proceed with explicit limits. |
| Research design | Produce methodology-aware `ResearchDesign`. | Definition, evidence, questions/objectives. | Structured research design. | Step 6 structured output. | `BlueprintVersion`, `MvpStepRun`. | Step 6 package. | `scientific-plan.v3`. | Methodology, matrix, visuals. | Cross-section review blocks critical contradictions/inventions. |
| Section generation | Generate proposal sections in internal order. | Stable upstream sections, evidence and design. | Public academic sections. | Step 6 package and `BlueprintVersion.blueprintJson`. | `BlueprintVersion`, `MvpStepRun`. | DOCX/PDF package inputs. | `scientific-plan.v3`, `section-budget.v2`. | Matrix/review/export. | Schema failure or unsupported claims block/retry/fallback as coded. |
| Consistency matrix | Align problem, questions, objectives, constructs and method. | Finalized design and sections. | Matrix JSON, visual image and editable table. | Matrix JSON hash. | `BlueprintVersion` snapshot/artifacts. | Matrix image/table in DOCX. | `consistency-matrix.v1`, `matrix-visual.v1`, `visual-qa.v1`. | DOCX/PDF. | Invalid matrix blocks visual/table acceptance. |
| Cross-section review | Detect contradictions, unsupported claims and contamination. | Stabilized plan. | Review result/warnings/blockers. | Step 6 output. | `MvpStepRun`, `BlueprintVersion`. | Review JSON. | `scientific-plan.v3` review task. | Title/summary/export. | Critical issues block or prevent scientific pass. |
| Visual generation | Create useful visuals, not decorative unsupported findings. | Research design, matrix, evidence. | Hero, conceptual diagram, workflow, tables, matrix image/table. | Visual plan/artifacts. | `MvpStepRun`/`BlueprintVersion` metadata. | PNGs, sidecars, DOCX blocks. | `hero-infographic.v2`, `matrix-visual.v1`, `visual-qa.v1`; deterministic SVG/Sharp for diagrams. | DOCX/PDF. | Failed image uses fallback but must be reported; required visual missing is incomplete/fail. |
| DOCX | Render final editable proposal. | Final document model. | `final-thesis-plan.docx`. | Step 6 artifact and `GeneratedArtifact`. | `BlueprintVersion`, `GeneratedArtifact`. | DOCX. | No new science LLM in render. | PDF/download. | Renderer/QA failures block export readiness. |
| PDF | Convert DOCX to PDF. | Final DOCX. | `final-thesis-plan.pdf`. | Step 6 artifact and `GeneratedArtifact`. | `GeneratedArtifact`. | PDF. | None. | Download. | Conversion failure blocks PDF export. |

## Deterministic, LLM And Human Boundaries

- Deterministic: ownership checks, source identity, evidence levels, DOI/metadata handling, materialization status, schema validation, matrix/table rendering, private artifact persistence.
- LLM: query/topic helpers, evidence extraction, plan section generation, consistency matrix JSON, editorial compaction/review, visual QA and image generation.
- Human: intake authoring and source selection.

## Deep Research

Deep Research candidate discovery is implemented in `server/mvp/research-fallback.ts` and `server/mvp/prompts/research-discovery.v1.ts`, but Release 0 sets `IMX_ENABLE_DEEP_RESEARCH=0`. It is not part of the validated secure pilot default path.
