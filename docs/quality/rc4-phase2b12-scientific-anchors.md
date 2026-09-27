# RC4 2B1.2: scientific roles and deterministic query composition

## Scope

Offline implementation only. No live model, scholarly, web, document, Deep
Research or generation calls. No model migration, schema migration, 2C work,
Crossref/client changes, ranking redesign or acquisition changes.

Baseline: `fbce08bdcca55d3cd8d2d858561cab5a640c14f3`.
Five pre-existing G5 files remain excluded from these commits, byte-identical.

## Root cause and contracts

Field-level CONCEPT was not a scientific role. The old composer could choose a
qualifier by a lexical tie-break, then validate only redundancy. Provider query
structure must not depend on that choice or on unchecked LLM-generated syntax.

- `scientific-concepts.v1`: local stable ID, grounded value, explicit scientific
  role, role basis, source fields, authority, provenance and term representations.
- Roles: PHENOMENON, RESEARCH_ACTION, OBJECT_OR_SYSTEM, CORE_CONCEPT,
  METHOD_OR_TECHNIQUE, THEORY_OR_FRAMEWORK, CONTEXT, GEOGRAPHY,
  TIME_OR_STANDARD, QUALIFIER.
- Representations retain original/translation/equivalent/synonym/related status,
  language, confidence and translation linkage. Original recovery copies only a
  confirmed span; it does not generate translations or scientific facts.
- `scientific-query-composition.v3`: family/purpose, required/optional/refiner
  IDs, source refs, language, relaxation level and deterministic validity reasons.
- `semantic-retrieval.v3`; externalized planner prompt 2.2.0. New structured
  responses require nullable role/language fields. Missing legacy fields are
  explicitly adapted; null role in a new response is not silently guessed.

Confirmed fields, tiers, SearchIntent v2, original SearchEnrichment terms and
2A admission are preserved. Roles supplement query composition, not final
ScientificDesign or a new relevance engine.

## Deterministic constraints

Every ordinary family requires independent scientific and object/domain anchors.
An accepted object must remain represented. Qualifiers, geography, context,
years/codes and academic level cannot satisfy the scientific-anchor slot.
Explicit restrictive roles and generic linguistic qualifier/date guards take
precedence over unsafe role suggestions. Unknown/rejected/default sources and
unsupported method terms are excluded. Related/exploratory terms never replace
all high-authority anchors. Broad sentence anchors are not atomic concepts.

Method/theory families require the corresponding grounded precedent plus the
object/domain. A known preference is a literature signal, not a settled design.
Corpus/topic/domain concepts support humanities without a population or a
quantitative-variable requirement.

Relaxation: 0 qualified core/object; 1 scientific core/object; 2 grounded
action/method precedent with domain; 3 theory/context branch with domain.
Context is a separate branch, never a universal international constraint.
No fixed query quota: one sound narrow family is allowed. Duplicate purpose,
near-identical concept sets, composite/constituent tautologies and universal
long phrases are rejected. Before execution, stored family validity and
deterministically rendered query strings are checked again.

English coverage requires an English representation for every required concept.
Otherwise preserve the complete original-language family and mark
`DEGRADED_ORIGINAL_LANGUAGE`; do not silently delete concepts or guess a
translation. Old stored outputs have no language tags: their translations remain
traceable, but are not certified as English and are not used in rendered English
branches. This deliberately favors honesty over a speculative multilingual PASS.

## Stored-plan replay

Permanent fixture: `scripts/fixtures/phase2b12-stored-plans.json`. It contains
the recorded validated nano/mini enrichment, roles, anchors, authority, groups
and queries. Raw pre-validation provider responses were not retained in that
acceptance; this fixture does not pretend to reconstruct discarded terms.
The original private acceptance artifacts are untouched.

Nano now yields two structurally valid original-language families:

1. `("Simulación sísmica") AND ("albañilería")`
2. `("Simulación sísmica") AND ("especímenes de albañilería de escala natural")`

Its object translations are missing. International coverage remains incomplete;
these Spanish queries are permitted, not evidence of adequate international recall.
The medium-confidence response term remains exploratory, not silently promoted.

Mini now yields:

1. `("simulación sísmica") AND ("albañilería")`
2. `("simulación sísmica") AND ("especímenes de albañilería de escala natural")`
3. `("simulación sísmica") AND ("albañilería") AND ("Perú")`

`escala natural` / `full-scale` is QUALIFIER, never PHENOMENON. Broad context
translations sharing a sentence anchor are withheld; literal Peru is retained
as its own grounded contextual refiner. The standard's identity is not verified.

The earlier 30-term seismic fixture produces four distinct original-language
families: response + masonry; response + qualified specimens; simulation +
masonry; response + masonry + Peru. No shake-table method is invented: it was
not an eligible stored concept. Explicit simulated method/theory fixtures test
those families separately. New language-labelled controls exercise complete
English coverage without relabelling the historical outputs.

Model decision remains DEFERRED. Do not infer a nano/mini winner from synthetic
tests. Neither legacy output proves international retrieval quality.

## Verification and acceptance boundary

`test-rc4-phase2b12.ts` covers stored plans, qualifier/context promotion, lost
object, unknown method/role, academic level, exploratory anchors, missing English,
Spanish fallback, rendering tamper, narrow plans and six disciplines. Existing
2B1/2B1.1, 2A, 2.1, Phase 1, G2, selection and continuity regressions are retained.
The OpenAlex-only integration harness remains bounded: no extra planner call,
no Crossref fallback, no other host/document request, no hidden 429 retry.

Offline tests cannot prove translation truth, scholarly precision or live recall.
Role/provenance validation is not an omniscient semantic verifier. A newly
authorized live plan must still be inspected before any OpenAlex request.
Do not approve 2C or perform an automatic live smoke after deployment.

Deployment status and final validation are recorded after verification below.
