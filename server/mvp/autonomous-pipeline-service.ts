import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { ActorType, DegreeLevel, Prisma, ProjectStatus, Provider, TemplateKey, TopicOriginType, TopicSelectionStatus, University } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { MAX_SELECTED_REFERENCES, MIN_SELECTED_REFERENCES } from "@/lib/research-workflow";
import { normalizeTitle } from "@/lib/text";
import { logAuditEvent } from "@/server/audit/audit-service";
import { runMvpBibliographicMap, type BibliographicMapResult } from "@/server/mvp/bibliographic-map-service";
import { normalizeIntakeForMvpProject, type NormalizedMvpIntake } from "@/server/mvp/intake-normalization-service";
import { runMvpSourceDiscovery } from "@/server/mvp/source-discovery-service";
import { runMvpSourceReadiness, type SourceReadinessPack } from "@/server/mvp/source-readiness-service";
import { runMvpEvidenceInformedTopicRefinement, type ImprovedIntakeAlternative, type TopicRefinementResult } from "@/server/mvp/topic-refinement-service";
import { buildQualityGate, type AutonomousQualityGate, iterateQualityGate } from "@/server/mvp/autonomous-pipeline-quality";
import type { IntakeInput } from "@/server/projects/project-validation";
import { saveIntakeForProject } from "@/server/projects/project-service";
import { listProjectReferences, updateSelectedProjectReferences } from "@/server/retrieval/reference-service";

export type SimulatedFrontendDecision = {
  step: "STEP_1_NORMALIZED_INTAKE_CONFIRM" | "STEP_2_FINAL_INTAKE_CHOICE" | "STEP_3_SOURCE_SELECTION_OR_MORE" | "STEP_5_DEEP_RESEARCH_GAP_REPAIR" | "STEP_6_CRITICAL_PDF_MISSING";
  decision_source: "AUTO_SIMULATED";
  decision: string;
  reason: string;
  confidence: number;
  discarded_alternatives: string[];
  created_at: string;
};

export type CitationInstance = {
  source_id: string;
  citation_key: string;
  inline_citation: string;
  evidence_basis: "FULL_TEXT_OR_PDF" | "ABSTRACT_METADATA" | "VERIFIED_METADATA_ONLY";
  planned_uses: string[];
};

export type ReferenceListEntry = {
  source_id: string;
  citation_key: string;
  apa_like: string;
  doi: string | null;
  url: string | null;
};

export type AutonomousPipelineResult = {
  ok: boolean;
  run_id: string;
  project_id: string;
  artifact_dir: string;
  manifest_path: string;
  final_docx_path: string | null;
  final_quality: AutonomousQualityGate | null;
  decisions: SimulatedFrontendDecision[];
  quality_gates: AutonomousQualityGate[];
  warnings: string[];
  blockers: string[];
};

export const BRIDGE_CPR_INTAKE: IntakeInput = {
  topic: "Comportamiento dinámico post-sismo de un puente arco de concreto armado mediante vibraciones inducidas por tránsito vehicular",
  problemContext:
    "Se desea evaluar el comportamiento dinámico post-sismo de un puente arco de concreto armado usando vibraciones inducidas por tránsito vehicular. El método Contact-Point Response (CPR) registrará aceleraciones desde vehículos instrumentados y se modelará el puente en SAP2000. El objetivo es desarrollar una metodología rápida y económica para detectar daño estructural en puentes rurales sin usar sensores permanentes.",
  researchLine: "Ingeniería estructural, dinámica de puentes, monitoreo de salud estructural, evaluación post-sismo, identificación modal indirecta y modelamiento numérico.",
  academicConstraints:
    "Distinguir detección preliminar de daño y diagnóstico concluyente; no reemplaza inspección profesional ni dictamen de seguridad. Requiere trazabilidad entre fuentes, modelos y supuestos.",
  targetPopulation: "Puentes arco de concreto armado en zonas rurales expuestos a eventos sísmicos, con acceso vehicular suficiente para mediciones móviles.",
  availableData: "Registros de aceleración de vehículos instrumentados, parámetros geométricos y estructurales del puente, modelo SAP2000, escenarios post-sismo simulados o medidos y condiciones de tránsito controladas.",
  preferredMethodology: "Metodología cuantitativa aplicada con modelamiento en SAP2000, simulación de escenarios de daño, extracción de respuesta en punto de contacto vehículo-puente y comparación de indicadores dinámicos pre/post-sismo.",
  advisorNotes: "Priorizar literatura sobre indirect bridge monitoring, contact-point response, vehicle scanning method, bridge health monitoring, post-earthquake bridge assessment, vehicle-induced vibration, concrete arch bridges y finite element model updating.",
};

