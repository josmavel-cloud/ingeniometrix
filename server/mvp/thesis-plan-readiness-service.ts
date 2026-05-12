import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Prisma, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  runMvpSourceEnrichment,
  type MvpSourceEnrichmentItem,
  type MvpSourceEnrichmentResult,
} from "@/server/mvp/source-enrichment-service";

export type ThesisPlanReadinessDecision =
  | "READY_FOR_THESIS_PLAN"
  | "READY_FOR_THESIS_PLAN_WITH_WARNINGS"
  | "NEEDS_TARGETED_DEEP_RESEARCH"
  | "NEEDS_USER_INPUT"
  | "NEEDS_SOURCE_REPLACEMENT"
  | "BLOCKED_INSUFFICIENT_CONTENT";

export type ThesisPlanSourceRole =
  | "theory_core"
  | "methodology_core"
  | "state_of_art"
  | "context_background"
  | "future_fulltext_required";

export type ThesisPlanSourceUse =
  | "thesis_plan"
  | "methodology_plan"
  | "theoretical_framework_preliminary"
  | "final_theoretical_framework_requires_fulltext";

export type ThesisPlanSectionStatus =
  | "covered"
  | "partially_covered"
  | "missing_but_repairable_by_deep_research"
  | "requires_user_input"
  | "requires_full_text_later";

export type ThesisPlanSectionRequirement = {
  key: string;
  title: string;
  min_words: number | null;
  target_words: string;
  required_for_plan: boolean;
  status: ThesisPlanSectionStatus;
  evidence_basis: string[];
  source_ids: string[];
  warnings: string[];
};

export type ThesisPlanSourceReadiness = {
  source_id: string;
  selected_order: number | null;
  title: string;
  doi: string | null;
  thesis_plan_score: number;
  evidence_depth: MvpSourceEnrichmentItem["evidence_depth"];
  roles_in_plan: ThesisPlanSourceRole[];
  usable_for: ThesisPlanSourceUse[];
  full_text_required_before_final_framework: boolean;
  warnings: string[];
};

