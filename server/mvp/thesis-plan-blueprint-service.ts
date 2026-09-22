import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, ExportStatus, Prisma, ProjectStatus, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import {
  runMvpThesisPlanReadiness,
  type ThesisPlanReadinessPack,
  type ThesisPlanSectionRequirement,
  type ThesisPlanSourceReadiness,
} from "@/server/mvp/thesis-plan-readiness-service";

const PROMPT_VERSION = "ingeniometrix-mvp-thesis-plan-blueprint-v1";

export type ThesisPlanBlueprintDecision =
  | "BLUEPRINT_READY"
  | "BLUEPRINT_READY_WITH_WARNINGS"
  | "NEEDS_TARGETED_DEEP_RESEARCH"
  | "BLOCKED";

export type ThesisPlanBlueprintSection = {
  key: string;
  title: string;
  purpose: string;
  min_words: number | null;
  target_words: string;
  status_from_readiness: ThesisPlanSectionRequirement["status"];
  source_ids: string[];
  evidence_rules: string[];
  required_content: string[];
  draft_guidance_es: string[];
  qa_checks: string[];
  warnings: string[];
};

export type ThesisPlanBlueprint = {
  artifact_type: "mvp_thesis_plan_blueprint";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  run_id: string;
  artifact_dir: string;
  decision: ThesisPlanBlueprintDecision;
  persisted_blueprint_version_id: string | null;
  readiness: {
    run_id: string;
    artifact_dir: string;
    decision: ThesisPlanReadinessPack["decision"];
    warnings: string[];
    blockers: string[];
  };
  document_contract: {
    positioning: "academic_planning_assistant";
    document_kind: "thesis_plan_preliminary";
    final_thesis_disclaimer: string;
    full_text_policy: string;
  };
  project_context: {
    title: string;
    program: string;
    degree_level: string;
    university: string;
    country: string;
    language: string;
    topic: string;
    problem_context: string | null;
    research_line: string | null;
    target_population: string | null;
    available_data: string | null;
    preferred_methodology: string | null;
    academic_constraints: string | null;
    advisor_notes: string | null;
  };
  source_roles: ThesisPlanSourceReadiness[];
  sections: ThesisPlanBlueprintSection[];
  core_tables: {
    objectives: string[][];
    variables: string[][];
    methodology_phases: string[][];
    consistency_matrix: string[][];
    schedule: string[][];
    budget: string[][];
    risks: string[][];
    traceability: string[][];
  };
  references: Array<{
    source_id: string;
    code: string;
    title: string;
    year: number | null;
    doi: string | null;
    venue: string | null;
    role: string[];
    evidence_depth: string;
    full_text_required_before_final_framework: boolean;
  }>;
  qa_plan: {
    minimum_sections: number;
    section_word_minimums_required: boolean;
    cite_selected_sources_only: boolean;
    traceability_annex_required: boolean;
    warn_on_abstract_only_central_sources: boolean;
    expected_docx_tables_min: number;
    expected_docx_annexes_min: number;
  };
  warnings: string[];
  blockers: string[];
};

type ProjectBundle = NonNullable<Awaited<ReturnType<typeof loadProjectBundle>>>;

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function loadProjectBundle(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        orderBy: { selectedOrder: "asc" },
        include: { reference: true },
      },
      blueprintVersions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
}

function sourceCode(order: number | null | undefined, index: number) {
  return `F${String(order ?? index + 1).padStart(2, "0")}`;
}

function roleIds(roles: ThesisPlanSourceReadiness[], role: string) {
  return roles.filter((source) => source.roles_in_plan.includes(role as never)).map((source) => source.source_id);
}

