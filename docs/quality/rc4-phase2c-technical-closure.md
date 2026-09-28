# RC4 Phase 2C: posterior technical acceptance decision

Decision date: 2026-09-27 (staging local time). This is a subsequent decision,
not a rewrite of the earlier live-acceptance verdict. Under the original rule
requiring **zero unknown evidence IDs returned by the model**, the final
review-only run was correctly reported as **FAIL**. The owner has since changed
that operational criterion to **zero unknown or foreign evidence IDs accepted or
used as grounding**. The production validator and scientific admission policy
are unchanged by this decision.

## Existing evidence checked without new calls

- Exact preserved diagnostic payload:
  `artifacts-local/rc4/rc4-2c-grounding-diagnostic-3c41c19f-4550-4fab-8ec9-4261a17cad34.json`
  and its `-item-trace.json` companion. The old validator accepted 15/30; the
  corrected candidate-local validator accepted 30/30. All 15 newly valid items
  used the same candidate-owned evidence unit once in support and once in
  mismatch. None had unknown IDs or within-list duplicates.
- Final review-only PaidOperation `6e437a57-181d-493c-823c-81dba94ae038`
  (request `rc4-2c-dual-grounding-final-20260928-a`) completed once with
  `candidate-review-validator.v2.1`. It requested and received 30 items. The
  validator accepted 28 and rejected two independently: each rejected item
  cited one nonexistent evidence ID. No foreign-candidate reference was
  accepted; no systemic batch failure occurred. Item validation was 28/30,
  or 93.3%. The rejected model reviews were not admitted or applied.
- The final operation contains 29 *available assessments*, not 29 newly valid
  reviews: 28 are newly validated model reviews; one rejected model review
  retains an earlier `DETERMINISTIC` assessment with its prior provenance;
  the other rejected review has no usable assessment. Thus the 30 candidates
  partition into 28 `NEW_VALID_REVIEW`, two `NEW_INVALID_REVIEW`, one of which
  also has `PRIOR_DETERMINISTIC_ASSESSMENT`, and one
  `NO_USABLE_ASSESSMENT`. These are overlapping provenance categories, not
  additive counts.
- This operator-only diagnostic used `reviewCandidateBatch` and a PaidOperation,
  but did not run the normal search integration or write a new Sources snapshot.
  No `SEARCH_COMPLETED` audit event followed the diagnostic operation.
  **DIAGNOSTIC_RESULTS_APPLIED_TO_SOURCES = NO.** The public Sources list was
  not revalidated. In particular, 14 potentially eligible assessments are not
  claimed to be displayed, the peripheral article is not claimed to have
  disappeared from the UI, and no user selection is implied.

## Revised acceptance rule and result

The technical review path is accepted for this sample only if: (1) the exact
replay proves the dual-use correction; (2) at least 90% of new items validate;
(3) no unknown or foreign-candidate reference is **accepted**; (4) invalid
items retain individual rejection reasons and valid neighbors survive; (5)
invalid output cannot become a new accepted scientific assessment; and (6)
the downstream admission policy is unchanged. All six conditions hold for the
artifacts above. The two unknown IDs remain visible as returned-error metrics;
neither was accepted. No acceptance-runner assertion required editing.

`VALIDATOR_CORRECTION = PASS` and
`SEMANTIC_REVIEW_TECHNICAL_ACCEPTANCE = PASS_WITH_LIMITATIONS`.
Consequently, `GATE_2C_TECHNICAL_STATUS = PASS_WITH_LIMITATIONS` under this
**later, explicitly revised criterion**. The earlier FAIL remains accurate
under the earlier criterion. No provider call or deployment was performed to
change the verdict.

## Separate scientific and product questions

Evidence-reference validity says only that cited IDs exist, belong to the
candidate and satisfy the grounding contract. It is **not** measured scientific
precision. Relevance and role classifications remain model judgments requiring
academic review. The deterministic `finalCandidateAdmission` policy still
governs recommendation eligibility; `PARTIALLY_RELEVANT` does not become a main
recommendation merely because its references validate. The review-only result
does not persist that eligibility to Sources. In a future normal search,
`server/retrieval/reference-search-v2.ts` consumes valid results from
`reviewCandidateBatch`, calls `decideReferenceAdmission`, then selects from
admitted candidates. This diagnostic did not execute that integration path.

Limitations: two items were correctly rejected in this sample; the 90% threshold
is a local operational acceptance criterion, not a universal reliability
standard; semantic relevance and roles are not gold-standard certified; the
public Sources list and owner selections were not updated; Crossref live
fallback was not exercised because its policy trigger did not occur; PDF/OA
signals remain reported, not verified; the rest of Phase 2 remains unfinished.

Next gate is **2B2 planning only**: bounded Astra web discovery for material
gaps, using observed URLs and explicit provenance. Its candidates must pass the
same identity, deduplication and admission controls, with an explicit budget,
no automatic selection and no indiscriminate PDF downloads. This decision does
not authorize implementing or running 2B2.
