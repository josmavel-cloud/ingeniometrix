# Method Selection Layer Design

## Status And Scope

This document is a design plan only. It does not change runtime code, prompts,
Lab A behavior, Lab B behavior, artifacts, database schema, UI, or cost policy.

The Method Selection Layer should become the traceable bridge between the state
of the art recovered by the Evidence Engine and the downstream Blueprint Engine
decisions that currently depend too much on intake text or generated prose.

## Current Gap Diagnosis

The current pipeline has strong safety foundations from the recent batches:
production safety, citation semantics, source health, section evidence binding,
reduced evidence packs, DOCX QA, fresh-run isolation, and telemetry. The missing
piece is a dedicated artifact that answers: "Which method, technique, theory, or
model is actually supported by the recovered evidence?"

Observed implementation surfaces:

- `server/blueprint-v2/lab/prompt-planning-hybrid.ts` builds
  `ResearchFrameLight.methodological_orientation` from
  `refinedIntakeContext.normalized_methodology_es`,
  `templateImportContext.proposal_context.method_candidate.method_family`, or a
  generic fallback.
- `buildMethodScopeGuidance()` uses
  `templateImportContext.proposal_context.dominant_methods`, but this is not a
  standalone, scored, source-bound method-selection artifact.
- `server/blueprint-v2/lab/academic-document-compiler.ts` derives
  `methodSummary` for title/header/keywords from
  `project.intake.preferredMethodology` or from the generated methodology
  section text. This can turn section prose into a pseudo-method.
- The same compiler derives Gantt and budget context from
  `project.intake.preferredMethodology`, not from evidence-backed method
  selection.
- Equation layout is asset-driven. It can render equations if valid source
  assets exist, but it does not first determine which equations/models the
  selected method requires.
- The hero infographic policy now asks for workflow and method context, but it
  receives cautious generic methodology text instead of a selected method
  artifact.
- The latest diagnostic run has good traceability metrics
  (`sections_with_evidence_ids = 37`, `section_evidence_binding_score = 0.974`)
  but method identification still depends on broad phrases such as "revision
  sistematica aplicada", "analisis comparativo", and "matriz de evaluacion
  multicriterio" without a scored state-of-the-art selection step.

The gap is not merely prompt wording. It is a missing contract:

1. Candidate methods are not extracted and scored as first-class objects.
2. Method, theory, model, technique, tool, variable, and data source are not
   separated.
3. Discipline-specific analytical needs are not declared before generation.
   In engineering or quantitative science this may mean equations/models; in
   health it may mean study design, population, outcomes, instruments, and
   statistical models; in education it may mean learning theory, instruments,
   rubrics, or intervention logic; in business or policy it may mean case-study,
   design-science, evaluation, optimization, or decision-analysis requirements.
4. Weak/degraded evidence does not produce a formal method-confidence ceiling.
5. Downstream title, abstract, objectives, framework, methodology, keywords,
   hero, schedule, and budget do not consume a single traceable method decision.

## Proposed Layer

Add a Method Selection Layer after the Evidence Engine handoff is available and
after the reduced evidence pack is built, but before Lab B Step 8 planning.

Recommended position:

1. EvidenceEngineHandoffV1 is loaded and validated.
2. Source health, citation semantics, section evidence binding, and production
   eligibility are computed.
3. ReducedEvidencePackV1 is built.
4. MethodSelectionArtifactV1 is built from the handoff, reduced pack, source
   health, section packets, and project context.
5. Lab B planning consumes the MethodSelectionArtifactV1 as a read-only input.

The artifact should be written alongside diagnostic Lab B outputs as:

- `method-selection-artifact.json`
- `method-selection-report.md`

For the first implementation slice, the artifact can be produced without feeding
generation prompts yet. That lets the second intake expose method-detection
quality before changing downstream behavior.

## Knowledge-Area Routing Principle

The Method Selection Layer must not assume that the project is engineering,
medical, social-science, business, education, or any other field. It should first
classify the knowledge area and research intent, then activate the methodology
families that are appropriate for that area.

