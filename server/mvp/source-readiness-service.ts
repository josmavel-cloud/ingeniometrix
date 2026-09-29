import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { extractSearchTerms, normalizeTitle } from "@/lib/text";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";
import { withLlmUsageContext } from "@/server/llm-usage-registry";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import { runMvpSourceInspection, type MvpSourceInspectionResult } from "@/server/mvp/source-inspection-service";
import { asStepRunJson, createMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

export const MVP_SOURCE_READINESS_KEY = "step_4_source_readiness";
export const MVP_SOURCE_READINESS_PROMPT_VERSION = "ingeniometrix-source-readiness-v2";

export type SourceReadinessRole = "CENTRAL" | "METHODOLOGICAL" | "CONTEXT" | "BACKGROUND" | "REPLACE";
export type SourceReadinessDecision =
  | "READY_FOR_THESIS_PLAN_WITH_WARNINGS"
  | "NEEDS_MORE_SOURCES"
  | "NEEDS_DEEP_RESEARCH_LIGHT"
  | "NEEDS_SOURCE_REPLACEMENT";

export type SourceReadinessItem = {
  source_id: string;
  title: string;
  year: number | null;
  venue: string | null;
  doi: string | null;
  openalex_id: string | null;
  relevance_score: number | null;
  abstract_available: boolean;
  pdf_available: boolean;
  pdf_url: string | null;
  open_access_status: string | null;
  citation_count: number | null;
  selected_by_user: boolean;
  source_health: MvpSourceInspectionResult["items"][number]["source_health"] | "not_inspected";
  allowed_evidence_use: MvpSourceInspectionResult["items"][number]["allowed_evidence_use"] | "pending";
  role: SourceReadinessRole;
  role_confidence: number;
  why_useful: string;
  limitations: string[];
  frontend_label: string;
  recommended_action: "ACCEPT_AS_CENTRAL" | "ACCEPT_AS_CONTEXT" | "REVIEW_PDF" | "REPLACE" | "DISCARD";
};

export type SourceReadinessPack = {
  artifact_type: "mvp_source_readiness_pack";
  artifact_version: "v1";
  generated_at: string;
  project_id: string;
  run_id: string;
  artifact_dir: string;
  intake_final: {
    topic: string;
    problem_context: string | null;
    methodology: string | null;
    target_population: string | null;
  };
  selected_source_count: number;
  central_source_count: number;
  pdf_source_count: number;
  abstract_source_count: number;
  decision: SourceReadinessDecision;
  coverage: {
    covered: string[];
    partially_covered: string[];
    missing: string[];
    dimension_scores: Array<{ dimension: string; status: "covered" | "partial" | "missing"; evidence_source_ids: string[] }>;
  };
  deep_research_light: {
    recommended: boolean;
    reason: string;
    suggested_queries: string[];
    must_return_to_step: "Paso 3";
  };
  frontend_cable: {
    step: "Cable #4";
    title: string;
    user_actions: string[];
    default_recommendation: string;
  };
  warnings: string[];
  blockers: string[];
  items: SourceReadinessItem[];
  inspection: {
    run_id: string;
    decision: MvpSourceInspectionResult["decision"];
    artifact_dir: string;
  };
  api_usage: {
    run_id: string;
    report: Awaited<ReturnType<typeof buildMvpApiUsageReport>>;
  };
};

type SelectedReference = Awaited<ReturnType<typeof loadSelectedReferences>>[number];

const roleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "coverage", "decision", "warnings", "deep_research_light"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_id", "role", "role_confidence", "why_useful", "limitations", "frontend_label", "recommended_action"],
        properties: {
          source_id: { type: "string", minLength: 8, maxLength: 80 },
          role: { type: "string", enum: ["CENTRAL", "METHODOLOGICAL", "CONTEXT", "BACKGROUND", "REPLACE"] },
          role_confidence: { type: "number", minimum: 0, maximum: 1 },
          why_useful: { type: "string", minLength: 10, maxLength: 520 },
          limitations: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", minLength: 5, maxLength: 220 } },
          frontend_label: { type: "string", minLength: 5, maxLength: 120 },
          recommended_action: { type: "string", enum: ["ACCEPT_AS_CENTRAL", "ACCEPT_AS_CONTEXT", "REVIEW_PDF", "REPLACE", "DISCARD"] },
        },
      },
    },
    coverage: {
      type: "object",
      additionalProperties: false,
      required: ["covered", "partially_covered", "missing", "dimension_scores"],
      properties: {
        covered: { type: "array", maxItems: 12, items: { type: "string", minLength: 3, maxLength: 120 } },
        partially_covered: { type: "array", maxItems: 12, items: { type: "string", minLength: 3, maxLength: 120 } },
        missing: { type: "array", maxItems: 12, items: { type: "string", minLength: 3, maxLength: 120 } },
        dimension_scores: {
          type: "array",
          minItems: 4,
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["dimension", "status", "evidence_source_ids"],
            properties: {
              dimension: { type: "string", minLength: 3, maxLength: 120 },
              status: { type: "string", enum: ["covered", "partial", "missing"] },
              evidence_source_ids: { type: "array", maxItems: 6, items: { type: "string", minLength: 8, maxLength: 80 } },
            },
          },
        },
      },
    },
    decision: { type: "string", enum: ["READY_FOR_THESIS_PLAN_WITH_WARNINGS", "NEEDS_MORE_SOURCES", "NEEDS_DEEP_RESEARCH_LIGHT", "NEEDS_SOURCE_REPLACEMENT"] },
    warnings: { type: "array", maxItems: 8, items: { type: "string", minLength: 5, maxLength: 240 } },
    deep_research_light: {
      type: "object",
      additionalProperties: false,
      required: ["recommended", "reason", "suggested_queries"],
      properties: {
        recommended: { type: "boolean" },
        reason: { type: "string", minLength: 10, maxLength: 360 },
        suggested_queries: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 5, maxLength: 180 } },
      },
    },
  },
} satisfies Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pdfSignal(raw: unknown) {
  const record = asRecord(raw);
  const primary = asRecord(record?.primary_location);
  const best = asRecord(record?.best_oa_location);
  const openAccess = asRecord(record?.open_access);
  const pdfUrl =
    (typeof primary?.pdf_url === "string" && primary.pdf_url.trim()) ||
    (typeof best?.pdf_url === "string" && best.pdf_url.trim()) ||
    null;
  return {
    pdf_available: Boolean(pdfUrl),
    pdf_url: pdfUrl,
    open_access_status: typeof openAccess?.oa_status === "string" ? openAccess.oa_status : null,
  };
}

