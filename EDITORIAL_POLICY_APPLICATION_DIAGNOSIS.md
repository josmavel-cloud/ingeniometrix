# Editorial Policy Application Diagnosis

## Context

Batch 2A added a reusable academic editorial policy and verified that policy text reached the Lab B planning and generation prompts. The diagnostic rerun at:

`artifacts-local/lab-b-full-diagnostic-docx-runs/case-001-seismic-isolators-peruvian-buildings/2026-05-04T19-45-07-167Z`

showed partial improvement only: bullet usage improved and banned opening phrases stayed clean, but title, semantic keywords, length, and cost did not improve enough.

## Why Title Did Not Improve

- Final DOCX metadata title was still selected in `server/blueprint-v2/lab/academic-document-compiler.ts` from `legacyBlueprint.project_title`.
- The generated `title_refined` section and Batch 2A title instructions were advisory only; the compiler did not use them as the canonical public title.
- Result: the final title stayed copied from the intake/legacy blueprint even when richer method, scope, and problem context existed.

## Why Short Header Title Failed

- The short header title was generated from `methodSummary`.
- `methodSummary` preferred `sectionTextForKey(sections, [/method/i, /metodolog/i, /design/i, /diseno/i])`, which can return a long methodology section excerpt.
- Result: the short header title could become methodology prose, for example a sentence about a decision/procedure, instead of a compact method-focused title.

## Why Keywords Were Generic

- `buildKeywordsLine` filtered out long but semantically useful terms because it required keywords to have six words or fewer.
- After filtering, it fell back to generic terms such as `metodologia aplicada`, `analisis academico`, and `proyecto de investigacion`.
- Result: the keywords line passed structural validation but remained weak semantically.

## Why Length Control Did Not Improve Enough

- Batch 2A added `target_word_budget` and tightened `max_words`, but generation still accepted over-budget content after final retry.
- The validator could flag over-budget content, but there was no deterministic compression step before accepting drafts.
- Structured sections such as schedule and budget also used existing template `max_words`, and table-like output could exceed word budgets without safe deterministic trimming.

## Why Cost Increased

- Batch 2A added more prompt instructions and made the validator stricter.
- Some sections retried because editorial checks failed, increasing calls and tokens.
- No new standalone editorial metadata LLM call was needed; the increase came from heavier prompts/retries in the existing generation path.

## Batch 2B Fix Direction

- Enforce public metadata deterministically in the compiler:
  - final title from method + object + scope + problem focus;
  - short method title from compact extracted method/object terms;
  - keywords from structured intake/stabilized plan signals, rejecting generic-only output.
- Enforce length deterministically where safe:
  - trim narrative/list sections to `max_words` before final validation;
  - preserve evidence IDs, source IDs, citation intents, and degraded-input warnings;
  - flag structured table sections when over budget rather than breaking their shape.
- Keep cost discipline:
  - no new LLM calls for title, header, or keyword metadata;
  - deterministic trimming should reduce retry pressure in the next diagnostic rerun.
