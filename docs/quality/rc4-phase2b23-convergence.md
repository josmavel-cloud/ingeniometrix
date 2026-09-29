# RC4 Phase 2B2.3: web candidate convergence (offline)

`web-candidate-convergence.v1` accepts only a validated 2B2.2 proposal from a
completed search-tool observation in the same paid operation. A URL proposed
only in model JSON, a non-completed call, an unsafe URL, or a changed confirmed
intent/source-pool context cannot become a source. The persisted audit event
records the exact ASTRA_WEB observation, gap association, field-level proposal
provenance, and identity outcome. It does not use `rawOpenAlexJson`.

Identity order: exact trusted, document-specific, title-compatible observed
URL; DOI supplied by an independent
provider/identity-verification adapter; otherwise bibliographic/proposed-DOI
matches require human identity review. Model-proposed DOI is not a merge key.
Preprint/final and standard-edition ambiguity is not auto-merged. A new primary
source may have no DOI. The common `Reference`/`ProjectReference` rows represent
new discovered candidates, not automatic admissions or selections. Canonical
reference columns store the observed URL and required display title; proposed
authors, year, DOI, issuer, type, and access remain in the provenance audit,
not verified bibliographic columns. The singular `sourceProvider=OPENAI` is a
legacy field; ASTRA_WEB channel history is in the audit observation.

The existing admission policy is reused. A newly discovered title-only source
starts `NEEDS_INSPECTION`; a valid grounded candidate assessment may later be
passed through `webCandidateAdmissionFromAssessment`, which delegates to the
same `finalCandidateAdmission` policy. Partial relevance does not produce a
main recommendation; off-topic is rejected. Rediscovery of a valid already
assessed source does not request another semantic review. No model operation
occurs in 2B2.3.

The DB convergence service is deliberately gated by
`IMX_ENABLE_ASTRA_WEB_CONVERGENCE=1`; it remains disabled in staging. It checks
owner/project, PaidOperation identity and result, current confirmed intent,
latest search snapshot, recomputed source-pool/seen-set versions, and eligible
gap IDs. It locks the project, writes an idempotent audit event per proposal,
and creates `Reference`/`ProjectReference` only for a genuinely new candidate.
Existing selected rows and their bibliographic metadata are never updated.
Private audit records are the read path for the new candidate's field
provenance and identity uncertainty. This gate does not redesign the Sources
UI or automatically expose unreviewed candidates as recommendations.

Known follow-up boundary: the future real-project operation must derive fresh
coverage from both the accepted search snapshot and prior web-convergence
audit records before authorizing discovery. The convergence service checks
that context itself; a browser must never supply a source-pool version as a
spending authority. No Crossref verification or document acquisition runs in
this gate.