export type ThesisPlanReadinessPack = {
  artifact_type: "mvp_thesis_plan_readiness";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  run_id: string;
  artifact_dir: string;
  decision: ThesisPlanReadinessDecision;
  intake_summary: {
    title: string;
    topic: string | null;
    problem_context_present: boolean;
    preferred_methodology_present: boolean;
    target_population_present: boolean;
    available_data_present: boolean;
    advisor_notes_present: boolean;
    missing_user_inputs: string[];
  };
  source_enrichment: {
    run_id: string;
    artifact_dir: string;
    decision: MvpSourceEnrichmentResult["decision"];
    selected_source_count: number;
    abstract_source_count: number;
    full_text_signal_count: number;
    pdf_signal_count: number;
    high_relevance_source_count: number;
    methodology_candidate_count: number;
    theory_candidate_count: number;
    review_or_state_of_art_count: number;
    graph_reference_count: number;
    graph_related_count: number;
    graph_cited_by_count: number;
    missing_evidence_categories: string[];
  };
  source_roles: ThesisPlanSourceReadiness[];
  section_requirements: ThesisPlanSectionRequirement[];
  missing_evidence_categories: string[];
  recommended_deep_research_questions: string[];
  blueprint_input_contract: {
    consume_pack_not_raw_sources: true;
    plan_can_use_abstract_plus_graph: true;
    final_framework_requires_full_text_for_central_sources: true;
    required_downstream_sections: string[];
  };
  warnings: string[];
  blockers: string[];
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function resolveRoles(item: MvpSourceEnrichmentItem): ThesisPlanSourceRole[] {
  const roles: ThesisPlanSourceRole[] = [];
  if (item.quality.labels.includes("core_theory_candidate")) roles.push("theory_core");
  if (item.quality.labels.includes("methodology_candidate")) roles.push("methodology_core");
  if (item.quality.labels.includes("state_of_art_candidate")) roles.push("state_of_art");
  if (roles.length === 0 && item.quality.thesis_plan_score >= 50) roles.push("context_background");
  if (item.quality.labels.includes("requires_full_text_later")) roles.push("future_fulltext_required");
  return unique(roles) as ThesisPlanSourceRole[];
}

function resolveUses(item: MvpSourceEnrichmentItem, roles: ThesisPlanSourceRole[]): ThesisPlanSourceUse[] {
  const uses: ThesisPlanSourceUse[] = ["thesis_plan"];
  if (roles.includes("methodology_core")) uses.push("methodology_plan");
  if (roles.includes("theory_core") || roles.includes("state_of_art")) uses.push("theoretical_framework_preliminary");
  if (roles.includes("future_fulltext_required") || !item.source_summary.has_fulltext) {
    uses.push("final_theoretical_framework_requires_fulltext");
  }
  return unique(uses) as ThesisPlanSourceUse[];
}

function sourceReadiness(items: MvpSourceEnrichmentItem[]): ThesisPlanSourceReadiness[] {
  return items.map((item) => {
    const roles = resolveRoles(item);
    const uses = resolveUses(item, roles);
    const warnings: string[] = [...item.warnings];
    if (uses.includes("final_theoretical_framework_requires_fulltext")) {
      warnings.push("Fuente util para plan por abstract/red bibliografica, pero requiere full text antes de marco teorico final si se usa como central.");
    }
    return {
      source_id: item.source_id,
      selected_order: item.selected_order,
      title: item.title,
      doi: item.doi,
      thesis_plan_score: item.quality.thesis_plan_score,
      evidence_depth: item.evidence_depth,
      roles_in_plan: roles,
      usable_for: uses,
      full_text_required_before_final_framework: uses.includes("final_theoretical_framework_requires_fulltext"),
      warnings: unique(warnings),
    };
  });
}

function section(
  key: string,
  title: string,
  minWords: number | null,
  targetWords: string,
  status: ThesisPlanSectionStatus,
  evidenceBasis: string[],
  sourceIds: string[],
  warnings: string[] = [],
): ThesisPlanSectionRequirement {
  return {
    key,
    title,
    min_words: minWords,
    target_words: targetWords,
    required_for_plan: true,
    status,
    evidence_basis: evidenceBasis,
    source_ids: unique(sourceIds),
    warnings: unique(warnings),
  };
}

function buildSectionRequirements(input: {
  intake: Awaited<ReturnType<typeof loadProjectContext>>["intake"];
  sourceRoles: ThesisPlanSourceReadiness[];
  enrichment: MvpSourceEnrichmentResult;
}) {
  const { intake, sourceRoles, enrichment } = input;
  const theorySources = sourceRoles.filter((source) => source.roles_in_plan.includes("theory_core"));
  const methodSources = sourceRoles.filter((source) => source.roles_in_plan.includes("methodology_core"));
  const stateSources = sourceRoles.filter((source) => source.roles_in_plan.includes("state_of_art"));
  const contextSources = sourceRoles.filter((source) => source.roles_in_plan.includes("context_background"));
  const anySources = sourceRoles.map((source) => source.source_id);
  const fullTextWarnings = sourceRoles.filter((source) => source.full_text_required_before_final_framework);

  return [
    section("cover", "Portada y metadatos", null, "1 pagina", "covered", ["project_metadata", "intake"], [], []),
    section("executive_summary", "Resumen ejecutivo del plan", 250, "250-400 palabras", "covered", ["intake", "source_enrichment_summary"], anySources, []),
    section(
      "problem_statement",
      "Planteamiento del problema",
      800,
      "800-1,200 palabras",
      hasText(intake?.problemContext) ? "covered" : "partially_covered",
      ["intake.problemContext", "selected_sources", "openalex_topics"],
      anySources,
      hasText(intake?.problemContext) ? [] : ["El contexto problematico debe refinarse con input del usuario/asesor."],
    ),
    section("justification", "Justificación", 500, "500-800 palabras", "covered", ["intake", "source_scores", "academic_relevance"], anySources, []),
    section("objectives", "Objetivos", null, "1 objetivo general + 3-5 especificos", "covered", ["intake.topic", "problem_statement"], [], []),
    section(
      "hypotheses_or_assumptions",
      "Hipótesis, supuestos o proposiciones",
      300,
      "300-600 palabras",
      hasText(intake?.preferredMethodology) ? "covered" : "partially_covered",
      ["intake.preferredMethodology", "methodology_sources"],
      methodSources.map((source) => source.source_id),
      hasText(intake?.preferredMethodology) ? [] : ["La hipótesis/supuesto dependerá de confirmar enfoque metodológico."],
    ),
    section(
      "preliminary_theoretical_framework",
      "Marco teórico preliminar / estado del arte",
      1500,
      "1,500-2,500 palabras",
      theorySources.length >= 1 && stateSources.length >= 1 ? "covered" : "missing_but_repairable_by_deep_research",
      ["abstracts", "openalex_referenced_works", "openalex_related_works", "full_text_signals"],
      unique([...theorySources, ...stateSources, ...contextSources].map((source) => source.source_id)),
      fullTextWarnings.length > 0
        ? ["El marco teorico preliminar puede usar abstracts/red bibliografica; el marco teorico final requiere full text de fuentes centrales cerradas."]
        : [],
    ),
    section(
      "variables_or_constructs",
      "Variables, categorías o constructos",
      400,
      "tabla + 400-700 palabras",
      methodSources.length >= 1 || theorySources.length >= 1 ? "covered" : "missing_but_repairable_by_deep_research",
      ["intake", "methodology_sources", "theory_sources"],
      unique([...methodSources, ...theorySources].map((source) => source.source_id)),
      [],
    ),
    section(
      "methodology",
      "Metodología",
      1200,
      "1,200-2,000 palabras",
      methodSources.length >= 1 ? "covered" : "missing_but_repairable_by_deep_research",
      ["intake.preferredMethodology", "methodology_sources"],
      methodSources.map((source) => source.source_id),
      [],
    ),
    section(
      "consistency_matrix",
      "Matriz de consistencia",
      null,
      "matriz completa",
      "covered",
      ["problem", "objectives", "variables", "methodology"],
      unique([...methodSources, ...theorySources].map((source) => source.source_id)),
      [],
    ),
    section("schedule", "Plan de trabajo / cronograma", null, "Gantt 6-10 actividades", "covered", ["methodology", "standard_thesis_workplan"], [], []),
    section(
      "budget_resources",
      "Presupuesto, recursos e infraestructura",
      200,
      "tabla + 300-500 palabras",
      hasText(intake?.availableData) ? "covered" : "partially_covered",
      ["intake.availableData", "methodology"],
      [],
      hasText(intake?.availableData) ? [] : ["Recursos/datos deben confirmarse; usar supuestos marcados."],
    ),
    section("risks_ethics_limitations", "Riesgos, ética y limitaciones", 500, "500-800 palabras", "covered", ["readiness_warnings", "methodology", "source_access"], anySources, []),
    section(
      "references",
      "Referencias",
      null,
      "10-20 referencias si graph/enrichment lo permite",
      enrichment.graph_reference_count >= 20 ? "covered" : "partially_covered",
      ["selected_sources", "openalex_reference_graph"],
      anySources,
      [],
    ),
    section("traceability_annexes", "Anexos de trazabilidad Ingeniometrix", null, "tablas automaticas", "covered", ["source_roles", "enrichment", "readiness"], anySources, []),
  ];
}

function deepResearchQuestions(input: {
  sections: ThesisPlanSectionRequirement[];
  enrichment: MvpSourceEnrichmentResult;
  sourceRoles: ThesisPlanSourceReadiness[];
}) {
  const missing = new Set(input.enrichment.missing_evidence_categories);
  for (const section of input.sections) {
    if (section.status === "missing_but_repairable_by_deep_research") missing.add(section.key);
  }
  const fullTextLater = input.sourceRoles.filter((source) => source.full_text_required_before_final_framework).length;

  return unique([
    missing.has("methodology_candidate") || missing.has("methodology")
      ? "Buscar fuentes metodológicas adicionales sobre diseño/modelamiento/validación aplicable al tema de tesis."
      : null,
    missing.has("theory_candidate") || missing.has("preliminary_theoretical_framework")
      ? "Buscar fuentes teóricas base y revisiones para reforzar conceptos centrales del marco teórico preliminar."
      : null,
    missing.has("review_or_state_of_art_source")
      ? "Buscar una revisión, estado del arte o survey reciente que sintetice tendencias y brechas."
      : null,
    fullTextLater > 0
      ? "Identificar versiones open access o fuentes alternativas con full text para las fuentes centrales marcadas como pendientes antes del marco teórico final."
      : null,
  ]);
}

function decide(input: {
  sections: ThesisPlanSectionRequirement[];
  enrichment: MvpSourceEnrichmentResult;
  sourceRoles: ThesisPlanSourceReadiness[];
  missingUserInputs: string[];
  recommendedDeepResearchQuestions: string[];
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const hardMissing = input.sections.filter((section) => section.status === "requires_user_input");
  const deepResearchRepairable = input.sections.filter((section) => section.status === "missing_but_repairable_by_deep_research");
  const partial = input.sections.filter((section) => section.status === "partially_covered");
  const centralFullTextLater = input.sourceRoles.filter((source) => source.full_text_required_before_final_framework);

  let decision: ThesisPlanReadinessDecision = "READY_FOR_THESIS_PLAN";
  if (input.enrichment.selected_source_count < 3 || input.enrichment.abstract_source_count < 2) {
    decision = "BLOCKED_INSUFFICIENT_CONTENT";
    blockers.push("No hay base bibliográfica mínima para un plan de tesis trazable.");
  } else if (input.enrichment.decision === "NEEDS_SOURCE_REPLACEMENT") {
    decision = "NEEDS_SOURCE_REPLACEMENT";
    blockers.push("El enrichment recomienda reemplazar fuentes antes de planificar.");
  } else if (hardMissing.length > 0 || input.missingUserInputs.length >= 4) {
    decision = "NEEDS_USER_INPUT";
    blockers.push("Faltan datos de intake necesarios para cerrar el plan sin demasiados supuestos.");
  } else if (deepResearchRepairable.length > 0 || input.enrichment.decision === "NEEDS_TARGETED_DEEP_RESEARCH") {
    decision = "NEEDS_TARGETED_DEEP_RESEARCH";
    warnings.push("El plan es viable, pero conviene ejecutar Deep Research ligero para cubrir vacíos focalizados.");
  } else if (partial.length > 0 || centralFullTextLater.length > 0) {
    decision = "READY_FOR_THESIS_PLAN_WITH_WARNINGS";
  }

  if (centralFullTextLater.length > 0) {
    warnings.push(`${centralFullTextLater.length} fuente(s) pueden usarse para plan por abstract/red, pero requieren full text antes del marco teórico final.`);
  }
  for (const section of partial) {
    warnings.push(`${section.title}: cobertura parcial; puede requerir supuestos marcados o input posterior.`);
  }

  return { decision, warnings: unique(warnings), blockers: unique(blockers) };
}

async function loadProjectContext(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { intake: true },
  });
  if (!project) throw new Error("Proyecto no encontrado.");
  return project;
}

