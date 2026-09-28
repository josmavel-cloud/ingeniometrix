# RC4 Phase 2B2.1 - offline evidence gap and coverage engine

Date: 2026-09-28. Status: PASS for offline implementation; not live web acceptance.
Baseline: `f7046f0ef36c7db9a6080119593b3301cb68156f`, branch
`feat/rc4-scientific-commercial`. No deployment or live provider/model call.

## Scope and integration

Added pure server-side `EvidenceGap.v1` / `EvidenceCoverage.v1` contracts,
requirement projection, coverage evaluation, and a read-only adapter for existing
private search snapshots. No existing planner, review, admission, retrieval,
cache, selection, cost or acquisition code was changed. There is no route,
WebDiscoveryProvider, paid operation, automatic selection or database write.

`evaluateEvidenceCoverage` receives the confirmed READY ResearchSearchIntent,
its hash, current source pool, provenance-bearing assessments, and optional
validated SearchEnrichment/explicit grounded requirements.
`evaluateSnapshotCoverage` adapts existing search snapshots and compatible
history without importing their runtime orchestration. It excludes diagnostic
reviews that were never applied to the current source pool. Its current snapshot
must match project, definition hash and confirmed revision and must not be stale.

All eligible structured intent signals remain inspectable in the output. Fields
not mapped into requirements are explicitly reported as `unmappedIntentFieldRefs`.
This initial deterministic engine is not an exhaustive semantic interpretation of
every sentence. It does not claim that absence of a derived requirement means
the entire research definition is sufficiently covered.

## Contracts and policies

- Policies: `evidence-gap-policy.v1`, `evidence-coverage-policy.v1`.
- Pool version: `coverage-source-pool.v1:<sha256>` over current intent and sorted
  source metadata/assessments/provenance. Separate stable `seenSetHash`.
- Dimension/gap IDs derive from intent, grounded dimension/anchors/concepts,
  gap kind and policy, never array position or pool size. `gapsHash` includes the
  current observations and pool version. Reordering inputs does not change them.
- Every gap retains type, importance, intent refs, dimension, inspected
  observations, insufficiency, role, source types, context, unresolved premises,
  access preference, uncertainty, origin, status and explicit eligibility/reason.
- MATERIAL requires an eligible confirmed dimension and concrete recorded
  insufficiency after inspecting current metadata. Counts are not thresholds.
- DISCOVERY means not identified in this finite pool, never known absent from
  literature. `KNOWN_ABSENT` is representable but is never emitted by this engine.
- EVIDENCE means the current assessed match does not establish the required
  dimension, or assessment remains pending/invalid. Pending, invalid or
  unverifiable assessment blocks automatic web eligibility until reviewed.
- ACCESS routes to inspection/location/acquisition. IDENTITY routes to identity
  reconciliation. Neither is an Astra-discovery trigger.
- Only MATERIAL DISCOVERY/EVIDENCE with no unresolved access/identity/review
  prerequisite is eligible for a future web operation. Eligibility is not an
  operation, permission to charge, or an automatic execution.
- Missing PDF never establishes a discovery gap. Available abstract can support
  coverage; reported PDF does not verify document usability. Coverage based on
  title alone is insufficient under the default abstract basis.

Requirements use exact confirmed spans and validated high-authority concept
alternatives, not invented synonyms. Core scientific identity is generic; no
universal population, empirical or methodology requirement exists. Context is
supporting by default. Explicit qualified objects/purposes can justify material
dimensions. Unknown/unaccepted/default fields cannot anchor requirements.

Normative premises in eligible core fields require authoritative corroboration.
They remain `UNVERIFIED_USER_PREMISE`, even when user-confirmed. A narrow generic
normative-language rule preserves this need if enrichment omitted the instrument;
it retains the complete original field rather than inventing a standard name.
This exact-span fallback can miss paraphrases and should be reviewed before future
paid execution. It does not verify existence, issuance date or applicability.

## Assessment validity and persistence

Coverage preserves DETERMINISTIC versus MODEL_REVIEW provenance. Model assessment
requires a matching accepted item in a compatible snapshot, identical assessment,
current intent and metadata hash, supported policy, source-owned canonical evidence,
and valid quotes. Within-list duplicates/foreign or absent IDs cannot support
coverage; legitimate support/mismatch overlap remains allowed. Weak/partial
assessments do not prove a dimension covered. Historical or foreign sources are
excluded; conflicting duplicate identities are rejected, not silently merged.

Results are JSON-serializable for existing private snapshot/audit structures.
No persistence hook or migration was added. A future integration must atomically
snapshot the current intent/pool with the paid-discovery decision and recheck
versions before spending. Independently queryable gap history/concurrent claims
may later justify a table; v1 does not pretend to provide that durable lock.