export const DIVERSE_MVP_INTAKES: IntakeInput[] = [
  {
    topic: "Confiabilidad sísmica de pórticos de concreto armado mediante FORM y simulación Monte Carlo",
    problemContext: "Se busca comparar índices de confiabilidad y probabilidad de falla en pórticos de concreto armado sometidos a demanda sísmica incierta, incorporando curvas de capacidad, variables aleatorias de resistencia y demanda, y validación cruzada entre FORM y Monte Carlo.",
    researchLine: "Ingeniería sísmica, confiabilidad estructural, métodos probabilísticos y simulación.",
    academicConstraints: "Incluir ecuaciones, tablas de variables aleatorias y advertencias sobre supuestos de distribución y correlación.",
    targetPopulation: "Pórticos de concreto armado de edificaciones urbanas de mediana altura.",
    availableData: "Parámetros estructurales, espectros de diseño, distribuciones de resistencia, resultados de análisis no lineal y simulaciones.",
    preferredMethodology: "Comparación cuantitativa FORM/Monte Carlo con matrices de variables, ecuaciones de estado límite e interpretación de beta.",
    advisorNotes: "Priorizar fuentes sobre reliability index, seismic fragility, limit state functions, FORM, Monte Carlo y reinforced concrete frames.",
  },
  {
    topic: "Clasificación de riesgo crediticio para microempresas usando aprendizaje automático explicable",
    problemContext: "Se requiere evaluar modelos de machine learning para predecir incumplimiento crediticio en microempresas con énfasis en interpretabilidad, métricas de desempeño y uso responsable de datos financieros.",
    researchLine: "Ciencia de datos aplicada, finanzas, aprendizaje automático explicable.",
    academicConstraints: "Incluir matriz de confusión, métricas F1/AUC/recall y advertencias de sesgo y privacidad.",
    targetPopulation: "Carteras de microcrédito de instituciones financieras o cooperativas.",
    availableData: "Variables socioeconómicas, historial de pagos, montos, plazos, morosidad y etiquetas de default anonimizadas.",
    preferredMethodology: "Comparación de regresión logística, random forest y gradient boosting con SHAP o importancia de variables.",
    advisorNotes: "Buscar credit scoring, explainable AI, imbalanced classification, microfinance y model fairness.",
  },
  {
    topic: "Modelo epidemiológico SEIR para evaluar estrategias de vacunación en brotes respiratorios urbanos",
    problemContext: "Se pretende modelar la transmisión de un brote respiratorio en población urbana y comparar escenarios de vacunación, sensibilidad de parámetros y efectos sobre incidencia acumulada.",
    researchLine: "Salud pública, modelamiento matemático, epidemiología computacional.",
    academicConstraints: "Incluir ecuaciones diferenciales, tabla de parámetros y límites de inferencia por datos agregados.",
    targetPopulation: "Población urbana segmentada por grupos etarios.",
    availableData: "Series de casos, tasas de contacto, cobertura de vacunación, hospitalizaciones y parámetros publicados.",
    preferredMethodology: "Modelo SEIR determinista con escenarios, calibración básica y análisis de sensibilidad.",
    advisorNotes: "Priorizar SEIR, vaccination strategies, respiratory outbreaks, sensitivity analysis y public health modeling.",
  },
  {
    topic: "Efectos de tutoría virtual sobre permanencia universitaria en estudiantes de primer año",
    problemContext: "Se busca analizar si un programa de tutoría virtual mejora la permanencia académica y el sentido de pertenencia en estudiantes ingresantes, considerando factores socioeconómicos y uso de plataforma.",
    researchLine: "Educación superior, tecnología educativa, permanencia estudiantil.",
    academicConstraints: "Evitar causalidad fuerte si no hay diseño experimental; citar teorías de integración académica y social.",
    targetPopulation: "Estudiantes universitarios de primer año en modalidad presencial/híbrida.",
    availableData: "Encuestas de satisfacción, registros LMS, asistencia a tutorías, notas y permanencia semestral.",
    preferredMethodology: "Diseño cuantitativo correlacional o cuasi experimental con análisis multivariado.",
    advisorNotes: "Buscar student retention, online tutoring, first-year experience, engagement, higher education.",
  },
  {
    topic: "Optimización de inventarios hospitalarios de medicamentos esenciales con demanda incierta",
    problemContext: "Se necesita proponer un modelo de reposición que reduzca quiebres de stock y sobreinventario en medicamentos esenciales, considerando demanda incierta, criticidad clínica y restricciones presupuestarias.",
    researchLine: "Investigación de operaciones, logística sanitaria, gestión hospitalaria.",
    academicConstraints: "Incluir tablas de variables, indicadores de servicio/costo y advertencias sobre datos sensibles hospitalarios.",
    targetPopulation: "Farmacias hospitalarias de establecimientos públicos o privados.",
    availableData: "Consumos históricos, lead time, costos, niveles de servicio, stock mínimo y fechas de vencimiento.",
    preferredMethodology: "Modelo cuantitativo de inventarios probabilísticos, simulación discreta o programación matemática.",
    advisorNotes: "Buscar healthcare inventory, essential medicines, stochastic demand, service level, hospital pharmacy.",
  },
];

