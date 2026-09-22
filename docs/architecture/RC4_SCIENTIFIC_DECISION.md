# RC4 scientific decision contract

## Authority and persistence

The user owns intent and approvals. Inspected sources support claims, never orders.
Selector alternatives remain proposals until owned, hash-bound approval. A critical
missing decision or independent blocking critique prevents approval and drafting.
G2 immutable inputs and B4 persistent jobs/cost controls remain authoritative.

| Entity / field group | Producer | Consumer | Required / confirmation / support | Invalidates |
| --- | --- | --- | --- | --- |
| Intent user_statements | Whitelisted intake adapter; strips DB metadata | Selector and critic | Relevant original statements; user authority, not evidence | Entire decision on input change |
| problem, expected_outcome, scope, context, unit_population_corpus, academic_level | Intake + generation level | Alternatives, critique, approval | User definition; no inferred access | Decision/design |
| confirmed_data / possible_data / unclassified_data_statement | Explicit arrays / raw availableData | Data requirements | Only explicit confirmed_data certifies user assertion of access | Design/feasibility |
| resources, restrictions, preferences, requirements | Intake adapter including G2 scope/constructs/pending fields | Scope checks, selector/critic | Firm vs preference vs pending kept distinct | Decision/design |
| MethodEvidencePack.items | Verified ledger excerpts, bounded deterministic packing | Selector/critic and pointer validation | Source/evidence ID, exact excerpt, locator, level, allowed use | Decision when evidence changes |
| excluded / source_accounting / source_decisions | Budget exclusions + ledger eligibility; decision pointer usage | Audit, comparison, selector context | Every selected source; unused sources have explicit reasons; rejected full text is not silently promoted | Pack hash |
| alternatives / recommended_id / rationale / clarification_questions | Astra selector | Sol critic and owned approval UI | Up to three; empty requires clarification | Drafting cannot start without approval |
| definition | Alternative | Approved scientific drafting and matrix | Question/objective IDs validated; hypotheses conditional | Sections/matrix |
| research_design.* | Alternative | Approved drafting; methodology, matrix, visuals | Paradigm/approach/design, unit/sampling, constructs, data, techniques/instruments, procedure, analysis, quality, ethics, assumptions/limitations/pending; evidence pointers | All design-dependent outputs |
| components.name/kind/role/inputs/outputs/dependencies/support | Alternative | Graph and evidence validators; critic | Theory/framework/model/principle/method/technique/instrument/software/strategy distinguished | Design |
| primary_method / method_handoffs | Alternative | DAG/dataflow validator and critic | Named primary method; exact output-to-input handoffs, no unknown/cyclic dependencies | Design |
| scope_effect / scope_changes / scope_change_impact | Alternative vs original requirements | Approval gate and audit | Material changes require original/change/reason/loss/gain and explicit acceptance | No stable design before approval |
| qualitative_component / quantitative_component / integration_strategy / integration_purpose | Alternative | Mixed-method gate and critic | All required only for mixed methods | Design classification |
| data_requirements | Alternative | Feasibility critique and approval | USER_CONFIRMED / PROPOSED / PENDING and confirmation/action | Design |
| applicability_conditions / baselines_or_comparisons / transfer_limits / feasibility / discarded_alternative_reasons | Alternative | Critic, approval/review | Clear local applicability and level/complexity limits; no automatic transfer | Approval eligibility |
| pending_user_decisions | Alternative | Approval UI/gate | Critical items block; no LLM substitutes for user response | Explicit user revision |
| DesignCritique.assessments / critical_findings / rubric states | Independent Sol critic | Repair selection, approval gate and evaluation rubric | Compact full coverage; decision-relevant rationale only, never private chain of thought | Approval eligibility |
| scope.status / confirmation_required / confirmed | Independent critic + explicit user approval | Approval gate and audit | Pending is distinct from narrowed; material changes are revision-specific and never LLM-confirmed | No stable design while pending/unconfirmed |
| critic completion envelope | Provider adapter/coordinator | Recovery gate and audit | Only COMPLETE accepted; token-limit incompleteness gets at most one critic-only recovery | Critique/approval |
| repair replacements / findings | One Astra targeted repair | Decision validator, private audit | Only defective IDs; unchanged alternatives retained; original criticism stays authoritative | No self-certification |
| prompt_records / fingerprints | Coordinator | Reproduction and snapshot compatibility | Version, model, schema, parameters, roles, hash | Changed config blocks stale input reuse |
| approval:SCIENTIFIC_DESIGN | Authenticated user after checks | approvedDesignForCurrentJob -> scientific-plan-generation | Owner, exact intake/evidence hash and academic level | Explicit changed-input revision only |