Routing inputs:

- `project_context.knowledge_area_label`
- intake topic, problem context, research line, population/sample, available
  data, and preferred methodology
- section packets and evidence units from the state of the art
- source venues, titles, abstracts, direct excerpts, and recovered assets
- source health and citation eligibility

The routing output should include:

- `knowledge_area_route`: broad academic area inferred from evidence and intake.
- `strategy_candidates`: modern research strategies compatible with that area.
- `discipline_specific_requirements`: requirements activated by the selected
  route, not by a default engineering template.
- `borrowed_method_warnings`: warnings when a method from another field appears
  in the evidence but may not fit the current project.

Examples of modern methodology families by route:

- Health and public health: cross-sectional, cohort, case-control,
  implementation science, diagnostic accuracy, adherence studies, mixed methods,
  systematic/scoping review, health economic evaluation, survival/regression
  models, validated instruments, ethics and population criteria.
- Education: quasi-experimental design, action research, design-based research,
  case study, learning analytics, mixed methods, survey validation, rubrics,
  educational intervention logic, qualitative thematic analysis.
- Business and management: case study, design science, process analysis,
  multicriteria decision analysis, SEM/PLS-SEM when supported, optimization,
  market/operations analysis, financial or cost-benefit modeling.
- Public policy and social science: policy evaluation, program evaluation,
  stakeholder analysis, qualitative case study, grounded theory,
  phenomenology, survey/correlational design, mixed methods, institutional
  analysis.
- Environmental management: impact assessment, lifecycle assessment, GIS/spatial
  analysis, risk assessment, monitoring indicators, stakeholder and regulatory
  analysis.
- Engineering and quantitative science: simulation/modeling, experimental
  design, numerical analysis, finite element or system modeling, response or
  control analysis, optimization, measurement protocols, equations and physical
  variables when evidence supports them.

This makes engineering one route among several. The layer should only activate
equation/model requirements when the knowledge-area route and the recovered
evidence indicate that formal models are central.

## Proposed MethodSelectionArtifact Schema

Draft shape:

```ts
type MethodSelectionArtifactV1 = {
  artifact_type: "method_selection_artifact";
  artifact_version: "v1";
  generated_at: string;

  project_id: string;
  case_id?: string | null;
  handoff_id: string;
  evidence_run_id?: string | null;
  immutable_snapshot_hash?: string | null;

  status:
    | "selected"
    | "provisional"
    | "insufficient_evidence"
    | "blocked";

  evidence_quality_context: {
    quality_gate_status?: string | null;
    production_eligible: boolean;
    diagnostic_compatible: boolean;
    degraded_handoff: boolean;
    source_count: number;
    usable_full_text_source_count: number;
    metadata_only_source_count: number;
    unresolved_source_count: number;
    adjacent_source_count: number;
    evidence_unit_count: number;
    reduced_evidence_unit_count?: number | null;
    true_source_backed_direct_quote_count?: number | null;
    warnings: string[];
    blockers: string[];
  };

  knowledge_area_route: {
    route:
      | "engineering"
      | "medicine_public_health"
      | "business"
      | "education"
      | "social_science"
      | "public_policy"
      | "environmental"
      | "humanities"
      | "law"
      | "interdisciplinary"
      | "unknown";
    confidence:
      | "high"
      | "medium"
      | "low"
      | "unknown";
    modern_methodology_families: string[];
    route_evidence_ids: string[];
    route_source_ids: string[];
    borrowed_method_warnings: string[];
  };

  selected_strategy: StudyStrategyCandidate;
  primary_method: MethodCandidate | null;
  alternative_methods: MethodCandidate[];
  theories: MethodCandidate[];
  techniques: MethodCandidate[];
  models: MethodCandidate[];
  tools_software: MethodCandidate[];
  variables_indicators: VariableIndicatorCandidate[];
  data_requirements: DataRequirementCandidate[];
  discipline_method_requirements: DisciplineMethodRequirement[];

  method_evidence_bindings: MethodEvidenceBinding[];
  section_integration_plan: MethodSectionIntegrationPlan;
  generation_constraints: MethodGenerationConstraints;

  scoring_summary: {
    score_version: "method_fit_score.v1";
    winning_score: number | null;
    confidence:
      | "high"
      | "medium"
      | "low"
      | "blocked"
      | "unknown";
    score_explanation: string[];
    competing_candidate_count: number;
    weak_evidence_penalties: string[];
  };

  assumptions: string[];
  limitations: string[];
  warnings: string[];
  blockers: string[];
};
```