export const FINAL_VALIDATION_INTAKES: IntakeInput[] = [
  {
    topic: "Diseño de un sistema de visión computacional para detección de fisuras en pavimentos con métricas de segmentación",
    problemContext: "Se busca formular una investigación aplicada que compare modelos de segmentación para detectar fisuras en pavimentos a partir de imágenes, reportando IoU, Dice, precisión, recall y ejemplos visuales.",
    researchLine: "Visión computacional, mantenimiento vial, inteligencia artificial aplicada.",
    academicConstraints: "Debe stress-testear imágenes, tablas de métricas y trazabilidad de datasets sin afirmar desempeño no medido.",
    targetPopulation: "Imágenes de pavimentos urbanos capturadas con cámara móvil o datasets públicos.",
    availableData: "Imágenes etiquetadas, máscaras de fisuras, particiones train/validation/test y métricas de segmentación.",
    preferredMethodology: "Comparación de U-Net, DeepLab o modelos livianos, con matriz de resultados y análisis de errores.",
    advisorNotes: "Buscar pavement crack detection, semantic segmentation, IoU, Dice coefficient, road maintenance.",
  },
  {
    topic: "Memoria colectiva y prácticas de duelo en comunidades desplazadas por conflicto interno",
    problemContext: "Se pretende analizar cómo las comunidades desplazadas construyen memoria colectiva y prácticas de duelo, considerando testimonios, rituales, espacios de conmemoración y tensiones con narrativas oficiales.",
    researchLine: "Ciencias sociales, memoria, estudios culturales, desplazamiento forzado.",
    academicConstraints: "Debe ser citation-heavy, ético con testimonios, sin revictimización ni extracción de datos sensibles.",
    targetPopulation: "Comunidades desplazadas y organizaciones de memoria en contextos latinoamericanos.",
    availableData: "Entrevistas autorizadas, archivos públicos, documentos comunitarios y literatura académica.",
    preferredMethodology: "Diseño cualitativo interpretativo con análisis temático y triangulación documental.",
    advisorNotes: "Buscar collective memory, mourning practices, forced displacement, transitional justice, Latin America.",
  },
];

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeSlug(value: string) {
  return normalizeTitle(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "mvp";
}

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function png1x1() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

async function ensureProject(input: { userEmail: string; projectId?: string; intake?: IntakeInput; runId: string }) {
  const user = await prisma.user.upsert({
    where: { email: input.userEmail },
    create: { email: input.userEmail, name: "MVP Autonomous Pipeline", locale: "es-PE" },
    update: { name: "MVP Autonomous Pipeline", locale: "es-PE" },
  });

  if (input.projectId) {
    const existing = await prisma.project.findFirst({ where: { id: input.projectId }, include: { intake: true } });
    if (existing) return { userId: existing.userId, projectId: existing.id, reused: true };
  }

  const intake = input.intake ?? BRIDGE_CPR_INTAKE;
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      status: ProjectStatus.DRAFT,
      title: `${intake.topic.slice(0, 140)} (${input.runId})`,
      country: "PE",
      language: "es",
      degreeLevel: DegreeLevel.MAESTRIA,
      university: University.OTHER,
      program: "Programa de posgrado - MVP autónomo",
      templateKey: TemplateKey.GENERIC_POSGRADO_PE,
      topicOriginType: TopicOriginType.CUSTOM,
      topicSelectionStatus: TopicSelectionStatus.SELECTED,
      topicSeedText: intake.topic,
      topicAreaLabel: "Área inferida automáticamente",
    },
  });
  await saveIntakeForProject(user.id, project.id, intake);
  return { userId: user.id, projectId: project.id, reused: false };
}

function chooseAlternative(refinement: TopicRefinementResult): ImprovedIntakeAlternative {
  return (
    refinement.alternatives.find((item) => item.option_id === refinement.recommended_option_id) ??
    refinement.alternatives.find((item) => item.strategy === "balanceada") ??
    refinement.alternatives[0]
  );
}

function makeDecision(input: Omit<SimulatedFrontendDecision, "decision_source" | "created_at">): SimulatedFrontendDecision {
  return { ...input, decision_source: "AUTO_SIMULATED", created_at: new Date().toISOString() };
}

async function persistDecision(input: { userId: string; projectId: string; artifactDir: string; decisions: SimulatedFrontendDecision[]; decision: SimulatedFrontendDecision }) {
  input.decisions.push(input.decision);
  await writeJson(path.join(input.artifactDir, `decision-${input.decisions.length}-${input.decision.step}.json`), input.decision);
  await logAuditEvent({
    eventType: `MVP_AUTONOMOUS_${input.decision.step}`,
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asJson(input.decision),
  });
}