function sectionPurpose(key: string) {
  const purposes: Record<string, string> = {
    cover: "Identificar el documento, proyecto académico y versión de trabajo.",
    executive_summary: "Presentar el plan completo en una síntesis autónoma y prudente.",
    problem_statement: "Definir el problema, brecha, delimitación y preguntas de investigación.",
    justification: "Explicar valor teórico, metodológico, práctico y viabilidad.",
    objectives: "Alinear objetivo general y objetivos específicos con problema y método.",
    hypotheses_or_assumptions: "Formular hipótesis, supuestos o criterios de validación coherentes con el enfoque.",
    preliminary_theoretical_framework: "Construir marco conceptual preliminar y estado del arte con trazabilidad de evidencia.",
    variables_or_constructs: "Definir variables/categorías, dimensiones, indicadores y fuentes de datos.",
    methodology: "Describir enfoque, diseño, unidad de análisis, procedimientos, análisis y validez.",
    consistency_matrix: "Verificar consistencia entre problema, objetivos, hipótesis, variables y método.",
    schedule: "Planificar actividades, hitos y secuencia temporal.",
    budget_resources: "Identificar recursos, costos estimados y supuestos operativos.",
    risks_ethics_limitations: "Declarar riesgos, ética, limitaciones y mitigaciones.",
    references: "Listar referencias usadas con estilo consistente.",
    traceability_annexes: "Auditar fuentes, roles, evidencia, gaps y advertencias.",
  };
  return purposes[key] ?? "Sección obligatoria del plan de tesis.";
}

function requiredContent(key: string) {
  const content: Record<string, string[]> = {
    executive_summary: ["problema", "objetivo central", "enfoque metodológico", "aporte esperado", "alcance preliminar"],
    problem_statement: ["contexto", "situación problemática", "brecha", "pregunta general", "preguntas específicas", "delimitación"],
    justification: ["justificación teórica", "justificación metodológica", "justificación práctica", "viabilidad"],
    objectives: ["objetivo general", "3-5 objetivos específicos", "alineación con método"],
    hypotheses_or_assumptions: ["hipótesis o supuestos", "criterios de desempeño", "condiciones de contrastación"],
    preliminary_theoretical_framework: ["conceptos centrales", "antecedentes", "estado del arte", "métodos/modelos", "brechas", "advertencias full text"],
    variables_or_constructs: ["definición conceptual", "definición operacional", "dimensiones", "indicadores", "fuente de datos"],
    methodology: ["enfoque", "diseño", "unidad de análisis", "técnicas", "procedimiento", "análisis", "validez/confiabilidad", "limitaciones"],
    consistency_matrix: ["problema", "objetivos", "hipótesis/supuestos", "variables", "indicadores", "técnicas"],
    schedule: ["actividades", "duración", "dependencias", "entregables"],
    budget_resources: ["software", "datos", "campo/laboratorio", "asesoría", "contingencia"],
    risks_ethics_limitations: ["riesgos técnicos", "riesgos de datos", "ética", "limitaciones", "mitigación"],
    references: ["fuentes seleccionadas", "fuentes de graph si se usan", "estilo consistente"],
    traceability_annexes: ["roles de fuente", "evidence depth", "secciones soportadas", "gaps", "full text pendiente"],
  };
  return content[key] ?? ["contenido obligatorio según contrato académico"];
}

function evidenceRules(section: ThesisPlanSectionRequirement) {
  const base = [
    "Usar solo fuentes seleccionadas o derivadas explícitamente del readiness/enrichment.",
    "No afirmar lectura de full text cuando la fuente está marcada como abstract_plus_graph.",
    "Separar evidencia central de contexto y de fuentes pendientes de full text.",
  ];
  if (section.key === "preliminary_theoretical_framework") {
    base.push("Incluir advertencia de que el marco teórico final requiere full text para fuentes centrales cerradas.");
  }
  if (section.key === "references") {
    base.push("Toda referencia listada debe aparecer citada o marcada como contexto/graph.");
  }
  return base;
}

