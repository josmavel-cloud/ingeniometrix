# LLM And Prompt Registry

STATUS: RC4 working branch, with retained Release 0 registry below. RC4 design gate is
accepted for the bounded cases; see [G1 evaluation](../quality/rc4-g1-design-acceptance.md).

## RC4 scientific selector (before approved drafting)

All use a single concatenated Responses input, strict JSON schema and high reasoning.
The long selector uses Responses background mode with `store=true`; critic calls remain
foreground with `store=false`. Inputs are whitelisted user intent and a bounded inspected evidence
pack; the critic additionally receives proposed alternatives. Paid evaluation uses
zero transport retries and persistent B4 reservations, without retrieval or documents.

| Call | Prompt / model configuration | Output / consumer | Limit and failure policy |
| --- | --- | --- | --- |
| DESIGN_SELECTOR_0 | `server/mvp/prompts/scientific-design-selector.v3.ts`, Astra `gpt-6-astra` | `scientificDecisionV2Schema` -> critic | 12288 tokens; one persisted background create; retrieve same `response_id`; no inference retry while pending |
| DESIGN_CRITIC_0 | `server/mvp/prompts/scientific-design-critic.v3.ts`, Sol `gpt-5.6-sol` | Compact `designCritiqueSchema` -> approval eligibility | 8192 tokens; only COMPLETE accepted; high retained after successful bounded qualitative recovery |
| DESIGN_CRITIC_RECOVERY_1 | `server/mvp/prompts/scientific-design-critic-recovery.v1.ts`, Sol `gpt-5.6-sol` | Same complete critique schema; alternatives immutable | Only after INCOMPLETE_TOKEN_LIMIT; one recovery maximum; never reruns selector |
| DESIGN_REPAIR_1 (conditional critique repair) | `scientific-design-repair.v1.ts`, Astra | `designRepairSchema` -> targeted replacements | 8192 tokens; original independent findings retained, no self-certification |
| DESIGN_REPAIR_1 (conditional incomplete selector recovery) | `scientific-design-output-repair.v1.ts`, Astra | `scientificDecisionV2Schema` -> first critic | 12288 tokens; shares one repair allowance, private incomplete response checkpoint |

Selector v2 (8192 tokens) and critic v2 (4096) are retained as evaluation history; v1 is
historical. Snapshot policy hashes current selector, critic, critic recovery and both repair templates.
Actual model/usage and failures stay in B4 cost entries and provider audit records.
See [field authority and consumers](RC4_SCIENTIFIC_DECISION.md) and the private
`artifacts-local/rc4/scientific-design-evaluation-v1/PROMPTS_USED.md` holds G1 history;
`artifacts-local/rc4/scientific-design-evaluation-g1-1/PROMPTS_USED.md` holds G1.1 templates.
G1.2 changed transport only and reused selector v3 plus critic v3 unchanged.

## RC4 G3 compact document profile

`latam-compact-v1` consumes the approved G1 design; it never invokes the selector or
critic. Calls use one concatenated Responses input with strict structured output. All are
reserved by B4 before dispatch.

| Call | Status | Model | Prompt | Output / policy |
| --- | --- | --- | --- | --- |
| Compact scientific sections | ACTIVE for `latam-compact-v1` | `gpt-5.4` | `scientific-plan-latam-compact.v1.ts`, wrapped by the compact export in `scientific-plan-approved.v1.ts` | Phase schemas in `scientific-plan-generation.ts`; approved definition/design are authoritative. Legacy prompt/budgets remain profile-isolated. |
| Consistency matrix | ACTIVE | `gpt-5.4` | `consistency-matrix.v1.ts` | Strict `consistencyMatrixSchema`; rendered only as an editable Word table. |
| Section compaction | CONDITIONAL, one round maximum | `gpt-5.4-mini` | `section-budget.v2.ts` | Only oversized sections; no design regeneration. |
| Asset planner | ACTIVE | `gpt-5.4-mini` | `asset-planner.v1.ts` | Zero to four optional interior proposals; native/deterministic rendering; matrix is the fifth interior slot. |
| Citation repair | CONDITIONAL, one localized recovery | `gpt-5.4` | `scientific-document-citation-repair.v1.ts` | Repairs only unsupported attribution targets; independent scientific re-review required. |
| Final infographic | ACTIVE, deterministic | No image model | `latam-compact-deterministic-v1` renderer | Structured ResearchDesign -> controlled SVG/PNG; no fabricated findings. |

For this profile, legacy cover-image, matrix-image, source-figure republication and G1
selector/critic calls are disabled. The complete acceptance prompt inventory is private at
`artifacts-local/mvp-step6-blueprint-docx/6c0d181e-c0ae-4410-acd6-6824a73b115c/rc4-g3-2026-09-22T05-58-25-503Z/scientific-plan/PROMPTS_USED.md`.

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
| `quick-idea-draft-generator` | ACTIVE | Step 1 Idea | Propose or faithfully refine up to three research directions. | `gpt-5.4` default. | `IMX_IDEA_MODEL`, `LLM_DEFAULT_MODEL`. | `quick-idea-draft-generator.v2.ts` | `ingeniometrix-quick-idea-draft-generator.v2` | Mode, level, country, FORD field, seed, prior titles. | `idea-draft-bundle.schema.json` | Deterministic editable fallback; pre-job paid reservation. | `PaidOperation` and provider usage when called. |
| `topic-suggestion-generator` | ACTIVE | Step 1 Idea refinement | Produce a faithful technical rewrite and two bounded variants. | `gpt-5.4` default. | `IMX_IDEA_MODEL`, `LLM_DEFAULT_MODEL`. | `topic-suggestion-generator.v2.ts` | Level, country, program, field, seed, taxonomy hints. | `topic-suggestion.schema.json` | Catalog/seed fallback; bounded output. | Pre-job/provider usage when called. |
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