function markdown(pack: ThesisPlanReadinessPack) {
  const lines = [
    `# Thesis Plan Readiness — ${pack.project_id}`,
    "",
    `Decision: **${pack.decision}**`,
    `Selected sources: ${pack.source_enrichment.selected_source_count}`,
    `Abstracts: ${pack.source_enrichment.abstract_source_count}`,
    `Full-text signals: ${pack.source_enrichment.full_text_signal_count}`,
    `Reference graph: ${pack.source_enrichment.graph_reference_count}`,
    "",
    "## Warnings",
    ...(pack.warnings.length ? pack.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Blockers",
    ...(pack.blockers.length ? pack.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "## Sections",
  ];

  for (const section of pack.section_requirements) {
    lines.push(
      `- **${section.title}** — ${section.status}; min: ${section.min_words ?? section.target_words}; sources: ${section.source_ids.length}`,
    );
  }

  lines.push("", "## Source roles");
  for (const source of pack.source_roles) {
    lines.push(
      `- ${source.selected_order ?? "?"}. ${source.title} — ${source.roles_in_plan.join(", ")} / ${source.evidence_depth} / score ${source.thesis_plan_score}`,
    );
  }

  lines.push("", "## Deep Research questions");
  lines.push(...(pack.recommended_deep_research_questions.length ? pack.recommended_deep_research_questions.map((question) => `- ${question}`) : ["- none"]));

  return `${lines.join("\n")}\n`;
}

export async function runMvpThesisPlanReadiness(input: { userId: string; projectId: string; runId?: string }) {
  const runId = input.runId ?? `mvp-thesis-plan-readiness-${randomUUID()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-thesis-plan-readiness", input.projectId, runId);
  await mkdir(artifactDir, { recursive: true });

  const project = await loadProjectContext(input.userId, input.projectId);
  const enrichment = await runMvpSourceEnrichment({ userId: input.userId, projectId: input.projectId });
  const roles = sourceReadiness(enrichment.items);
  const sections = buildSectionRequirements({ intake: project.intake, sourceRoles: roles, enrichment });
  const missingUserInputs = unique([
    hasText(project.intake?.problemContext) ? null : "problem_context",
    hasText(project.intake?.preferredMethodology) ? null : "preferred_methodology",
    hasText(project.intake?.targetPopulation) ? null : "target_population_or_case",
    hasText(project.intake?.availableData) ? null : "available_data_or_resources",
  ]);
  const recommendedQuestions = deepResearchQuestions({ sections, enrichment, sourceRoles: roles });
  const decision = decide({
    sections,
    enrichment,
    sourceRoles: roles,
    missingUserInputs,
    recommendedDeepResearchQuestions: recommendedQuestions,
  });
  const missingEvidenceCategories = unique([
    ...enrichment.missing_evidence_categories,
    ...sections
      .filter((section) => section.status === "missing_but_repairable_by_deep_research" || section.status === "requires_user_input")
      .map((section) => section.key),
  ]);

  const pack: ThesisPlanReadinessPack = {
    artifact_type: "mvp_thesis_plan_readiness",
    artifact_version: "v1",
    generated_at: new Date().toISOString(),
    project_id: input.projectId,
    run_id: runId,
    artifact_dir: artifactDir,
    decision: decision.decision,
    intake_summary: {
      title: project.title,
      topic: project.intake?.topic ?? null,
      problem_context_present: hasText(project.intake?.problemContext),
      preferred_methodology_present: hasText(project.intake?.preferredMethodology),
      target_population_present: hasText(project.intake?.targetPopulation),
      available_data_present: hasText(project.intake?.availableData),
      advisor_notes_present: hasText(project.intake?.advisorNotes),
      missing_user_inputs: missingUserInputs,
    },
    source_enrichment: {
      run_id: enrichment.run_id,
      artifact_dir: enrichment.artifact_dir,
      decision: enrichment.decision,
      selected_source_count: enrichment.selected_source_count,
      abstract_source_count: enrichment.abstract_source_count,
      full_text_signal_count: enrichment.full_text_signal_count,
      pdf_signal_count: enrichment.pdf_signal_count,
      high_relevance_source_count: enrichment.high_relevance_source_count,
      methodology_candidate_count: enrichment.methodology_candidate_count,
      theory_candidate_count: enrichment.theory_candidate_count,
      review_or_state_of_art_count: enrichment.review_or_state_of_art_count,
      graph_reference_count: enrichment.graph_reference_count,
      graph_related_count: enrichment.graph_related_count,
      graph_cited_by_count: enrichment.graph_cited_by_count,
      missing_evidence_categories: enrichment.missing_evidence_categories,
    },
    source_roles: roles,
    section_requirements: sections,
    missing_evidence_categories: missingEvidenceCategories,
    recommended_deep_research_questions: recommendedQuestions,
    blueprint_input_contract: {
      consume_pack_not_raw_sources: true,
      plan_can_use_abstract_plus_graph: true,
      final_framework_requires_full_text_for_central_sources: true,
      required_downstream_sections: sections.map((section) => section.key),
    },
    warnings: unique([...decision.warnings, ...sections.flatMap((section) => section.warnings)]),
    blockers: decision.blockers,
  };

  await writeFile(path.join(artifactDir, "thesis-plan-readiness-pack.json"), `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "thesis-plan-readiness-summary.md"), markdown(pack), "utf8");

  await logAuditEvent({
    eventType: "MVP_THESIS_PLAN_READINESS_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: {
      run_id: runId,
      artifact_dir: artifactDir,
      decision: pack.decision,
      enrichment_run_id: enrichment.run_id,
      missing_evidence_categories: pack.missing_evidence_categories,
      missing_user_inputs: pack.intake_summary.missing_user_inputs,
      warnings: pack.warnings,
      blockers: pack.blockers,
    } as Prisma.InputJsonValue,
  });

  return pack;
}