Candidate shape:

```ts
type MethodCandidate = {
  candidate_id: string;
  label_es: string;
  label_en?: string | null;
  candidate_type:
    | "method"
    | "theory"
    | "technique"
    | "model"
    | "tool_software"
    | "equation_model"
    | "variable_indicator"
    | "data_source";
  knowledge_area_family:
    | "engineering"
    | "medicine_public_health"
    | "business"
    | "education"
    | "social_science"
    | "public_policy"
    | "environmental"
    | "humanities"
    | "law"
    | "general"
    | "unknown";
  method_role:
    | "primary"
    | "alternative"
    | "supporting"
    | "context_only"
    | "rejected";
  strategy_family:
    | "single_method"
    | "method_comparison"
    | "systematic_review"
    | "simulation"
    | "experimental_design"
    | "case_study"
    | "mixed_method"
    | "design_science"
    | "model_validation"
    | "evidence_based_evaluation"
    | "quantitative_observational"
    | "qualitative"
    | "unknown";
  fit_score: number;
  confidence:
    | "high"
    | "medium"
    | "low"
    | "insufficient"
    | "unknown";
  evidence_strength:
    | "direct_source_backed"
    | "paraphrase_source_backed"
    | "asset_backed"
    | "metadata_only"
    | "intake_only"
    | "unsupported";
  topic_fit: "direct" | "adjacent" | "background" | "weak" | "unknown";
  source_ids: string[];
  evidence_ids: string[];
  original_excerpt_ids: string[];
  section_keys: string[];
  positive_signals: string[];
  negative_signals: string[];
  assumptions: string[];
  limitations: string[];
  warnings: string[];
};
```

Discipline-specific method requirement shape:

```ts
type DisciplineMethodRequirement = {
  requirement_id: string;
  knowledge_area_family:
    | "engineering"
    | "medicine_public_health"
    | "business"
    | "education"
    | "social_science"
    | "public_policy"
    | "environmental"
    | "humanities"
    | "law"
    | "general"
    | "unknown";
  requirement_type:
    | "analytical_model"
    | "equation_or_formula"
    | "statistical_model"
    | "theoretical_framework"
    | "research_design"
    | "instrument_or_protocol"
    | "data_collection_plan"
    | "sampling_plan"
    | "variable_indicator_matrix"
    | "software_or_tool"
    | "validation_strategy";
  label_es: string;
  method_family:
    | "structural_dynamics"
    | "finite_element"
    | "control_system"
    | "statistical"
    | "epidemiological"
    | "qualitative_analysis"
    | "mixed_methods"
    | "implementation_science"
    | "design_science"
    | "case_study"
    | "program_evaluation"
    | "learning_analytics"
    | "multicriteria_decision_analysis"
    | "optimization"
    | "economic"
    | "unknown";
  status:
    | "source_backed"
    | "inferred_need"
    | "required_but_missing"
    | "not_applicable";
  variables: Array<{
    symbol?: string | null;
    label_es: string;
    unit?: string | null;
    role:
      | "input"
      | "output"
      | "parameter"
      | "indicator"
      | "construct"
      | "category";
  }>;
  instruments_or_protocols: string[];
  required_inputs: string[];
  output_indicators: string[];
  equation_latex?: string | null;
  software_or_tools: string[];
  source_ids: string[];
  evidence_ids: string[];
  asset_keys: string[];
  use_policy:
    | "can_render_equation"
    | "describe_model_only"
    | "describe_design_only"
    | "describe_protocol_only"
    | "declare_pending_validation"
    | "do_not_use";
  warnings: string[];
};
```

