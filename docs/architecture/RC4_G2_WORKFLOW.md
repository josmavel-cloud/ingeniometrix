# RC4 G2 Draft, Taxonomy And Version Workflow

STATUS: CURRENT for `feat/rc4-scientific-commercial`.

## Visible Workflow

The product exposes only:

1. Idea
2. Define tu investigación
3. Evidencia
4. Plan de tesis

Generation jobs, evidence materialization and internal engine stages are not
user navigation steps. `Ajustes opcionales` is not part of RC4.

## Taxonomy

The canonical catalog is `FORD-2015`, seeded from
`lib/assets/ford-2015-curated.json`. Version
`2015-table-2.2-es-latam-v1` preserves the OECD Table 2.2 English label,
Spanish localization, aliases, parent/child codes and explicit local extensions.
The source and adaptation provenance are stored on the scheme/concepts.

Lookup order is exact code, exact normalized Spanish/original label, then exact
alias. Search is accent-insensitive. Unclear free text creates a project-owned
`CUSTOM_UNRESOLVED` mapping and never inserts a global concept.

## Draft And Publication Contracts

| Action | Endpoint/service | Contract |
| --- | --- | --- |
| Create project | `POST /api/projects` | University omitted or a historical enum; country is ISO-2; level includes pregrado, maestría or general research project. |
| Read draft | `GET /api/projects/:id/draft` | Owner-only; returns revision, ETag, confirmed revision and all advanced fields. |
| Autosave | `PUT /api/projects/:id/draft` | Requires current revision/ETag; stale writes return `409 DRAFT_REVISION_CONFLICT`. |
| Confirm/freeze input | `POST /api/projects/:id/draft` then `POST /api/projects/:id/blueprints` | Confirmed revision is frozen in `GenerationInputSnapshot`; persistent job is canonical execution. |
| List versions | Project page / blueprint service | Owner-only, descending immutable version numbers. |
| Select active version | `PATCH /api/projects/:id/blueprints/:versionId` | Moves only the project pointer; published data is not rewritten. |
| Source selection | Existing reference selection API | Persists ordered selection in the draft and invalidates evidence-dependent scopes. |
| User PDFs | `GET/POST /api/projects/:id/documents` | G2 advertises the maximum-two contract; POST returns explicit `501` until storage/inspection is implemented. |

Every published version records origin draft revision, generation job and input
snapshot when available, frozen intake/reference/evidence information, prompt,
model/cost/page policies, approvals, artifacts and terminal source disposition.
Heavy content is referenced by stable artifact/document identifiers and hashes.

## Conservative Invalidation

- Topic, problem, population, scope or constructs invalidate scientific
  decision, evidence pack, design, sections, matrix and assets.
- Methodology or available-data changes invalidate design and its consumers.
- Research line, constraints or pending decisions invalidate decision/design and
  generated sections/matrix.
- Source selection invalidates evidence, design, sections, matrix and assets.
- Historical versions are never deleted or marked as if their original input had
  changed; stale scopes apply only to the mutable current draft.

## Migration And Rollback

Migrations `20260922120000_rc4_g2_taxonomy_versions` and
`20260922123000_rc4_g2_draft_fields` are additive and preserve historical
university values. Validate on a restored/isolated database before release.
Rollback means restoring the pre-migration backup or deploying a reviewed
compensating migration. Never run `db push`, drop immutable plan data or remove
taxonomy fields after new versions have been published.