function abstractText(reference: SelectedReference["reference"]) {
  return reference.abstract?.replace(/\s+/g, " ").trim() ?? "";
}

async function loadSelectedReferences(projectId: string) {
  return prisma.projectReference.findMany({
    where: { projectId, selected: true },
    include: { reference: true },
    orderBy: [{ selectedOrder: "asc" }, { relevanceScore: "desc" }, { createdAt: "asc" }],
  });
}

async function loadProject(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { intake: true },
  });
}

function compactDimension(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function deterministicDimensions(input: {
  topic: string;
  problemContext: string | null;
  methodology: string | null;
  targetPopulation: string | null;
  references: SelectedReference[];
}) {
  const topicTerms = extractSearchTerms(input.topic, { maxTerms: 4, minLength: 4 });
  const objectTerms = extractSearchTerms(input.targetPopulation, { maxTerms: 3, minLength: 4 });
  const methodTerms = extractSearchTerms(input.methodology, { maxTerms: 3, minLength: 4 });
  const contextTerms = extractSearchTerms(input.problemContext, { maxTerms: 3, minLength: 5 });
  const sourceTerms = input.references.flatMap((item) =>
    extractSearchTerms([item.reference.title, item.reference.abstract].filter(Boolean).join(" "), {
      maxTerms: 3,
      minLength: 5,
    }),
  );
  const recurringSourceTerms = [...new Set(sourceTerms)]
    .map((term) => ({
      term,
      count: sourceTerms.filter((candidate) => candidate === term).length,
    }))
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term))
    .map((item) => item.term)
    .slice(0, 3);

  return [
    topicTerms.length ? `core topic: ${topicTerms.join(" ")}` : "core topic",
    objectTerms.length ? `object/population: ${objectTerms.join(" ")}` : "object of study",
    methodTerms.length ? `methodology: ${methodTerms.join(" ")}` : "methodology",
    contextTerms.length ? `context/problem: ${contextTerms.join(" ")}` : "context/problem",
    recurringSourceTerms.length ? `recurring source signals: ${recurringSourceTerms.join(" ")}` : "recurring source signals",
    "source access and inspectability",
  ].map(compactDimension);
}