function draftGuidance(section: ThesisPlanSectionRequirement, project: ProjectBundle) {
  const topic = project.intake?.topic ?? project.title;
  const method = project.intake?.preferredMethodology ?? "metodología de investigación aplicada definida en el intake";
  const target = project.intake?.targetPopulation ?? "unidad de análisis definida por el usuario";
  const guidance: Record<string, string[]> = {
    executive_summary: [
      `Redactar una síntesis de ${topic}, destacando problema, objetivo y ${method}.`,
      "Aclarar que el documento es plan académico preliminar, no tesis final.",
    ],
    problem_statement: [
      `Delimitar el problema alrededor de ${target}.`,
      "Construir una brecha investigativa verificable usando fuentes seleccionadas y graph OpenAlex.",
    ],
    methodology: [
      `Explicar por qué ${method} responde la pregunta de investigación.",`,
      "Organizar el procedimiento en fases trazables: revisión, modelamiento/datos, análisis, validación y redacción.",
    ],
    preliminary_theoretical_framework: [
      "Usar fuentes theory_core y state_of_art como columna vertebral preliminar.",
      "Marcar explícitamente qué fuentes requieren full text antes del marco teórico final.",
    ],
  };
  return guidance[section.key] ?? ["Redactar la sección siguiendo propósito, contenido requerido y QA del contrato."];
}

function qaChecks(section: ThesisPlanSectionRequirement) {
  const checks = [
    section.min_words ? `Cumple mínimo de ${section.min_words} palabras.` : `Cumple estructura esperada: ${section.target_words}.`,
    "Incluye fuentes trazables cuando hace afirmaciones sustantivas.",
    "No inventa datos no presentes en intake/readiness.",
  ];
  if (section.source_ids.length > 0) checks.push(`Usa al menos una de ${section.source_ids.length} fuente(s) asignada(s).`);
  return checks;
}

function buildSections(pack: ThesisPlanReadinessPack, project: ProjectBundle): ThesisPlanBlueprintSection[] {
  return pack.section_requirements.map((section) => ({
    key: section.key,
    title: section.title,
    purpose: sectionPurpose(section.key),
    min_words: section.min_words,
    target_words: section.target_words,
    status_from_readiness: section.status,
    source_ids: section.source_ids,
    evidence_rules: evidenceRules(section),
    required_content: requiredContent(section.key),
    draft_guidance_es: draftGuidance(section, project),
    qa_checks: qaChecks(section),
    warnings: section.warnings,
  }));
}

function buildReferences(project: ProjectBundle, roles: ThesisPlanSourceReadiness[]) {
  const roleById = new Map(roles.map((role) => [role.source_id, role]));
  return project.projectReferences.map((projectReference, index) => {
    const reference = projectReference.reference;
    const role = roleById.get(reference.id);
    return {
      source_id: reference.id,
      code: sourceCode(projectReference.selectedOrder, index),
      title: reference.title,
      year: reference.year,
      doi: reference.doi,
      venue: reference.venue,
      role: role?.roles_in_plan ?? [],
      evidence_depth: role?.evidence_depth ?? "metadata_limited",
      full_text_required_before_final_framework: Boolean(role?.full_text_required_before_final_framework),
    };
  });
}

