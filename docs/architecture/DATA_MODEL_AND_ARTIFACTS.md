# Data Model And Artifacts

STATUS: CURRENT - Release 0 secure pilot.

Prisma schema: `prisma/schema.prisma`. Database engine: PostgreSQL.

## Important Models

| Name | Purpose | Producer | Consumer | Source of truth? | Audit only? | Temporary? | Private? | Retention notes | Cleanup candidate? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `User` | Account owner. | Admin provisioning/login setup. | Auth, projects, artifacts, jobs. | YES | NO | NO | YES | Retain while account exists. | NO |
| `UserSession` | Opaque session token hash, expiry and revocation. | `createSession`. | `requireCurrentUser`. | YES for sessions | NO | YES | YES | Expired/revoked sessions are cleaned opportunistically. | NO |
| `AuthThrottle` | Persistent login abuse control. | Login failures. | Login route. | YES for throttling | PARTIAL | YES | YES | Can expire by policy later. | MONITOR |
| `Project` | User workspace and status. | Project creation. | Intake, references, jobs, exports. | YES | NO | NO | YES | Owner-scoped. | NO |
| `Intake` | Structured research input. | Intake API/UI. | Discovery, normalization, generation. | YES | NO | NO | YES | Retain with project. | NO |
| `Reference` | Deduplicated bibliographic/source metadata. | OpenAlex/Crossref/enrichment. | Project references, inspection, citations. | YES for metadata | NO | NO | Mostly public metadata | Raw provider JSON retained for provenance. | NO |
| `ProjectReference` | Project-specific source candidate and selection. | Search/selection. | Source inspection and Step 5. | YES | NO | NO | YES | `selected` and `selectedOrder` are critical. | NO |
| `MvpStepRun` | Execution tracking for engine steps. | Step services. | Diagnostics, continuity, audit. | YES for runs | YES | NO | YES | Preserve run snapshots; not public. | NO |
| `ProjectEvidenceLedger` | Evidence registry/ledger for a Step 5 run. | Evidence materialization. | Step 6, evidence log, QA. | YES | NO | NO | YES | Keep with project/version evidence. | NO |
| `ProjectEvidenceCard` | Structured evidence item/card. | Step 5 LLM extraction and validation. | Sufficiency, plan generation, citations. | YES | NO | NO | YES | Evidence level and support matter. | NO |
| `ProjectSourceMaterialization` | Source/PDF/text/chunk status and provenance. | Source inspection/materialization. | Extraction, asset pipeline, audit. | YES for materialization metadata | NO | NO | YES | Heavy files stored outside DB. | NO |
| `ProjectSourceAsset` | Extracted candidate figures/tables/equations and curation. | Asset inspection. | Visual/document render if accepted. | YES for assets | PARTIAL | NO | YES | Rejected assets can remain for audit. | MONITOR |
| `BlueprintVersion` | Versioned plan JSON and snapshots. | Step 6. | Export/download routes. | YES for generated plan version | NO | NO | YES | Keep with project. | NO |
| `BlueprintJob` | Persistent generation job state. | `enqueueBlueprintJobForUser`. | Worker/progress/resume. | YES for jobs | NO | NO | YES | Completed/failed jobs retained for audit. | NO |
| `BlueprintJobStage` | Per-stage execution state. | Worker. | Recovery/diagnostics. | YES for job stages | YES | NO | YES | Retain with job. | NO |
| `GeneratedArtifact` | Final private files in DB. | Worker/export routes. | Owner-scoped downloads. | YES for final downloadable artifacts | NO | NO | YES | DB backup includes final artifacts. | NO |
| `AuditLog` | Event audit. | Audit service. | Diagnostics/compliance. | YES for audit | YES | NO | YES | Retention policy not finalized. | MONITOR |
| Taxonomy/template models | Topic/template support. | Catalog/template tooling. | UI suggestions/template runtime. | PARTIAL | PARTIAL | NO | Mixed | Some are planning/runtime support. | REVIEW_BEFORE_PRODUCTION |

## Heavy Artifacts

DB stores metadata, structured evidence, execution state and final private downloadable files. The filesystem/private volume stores heavy or intermediate files:

- PDFs and source chunks.
- Step manifests.
- Generated PNGs/visual sidecars.
- DOCX/PDF intermediate render outputs before persistence.
- QA/renders in `artifacts-local/` during validation.

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