function dimensionStatus(dimension: string, references: SelectedReference[]) {
  const terms = normalizeTitle(dimension).split(" / ").flatMap((part) => part.split(/\s+/)).filter((term) => term.length >= 4);
  const evidence = references.filter((item) => {
    const text = normalizeTitle([item.reference.title, item.reference.abstract, item.reference.venue].filter(Boolean).join(" "));
    return terms.some((term) => text.includes(term));
  });
  return {
    dimension,
    status: evidence.length >= 2 ? "covered" as const : evidence.length === 1 ? "partial" as const : "missing" as const,
    evidence_source_ids: evidence.map((item) => item.referenceId).slice(0, 6),
  };
}

function fallbackAnalysis(input: {
  references: SelectedReference[];
  topic: string;
  problemContext: string | null;
  methodology: string | null;
  targetPopulation: string | null;
}) {
  const dimension_scores = deterministicDimensions(input).map((dimension) => dimensionStatus(dimension, input.references));
  const covered = dimension_scores.filter((item) => item.status === "covered").map((item) => item.dimension);
  const partially_covered = dimension_scores.filter((item) => item.status === "partial").map((item) => item.dimension);
  const missing = dimension_scores.filter((item) => item.status === "missing").map((item) => item.dimension);
  return {
    items: input.references.map((item, index) => ({
      source_id: item.referenceId,
      role: index < 2 ? "CENTRAL" as const : "CONTEXT" as const,
      role_confidence: 0.65,
      why_useful: "Fuente seleccionada por el usuario con metadata/abstract disponible para sustentar el paquete inicial de evidencia.",
      limitations: ["Rol asignado por fallback deterministico; requiere revisión humana."],
      frontend_label: index < 2 ? "Fuente central candidata" : "Fuente de contexto candidata",
      recommended_action: index < 2 ? "ACCEPT_AS_CENTRAL" as const : "ACCEPT_AS_CONTEXT" as const,
    })),
    coverage: { covered, partially_covered, missing, dimension_scores },
    decision: missing.length > 1 ? "NEEDS_DEEP_RESEARCH_LIGHT" as const : "READY_FOR_THESIS_PLAN_WITH_WARNINGS" as const,
    warnings: missing.map((dimension) => `Cobertura faltante: ${dimension}`),
    deep_research_light: {
      recommended: missing.length > 0,
      reason: missing.length > 0 ? `Reparar huecos: ${missing.join(", ")}` : "Cobertura suficiente para plan preliminar con advertencias.",
      suggested_queries: missing.length > 0 ? missing.map((dimension) => `${dimension} ${input.topic}`.slice(0, 170)) : [`${input.topic} source verification`],
    },
  };
}