function buildCoreTables(input: { pack: ThesisPlanReadinessPack; project: ProjectBundle; references: ReturnType<typeof buildReferences> }): ThesisPlanBlueprint["core_tables"] {
  const { project, pack, references } = input;
  const intake = project.intake;
  const methodSources = pack.source_roles.filter((source) => source.roles_in_plan.includes("methodology_core"));
  const theorySources = pack.source_roles.filter((source) => source.roles_in_plan.includes("theory_core"));
  const stateSources = pack.source_roles.filter((source) => source.roles_in_plan.includes("state_of_art"));
  const topic = intake?.topic ?? project.title;

  return {
    objectives: [
      ["Nivel", "Formulación", "Evidencia/soporte"],
      ["General", `Diseñar/evaluar un plan metodológico para ${topic}.`, "Intake + fuentes seleccionadas"],
      ["Específico 1", "Caracterizar el caso/unidad de análisis y datos disponibles.", "Intake / availableData"],
      ["Específico 2", "Definir variables/categorías, dimensiones e indicadores.", theorySources.map((s) => s.title).slice(0, 2).join("; ") || "Fuentes teóricas"],
      ["Específico 3", "Plantear metodología y procedimiento de análisis.", methodSources.map((s) => s.title).slice(0, 2).join("; ") || "Fuentes metodológicas"],
      ["Específico 4", "Establecer criterios de interpretación, limitaciones y trazabilidad.", "Readiness pack + contrato de contenido"],
    ],
    variables: [
      ["Variable/categoría", "Definición conceptual", "Dimensiones", "Indicadores preliminares", "Fuente"],
      ["Confiabilidad estructural", "Capacidad del sistema para cumplir su función bajo incertidumbre.", "seguridad, desempeño, probabilidad de falla", "índice beta, Pf, margen de seguridad", theorySources[0]?.title ?? "Fuente teórica seleccionada"],
      ["Demanda sísmica/cargas", "Acciones que solicitan el puente durante operación o evento sísmico.", "intensidad, combinación, variabilidad", "PGA/espectro, carga viva, factor de demanda", intake?.availableData ?? "Datos por confirmar"],
      ["Capacidad/resistencia", "Respuesta resistente de elementos/sistema ante demanda.", "material, geometría, deterioro", "resistencia nominal/probabilística, rigidez, deflexión", methodSources[0]?.title ?? "Fuente metodológica seleccionada"],
      ["Condición estructural", "Estado observable o inferido de componentes críticos.", "deterioro, corrosión, fatiga", "inspección, pérdida de sección, daño", stateSources[0]?.title ?? "Estado del arte/fuente de contexto"],
    ],
    methodology_phases: [
      ["Fase", "Actividad", "Producto", "Fuente/criterio"],
      ["1", "Revisión bibliográfica y delimitación", "Marco preliminar y brechas", "Enrichment + readiness"],
      ["2", "Caracterización del caso y datos", "Ficha técnica/datos disponibles", intake?.availableData ?? "Input del usuario"],
      ["3", "Definición de variables e incertidumbres", "Matriz operacional", theorySources.map((s) => s.title).slice(0, 2).join("; ")],
      ["4", "Modelamiento/análisis de confiabilidad", "Procedimiento reproducible", methodSources.map((s) => s.title).slice(0, 2).join("; ")],
      ["5", "Interpretación y validación", "Criterios, riesgos y límites", "Contrato QA + asesoría"],
    ],
    consistency_matrix: [
      ["Problema", "Objetivo", "Hipótesis/supuesto", "Variable", "Método", "Evidencia"],
      ["Incertidumbre en seguridad/desempeño del puente", "Caracterizar demanda/capacidad", "La confiabilidad puede estimarse con variables críticas explícitas", "Confiabilidad estructural", "Revisión + modelamiento", "Fuentes theory/method"],
      ["Limitaciones de datos", "Definir datos mínimos y supuestos", "Los supuestos deben ser trazables y revisables", "Demanda/capacidad/condición", "Matriz operacional", "Intake + fuentes"],
      ["Necesidad de decisión técnica", "Interpretar indicadores", "Los indicadores apoyan priorización, no diagnóstico final aislado", "Riesgo/desempeño", "Criterios de interpretación", "Readiness + asesoría"],
    ],
    schedule: [
      ["Actividad", "Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6"],
      ["Revisión bibliográfica y full text pendiente", "X", "X", "", "", "", ""],
      ["Caracterización del caso/datos", "X", "X", "", "", "", ""],
      ["Definición de variables y modelo", "", "X", "X", "", "", ""],
      ["Análisis de confiabilidad", "", "", "X", "X", "", ""],
      ["Validación/discusión", "", "", "", "X", "X", ""],
      ["Redacción y revisión", "", "", "", "", "X", "X"],
    ],
    budget: [
      ["Rubro", "Necesidad", "Supuesto de costo", "Observación"],
      ["Software/modelamiento", "Herramientas de cálculo/análisis", "Por confirmar", "Puede usar alternativas académicas/open source"],
      ["Acceso documental", "Full text de fuentes centrales", "Por confirmar", "Requerido para marco teórico final"],
      ["Datos/inspección", "Información técnica del puente", "Por confirmar", "Depende de disponibilidad institucional"],
      ["Contingencia", "Ajustes metodológicos", "10-15% estimado", "Usar solo como supuesto preliminar"],
    ],
    risks: [
      ["Riesgo", "Impacto", "Mitigación"],
      ["Falta de full text en fuentes centrales", "Debilita marco teórico final", "Buscar OA/manual legal/reemplazo antes de redacción final"],
      ["Datos técnicos insuficientes", "Limita modelamiento", "Definir supuestos y escenarios mínimos"],
      ["Modelo demasiado complejo", "Riesgo de inviabilidad", "Priorizar MVP metodológico y validación por fases"],
      ["Interpretación normativa", "Conclusiones no generalizables", "Presentar como plan académico, no diagnóstico definitivo"],
    ],
    traceability: [
      ["Código", "Fuente", "Rol", "Profundidad", "Uso permitido"],
      ...references.map((reference) => [
        reference.code,
        reference.title,
        reference.role.join(", ") || "context_background",
        reference.evidence_depth,
        reference.full_text_required_before_final_framework ? "Requiere full text para marco teórico final" : "Usable para plan",
      ]),
    ],
  };
}

