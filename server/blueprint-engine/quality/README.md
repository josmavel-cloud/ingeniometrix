# Blueprint Engine Quality Guards

## Source Health Categories

- `usable_full_text`: materialized source text has usable chunks or source-text-backed evidence.
- `partial_full_text`: some text is available, but chunk/source-text support is incomplete.
- `metadata_only`: only metadata or abstract context is available.
- `unresolved`: no useful public content was resolved.
- `unextractable_pdf`: a PDF exists, but extracted text/chunks are empty.
- `wrong_document_suspected`: deterministic warnings suggest the resolved document may not match the intended source.
- `unknown`: not enough deterministic signals are available yet.

## Topic Fit Categories

- `direct`: can support central topic claims when source health is also strong.
- `adjacent`: related or comparative evidence that needs cautious use.
- `background`: useful only for context.
- `weak`: weak fit for the central topic.
- `unknown`: not enough deterministic signals are available yet.

Production gates should use `usable_full_text_source_count` and source-health warnings rather than raw selected-source count.

## Citation Semantics Categories

- `direct_quote_from_source_text`: chunk-backed excerpt recovered from source text. This is the only category that may count as `direct_quote`.
- `paraphrase_from_source_text`: source-text-backed material that can support paraphrase, but should not be quoted verbatim.
- `asset_reference`: table, image, equation, or figure evidence traceable to a source asset.
- `interpreted_signal`: extracted or consolidated interpretation that can guide drafting, but should not be presented as a direct quote.
- `metadata_context`: title, abstract metadata, provider metadata, or unresolved-source context.
- `intake_context`: user/project intake context.
- `not_citable`: material that cannot support a citation or claim.