async function selectReferences(input: { userId: string; projectId: string; map?: BibliographicMapResult; readiness?: SourceReadinessPack }) {
  const listed = await listProjectReferences(input.userId, input.projectId);
  const readinessBad = new Set((input.readiness?.items ?? []).filter((item) => item.recommended_action === "REPLACE" || item.recommended_action === "DISCARD").map((item) => item.source_id));
  const preferred = [
    ...(input.map?.selection_guidance.recommended_reference_ids ?? []),
    ...listed.filter((item) => !readinessBad.has(item.referenceId)).sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)).map((item) => item.referenceId),
  ];
  const unique = Array.from(new Set(preferred)).filter(Boolean).slice(0, MAX_SELECTED_REFERENCES);
  const selected = unique.slice(0, Math.max(MIN_SELECTED_REFERENCES, Math.min(unique.length, 6)));
  if (selected.length >= MIN_SELECTED_REFERENCES) await updateSelectedProjectReferences(input.userId, input.projectId, selected);
  return selected;
}

function scoreBibliographicMap(map: BibliographicMapResult) {
  const crossRefs = map.sources.reduce((sum, source) => sum + source.cross_references.cited_by_sample.length + source.cross_references.referenced_works_sample.length + source.cross_references.related_works_sample.length, 0);
  const recommended = map.selection_guidance.recommended_reference_ids.length;
  const score = Math.min(map.sources.length, 8) * 7 + Math.min(crossRefs, 18) * 2 + Math.min(recommended, 5) * 6 + Math.min(map.field_map.recurring_concepts.length, 8) * 2;
  return buildQualityGate({
    name: "step_3_bibliographic_map_and_source_selection",
    attempt: 1,
    score,
    threshold: 70,
    metrics: { sources: map.sources.length, cross_references: crossRefs, recommended_sources: recommended },
    warnings: map.selection_guidance.warnings,
    blockers: map.sources.length < MIN_SELECTED_REFERENCES ? ["Insufficient candidates for autonomous selection."] : [],
  });
}

function scoreReadiness(readiness: SourceReadinessPack, attempt: number) {
  const missing = readiness.coverage.missing.length;
  const partial = readiness.coverage.partially_covered.length;
  const central = readiness.central_source_count;
  const pdf = readiness.pdf_source_count;
  const abstracts = readiness.abstract_source_count;
  const score = central * 18 + pdf * 10 + abstracts * 5 - missing * 10 - partial * 3 - readiness.blockers.length * 20;
  const readyEnough = readiness.decision === "READY_FOR_THESIS_PLAN_WITH_WARNINGS" || (central >= 2 && pdf >= 2 && abstracts >= MIN_SELECTED_REFERENCES);
  return buildQualityGate({
    name: "step_4_source_readiness",
    attempt,
    score: readyEnough ? Math.max(75, score) : score,
    threshold: 75,
    metrics: { selected: readiness.selected_source_count, central, pdf, abstracts, missing_dimensions: missing, partial_dimensions: partial, decision: readiness.decision },
    warnings: readiness.warnings,
    blockers: [
      ...readiness.blockers,
      ...(readyEnough ? [] : [`Readiness decision ${readiness.decision} is below clean final-thesis evidence threshold.`]),
    ],
  });
}

async function runGapRepair(input: { userId: string; projectId: string; readiness: SourceReadinessPack; attempt: number; artifactDir: string }) {
  const gaps = [...input.readiness.coverage.missing, ...input.readiness.coverage.partially_covered].slice(0, 5);
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, include: { intake: true } });
  const topic = project?.intake?.topic ?? project?.title ?? "research topic";
  const queries = input.readiness.deep_research_light.suggested_queries.length
    ? input.readiness.deep_research_light.suggested_queries
    : gaps.map((gap) => `${topic} ${gap} review methodology`).slice(0, 5);
  const repair = {
    artifact_type: "mvp_deep_research_light_gap_repair",
    artifact_version: "v1",
    candidate_only: true,
    citable: false,
    reason: "Deep Research is simulated as strategic query/candidate planning only. Candidates must return to Step 3/OpenAlex/Crossref verification before citation.",
    gaps,
    suggested_queries: queries,
    verification_loop: "runMvpSourceDiscovery(batchKind=more) + reference verification + source readiness",
  };
  await writeJson(path.join(input.artifactDir, `gap-repair-attempt-${input.attempt}.json`), repair);
  await runMvpSourceDiscovery(input.userId, input.projectId, { desiredTotal: MAX_SELECTED_REFERENCES, batchKind: "more" });
  return repair;
}

