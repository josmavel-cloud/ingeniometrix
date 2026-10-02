import { autonomousDesignPatchSchema, designAlternativeV2Schema, validateScientificDecision, type DesignCritique, type MethodEvidencePack, type ResearchIntentContract, type ScientificDecision } from "./scientific-decision-contracts";
import type { z } from "zod";

export type PendingDecisionClass = "SCOPE_BLOCKING" | "FACT_TO_VERIFY_DURING_RESEARCH" | "METHOD_DEFAULTABLE" | "RESOURCE_CONDITIONAL" | "NONBLOCKING_LIMITATION";

export function classifyPendingDecision(question: string, scopeStatus: string): PendingDecisionClass {
  if (/alcance|delimitaci[oó]n|poblaci[oó]n|unidad de estudio|objeto de estudio|prop[oó]sito|pa[ií]s|regi[oó]n|cobertura geogr[aá]fica|caso [uú]nico o m[uú]ltiple|scope|population/i.test(question)) return "SCOPE_BLOCKING";
  if (/acceso|dato|muestra|medici[oó]n|par[aá]metro|geometr[ií]a/i.test(question)) return "FACT_TO_VERIFY_DURING_RESEARCH";
  if (/recurso|permiso|instituci[oó]n|financiaci[oó]n/i.test(question)) return "RESOURCE_CONDITIONAL";
  if (/software|herramienta|m[eé]todo|validaci[oó]n|t[eé]cnica/i.test(question)) return "METHOD_DEFAULTABLE";
  // Inclusive search coverage is a documented methodological assumption, not
  // permission to narrow the user's confirmed research scope.
  if (/idioma|ling[uü][ií]stic|periodo|temporal|formato|tipo de publicaci[oó]n|tipos de publicaciones|cobertura bibliogr[aá]fica/i.test(question)) return "NONBLOCKING_LIMITATION";
  if (scopeStatus === "PENDING_USER_DECISION") return "SCOPE_BLOCKING";
  return "NONBLOCKING_LIMITATION";
}

export function inScopeAlternatives(decision: ScientificDecision, critique: DesignCritique) {
  return decision.alternatives.filter((alternative) => {
    const review = critique.assessments.find((item) => item.alternative_id === alternative.id);
    if (!("scope_effect" in alternative) || alternative.scope_effect !== "preserves" || alternative.scope_changes.length ||
      !review?.intent_preserved || !["PRESERVED", "CLARIFIED", "PENDING_USER_DECISION"].includes(review.scope.status)) return false;
    const questions = [...alternative.pending_user_decisions.map(item => item.question), ...review.user_decisions_required];
    if (review.scope.status === "PENDING_USER_DECISION" && !questions.length) return false;
    if (review.scope.confirmation_required && review.scope.status !== "PENDING_USER_DECISION") return false;
    // The independent structured scope finding outranks a keyword mentioned in
    // an operational question (e.g. a warning not to narrow scope by language).
    // This only permits repair; immutable scope validation and the next critic
    // still have to pass. Pending or genuinely conflicting scope stays excluded.
    if (["PRESERVED", "CLARIFIED"].includes(review.scope.status) && !review.scope.confirmation_required &&
      !review.critical_findings.some(finding => finding.severity === "BLOCKING" && /^(scope|definition\.|intent)(\.|$)/.test(finding.affected_field))) return true;
    return questions.every(question => classifyPendingDecision(question, review.scope.status) !== "SCOPE_BLOCKING");
  });
}

export function compactAlternativeForRepair(value: ScientificDecision["alternatives"][number]) {
  const alternative = designAlternativeV2Schema.parse(value);
  return { id: alternative.id, scope_fulfilled: alternative.scope_fulfilled, primary_method: alternative.primary_method,
    research_design: { approach: alternative.research_design.approach, design: alternative.research_design.design,
      unit_population_corpus: alternative.research_design.unit_population_corpus,
      procedure: alternative.research_design.procedure, quality_criteria: alternative.research_design.quality_criteria,
      analysis_method: alternative.research_design.analysis_method,
      assumptions: alternative.research_design.assumptions, limitations: alternative.research_design.limitations,
      pending_decisions: alternative.research_design.pending_decisions,
      methodological_support: alternative.research_design.methodological_support },
    components: alternative.components.filter((item) => item.kind === "method" || item.kind === "technique")
      .map((item) => ({ name: item.name, role: item.role, inputs: item.inputs, outputs: item.outputs, support: item.support })),
    data_requirements: alternative.data_requirements, pending_user_decisions: alternative.pending_user_decisions };
}

