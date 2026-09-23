# Data Model And Artifacts

STATUS: CURRENT - Release 0 secure pilot.

Prisma schema: `prisma/schema.prisma`. Database engine: PostgreSQL.

## Important Models

| Name | Purpose | Producer | Consumer | Source of truth? | Audit only? | Temporary? | Private? | Retention notes | Cleanup candidate? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `User` | Account owner. | Admin provisioning/login setup. | Auth, projects, artifacts, jobs. | YES | NO | NO | YES | Retain while account exists. | NO |
| `UserSession` | Opaque session token hash, expiry and revocation. | `createSession`. | `requireCurrentUser`. | YES for sessions | NO | YES | YES | Expired/revoked sessions are cleaned opportunistically. | NO |
| `AuthThrottle` | Persistent login abuse control. | Login failures. | Login route. | YES for throttling | PARTIAL | YES | YES | Can expire by policy later. | MONITOR |
| `Project` | User workspace, optional university and active plan version. | Project creation/version selection. | Draft, references, jobs, exports. | YES | NO | NO | YES | Owner-scoped; historical university values remain. | NO |
| `Intake` | Confirmed canonical research definition, including RC4 advanced fields. | Draft confirmation/intake API. | Discovery, normalization, generation. | YES for confirmed definition | NO | NO | YES | Retain with project. | NO |
| `ProjectDraft` | Mutable resumable workspace with revision, content hash, stale scopes and ETag contract. | Autosave/source selection. | UI, confirmation, generation freeze. | YES for current work | NO | NO | YES | Never overwrite a newer revision silently. | NO |
| `GenerationInputSnapshot` | Immutable generation-time project, references, evidence/materialization metadata, policies and approvals. | Persistent job enqueue. | Worker/checkpoint recovery and plan manifest. | YES for generation inputs | NO | NO | YES | DB trigger rejects mutation. | NO |
| `Reference` | Deduplicated bibliographic/source metadata. | OpenAlex/Crossref/enrichment. | Project references, inspection, citations. | YES for metadata | NO | NO | Mostly public metadata | Raw provider JSON retained for provenance. | NO |
| `ProjectReference` | Project-specific source candidate and selection. | Search/selection. | Source inspection and Step 5. | YES | NO | NO | YES | `selected` and `selectedOrder` are critical. | NO |
| `MvpStepRun` | Execution tracking for engine steps. | Step services. | Diagnostics, continuity, audit. | YES for runs | YES | NO | YES | Preserve run snapshots; not public. | NO |
| `ProjectEvidenceLedger` | Evidence registry/ledger for a Step 5 run. | Evidence materialization. | Step 6, evidence log, QA. | YES | NO | NO | YES | Keep with project/version evidence. | NO |
| `ProjectEvidenceCard` | Structured evidence item/card. | Step 5 LLM extraction and validation. | Sufficiency, plan generation, citations. | YES | NO | NO | YES | Evidence level and support matter. | NO |
| `ProjectSourceMaterialization` | Source/PDF/text/chunk status and provenance. | Source inspection/materialization. | Extraction, asset pipeline, audit. | YES for materialization metadata | NO | NO | YES | Heavy files stored outside DB. | NO |
| `ProjectSourceAsset` | Extracted candidate figures/tables/equations and curation. | Asset inspection. | Visual/document render if accepted. | YES for assets | PARTIAL | NO | YES | Rejected assets can remain for audit. | MONITOR |
| `BlueprintVersion` | Immutable published plan version, origin draft revision, job/input lineage and manifest. | Step 6 publication transaction. | Version list, active selection, export/download. | YES for generated plan version | NO | NO | YES | New draft edits create a later version; DB trigger protects scientific payload. | NO |
| `PlanSourceDisposition` | Terminal per-version outcome for every selected source. | Plan publication. | Evidence log/audit. | YES | NO | NO | YES | Exactly `USED`, `CONSIDERED_NOT_USED` or `REJECTED_AFTER_INSPECTION`, with reason. | NO |
| `TaxonomyScheme` / `TaxonomyConcept` | Versioned OECD FORD hierarchy, localized labels and aliases. | Reproducible seed. | Idea UI/project mapping. | YES for canonical classification | NO | NO | Public taxonomy metadata | Free text never mutates the catalog. | NO |
| `ProjectKnowledgeField` | Project mapping to canonical concept or `CUSTOM_UNRESOLVED`. | Project creation/classification. | Snapshot/sidebar/retrieval context. | YES for project classification | NO | NO | YES | Preserve submitted label and taxonomy version. | NO |
| `BlueprintJob` | Persistent generation job state. | `enqueueBlueprintJobForUser`. | Worker/progress/resume. | YES for jobs | NO | NO | YES | Completed/failed jobs retained for audit. | NO |
| `BlueprintJobStage` | Per-stage execution state. | Worker. | Recovery/diagnostics. | YES for job stages | YES | NO | YES | Retain with job. | NO |
| `GeneratedArtifact` | Final private files in DB. | Worker/export routes. | Owner-scoped downloads. | YES for final downloadable artifacts | NO | NO | YES | DB backup includes final artifacts. | NO |
| `AuditLog` | Event audit. | Audit service. | Diagnostics/compliance. | YES for audit | YES | NO | YES | Retention policy not finalized. | MONITOR |
| Taxonomy/template models | Topic/template support. | Catalog/template tooling. | UI suggestions/template runtime. | PARTIAL | PARTIAL | NO | Mixed | Some are planning/runtime support. | REVIEW_BEFORE_PRODUCTION |

## Draft And Version Producers/Consumers

`ProjectDraft.contentJson.intake` is produced by autosave. Confirmation copies it
to `Intake`. Job enqueue freezes it in `GenerationInputSnapshot`; plan publication
links that snapshot and revision to a new `BlueprintVersion`. The project's
`activeBlueprintVersionId` is a pointer only and does not mutate older versions.
Source selection increments the draft revision and invalidates evidence/design
downstream scopes conservatively.

## Heavy Artifacts

DB stores metadata, structured evidence, execution state and final private downloadable files. The filesystem/private volume stores heavy or intermediate files:

- PDFs and source chunks.
- Step manifests.
- Generated PNGs/visual sidecars.
- DOCX/PDF intermediate render outputs before persistence.
- QA/renders in `artifacts-local/` during validation.

`latam-compact-v1` adds no Prisma model. Its profile, section/page budgets, citation
policy and asset policy live in `server/mvp/document-profiles/latam-compact-v1.ts`.
The published `BlueprintVersion.blueprintJson` remains the structured source of truth;
DOCX/PDF are render products, and the native consistency matrix is derived from the
validated structured matrix. Optional asset failures are transactional: a failed or
uninventoried asset cannot be inserted into the document. Presentation-only validation
artifacts remain private and do not mutate an immutable plan version.

`artifacts-local/` is excluded from release Docker context and must remain uncommitted.

## Ownership And Download Rules

Final downloads must match:

```text
userId + projectId + blueprintVersionId + artifact kind
```

`GeneratedArtifact` also stores `jobId` when produced by the release worker. Download routes first try the private stored artifact, then fall back to canonical Step 6 artifacts only through owner-checked `BlueprintVersion` lookup.

## Cleanup Candidates

- Old lab/reporting/template planning models: REVIEW_BEFORE_PRODUCTION, because some code may still reference them.
- Rejected source assets and debug sidecars: MONITOR, audit-only unless storage pressure requires retention policy.
- Historical local validation outputs: CLEAN_AFTER_ACCEPTANCE outside Git.
- Legacy route/report preview paths: CLEAN_BEFORE_PRODUCTION only after verifying no current UI contract uses them.