async function buildCitationLedger(input: { userId: string; projectId: string; artifactDir: string; readiness: SourceReadinessPack | null }) {
  const selected = await prisma.projectReference.findMany({
    where: { projectId: input.projectId, selected: true },
    include: { reference: true },
    orderBy: [{ selectedOrder: "asc" }, { relevanceScore: "desc" }],
  });
  const readinessById = new Map((input.readiness?.items ?? []).map((item) => [item.source_id, item] as const));
  const citations: CitationInstance[] = selected.map((item, index) => {
    const ref = item.reference;
    const raw = ref.rawOpenAlexJson as { primary_location?: { pdf_url?: string | null } | null; best_oa_location?: { pdf_url?: string | null } | null } | null;
    const hasPdf = Boolean(raw?.primary_location?.pdf_url || raw?.best_oa_location?.pdf_url || readinessById.get(ref.id)?.pdf_available);
    const hasAbstract = Boolean(ref.abstract?.trim());
    return {
      source_id: ref.id,
      citation_key: `S${index + 1}`,
      inline_citation: `(${(Array.isArray(ref.authorsJson) ? ref.authorsJson[0] : "Autor") ?? "Autor"}, ${ref.year ?? "s. f."})`,
      evidence_basis: hasPdf ? "FULL_TEXT_OR_PDF" : hasAbstract ? "ABSTRACT_METADATA" : "VERIFIED_METADATA_ONLY",
      planned_uses: [readinessById.get(ref.id)?.role ?? "BACKGROUND", "marco teórico", "discusión metodológica"],
    };
  });
  const references: ReferenceListEntry[] = selected.map((item, index) => {
    const ref = item.reference;
    const authors = Array.isArray(ref.authorsJson) && ref.authorsJson.length ? ref.authorsJson.slice(0, 6).join(", ") : "Autor no identificado";
    const doi = ref.doi ? ref.doi.replace("https://doi.org/", "") : null;
    return {
      source_id: ref.id,
      citation_key: `S${index + 1}`,
      apa_like: `${authors} (${ref.year ?? "s. f."}). ${ref.title}. ${ref.venue ?? "Publicación académica"}.${doi ? ` https://doi.org/${doi}` : ref.landingPageUrl ? ` ${ref.landingPageUrl}` : ""}`.replace(/\s+/g, " ").trim(),
      doi,
      url: ref.landingPageUrl,
    };
  });
  const ledger = { artifact_type: "mvp_citation_manager_ledger", artifact_version: "v1", citations, references };
  await writeJson(path.join(input.artifactDir, "citation-ledger.json"), ledger);
  return ledger;
}

function buildTheoreticalFramework(input: { normalized: NormalizedMvpIntake | null; readiness: SourceReadinessPack | null; citationLedger: Awaited<ReturnType<typeof buildCitationLedger>> }) {
  const topic = input.normalized?.normalizedTopic ?? input.readiness?.intake_final.topic ?? "tema de investigación";
  const concepts = input.normalized?.retrievalHints.coreConcepts ?? [];
  const methodTerms = input.normalized?.retrievalHints.methodTerms ?? [];
  const objectTerms = input.normalized?.retrievalHints.objectTerms ?? [];
  const central = input.readiness?.items.filter((item) => item.role === "CENTRAL" || item.role === "METHODOLOGICAL").slice(0, 5) ?? [];
  const cite = input.citationLedger.citations.slice(0, 4).map((item) => item.inline_citation).join("; ") || "(fuentes verificadas)";
  const paragraphs = [
    `El marco teórico preliminar para ${topic} debe conectar tres niveles: el objeto de estudio (${objectTerms.join(", ") || "unidad de análisis"}), los constructos centrales (${concepts.join(", ") || "conceptos principales"}) y la ruta metodológica (${methodTerms.join(", ") || "métodos declarados"}). Esta organización evita que la revisión sea una lista de fuentes y la convierte en una cadena argumental verificable ${cite}.`,
    `Las fuentes centrales se usan con una jerarquía ética de evidencia: los textos con PDF o full text autorizado sostienen definiciones, relaciones teóricas y procedimientos; los abstracts y metadatos verificados solo respaldan mapeo preliminar, relevancia temática o decisiones de búsqueda. Los candidatos de Deep Research Light no son citables hasta pasar por verificación bibliográfica y revisión de fuente.`,
    `Para el diseño metodológico, el marco debe traducir la literatura en variables, indicadores, supuestos, limitaciones y criterios de calidad. En temas con ecuaciones, imágenes, matrices o tablas, dichos elementos se incluyen como artefactos explicativos planificados y no como resultados empíricos inventados.`,
  ];
  const sourceNotes = central.map((item) => `${item.title}: ${item.why_useful} Limitación: ${item.limitations.join("; ")}`);
  return { artifact_type: "mvp_theoretical_framework", artifact_version: "v1", topic, paragraphs, source_notes: sourceNotes };
}