export function resolveNonmaterialDecisions(input: { decision: ScientificDecision; critique: DesignCritique;
  intent: ResearchIntentContract; pack: MethodEvidencePack }) {
  for (const alternative of inScopeAlternatives(input.decision, input.critique)) {
    const review = input.critique.assessments.find((item) => item.alternative_id === alternative.id)!;
    if (review.decision !== "REPAIR_REQUIRED" || review.critical_findings.some((item) => item.severity === "BLOCKING") ||
      Object.values(review).some((value) => value === "FAIL")) continue;
    const questions = [...new Set([...alternative.pending_user_decisions.map((item) => item.question), ...review.user_decisions_required])];
    if (!questions.length || questions.some((question) => classifyPendingDecision(question, review.scope.status) === "SCOPE_BLOCKING")) continue;
    const current = designAlternativeV2Schema.parse(alternative);
    const futureFacts = questions.filter((question) => classifyPendingDecision(question, review.scope.status) === "FACT_TO_VERIFY_DURING_RESEARCH" ||
      classifyPendingDecision(question, review.scope.status) === "RESOURCE_CONDITIONAL");
    const next = designAlternativeV2Schema.parse({ ...current,
      data_requirements: [...current.data_requirements, ...futureFacts.map((question) => ({
        description: question, availability: "PENDING" as const, confirmation_or_action: "Verificar antes de ejecutar el trabajo de campo o análisis." }))],
      research_design: { ...current.research_design,
        pending_decisions: [...new Set([...current.research_design.pending_decisions, ...questions])],
        limitations: [...new Set([...current.research_design.limitations, ...questions])] },
      transfer_limits: [...new Set([...current.transfer_limits, ...questions])], pending_user_decisions: [] });
    validateScientificDecision({ ...input.decision, alternatives: [next], recommended_id: next.id }, input.intent, input.pack);
    return { alternative: next, reclassified: questions.map((question) => ({ question,
      classification: classifyPendingDecision(question, review.scope.status) })) };
  }
  return null;
}

export function applyAutonomousDesignPatch(input: {
  decision: ScientificDecision; critique: DesignCritique; intent: ResearchIntentContract; pack: MethodEvidencePack;
  patch: z.infer<typeof autonomousDesignPatchSchema>;
  methodologicalSupportAdded?: Array<{ source_id: string; evidence_id: string }>;
}) {
  const patch = autonomousDesignPatchSchema.parse(input.patch);
  const alternative = inScopeAlternatives(input.decision, input.critique).find((item) => item.id === patch.alternativeId);
  if (!alternative) throw new Error("AUTONOMOUS_PATCH_OUT_OF_SCOPE");
  const review = input.critique.assessments.find((item) => item.alternative_id === alternative.id)!;
  const findingCodes = new Set(review.critical_findings.map((finding) => finding.code));
  if (patch.resolvedFindingCodes.some((code) => !findingCodes.has(code)) || patch.unresolvedFindingCodes.some((code) => !findingCodes.has(code))) throw new Error("AUTONOMOUS_PATCH_FINDING_UNKNOWN");
  if (patch.procedure.length === 0 || patch.qualityCriteria.length === 0 || patch.dataRequirements.length === 0) throw new Error("AUTONOMOUS_PATCH_EXECUTION_INCOMPLETE");
  const unresolved = new Set(patch.unresolvedFindingCodes);
  // A thesis-plan proposal may carry an unverified future data/access task,
  // provided an independent targeted critic explicitly accepts that deferral.
  // Scope and methodological validity findings cannot be deferred here.
  if (review.critical_findings.some((finding) => finding.severity === "BLOCKING" && unresolved.has(finding.code) &&
    (!/^(data_requirements|feasibility)(\.|$)/.test(finding.affected_field) ||
      !patch.dataRequirements.some((requirement) => requirement.availability === "PENDING"))))
    throw new Error("AUTONOMOUS_PATCH_BLOCKING_FINDING_UNRESOLVED");
  const previous = designAlternativeV2Schema.parse(alternative);
  const added = input.methodologicalSupportAdded ?? [];
  if (added.some(pointer => !input.pack.items.some(item => item.source_id === pointer.source_id &&
    item.evidence_id === pointer.evidence_id && item.allowed_use === "theory_or_method_support")))
    throw new Error("AUTONOMOUS_PATCH_SUPPORT_NOT_IN_CONTEXT");
  const next = designAlternativeV2Schema.parse({ ...previous,
    research_design: { ...previous.research_design,
      methodological_support: [...previous.research_design.methodological_support, ...added.filter(pointer =>
        !previous.research_design.methodological_support.some(item => item.source_id === pointer.source_id && item.evidence_id === pointer.evidence_id))],
      procedure: patch.procedure, quality_criteria: patch.qualityCriteria,
      sampling_selection: patch.samplingSelection ?? previous.research_design.sampling_selection,
      analysis_method: patch.analysisMethod ?? previous.research_design.analysis_method,
      assumptions: [...new Set([...previous.research_design.assumptions, ...patch.assumptionsAdded])],
      limitations: [...new Set([...previous.research_design.limitations, ...patch.limitationsAdded])],
      pending_decisions: [...new Set([...previous.research_design.pending_decisions, ...patch.validationRequirementsAdded])],
    },
    data_requirements: [...previous.data_requirements, ...patch.dataRequirements],
    feasibility: patch.feasibility ?? previous.feasibility,
    transfer_limits: [...new Set([...previous.transfer_limits, ...patch.limitationsAdded])],
    // Scope questions are excluded above. Remaining decisions become explicit
    // future validation requirements rather than fabricated user confirmations.
    pending_user_decisions: [],
  });
  validateScientificDecision({ ...input.decision, alternatives: [next], recommended_id: next.id }, input.intent, input.pack);
  return next;
}