function buildPrompt(input: {
  topic: string;
  problemContext: string | null;
  methodology: string | null;
  targetPopulation: string | null;
  references: SelectedReference[];
  dimensions: string[];
}) {
  const refs = input.references.map((item) => {
    const pdf = pdfSignal(item.reference.rawOpenAlexJson);
    return {
      source_id: item.referenceId,
      title: item.reference.title,
      year: item.reference.year,
      venue: item.reference.venue,
      doi: item.reference.doi,
      relevance_score: item.relevanceScore,
      abstract: abstractText(item.reference).slice(0, 1600),
      pdf_available: pdf.pdf_available,
      open_access_status: pdf.open_access_status,
      citation_count: item.reference.citationCount,
    };
  });
  return `
Eres un evaluador academico para Ingeniometrix. No redactes tesis. Clasifica fuentes seleccionadas por el usuario para un plan de tesis trazable.

Intake final:
- Tema: ${input.topic}
- Problema: ${input.problemContext ?? "N/A"}
- Metodologia: ${input.methodology ?? "N/A"}
- Objeto/poblacion: ${input.targetPopulation ?? "N/A"}

Dimensiones de cobertura derivadas del intake y del pool seleccionado:
${input.dimensions.map((dimension) => `- ${dimension}`).join("\n")}

Fuentes seleccionadas:
${JSON.stringify(refs, null, 2)}

Reglas:
- Usa los source_id exactamente como aparecen en Fuentes seleccionadas.
- coverage.dimension_scores[].evidence_source_ids solo puede contener source_id reales de Fuentes seleccionadas.
- Deep Research no es citable; solo debe recomendarse para reparar huecos y devolver candidatos al Paso 3.
- Para plan de tesis basta metadata + abstract + grafo + señales de acceso con warnings.
- Para marco teorico final, fuentes centrales requieren full text/PDF autorizado.
`.trim();
}

type ReadinessAnalysis = ReturnType<typeof fallbackAnalysis>;

function sanitizeCoverage(analysis: ReadinessAnalysis, references: SelectedReference[], warnings: string[]): ReadinessAnalysis {
  const validIds = new Set(references.map((item) => item.referenceId));
  let removedInvalidEvidenceIds = 0;
  const dimension_scores = analysis.coverage.dimension_scores.map((item) => {
    const evidenceIds = item.evidence_source_ids.filter((id) => {
      const valid = validIds.has(id);
      if (!valid) removedInvalidEvidenceIds += 1;
      return valid;
    });
    return {
      ...item,
      status: evidenceIds.length >= 2 ? "covered" as const : evidenceIds.length === 1 ? "partial" as const : "missing" as const,
      evidence_source_ids: evidenceIds,
    };
  });
  if (removedInvalidEvidenceIds > 0) {
    warnings.push("Se descartaron IDs de evidencia no pertenecientes a las fuentes seleccionadas en la cobertura LLM.");
  }
  return {
    ...analysis,
    coverage: {
      covered: dimension_scores.filter((item) => item.status === "covered").map((item) => item.dimension),
      partially_covered: dimension_scores.filter((item) => item.status === "partial").map((item) => item.dimension),
      missing: dimension_scores.filter((item) => item.status === "missing").map((item) => item.dimension),
      dimension_scores,
    },
  };
}