## Real current project: read-only evidence

Project: `9843af3a-d1cc-421c-a02f-a309f751a0c8`.
Current draft/confirmed revision: 10/10. Confirmed Intake definition hash agrees
with the latest completed search snapshot; no stale-intent substitution.

- Definition hash: `d169f9a0cfd7d567a6b82cca3e1cd769d7138cddbe42e286bc6ec4611b272cdc`.
- SearchIntent hash: `d429d5848bc11736ad558184fba9411487b1f5dbbf5d10b842de4e40f9f345b3`.
- Search snapshot: `2026-09-28T02:03:58.534Z`.
- Current candidates: 135; 49 with abstract, 86 without. No materialized full
  text is represented by this snapshot adapter. Reported URLs were not fetched.
- Pool hash: `coverage-source-pool.v1:c0b561139c23c1e64c732c687e6c8acc75f41ab21fe7f5bdced417824664a1a6`.
- Gap-set hash: `ab335b93584d0d49dddae742b252f93eba2beb75931942825d65cbfcfe0e6939`.

| Tested dimension | Current evidence and decision |
| --- | --- |
| Core scientific identity | 21 grounded metadata observations support broad identity; not 21 certified directly applicable studies. No core discovery gap emitted. |
| Full-scale qualifier | Three abstract-based matches; one is the full-scale experimental stone-masonry building paper (`10.1080/13632469.2013.876946`). The other matches include different structural typologies. Full-scale precedent is not absent, but exact specimen applicability remains for inspection. |
| Peru/local applicability | One grounded abstract match: *Appraising the Seismic Response of a Retrofitted Adobe Historic Structure...* (`10.3390/buildings12111795`). Local coverage is conditional/supporting, not universally absent or necessarily applicable to the precise specimen. |
| Stated 2026 normative premise | MATERIAL STANDARD_OR_CODE DISCOVERY candidate: no authoritative corroboration identified in the current metadata. The snapshot has no verified issuer/source-type information. The user's premise remains unresolved; this is a confirmation need, not a claim that the standard exists. |
| General seismic-design context phrase | Supporting lexical coverage not identified. Not web-eligible solely for this reason. |
| Method/modeling | Confirmed method preference UNKNOWN. No invented experimental/modeling requirement or gap. Existing methodological papers are not converted into a user-chosen method. |
| Missing abstracts/PDF/materialization | Inspection/access limitations, not 86 new discovery gaps. No document acquisition performed. |

Result: five derived dimensions, two gaps, **one future-web-eligible material
gap**. Nothing was selected, persisted to Sources or sent to a provider.
Nineteen core-match assessments fail this coverage projection's current metadata/
grounding checks and are excluded; this is not a rerun or reclassification of
their historical semantic operations. Existing valid neighbors remain usable.

Reproduction: feed `{intent,snapshot,history}` JSON from the same current private
records to `node --import tsx scripts/evaluate-rc4-phase2b21.ts`. The evaluator reads
stdin, prints an explanation, and has no DB/network/write implementation.
Historical artifacts and diagnostic results were not edited.

## Validation

`scripts/test-rc4-phase2b21.ts` passes with fetch forbidden. Fixtures cover
engineering, education, qualitative social science, health and humanities;
explicit empirical/method/official/context needs; adequate/low-count coverage;
access-only and identity-only limitations; unknown methodology; unsupported user
premise; invalid/stale/foreign assessments; weak candidates; current snapshot
provenance; deterministic origin; dual-use grounding; stable hashes and reorderings.
Production files are explicitly checked for fixture/domain/country/DOI hardcoding.

Passed suites:

- 2B2.1; 2B1 and integration; 2B1.1 and provider policy; 2B1.2; 2B1.3; 2B1.4.
- 2C; ResearchSearchIntent; 2A admission and listing; Phase 1 handoff.
- B2 evidence continuity; G2; prejob budget; B4 resilience/cost/idempotency.
- TypeScript (`tsc --noEmit`); backend/application `npm run build`.

DB-backed fixtures used only isolated `imx_b4_validation_rc4`; provider credentials
were disabled for test children. Staging data was read-only. Build succeeds with
two broad artifact-path tracing warnings in unchanged source-selection code.
No separate frontend rebuild is required: no frontend/shared contract was changed.

## Handoff

Ready for 2B2.2 web-adapter implementation review, not automatic implementation
or execution. Before any live spend, verify exact runtime model/tool support,
tool-inclusive reservation/idempotency and source-observation provenance.
Preserve a common identity/dedupe/admission path, no model-memory bibliography,
no automatic source selection, and no document download in discovery.

Schema changes, deployment, live LLM/web/OpenAlex/Crossref/document/Deep Research
calls: **0**. Five unrelated G5 files remain untouched and outside the commit.
