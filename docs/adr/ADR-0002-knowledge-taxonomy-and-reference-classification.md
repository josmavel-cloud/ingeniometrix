# ADR-0002: Knowledge Taxonomy And Reference Classification

## Status

Proposed

## Context

Planimetrix already stores raw provider payloads for references, but it still treats document typing as a loose provider string via `Reference.workType`.

That is too weak for the next product needs:

- classify projects and references consistently
- distinguish document type from peer review and indexing
- keep traceability for every assigned label
- support future training datasets for keyword generation and classification

There is no single global standard that covers all of those dimensions at once. The current state of the art is to combine a small set of compatible standards:

- `FORD` for research fields
- `ISCED-F` for study fields when academic program classification is needed
- `DCMI Type` for broad resource type
- `COAR Resource Type Vocabulary` for specific scholarly resource types
- `DataCite` resource types for DOI ecosystem interoperability
- `ETD-MS` for thesis and dissertation metadata
- `NISO` peer review terminology for review status and review model
- `UNESCO Thesaurus` for controlled subject terms

## Decision

Planimetrix will classify knowledge and references using multiple explicit axes instead of one overloaded field.

The canonical axes are:

- `knowledge_field`: discipline or research field, based on `FORD`
- `study_field`: optional academic field, based on `ISCED-F`
- `resource_type_general`: broad type such as `Text`
- `resource_type_specific`: scholarly type such as `master thesis`, `doctoral thesis`, `journal article`, `research article`, `review article`, or `conference paper`
- `peer_review_status`: whether peer review is known, absent, or unknown
- `publication_stage`: preprint, accepted manuscript, version of record, corrected, retracted, or unknown
- `index_membership`: membership in concrete indexes such as `OpenAlex`, `Crossref`, `DOAJ`, `Scopus`, or `WebOfScience`
- `keywords`: controlled or free-text keywords with provenance

These rules also apply:

- `indexed` is not a document type and must never replace `resource_type_specific`
- `peer_reviewed` is not a document type and must never replace `resource_type_specific`
- every normalized label must preserve provenance and evidence
- provider-native values must be kept raw and mapped into canonical labels, not overwritten

## Consequences

Positive:

- better retrieval and filtering for thesis planning workflows
- cleaner prompt inputs for blueprint and export steps
- traceable, reusable labels for future keyword and classification models
- less ambiguity between `tesis`, `articulo`, `paper`, `preprint`, and `indexado`

Trade-offs:

- more schema and seed data are required
- some provider metadata will remain partial or unknown
- Release 0 should adopt this in phases to avoid scope creep

## Adoption Notes

Release 0 should stay narrow:

- add canonical classification fields for references
- add concrete index membership records
- add project-level research field assignment
- store keywords with source and confidence

Defer richer ontology work until the product is using the minimum normalized layer well.