## How To Derive Method Candidates

Candidate derivation should be deterministic first. An optional LLM
disambiguation pass can wait until after the second intake or run only as a
cached, schema-constrained refinement later.

Inputs:

- `EvidenceEngineHandoffV1.evidence_units`
- `ReducedEvidencePackV1.evidence_units`
- `section_packets`
- `source_registry`
- source titles, abstracts, venues, keywords if present
- source health classifications
- citation categories
- asset registry and asset usage plan
- project intake and context as weak prior only

Priority text zones:

1. Direct source-backed excerpts in method-heavy sections.
2. Evidence units mapped to `methodology`, `research_design`,
   `analysis_plan`, `variables_or_categories`, `evaluation_criteria`,
   `theoretical_framework`, `technical_framework`, and `state_of_the_art`.
3. Source titles and abstracts from usable full-text or partial full-text
   sources.
4. Asset captions and equation/table metadata when source-backed.
5. Intake preferred methodology only as a prior, never as proof.

Extraction should identify phrases for:

- study strategy: systematic review, simulation, experimental design, case
  study, method comparison, design science, mixed method, etc.
- method: systematic review, scoping review, cross-sectional study, case study,
  mixed methods, design science, simulation, experimental design, thematic
  analysis, multicriteria decision analysis, regression, etc.
- theory: a field-appropriate conceptual foundation such as structural
  dynamics, health behavior theory, organizational theory, learning theory,
  institutional theory, environmental risk theory, or another evidence-backed
  framework.
- technique: a concrete applied mechanism or procedure such as interviews,
  surveys, content analysis, intervention protocol, base isolation, control
  strategy, coding protocol, or evaluation rubric.
- tool/software: ETABS, SAP2000, OpenSees, MATLAB, R, Python, NVivo, SPSS,
  REDCap, GIS tools, or other software only when relevant to the knowledge-area
  route.
- model: physical model, conceptual model, statistical model, epidemiological
  model, economic model, learning model, policy logic model, decision model, or
  process model.
- variables/indicators: measurable constructs appropriate to the field, such as
  drift, acceleration, adherence rate, HbA1c, waiting time, learning outcome,
  satisfaction score, adoption rate, cost, emissions, risk level, or policy
  outcome.
- data sources: seismic records, surveys, administrative records, hospital
  records, classroom artifacts, interviews, financial records, public datasets,
  standards, design codes, legal documents, or policy documents.

For the seismic-isolation case, the knowledge-area route is structural
engineering, but that must be an inferred route for this case only. The layer
should avoid jumping straight to a specific method such as "matriz
multicriterio" unless the recovered evidence supports it. A cautious provisional
output may be:

- strategy: `evidence_based_evaluation` or `method_comparison`
- primary method: `applied systematic literature review and comparative
  technical assessment`
- alternative methods: `numerical simulation`, `case study`, `fragility
  analysis`, `performance-based evaluation`
- discipline-specific requirements: structural dynamics indicators, seismic
  demand, displacement/drift/acceleration, isolation system parameters, local
  normative constraints, and explicit notes that numerical simulation or
  equations require stronger source support before being presented as executed.

## Method Fit Scoring

Use a transparent score instead of a black-box choice.

Proposed score components:

- evidence strength, 0 to 30:
  direct source-backed excerpts score highest; metadata/intake-only evidence
  scores near zero.
- section relevance, 0 to 15:
  method-related section packets and methodology/theory excerpts score higher
  than broad problem context.
- source health, 0 to 15:
  usable full text > partial full text > metadata-only > unresolved.
- cross-source support, 0 to 15:
  a method mentioned by multiple usable sources is stronger than a method
  dominated by one oversized source.
- strategy alignment, 0 to 15:
  candidate must match the research purpose, question type, data availability,
  and degree level.
