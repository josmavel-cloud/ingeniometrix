# RC4 G1 integrity checkpoint

Status: PARTIAL G1; deterministic incident repairs validated. Scientific-design
superiority, selector/critic, pre-job accounting and commercial acceptance NOT_RUN.

## Read-only incident evidence

Reference project `501ca19d-eaa6-4783-a89f-b95c959e0baa`, job
`1349d6a7-0144-441b-87d0-b075e0fe5e87`, version
`0ff500fc-7e85-4958-b43c-705ca800027e`. Private capture:
`artifacts-local/rc4/reference/snapshot.json`; reproduction:
`npx tsx scripts/rc4-inspect-reference.ts` (read-only SQL and container files).
No reference database, original artifact, RC3 source or container was changed.

| Handoff | Observed cause | Repair |
| --- | --- | --- |
| Human selection -> version | Five selected; version snapshot filters to four cited sources | Preserve all selected; bibliography still includes only cited sources |
| Version -> evidence log | `extractExportReferences` incorrectly labels cited subset as selected | Separate selected, considered, used, excluded; legacy completeness explicitly unknown |
| S5 PDF -> excerpts | `pdftotext -layout` interleaves two columns. Six extracted items, zero exact substring matches | Default reading order; conservative line-end dehyphenation; verify cited page/chunk, not arbitrary source text |
| Source -> scientific context | Unverified full-text items correctly rejected; DOI/PDF alone insufficient | Keep strict support gate; explicit per-source exclusion reason |
| Rejected matrix -> document | Failed pixel QA followed by unvalidated deterministic overwrite, then unconditional insertion | Do not insert rejected image; preserve native editable matrix and private rejection record |
| Completed job -> accounting | `control:cost` remains RUNNING | Atomic terminal closure; unknown/in-flight usage retains reservation; late settlement does not reopen job |

S5: DOI `10.3319/tao.2016.05.03.01(tem)`, 16 pages, 31 chunks,
PDF SHA256 `64c40d12357e5cb2f640cb7dcd4f412e8779906a7372631e4d94894cc74ed58d`.
Read-only re-extraction in reading order recovered exact normalized text for
five of six historical excerpts. This is NOT five newly accepted scientific
claims: one is gap-only; anchor accuracy and relevance still apply. The sixth
excerpt omits source detail and must not be accepted through fuzzy matching.
Historical outputs remain historical; no new scientific run was performed.

## Regression evidence

- Isolated PostgreSQL `imx-rc4-validation`, loopback port 55440,
  database `imx_b4_validation_rc4`, separate persistent volume.
- Baseline migrations applied only to that new database.
- 49/49 offline suites PASS (48 existing + evidence-integrity suite).
- B4 suite: 48 assertions, including terminal cost state, retained unknown
  reservation, late reconciliation and zero scientific calls on recovery.
- Visual suite: accepted matrix still image-first; rejected matrix absent,
  editable table retained.
- Prisma validate, TypeScript, production app build and worker build PASS.
  Invoke builds with environment inherited by npm, not a direct Node `--env-file`
  on Next.js (its worker rejects that inherited exec argument).
- Logs: `artifacts-local/rc4/offline/2026-09-21T21-00-35-193Z/results.json`.
- Paid calls: 0. No human scientific review claimed.

## Data continuity

`source_dispositions`: Step 6 producer, evidence-log consumer; private versioned
audit metadata, not user-facing bibliography. Full selected snapshot remains
the authority for selection, not the live project after publication.

`control:cost.terminal`: job completion/failure transaction producer; diagnostic
and recovery consumers. Entries and persisted pricing policy are retained.
`pending_reconciliation` is a reserved cost, not zero usage or a refund.

Rejected image outputs are audit-only, not a cleanup candidate merely because
they are excluded. Retention policy remains a later operational requirement.

## Remaining G1 work

Independent selector/critic and user-approved design, explicit pre-job request/
draft/revision attribution and durable reservations, inline prompt registry,
scientific comparison on equivalent evidence. G1 is not approved until the
comparative scientific evaluation demonstrates improvement.