Private `BlueprintJobStage` checkpoints contain `SCIENTIFIC_DECISION`,
`DESIGN_SELECTOR_0`, `DESIGN_CRITIC_0`, optional `DESIGN_REPAIR_1`, and approval.
Heavy original documents stay at their existing artifact references. No DB migration.
Historical v1/v2 payloads remain readable or deterministically migrated; new input policy hashes reference current prompts
and require explicit revision before replay with incompatible configuration.

## Calls and boundaries

| Prompt | Model / reasoning | Output maximum | Consumer |
| --- | --- | --- | --- |
| scientific-design-selector v3 (active) | gpt-6-astra / high | 12288 | Strict scientificDecisionV2Schema -> critic; normally one concise alternative |
| scientific-design-selector v2 (evaluation history) | gpt-6-astra / high | 8192 | First geospatial response; incomplete, recovered once |
| scientific-design-critic v3 (active) | gpt-5.6-sol / high | 8192 | Compact strict designCritiqueSchema -> approval/repair; incomplete output cannot pass |
| scientific-design-critic-recovery v1 | gpt-5.6-sol / high | 8192 | One INCOMPLETE_TOKEN_LIMIT response -> complete critic only; selector is immutable |
| scientific-design-critic v2 (evaluation history) | gpt-5.6-sol / high | 4096 | Qualitative G1 response ended incomplete after 3865 reasoning tokens |
| scientific-design-repair v1 | gpt-6-astra / high | 8192 | Strict designRepairSchema -> deterministic validation, existing critique retained |
| scientific-design-output-repair v1 | gpt-6-astra / high | 12288 | One incomplete selector response -> complete scientificDecisionV2Schema -> first independent critic |

Templates are in `server/mvp/prompts/`; schemas in
`server/mvp/scientific-decision-contracts.ts`. Actual API arrangement: one concatenated
Responses input string, strict JSON schema, store=false, reasoning=high; no tools,
temperature, images or retrieval. Prompt byte ceiling is 60000; oversized input fails
explicitly rather than silently clipping evidence. Transport retries are zero for
this evaluation. Production retains the existing bounded provider transport policy.

Reservations use `responseCostBound` and the durable B4 `control:cost` ledger. Failed
calls with unknown usage retain reservation. Rates checked against official model
pages: Astra input/cache/write/output 10/1/12.5/50 USD per million, Sol 4/0.4/5/20.
No cache discount is assumed before dispatch; the budget includes reasoning output.
Actual USD billing is not reported by Responses: cost is an estimate from provider
usage, with conservative cache-write allowance, not a provider invoice.
The v3 output allowance follows the demonstrated v2 truncation: reasoning consumed
5178 of 8192 output tokens. It does not upgrade the model or relax scientific gates.
One repair completed the geospatial output; it was not rerun with v3. The remaining
domain evaluations use v3. This is a small evolving-candidate check, not a controlled
model-only superiority experiment or a repeated geospatial acceptance.

An insufficient evidence package stops before the provider and identifies uncovered
dimensions and necessary user information. A corrected alternative is not independently
re-reviewed under the one-critic rule and remains blocked until the outstanding
scientific findings are reviewed. A user cannot override that block through approval.
If the selector response is truncated, a private response envelope preserves the
provider payload and paid usage. One output repair may complete that same alternative
before the single independent critic. It shares the same one-repair allowance with
critique repair. No automatic selector regeneration occurs on restart.

Audit-only records (`prompt_records`, original critique, rejected alternatives,
evaluation fixtures) are retained intentionally. Cleanup classification: MONITOR
retention, not confirmed orphans. No cleanup performed.