- knowledge-area fit, 0 to 10:
  candidates receive credit when they match the inferred knowledge-area route,
  modern research methodology standards for that area, and the available data.
  No area, including engineering, receives priority unless the route and
  evidence justify it.
- penalties:
  adjacent-only support, metadata-only support, unresolved source support,
  source dominance, conflict with available data, unavailable tool/data
  requirements, and unsupported model/instrument/protocol/equation claims.

Confidence bands:

- high: score >= 80, direct evidence from at least two usable sources, no severe
  blockers.
- medium: score 60-79, at least one usable full-text source, limitations
  declared.
- low: score 40-59, mostly provisional; suitable only for cautious diagnostic
  generation.
- blocked: below 40, no usable source-backed method support, or upstream
  production safety blockers that directly affect method validity.

## Handling Weak Or Degraded Evidence

The layer must not make a degraded handoff production-valid. If Step 2/3 is
blocked, usable full-text source count is below minimum, or source health is
weak, the method decision should be provisional.

Rules:

- Intake-only method labels can guide search and drafting but cannot become a
  production-ready method selection.
- Metadata-only or unresolved sources cannot provide primary method support.
- Adjacent sources can contribute background or cautious alternatives, not
  central method claims.
- If direct evidence is too weak, downstream text must say "propuesta
  metodologica preliminar" or equivalent, not "metodo validado".
- The title may include a cautious strategy such as "revision aplicada" or
  "evaluacion comparativa preliminar" only if supported.
- The abstract must declare the evidence boundary.
- The methodology section must distinguish planned method from completed
  execution.
- The hero infographic should visualize "research workflow" or
  "evidence-based evaluation" rather than a named method when confidence is low.

## Discipline-Specific Analytical Requirements

Every knowledge area has its own version of "method completeness." The layer
should therefore create a discipline-specific requirements matrix rather than an
engineering-first equation matrix.

This matrix should answer:

- Which theory, framework, model, design, protocol, instrument, or analytical
  family is needed?
- Which variables, indicators, constructs, categories, or outcomes are required?
- Which inputs, data sources, sample definitions, or materials are needed?
- Which outputs, findings, deliverables, or validation checks are expected?
- Is the requirement source-backed, merely inferred from the topic, missing, or
  not applicable?
- Should it be rendered, described cautiously, deferred, or excluded?

Route-specific examples:

- Health/public health: study design, population criteria, outcomes, exposure
  or intervention, validated instruments, ethics, statistical model, bias and
  confounding controls.
- Education: learning theory, intervention or pedagogical strategy, instruments,
  rubrics, classroom/sample context, validity/reliability, qualitative or
  quantitative analysis plan.
- Business/management: process model, decision criteria, cost-benefit or
  operations model, case-study protocol, stakeholder map, validation or expert
  review strategy.
- Policy/social science: policy logic model, stakeholder categories, document
  analysis protocol, interview/survey strategy, program evaluation criteria.
- Environmental management: impact indicators, spatial or monitoring method,
  lifecycle/risk framework, regulatory criteria, stakeholder/environmental
  assumptions.
- Engineering/quantitative science: physical or mathematical model, equations
  when source-backed, variables with units, simulation or experimental protocol,
  software/tool constraints, validation indicators.

For the current seismic and structural route, examples may include structural
dynamics indicators, seismic demand, displacement, drift, acceleration, damping,
base shear, isolation system parameters, and local normative constraints. These
must remain route-specific outputs, not defaults for unrelated cases.

Non-negotiable rule:

- Do not invent equations, instruments, frameworks, protocols, tools, data
  requirements, or models. If no source-backed support is available, mark the
  item as `required_but_missing` or `inferred_need`, and instruct the relevant
  section to declare it as pending source validation.

## Distinguishing Core Concepts

The layer must avoid mixing terms that have different academic roles.

- Method: the organized procedure used to answer the research question.
  Example: comparative technical evaluation, systematic review, finite element
  simulation, experimental design.
