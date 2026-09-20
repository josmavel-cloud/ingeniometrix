# LLM And Prompt Registry

STATUS: CURRENT - Release 0 secure pilot.

Prompt source of truth for the MVP engine is `server/mvp/prompts/`. Do not embed new important behavioral prompts directly in service logic.

Release configuration keeps:

```text
LLM_DEFAULT_MODEL=gpt-5.4
LLM_FAST_MODEL=gpt-5.4-mini
IMX_ENABLE_DEEP_RESEARCH=0
```

## Production-Relevant Calls

| Call ID | Status | Pipeline stage | Purpose | Model | Model config source | Prompt file | Prompt version | Dynamic inputs | Output schema | Retry/fallback | Token/cost tracking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `intake-normalization` | ACTIVE | Intake/normalization | Normalize intake and search intent. | `gpt-5.4-nano` default in service. | `DEFAULT_INTAKE_NORMALIZATION_MODEL` / env where supported. | Service prompt code, not yet in `server/mvp/prompts`. | UNKNOWN | Intake/project data. | Service schema. | Fallback/service errors. | `MvpStepRun`/usage registry where wired. |
| `topic-refinement` | ACTIVE | Evidence-informed refinement | Refine topic/source feasibility. | `gpt-5.4-mini`. | `DEFAULT_TOPIC_REFINEMENT_MODEL` / env. | Service prompt code. | UNKNOWN | Intake, evidence map. | Service schema. | Fallback to system result when provider unavailable. | Step run usage where provider executes. |
| `source-readiness` | ACTIVE | Source readiness | Classify selected source readiness. | `gpt-5.4-mini`. | `SOURCE_READINESS_MODEL` or service default. | Service prompt code. | UNKNOWN | Sources, gaps, source health. | JSON schema in service. | Deterministic fallback. | Step run usage where provider executes. |
| `step5-source-evidence-extraction` | ACTIVE | Evidence extraction | Extract supportable evidence items from chunks/abstracts. | `gpt-5.4-mini`. | Service default/env. | `server/mvp/prompts/step5-source-evidence-extraction.v3.ts` | `ingeniometrix-step5-source-evidence-extraction-v3` | Intake, section plan, source registry, chunks, assets, health. | Prompt `outputSchema`. | Bounded provider call; failed extraction becomes gaps/errors. | `MvpStepRun`, provider call inventory/usage registry. |
| `step5-asset-visual-localization` | OPTIONAL | Asset extraction | Localize difficult asset regions. | Vision-capable configured model, inspected in code. | Service/wrapper config. | `step5-asset-visual-localization.v1.ts` | `ingeniometrix-step5-asset-visual-localization-v1` | Asset/page image metadata. | Prompt `outputSchema`. | Deterministic PDF geometry preferred. | Usage registry when called. |
| `step5-equation-latex-ocr` | OPTIONAL | Equation extraction | Transcribe visible equation crop only. | Vision-capable configured model, inspected in code. | Service/wrapper config. | `step5-equation-latex-ocr.v1.ts` | `ingeniometrix-step5-equation-latex-ocr-v1` | Equation crop metadata/image. | Prompt `outputSchema`. | Non-equation/partial status instead of invention. | Usage registry when called. |
| `scientific-plan` | ACTIVE | Step 6 section DAG | Generate evidence synthesis, problem, questions, objectives, design, methodology, review, title and summary. | `gpt-5.4`. | Prompt file plus wrapper. | `scientific-plan.v3.ts` | `ingeniometrix-scientific-plan-v3` | Definition, evidence, upstream sections, budget, design. | Phase schemas in `scientific-plan-generation.ts` and contracts. | Schema validation and bounded retries/fallback per service. | Prompt inventory, provider usage registry, `MvpStepRun`. |
| `consistency-matrix` | ACTIVE | Matrix | Produce structured matrix JSON from stabilized design. | `gpt-5.4`. | Prompt file. | `consistency-matrix.v1.ts` | `ingeniometrix-consistency-matrix-v1` | Definition, design, final sections, methodological evidence. | `consistencyMatrixSchema` in `research-plan-contracts.ts`. | Invalid matrix blocks/repairs per service. | Prompt inventory and usage registry. |
| `section-budget` | ACTIVE | Editorial compaction | Condense over-budget sections without truncation or new claims. | `gpt-5.4-mini`. | Prompt file. | `section-budget.v2.ts` | `ingeniometrix-section-budget-v2` | Section paragraphs, max/target words. | `compactParagraphsSchema` in `section-budget.ts`. | At most bounded repair attempts; preserves content over fake pass. | Usage registry. |
| `hero-infographic` | ACTIVE | Visual generation | Generate cover hero from public visual brief. | `gpt-image-2.5-sunburst`. | Prompt file. | `hero-infographic.v2.ts` | `ingeniometrix-hero-infographic-v2` | Public visual brief only. | PNG plus sidecar/QA. | Deterministic fallback if image fails; fallback must be reported. | Image sidecar plus usage/cost inventory. |
| `consistency-matrix-visual` | ACTIVE | Visual matrix | Generate text-free backdrop, then deterministic overlay from validated matrix. | `gpt-image-2.5-sunburst`. | Prompt file. | `matrix-visual.v1.ts` | `ingeniometrix-consistency-matrix-visual-v1` | Layout spec, row count, palette. | PNG backdrop; semantic authority is matrix JSON. | Deterministic text overlay; QA required. | Sidecar plus usage/cost inventory. |
| `visual-quality-assurance` | ACTIVE | Visual QA | Inspect actual pixels for relevance, clipping and internal leakage. | `gpt-5.4-mini`. | Prompt file. | `visual-qa.v1.ts` | `ingeniometrix-visual-qa-v1` | Asset type, image, public brief, forbidden exact labels. | `visual_quality_assurance_v1`. | Failed QA rejects/repairs/fallbacks. | Usage registry; B3 noted explicit run attribution fix. |
| `research-discovery` | DISABLED in Release 0 | Deep Research fallback | Discover candidate sources for unresolved gaps. | `o4-mini-deep-research`. | `research-discovery.v1.ts` and `research-fallback.ts`. | `research-discovery.v1.ts` | `ingeniometrix-research-discovery-v1` | Intake, uncovered dimensions, known DOIs, limits. | Candidate list parsed/resolved deterministically. | Disabled unless `IMX_ENABLE_DEEP_RESEARCH=1`; candidates are not evidence until inspected. | Reservation/cost tracking in fallback code. |
| Legacy `step6-section-draft`, `step6-title-generation`, `step6-editorial-review`, `step6-hero-image` | LEGACY / COMPATIBILITY | Earlier Step 6 path | Older section/title/editorial/hero calls. | `gpt-5.4`, `gpt-5.4-mini`, image model. | Prompt files/service env. | `step6-*.v1/v2.ts` | Various | Project context, sections, evidence. | Prompt schemas. | Retained for compatibility/tests. | Usage when route uses old service path. |

## Notes

- Some older services still contain prompt text outside `server/mvp/prompts/`. Do not extend those patterns for new scientific behavior.
- The validated B3/visual path records complete prompt inventories under `artifacts-local/`; those are private validation artifacts, not committed source.
- Image generation and visual QA are separate calls: the image prompt is not sufficient evidence that the rendered pixels are acceptable.
- Deep Research output is discovery-only and cannot enter citations until resolved, deduplicated, inspected and extracted through the normal evidence path.
