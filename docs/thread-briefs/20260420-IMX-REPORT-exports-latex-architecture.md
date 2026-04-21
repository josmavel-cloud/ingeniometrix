# Thread Brief

- Thread: `IMX-REPORT-exports`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: define a minimal LaTeX template architecture for thesis-plan outputs with strong academic readability and low export fragility.

## What Changed

- Documented a Release 0 reporting direction anchored on the existing `BlueprintVersion` data model instead of a LaTeX-first design.
- Defined a minimal template layering strategy: one shared thesis-plan skeleton plus thin university-specific front-matter overrides for `UPC_POSGRADO`, `UCV_POSGRADO`, and `USMP_POSGRADO`.
- Split the future export pipeline into three small responsibilities:
  - build a canonical report document model from `blueprintJson`, `selectedReferencesSnapshotJson`, project metadata, and the evidence log
  - render format-specific outputs from that canonical model
  - keep LaTeX compilation optional and isolated from the core export data path

## Decisions

- Keep LaTeX as a renderer, not the source of truth.
  The canonical source should be a normalized report JSON built from the current schema-backed blueprint and selected reference snapshots. This keeps DOCX, BibTeX, RIS, and LaTeX aligned and traceable.

- Prefer one shared template with thin overlays.
  Release 0 should avoid separate full templates per university. Use:
  - `templates/latex/base/` for the shared document shell, packages, section order, macros, and appendix handling
  - `templates/latex/variants/` for small front-matter differences such as title labels, advisor labels, and cover-page arrangement

- Keep section generation deterministic.
  Generate these sections now from existing structured fields:
  - cover metadata
  - problem statement and delimitation
  - justification
  - objectives
  - research questions
  - hypotheses or guiding questions
  - constructs or variables
  - methodology
  - population and sample
  - data collection techniques
  - analysis plan
  - consistency matrix table
  - work plan table
  - assumptions
  - limitations
  - bibliography
  - annexes for traceability material

- Restrict tables, equations, and figures to safe cases.
  - Tables: generate only from structured arrays already present in the blueprint or export model. Start with `consistency_matrix`, `work_plan`, and a traceability annex table.
  - Equations: do not auto-invent or auto-format equations from prose. Only render equations later if they are explicitly carried as structured blocks in the export model.
  - Figures: do not auto-create charts or diagrams in Release 0. If figures are needed later, require explicit assets plus captions in structured input.

- Keep bibliography generation independent from LaTeX tooling.
  The same normalized reference list should drive:
  - LaTeX bibliography rendering
  - BibTeX export
  - RIS export
  - DOCX reference section
  For Release 0 reliability, LaTeX should not depend on `biber` or fragile citation packages to produce a usable report artifact.

- Treat annexes as export-safe appendices.
  Annexes should hold material that improves traceability and reviewability, such as:
  - selected references summary
  - evidence log excerpt or pointer
  - assumptions and missing-information notes
  Avoid annex content that depends on external binaries or unsupported file ingestion.

## Minimal Architecture

- `server/reporting/report-model.ts`
  Builds a canonical thesis-plan document model from `Project`, `BlueprintVersion`, selected references snapshot, and evidence log data.

- `server/reporting/reference-model.ts`
  Normalizes authors, title, DOI, venue, year, and provider identifiers once so LaTeX, DOCX, BibTeX, and RIS stay consistent.

- `server/reporting/latex/`
  Contains:
  - `escape-latex.ts` for deterministic character escaping
  - `render-sections.ts` for section-level rendering
  - `render-tables.ts` for controlled table output
  - `render-bibliography.ts` for direct bibliography rendering from the normalized reference model
  - `render-document.ts` to stitch base template plus variant fragments

- `templates/latex/base/`
  Shared shell files only:
  - document preamble
  - macros for captions, annex headings, and safe table styles
  - section placeholders

- `templates/latex/variants/`
  One small fragment per university template for cover and institutional labels.

## Generate Now Vs Later

- Generate now:
  - canonical report document model
  - shared section ordering
  - deterministic tables from structured arrays
  - bibliography from normalized reference data
  - annexes for traceability
  - thin per-university front-matter overrides

- Generate later:
  - custom `.cls` or `.sty` files
  - automatic figures or charts
  - equation blocks beyond plain text placeholders
  - advanced citation styles with external bibliography processors
  - university-specific typography polish that does not affect Release 0 reliability

## Risks

- Schema mismatch risk.
  The current `research-blueprint.schema.json` does not carry structured equations, figures, captions, or annex assets. Trying to infer them from prose will create brittle exports and traceability gaps.

- Toolchain risk.
  Requiring a full TeX toolchain, multi-pass bibliography tools, or nonstandard packages will make exports fail differently across Ubuntu, WSL, and Windows control environments.

- Escaping risk.
  Unescaped `%`, `&`, `_`, `#`, `{`, `}`, and backslashes in titles, author names, venues, or user intake fields can break compilation or corrupt output.

- Table overflow risk.
  Long titles, verbose objectives, and Spanish prose can easily overflow narrow table layouts. Release 0 should favor simple, multi-page-safe table patterns over dense formatting.

- Traceability drift risk.
  If LaTeX, DOCX, BibTeX, and RIS each build citations differently, reference ordering and metadata will diverge. A single normalized reference model is required.

- Variant sprawl risk.
  Fully separate templates for UPC, UCV, and USMP will multiply maintenance cost before the MVP export path is stable.

## Files Touched

- `docs/thread-briefs/20260420-IMX-REPORT-exports-latex-architecture.md`

## Verification

- Reviewed the repo workflow and scope rules in `AGENTS.md`, `docs/architecture/codex-workflow-blueprint.md`, `docs/runbooks/debugging.md`, and `docs/runbooks/worktrees.md`.
- Reviewed current export-adjacent data contracts in:
  - `ai/schemas/research-blueprint.schema.json`
  - `ai/schemas/evidence-log.schema.json`
  - `prisma/schema.prisma`
  - `server/blueprint/blueprint-prompt.ts`
  - `server/blueprint/blueprint-validation.ts`
  - `server/blueprint/blueprint-service.ts`

## Follow-ups

- Add a small ADR once implementation begins and the canonical report model shape is fixed.
- Extend the export model only when a new field can also remain traceable in DOCX, BibTeX, RIS, and evidence-log outputs.
- Decide whether LaTeX compilation itself is an internal step or a developer-only verification tool before adding toolchain automation.