function mergeItems(references: SelectedReference[], inspection: MvpSourceInspectionResult, llmItems: ReturnType<typeof fallbackAnalysis>["items"]): SourceReadinessItem[] {
  const inspectionById = new Map(inspection.items.map((item) => [item.source_id, item]));
  const roleById = new Map(llmItems.map((item) => [item.source_id, item]));
  return references.map((item) => {
    const access = pdfSignal(item.reference.rawOpenAlexJson);
    const inspected = inspectionById.get(item.referenceId);
    const role = roleById.get(item.referenceId) ?? {
      source_id: item.referenceId,
      role: "CONTEXT" as const,
      role_confidence: 0.5,
      why_useful: "Fuente seleccionada por el usuario; requiere clasificación humana adicional.",
      limitations: ["Rol de respaldo aplicado por ausencia de análisis específico."],
      frontend_label: "Fuente candidata",
      recommended_action: "ACCEPT_AS_CONTEXT" as const,
    };
    return {
      source_id: item.referenceId,
      title: item.reference.title,
      year: item.reference.year,
      venue: item.reference.venue,
      doi: item.reference.doi,
      openalex_id: item.reference.openAlexId,
      relevance_score: item.relevanceScore,
      abstract_available: Boolean(item.reference.abstract?.trim()),
      pdf_available: access.pdf_available || Boolean(inspected?.pdf_available_signal),
      pdf_url: inspected?.resolved_pdf_url ?? access.pdf_url,
      open_access_status: access.open_access_status,
      citation_count: item.reference.citationCount,
      selected_by_user: item.selected,
      source_health: inspected?.source_health ?? "not_inspected",
      allowed_evidence_use: inspected?.allowed_evidence_use ?? "pending",
      role: role.role,
      role_confidence: role.role_confidence,
      why_useful: role.why_useful,
      limitations: role.limitations,
      frontend_label: role.frontend_label,
      recommended_action: role.recommended_action,
    };
  });
}

function markdown(pack: SourceReadinessPack) {
  const lines = [
    "# MVP Source Readiness Pack",
    "",
    `- project_id: ${pack.project_id}`,
    `- run_id: ${pack.run_id}`,
    `- decision: ${pack.decision}`,
    `- selected_source_count: ${pack.selected_source_count}`,
    `- central_source_count: ${pack.central_source_count}`,
    `- pdf_source_count: ${pack.pdf_source_count}`,
    `- abstract_source_count: ${pack.abstract_source_count}`,
    "",
    "## Coverage",
    `- covered: ${pack.coverage.covered.join(", ") || "none"}`,
    `- partially_covered: ${pack.coverage.partially_covered.join(", ") || "none"}`,
    `- missing: ${pack.coverage.missing.join(", ") || "none"}`,
    "",
    "## Sources",
    ...pack.items.flatMap((item) => [
      `### ${item.title}`,
      `- role: ${item.role} (${item.role_confidence})`,
      `- action: ${item.recommended_action}`,
      `- year/venue: ${item.year ?? "s/f"} / ${item.venue ?? "sin venue"}`,
      `- doi: ${item.doi ?? "N/A"}`,
      `- score: ${item.relevance_score ?? "N/A"}`,
      `- abstract/pdf: ${item.abstract_available ? "sí" : "no"} / ${item.pdf_available ? "sí" : "no"}`,
      `- health/use: ${item.source_health} / ${item.allowed_evidence_use}`,
      `- useful: ${item.why_useful}`,
      `- limitations: ${item.limitations.join("; ")}`,
      "",
    ]),
    "## Deep Research Light",
    `- recommended: ${pack.deep_research_light.recommended}`,
    `- reason: ${pack.deep_research_light.reason}`,
    ...pack.deep_research_light.suggested_queries.map((query) => `- query: ${query}`),
    "",
    "## Front-end Cable #4",
    `- ${pack.frontend_cable.default_recommendation}`,
    ...pack.frontend_cable.user_actions.map((action) => `- ${action}`),
  ];
  return `${lines.join("\n")}\n`;
}