async function writeHeroAssets(input: { artifactDir: string; topic: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="500" viewBox="0 0 1400 500"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="1400" height="500" fill="url(#g)"/><circle cx="1160" cy="130" r="190" fill="#38bdf8" opacity="0.18"/><path d="M120 360 C260 210 390 300 520 180 S820 120 980 250" stroke="#f8fafc" stroke-width="16" fill="none" opacity="0.85"/><text x="90" y="105" fill="#f8fafc" font-family="Arial" font-size="52" font-weight="700">Ingeniometrix MVP</text><text x="92" y="170" fill="#dbeafe" font-family="Arial" font-size="30">Pipeline autónomo con evidencia trazable</text><text x="92" y="425" fill="#e0f2fe" font-family="Arial" font-size="24">${input.topic.replace(/[<&>]/g, " ").slice(0, 95)}</text></svg>`;
  const svgPath = path.join(input.artifactDir, "hero-fallback.svg");
  await writeFile(svgPath, svg, "utf8");
  return { svgPath, prompt: `High-quality academic hero image, no lab/internal references, topic: ${input.topic}` };
}

async function writeFinalDocx(input: {
  projectId: string;
  artifactDir: string;
  normalized: NormalizedMvpIntake | null;
  readiness: SourceReadinessPack | null;
  citationLedger: Awaited<ReturnType<typeof buildCitationLedger>>;
  framework: ReturnType<typeof buildTheoreticalFramework>;
  decisions: SimulatedFrontendDecision[];
  qualityGates: AutonomousQualityGate[];
}) {
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, include: { intake: true } });
  const topic = input.normalized?.normalizedTopic ?? project?.intake?.topic ?? project?.title ?? "Plan de investigación";
  const hero = await writeHeroAssets({ artifactDir: input.artifactDir, topic });
  const border = { top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" }, bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" }, left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" }, right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" } };
  const rows = [
    ["Dimensión", "Estado", "Fuentes"],
    ...(input.readiness?.coverage.dimension_scores ?? []).map((item) => [item.dimension, item.status, item.evidence_source_ids.join(", ") || "pendiente"]),
  ];
  const doc = new Document({
    creator: "Ingeniometrix MVP Autonomous Pipeline",
    title: topic,
    description: "Documento académico generado con evidencia trazable y decisiones AUTO_SIMULATED.",
    sections: [{
      properties: {},
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "INGENIOMETRIX", bold: true, size: 44, color: "0F172A" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Plan de tesis MVP — evidencia trazable", italics: true, size: 24, color: "0369A1" })] }),
        new Paragraph({ text: topic, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: png1x1(), transformation: { width: 620, height: 30 }, type: "png" })] }),
        new Paragraph({ text: "Resumen ejecutivo", heading: HeadingLevel.HEADING_1 }),
        new Paragraph(`Este documento consolida el MVP autónomo backend-first: intake normalizado, selección simulada de decisiones frontend, fuentes verificadas, reparación de gaps candidate-only, marco teórico básico, ledger de citas y QA final. No contiene referencias a Lab ni usa Deep Research como fuente citable.`),
        new Paragraph({ text: "Problema y alcance", heading: HeadingLevel.HEADING_1 }),
        new Paragraph(clean(project?.intake?.problemContext) || "Contexto del problema pendiente de ampliar."),
        new Paragraph({ text: "Marco teórico preliminar", heading: HeadingLevel.HEADING_1 }),
        ...input.framework.paragraphs.map((text) => new Paragraph(text)),
        new Paragraph({ text: "Notas de fuentes centrales", heading: HeadingLevel.HEADING_2 }),
        ...input.framework.source_notes.slice(0, 8).map((text) => new Paragraph({ text, bullet: { level: 0 } })),
        new Paragraph({ text: "Metodología propuesta", heading: HeadingLevel.HEADING_1 }),
        new Paragraph(clean(project?.intake?.preferredMethodology) || "Metodología pendiente de precisar."),
        new Paragraph("La metodología debe validar supuestos, registrar procedencia de datos y separar diseño académico de resultados empíricos. Para productos finales, las fuentes centrales requieren full text o equivalente autorizado."),
        new Paragraph({ text: "Matriz de cobertura de evidencia", heading: HeadingLevel.HEADING_1 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((row) => new TableRow({ children: row.map((cell) => new TableCell({ borders: border, children: [new Paragraph(cell)] })) })) }),
        new Paragraph({ text: "Gestión de citas", heading: HeadingLevel.HEADING_1 }),
        ...input.citationLedger.citations.map((item) => new Paragraph({ text: `${item.citation_key}: ${item.inline_citation} — base: ${item.evidence_basis}; usos: ${item.planned_uses.join(", ")}`, bullet: { level: 0 } })),
        new Paragraph({ text: "Decisiones simuladas", heading: HeadingLevel.HEADING_1 }),
        ...input.decisions.map((item) => new Paragraph({ text: `${item.step}: ${item.decision} (${Math.round(item.confidence * 100)}%). ${item.reason}`, bullet: { level: 0 } })),
        new Paragraph({ text: "Referencias", heading: HeadingLevel.HEADING_1 }),
        ...input.citationLedger.references.map((item) => new Paragraph(`${item.citation_key}. ${item.apa_like}`)),
        new Paragraph({ text: "Anexos de trazabilidad", heading: HeadingLevel.HEADING_1 }),
        new Paragraph(`Hero SVG fallback: ${hero.svgPath}`),
        new Paragraph(`Quality gates: ${input.qualityGates.map((gate) => `${gate.name}=${gate.score_100}`).join("; ")}`),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  const docxPath = path.join(input.artifactDir, `${safeSlug(topic)}-autonomous-mvp.docx`);
  await writeFile(docxPath, buffer);
  const qa = buildQualityGate({
    name: "step_10_final_docx_qa",
    attempt: 1,
    score: 40 + input.citationLedger.references.length * 8 + input.framework.paragraphs.length * 8 + input.decisions.length * 3,
    threshold: 75,
    metrics: { references: input.citationLedger.references.length, framework_paragraphs: input.framework.paragraphs.length, decisions: input.decisions.length, hero_svg: Boolean(hero.svgPath) },
    warnings: input.citationLedger.citations.some((item) => item.evidence_basis !== "FULL_TEXT_OR_PDF") ? ["Some citations are planned from abstract/metadata only; final thesis framework requires full text for central claims."] : [],
  });
  await writeJson(path.join(input.artifactDir, "final-docx-qa.json"), qa);
  return { docxPath, qa, hero };
}

export async function runAutonomousMvpPipeline(input?: { userEmail?: string; projectId?: string; intake?: IntakeInput; label?: string; maxAttempts?: number }) {
  const runId = `mvp-autonomous-${input?.label ? `${safeSlug(input.label)}-` : ""}${nowStamp()}-${randomUUID().slice(0, 8)}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", "mvp-autonomous-pipeline", runId);
  await mkdir(artifactDir, { recursive: true });
  const decisions: SimulatedFrontendDecision[] = [];
  const qualityGates: AutonomousQualityGate[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  let finalDocxPath: string | null = null;
  let finalQuality: AutonomousQualityGate | null = null;

  const { userId, projectId, reused } = await ensureProject({ userEmail: input?.userEmail ?? "mvp-autonomous@ingeniometrix.local", projectId: input?.projectId, intake: input?.intake, runId });

  await logAuditEvent({ eventType: "MVP_AUTONOMOUS_PIPELINE_STARTED", actorType: ActorType.SYSTEM, provider: Provider.SYSTEM, userId, projectId, payloadJson: asJson({ runId, artifactDir, reused }) });

  let normalized: NormalizedMvpIntake | null = null;
  try {
    const step1 = await normalizeIntakeForMvpProject({ userId, projectId });
    normalized = step1.normalized;
    await writeJson(path.join(artifactDir, "step-1-normalized-intake.json"), step1);
    await runMvpSourceDiscovery(userId, projectId, { desiredTotal: MIN_SELECTED_REFERENCES, batchKind: "initial" });
    await persistDecision({ userId, projectId, artifactDir, decisions, decision: makeDecision({ step: "STEP_1_NORMALIZED_INTAKE_CONFIRM", decision: "CONFIRM_NORMALIZED_INTAKE", reason: "Normalized intake preserved the topic intent and preliminary OpenAlex/Crossref discovery did not technically fail.", confidence: normalized.knowledgeArea.confidence, discarded_alternatives: ["Ask human to rewrite intake", "Restart topic discovery"] }) });

    const refinement = await runMvpEvidenceInformedTopicRefinement({ userId, projectId });
    await writeJson(path.join(artifactDir, "step-2-topic-refinement.json"), refinement);
    const selectedAlternative = chooseAlternative(refinement);
    await saveIntakeForProject(userId, projectId, selectedAlternative.suggested_intake);
    await persistDecision({ userId, projectId, artifactDir, decisions, decision: makeDecision({ step: "STEP_2_FINAL_INTAKE_CHOICE", decision: selectedAlternative.option_id, reason: `Selected ${selectedAlternative.strategy} option with feasibility ${selectedAlternative.feasibility_score_100}, novelty ${selectedAlternative.novelty_score_100}, evidence ${selectedAlternative.evidence_coverage_score_100}.`, confidence: Math.min(0.95, Math.max(0.55, selectedAlternative.evidence_coverage_score_100 / 100)), discarded_alternatives: refinement.alternatives.filter((item) => item.option_id !== selectedAlternative.option_id).map((item) => `${item.option_id}: ${item.title}`) }) });

    const step3Loop = await iterateQualityGate<BibliographicMapResult>({
      name: "step_3",
      maxAttempts: input?.maxAttempts ?? 5,
      runAttempt: async (attempt) => {
        const map = await runMvpBibliographicMap({ userId, projectId, desiredTotal: MAX_SELECTED_REFERENCES });
        const selected = await selectReferences({ userId, projectId, map });
        const gate = scoreBibliographicMap(map);
        const gateWithAttempt = { ...gate, attempt, metrics: { ...gate.metrics, selected: selected.length } };
        await writeJson(path.join(artifactDir, `step-3-bibliographic-map-attempt-${attempt}.json`), { map, selected, gate: gateWithAttempt });
        return { result: map, gate: gateWithAttempt };
      },
      onRetry: async () => { await runMvpSourceDiscovery(userId, projectId, { desiredTotal: MAX_SELECTED_REFERENCES, batchKind: "more" }); },
    });
    qualityGates.push(step3Loop.gate);
    await persistDecision({ userId, projectId, artifactDir, decisions, decision: makeDecision({ step: "STEP_3_SOURCE_SELECTION_OR_MORE", decision: step3Loop.gate.passed ? "ACCEPT_BACKEND_SELECTION" : "ACCEPT_BEST_AVAILABLE_AFTER_MAX_ATTEMPTS", reason: `Selected sources using relevance, source-health proxies and bibliographic coverage. Score ${step3Loop.gate.score_100}.`, confidence: step3Loop.gate.passed ? 0.82 : 0.58, discarded_alternatives: ["Request manual source selection", "Cite Deep Research candidates directly"] }) });

    let latestReadiness: SourceReadinessPack | null = null;
    const readinessLoop = await iterateQualityGate<SourceReadinessPack>({
      name: "step_4_to_6_readiness_gap_repair",
      maxAttempts: input?.maxAttempts ?? 5,
      runAttempt: async (attempt) => {
        const readiness = await runMvpSourceReadiness({ userId, projectId });
        latestReadiness = readiness;
        const gate = scoreReadiness(readiness, attempt);
        await writeJson(path.join(artifactDir, `step-4-source-readiness-attempt-${attempt}.json`), { readiness, gate });
        return { result: readiness, gate };
      },
      onRetry: async (attempt, readiness) => {
        await persistDecision({ userId, projectId, artifactDir, decisions, decision: makeDecision({ step: "STEP_5_DEEP_RESEARCH_GAP_REPAIR", decision: "RUN_CANDIDATE_ONLY_GAP_REPAIR", reason: `Readiness decision ${readiness.decision}; gaps: ${readiness.coverage.missing.join(", ") || "partial coverage"}.`, confidence: 0.74, discarded_alternatives: ["Cite Deep Research output", "Proceed without returning to verified Step 3"] }) });
        await runGapRepair({ userId, projectId, readiness, attempt, artifactDir });
        const map = await runMvpBibliographicMap({ userId, projectId, desiredTotal: MAX_SELECTED_REFERENCES });
        await selectReferences({ userId, projectId, map, readiness });
      },
    });
    latestReadiness = readinessLoop.result;
    qualityGates.push(readinessLoop.gate);
    if (!readinessLoop.gate.passed) {
      warnings.push(`Source readiness did not pass after ${readinessLoop.gate.attempt} attempt(s): ${readinessLoop.gate.blockers.join("; ") || latestReadiness.decision}. Final DOCX is generated as a plan-with-warnings, not as a clean final thesis evidence pack.`);
    }
    if (latestReadiness.pdf_source_count < Math.min(2, latestReadiness.central_source_count)) {
      await persistDecision({ userId, projectId, artifactDir, decisions, decision: makeDecision({ step: "STEP_6_CRITICAL_PDF_MISSING", decision: "PROCEED_WITH_WARNINGS_AND_FULLTEXT_REQUIREMENT", reason: "Critical PDF coverage is incomplete; central final-theory claims are flagged for full-text verification.", confidence: 0.61, discarded_alternatives: ["Invent unavailable full-text evidence", "Block all outputs despite sufficient metadata for plan"] }) });
    }

    const citationLedger = await buildCitationLedger({ userId, projectId, artifactDir, readiness: latestReadiness });
    const framework = buildTheoreticalFramework({ normalized, readiness: latestReadiness, citationLedger });
    await writeJson(path.join(artifactDir, "theoretical-framework.json"), framework);
    const final = await writeFinalDocx({ projectId, artifactDir, normalized, readiness: latestReadiness, citationLedger, framework, decisions, qualityGates });
    finalDocxPath = final.docxPath;
    finalQuality = final.qa;
    qualityGates.push(final.qa);
    if (!final.qa.passed) warnings.push("Final DOCX QA is below threshold; inspect final-docx-qa.json.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockers.push(message);
    await writeJson(path.join(artifactDir, "pipeline-error.json"), { message, stack: error instanceof Error ? error.stack : null });
  }

  const manifest = { artifact_type: "mvp_autonomous_pipeline_manifest", artifact_version: "v1", run_id: runId, project_id: projectId, artifact_dir: artifactDir, final_docx_path: finalDocxPath, decisions, quality_gates: qualityGates, warnings, blockers };
  const manifestPath = path.join(artifactDir, "manifest.json");
  await writeJson(manifestPath, manifest);
  await logAuditEvent({ eventType: "MVP_AUTONOMOUS_PIPELINE_COMPLETED", actorType: ActorType.SYSTEM, provider: Provider.SYSTEM, userId, projectId, payloadJson: asJson({ runId, artifactDir, ok: blockers.length === 0, finalDocxPath, warnings, blockers }) });
  return { ok: blockers.length === 0, run_id: runId, project_id: projectId, artifact_dir: artifactDir, manifest_path: manifestPath, final_docx_path: finalDocxPath, final_quality: finalQuality, decisions, quality_gates: qualityGates, warnings, blockers } satisfies AutonomousPipelineResult;
}

export async function runAutonomousMvpBatch(input: { intakes: IntakeInput[]; label: string; userEmail?: string; maxAttempts?: number }) {
  const results: AutonomousPipelineResult[] = [];
  for (const [index, intake] of input.intakes.entries()) {
    results.push(await runAutonomousMvpPipeline({ userEmail: input.userEmail ?? `mvp-autonomous-${input.label}@ingeniometrix.local`, intake, label: `${input.label}-${index + 1}`, maxAttempts: input.maxAttempts }));
  }
  return results;
}
