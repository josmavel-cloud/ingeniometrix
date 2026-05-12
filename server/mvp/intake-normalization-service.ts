import { Prisma, Provider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getConfiguredLlmProvider } from "@/llm";
import { logAuditEvent } from "@/server/audit/audit-service";
import type { IntakeInput } from "@/server/projects/project-validation";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";

export type NormalizedMvpIntake = IntakeInput & {
  normalizedTopic: string;
  knowledgeArea: {
    label: string;
    rationale: string;
    confidence: number;
  };
  retrievalHints: {
    coreConcepts: string[];
    objectTerms: string[];
    methodTerms: string[];
    localContextTerms: string[];
    excludeTerms: string[];
  };
  safetyNotes: string[];
};

const normalizedIntakeSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "topic",
    "problemContext",
    "researchLine",
    "academicConstraints",
    "targetPopulation",
    "availableData",
    "preferredMethodology",
    "advisorNotes",
    "normalizedTopic",
    "knowledgeArea",
    "retrievalHints",
    "safetyNotes",
  ],
  properties: {
    topic: { type: "string", minLength: 8, maxLength: 260 },
    problemContext: { type: "string", minLength: 20, maxLength: 1800 },
    researchLine: { type: "string", minLength: 8, maxLength: 420 },
    academicConstraints: { type: "string", minLength: 8, maxLength: 900 },
    targetPopulation: { type: "string", minLength: 8, maxLength: 520 },
    availableData: { type: "string", minLength: 8, maxLength: 700 },
    preferredMethodology: { type: "string", minLength: 8, maxLength: 520 },
    advisorNotes: { type: "string", minLength: 8, maxLength: 700 },
    normalizedTopic: { type: "string", minLength: 8, maxLength: 260 },
    knowledgeArea: {
      type: "object",
      additionalProperties: false,
      required: ["label", "rationale", "confidence"],
      properties: {
        label: { type: "string", minLength: 4, maxLength: 120 },
        rationale: { type: "string", minLength: 8, maxLength: 360 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    retrievalHints: {
      type: "object",
      additionalProperties: false,
      required: ["coreConcepts", "objectTerms", "methodTerms", "localContextTerms", "excludeTerms"],
      properties: {
        coreConcepts: { type: "array", minItems: 3, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        objectTerms: { type: "array", minItems: 2, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        methodTerms: { type: "array", minItems: 1, maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        localContextTerms: { type: "array", maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
        excludeTerms: { type: "array", maxItems: 10, items: { type: "string", minLength: 2, maxLength: 80 } },
      },
    },
    safetyNotes: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", minLength: 8, maxLength: 220 } },
  },
} satisfies Record<string, unknown>;

function compact(value: string | undefined, fallback: string) {
  return (value ?? fallback).replace(/\s+/g, " ").trim();
}

function fallbackNormalize(input: IntakeInput): NormalizedMvpIntake {
  return {
    topic: compact(input.topic, ""),
    problemContext: compact(input.problemContext, "Contexto pendiente de normalizacion."),
    researchLine: compact(input.researchLine, "Linea de investigacion por clasificar."),
    academicConstraints: compact(input.academicConstraints, "Mantener trazabilidad academica y no afirmar resultados no verificados."),
    targetPopulation: compact(input.targetPopulation, "Unidad de analisis pendiente de precision."),
    availableData: compact(input.availableData, "Datos disponibles pendientes de precision."),
    preferredMethodology: compact(input.preferredMethodology, "Metodologia pendiente de precision."),
    advisorNotes: compact(input.advisorNotes, "Priorizar fuentes academicas verificables."),
    normalizedTopic: compact(input.topic, ""),
    knowledgeArea: {
      label: "Ingenieria estructural y confiabilidad",
      rationale: "Clasificacion deterministica por terminos del intake.",
      confidence: 0.7,
    },
    retrievalHints: {
      coreConcepts: ["structural reliability", "steel bridge", "seismic reliability"],
      objectTerms: ["Warren truss", "vehicular bridge", "steel truss"],
      methodTerms: ["FORM", "Monte Carlo", "reliability index"],
      localContextTerms: ["Peru", "MTC", "seismic zone"],
      excludeTerms: ["reinforced concrete buildings", "timber", "architecture"],
    },
    safetyNotes: ["No afirmar seguridad estructural real sin planos, inspeccion y datos verificables."],
  };
}

function buildPrompt(input: IntakeInput) {
  return `
Normaliza este intake academico para que sea mas facil de procesar por un backend de busqueda de fuentes.

Reglas:
- Corrige errores menores, redundancias y ambiguedades sin cambiar la intencion del usuario.
- No inventes datos, resultados, ubicaciones exactas, normativa especifica ni conclusiones.
- Mantén el texto en español claro y tecnico.
- Fija un area de conocimiento util para taxonomia y busqueda.
- Produce pistas de recuperacion bibliografica bilingues cuando sea util.
- Mantén advertencias eticas si el caso podria confundirse con diagnostico real.

Intake original:
- topic: ${input.topic}
- problemContext: ${input.problemContext ?? ""}
- researchLine: ${input.researchLine ?? ""}
- academicConstraints: ${input.academicConstraints ?? ""}
- targetPopulation: ${input.targetPopulation ?? ""}
- availableData: ${input.availableData ?? ""}
- preferredMethodology: ${input.preferredMethodology ?? ""}
- advisorNotes: ${input.advisorNotes ?? ""}
`.trim();
}

export async function normalizeIntakeForMvpProject(input: {
  userId: string;
  projectId: string;
  model?: string;
}) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    include: { intake: true },
  });

  if (!project?.intake) {
    throw new Error("Proyecto no encontrado o sin intake para normalizar.");
  }

  const original: IntakeInput = {
    topic: project.intake.topic,
    problemContext: project.intake.problemContext ?? undefined,
    researchLine: project.intake.researchLine ?? undefined,
    academicConstraints: project.intake.academicConstraints ?? undefined,
    targetPopulation: project.intake.targetPopulation ?? undefined,
    availableData: project.intake.availableData ?? undefined,
    preferredMethodology: project.intake.preferredMethodology ?? undefined,
    advisorNotes: project.intake.advisorNotes ?? undefined,
  };

  let normalized: NormalizedMvpIntake;
  let source: "llm" | "fallback" = "llm";
  const model = input.model ?? process.env.INTAKE_NORMALIZATION_MODEL?.trim() ?? "gpt-5.4-nano";

  try {
    const provider = getConfiguredLlmProvider();
    normalized = await generateStructuredObjectWithTextFallback<NormalizedMvpIntake>({
      provider,
      prompt: buildPrompt(original),
      schemaName: "mvp_intake_normalization",
      schema: normalizedIntakeSchema,
      model,
      trackingAttribution: {
        projectId: input.projectId,
        userId: input.userId,
        stage: "intake",
        source: "normalizeIntakeForMvpProject",
      },
    });
  } catch {
    source = "fallback";
    normalized = fallbackNormalize(original);
  }

  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      title: normalized.normalizedTopic,
      topicAreaLabel: normalized.knowledgeArea.label,
      intake: {
        update: {
          topic: normalized.topic,
          problemContext: normalized.problemContext,
          researchLine: normalized.researchLine,
          academicConstraints: normalized.academicConstraints,
          targetPopulation: normalized.targetPopulation,
          availableData: normalized.availableData,
          preferredMethodology: normalized.preferredMethodology,
          advisorNotes: normalized.advisorNotes,
        },
      },
    },
  });

  await logAuditEvent({
    eventType: "MVP_INTAKE_NORMALIZED",
    actorType: "SYSTEM",
    provider: source === "llm" ? Provider.OPENAI : Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: {
      source,
      model: source === "llm" ? model : null,
      original,
      normalized,
      db_design_note: "Initial MVP persists normalized intake in Intake fields, knowledge area in Project.topicAreaLabel, and full before/after trace in AuditLog.",
    } as Prisma.InputJsonValue,
  });

  return { source, model: source === "llm" ? model : null, original, normalized };
}