export async function runMvpSourceReadiness(input: { userId: string; projectId: string; model?: string; runId?: string }): Promise<SourceReadinessPack> {
  const runId = input.runId ?? `mvp-source-readiness-${randomUUID()}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-source-readiness", input.projectId, runId);
  const artifactManifestPath = path.join(artifactDir, "source-readiness-pack.json");
  const startedAt = new Date();
  const requestedModel = input.model ?? process.env.SOURCE_READINESS_MODEL?.trim() ?? "gpt-5.4-mini";
  await mkdir(artifactDir, { recursive: true });
  const usageBefore = await captureMvpApiUsageSnapshot();
  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: MVP_SOURCE_READINESS_KEY,
    status: "RUNNING",
    provider: Provider.SYSTEM,
    model: requestedModel,
    promptVersion: MVP_SOURCE_READINESS_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({
      project_id: input.projectId,
      run_id: runId,
    }),
    artifactDir,
    artifactManifestPath,
  });

  await logAuditEvent({
    eventType: "MVP_SOURCE_READINESS_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: runId,
      step_run_id: stepRun.id,
      step_key: MVP_SOURCE_READINESS_KEY,
      prompt_version: MVP_SOURCE_READINESS_PROMPT_VERSION,
      requested_model: requestedModel,
      started_at: startedAt.toISOString(),
      artifact_dir: artifactDir,
      artifact_manifest_path: artifactManifestPath,
    }),
  });

  const warnings: string[] = [];
  const errors: string[] = [];
  let provider: Provider = Provider.SYSTEM;

  try {
    const project = await loadProject(input.projectId);
    const intake = project.intake;
    const topic = intake?.topic ?? project.topicSeedText ?? project.title;
    const problemContext = intake?.problemContext ?? null;
    const methodology = intake?.preferredMethodology ?? null;
    const targetPopulation = intake?.targetPopulation ?? null;
    const selectedReferences = await loadSelectedReferences(input.projectId);
    if (selectedReferences.length === 0) {
      throw new Error("Paso 4 requiere fuentes seleccionadas por el usuario desde el Cable #3.");
    }

    const inspection = await runMvpSourceInspection({ userId: input.userId, projectId: input.projectId, runId: `${runId}-inspection` });
    const dimensions = deterministicDimensions({
      topic,
      problemContext,
      methodology,
      targetPopulation,
      references: selectedReferences,
    });
    const fallback = fallbackAnalysis({
      references: selectedReferences,
      topic,
      problemContext,
      methodology,
      targetPopulation,
    });
    let analysis = fallback;

    try {
      analysis = await withLlmUsageContext(
        { projectId: input.projectId, userId: input.userId, runId, stage: "source_readiness", source: "runMvpSourceReadiness" },
        async () => generateStructuredObjectWithTextFallback<typeof fallback>({
          provider: getConfiguredLlmProvider(),
          prompt: buildPrompt({
            topic,
            problemContext,
            methodology,
            targetPopulation,
            references: selectedReferences,
            dimensions,
          }),
          schemaName: "mvp_source_readiness_pack",
          schema: roleSchema,
          model: requestedModel,
          trackingAttribution: { projectId: input.projectId, userId: input.userId, runId, stage: "source_readiness", source: "runMvpSourceReadiness" },
        }),
      );
      provider = Provider.OPENAI;
    } catch (error) {
      analysis = fallback;
      provider = Provider.SYSTEM;
      warnings.push("No se pudo clasificar fuentes con LLM; se entrega análisis determinístico degradado.");
      errors.push(error instanceof Error ? error.message : "Fallo desconocido en readiness LLM.");
    }

    analysis = sanitizeCoverage(analysis, selectedReferences, warnings);
    const items = mergeItems(selectedReferences, inspection, analysis.items);
    const centralCount = items.filter((item) => item.role === "CENTRAL" || item.recommended_action === "ACCEPT_AS_CENTRAL").length;
    const pdfCount = items.filter((item) => item.pdf_available).length;
    const abstractCount = items.filter((item) => item.abstract_available).length;
    warnings.push(...(analysis.warnings ?? []), ...inspection.warnings);
    const blockers = inspection.blockers;
    const decision: SourceReadinessDecision = blockers.length > 0
      ? "NEEDS_SOURCE_REPLACEMENT"
      : analysis.decision;

    const pack: SourceReadinessPack = {
      artifact_type: "mvp_source_readiness_pack",
      artifact_version: "v1",
      generated_at: new Date().toISOString(),
      project_id: input.projectId,
      run_id: runId,
      artifact_dir: artifactDir,
      intake_final: {
        topic,
        problem_context: problemContext,
        methodology,
        target_population: targetPopulation,
      },
      selected_source_count: items.length,
      central_source_count: centralCount,
      pdf_source_count: pdfCount,
      abstract_source_count: abstractCount,
      decision,
      coverage: analysis.coverage,
      deep_research_light: {
        recommended: analysis.deep_research_light.recommended || analysis.coverage.missing.length > 0,
        reason: analysis.deep_research_light.reason,
        suggested_queries: analysis.deep_research_light.suggested_queries,
        must_return_to_step: "Paso 3",
      },
      frontend_cable: {
        step: "Cable #4",
        title: "Revisión de readiness de fuentes seleccionadas",
        user_actions: [
          "Aceptar paquete con advertencias y pasar a blueprint del plan de tesis",
          "Pedir Deep Research Light para reparar huecos; candidatos vuelven a Paso 3",
          "Pedir 5 fuentes más enfocadas en huecos",
          "Marcar una fuente como contexto/reemplazo/descartar",
          "Subir PDF autorizado para fuentes centrales",
        ],
        default_recommendation: analysis.deep_research_light.recommended
          ? "Reparar huecos con Deep Research Light antes de blueprint si se busca mayor robustez."
          : "Puede avanzar a blueprint con advertencias y trazabilidad.",
      },
      warnings: [...new Set(warnings)],
      blockers,
      items,
      inspection: { run_id: inspection.run_id, decision: inspection.decision, artifact_dir: inspection.artifact_dir },
      api_usage: {
        run_id: runId,
        report: await buildMvpApiUsageReport({ before: usageBefore, label: "mvp_source_readiness", filter: { projectId: input.projectId, since: usageBefore.capturedAt } }),
      },
    };

    await writeFile(artifactManifestPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
    await writeFile(path.join(artifactDir, "source-readiness-summary.md"), markdown(pack), "utf8");
    const completedAt = new Date();
    await updateMvpStepRun(stepRun.id, {
      status: decision === "NEEDS_SOURCE_REPLACEMENT" ? "PARTIALLY_COMPLETED" : "COMPLETED",
      provider,
      model: provider === Provider.OPENAI ? requestedModel : null,
      promptVersion: MVP_SOURCE_READINESS_PROMPT_VERSION,
      outputSnapshotJson: asStepRunJson(pack),
      warningsJson: asStepRunJson(pack.warnings),
      errorsJson: asStepRunJson(errors.length ? errors : blockers),
      fallbackUsed: provider !== Provider.OPENAI,
      artifactDir,
      artifactManifestPath,
      finishedAt: completedAt,
    });
    await logAuditEvent({
      eventType: "MVP_SOURCE_READINESS_COMPLETED",
      actorType: ActorType.SYSTEM,
      provider,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: runId,
        step_run_id: stepRun.id,
        decision,
        selected_source_count: items.length,
        coverage: pack.coverage,
        warnings: pack.warnings,
        blockers,
        api_usage_delta: pack.api_usage.report.filtered_delta,
        artifact_manifest_path: artifactManifestPath,
      }),
    });

    return pack;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : "Fallo desconocido en readiness de fuentes.";
    errors.push(message);
    await updateMvpStepRun(stepRun.id, {
      status: "FAILED",
      provider,
      model: provider === Provider.OPENAI ? requestedModel : null,
      promptVersion: MVP_SOURCE_READINESS_PROMPT_VERSION,
      errorsJson: asStepRunJson(errors),
      fallbackUsed: provider !== Provider.OPENAI,
      artifactDir,
      artifactManifestPath,
      finishedAt: completedAt,
    });
    await logAuditEvent({
      eventType: "MVP_SOURCE_READINESS_FAILED",
      actorType: ActorType.SYSTEM,
      provider,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: runId,
        step_run_id: stepRun.id,
        errors,
        completed_at: completedAt.toISOString(),
      }),
    });
    throw error;
  }
}