- Theory: the conceptual or scientific foundation.
  Example: structural dynamics, seismic isolation theory, behavioral adherence
  theory.
- Technique: a concrete applied mechanism or procedure.
  Example: base isolation, lead rubber bearings, interviews, chromatography,
  thematic coding.
- Tool/software: implementation environment, not the method itself.
  Example: OpenSees, ETABS, MATLAB, R, SPSS, NVivo.
- Model: a formal representation used by the method.
  Example: MDOF structural model, FEM model, regression model, epidemiological
  risk model.
- Variable/indicator: measurable construct.
  Example: interstory drift, treatment adherence, HbA1c, satisfaction score.
- Data source: where observations or evidence come from.
  Example: seismic records, survey responses, hospital records, OpenAlex
  literature records, normative documents.

The artifact should preserve all of these separately so the title does not name
a tool as if it were a method, and the methodology does not present a theory as
an executed procedure.

## Downstream Integration Plan

The MethodSelectionArtifact should shape downstream outputs as follows.

Title:

- Include selected strategy/method only when confidence is medium or high.
- Include object, scope, and problem/evaluation focus.
- Avoid claiming results, validation, effectiveness, or feasibility.
- If method confidence is low, use cautious labels such as "evaluacion
  preliminar basada en evidencia".

Abstract:

- State problem, objective, selected method/strategy, evidence boundary, and
  expected academic deliverable.
- Do not state findings unless they are supported by the evidence handoff.

Objectives:

- Align verbs with method strategy.
- Examples: evaluate, compare, model, simulate, design, systematize, validate
  conceptually, estimate, characterize.
- Avoid objectives requiring data or tools that the method artifact marks as
  missing.

Theoretical framework:

- Include theory/model subsections tied to selected method candidates.
- Explain alternatives and why they are secondary if evidence supports that.
- Mark model, protocol, instrument, framework, data, or equation gaps as pending
  evidence when needed.

Methodology:

- Use `selected_strategy`, `primary_method`, data requirements, variables,
  tools, and model requirements.
- Separate planned work from completed work.
- Include assumptions and limitations from the artifact.

Keywords:

- Include method/strategy, object, context, and key variable/model only when
  supported.
- Avoid generic terms such as "tesis" or "metodologia" unless central.

Hero infographic:

- Show topic/object, selected or provisional workflow, tools/components,
  context/application, and expected output.
- If method evidence is weak, visualize a cautious evidence-based workflow
  rather than a specific unsupported technique/model.

Gantt and budget:

- Derive phases and budget rows from strategy.
- Simulation/modeling strategies need model setup, data preparation,
  calibration/validation, software, and computational resources.
- Experimental strategies need protocol, instruments, materials, lab time,
  validation, and safety/ethics steps.
- Review strategies need search strategy, screening, extraction, synthesis, and
  reporting.
- Fieldwork strategies need instruments, sampling, collection, cleaning, and
  analysis.
- Qualitative strategies need instrument/protocol design, recruitment,
  transcription or coding, analysis, triangulation, and ethics.
- Design-science or intervention strategies need artifact/intervention design,
  iteration, evaluation criteria, validation, and documentation.
- Public-policy or management evaluation strategies need stakeholder mapping,
  criteria definition, document/data collection, evaluation, and feasibility
  review.

## Overclaim Prevention

The layer should feed claim ceilings into Lab B:

- No selected method can be presented as validated if it is only inferred.
- No discipline-specific model, equation, framework, instrument, protocol, or
  software tool can be presented as executed or validated if it is only required
  or inferred.
- No tool can be listed as used if it is only recommended.
- No variable can be treated as measured if no data requirement is satisfied.
- No adjacent/background source can support central method claims.
- No metadata-only source can support method selection.
- If production eligibility is false, all method language remains diagnostic or
  provisional.

## Tests Needed

Add tests before feeding the artifact into generation:

1. Candidate extraction distinguishes method, theory, technique, model, tool,
   variable, and data source.
2. Direct source-backed excerpts outrank metadata and intake text.
3. A degraded handoff produces `status = provisional` or `blocked`, never a
   production-ready method.
