# Hero Infographic Policy Diagnosis

## Current Behavior

The existing DOCX cover path already has two useful pieces:

- `server/blueprint-v2/lab/academic-document-compiler.ts` builds a `cover_visual` object with a prompt, concept, method summary and deterministic palette.
- `server/blueprint-v2/lab/docx-renderer.ts` renders either a generated PNG or an SVG fallback.

However, the current behavior is still too close to a generic academic cover. The prompt mentions a sober hero image and broad layers such as problem/evidence/method/project, but it does not consistently force the cover to communicate the research object, methodology/workflow, context and analytical components. The SVG fallback also uses generic nodes and does not carry enough semantic intent.

## Required Change

Batch 3C needs the cover visual to become a reusable methodological infographic for any thesis topic. The policy must:

- derive the visual from the final title, short method title, keywords, knowledge area, country/application context and methodology;
- request a clean academic infographic rather than stock-like decoration;
- show a workflow or process structure;
- include the research object/theme and context;
- avoid fake data charts, invented results, citations, logos, embedded source names or sensational poster style;
- keep a deterministic SVG fallback that still looks like an academic infographic.

## Implementation Direction

The change should remain in the Lab B document assembly layer:

- add a reusable hero infographic policy under `server/blueprint-v2/editorial/`;
- extend `CoverVisualPlan` with `hero_visual_type`, `hero_prompt_summary` and `hero_visual_caption`;
- build the prompt from enforced editorial metadata, not only the raw intake title;
- update the deterministic SVG fallback to render an object/context block plus a methodology flow;
- preserve the existing `--skip-hero-image` behavior and keep AI image generation optional;
- keep all debug/provider details out of the public DOCX.

## Capitalization Hygiene

The latest diagnostic outputs also showed public-facing lowercase starts in titles, captions and labels. A deterministic capitalization hygiene helper is needed for public fields only. It should use Spanish sentence-style capitalization, not English title case, and must avoid changing DOIs, URLs, paths, formulas, citations, references or quoted evidence excerpts.