function decide(pack: ThesisPlanReadinessPack): Pick<ThesisPlanBlueprint, "decision" | "warnings" | "blockers"> {
  if (pack.blockers.length > 0 || pack.decision === "BLOCKED_INSUFFICIENT_CONTENT" || pack.decision === "NEEDS_USER_INPUT" || pack.decision === "NEEDS_SOURCE_REPLACEMENT") {
    return { decision: "BLOCKED", warnings: pack.warnings, blockers: pack.blockers.length ? pack.blockers : ["Readiness no permite blueprint limpio."] };
  }
  if (pack.decision === "NEEDS_TARGETED_DEEP_RESEARCH") {
    return { decision: "NEEDS_TARGETED_DEEP_RESEARCH", warnings: pack.warnings, blockers: [] };
  }
  if (pack.warnings.length > 0 || pack.decision === "READY_FOR_THESIS_PLAN_WITH_WARNINGS") {
    return { decision: "BLUEPRINT_READY_WITH_WARNINGS", warnings: pack.warnings, blockers: [] };
  }
  return { decision: "BLUEPRINT_READY", warnings: [], blockers: [] };
}

function markdown(blueprint: ThesisPlanBlueprint) {
  const lines = [
    `# Thesis Plan Blueprint — ${blueprint.project_id}`,
    "",
    `Decision: **${blueprint.decision}**`,
    `Readiness: ${blueprint.readiness.decision}`,
    `BlueprintVersion: ${blueprint.persisted_blueprint_version_id ?? "not persisted"}`,
    "",
    "## Sections",
    ...blueprint.sections.map((section) => `- ${section.title} (${section.key}) — ${section.status_from_readiness}; min: ${section.min_words ?? section.target_words}; sources: ${section.source_ids.length}`),
    "",
    "## Source roles",
    ...blueprint.references.map((reference) => `- ${reference.code}: ${reference.title} — ${reference.role.join(", ") || "context"}; ${reference.evidence_depth}`),
    "",
    "## Warnings",
    ...(blueprint.warnings.length ? blueprint.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Blockers",
    ...(blueprint.blockers.length ? blueprint.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
  ];
  return `${lines.join("\n")}\n`;
}

export async function runMvpThesisPlanBlueprint(input: { userId: string; projectId: string; runId?: string; persist?: boolean }) {
  const runId = input.runId ?? `mvp-thesis-plan-blueprint-${randomUUID()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-thesis-plan-blueprint", input.projectId, runId);
  await mkdir(artifactDir, { recursive: true });

  const project = await loadProjectBundle(input.userId, input.projectId);
  if (!project || !project.intake) throw new Error("Proyecto o intake no encontrado.");

  const pack = await runMvpThesisPlanReadiness({ userId: input.userId, projectId: input.projectId });
  const decision = decide(pack);
  const sections = buildSections(pack, project);
  const references = buildReferences(project, pack.source_roles);
  const coreTables = buildCoreTables({ pack, project, references });

  let persistedBlueprintVersionId: string | null = null;
  const blueprintBase = {
    artifact_type: "mvp_thesis_plan_blueprint" as const,
    artifact_version: "v1" as const,
    generated_at: new Date().toISOString(),
    project_id: input.projectId,
    run_id: runId,
    artifact_dir: artifactDir,
    decision: decision.decision,
    persisted_blueprint_version_id: null,
    readiness: {
      run_id: pack.run_id,
      artifact_dir: pack.artifact_dir,
      decision: pack.decision,
      warnings: pack.warnings,
      blockers: pack.blockers,
    },
    document_contract: {
      positioning: "academic_planning_assistant" as const,
      document_kind: "thesis_plan_preliminary" as const,
      final_thesis_disclaimer: "Este documento es un plan académico preliminar y trazable; no sustituye la tesis final ni la lectura completa de fuentes centrales.",
      full_text_policy: "El plan puede usar abstracts/red bibliográfica; el marco teórico final requiere full text o texto autorizado equivalente para fuentes centrales.",
    },
    project_context: {
      title: project.title,
      program: project.program,
      degree_level: project.degreeLevel,
      university: project.university ?? "",
      country: project.country,
      language: project.language,
      topic: project.intake.topic,
      problem_context: project.intake.problemContext,
      research_line: project.intake.researchLine,
      target_population: project.intake.targetPopulation,
      available_data: project.intake.availableData,
      preferred_methodology: project.intake.preferredMethodology,
      academic_constraints: project.intake.academicConstraints,
      advisor_notes: project.intake.advisorNotes,
    },
    source_roles: pack.source_roles,
    sections,
    core_tables: coreTables,
    references,
    qa_plan: {
      minimum_sections: sections.length,
      section_word_minimums_required: true,
      cite_selected_sources_only: true,
      traceability_annex_required: true,
      warn_on_abstract_only_central_sources: true,
      expected_docx_tables_min: 8,
      expected_docx_annexes_min: 1,
    },
    warnings: unique(decision.warnings),
    blockers: unique(decision.blockers),
  } satisfies Omit<ThesisPlanBlueprint, "persisted_blueprint_version_id"> & { persisted_blueprint_version_id: null };

  if (input.persist !== false && decision.decision !== "BLOCKED") {
    const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
    const created = await prisma.blueprintVersion.create({
      data: {
        projectId: project.id,
        versionNumber,
        model: "deterministic-readiness-blueprint",
        promptVersion: PROMPT_VERSION,
        intakeSnapshotJson: project.intake as unknown as Prisma.InputJsonValue,
        selectedReferencesSnapshotJson: references as unknown as Prisma.InputJsonValue,
        blueprintJson: blueprintBase as unknown as Prisma.InputJsonValue,
        coherenceReportJson: {
          passed: decision.decision !== "NEEDS_TARGETED_DEEP_RESEARCH",
          decision: decision.decision,
          warnings: decision.warnings,
          blockers: decision.blockers,
          generatedBy: "mvp-thesis-plan-blueprint-service",
        } as Prisma.InputJsonValue,
        exportStatus: ExportStatus.PENDING,
      },
    });
    persistedBlueprintVersionId = created.id;
    await prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.BLUEPRINT_READY },
    });
  }

  const blueprint: ThesisPlanBlueprint = {
    ...blueprintBase,
    persisted_blueprint_version_id: persistedBlueprintVersionId,
  };

  await writeFile(path.join(artifactDir, "thesis-plan-blueprint.json"), `${JSON.stringify(blueprint, null, 2)}\n`, "utf8");
  await writeFile(path.join(artifactDir, "thesis-plan-blueprint-summary.md"), markdown(blueprint), "utf8");

  await logAuditEvent({
    eventType: "MVP_THESIS_PLAN_BLUEPRINT_COMPLETED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: {
      run_id: runId,
      artifact_dir: artifactDir,
      decision: blueprint.decision,
      readiness_run_id: pack.run_id,
      persisted_blueprint_version_id: persistedBlueprintVersionId,
      section_count: sections.length,
      warning_count: blueprint.warnings.length,
      blocker_count: blueprint.blockers.length,
    } as Prisma.InputJsonValue,
  });

  return blueprint;
}
