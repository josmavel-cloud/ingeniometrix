# RC4 2B1.4: concept translation trace and recovery

## Diagnosis of the September 27 failure

The project is confirmed at revision 10. Its accepted 2B1.3 plan contained
four central concepts: seismic response, seismic simulation, masonry, and
masonry specimens, all expressed in Spanish. The accepted enrichment had no
usable English terms for those concepts; all four query families reported
`ORIGINAL_ONLY_ENGLISH_INCOMPLETE`. The accepted context translation `Peru`
does not solve central concept coverage. One or more terms were rejected with
the old aggregate `UNSUPPORTED_OR_UNSAFE_TERM` code.

The 2B1.3 private acceptance artifact contains the accepted enrichment, not the
planner's raw structured response. Staging `IMX_LLM_AUDIT_DIR` was not
configured. Therefore the historical raw translations and exact individual
rejections cannot be recovered. The evidence does not distinguish planner
omission from normalization/validation loss. Do not label either as proven.

The existing reference translation service translates a retrieved reference's
title/abstract into the UI language and caches by reference ID in
`rawOpenAlexJson`. It does not translate research concepts or retain concept
role/anchor identity. This gate reuses the versioned prompt and structured
provider conventions but leaves that service and its DOI metadata intact.

## Implementation

- `SearchEnrichment` now records planner output term count and a trace for
  every proposed translation/academic equivalent, including rejected terms.
  Each row has a stable ID, source concept ID (or unresolved anchor), source
  and target text/language, expansion type, origin, authority, source fields,
  PaidOperation ID when present, validation status and specific reason.
- A translation with unverified target language is excluded from the concept
  graph. The confirmed original concept remains available.
- Only central concepts required by composed families are recovery targets.
  Missing optional/context terms do not trigger a batch. Recovery uses one
  structured batch, `search-concept-translation` prompt 1.0.0,
  `SOURCE_TRANSLATION_RECOVERY_MODEL` (default gpt-5.4-mini), low effort.
  Outputs echo role and languages. The backend checks membership, role,
  language, length, numbers, query syntax and obvious added context/method
  phrases. This is structural validation, not proof of semantic equivalence.
- A validated translation is attached to the same scientific concept. The
  existing composer consumes it without knowing whether it came from the main
  planner or recovery. No accepted intake or scientific role is changed.
- Positive and explicit NO_SAFE_TRANSLATION results are cached under a hash of
  normalized source term, role, languages, accepted taxonomy context, prompt
  version and model. Cache lives in the existing private artifact volume.
  PaidOperation remains the outer search/plan operation; provider calls use the
  existing reservation and cost accounting. A cache hit costs no provider call.
- Failure or abstention leaves original-language families usable and reports
  `LIMITED`. No automatic retry chain. The acceptance CLI requires explicit
  `allowRecovery=1` to permit a second Responses request during a plan run.

## Offline evaluation

The committed accepted-plan fixture reproduces the four missing central
equivalents. One mocked recovery batch yields query families containing
`seismic response + masonry` and `seismic simulation + masonry`; the
Peru/2026 premise remains a separate contextual refiner. A repeat uses four
cache hits and zero calls. A valid pre-existing concept graph needs zero
recovery calls. Mocked planner translations with an added year or missing
language are rejected and then trigger recovery. Invalid roles, unavailable
provider and NO_SAFE_TRANSLATION degrade without replacing original terms.

Six multilingual fixtures exercise engineering, education, Portuguese
qualitative research and health, Spanish humanities, and English-to-Spanish
concepts. They verify graph membership/roles and query composition, not model
translation quality. False friends, acronyms and ambiguous technical terms
remain subjects for live evaluation; deterministic checks cannot certify them.
The 2B1.3 historical-label simulation remains 19/27 retained, 19/19 precise.

Live model, OpenAlex, Crossref, web and document calls in this gate: zero.
Because the historical raw response is unavailable, the exact A-versus-B
historical cause is still unproven. That limits readiness for another final
live acceptance despite the offline recovery behavior.
