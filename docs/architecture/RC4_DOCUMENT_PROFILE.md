# RC4 compact document profile

STATUS: CURRENT on `feat/rc4-scientific-commercial`.

## Authority and flow

`latam-compact-v1` is defined in
`server/mvp/document-profiles/latam-compact-v1.ts`. It consumes the approved G1
`ScientificDecision` and `ResearchDesign`; layout or export failure cannot rerun G1,
evidence extraction or scientific design.
Its prompt and section budgets are selected explicitly by profile. The
`legacy-release0` prompt and budgets remain available for historical regeneration;
stored RC3 versions and artifacts are not rewritten.

```text
approved definition/design + inspected evidence
  -> bounded scientific sections
  -> structured editable consistency matrix
  -> final scientific review
  -> optional asset plan (0..4)
  -> deterministic final infographic
  -> DOCX -> PDF -> physical page validation
```

## Public structure

Cover; executive summary; problem statement; research questions; state of knowledge;
conceptual/theoretical framework; general/specific objectives and conditional
hypotheses/propositions; methodology; editable consistency matrix; final methodological
infographic; references. Schedule, budget, contribution/feasibility and standalone
scope/limitations/pending-decision sections are excluded. Essential limitations remain
inside the problem or methodology.

## Page and editorial policy

- Body: 7-12 pages; target 9-11. Cover and references are excluded.
- Adaptive word allocations reserve physical space for tables, matrix, captions and the
  final infographic.
- Over-limit recovery is deterministic compaction followed by at most one targeted
  editorial round. It never reopens scientific design.
- Failure above 12 preserves checkpoints and artifacts for a bounded presentation repair.

## Citations and assets

Literature claims in state of knowledge/framework require inspectable evidence anchors.
Questions/objectives normally contain none. Methodology cites only actual precedent.
Provider-written author-year strings are normalized to the deterministic citation labels
derived from `source_id + evidence_id` pointers.

The editable matrix is a native Word table and no matrix bitmap is generated. Up to four
other interior assets may be planned; the matrix is the fifth interior slot. Assets must
be native tables/equations or deterministic vector synthesis where possible. Published
third-party figures are not republished. The final infographic is additional, created
deterministically from the approved design, and appears immediately before references.
Optional assets are applied atomically only after successful rendering/QA.

## Rendering and acceptance

The DOCX renderer uses readable Times New Roman typography, true Word bullets, paragraph
spacing, repeated table headers, compact cell padding, heading keep-with-next behavior,
hanging-indent references and numeric folios. The consistency matrix may use landscape
pages. PDF is generated from that DOCX through LibreOffice and inspected page by page.

See `docs/quality/rc4-g3-document-acceptance.md` for the controlled acceptance result.