4. Metadata-only and unresolved sources cannot select a primary method.
5. Adjacent/background evidence can only support alternatives or context.
6. Source dominance penalizes a method candidate supported by one oversized
   source.
7. Knowledge-area routing selects different modern methodology families for
   engineering, health, education, business, social science, policy, and
   environmental fixtures.
8. Discipline-specific requirements are generated without inventing formulas,
   instruments, protocols, datasets, or software use.
9. Missing required equations, models, instruments, protocols, or frameworks
   become `required_but_missing`.
10. Title and keyword suggestions use the selected method only when confidence is
   sufficient.
11. Hero plan falls back to generic research workflow when method confidence is
    low.
12. Gantt/budget phase selection changes by study strategy.
13. Case-001 diagnostic handoff yields a provisional strategy and explicit
    limitations rather than a confident unsupported methodology.
14. Medicine/public-health fixture distinguishes study design, variables,
    population, data source, and analysis method.
15. Education/business/social-science fixture distinguishes theory, instrument,
    sample, and analysis technique.

## Implementation Phases

Phase 0: design only.

- This document.
- No runtime changes.

Phase 1: read-only artifact builder.

- Add a deterministic MethodSelectionArtifact builder under the shared
  Blueprint/Evidence quality layer.
- Inputs: `EvidenceEngineHandoffV1`, `ReducedEvidencePackV1`, source health,
  citation semantics, and section packets.
- Outputs: `method-selection-artifact.json` and `method-selection-report.md`.
- Add synthetic tests and one case-001 diagnostic inspection.
- Do not feed prompts yet.

Phase 2: planning integration.

- Pass the artifact into Step 8 planning as read-only guidance.
- Replace intake-first method fallbacks in `ResearchFrameLight` with artifact
  data when available.
- Keep warnings and confidence bands visible.

Phase 3: editorial and DOCX integration.

- Use the artifact for title, short header, keywords, abstract, methodology,
  hero infographic, Gantt, and budget.
- Preserve all Batch 1 safety and evidence-binding rules.

Phase 4: discipline-specific requirement matrix.

- Add method-specific requirements for models, equations, instruments,
  protocols, variables, datasets, software, validation, and ethics as appropriate
  to the knowledge-area route.
- Render only source-backed equations or instrument/protocol details.
- Add appendix-ready requirement matrices when formal models, instruments, or
  protocols are missing.

Phase 5: optional LLM-assisted disambiguation.

- Only after deterministic behavior is understood.
- Use a schema-constrained, cached, low-cost pass.
- Never let the LLM override source health, citation eligibility, or production
  safety gates.

## What Should Wait Until After The Second Intake

- Full discipline ontology.
- Broad prompt rewrites.
- Provider/retrieval changes.
- OCR or scanned PDF recovery.
- Automatic formula generation.
- UI for method selection.
- Cloud worker, Neon, Vercel, or dashboard UI.
- Cost optimization beyond logging the artifact size and impact.
- Broad Lab B refactor.

The second intake should first test whether a read-only method artifact exposes
the right gaps and candidates across a different topic. That feedback should
guide whether the layer needs richer deterministic extraction, better source
selection, or a small LLM disambiguation step.

## Recommended First Implementation Slice

Implement the smallest read-only slice:

1. Create `server/blueprint-engine/quality/method-selection.ts`.
2. Build `MethodSelectionArtifactV1` deterministically from a validated handoff,
   reduced evidence pack, source health, citation semantics, and section
   packets.
3. Write `method-selection-artifact.json` and `method-selection-report.md` from
   the Lab B diagnostic runner.
4. Add tests for candidate classification, weak evidence handling,
   knowledge-area routing, discipline-specific requirements, and propagation
   readiness.
5. Keep Step 8 prompts unchanged for the first verification.

This gives the second intake a clean diagnostic lens without risking runtime
behavior. Once the artifact proves useful, wire it into planning and editorial
generation in a second controlled batch.
