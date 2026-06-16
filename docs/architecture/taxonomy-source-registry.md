# Taxonomy Source Registry

## Goal

Track the authoritative external sources we will use to seed or reference:

- knowledge field taxonomies
- scholarly resource types
- publication stages
- peer review terminology
- controlled keywords
- enrichment endpoints

The committed registry lives in [lib/assets/taxonomy-source-registry.json](C:/projects/ingeniometrix/lib/assets/taxonomy-source-registry.json:1).

## Working Rule

Yes, we are moving toward local taxonomy tables in the product database, but not as one giant import of every external vocabulary.

The correct Release 0 shape is:

- local canonical tables for the taxonomies we actually need
- external dumps and APIs registered as source assets
- local downloads stored in `artifacts-local/taxonomies/`
- provider metadata kept raw and mapped into canonical local fields

This keeps the product traceable and avoids making runtime behavior depend on a live third-party taxonomy service.

## Recommended Adoption Order

### Seed Now

- `oecd-ford-2015`
- `coar-resource-types`
- `coar-version-types`

### Seed Selectively

- `unesco-thesaurus`
- `unesco-isced-f-2013`

### Reference Only

- `datacite-metadata-schema`
- `ndltd-etd-ms`
- `niso-peer-review-terminology`

### Enrichment Only

- `openalex-topic-stack`

## Download Strategy

Use:

```bash
npm run taxonomy:fetch
```

This downloads only the sources in the registry that expose direct and stable download URLs.

Current direct-download targets:

- OECD Frascati Manual 2015 PDF
- UNESCO Thesaurus RDF/XML
- UNESCO Thesaurus Turtle
- COAR Resource Types N-Triples
- COAR Version Types N-Triples

Everything else stays as a page or API reference until we have a good reason to automate ingestion.

## Storage Guidance

When we implement the database layer, keep these separations:

- canonical taxonomy concepts in local tables
- external source metadata in a source registry table or seed manifest
- raw provider payloads in provider-specific JSON fields
- normalized labels with provenance and confidence

Do not:

- store `indexed` as if it were a document type
- store `peer_reviewed` as if it were a document type
- replace provider-native values without preserving them

## Why This Matters

This gives Ingeniometrix:

- stable local classification behavior
- reproducible seeding
- traceable external references
- a clean path toward future training datasets and keyword generation
