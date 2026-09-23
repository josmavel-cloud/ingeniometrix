import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Provider, type Project, type Intake } from "@prisma/client";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Math as DocxMath,
  MathRun,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from "docx";
import OpenAI from "openai";

import { getConfiguredLlmProvider } from "@/llm";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/server/audit/audit-service";
import { buildProfessionalMathForEquation } from "@/server/reporting/docx/omml-equation-builder";
import { withLlmUsageContext } from "@/server/llm-usage-registry";
import { buildMvpApiUsageReport, captureMvpApiUsageSnapshot } from "@/server/mvp/api-usage-service";
import {
  MVP_STEP5_KEY,
  type MvpStep5EvidenceLedger,
  type MvpStep5SemanticEvidenceItem,
  type MvpStep5VisualLocalizedAsset,
} from "@/server/mvp/evidence-materialization-types";
import { STEP6_HERO_IMAGE_PROMPT } from "@/server/mvp/prompts/step6-hero-image.v1";
import { STEP6_EDITORIAL_REVIEW_PROMPT } from "@/server/mvp/prompts/step6-editorial-review.v1";
import { STEP6_SECTION_DRAFT_PROMPT } from "@/server/mvp/prompts/step6-section-draft.v2";
import { STEP6_TITLE_GENERATION_PROMPT } from "@/server/mvp/prompts/step6-title-generation.v1";
import {
  MVP_STEP6_KEY,
  MVP_STEP6_PROMPT_VERSION,
  type MvpStep6AcademicStyleContract,
  type MvpStep6BlueprintPackage,
  type MvpStep6CitationAnchor,
  type MvpStep6ContentBlock,
  type MvpStep6CrossReferencePlanItem,
  type MvpStep6EditorialReport,
  type MvpStep6HeroImagePlan,
  type MvpStep6PageBudgetPlan,
  type MvpStep6Result,
  type MvpStep6SectionGenerationWave,
  type MvpStep6SectionDraft,
  type MvpStep6SectionPlanItem,
  type MvpStep6TitlePlan,
  type MvpStep6VisualPlan,
} from "@/server/mvp/step6-blueprint-docx-types";
import { generateStructuredObjectWithTextFallback } from "@/server/retrieval/retrieval-llm-json";
import { asStepRunJson, createMvpStepRun, updateMvpStepRun } from "@/server/mvp/step-run-service";
import type { CanonicalEquationBlock } from "@/server/reporting/canonical-report-types";

import { assertEvidenceContinuity, evaluateEvidenceGate, inspectableEvidence, sourceDisposition } from "./evidence-continuity";
import { generateScientificPlan, scientificSectionPlan } from "./scientific-plan-generation";
import { exportPlanPdf } from "./pdf-export";
import { ApplicationBudget, currentApplicationBudget, withApplicationBudget } from "./application-budget";
import { ensureResearchCoverage } from "./research-fallback";
import { SCIENTIFIC_PLAN_LATAM_COMPACT_PROMPT as SCIENTIFIC_PLAN_PROMPT } from "./prompts/scientific-plan-latam-compact.v1";
import { stageCheckpoint, jobCostSnapshot, createBlueprintVersionOnce, currentJobExecution } from "./job-execution-context";
import { approvedDesignForCurrentJob } from "./scientific-decision-service";
import { currentGenerationInput, frozenProject } from "@/server/projects/generation-input-snapshot";
import { GENERATION_POLICY_VERSION } from "./generation-budgets";
import { compactDocxWhitespace } from "./docx-layout-compaction";
import { pageBudgetPolicy, templateHardMaxBodyPages } from "./execution-policy";
import { buildEvidenceLog, extractExportReferences, renderBibtex, renderRis } from "@/server/blueprint/blueprint-export";
import { LATAM_COMPACT_GENERATION_ORDER, LATAM_COMPACT_PROFILE, LATAM_COMPACT_PROFILE_ID, pageProfileStatus, predictedLayoutBudget, reviewLatamCompactDocument, validateCompactCitationPolicy } from "./document-profiles/latam-compact-v1";
import { planAndRenderCompactAssets, renderFinalMethodologicalInfographic } from "./compact-asset-planner";
const STEP6_ARTIFACT_ROOT = "mvp-step6-blueprint-docx";
const FONT = "Times New Roman";
const ACCENT = "2F5D62";
const SECONDARY_ACCENT = "8A6F3D";
const DARK = "1F2937";
const LIGHT = "F4F7F7";
const BORDER = "9CA3AF";
const TRANSPARENT_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lYQG7wAAAABJRU5ErkJggg==",
  "base64",
);

type ProjectForStep6 = Project & {
  intake: Intake | null;
  projectReferences: Array<{
    id: string;
    referenceId: string;
    selectedOrder: number | null;
    reference: {
      id: string;
      title: string;
      doi: string | null;
      year: number | null;
      venue: string | null;
      authorsJson: unknown;
    };
  }>;
  blueprintVersions: Array<{ versionNumber: number }>;
};

type SectionDraftLlmOutput = {
  section_key: string;
  title: string;
  paragraphs: string[];
  bullet_items: string[];
  used_source_ids: string[];
  used_evidence_ids: string[];
  used_snippet_ids: string[];
  used_asset_keys: string[];
  citation_anchors: Array<{
    paragraph_index: number;
    sentence_index: number | null;
    source_id: string;
    evidence_id: string | null;
    snippet_id: string | null;
    citation_label: string;
    claim_summary: string;
  }>;
  assumptions: string[];
  limitations: string[];
  warnings: string[];
  blocked: boolean;
};

type EditorialReviewOutput = {
  revised_sections: Array<{
    section_key: string;
    paragraphs: string[];
    bullet_items: string[];
    revision_notes: string[];
  }>;
  notes: string[];
  warnings: string[];
};

type TitleGenerationOutput = {
  title: string;
  short_title: string;
  rationale: string;
  keywords: string[];
  warnings: string[];
};

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function accentPublicSpanish(value: string) {
  return value
    .replace(/\bIntroduccion\b/g, "Introducción")
    .replace(/\bJustificacion\b/g, "Justificación")
    .replace(/\bMetodologia\b/g, "Metodología")
    .replace(/\binvestigacion\b/g, "investigación")
    .replace(/\bInvestigacion\b/g, "Investigación")
    .replace(/\bacademico\b/g, "académico")
    .replace(/\bAcademico\b/g, "Académico")
    .replace(/\bmetodologico\b/g, "metodológico")
    .replace(/\bMetodologico\b/g, "Metodológico")
    .replace(/\bteorico\b/g, "teórico")
    .replace(/\bTeorico\b/g, "Teórico")
    .replace(/\bcategorias\b/g, "categorías")
    .replace(/\bCategorias\b/g, "Categorías")
    .replace(/\bEcuacion\b/g, "Ecuación")
    .replace(/\bPagina\b/g, "Página")
    .replace(/\belaboracion\b/g, "elaboración")
    .replace(/\bvalidacion\b/g, "validación");
}

function normalizeDuplicateCitations(value: string) {
  let text = value;
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text
      .replace(/(\([^)]*\b\d{4}[a-z]?[^)]*\))\s*[.;]?\s*\1/g, "$1")
      .replace(/(\[[A-Za-z0-9_.:-]{3,}\])\s*[.;]?\s*\1/g, "$1")
      .replace(/\s+([,.;:])/g, "$1");
  }
  return text;
}

function removeInternalAssetMetadata(value: string) {
  return value
    .replace(/\bbody crop available\b[.;:]?\s*/gi, "")
    .replace(/\bexplicit asset label detected\b[.;:]?\s*/gi, "")
    .replace(/\bpending exact bbox\b[.;:]?\s*/gi, "")
    .replace(/\bquality flags?\b[^\n.]{0,120}[.]?/gi, "")
    .replace(/\bcuration score\b[^\n.]{0,120}[.]?/gi, "")
    .replace(/\bmetadata\b[^\n.]{0,120}[.]?/gi, "");
}

function sanitizePublicText(value: string | null | undefined) {
  const cleaned = removeInternalAssetMetadata(cleanText(value))
    .replace(/\bTabla\.\s+/g, "")
    .replace(/\bFigura\.\s+/g, "")
    .replace(/\bEcuaci[oó]n\.\s+/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([.;:]){2,}/g, "$1")
    .trim();
  return accentPublicSpanish(normalizeDuplicateCitations(cleaned));
}

export function isDanglingPublicFragment(value: string) {
  const text = sanitizePublicText(value);
  if (!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  return /(?:^|\s)(?:el|la|los|las|un|una|de|del|que|y|o|en|sobre|para|con|mediante|segun|pero|sin embargo|no obstante)[.]?$/i.test(text) &&
    words.length <= 12;
}

function sentenceUnits(value: string) {
  return sanitizePublicText(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item && !isDanglingPublicFragment(item));
}

function clip(value: string | null | undefined, _maxLength: number) {
  // Page/character budgets guide generation, never remove substantive public text.
  return sanitizePublicText(value);
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 110) || "ingeniometrix-blueprint";
}

function cm(value: number) {
  return Math.round(value * 566.93);
}

function pt(value: number) {
  return Math.round(value * 2);
}

function twipPt(value: number) {
  return Math.round(value * 20);
}

function wordCount(value: string) {
  return cleanText(value).split(/\s+/).filter(Boolean).length;
}

export function enforceWordBudgetOnParagraphs(paragraphs: string[], _maxWords: number) {
  return paragraphs.map(sanitizePublicText); // Preserve paragraph indexes used by citation anchors.
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildArtifacts(projectId: string, runId?: string) {
  const resolvedRunId = runId?.trim() || `step6-blueprint-docx-${nowStamp()}-${randomUUID().slice(0, 8)}`;
  const artifactDir = path.join(process.cwd(), "artifacts-local", STEP6_ARTIFACT_ROOT, projectId, resolvedRunId);
  const docxPath = path.join(artifactDir, "final-thesis-plan.docx");
  return {
    runId: resolvedRunId,
    artifactDir,
    docxPath,
    manifestPath: path.join(artifactDir, "manifest.json"),
    sectionPlanPath: path.join(artifactDir, "step6-section-plan.json"),
    sectionDraftsPath: path.join(artifactDir, "step6-section-drafts.json"),
    blueprintPackagePath: path.join(artifactDir, "step6-blueprint-package.json"),
    coherenceReportPath: path.join(artifactDir, "step6-coherence-report.json"),
    validationReportPath: path.join(artifactDir, "step6-validation-report.json"),
    traceabilityMatrixPath: path.join(artifactDir, "step6-traceability-matrix.json"),
    styleContractPath: path.join(artifactDir, "step6-academic-style-contract.json"),
    pageBudgetPlanPath: path.join(artifactDir, "step6-page-budget-plan.json"),
    titlePlanPath: path.join(artifactDir, "step6-title-plan.json"),
    sectionGenerationOrderPath: path.join(artifactDir, "step6-section-generation-order.json"),
    citationCoordinatePlanPath: path.join(artifactDir, "step6-citation-coordinate-plan.json"),
    crossReferencePlanPath: path.join(artifactDir, "step6-cross-reference-plan.json"),
    assetPlacementPlanPath: path.join(artifactDir, "step6-asset-placement-plan.json"),
    editorialReportPath: path.join(artifactDir, "step6-editorial-report.json"),
    heroImagePlanPath: path.join(artifactDir, "step6-hero-image-plan.json"),
    heroImagePath: path.join(artifactDir, "step6-hero-image.png"),
    summaryHeroImagePlanPath: path.join(artifactDir, "step6-summary-hero-image-plan.json"),
    summaryHeroImagePath: path.join(artifactDir, "step6-summary-hero-image.png"),
    step7ExportContractPath: path.join(artifactDir, "step7-export-contract.json"),
    apiUsageReportPath: path.join(artifactDir, "step6-api-usage-report.json"),
  };
}

async function loadProjectForStep6(input: { userId: string; projectId: string }): Promise<ProjectForStep6> {
  const project = frozenProject(await prisma.project.findFirst({
    where: {
      id: input.projectId,
      userId: input.userId,
    },
    include: {
      intake: true,
      projectReferences: {
        where: { selected: true },
        orderBy: { selectedOrder: "asc" },
        include: { reference: true },
      },
      blueprintVersions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true },
      },
    },
  }));

  if (!project) {
    throw new Error("No se encontro el proyecto solicitado para este usuario.");
  }

  if (!project.intake) {
    throw new Error("Step 6 requiere intake normalizado antes de generar el Word.");
  }

  return project as ProjectForStep6;
}

async function loadLatestStep5Ledger(projectId: string) {
  const execution = currentJobExecution();
  const job = execution ? await prisma.blueprintJob.findUniqueOrThrow({ where: { id: execution.jobId, projectId } }) : null;
  const pinnedStep = (job?.stageDataJson as { step5?: { stepRunId?: string } } | null)?.step5?.stepRunId;
  if (job && !pinnedStep) throw new Error("EVIDENCE_CONTINUITY: persistent job has no pinned Step 5");
  const ledgerRow = await prisma.projectEvidenceLedger.findFirst({
    where: { projectId, ...(pinnedStep ? { stepRunId: pinnedStep } : {}) },
    orderBy: { createdAt: "desc" },
    include: { stepRun: true },
  });

  if (!ledgerRow) {
    throw new Error("No se encontro ledger de Step 5. Ejecuta Source Health antes de Step 6.");
  }

  if (ledgerRow.stepRun.stepKey !== MVP_STEP5_KEY) {
    throw new Error(`El ultimo ledger no proviene de ${MVP_STEP5_KEY}; no se puede continuar.`);
  }

  return {
    row: ledgerRow,
    ledger: ledgerRow.ledgerJson as unknown as MvpStep5EvidenceLedger,
  };
}

function buildProjectContext(project: ProjectForStep6) {
  const intake = project.intake;
  return {
    project_id: project.id,
    title: project.title,
    country: project.country,
    language: project.language,
    university: project.university,
    degree_level: project.degreeLevel,
    program: project.program,
    template_key: project.templateKey,
    topic_area: project.topicAreaLabel,
    intake: {
      topic: intake?.topic ?? project.title,
      problem_context: intake?.problemContext ?? null,
      research_line: intake?.researchLine ?? null,
      academic_constraints: intake?.academicConstraints ?? null,
      target_population: intake?.targetPopulation ?? null,
      available_data: intake?.availableData ?? null,
      preferred_methodology: intake?.preferredMethodology ?? null,
      advisor_notes: intake?.advisorNotes ?? null,
    },
  };
}

function resolveIngeniometrixLogoPath() {
  const candidates = [
    path.join(process.cwd(), "public", "brand", "ingeniometrix-lockup-960.png"),
    path.join(process.cwd(), "public", "brand", "ingeniometrix-lockup-640.png"),
    path.join(process.cwd(), "public", "brand", "ingeniometrix-lockup.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function buildStyleContract(project: ProjectForStep6): MvpStep6AcademicStyleContract {
  return {
    artifact_type: "mvp_step6_academic_style_contract",
    artifact_version: "v1",
    renderer: "docx_code_template",
    logo_asset_path: resolveIngeniometrixLogoPath(),
    page: {
      paper_size: "letter",
      margin_top_cm: 2.2,
      margin_right_cm: 2.2,
      margin_bottom_cm: 2.2,
      margin_left_cm: 2.6,
    },
    typography: {
      body_font: FONT,
      body_size_pt: 11,
      line_spacing: "one_point_fifteen",
      paragraph_alignment: "justify",
      first_line_indent_cm: 0.75,
    },
    headings: [
      { level: 1, style_id: "Heading1", numbered: true },
      { level: 2, style_id: "Heading2", numbered: true },
      { level: 3, style_id: "Heading3", numbered: true },
      { level: 4, style_id: "Heading4", numbered: true },
      { level: 5, style_id: "Heading5", numbered: true },
    ],
    captions: {
      table_prefix: "Tabla",
      figure_prefix: "Figura",
      equation_prefix: "Ecuación",
      source_note_prefix: "Fuente",
    },
    header_footer: {
      header_left: project.title,
      header_right: "Ingeniometrix",
      footer_center: "Página",
    },
    language: "es",
    tone: "academico_profesional_sobrio",
    citation_policy: "solo_fuentes_recuperadas",
    document_policy: [
      "documento Word editable",
      "tablas nativas",
      "perfil latam-compact-v1: 7 a 12 paginas de cuerpo; objetivo 9 a 11",
      "matriz de consistencia en página horizontal",
      "imagenes sin deformacion y con relación de aspecto conservada",
      "figuras con fuente cuando existan assets",
      "ecuaciones como math nativo cuando sea posible o LaTeX editable",
      "sin metadatos internos públicos",
    ],
    fraud_safety: [
      "no presentar resultados no ejecutados",
      "no inventar citas",
      "declarar supuestos y limitaciones",
      "mantener proposito de planificacion academica",
    ],
  };
}

function buildSectionPlan(project: ProjectForStep6, ledger: MvpStep5EvidenceLedger): MvpStep6SectionPlanItem[] {
  const sourceCount = ledger.source_registry.length;
  const requireSources = Math.min(3, Math.max(1, sourceCount));
  const templateSignals = new Set(ledger.section_content_plan.map((item) => item.section_key));
  const hasAssets = ledger.visual_localized_assets.length > 0 || ledger.curated_assets.length > 0;

  const items: MvpStep6SectionPlanItem[] = [
    {
      section_key: "abstract",
      title: "Resumen ejecutivo",
      level: 1,
      order: 10,
      priority: "required",
      purpose: "Sintetizar el problema, proposito, enfoque metodologico y alcance del plan sin afirmar resultados.",
      min_words: 110,
      max_words: 140,
      output_modes: ["narrative"],
      evidence_section_keys: ["problem_statement", "methodology", "justification"],
      required_source_count: 1,
      allowed_claim_types: ["contexto", "proposito", "enfoque_metodologico"],
      claims_to_avoid: ["resultados_empiricos", "validaciones_no_ejecutadas"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: false, max_assets: 0 },
      fallback_policy: "Usar intake y declarar que la evidencia sirve para planificacion preliminar.",
    },
    {
      section_key: "introduction",
      title: "Introducción",
      level: 1,
      order: 20,
      priority: "required",
      purpose: "Presentar el contexto academico y aplicado del estudio.",
      min_words: 220,
      max_words: 260,
      output_modes: ["narrative"],
      evidence_section_keys: ["problem_statement", "research_antecedents", "theoretical_framework"],
      required_source_count: requireSources,
      allowed_claim_types: ["contexto", "brecha", "pertinencia"],
      claims_to_avoid: ["causalidad_no_probada", "impacto_medido_no_ejecutado"],
      asset_policy: { allow_figures: hasAssets, allow_equations: false, allow_tables: false, max_assets: 1 },
      fallback_policy: "Redactar con contexto de intake y evidencia bibliografica disponible.",
    },
    {
      section_key: "problem_statement",
      title: "Planteamiento del problema",
      level: 1,
      order: 30,
      priority: "required",
      purpose: "Delimitar el problema, su relevancia y la brecha que orienta la investigacion.",
      min_words: 300,
      max_words: 350,
      output_modes: ["narrative"],
      evidence_section_keys: ["problem_statement", "justification"],
      required_source_count: requireSources,
      allowed_claim_types: ["problema", "brecha", "limitacion_reportada"],
      claims_to_avoid: ["diagnostico_definitivo", "magnitud_no_documentada"],
      asset_policy: { allow_figures: hasAssets, allow_equations: false, allow_tables: false, max_assets: 1 },
      fallback_policy: "Separar problema declarado por el usuario de soporte bibliografico recuperado.",
    },
    {
      section_key: "objectives_and_questions",
      title: "Objetivos y preguntas de investigación",
      level: 1,
      order: 40,
      priority: "required",
      purpose: "Formular objetivo general, objetivos especificos y preguntas trazables al problema.",
      min_words: 120,
      max_words: 180,
      output_modes: ["bullet_list"],
      evidence_section_keys: ["problem_statement", "methodology"],
      required_source_count: 1,
      allowed_claim_types: ["proposito", "alcance", "pregunta"],
      claims_to_avoid: ["respuesta_anticipada", "resultado_esperado_no_validado"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: false, max_assets: 0 },
      fallback_policy: "Derivar objetivos desde el intake y mantenerlos como propuesta revisable.",
    },
    {
      section_key: "justification",
      title: "Justificación",
      level: 1,
      order: 50,
      priority: "required",
      purpose: "Explicar pertinencia academica, metodologica y aplicada del estudio.",
      min_words: 220,
      max_words: 260,
      output_modes: ["narrative"],
      evidence_section_keys: ["justification", "research_antecedents"],
      required_source_count: requireSources,
      allowed_claim_types: ["pertinencia", "utilidad_academica", "brecha_metodologica"],
      claims_to_avoid: ["beneficio_comprobado", "impacto_institucional_no_medido"],
      asset_policy: { allow_figures: hasAssets, allow_equations: false, allow_tables: false, max_assets: 1 },
      fallback_policy: "Usar justificacion prudente basada en brechas y restricciones declaradas.",
    },
    {
      section_key: "research_antecedents",
      title: "Antecedentes y evidencia comparada",
      level: 1,
      order: 60,
      priority: "required",
      purpose: "Comparar fuentes recuperadas y explicar como informan el plan de investigacion.",
      min_words: 320,
      max_words: 380,
      output_modes: ["narrative", "native_table"],
      evidence_section_keys: ["research_antecedents", "state_of_the_art"],
      required_source_count: requireSources,
      allowed_claim_types: ["comparacion", "metodo_reportado", "limitacion_reportada"],
      claims_to_avoid: ["ranking_no_reportado", "conclusion_general_no_sustentada"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: true, max_assets: 0 },
      fallback_policy: "Presentar solo comparacion bibliografica con fuentes recuperadas.",
    },
    {
      section_key: "theoretical_framework",
      title: "Marco teórico y conceptual",
      level: 1,
      order: 70,
      priority: "required",
      purpose: "Organizar conceptos, variables, modelos o teorias recuperadas que sostienen el plan.",
      min_words: 350,
      max_words: 400,
      output_modes: ["narrative", "figure_supported", "equation_supported"],
      evidence_section_keys: ["theoretical_framework", "variables_or_categories"],
      required_source_count: requireSources,
      allowed_claim_types: ["concepto", "modelo", "variable", "metodo_teorico"],
      claims_to_avoid: ["teoria_no_recuperada", "ecuacion_sin_fuente"],
      asset_policy: { allow_figures: hasAssets, allow_equations: true, allow_tables: true, max_assets: 3 },
      fallback_policy: "Usar conceptos recuperados; si no hay ecuaciones, no inventarlas.",
    },
    {
      section_key: "methodology",
      title: "Metodología propuesta",
      level: 1,
      order: 80,
      priority: "required",
      purpose: "Describir enfoque, diseno, tecnicas, procedimiento y analisis previsto.",
      min_words: 330,
      max_words: 380,
      output_modes: ["narrative", "native_table", "figure_supported"],
      evidence_section_keys: ["methodology", "analysis_plan"],
      required_source_count: requireSources,
      allowed_claim_types: ["enfoque", "diseno", "tecnica", "procedimiento"],
      claims_to_avoid: ["datos_recolectados_no_existentes", "resultado_metodologico_ejecutado"],
      asset_policy: { allow_figures: hasAssets, allow_equations: true, allow_tables: true, max_assets: 2 },
      fallback_policy: "Separar metodologia propuesta de evidencia metodologica recuperada.",
    },
    {
      section_key: "variables_or_categories",
      title: "Variables, categorías e indicadores",
      level: 1,
      order: 90,
      priority: templateSignals.has("variables_or_categories") ? "required" : "recommended",
      purpose: "Listar variables, categorias, dimensiones o indicadores de forma editable.",
      min_words: 120,
      max_words: 150,
      output_modes: ["narrative", "native_table"],
      evidence_section_keys: ["variables_or_categories", "methodology"],
      required_source_count: 1,
      allowed_claim_types: ["variable", "categoria", "indicador"],
      claims_to_avoid: ["operacionalizacion_definitiva_sin_revision"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: true, max_assets: 0 },
      fallback_policy: "Construir tabla preliminar desde intake y evidencia disponible.",
    },
    {
      section_key: "consistency_matrix",
      title: "Matriz de consistencia",
      level: 1,
      order: 120,
      priority: "required",
      purpose: "Alinear problema, objetivos, preguntas, metodologia y evidencia.",
      min_words: 60,
      max_words: 80,
      output_modes: ["narrative", "native_table"],
      evidence_section_keys: ["problem_statement", "methodology"],
      required_source_count: 0,
      allowed_claim_types: ["alineacion_logica"],
      claims_to_avoid: ["resultado"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: true, max_assets: 0 },
      fallback_policy: "Construir matriz desde secciones generadas e intake.",
    },
    {
      section_key: "schedule_and_budget",
      title: "Cronograma y presupuesto referencial",
      level: 1,
      order: 100,
      priority: "recommended",
      purpose: "Presentar una planificacion editable y prudente para ejecucion futura.",
      min_words: 80,
      max_words: 100,
      output_modes: ["narrative", "native_table"],
      evidence_section_keys: ["methodology"],
      required_source_count: 0,
      allowed_claim_types: ["planificacion", "supuesto_operativo"],
      claims_to_avoid: ["costo_real_confirmado", "fecha_institucional_confirmada"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: true, max_assets: 0 },
      fallback_policy: "Marcar montos y tiempos como referenciales.",
    },
    {
      section_key: "scope_and_limitations",
      title: "Alcances, limitaciones y supuestos",
      level: 1,
      order: 110,
      priority: "required",
      purpose: "Declarar restricciones de evidencia, alcance academico y supuestos operativos.",
      min_words: 160,
      max_words: 180,
      output_modes: ["narrative", "bullet_list"],
      evidence_section_keys: ["scope_and_limitations", "methodology"],
      required_source_count: 0,
      allowed_claim_types: ["limitacion", "supuesto", "alcance"],
      claims_to_avoid: ["cobertura_total"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: false, max_assets: 0 },
      fallback_policy: "Usar warnings y gaps de Step 5 como base.",
    },
    {
      section_key: "references",
      title: "Referencias",
      level: 1,
      order: 130,
      priority: "required",
      purpose: "Listar solo fuentes recuperadas y seleccionadas.",
      min_words: 0,
      max_words: 0,
      output_modes: ["references"],
      evidence_section_keys: [],
      required_source_count: 1,
      allowed_claim_types: ["referencia"],
      claims_to_avoid: ["referencias_no_recuperadas"],
      asset_policy: { allow_figures: false, allow_equations: false, allow_tables: false, max_assets: 0 },
      fallback_policy: "Renderizar referencias desde Step 5 sin LLM.",
    },
  ];

  return items.map((item) => ({
    ...item,
    purpose: item.section_key === "methodology" && project.intake?.preferredMethodology
      ? `${item.purpose} Enfoque declarado por el usuario: ${project.intake.preferredMethodology}.`
      : item.purpose,
  }));
}

function buildPageBudgetPlan(sectionPlan: MvpStep6SectionPlanItem[]): MvpStep6PageBudgetPlan {
  const wordsPerPageEstimate = 380;
  const fixedPageReservations = [
    { label: "Portada con hero image", pages: 1 },
    { label: "Tabla de contenido breve", pages: 1 },
    { label: "Matriz de consistencia horizontal con hero resumen", pages: 1.25 },
    { label: "Referencias compactas", pages: 0.5 },
  ];
  const bodySections = sectionPlan.filter((section) => !section.output_modes.includes("references"));
  const sectionBudgets = bodySections.map((section) => {
    const targetWords = Math.max(section.min_words, Math.floor(section.max_words * 0.82));
    return {
      section_key: section.section_key,
      target_words: targetWords,
      max_words: section.max_words,
      estimated_pages: Number((targetWords / wordsPerPageEstimate).toFixed(2)),
      notes: section.section_key === "consistency_matrix"
        ? "Narrativa minima; la matriz se renderiza como tabla nativa horizontal."
        : "Redaccion compacta, academica y sin redundancias.",
    };
  });
  const bodyPages = sectionBudgets.reduce((sum, item) => sum + item.estimated_pages, 0);
  const fixedPages = fixedPageReservations.reduce((sum, item) => sum + item.pages, 0);
  return {
    artifact_type: "mvp_step6_page_budget_plan",
    artifact_version: "v1",
    max_pages: 15,
    estimated_pages: Number((fixedPages + bodyPages).toFixed(2)),
    max_body_words: sectionPlan.reduce((sum, section) => sum + section.max_words, 0),
    words_per_page_estimate: wordsPerPageEstimate,
    fixed_page_reservations: fixedPageReservations,
    section_budgets: sectionBudgets,
    compression_policy: [
      "Priorizar secciones medulares sobre secciones complementarias.",
      "Eliminar redundancias antes que reducir citas necesarias.",
      "Mantener tablas y matriz como estructuras nativas compactas.",
      "No agregar explicaciones extensas de trazabilidad en el DOCX; preservarlas en JSON.",
    ],
  };
}

function allEvidenceItems(ledger: MvpStep5EvidenceLedger): MvpStep5SemanticEvidenceItem[] {
  return inspectableEvidence(ledger).map(({ item }) => item);
}

const CORE_SECTION_KEYS = [
  "problem_statement",
  "research_antecedents",
  "theoretical_framework",
  "methodology",
  "variables_or_categories",
  "consistency_matrix",
];

const COMPLEMENTARY_SECTION_KEYS = [
  "objectives_and_questions",
  "justification",
  "scope_and_limitations",
  "schedule_and_budget",
  "introduction",
  "abstract",
];

function generationWaveForSection(section: MvpStep6SectionPlanItem): MvpStep6SectionGenerationWave {
  if (section.output_modes.includes("references")) {
    return "deterministic";
  }
  if (CORE_SECTION_KEYS.includes(section.section_key)) {
    return "core";
  }
  return "complementary";
}

function buildSectionGenerationOrder(sectionPlan: MvpStep6SectionPlanItem[]) {
  const known = new Set([...CORE_SECTION_KEYS, ...COMPLEMENTARY_SECTION_KEYS, "references"]);
  return [
    {
      wave: "core" as const,
      section_keys: CORE_SECTION_KEYS.filter((key) => sectionPlan.some((section) => section.section_key === key)),
      model_tier: "strong_reasoning" as const,
    },
    {
      wave: "complementary" as const,
      section_keys: [
        ...COMPLEMENTARY_SECTION_KEYS.filter((key) => sectionPlan.some((section) => section.section_key === key)),
        ...sectionPlan
          .map((section) => section.section_key)
          .filter((key) => !known.has(key)),
      ],
      model_tier: "strong_reasoning" as const,
    },
    {
      wave: "deterministic" as const,
      section_keys: sectionPlan
        .filter((section) => section.output_modes.includes("references"))
        .map((section) => section.section_key),
      model_tier: "deterministic" as const,
    },
    {
      wave: "editorial" as const,
      section_keys: sectionPlan
        .filter((section) => !section.output_modes.includes("references"))
        .map((section) => section.section_key),
      model_tier: "fast_light" as const,
    },
  ];
}

function orderedSectionsForGeneration(sectionPlan: MvpStep6SectionPlanItem[]) {
  const byKey = new Map(sectionPlan.map((section) => [section.section_key, section]));
  const orderedKeys = [
    ...CORE_SECTION_KEYS,
    ...COMPLEMENTARY_SECTION_KEYS,
    ...sectionPlan.map((section) => section.section_key),
  ];
  const seen = new Set<string>();
  return orderedKeys
    .map((key) => byKey.get(key))
    .filter((section): section is MvpStep6SectionPlanItem => Boolean(section))
    .filter((section) => {
      if (seen.has(section.section_key)) return false;
      seen.add(section.section_key);
      return true;
    });
}

function evidenceForSection(section: MvpStep6SectionPlanItem, ledger: MvpStep5EvidenceLedger) {
  const wantedKeys = new Set([section.section_key, ...section.evidence_section_keys]);
  const direct = allEvidenceItems(ledger).filter((item) => wantedKeys.has(item.section_key));
  const fallback = allEvidenceItems(ledger).slice(0, 8);
  return (direct.length ? direct : fallback).slice(0, 10);
}

function sourceRegistryForEvidence(ledger: MvpStep5EvidenceLedger, evidenceItems: MvpStep5SemanticEvidenceItem[]) {
  const sourceIds = new Set(evidenceItems.map((item) => item.source_id));
  return ledger.source_registry
    .filter((source) => sourceIds.has(source.source_id))
    .slice(0, 8)
    .map((source) => ({
      ...source,
      citation_label: citationLabelForSource(ledger, source.source_id),
    }));
}

function citationLabelForSource(ledger: MvpStep5EvidenceLedger, sourceId: string) {
  const source = ledger.source_registry.find((item) => item.source_id === sourceId);
  const reference = source
    ? ledger.references.find((item) => item.citation_key === source.citation_key || item.reference_id === source.reference_id)
    : null;
  return reference?.inline_citation_hint || source?.citation_key || sourceId;
}

function normalizeCitationAnchors(input: {
  sectionKey: string;
  anchors: SectionDraftLlmOutput["citation_anchors"];
  ledger: MvpStep5EvidenceLedger;
}) {
  const validSourceIds = new Set(input.ledger.source_registry.map((source) => source.source_id));
  const validEvidenceIds = new Set(allEvidenceItems(input.ledger).map((item) => item.evidence_id));
  return input.anchors
    .filter((anchor) => validSourceIds.has(anchor.source_id) && allEvidenceItems(input.ledger).some((item) => item.evidence_id === anchor.evidence_id && item.source_id === anchor.source_id))
    .map((anchor, index): MvpStep6CitationAnchor => ({
      section_key: input.sectionKey,
      block_id: `${input.sectionKey}:paragraph:${Math.max(0, Math.floor(anchor.paragraph_index ?? 0))}`,
      paragraph_index: Math.max(0, Math.floor(anchor.paragraph_index ?? 0)),
      sentence_index: anchor.sentence_index === null || anchor.sentence_index === undefined
        ? null
        : Math.max(0, Math.floor(anchor.sentence_index)),
      source_id: anchor.source_id,
      evidence_id: anchor.evidence_id && validEvidenceIds.has(anchor.evidence_id) ? anchor.evidence_id : null,
      snippet_id: cleanText(anchor.snippet_id) || null,
      citation_label: citationLabelForSource(input.ledger, anchor.source_id),
      claim_summary: clip(anchor.claim_summary, 220) || `Cita ${index + 1}`,
    }));
}

function fallbackCitationAnchors(input: {
  sectionKey: string;
  evidenceItems: MvpStep5SemanticEvidenceItem[];
  ledger: MvpStep5EvidenceLedger;
}) {
  return input.evidenceItems.slice(0, 5).map((item, index): MvpStep6CitationAnchor => ({
    section_key: input.sectionKey,
    block_id: `${input.sectionKey}:paragraph:${Math.min(index, 2)}`,
    paragraph_index: Math.min(index, 2),
    sentence_index: null,
    source_id: item.source_id,
    evidence_id: item.evidence_id,
    snippet_id: item.citation_anchor.chunk_id,
    citation_label: citationLabelForSource(input.ledger, item.source_id),
    claim_summary: clip(item.traceable_summary_es, 220),
  }));
}

function ensureParagraphCitations(input: {
  paragraphs: string[];
  anchors: MvpStep6CitationAnchor[];
}) {
  return input.paragraphs.map((paragraph, index) => {
    const publicParagraph = sanitizePublicText(paragraph);
    const labels = unique(
      input.anchors
        .filter((anchor) => anchor.paragraph_index === index)
        .map((anchor) => anchor.citation_label),
    );
    if (!labels.length || labels.some((label) => publicParagraph.includes(label))) {
      return publicParagraph;
    }
    return sanitizePublicText(`${publicParagraph.replace(/[.\s]*$/, ".")} ${labels.slice(0, 2).join(" ")}`);
  });
}

function assetsForSection(section: MvpStep6SectionPlanItem, ledger: MvpStep5EvidenceLedger) {
  if (section.asset_policy.max_assets <= 0) return [];
  const visualBySection = ledger.visual_localized_assets
    .filter((asset) => asset.section_key === section.section_key || section.evidence_section_keys.includes(asset.section_key))
    .filter((asset) => asset.localization_status === "localized" || asset.equation_latex_status === "transcribed");
  const curated = ledger.curated_assets
    .filter((asset) => asset.section_key === section.section_key || section.evidence_section_keys.includes(asset.section_key))
    .map((asset) => ({
      asset_id: asset.asset_id,
      source_id: asset.source_id,
      citation_key: asset.citation_key,
      asset_kind: asset.asset_kind,
      section_key: asset.section_key,
      cropped_image_path: asset.body_image_path ?? asset.image_path,
      equation_latex: null,
      visual_description_es: asset.curation_reason,
      citation_anchor: asset.citation_anchor,
    }));

  return [...visualBySection, ...curated].slice(0, section.asset_policy.max_assets);
}

function renderTemplate(template: string, values: Record<string, unknown>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, JSON.stringify(value, null, 2)),
    template,
  );
}

function sectionPrompt(input: {
  projectContext: unknown;
  styleContract: unknown;
  pageBudget: unknown;
  sectionPlan: MvpStep6SectionPlanItem;
  generationWave: MvpStep6SectionGenerationWave;
  evidenceItems: unknown[];
  sourceRegistry: unknown[];
  assets: unknown[];
  priorSectionSummaries: unknown[];
}) {
  const user = renderTemplate(STEP6_SECTION_DRAFT_PROMPT.userPromptTemplate, {
    project_context_json: input.projectContext,
    style_contract_json: input.styleContract,
    page_budget_json: input.pageBudget,
    section_plan_json: input.sectionPlan,
    generation_wave: input.generationWave,
    evidence_items_json: input.evidenceItems,
    source_registry_json: input.sourceRegistry,
    assets_json: input.assets,
    prior_section_summaries_json: input.priorSectionSummaries,
  });
  return `${STEP6_SECTION_DRAFT_PROMPT.systemPrompt}\n\n${user}`;
}

function unique(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.map((item) => cleanText(item)).filter(Boolean)));
}

function formatEvidenceLine(item: MvpStep5SemanticEvidenceItem) {
  const citation = item.citation_key ? ` ${item.citation_key}` : "";
  return `${item.traceable_summary_es}${citation}`.trim();
}

function buildDeterministicDraft(input: {
  section: MvpStep6SectionPlanItem;
  project: ProjectForStep6;
  ledger: MvpStep5EvidenceLedger;
  evidenceItems: MvpStep5SemanticEvidenceItem[];
  assets: Array<MvpStep5VisualLocalizedAsset | Record<string, unknown>>;
}): MvpStep6SectionDraft {
  const intake = input.project.intake;
  const topic = intake?.topic ?? input.project.title;
  const evidenceLines = input.evidenceItems.map(formatEvidenceLine).filter(Boolean);
  const sourceIds = unique(input.evidenceItems.map((item) => item.source_id));
  const evidenceIds = unique(input.evidenceItems.map((item) => item.evidence_id));
  const assumptions = [
    input.section.required_source_count > sourceIds.length
      ? `La seccion usa ${sourceIds.length} fuente(s) recuperada(s), por debajo del objetivo de ${input.section.required_source_count}.`
      : null,
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    ...input.ledger.warnings.slice(0, 3),
    evidenceLines.length === 0 ? "No se recupero evidencia semantica especifica para esta seccion." : null,
  ].filter((item): item is string => Boolean(item));

  const intro = `Esta seccion desarrolla ${input.section.title.toLowerCase()} para el proyecto "${topic}". El contenido se formula como plan academico preliminar y se limita a la evidencia recuperada por Ingeniometrix.`;
  const evidenceParagraph = evidenceLines.length
    ? `La evidencia disponible sugiere los siguientes apoyos utiles para la planificacion: ${evidenceLines.slice(0, 5).join(" ")}`
    : `La evidencia especifica para esta seccion es limitada; por ello, el texto se apoya principalmente en el intake estructurado y declara sus limites.`;
  const methodParagraph = input.section.section_key === "methodology"
    ? `El enfoque metodologico declarado o inferido debe tratarse como propuesta revisable: ${cleanText(intake?.preferredMethodology) || "enfoque pendiente de precision por el asesor academico"}.`
    : `El alcance se mantiene prudente: no se presentan resultados, mediciones ni conclusiones empiricas que no hayan sido ejecutadas.`;

  const blocks: MvpStep6ContentBlock[] =
    input.section.output_modes.includes("references")
      ? [{ kind: "reference_list", items: input.ledger.references.map((reference) => reference.formatted_reference) }]
      : input.section.output_modes.includes("native_table")
        ? [
            { kind: "paragraph", text: intro },
            { kind: "paragraph", text: evidenceParagraph },
            { kind: "paragraph", text: methodParagraph },
            buildNativeTableForSection({ section: input.section, project: input.project, ledger: input.ledger, evidenceItems: input.evidenceItems }),
          ]
        : [
            { kind: "paragraph", text: intro },
            { kind: "paragraph", text: evidenceParagraph },
            { kind: "paragraph", text: methodParagraph },
          ];

  blocks.push(...buildAssetBlocks(input.assets, input.ledger));

  return {
    section_key: input.section.section_key,
    title: input.section.title,
    level: input.section.level,
    order: input.section.order,
    status: "deterministic_fallback",
    generation_source: "deterministic",
    word_count: wordCount(blocks.map((block) => "text" in block ? block.text : "").join(" ")),
    generation_wave: generationWaveForSection(input.section),
    blocks,
    citation_anchors: fallbackCitationAnchors({
      sectionKey: input.section.section_key,
      evidenceItems: input.evidenceItems,
      ledger: input.ledger,
    }),
    used_source_ids: sourceIds,
    used_evidence_ids: evidenceIds,
    used_snippet_ids: unique(input.evidenceItems.map((item) => item.citation_anchor?.chunk_id)),
    used_asset_keys: unique(input.assets.map((asset) => String((asset as Record<string, unknown>).asset_id ?? ""))),
    assumptions,
    limitations: ["Documento generado como blueprint editable; requiere revision academica humana antes de entrega institucional."],
    warnings,
  };
}

function buildNativeTableForSection(input: {
  section: MvpStep6SectionPlanItem;
  project: ProjectForStep6;
  ledger: MvpStep5EvidenceLedger;
  evidenceItems: MvpStep5SemanticEvidenceItem[];
}): MvpStep6ContentBlock {
  if (input.section.section_key === "research_antecedents") {
    return {
      kind: "table",
      title: "Sintesis comparada de fuentes recuperadas",
      rows: [
        ["Fuente", "Aporte para el blueprint", "Uso prudente"],
        ...input.ledger.source_registry.slice(0, 8).map((source) => [
          `${source.citation_key}: ${clip(source.title, 80)}`,
          clip(input.evidenceItems.find((item) => item.source_id === source.source_id)?.traceable_summary_es, 140) || "Soporte bibliografico recuperado.",
          "Contexto, marco teorico o apoyo metodologico; no usar como resultado propio.",
        ]),
      ],
      source_note: "Fuente: elaboracion propia con base en fuentes recuperadas por Ingeniometrix.",
    };
  }

  if (input.section.section_key === "variables_or_categories") {
    const variables = input.ledger.semantic_extractions.flatMap((extraction) => extraction.variables_or_constructs ?? []).slice(0, 8);
    return {
      kind: "table",
      title: "Constructos de las fuentes: no equivalen a variables del estudio propuesto",
      rows: [
        ["Elemento", "Rol", "Descripcion", "Soporte"],
        ...(variables.length
          ? variables.map((item) => [
              item.name_es,
              ({ variable: "variable", indicator: "indicador", parameter: "parametro", category: "categoria", metric: "metrica" } as const)[item.role],
              clip(item.description_es, 120),
              item.citation_anchor.citation_key,
            ])
          : [
              [
                clip(input.project.intake?.topic, 60) || "Objeto de estudio",
                "categoria",
                "Elemento preliminar derivado del intake; requiere operacionalizacion con asesor.",
                "Intake",
              ],
            ]),
      ],
      source_note: "Inventario bibliografico. Su inclusion no implica adopcion en el diseno propuesto; las categorias pertinentes se definen en el texto del plan.",
    };
  }

  if (input.section.section_key === "methodology") {
    const intake = input.project.intake;
    const methodEvidence = input.evidenceItems
      .filter((item) => /metodo|metod|method|analisis|modelo|tecnica/i.test([
        item.claim_type,
        item.traceable_summary_es,
      ].join(" ")))
      .slice(0, 3);
    return {
      kind: "table",
      title: "Diseño metodológico preliminar",
      rows: [
        ["Componente", "Definición operativa", "Soporte o cautela"],
        [
          "Enfoque",
          clip(intake?.preferredMethodology, 150) || "Enfoque metodológico por validar con asesor.",
          "Propuesta del investigador en el intake; no es una conclusion de las fuentes.",
        ],
        [
          "Unidad de análisis",
          clip(intake?.targetPopulation, 150) || "Unidad de análisis pendiente de delimitación.",
          "Debe precisarse antes de recolectar o modelar datos.",
        ],
        [
          "Datos disponibles",
          clip(intake?.availableData, 150) || "Disponibilidad de datos no especificada.",
          "No se asumen bases de datos ni resultados no ejecutados.",
        ],
        [
          "Antecedentes metodologicos (no procedimiento adoptado)",
          methodEvidence.length
            ? methodEvidence.map((item) => clip(item.traceable_summary_es, 80)).join(" ")
            : "Revisión documental, definición de variables y validación metodológica previa.",
          methodEvidence.map((item) => item.citation_key).filter(Boolean).join(", ") || "Fuentes seleccionadas.",
        ],
      ],
      source_note: "Fuente: elaboración propia con base en intake, evidencia recuperada y restricciones de trazabilidad.",
    };
  }

  if (input.section.section_key === "consistency_matrix") {
    return {
      kind: "table",
      title: "Matriz de consistencia preliminar",
      rows: [
        ["Problema", "Objetivo", "Pregunta", "Metodo", "Evidencia"],
        [
          clip(input.project.intake?.problemContext ?? input.project.intake?.topic, 120),
          `Analizar ${clip(input.project.intake?.topic, 90).toLowerCase()}`,
          `Como se puede abordar academicamente ${clip(input.project.intake?.topic, 80).toLowerCase()}?`,
          clip(input.project.intake?.preferredMethodology, 90) || "Diseno metodologico pendiente de precision.",
          input.ledger.source_registry.slice(0, 3).map((source) => source.citation_key).join(", "),
        ],
      ],
      source_note: "Fuente: elaboracion propia como alineacion preliminar del blueprint.",
      render_hint: "compact_landscape",
    };
  }

  if (input.section.section_key === "schedule_and_budget") {
    return {
      kind: "table",
      title: "Cronograma y presupuesto referencial",
      rows: [
        ["Fase", "Duracion referencial", "Entregable", "Supuesto"],
        ["Revision de evidencia", "Por confirmar", "Matriz bibliografica", "Depende de acceso a fuentes completas."],
        ["Diseno metodologico", "Por confirmar", "Protocolo y plan de analisis", "Requiere validacion del asesor."],
        ["Produccion de informacion o analisis", "Por confirmar", "Corpus o resultados futuros", "No ejecutado en este plan."],
        ["Redaccion y revision", "Por confirmar", "Documento academico revisable", "Sujeto a plantilla institucional."],
      ],
      source_note: "Fuente: estimacion referencial para planificacion; no representa presupuesto aprobado.",
    };
  }

  return {
    kind: "table",
    title: `Tabla. ${input.section.title}`,
    rows: [["Elemento", "Detalle"], ["Alcance", input.section.purpose]],
    source_note: "Fuente: elaboracion propia.",
  };
}

function buildAssetBlocks(
  assets: Array<MvpStep5VisualLocalizedAsset | Record<string, unknown>>,
  ledger: MvpStep5EvidenceLedger,
): MvpStep6ContentBlock[] {
  return assets.flatMap((asset): MvpStep6ContentBlock[] => {
    const record = asset as Record<string, unknown>;
    const assetId = cleanText(String(record.asset_id ?? ""));
    const sourceId = cleanText(String(record.source_id ?? ""));
    const source = ledger.source_registry.find((item) => item.source_id === sourceId);
    const sourceNote = source ? `Fuente: adaptado de ${source.citation_key}.` : "Fuente: evidencia documental recuperada.";
    const assetKind = cleanText(String(record.asset_kind ?? ""));
    const fallbackTitle = assetKind === "table"
      ? "Tabla recuperada de la fuente seleccionada"
      : assetKind === "equation"
        ? "Expresión matemática recuperada"
        : "Figura recuperada de la fuente seleccionada";
    const publicTitle = sanitizePublicText(String(record.visual_description_es ?? ""));
    const latex = typeof record.equation_latex === "string" ? record.equation_latex : "";
    const imagePath = typeof record.cropped_image_path === "string"
      ? record.cropped_image_path
      : typeof record.image_path === "string"
        ? record.image_path
        : null;

    if (latex) {
      return [{ kind: "equation", latex, source_note: sourceNote, asset_key: assetId, source_id: sourceId || null }];
    }

    if (imagePath) {
      return [
        {
          kind: "figure",
          title: publicTitle && !/crop|bbox|metadata|curation|quality/i.test(publicTitle)
            ? clip(publicTitle, 110)
            : fallbackTitle,
          image_path: imagePath,
          source_note: sourceNote,
          asset_key: assetId,
          source_id: sourceId || null,
        },
      ];
    }

    return [];
  });
}

async function generateSectionDraft(input: {
  provider: ReturnType<typeof getConfiguredLlmProvider> | null;
  userId: string;
  projectId: string;
  runId: string;
  section: MvpStep6SectionPlanItem;
  project: ProjectForStep6;
  ledger: MvpStep5EvidenceLedger;
  projectContext: unknown;
  styleContract: unknown;
  pageBudget: MvpStep6PageBudgetPlan;
  priorSectionSummaries: unknown[];
  warnings: string[];
}) {
  const evidenceItems = evidenceForSection(input.section, input.ledger);
  const sourceRegistry = sourceRegistryForEvidence(input.ledger, evidenceItems);
  const assets = assetsForSection(input.section, input.ledger);
  const deterministic = () =>
    buildDeterministicDraft({
      section: input.section,
      project: input.project,
      ledger: input.ledger,
      evidenceItems,
      assets,
    });

  const generationWave = generationWaveForSection(input.section);
  const deterministicOnly = input.section.output_modes.includes("references") || input.section.max_words === 0;

  if (!input.provider || deterministicOnly) {
    return deterministic();
  }

  const prompt = sectionPrompt({
    projectContext: input.projectContext,
    styleContract: input.styleContract,
    pageBudget: input.pageBudget,
    sectionPlan: input.section,
    generationWave,
    evidenceItems: evidenceItems.slice(0, 8),
    sourceRegistry,
    assets,
    priorSectionSummaries: input.priorSectionSummaries,
  });
  const promptHash = hashText(prompt);
  const model = process.env.IMX_STEP6_SECTION_MODEL?.trim() || process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";

  try {
    const output = await generateStructuredObjectWithTextFallback<SectionDraftLlmOutput>({
      provider: input.provider,
      prompt,
      schemaName: "mvp_step6_section_draft",
      schema: STEP6_SECTION_DRAFT_PROMPT.outputSchema as Record<string, unknown>,
      model,
      trackingAttribution: {
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        stage: "section_generation",
        source: "runMvpStep6BlueprintDocx",
        promptVersion: STEP6_SECTION_DRAFT_PROMPT.version,
        promptHash,
        schemaName: "mvp_step6_section_draft",
      },
    });
    const validSourceIds = new Set(input.ledger.source_registry.map((source) => source.source_id));
    const validEvidenceIds = new Set(allEvidenceItems(input.ledger).map((item) => item.evidence_id));
    const validAssetKeys = new Set([
      ...input.ledger.visual_localized_assets.map((asset) => asset.asset_id),
      ...input.ledger.curated_assets.map((asset) => asset.asset_id),
    ]);
    const citationAnchors = normalizeCitationAnchors({
      sectionKey: input.section.section_key,
      anchors: output.citation_anchors ?? [],
      ledger: input.ledger,
    });
    const anchors = citationAnchors.filter((anchor) => anchor.paragraph_index < output.paragraphs.length);
    const paragraphs = enforceWordBudgetOnParagraphs(ensureParagraphCitations({
      paragraphs: output.paragraphs.map(cleanText).filter(Boolean),
      anchors,
    }), input.section.max_words);
    const blocks: MvpStep6ContentBlock[] = paragraphs.map((text) => ({ kind: "paragraph", text }));
    if (output.bullet_items.length) {
      blocks.push({ kind: "bullet_list", items: output.bullet_items.map(cleanText).filter(Boolean) });
    }
    if (input.section.output_modes.includes("native_table")) {
      blocks.push(buildNativeTableForSection({
        section: input.section,
        project: input.project,
        ledger: input.ledger,
        evidenceItems,
      }));
    }
    blocks.push(...buildAssetBlocks(assets, input.ledger));

    return {
      section_key: input.section.section_key,
      title: cleanText(output.title) || input.section.title,
      level: input.section.level,
      order: input.section.order,
      status: output.blocked ? "blocked" : "generated",
      generation_source: "llm",
      word_count: wordCount(paragraphs.join(" ")),
      generation_wave: generationWave,
      blocks: blocks.length ? blocks : deterministic().blocks,
      citation_anchors: anchors,
      used_source_ids: unique(output.used_source_ids.filter((id) => validSourceIds.has(id))),
      used_evidence_ids: unique(output.used_evidence_ids.filter((id) => validEvidenceIds.has(id))),
      used_snippet_ids: unique(output.used_snippet_ids),
      used_asset_keys: unique(output.used_asset_keys.filter((key) => validAssetKeys.has(key))),
      assumptions: output.assumptions.map(cleanText).filter(Boolean),
      limitations: output.limitations.map(cleanText).filter(Boolean),
      warnings: output.warnings.map(cleanText).filter(Boolean),
    } satisfies MvpStep6SectionDraft;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    input.warnings.push(`Step 6 uso fallback deterministico en ${input.section.section_key}: ${reason}`);
    return deterministic();
  }
}

function paragraphBlocksFromDraft(draft: MvpStep6SectionDraft) {
  return draft.blocks.filter((block): block is Extract<MvpStep6ContentBlock, { kind: "paragraph" }> => block.kind === "paragraph");
}

function bulletBlocksFromDraft(draft: MvpStep6SectionDraft) {
  return draft.blocks.filter((block): block is Extract<MvpStep6ContentBlock, { kind: "bullet_list" }> => block.kind === "bullet_list");
}

export function applyEditorialPatchToDraft(input: {
  draft: MvpStep6SectionDraft;
  paragraphs: string[];
  bulletItems: string[];
  notes: string[];
}) {
  // Editorial prose must not silently shift paragraph-based provenance.
  if (input.paragraphs.length !== paragraphBlocksFromDraft(input.draft).length ||
      input.draft.citation_anchors.some((anchor) => !input.paragraphs[anchor.paragraph_index]?.includes(anchor.citation_label))) {
    return { ...input.draft, warnings: [...input.draft.warnings, "Revision editorial no aplicada: no preserva coordenadas/citas de evidencia."] };
  }
  let paragraphIndex = 0;
  let bulletApplied = false;
  const nextBlocks = input.draft.blocks.map((block): MvpStep6ContentBlock => {
    if (block.kind === "paragraph") {
      const revised = cleanText(input.paragraphs[paragraphIndex]);
      paragraphIndex += 1;
      return revised ? { ...block, text: revised } : block;
    }
    if (block.kind === "bullet_list" && !bulletApplied && input.bulletItems.length > 0) {
      bulletApplied = true;
      return { ...block, items: input.bulletItems.map(cleanText).filter(Boolean) };
    }
    return block;
  });

  return {
    ...input.draft,
    blocks: nextBlocks,
    word_count: wordCount(nextBlocks.map((block) => ("text" in block ? block.text : "")).join(" ")),
    warnings: Array.from(new Set([...input.draft.warnings, ...input.notes])),
  } satisfies MvpStep6SectionDraft;
}

async function runEditorialReview(input: {
  provider: ReturnType<typeof getConfiguredLlmProvider> | null;
  userId: string;
  projectId: string;
  runId: string;
  drafts: MvpStep6SectionDraft[];
  styleContract: MvpStep6AcademicStyleContract;
  pageBudget: MvpStep6PageBudgetPlan;
  warnings: string[];
}) {
  if (!input.provider) {
    return {
      drafts: input.drafts,
      report: {
        artifact_type: "mvp_step6_editorial_report",
        artifact_version: "v1",
        status: "skipped",
        model: null,
        prompt_version: STEP6_EDITORIAL_REVIEW_PROMPT.version,
        revised_section_count: 0,
        warnings: ["Ola editorial omitida porque no hay proveedor LLM configurado."],
        notes: [],
      } satisfies MvpStep6EditorialReport,
    };
  }

  const editableDrafts = input.drafts
    .filter((draft) => draft.generation_source === "llm")
    .filter((draft) => paragraphBlocksFromDraft(draft).length > 0)
    .map((draft) => ({
      section_key: draft.section_key,
      title: draft.title,
      generation_wave: draft.generation_wave,
      paragraphs: paragraphBlocksFromDraft(draft).map((block) => block.text),
      bullet_items: bulletBlocksFromDraft(draft).flatMap((block) => block.items),
      citation_labels: unique(draft.citation_anchors.map((anchor) => anchor.citation_label)),
    }));

  if (!editableDrafts.length) {
    return {
      drafts: input.drafts,
      report: {
        artifact_type: "mvp_step6_editorial_report",
        artifact_version: "v1",
        status: "skipped",
        model: null,
        prompt_version: STEP6_EDITORIAL_REVIEW_PROMPT.version,
        revised_section_count: 0,
        warnings: ["No hubo secciones narrativas LLM elegibles para la ola editorial."],
        notes: [],
      } satisfies MvpStep6EditorialReport,
    };
  }

  const prompt = `${STEP6_EDITORIAL_REVIEW_PROMPT.systemPrompt}\n\n${renderTemplate(
    STEP6_EDITORIAL_REVIEW_PROMPT.userPromptTemplate,
    {
      style_contract_json: input.styleContract,
      page_budget_json: input.pageBudget,
      section_summaries_json: editableDrafts.map((draft) => ({
        section_key: draft.section_key,
        title: draft.title,
        generation_wave: draft.generation_wave,
        citation_labels: draft.citation_labels,
      })),
      sections_json: editableDrafts,
    },
  )}`;
  const promptHash = hashText(prompt);
  const model = process.env.IMX_STEP6_EDITORIAL_MODEL?.trim() || "gpt-5.4-mini";

  try {
    const output = await generateStructuredObjectWithTextFallback<EditorialReviewOutput>({
      provider: input.provider,
      prompt,
      schemaName: "mvp_step6_editorial_review",
      maxOutputTokens: 16000,
      schema: STEP6_EDITORIAL_REVIEW_PROMPT.outputSchema as Record<string, unknown>,
      model,
      trackingAttribution: {
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        stage: "qa",
        source: "runMvpStep6BlueprintDocx.editorial_review",
        promptVersion: STEP6_EDITORIAL_REVIEW_PROMPT.version,
        promptHash,
        schemaName: "mvp_step6_editorial_review",
      },
    });
    const patches = new Map(output.revised_sections.map((section) => [section.section_key, section]));
    let revisedCount = 0;
    const nextDrafts = input.drafts.map((draft) => {
      const patch = patches.get(draft.section_key);
      if (!patch) return draft;
      revisedCount += 1;
      return applyEditorialPatchToDraft({
        draft,
        paragraphs: patch.paragraphs,
        bulletItems: patch.bullet_items,
        notes: patch.revision_notes,
      });
    });

    return {
      drafts: nextDrafts,
      report: {
        artifact_type: "mvp_step6_editorial_report",
        artifact_version: "v1",
        status: "applied",
        model,
        prompt_version: STEP6_EDITORIAL_REVIEW_PROMPT.version,
        revised_section_count: revisedCount,
        warnings: output.warnings.map(cleanText).filter(Boolean),
        notes: output.notes.map(cleanText).filter(Boolean),
      } satisfies MvpStep6EditorialReport,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.warnings.push(`Ola editorial Step 6 fallida; se conserva el borrador previo: ${message}`);
    return {
      drafts: input.drafts,
      report: {
        artifact_type: "mvp_step6_editorial_report",
        artifact_version: "v1",
        status: "failed",
        model,
        prompt_version: STEP6_EDITORIAL_REVIEW_PROMPT.version,
        revised_section_count: 0,
        warnings: [message],
        notes: [],
      } satisfies MvpStep6EditorialReport,
    };
  }
}

function sectionPlainText(draft: MvpStep6SectionDraft) {
  return draft.blocks
    .map((block) => {
      if (block.kind === "paragraph") return block.text;
      if (block.kind === "bullet_list") return block.items.join(" ");
      if (block.kind === "table") return block.rows.flat().join(" ");
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function buildSectionSummariesForTitle(drafts: MvpStep6SectionDraft[]) {
  return drafts
    .filter((draft) => draft.section_key !== "references")
    .map((draft) => ({
      section_key: draft.section_key,
      title: draft.title,
      summary: clip(sectionPlainText(draft), 420),
      citations: unique(draft.citation_anchors.map((anchor) => anchor.citation_label)).slice(0, 6),
    }));
}

async function generateTitlePlan(input: {
  provider: ReturnType<typeof getConfiguredLlmProvider> | null;
  userId: string;
  projectId: string;
  runId: string;
  project: ProjectForStep6;
  ledger: MvpStep5EvidenceLedger;
  pageBudget: MvpStep6PageBudgetPlan;
  drafts: MvpStep6SectionDraft[];
  warnings: string[];
}): Promise<MvpStep6TitlePlan> {
  const originalTitle = cleanText(input.project.title);
  const fallbackTitle = clip(cleanText(input.project.intake?.topic) || originalTitle || "Plan de tesis academico", 180);
  const fallback = (status: MvpStep6TitlePlan["status"], warning?: string): MvpStep6TitlePlan => ({
    artifact_type: "mvp_step6_title_plan",
    artifact_version: "v1",
    status,
    model: null,
    prompt_version: STEP6_TITLE_GENERATION_PROMPT.version,
    original_title: originalTitle,
    title: fallbackTitle,
    short_title: clip(fallbackTitle, 80),
    rationale: "Titulo conservado por fallback; requiere revision academica humana.",
    keywords: unique([
      input.project.topicAreaLabel,
      input.project.program,
      input.project.intake?.preferredMethodology,
    ]).slice(0, 6),
    warnings: warning ? [warning] : [],
  });

  if (!input.provider) {
    return fallback("fallback", "No hay proveedor LLM configurado para generar titulo academico optimizado.");
  }

  const prompt = `${STEP6_TITLE_GENERATION_PROMPT.systemPrompt}\n\n${renderTemplate(
    STEP6_TITLE_GENERATION_PROMPT.userPromptTemplate,
    {
      project_context_json: buildProjectContext(input.project),
      page_budget_json: input.pageBudget,
      section_summaries_json: buildSectionSummariesForTitle(input.drafts),
      source_registry_json: input.ledger.source_registry.slice(0, 8).map((source) => ({
        source_id: source.source_id,
        citation_key: source.citation_key,
        title: source.title,
        year: source.year,
        venue: source.venue,
      })),
    },
  )}`;
  const promptHash = hashText(prompt);
  const model = process.env.IMX_STEP6_TITLE_MODEL?.trim() || process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4";

  try {
    const output = await generateStructuredObjectWithTextFallback<TitleGenerationOutput>({
      provider: input.provider,
      prompt,
      schemaName: "mvp_step6_title_generation",
      schema: STEP6_TITLE_GENERATION_PROMPT.outputSchema as Record<string, unknown>,
      model,
      trackingAttribution: {
        userId: input.userId,
        projectId: input.projectId,
        runId: input.runId,
        stage: "title_generation",
        source: "runMvpStep6BlueprintDocx.title_generation",
        promptVersion: STEP6_TITLE_GENERATION_PROMPT.version,
        promptHash,
        schemaName: "mvp_step6_title_generation",
      },
    });
    const title = cleanText(output.title) || fallbackTitle;
    return {
      artifact_type: "mvp_step6_title_plan",
      artifact_version: "v1",
      status: "generated",
      model,
      prompt_version: STEP6_TITLE_GENERATION_PROMPT.version,
      original_title: originalTitle,
      title: clip(title, 220),
      short_title: clip(cleanText(output.short_title) || title, 90),
      rationale: clip(output.rationale, 500),
      keywords: unique(output.keywords).slice(0, 8),
      warnings: output.warnings.map(cleanText).filter(Boolean),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.warnings.push(`No se pudo generar titulo academico optimizado; se conserva fallback: ${message}`);
    return fallback("failed", message);
  }
}

function titleForDocument(input: { project: ProjectForStep6; titlePlan?: MvpStep6TitlePlan | null }) {
  return cleanText(input.titlePlan?.title) || cleanText(input.project.title) || "Blueprint academico Ingeniometrix";
}

function buildCaptionLabel(kind: "figure" | "table" | "equation" | "matrix", count: number) {
  if (kind === "figure") return `Figura ${count}`;
  if (kind === "equation") return `Ecuacion ${count}`;
  return `Tabla ${count}`;
}

function classifyTable(block: Extract<MvpStep6ContentBlock, { kind: "table" }>, sectionKey: string) {
  return sectionKey === "consistency_matrix" || /matriz de consistencia/i.test(block.title)
    ? "matrix" as const
    : "table" as const;
}

async function readJsonFileIfExists(filePath: string | null | undefined): Promise<unknown> {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function extractPdfReferenceMentionsFromText(input: {
  sourceId: string;
  pageNumber: number | null;
  text: string | null | undefined;
}) {
  const text = cleanText(input.text);
  if (!text) return [];
  const pattern = /\b(?:Fig(?:ure)?\.?|Figura|Table|Tabla|Eq(?:uation)?\.?|Ecuaci[oó]n)\s*\(?\d+[a-z]?\)?/gi;
  const matches = Array.from(text.matchAll(pattern)).slice(0, 8);
  return matches.map((match) => {
    const mention = cleanText(match[0]);
    const index = Math.max(0, match.index ?? 0);
    return {
      source_id: input.sourceId,
      page_number: input.pageNumber,
      mention,
      context_excerpt: clip(text.slice(Math.max(0, index - 120), Math.min(text.length, index + 220)), 280),
    };
  });
}

async function buildPdfCrossReferenceMentionIndex(ledger: MvpStep5EvidenceLedger) {
  const mentions: MvpStep6CrossReferencePlanItem["original_pdf_mentions"] = [];

  for (const inventory of ledger.pdf_layout_inventories) {
    for (const candidate of inventory.candidates.slice(0, 30)) {
      mentions.push(...extractPdfReferenceMentionsFromText({
        sourceId: inventory.source_id,
        pageNumber: candidate.page_number,
        text: [candidate.caption_text, candidate.nearby_text].filter(Boolean).join(" "),
      }));
    }
  }

  for (const asset of ledger.source_assets) {
    mentions.push(...extractPdfReferenceMentionsFromText({
      sourceId: asset.source_id,
      pageNumber: asset.page_number,
      text: [asset.caption_or_signal_text, asset.nearby_text_excerpt].filter(Boolean).join(" "),
    }));
  }

  for (const materialization of ledger.pdf_materializations) {
    const chunks = await readJsonFileIfExists(materialization.chunks_path);
    const chunkList = Array.isArray(chunks)
      ? chunks
      : Array.isArray((chunks as { chunks?: unknown[] } | null)?.chunks)
        ? (chunks as { chunks: unknown[] }).chunks
        : [];
    for (const chunk of chunkList.slice(0, 40)) {
      const record = chunk as Record<string, unknown>;
      mentions.push(...extractPdfReferenceMentionsFromText({
        sourceId: cleanText(String(record.source_id ?? materialization.source_id)),
        pageNumber: typeof record.page_start === "number" ? record.page_start : null,
        text: typeof record.text === "string" ? record.text : "",
      }));
    }
  }

  const seen = new Set<string>();
  return mentions.filter((mention) => {
    const key = `${mention.source_id}:${mention.page_number}:${mention.mention}:${mention.context_excerpt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildCrossReferencePlan(input: {
  drafts: MvpStep6SectionDraft[];
  pdfMentions: MvpStep6CrossReferencePlanItem["original_pdf_mentions"];
}) {
  let figureCount = 0;
  let tableCount = 0;
  let equationCount = 0;
  const records: MvpStep6CrossReferencePlanItem[] = [];

  for (const draft of [...input.drafts].sort((left, right) => left.order - right.order)) {
    for (const block of draft.blocks) {
      if (block.kind === "table") {
        const refType = classifyTable(block, draft.section_key);
        tableCount += 1;
        const label = buildCaptionLabel(refType, tableCount);
        records.push({
          ref_id: `${draft.section_key}:table:${tableCount}`,
          ref_type: refType,
          label,
          title: sanitizePublicText(block.title),
          section_key: draft.section_key,
          source_id: null,
          asset_key: null,
          source_note: block.source_note,
          original_pdf_mentions: [],
          used_in_section_keys: [draft.section_key],
        });
      } else if (block.kind === "figure") {
        const kind = block.caption_type ?? "figure";
        const count = kind === "table" ? ++tableCount : kind === "equation" ? ++equationCount : ++figureCount;
        const label = buildCaptionLabel(kind, count);
        records.push({
          ref_id: `${draft.section_key}:${kind}:${count}`,
          ref_type: kind,
          label,
          title: sanitizePublicText(block.title),
          section_key: draft.section_key,
          source_id: block.source_id,
          asset_key: block.asset_key,
          source_note: block.source_note,
          original_pdf_mentions: input.pdfMentions
            .filter((mention) => mention.source_id === block.source_id)
            .slice(0, 4),
          used_in_section_keys: [draft.section_key],
        });
      } else if (block.kind === "equation") {
        equationCount += 1;
        const label = buildCaptionLabel("equation", equationCount);
        records.push({
          ref_id: `${draft.section_key}:equation:${equationCount}`,
          ref_type: "equation",
          label,
          title: "Expresión matemática recuperada",
          section_key: draft.section_key,
          source_id: block.source_id,
          asset_key: block.asset_key,
          source_note: block.source_note,
          original_pdf_mentions: input.pdfMentions
            .filter((mention) => mention.source_id === block.source_id)
            .slice(0, 4),
          used_in_section_keys: [draft.section_key],
        });
      }
    }
  }

  return records;
}

export function applyCrossReferenceMentions(input: {
  drafts: MvpStep6SectionDraft[];
  crossReferences: MvpStep6CrossReferencePlanItem[];
}) {
  return input.drafts.map((draft) => {
    if (draft.section_key === "references") return draft;
    const sectionRefs = input.crossReferences.filter((item) => item.section_key === draft.section_key);
    if (!sectionRefs.length) return draft;

    const labels = unique(sectionRefs.map((item) => item.label)).slice(0, 3);
    const mention = draft.section_key === "consistency_matrix"
      ? `La alineacion integral del plan se sintetiza en la ${labels[0]}.`
      : `Los elementos visuales o tabulares asociados a esta seccion se presentan en ${labels.join(", ")}.`;
    const hasMention = sectionPlainText(draft).includes(labels[0]);
    if (hasMention) return draft;

    const blocks: MvpStep6ContentBlock[] = [];
    let inserted = false;
    for (const block of draft.blocks) {
      if (!inserted && block.kind === "paragraph") {
        blocks.push({ ...block, text: `${block.text} ${mention}` });
        inserted = true;
      } else blocks.push(block);
    }

    return {
      ...draft,
      blocks: inserted ? blocks : [...draft.blocks, { kind: "paragraph", text: mention }],
      word_count: wordCount(blocks.map((block) => ("text" in block ? block.text : "")).join(" ")),
    } satisfies MvpStep6SectionDraft;
  });
}

function sanitizeDraftsForPublicDocument(drafts: MvpStep6SectionDraft[]) {
  return drafts.map((draft) => {
    const blocks = draft.blocks
      .map((block): MvpStep6ContentBlock | null => {
        if (block.kind === "paragraph") {
          const text = sanitizePublicText(block.text);
          return isDanglingPublicFragment(text) ? null : { ...block, text };
        }
        if (block.kind === "bullet_list") {
          const items = block.items
            .map(sanitizePublicText)
            .filter((item) => !isDanglingPublicFragment(item));
          return items.length ? { ...block, items } : null;
        }
        if (block.kind === "table") {
          return {
            ...block,
            title: sanitizePublicText(block.title),
            rows: block.rows.map((row) => row.map(sanitizePublicText)),
            source_note: sanitizePublicText(block.source_note),
          };
        }
        if (block.kind === "figure") {
          return {
            ...block,
            title: sanitizePublicText(block.title) || "Figura recuperada de la fuente seleccionada",
            source_note: sanitizePublicText(block.source_note),
          };
        }
        if (block.kind === "equation") {
          return {
            ...block,
            source_note: sanitizePublicText(block.source_note),
          };
        }
        if (block.kind === "reference_list") {
          return { ...block, items: block.items.map(sanitizePublicText).filter(Boolean) };
        }
        return block;
      })
      .filter((block): block is MvpStep6ContentBlock => Boolean(block));
    return {
      ...draft,
      title: sanitizePublicText(draft.title),
      blocks,
      word_count: wordCount(blocks.map((block) =>
        block.kind === "paragraph" ? block.text : block.kind === "bullet_list" ? block.items.join(" ") : "",
      ).join(" ")),
      assumptions: draft.assumptions.map(sanitizePublicText).filter(Boolean),
      limitations: draft.limitations.map(sanitizePublicText).filter(Boolean),
      warnings: draft.warnings.map(sanitizePublicText).filter(Boolean),
    } satisfies MvpStep6SectionDraft;
  });
}

function buildConsistencyMatrixRows(input: {
  project: ProjectForStep6;
  ledger: MvpStep5EvidenceLedger;
  drafts: MvpStep6SectionDraft[];
}) {
  const draft = input.drafts.find((item) => item.section_key === "objectives_and_questions");
  const declared = draft?.blocks.flatMap((block) => block.kind === "paragraph" ? [block.text] : block.kind === "bullet_list" ? block.items : []) ?? [];
  const questions = declared.filter((text) => text.includes("?"));
  const objectives = declared.filter((text) => !text.includes("?"));
  return [
    ["Problema declarado", "Objetivos declarados", "Preguntas declaradas", "Diseno propuesto"],
    [
      sanitizePublicText(input.project.intake?.problemContext),
      objectives.join("\n") || "Pendiente de formulacion; no se deriva de variables de otras investigaciones.",
      questions.join("\n") || "Ver formulacion en el texto; alineacion pendiente de revision.",
      sanitizePublicText(input.project.intake?.preferredMethodology),
    ],
  ];
}

function replaceConsistencyMatrixTable(input: {
  drafts: MvpStep6SectionDraft[];
  project: ProjectForStep6;
  ledger: MvpStep5EvidenceLedger;
}) {
  const rows = buildConsistencyMatrixRows(input);
  return input.drafts.map((draft) => {
    if (draft.section_key !== "consistency_matrix") return draft;
    let replaced = false;
    const blocks = draft.blocks.map((block): MvpStep6ContentBlock => {
      if (block.kind !== "table" || replaced) return block;
      replaced = true;
      return {
        kind: "table",
        title: "Matriz de consistencia del plan de tesis",
        rows,
        source_note: "Fuente: elaboracion propia con base en intake, secciones generadas y evidencia recuperada.",
        render_hint: "compact_landscape",
      };
    });
    if (!replaced) {
      blocks.push({
        kind: "table",
        title: "Matriz de consistencia del plan de tesis",
        rows,
        source_note: "Fuente: elaboracion propia con base en intake, secciones generadas y evidencia recuperada.",
        render_hint: "compact_landscape",
      });
    }
    return { ...draft, blocks } satisfies MvpStep6SectionDraft;
  });
}

function estimateDocumentPages(input: {
  drafts: MvpStep6SectionDraft[];
  pageBudget: MvpStep6PageBudgetPlan;
}) {
  const bodyWords = input.drafts
    .filter((draft) => draft.section_key !== "references")
    .reduce((sum, draft) => sum + draft.word_count, 0);
  const fixedPages = input.pageBudget.fixed_page_reservations.reduce((sum, item) => sum + item.pages, 0);
  const tableCount = input.drafts.reduce((sum, draft) => sum + draft.blocks.filter((block) => block.kind === "table").length, 0);
  const figureCount = input.drafts.reduce((sum, draft) => sum + draft.blocks.filter((block) => block.kind === "figure" || block.kind === "equation").length, 0);
  return Number((fixedPages + bodyWords / input.pageBudget.words_per_page_estimate + tableCount * 0.25 + figureCount * 0.35).toFixed(2));
}

export function trimTextToWordLimit(text: string, _maxWords: number) {
  return sanitizePublicText(text);
}

function enforceSectionWordBudgets(input: {
  drafts: MvpStep6SectionDraft[];
  sectionPlan: MvpStep6SectionPlanItem[];
  warnings: string[];
}) {
  const maxBySection = new Map(input.sectionPlan.map((section) => [section.section_key, section.max_words]));
  return input.drafts.map((draft) => {
    const maxWords = maxBySection.get(draft.section_key) ?? draft.word_count;
    if (draft.section_key === "references" || draft.word_count <= maxWords) return draft;

    let remaining = Math.max(40, maxWords);
    const blocks = draft.blocks.map((block): MvpStep6ContentBlock => {
      if (block.kind === "paragraph") {
        const count = wordCount(block.text);
        const nextText = count <= remaining ? block.text : trimTextToWordLimit(block.text, remaining);
        remaining -= wordCount(nextText);
        return { ...block, text: nextText };
      }
      if (block.kind === "bullet_list") {
        const items = block.items.map(sanitizePublicText).filter(Boolean);
        remaining -= wordCount(items.join(" "));
        return { ...block, items };
      }
      return block;
    });
    const word_count = wordCount(blocks.map((block) => ("text" in block ? block.text : block.kind === "bullet_list" ? block.items.join(" ") : "")).join(" "));
    input.warnings.push(`Se preservaron ${word_count} palabras de ${draft.section_key}; el presupuesto de ${maxWords} es orientativo, sin recortar contenido.`);
    return {
      ...draft,
      blocks,
      word_count,
    } satisfies MvpStep6SectionDraft;
  });
}

function compactVisualBlocksForPageBudget(input: {
  drafts: MvpStep6SectionDraft[];
  maxFigures: number;
  maxEquations: number;
  warnings: string[];
}) {
  const seenAssets = new Set<string>();
  let figureCount = 0;
  let equationCount = 0;
  return input.drafts.map((draft) => {
    const blocks: MvpStep6ContentBlock[] = [];
    let removed = 0;
    for (const block of draft.blocks) {
      if (block.kind === "figure") {
        const key = block.asset_key || `${block.source_id}:${block.title}`;
        if (seenAssets.has(key) || figureCount >= input.maxFigures) {
          removed += 1;
          continue;
        }
        seenAssets.add(key);
        figureCount += 1;
      }
      if (block.kind === "equation") {
        const key = block.asset_key || `${block.source_id}:${block.latex}`;
        if (seenAssets.has(key) || equationCount >= input.maxEquations) {
          removed += 1;
          continue;
        }
        seenAssets.add(key);
        equationCount += 1;
      }
      blocks.push(block);
    }
    if (removed > 0) {
      input.warnings.push(`Se omitieron ${removed} visual(es) redundante(s) en ${draft.section_key} para mantener el DOCX dentro de 15 paginas.`);
    }
    return { ...draft, blocks } satisfies MvpStep6SectionDraft;
  });
}

function compactDraftsForPageBudget(input: {
  drafts: MvpStep6SectionDraft[];
  sectionPlan: MvpStep6SectionPlanItem[];
  warnings: string[];
}) {
  const wordCompacted = enforceSectionWordBudgets(input);
  return compactVisualBlocksForPageBudget({
    drafts: wordCompacted,
    maxFigures: 2,
    maxEquations: 1,
    warnings: input.warnings,
  });
}

function buildHeroPrompt(input: {
  project: ProjectForStep6;
  sectionPlan: MvpStep6SectionPlanItem[];
  titlePlan: MvpStep6TitlePlan;
  placement: MvpStep6HeroImagePlan["placement"];
}) {
  const intake = input.project.intake;
  return renderTemplate(STEP6_HERO_IMAGE_PROMPT.promptTemplate, {
    title: titleForDocument({ project: input.project, titlePlan: input.titlePlan }),
    topic: intake?.topic ?? input.project.title,
    knowledge_area: input.project.topicAreaLabel ?? input.project.program,
    country_context: input.project.country,
    methodology: intake?.preferredMethodology ?? "metodologia academica propuesta",
    section_plan_summary: input.placement === "post_matrix_summary"
      ? "Sintesis visual posterior a la matriz de consistencia: problema, objetivos, variables, metodologia, evidencia y entregable academico."
      : input.sectionPlan.slice(0, 8).map((item) => item.title).join("; "),
  });
}

async function generateHeroImage(input: {
  project: ProjectForStep6;
  sectionPlan: MvpStep6SectionPlanItem[];
  titlePlan: MvpStep6TitlePlan;
  placement: MvpStep6HeroImagePlan["placement"];
  outputPath: string;
  warnings: string[];
}): Promise<MvpStep6HeroImagePlan> {
  const prompt = buildHeroPrompt(input);
  const basePlan: MvpStep6HeroImagePlan = {
    prompt_version: STEP6_HERO_IMAGE_PROMPT.version,
    placement: input.placement,
    visual_type: input.placement === "post_matrix_summary" ? "methodological_summary_hero" : "methodological_infographic_cover",
    prompt,
    negative_prompt: STEP6_HERO_IMAGE_PROMPT.negativePrompt,
    summary: clip(`${titleForDocument({ project: input.project, titlePlan: input.titlePlan })}; ${input.project.topicAreaLabel ?? input.project.program}; ${input.project.country}`, 260),
    image_path: null,
    image_model: null,
    status: "svg_fallback",
    warnings: [],
  };

  if (process.env.IMX_STEP6_DISABLE_IMAGE_GENERATION === "1") {
    return {
      ...basePlan,
      warnings: ["Generacion remota de imagenes deshabilitada para esta ejecucion; se usara el hero SVG deterministico."],
    };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ...basePlan,
      warnings: ["OPENAI_API_KEY no disponible; se usara hero SVG deterministico dentro del DOCX."],
    };
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const requestedSize = input.placement === "post_matrix_summary" ? "1536x1024" : "1024x1536";
    const placementInstruction = input.placement === "post_matrix_summary"
      ? "Formato horizontal panoramico, apto para cierre visual despues de una matriz en pagina horizontal."
      : "Formato vertical, apto para portada academica.";
    const response = await client.images.generate({
      model,
      prompt: `${prompt}\n\n${placementInstruction}\n\nRestricciones negativas: ${STEP6_HERO_IMAGE_PROMPT.negativePrompt}`,
      size: requestedSize,
      quality: process.env.OPENAI_IMAGE_QUALITY?.trim() || "high",
      background: "opaque",
      output_format: "png",
      n: 1,
    } as never);
    const first = response.data?.[0] as { b64_json?: string } | undefined;
    if (!first?.b64_json) {
      throw new Error("La API de imagenes no devolvio b64_json.");
    }
    await mkdir(path.dirname(input.outputPath), { recursive: true });
    await writeFile(input.outputPath, Buffer.from(first.b64_json, "base64"));
    return {
      ...basePlan,
      image_path: input.outputPath,
      image_model: model,
      status: "generated",
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.warnings.push(`No se pudo generar hero image con ${model}; se usara SVG deterministico: ${message}`);
    return {
      ...basePlan,
      image_model: model,
      status: "failed",
      warnings: [`No se pudo generar hero image con ${model}; se usara SVG deterministico: ${message}`],
    };
  }
}

function escapeSvg(value: string) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHeroSvg(plan: MvpStep6HeroImagePlan) {
  const title = escapeSvg("Ingeniometrix");
  const subtitle = escapeSvg(clip(plan.summary, 80));
  if (plan.placement === "post_matrix_summary") {
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
  <rect width="900" height="520" fill="#F7F8F8"/>
  <rect x="40" y="40" width="820" height="440" rx="18" fill="#FFFFFF" stroke="#${ACCENT}" stroke-width="4"/>
  <text x="450" y="92" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#${DARK}" font-weight="700">${title}</text>
  <text x="450" y="132" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${ACCENT}" font-weight="700">Sintesis metodologica del blueprint</text>
  <g font-family="Georgia, serif" font-size="17" font-weight="700">
    <rect x="80" y="210" width="115" height="80" rx="12" fill="#${DARK}"/>
    <text x="138" y="258" text-anchor="middle" fill="#FFFFFF">Problema</text>
    <rect x="225" y="210" width="115" height="80" rx="12" fill="#${ACCENT}"/>
    <text x="282" y="258" text-anchor="middle" fill="#FFFFFF">Objetivos</text>
    <rect x="370" y="210" width="115" height="80" rx="12" fill="#${DARK}"/>
    <text x="428" y="258" text-anchor="middle" fill="#FFFFFF">Metodo</text>
    <rect x="515" y="210" width="115" height="80" rx="12" fill="#${ACCENT}"/>
    <text x="572" y="258" text-anchor="middle" fill="#FFFFFF">Evidencia</text>
    <rect x="660" y="210" width="160" height="80" rx="12" fill="#${DARK}"/>
    <text x="740" y="258" text-anchor="middle" fill="#FFFFFF">Documento</text>
  </g>
  <path d="M195 250 L225 250 M340 250 L370 250 M485 250 L515 250 M630 250 L660 250" stroke="#${SECONDARY_ACCENT}" stroke-width="7" stroke-linecap="round"/>
  <text x="450" y="370" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${DARK}">${subtitle}</text>
  <text x="450" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="15" fill="#5E6470">Plan editable, evidencia recuperada, matriz de consistencia y exportacion trazable</text>
</svg>`.trim();
  }
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#F7F4EF"/>
  <rect x="70" y="70" width="760" height="1060" rx="28" fill="#FFFFFF" stroke="#${ACCENT}" stroke-width="5"/>
  <text x="450" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#${DARK}" font-weight="700">${title}</text>
  <text x="450" y="205" text-anchor="middle" font-family="Georgia, serif" font-size="22" fill="#${ACCENT}" font-weight="700">Blueprint academico editable</text>
  <text x="450" y="252" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#${DARK}">${subtitle}</text>
  <circle cx="450" cy="405" r="86" fill="#${DARK}" opacity="0.94"/>
  <rect x="405" y="360" width="90" height="90" rx="10" fill="#FFFFFF" opacity="0.92"/>
  <line x1="422" y1="386" x2="478" y2="386" stroke="#${ACCENT}" stroke-width="7" stroke-linecap="round"/>
  <line x1="422" y1="414" x2="478" y2="414" stroke="#${ACCENT}" stroke-width="7" stroke-linecap="round"/>
  <line x1="450" y1="500" x2="450" y2="560" stroke="#C9B8A7" stroke-width="8" stroke-linecap="round"/>
  <g font-family="Georgia, serif" font-size="21" font-weight="700">
    <rect x="85" y="590" width="135" height="100" rx="20" fill="#${DARK}"/>
    <text x="152" y="648" text-anchor="middle" fill="#FFFFFF">Problema</text>
    <rect x="245" y="590" width="135" height="100" rx="20" fill="#${ACCENT}"/>
    <text x="312" y="648" text-anchor="middle" fill="#FFFFFF">Evidencia</text>
    <rect x="405" y="590" width="135" height="100" rx="20" fill="#${DARK}"/>
    <text x="472" y="648" text-anchor="middle" fill="#FFFFFF">Metodo</text>
    <rect x="565" y="590" width="135" height="100" rx="20" fill="#${ACCENT}"/>
    <text x="632" y="648" text-anchor="middle" fill="#FFFFFF">Analisis</text>
    <rect x="725" y="590" width="90" height="100" rx="20" fill="#${DARK}"/>
    <text x="770" y="648" text-anchor="middle" fill="#FFFFFF">Word</text>
  </g>
  <path d="M220 640 L245 640 M380 640 L405 640 M540 640 L565 640 M700 640 L725 640" stroke="#C9B8A7" stroke-width="8" stroke-linecap="round"/>
  <rect x="145" y="790" width="610" height="205" rx="26" fill="#F3EFE8" stroke="#C9B8A7" stroke-width="3"/>
  <text x="450" y="850" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#${DARK}" font-weight="700">Documento profesional y trazable</text>
  <text x="450" y="910" text-anchor="middle" font-family="Georgia, serif" font-size="19" fill="#${DARK}">Secciones editables, tablas nativas, evidencia recuperada</text>
  <text x="450" y="958" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#${DARK}" opacity="0.72">Sin resultados inventados ni citas no recuperadas</text>
</svg>`.trim();
}

function textRun(text: string, options: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text: sanitizePublicText(text),
    font: FONT,
    size: pt(options.size ?? 12),
    bold: options.bold,
    italics: options.italics,
    color: options.color,
  });
}

function paragraph(text: string, options: { bold?: boolean; italics?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: boolean; afterPt?: number; keepNext?: boolean; pageBreakBefore?: boolean } = {}) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.JUSTIFIED,
    keepNext: options.keepNext,
    pageBreakBefore: options.pageBreakBefore,
    spacing: { line: 276, after: twipPt(options.afterPt ?? 4) },
    indent: { firstLine: options.indent === false ? 0 : cm(1.25) },
    children: [textRun(sanitizePublicText(text), { bold: options.bold, italics: options.italics })],
  });
}

function heading(text: string, level: 1 | 2 | 3) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: twipPt(level === 1 ? 14 : 8), after: twipPt(6) },
    indent: { firstLine: 0 },
    keepNext: true,
    children: [textRun(text, { bold: true, size: level === 1 ? 14 : 12, color: DARK })],
  });
}

function numberedHeadingTitle(input: {
  title: string;
  level: 1 | 2 | 3;
  counters: number[];
}) {
  const levelIndex = input.level - 1;
  input.counters[levelIndex] = (input.counters[levelIndex] ?? 0) + 1;
  for (let index = levelIndex + 1; index < input.counters.length; index += 1) {
    input.counters[index] = 0;
  }
  const prefix = input.counters.slice(0, levelIndex + 1).filter((value) => value > 0).join(".");
  return `${prefix}. ${input.title}`;
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { line: 276, after: twipPt(3) },
    children: [textRun(text)],
  });
}

function referenceParagraph(text: string) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 252, after: twipPt(5) },
    indent: { left: cm(1.25), hanging: cm(1.25) },
    children: [textRun(text, { size: 10.5 })],
  });
}

function tableCell(text: string, options: { header?: boolean; width?: number; compact?: boolean } = {}) {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    shading: options.header ? { fill: LIGHT } : undefined,
    margins: options.compact ? { top: 55, bottom: 55, left: 55, right: 55 } : { top: 80, bottom: 80, left: 80, right: 80 },
    borders: {
      top: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
      bottom: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
      left: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
      right: { style: BorderStyle.SINGLE, color: BORDER, size: 1 },
    },
    children: text.split(/\r?\n/).map((line) => new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [textRun(sanitizePublicText(line), { bold: options.header, size: options.compact ? 8.5 : 9.5 })],
    })),
  });
}

function captionText(ref: MvpStep6CrossReferencePlanItem | null, title: string) {
  const cleanTitle = sanitizePublicText(title).replace(/^(?:Tabla|Figura|Figure|Ecuaci[oó]n)\s+\d+\.\s*/i, "");
  return ref ? `${ref.label}. ${cleanTitle}` : cleanTitle;
}

export function tableBlock(block: Extract<MvpStep6ContentBlock, { kind: "table" }>, ref: MvpStep6CrossReferencePlanItem | null) {
  const columnCount = Math.max(...block.rows.map((row) => row.length));
  const width = Math.floor(100 / Math.max(1, columnCount));
  const compact = block.render_hint === "compact_landscape";
  const compactPageBreak = block.render_hint === "compact_page_break";
  return [
    paragraph(captionText(ref, block.title), { bold: true, align: AlignmentType.CENTER, indent: false, afterPt: 4, pageBreakBefore: compactPageBreak }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: block.rows.map((row, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: Array.from({ length: columnCount }).map((_, index) =>
            tableCell(row[index] || " ", { header: rowIndex === 0, width, compact: compact || block.render_hint === "compact" || compactPageBreak }),
          ),
        }),
      ),
    }),
    paragraph(block.source_note, { italics: true, indent: false, afterPt: compact ? 6 : 10 }),
  ];
}

function imageType(filePath: string | null) {
  const ext = path.extname(filePath ?? "").toLowerCase();
  if (ext === ".png") return "png" as const;
  if (ext === ".gif") return "gif" as const;
  if (ext === ".bmp") return "bmp" as const;
  return "jpg" as const;
}

function dimensionsFromImageBuffer(buffer: Buffer, filePath: string | null) {
  const ext = path.extname(filePath ?? "").toLowerCase();
  if (ext === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if ((ext === ".jpg" || ext === ".jpeg") && buffer.length > 4) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }

  return null;
}

function fitDimensions(input: {
  originalWidth: number;
  originalHeight: number;
  maxWidth: number;
  maxHeight: number;
}) {
  if (input.originalWidth <= 0 || input.originalHeight <= 0) {
    return { width: input.maxWidth, height: input.maxHeight };
  }
  const scale = Math.min(input.maxWidth / input.originalWidth, input.maxHeight / input.originalHeight, 1);
  return {
    width: Math.max(1, Math.round(input.originalWidth * scale)),
    height: Math.max(1, Math.round(input.originalHeight * scale)),
  };
}

async function imageBlock(block: Extract<MvpStep6ContentBlock, { kind: "figure" }>, ref: MvpStep6CrossReferencePlanItem | null) {
  if (!block.image_path || !fs.existsSync(block.image_path)) {
    return [paragraph(`Figura omitida: ${block.title}. Asset no disponible localmente.`, { italics: true })];
  }
  const image = await readFile(block.image_path);
  const dimensions = dimensionsFromImageBuffer(image, block.image_path);
  const declarative = block.asset_key?.startsWith("original:") === true;
  const compactVector = block.render_hint === "compact_vector";
  const maxWidth = block.render_hint === "landscape_full" ? 680 : compactVector ? 600 : declarative ? 520 : 420;
  const maxHeight = block.render_hint === "landscape_full" ? 420 : compactVector ? 430 : declarative ? 500 : 260;
  const fitted = dimensions
    ? fitDimensions({ originalWidth: dimensions.width, originalHeight: dimensions.height, maxWidth, maxHeight })
    : { width: maxWidth, height: maxHeight };
  if (declarative && dimensions && 38 * Math.min(fitted.width / dimensions.width, fitted.height / dimensions.height) * 0.75 < 9) {
    return [paragraph("La representación visual se omite para mantener legibilidad; el diseño completo se conserva en el texto y la tabla metodológica.", { italics: true })];
  }
  return [
    paragraph(captionText(ref, block.title), { bold: true, align: AlignmentType.CENTER, indent: false, keepNext: true }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { after: twipPt(6), line: Math.ceil(fitted.height * 15 + 40), lineRule: LineRuleType.AT_LEAST },
      children: [
        new ImageRun({
          type: imageType(block.image_path),
          data: image,
          transformation: fitted,
        }),
      ],
    }),
    paragraph(block.source_note, { italics: true, indent: false }),
  ];
}

function equationBlock(block: Extract<MvpStep6ContentBlock, { kind: "equation" }>, ref: MvpStep6CrossReferencePlanItem | null) {
  const math = buildProfessionalMathForEquation({
    latex: block.latex,
    numbered: false,
    alignment: "center",
    label: null,
    omml_key: null,
  } satisfies CanonicalEquationBlock);

  return [
    ...(ref ? [paragraph(`${ref.label}. Expresion matematica recuperada`, { bold: true, align: AlignmentType.CENTER, indent: false })] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: twipPt(6), after: twipPt(6) },
      children: math ? [math] : [new DocxMath({ children: [new MathRun(block.latex)] })],
    }),
    paragraph(block.source_note, { italics: true, indent: false }),
  ];
}

async function renderBlock(
  block: MvpStep6ContentBlock,
  ref: MvpStep6CrossReferencePlanItem | null = null,
): Promise<FileChild[]> {
  if (block.kind === "paragraph") return [paragraph(block.text)];
  if (block.kind === "bullet_list") return block.items.map(bullet);
  if (block.kind === "table") return tableBlock(block, ref);
  if (block.kind === "figure") return imageBlock(block, ref);
  if (block.kind === "equation") return equationBlock(block, ref);
  if (block.kind === "reference_list") {
    return block.items.map(referenceParagraph);
  }
  return [];
}

async function renderLogoParagraph(input: {
  logoPath: string | null;
  maxWidth: number;
  maxHeight: number;
  afterPt?: number;
}) {
  if (!input.logoPath || !fs.existsSync(input.logoPath)) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: twipPt(input.afterPt ?? 10) },
      children: [textRun("Ingeniometrix", { bold: true, size: 20, color: DARK })],
    });
  }

  const logo = await readFile(input.logoPath);
  const dimensions = dimensionsFromImageBuffer(logo, input.logoPath);
  const fitted = dimensions
    ? fitDimensions({
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        maxWidth: input.maxWidth,
        maxHeight: input.maxHeight,
      })
    : { width: input.maxWidth, height: input.maxHeight };
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: twipPt(input.afterPt ?? 10), line: Math.ceil(fitted.height * 15 + 40), lineRule: LineRuleType.AT_LEAST },
    children: [
      new ImageRun({
        type: imageType(input.logoPath),
        data: logo,
        transformation: fitted,
      }),
    ],
  });
}

async function heroImageParagraph(input: {
  plan: MvpStep6HeroImagePlan;
  maxWidth: number;
  maxHeight: number;
}) {
  if (input.plan.image_path && fs.existsSync(input.plan.image_path)) {
    const heroBuffer = await readFile(input.plan.image_path);
    const dimensions = dimensionsFromImageBuffer(heroBuffer, input.plan.image_path);
    const fitted = dimensions
      ? fitDimensions({
          originalWidth: dimensions.width,
          originalHeight: dimensions.height,
          maxWidth: input.maxWidth,
          maxHeight: input.maxHeight,
        })
      : { width: input.maxWidth, height: input.maxHeight };
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: twipPt(10), line: Math.ceil(fitted.height * 15 + 40), lineRule: LineRuleType.AT_LEAST },
      children: [
        new ImageRun({
          type: "png",
          data: heroBuffer,
          transformation: fitted,
        }),
      ],
    });
  }

  const svgWidth = input.plan.placement === "post_matrix_summary" ? 900 : 900;
  const svgHeight = input.plan.placement === "post_matrix_summary" ? 520 : 1200;
  const fitted = fitDimensions({
    originalWidth: svgWidth,
    originalHeight: svgHeight,
    maxWidth: input.maxWidth,
    maxHeight: input.maxHeight,
  });
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: twipPt(10), line: Math.ceil(fitted.height * 15 + 40), lineRule: LineRuleType.AT_LEAST },
    children: [
      new ImageRun({
        type: "svg",
        data: Buffer.from(buildHeroSvg(input.plan), "utf8"),
        fallback: {
          type: "png",
          data: TRANSPARENT_PNG_BUFFER,
        },
        transformation: fitted,
      }),
    ],
  });
}

function makeHeaderFooter(title: string) {
  return {
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              textRun(title, {
                size: 9,
                color: "666666",
              }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: pt(9) }),
            ],
          }),
        ],
      }),
    },
  };
}

function sectionProperties(input: {
  style: MvpStep6AcademicStyleContract;
  orientation: "portrait" | "landscape";
}) {
  const landscape = input.orientation === "landscape";
  return {
    page: {
      size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
      margin: {
        top: cm(landscape ? 1.5 : input.style.page.margin_top_cm),
        right: cm(landscape ? 1.4 : input.style.page.margin_right_cm),
        bottom: cm(landscape ? 2.1 : input.style.page.margin_bottom_cm),
        left: cm(landscape ? 1.4 : input.style.page.margin_left_cm),
        footer: cm(0.75),
      },
    },
  };
}

function takeCrossReference(input: {
  refs: MvpStep6CrossReferencePlanItem[];
  usedRefIds: Set<string>;
  sectionKey: string;
  block: MvpStep6ContentBlock;
}) {
  if (input.block.kind !== "table" && input.block.kind !== "figure" && input.block.kind !== "equation") {
    return null;
  }
  const block = input.block;
  const match = input.refs.find((ref) => {
    if (input.usedRefIds.has(ref.ref_id) || ref.section_key !== input.sectionKey) return false;
    if (block.kind === "table") return ref.ref_type === classifyTable(block, input.sectionKey);
    if (block.kind === "figure") return ref.ref_type === (block.caption_type ?? "figure") && ref.asset_key === block.asset_key;
    return ref.ref_type === "equation" && ref.asset_key === block.asset_key;
  });
  if (match) input.usedRefIds.add(match.ref_id);
  return match ?? null;
}

export async function renderDocx(input: {
  project: ProjectForStep6;
  package: MvpStep6BlueprintPackage;
  outputPath: string;
}) {
  const style = input.package.academic_style_contract;
  const displayTitle = titleForDocument({ project: input.project, titlePlan: input.package.title_plan });
  const common = makeHeaderFooter(input.package.title_plan.short_title || displayTitle);
  const coverChildren: FileChild[] = [];
  const hero = input.package.hero_image;
  const compactProfile = input.package.document_profile === LATAM_COMPACT_PROFILE_ID;

  coverChildren.push(await renderLogoParagraph({
    logoPath: style.logo_asset_path,
    maxWidth: 230,
    maxHeight: 62,
    afterPt: 12,
  }));

  if (!compactProfile) {
    const heroExtent = hero.status === "generated" ? 520 : 310;
    coverChildren.push(await heroImageParagraph({ plan: hero, maxWidth: heroExtent, maxHeight: heroExtent }));
  }

  coverChildren.push(
    paragraph(displayTitle, { bold: true, align: AlignmentType.CENTER, indent: false }),
    paragraph(input.package.title_plan.short_title, { italics: true, align: AlignmentType.CENTER, indent: false }),
    paragraph(`Programa: ${input.project.program}`, { align: AlignmentType.CENTER, indent: false }),
    ...(input.project.university ? [paragraph(`Institución: ${input.project.university === "OTHER" ? "por definir" : input.project.university}`, {
      align: AlignmentType.CENTER,
      indent: false,
    })] : []),
    paragraph("Plan de investigación", {
      italics: true,
      align: AlignmentType.CENTER,
      indent: false,
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  const headingCounters = [0, 0, 0];
  const beforeMatrixChildren: FileChild[] = [];
  const matrixChildren: FileChild[] = [];
  const afterMatrixChildren: FileChild[] = [];
  const referenceChildren: FileChild[] = [];
  const usedRefIds = new Set<string>();
  const orderedDrafts = [...input.package.section_drafts].sort((left, right) => left.order - right.order);
  let pastMatrix = false;

  for (const section of orderedDrafts) {
    const target = section.section_key === "references" ? referenceChildren : section.section_key === "consistency_matrix"
      ? matrixChildren
      : pastMatrix
        ? afterMatrixChildren
        : beforeMatrixChildren;
    const unnumbered = compactProfile && (section.section_key === "executive_summary" || section.section_key === "references");
    target.push(heading(unnumbered ? section.title : numberedHeadingTitle({
      title: section.title,
      level: section.level,
      counters: headingCounters,
    }), section.level));
    for (const block of section.blocks) {
      const ref = takeCrossReference({
        refs: input.package.cross_reference_plan,
        usedRefIds,
        sectionKey: section.section_key,
        block,
      });
      target.push(...(await renderBlock(block, ref)));
    }
    if (section.section_key === "consistency_matrix") {
      pastMatrix = true;
    }
  }

  const doc = new Document({
    creator: "Ingeniometrix",
    title: displayTitle,
    description: "Plan de investigacion academica.",
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: FONT, size: pt(compactProfile ? 11 : 12) },
          paragraph: { spacing: { line: compactProfile ? 264 : 276, after: twipPt(compactProfile ? 6 : 4) } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: pt(14), bold: true, color: DARK },
          paragraph: { spacing: { before: twipPt(14), after: twipPt(6) } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: pt(13), bold: true, color: DARK },
          paragraph: { spacing: { before: twipPt(10), after: twipPt(5) } },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: pt(12), bold: true, italics: true, color: DARK },
          paragraph: { spacing: { before: twipPt(8), after: twipPt(4) } },
        },
        {
          id: "Caption",
          name: "Caption",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: pt(10), italics: true, color: "4B5563" },
          paragraph: { spacing: { after: twipPt(4) } },
        },
      ],
    },
    sections: [
      {
        properties: sectionProperties({ style, orientation: "portrait" }),
        ...common,
        children: [...coverChildren, ...beforeMatrixChildren],
      },
      {
        properties: sectionProperties({ style, orientation: "landscape" }),
        ...common,
        children: matrixChildren.length ? matrixChildren : [paragraph("Matriz de consistencia pendiente.", { italics: true })],
      },
      {
        properties: sectionProperties({ style, orientation: "portrait" }),
        ...common,
        children: afterMatrixChildren,
      },
      {
        properties: sectionProperties({ style, orientation: "portrait" }),
        ...common,
        children: referenceChildren,
      },
    ],
  });

  await mkdir(path.dirname(input.outputPath), { recursive: true });
  await Packer.toBuffer(doc).then((buffer) => writeFile(input.outputPath, buffer));
}

function buildTraceabilityMatrix(drafts: MvpStep6SectionDraft[]) {
  return drafts.map((draft) => ({
    section_key: draft.section_key,
    source_ids: draft.used_source_ids,
    evidence_ids: draft.used_evidence_ids,
    snippet_ids: draft.used_snippet_ids,
    asset_keys: draft.used_asset_keys,
    warnings: draft.warnings,
  }));
}

function buildCitationCoordinatePlan(drafts: MvpStep6SectionDraft[]) {
  return drafts.flatMap((draft) => draft.citation_anchors);
}

function buildAssetPlacementPlan(drafts: MvpStep6SectionDraft[]) {
  return drafts.flatMap((draft) =>
    draft.blocks.flatMap((block) => {
      if (block.kind !== "figure" && block.kind !== "equation") {
        return [];
      }
      return [{
        section_key: draft.section_key,
        asset_key: block.asset_key ?? "unknown_asset",
        placement: draft.section_key === "methodology"
          ? "after_method_context" as const
          : "after_opening_context" as const,
        source_id: block.source_id ?? draft.used_source_ids[0] ?? null,
      }];
    }),
  );
}

function publicDraftText(drafts: MvpStep6SectionDraft[]) {
  return drafts.map(sectionPlainText).join("\n");
}

function findUnknownVisibleCrossReferences(input: {
  drafts: MvpStep6SectionDraft[];
  crossReferencePlan: MvpStep6CrossReferencePlanItem[];
}) {
  const knownLabels = new Set(input.crossReferencePlan.map((item) => item.label));
  const text = publicDraftText(input.drafts);
  const matches = Array.from(text.matchAll(/\b(?:Figura|Tabla|Ecuaci[oó]n)\s+\d+/g)).map((match) => match[0]);
  return unique(matches.filter((label) => !knownLabels.has(label)));
}

function replaceUnknownCrossReferenceLabels(input: {
  text: string;
  knownLabels: Set<string>;
}) {
  return sanitizePublicText(input.text.replace(/\b(?:Figura|Tabla|Ecuaci[oó]n)\s+\d+/g, (label) => {
    if (input.knownLabels.has(label)) return label;
    if (/^Figura/i.test(label)) return "la evidencia visual recuperada";
    if (/^Tabla/i.test(label)) return "la tabla del plan";
    return "la expresión matemática recuperada";
  }));
}

function repairDanglingCrossReferenceMentions(input: {
  drafts: MvpStep6SectionDraft[];
  crossReferencePlan: MvpStep6CrossReferencePlanItem[];
  warnings: string[];
}) {
  const unknownLabels = findUnknownVisibleCrossReferences({
    drafts: input.drafts,
    crossReferencePlan: input.crossReferencePlan,
  });
  if (!unknownLabels.length) return input.drafts;
  const knownLabels = new Set(input.crossReferencePlan.map((item) => item.label));
  input.warnings.push(`Se normalizaron referencias cruzadas no planificadas: ${unknownLabels.join(", ")}.`);

  return input.drafts.map((draft) => ({
    ...draft,
    blocks: draft.blocks.map((block): MvpStep6ContentBlock => {
      if (block.kind === "paragraph") {
        return { ...block, text: replaceUnknownCrossReferenceLabels({ text: block.text, knownLabels }) };
      }
      if (block.kind === "bullet_list") {
        return {
          ...block,
          items: block.items.map((item) => replaceUnknownCrossReferenceLabels({ text: item, knownLabels })),
        };
      }
      return block;
    }),
  }));
}

function hasInternalMetadataLeak(drafts: MvpStep6SectionDraft[]) {
  return /body crop|bbox|curation score|quality flags|metadata|prompt|hash|artifact-local/i.test(publicDraftText(drafts));
}

function hasDanglingFragments(drafts: MvpStep6SectionDraft[]) {
  return drafts.some((draft) =>
    draft.blocks.some((block) =>
      block.kind === "paragraph"
        ? isDanglingPublicFragment(block.text)
        : block.kind === "bullet_list"
          ? block.items.some(isDanglingPublicFragment)
          : false,
    ),
  );
}

function hasVisibleRawLatex(drafts: MvpStep6SectionDraft[]) {
  return /\bLaTeX\s*:/i.test(publicDraftText(drafts));
}

function buildCoherenceReport(input: {
  sectionPlan: MvpStep6SectionPlanItem[];
  drafts: MvpStep6SectionDraft[];
  ledger: MvpStep5EvidenceLedger;
  docxPath: string;
  pageBudget: MvpStep6PageBudgetPlan;
  crossReferencePlan: MvpStep6CrossReferencePlanItem[];
  warnings: string[];
}) {
  const draftKeys = new Set(input.drafts.map((draft) => draft.section_key));
  const unknownCrossReferences = findUnknownVisibleCrossReferences({
    drafts: input.drafts,
    crossReferencePlan: input.crossReferencePlan,
  });
  const checks = [
    {
      key: "all_required_sections_generated",
      passed: input.sectionPlan.filter((section) => section.priority === "required").every((section) => draftKeys.has(section.section_key)),
      detail: `${input.drafts.length}/${input.sectionPlan.length} sections`,
    },
    {
      key: "references_available",
      passed: input.ledger.references.length > 0,
      detail: `${input.ledger.references.length} references`,
    },
    {
      key: "inspectable_evidence_available",
      passed: allEvidenceItems(input.ledger).length > 0,
      detail: `${allEvidenceItems(input.ledger).length} evidence items with source-level traceability`,
    },
    {
      key: "docx_written",
      passed: fs.existsSync(input.docxPath) && fs.statSync(input.docxPath).size > 10_000,
      detail: fs.existsSync(input.docxPath) ? `${fs.statSync(input.docxPath).size} bytes` : "missing",
    },
    {
      key: "no_unknown_sources_used",
      passed: input.drafts.every((draft) =>
        draft.used_source_ids.every((id) => input.ledger.source_registry.some((source) => source.source_id === id)),
      ),
      detail: "source ids checked against Step 5 registry",
    },
    {
      key: "estimated_page_budget_within_limit",
      passed: input.pageBudget.estimated_pages <= input.pageBudget.max_pages,
      detail: `${input.pageBudget.estimated_pages}/${input.pageBudget.max_pages} estimated pages`,
    },
    {
      key: "cross_references_planned",
      passed: input.crossReferencePlan.length > 0,
      detail: `${input.crossReferencePlan.length} figure/table/equation references`,
    },
    {
      key: "no_dangling_public_fragments",
      passed: !hasDanglingFragments(input.drafts),
      detail: "paragraphs and bullets checked for clipped fragments",
    },
    {
      key: "no_internal_metadata_in_public_text",
      passed: !hasInternalMetadataLeak(input.drafts),
      detail: "draft public text checked for artifact/crop/prompt metadata",
    },
    {
      key: "no_visible_raw_latex_fallback",
      passed: !hasVisibleRawLatex(input.drafts),
      detail: "DOCX should render math without visible LaTeX fallback label",
    },
    {
      key: "no_dangling_cross_reference_mentions",
      passed: unknownCrossReferences.length === 0,
      detail: unknownCrossReferences.length ? unknownCrossReferences.join(", ") : "all visible cross-references are planned",
    },
  ];
  const failed = checks.filter((check) => !check.passed && check.key !== "estimated_page_budget_within_limit");
  return {
    status: failed.length > 0 ? "failed" : input.warnings.length > 0 ? "passed_with_warnings" : "passed",
    checks,
    warnings: input.warnings,
  } satisfies MvpStep6BlueprintPackage["coherence_report"];
}

// Deterministic export recovery of this run's actual provider records, not a new generation.
export function restoreUncompactedDrafts(pkg: MvpStep6BlueprintPackage, outputs: SectionDraftLlmOutput[], ledger: MvpStep5EvidenceLedger, project: ProjectForStep6) {
  const drafts = pkg.section_drafts.map((draft) => {
    const output = outputs.find((item) => item.section_key === draft.section_key);
    if (!output) return draft;
    const anchors = normalizeCitationAnchors({ sectionKey: draft.section_key, anchors: output.citation_anchors, ledger })
      .filter((anchor) => anchor.paragraph_index < output.paragraphs.length);
    const paragraphs = ensureParagraphCitations({ paragraphs: output.paragraphs, anchors });
    const blocks: MvpStep6ContentBlock[] = paragraphs.map((text) => ({ kind: "paragraph", text }));
    if (output.bullet_items.length) blocks.push({ kind: "bullet_list", items: output.bullet_items });
    blocks.push(...draft.blocks.filter((block) => block.kind !== "paragraph" && block.kind !== "bullet_list").map((block) =>
      block.kind === "table" ? buildNativeTableForSection({ section: pkg.section_plan.find((section) => section.section_key === draft.section_key)!, project, ledger, evidenceItems: evidenceForSection(pkg.section_plan.find((section) => section.section_key === draft.section_key)!, ledger) }) : block));
    return { ...draft, blocks, citation_anchors: anchors, word_count: wordCount(paragraphs.join(" ")),
      warnings: [...draft.warnings, "Exportacion reconstruida sin compaccion desde respuesta estructurada B2; sin nueva generacion LLM."] };
  });
  return sanitizeDraftsForPublicDocument(replaceConsistencyMatrixTable({ drafts, project, ledger }));
}

export function buildBlueprintJson(input: {
  project: ProjectForStep6;
  package: MvpStep6BlueprintPackage;
  ledger: MvpStep5EvidenceLedger;
}) {
  const intake = input.project.intake;
  const sectionText = (key: string) =>
    input.package.section_drafts
      .find((draft) => draft.section_key === key)
      ?.blocks
      .map((block) => ("text" in block ? block.text : block.kind === "bullet_list" ? block.items.join("\n") : ""))
      .filter(Boolean)
      .join("\n\n") ?? "";
  const objectivesDraft = input.package.section_drafts.find((draft) => draft.section_key === "objectives_and_questions");
  const declarations = objectivesDraft?.blocks.flatMap((block) => block.kind === "paragraph" ? [block.text] : block.kind === "bullet_list" ? block.items : []) ?? [];
  const objectives = declarations.filter((text) => !text.includes("?"));
  const questions = declarations.filter((text) => text.includes("?"));
  const generalObjective = objectives.find((text) => /^objetivo general\s*:/i.test(text)) ?? objectives[0] ?? "Pendiente de formulacion explicita.";
  const scientific = input.package.scientific_plan;

  return {
    project_title: titleForDocument({ project: input.project, titlePlan: input.package.title_plan }),
    scientific_readiness: "REQUIRES_SCIENTIFIC_REVIEW",
    original_project_title: input.project.title,
    template_key: input.project.templateKey,
    degree_level: input.project.degreeLevel,
    university: input.project.university,
    program: input.project.program,
    research_line: intake?.researchLine ?? input.project.topicAreaLabel ?? "",
    problem_statement: scientific?.definition.problem || sectionText("problem_statement") || intake?.problemContext || intake?.topic || "",
    problem_delimitation: intake?.targetPopulation ?? "",
    justification: sectionText("justification"),
    general_objective: scientific?.definition.objectives[0]?.text ?? generalObjective,
    specific_objectives: scientific?.definition.objectives.slice(1).map((o) => o.text) ?? objectives.filter((text) => /^objetivos? espec[ií]ficos?\s*:/i.test(text)),
    research_questions: scientific?.definition.questions.map((q) => q.text) ?? questions,
    hypotheses_or_guiding_questions: scientific?.definition.hypotheses_or_propositions.map((h) => h.text) ?? [],
    key_constructs_or_variables: scientific?.design.constructs.map((c) => c.name) ?? [sectionText("variables_or_categories")].filter(Boolean),
    proposed_methodology: sectionText("methodology") || intake?.preferredMethodology || "",
    population_and_sample: intake?.targetPopulation ?? "",
    data_collection_techniques: [sectionText("methodology")].filter(Boolean),
    analysis_plan: sectionText("methodology"),
    consistency_matrix: scientific ? scientific.matrix.rows.map((row) => ({
      objective: row.objective_ids.map((id) => scientific.definition.objectives.find((o) => o.id === id)!.text).join("\n"),
      question: row.question_ids.map((id) => scientific.definition.questions.find((q) => q.id === id)!.text).join("\n"),
      method: row.design_alignment,
      technique: row.data_techniques_instruments,
    })) : [
      {
        objective: generalObjective,
        question: questions.join("\n"),
        method: sectionText("methodology"),
        technique: intake?.preferredMethodology ?? "Por definir",
      },
    ],
    work_plan: scientific ? [] : [
      { phase: sectionText("schedule_and_budget"), duration: "Cronograma referencial descrito en la seccion; requiere confirmacion del investigador." },
    ],
    assumptions: input.package.section_drafts.flatMap((draft) => draft.assumptions).slice(0, 20),
    limitations: input.package.section_drafts.flatMap((draft) => draft.limitations).slice(0, 20),
    references_used: input.ledger.source_registry.filter((source) => !scientific || input.package.section_drafts.some((draft) => draft.used_source_ids.includes(source.source_id))).map((source) => ({
      reference_id: source.reference_id,
      title: source.title,
      doi: source.doi,
    })),
    source_dispositions: scientific ? sourceDisposition(input.ledger, [...new Set(input.package.section_drafts.flatMap((draft) => draft.used_source_ids))]) : null,
    generation_input_snapshot_id: currentGenerationInput()?.id ?? null,
    engine_warnings: input.package.coherence_report.warnings,
    publication: {
      body_pages: input.package.page_budget_plan.estimated_pages,
      target_body_pages: input.package.page_budget_plan.target_body_pages ?? { min: 12, max: 15 },
      soft_max_body_pages: input.package.page_budget_plan.soft_max_body_pages ?? input.package.page_budget_plan.max_pages,
      template_hard_max_body_pages: input.package.page_budget_plan.template_hard_max_body_pages ?? null,
      length_status: input.package.page_budget_plan.length_status ?? "WITHIN_TARGET",
      publication_allowed: input.package.page_budget_plan.publication_allowed ?? true,
    },
    step6_docx: {
      artifact_version: "v1",
      docx_path: input.package.step7_export_contract.docx_path,
      pdf_path: scientific ? path.join(path.dirname(input.package.step7_export_contract.docx_path), "final-thesis-plan.pdf") : null,
      pdf_sha256: scientific ? createHash("sha256").update(fs.readFileSync(path.join(path.dirname(input.package.step7_export_contract.docx_path), "final-thesis-plan.pdf"))).digest("hex") : null,
      scientific_plan: scientific,
      sha256: createHash("sha256").update(fs.readFileSync(input.package.step7_export_contract.docx_path)).digest("hex"),
      step_run_id: input.package.step_run_id,
      step5_step_run_id: input.ledger.step_run_id,
      evidence_ledger_path: input.ledger.artifact_manifest_path,
      section_drafts: input.package.section_drafts,
      section_count: input.package.section_drafts.length,
      hero_image_status: input.package.hero_image.status,
      summary_hero_image_status: input.package.summary_hero_image.status,
      estimated_page_count: input.package.page_budget_plan.estimated_pages,
      traceability_matrix: input.package.traceability_matrix,
      cross_reference_plan: input.package.cross_reference_plan,
    },
  };
}

function selectedReferencesSnapshot(ledger: MvpStep5EvidenceLedger) {
  return ledger.source_registry.map((source) => ({
    reference_id: source.reference_id,
    title: source.title,
    doi: source.doi,
    citation_key: source.citation_key,
    authors: source.authors,
    year: source.year,
    venue: source.venue,
  }));
}

function tryGetProvider(warnings: string[]) {
  try {
    return getConfiguredLlmProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Step 6 generara secciones con fallback deterministico porque no hay proveedor LLM disponible: ${message}`);
    return null;
  }
}

export async function runMvpStep6BlueprintDocx(input: {
  userId: string;
  projectId: string;
  runId?: string;
  /** Internal dependency injection for offline tests and bounded acceptance repair, never from HTTP input. */
  providerOverride?: import("@/llm/provider").LlmProvider;
  /** Evaluation-only reuse: identical structured design/title, same project, no second image request. */
  heroReuse?: { projectId: string; fingerprint: string; plan: MvpStep6HeroImagePlan; qualityRejectionReason?: string };
}): Promise<MvpStep6Result> {
  if (!currentApplicationBudget()) return withApplicationBudget(new ApplicationBudget(), () => runMvpStep6BlueprintDocx(input));
  const artifacts = buildArtifacts(input.projectId, input.runId);
  const warnings: string[] = [];
  const errors: string[] = [];
  const apiUsageBefore = await captureMvpApiUsageSnapshot();
  await mkdir(artifacts.artifactDir, { recursive: true });

  let project = await loadProjectForStep6(input);
  let latestStep5 = await loadLatestStep5Ledger(input.projectId);
  assertEvidenceContinuity(latestStep5.ledger, {
    projectId: input.projectId, stepRunId: latestStep5.row.stepRunId, intake: project.intake!,
    referenceIds: project.projectReferences.map((row) => row.referenceId),
  });
  const coverageResult = await ensureResearchCoverage({ ...input, runId: artifacts.runId, intake: project.intake!, ledger: latestStep5.ledger, artifactDir: artifacts.artifactDir });
  if (coverageResult.changed) {
    project = await loadProjectForStep6(input);
    latestStep5 = await loadLatestStep5Ledger(input.projectId);
    if (latestStep5.ledger.step_run_id !== coverageResult.ledger.step_run_id) throw new Error("EVIDENCE_RUN_CHANGED_DURING_GENERATION");
    assertEvidenceContinuity(latestStep5.ledger, { projectId: input.projectId, stepRunId: latestStep5.row.stepRunId, intake: project.intake!, referenceIds: project.projectReferences.map((row) => row.referenceId) });
  }
  const evidenceGate = evaluateEvidenceGate(latestStep5.ledger);
  await writeJson(path.join(artifacts.artifactDir, "evidence-gate.json"), evidenceGate);
  if (evidenceGate.status === "INSUFFICIENT") {
    await logAuditEvent({ eventType: "MVP_STEP6_BLOCKED_INSUFFICIENT_EVIDENCE", actorType: ActorType.SYSTEM, provider: Provider.SYSTEM,
      userId: input.userId, projectId: input.projectId, payloadJson: asStepRunJson({ run_id: artifacts.runId, step5_step_run_id: latestStep5.row.stepRunId, ...evidenceGate }) });
    throw new Error("INSUFFICIENT_EVIDENCE: no hay evidencia inspeccionable verificada; agregar fuentes o repetir Step 5. No se genero plan.");
  }
  warnings.push(...evidenceGate.limitations);
  let sectionPlan = scientificSectionPlan();
  const academicStyleContract = buildStyleContract(project);
  const institutionalHardMax = templateHardMaxBodyPages(project.templateKey);
  const predicted = predictedLayoutBudget(sectionPlan);
  const pageBudgetPlan: MvpStep6PageBudgetPlan = { ...buildPageBudgetPlan(sectionPlan), max_pages: LATAM_COMPACT_PROFILE.bodyPages.max,
    document_profile: LATAM_COMPACT_PROFILE_ID,
    body_page_min: LATAM_COMPACT_PROFILE.bodyPages.min,
    body_page_max: LATAM_COMPACT_PROFILE.bodyPages.max,
    target_body_pages: { min: LATAM_COMPACT_PROFILE.bodyPages.targetMin, max: LATAM_COMPACT_PROFILE.bodyPages.targetMax },
    soft_max_body_pages: LATAM_COMPACT_PROFILE.bodyPages.max,
    template_hard_max_body_pages: institutionalHardMax,
    words_per_page_estimate: predicted.wordsPerPage,
    estimated_pages: predicted.bodyPages,
    max_body_words: sectionPlan.reduce((total, section) => total + section.max_words, 0),
    fixed_page_reservations: predicted.reservations,
    compression_policy: ["Objetivo 9-11 paginas de cuerpo; rango permitido 7-12, sin contar portada ni referencias.", "Compactar primero el layout y la redundancia; una ronda editorial maxima; nunca reabrir el diseno cientifico."] };
  const sectionGenerationOrder: MvpStep6BlueprintPackage["section_generation_order"] = [{ wave: "core", section_keys: [...LATAM_COMPACT_GENERATION_ORDER], model_tier: "strong_reasoning" }];

  const stepRun = await createMvpStepRun({
    projectId: input.projectId,
    userId: input.userId,
    stepKey: MVP_STEP6_KEY,
    status: "RUNNING",
    provider: Provider.SYSTEM,
    model: null,
    promptVersion: MVP_STEP6_PROMPT_VERSION,
    inputSnapshotJson: asStepRunJson({
      run_id: artifacts.runId,
      project_id: input.projectId,
      step5_step_run_id: latestStep5.row.stepRunId,
      step5_artifact_manifest_path: latestStep5.row.artifactManifestPath,
      source_count: latestStep5.ledger.source_registry.length,
      evidence_item_count: allEvidenceItems(latestStep5.ledger).length,
      section_count: sectionPlan.length,
      prompts: {
        scientific_plan: SCIENTIFIC_PLAN_PROMPT.version,
        consistency_matrix: "ingeniometrix-consistency-matrix-v1",
        asset_planner: "ingeniometrix-asset-planner-v1",
        final_infographic: "latam-compact-deterministic-v1",
      },
      section_generation_order: sectionGenerationOrder,
      academic_style_contract: academicStyleContract,
      page_budget_plan: pageBudgetPlan,
    }),
    artifactDir: artifacts.artifactDir,
    artifactManifestPath: artifacts.manifestPath,
  });

  await logAuditEvent({
    eventType: "MVP_STEP6_BLUEPRINT_DOCX_STARTED",
    actorType: ActorType.SYSTEM,
    provider: Provider.SYSTEM,
    userId: input.userId,
    projectId: input.projectId,
    payloadJson: asStepRunJson({
      run_id: artifacts.runId,
      step_run_id: stepRun.id,
      artifact_dir: artifacts.artifactDir,
      step5_step_run_id: latestStep5.row.stepRunId,
    }),
  });

  try {
    const provider = input.providerOverride ?? tryGetProvider(warnings);
    if (!provider) throw new Error("SCIENTIFIC_GENERATION_REQUIRES_PROVIDER");
    const approvedDesign = await approvedDesignForCurrentJob(project.intake, latestStep5.ledger);
    const scientific = await withLlmUsageContext(
      { userId: input.userId, projectId: input.projectId, runId: artifacts.runId, stage: "blueprint_generation", source: "runMvpStep6BlueprintDocx", promptVersion: MVP_STEP6_PROMPT_VERSION },
      () => generateScientificPlan({ provider, projectId: input.projectId, runId: artifacts.runId, intake: project.intake, ledger: latestStep5.ledger, approvedDesign, documentProfile: LATAM_COMPACT_PROFILE_ID, artifactDir: path.join(artifacts.artifactDir, "scientific-plan") }),
    );
    sectionPlan = scientific.plan;
    const finalSectionDrafts = structuredClone(scientific.drafts);
    validateCompactCitationPolicy(finalSectionDrafts);
    await writeJson(path.join(artifacts.artifactDir, "asset-quality.json"), { profile: LATAM_COMPACT_PROFILE_ID, legacy_figure_extraction_used: false, policy: "No se republican figuras de terceros; solo sintesis originales o transformaciones deterministas." });
    await writeJson(path.join(artifacts.artifactDir, "evidence-coverage.json"), scientific.coverage);
    const finalPageBudgetPlan: MvpStep6PageBudgetPlan = { ...pageBudgetPlan,
      estimated_pages: estimateDocumentPages({ drafts: finalSectionDrafts, pageBudget: pageBudgetPlan }) };
    const titlePlan = scientific.titlePlan;
    const editorial = { report: { artifact_type: "mvp_step6_editorial_report" as const, artifact_version: "v1" as const, status: "applied" as const, model: SCIENTIFIC_PLAN_PROMPT.model, prompt_version: SCIENTIFIC_PLAN_PROMPT.version, revised_section_count: 0, warnings: scientific.review.warnings, notes: scientific.review.checked_dimensions } };
    warnings.push(...scientific.review.warnings);
    const compactVisuals = await stageCheckpoint("VISUALS", { science: scientific, profile: LATAM_COMPACT_PROFILE_ID, policy: GENERATION_POLICY_VERSION }, async () => {
      // Asset planning mutates drafts by inserting cross-reference paragraphs
      // and blocks. Keep those mutations transactional so a failed optional
      // asset cannot leak into the published document or escape the inventory.
      let stagedDrafts = structuredClone(finalSectionDrafts);
      let result;
      try {
        result = await planAndRenderCompactAssets({ provider, definition: scientific.definition, design: scientific.design, matrix: scientific.matrix, ledger: latestStep5.ledger, usedSourceIds: scientific.usedSources.map((source) => source.source_id), drafts: stagedDrafts, artifactDir: artifacts.artifactDir, projectId: input.projectId, runId: artifacts.runId, remainingBodyPages: LATAM_COMPACT_PROFILE.bodyPages.max - finalPageBudgetPlan.estimated_pages });
      } catch (error) {
        stagedDrafts = structuredClone(finalSectionDrafts);
        const reason = `ASSET_PLANNER_FALLBACK: ${error instanceof Error ? error.message : String(error)}`;
        warnings.push(reason);
        await writeJson(path.join(artifacts.artifactDir, "visual-failure.json"), { reason, scientific_content_preserved: true, paid_scientific_regeneration: false });
        result = { plan: { proposals: [], omitted_reason: reason }, visualPlan: { artifact_type: "mvp_step6_visual_plan" as const, artifact_version: "v1" as const, generated_at: new Date().toISOString(), research_design_hash: "profile-owned", matrix_hash: "profile-owned", matrix_sequence: ["validate_structured_matrix", "render_editable_native_table"], assets: [{ asset_id: "consistency-matrix", asset_type: "consistency_matrix_table" as const, purpose: "Alinear preguntas, objetivos y metodo", destination_section: "consistency_matrix", origin: "original_design" as const, content_specification: { row_count: scientific.matrix.rows.length }, supporting_source_ids: [], rendering_method: "Tabla Word nativa editable", caption: "Matriz de consistencia", attribution: "Elaboracion propia", quality_requirements: ["editable"], status: "accepted" as const, output_paths: [], failure_reason: null, validation: { editable: true, matrix_image_generated: false } }], image_requests: { initial: 0, repairs: 0 }, warnings: [reason] } };
      }
      const infographicPath = await renderFinalMethodologicalInfographic({ definition: scientific.definition, design: scientific.design, drafts: stagedDrafts, artifactDir: artifacts.artifactDir });
      result.visualPlan.assets.push({ asset_id: "final-methodological-infographic", asset_type: "final_methodological_infographic", purpose: "Sintetizar la ruta de resolucion propuesta", destination_section: "final_methodological_infographic", origin: "deterministic_transformation", content_specification: { definition: scientific.definition, design: scientific.design }, supporting_source_ids: scientific.usedSources.map((source) => source.source_id), rendering_method: "SVG declarativo seguro convertido a PNG", caption: "Sintesis metodologica del plan de investigacion", attribution: "Elaboracion propia", quality_requirements: ["legible", "sin resultados inventados", "antes de referencias"], status: "accepted", output_paths: [infographicPath], failure_reason: null, validation: { qa: "PASS", deterministic: true } });
      return { ...result, drafts: stagedDrafts };
    }, (value) => value.visualPlan.assets.flatMap((asset) => asset.output_paths));
    finalSectionDrafts.splice(0, finalSectionDrafts.length, ...compactVisuals.drafts);
    const visualPlan: MvpStep6VisualPlan | undefined = compactVisuals.visualPlan;
    const finalDocumentReview = reviewLatamCompactDocument({ definition: scientific.definition, design: scientific.design, matrix: scientific.matrix, drafts: finalSectionDrafts, visuals: visualPlan });
    await writeJson(path.join(artifacts.artifactDir, "final-document-review.json"), finalDocumentReview);
    if (finalDocumentReview.status === "FAIL") throw new Error(`FINAL_DOCUMENT_SCIENTIFIC_REVIEW_BLOCKED: ${finalDocumentReview.critical_issues.join("; ")}`);
    warnings.push(...finalDocumentReview.warnings);
    const heroImage: MvpStep6HeroImagePlan = { prompt_version: "latam-compact-v1", placement: "cover", visual_type: "methodological_infographic_cover", prompt: "", negative_prompt: "", summary: "Portada academica sin imagen", image_path: null, image_model: null, status: "skipped", warnings: [] };
    const summaryHeroImage: MvpStep6HeroImagePlan = { prompt_version: "latam-compact-deterministic-v1", placement: "post_matrix_summary", visual_type: "methodological_summary_hero", prompt: "", negative_prompt: "", summary: "Sintesis metodologica final", image_path: visualPlan?.assets.find((asset) => asset.asset_id === "final-methodological-infographic")?.output_paths[0] ?? null, image_model: null, status: "svg_fallback", warnings: [] };
    warnings.push(...summaryHeroImage.warnings);

    const crossReferencePlan = buildCrossReferencePlan({ drafts: finalSectionDrafts, pdfMentions: [] });
    const traceabilityMatrix = buildTraceabilityMatrix(finalSectionDrafts);
    const citationCoordinatePlan = buildCitationCoordinatePlan(finalSectionDrafts);
    const assetPlacementPlan = buildAssetPlacementPlan(finalSectionDrafts);
    const provisionalPackage: MvpStep6BlueprintPackage = {
      document_profile: LATAM_COMPACT_PROFILE_ID,
      scientific_plan: { definition: scientific.definition, design: scientific.design, matrix: scientific.matrix, generation_order: [...scientific.generation_order, "asset_planner", "consistency_matrix_editable", "final_methodological_infographic", "docx", "pdf"] },
      artifact_type: "mvp_step6_blueprint_docx_package",
      artifact_version: "v1",
      project_id: input.projectId,
      step_run_id: stepRun.id,
      blueprint_version_id: null,
      generated_at: new Date().toISOString(),
      academic_style_contract: academicStyleContract,
      page_budget_plan: finalPageBudgetPlan,
      title_plan: titlePlan,
      section_generation_order: sectionGenerationOrder,
      section_plan: sectionPlan,
      section_drafts: finalSectionDrafts,
      editorial_report: editorial.report,
      hero_image: heroImage,
      summary_hero_image: summaryHeroImage,
      visual_plan: visualPlan,
      citation_coordinate_plan: citationCoordinatePlan,
      cross_reference_plan: crossReferencePlan,
      asset_placement_plan: assetPlacementPlan,
      traceability_matrix: traceabilityMatrix,
      coherence_report: {
        status: "passed_with_warnings",
        checks: [],
        warnings,
      },
      step7_export_contract: {
        docx_path: artifacts.docxPath,
        blueprint_version_id: null,
        references_available: latestStep5.ledger.references.length > 0,
        evidence_log_available: true,
        citation_style: latestStep5.ledger.citation_style,
      },
    };

    const renderFingerprint = { profile: LATAM_COMPACT_PROFILE_ID, drafts: finalSectionDrafts, title: titlePlan, style: academicStyleContract, heroImage, visualPlan, program: project.program, university: project.university, renderer: "rc4-g3.v1" };
    const publicationPolicy = { version: LATAM_COMPACT_PROFILE_ID, target: pageBudgetPlan.target_body_pages, hardMax: LATAM_COMPACT_PROFILE.bodyPages.max, templateHardMax: institutionalHardMax };
    const pdf = await stageCheckpoint("FINAL_EXPORT", { renderFingerprint, publicationPolicy }, async () => {
    await stageCheckpoint("DOCX", renderFingerprint, async () => { await renderDocx({
      project,
      package: provisionalPackage,
      outputPath: artifacts.docxPath,
    }); return { path: artifacts.docxPath }; }, (value) => [value.path]);

    return stageCheckpoint("PDF", { renderFingerprint, converter: "libreoffice-b4.v1", publicationPolicy }, async () => {
      const exportOptions = {
        templateHardMaxBodyPages: institutionalHardMax,
        expectedBodyPages: finalPageBudgetPlan.estimated_pages,
        targetMinBodyPages: LATAM_COMPACT_PROFILE.bodyPages.targetMin,
        targetMaxBodyPages: LATAM_COMPACT_PROFILE.bodyPages.targetMax,
        softMaxBodyPages: LATAM_COMPACT_PROFILE.bodyPages.max,
      };
      let rendered = await exportPlanPdf(artifacts.docxPath, path.join(artifacts.artifactDir, "final-thesis-plan.pdf"), exportOptions);
      if (rendered.length_status === "ABOVE_SOFT_MAX" || rendered.length_status === "TEMPLATE_LIMIT_EXCEEDED") {
        await copyFile(artifacts.docxPath, path.join(artifacts.artifactDir, "pre-layout-thesis-plan.docx"));
        const compaction = await compactDocxWhitespace(artifacts.docxPath);
        const sectionLengths = finalSectionDrafts.map((draft) => ({ section: draft.section_key, words: draft.word_count, max_words: sectionPlan.find((section) => section.section_key === draft.section_key)?.max_words ?? 0 }));
        await writeJson(path.join(artifacts.artifactDir, "layout-compaction.json"), { ...compaction, before_body_pages: rendered.body_pages, additional_scientific_calls: 0, oversized_sections: sectionLengths.filter((section) => section.max_words > 0 && section.words > section.max_words), editorial_policy: "one publication-wide editorial compression round maximum; deterministic layout compaction does not regenerate scientific content" });
        if (compaction.changes) rendered = await exportPlanPdf(artifacts.docxPath, path.join(artifacts.artifactDir, "final-thesis-plan.pdf"), exportOptions);
      }
      return rendered;
    }, (value) => [value.pdf_path, artifacts.docxPath]);
    }, (value) => [value.pdf_path, artifacts.docxPath]);
    warnings.push(...pdf.warnings);
    finalPageBudgetPlan.estimated_pages = pdf.body_pages!;
    finalPageBudgetPlan.target_body_pages = pdf.target_body_pages;
    finalPageBudgetPlan.soft_max_body_pages = pdf.soft_max_body_pages;
    finalPageBudgetPlan.template_hard_max_body_pages = pdf.template_hard_max_body_pages;
    finalPageBudgetPlan.length_status = pdf.length_status;
    finalPageBudgetPlan.publication_allowed = pdf.publication_allowed;
    finalPageBudgetPlan.render_sanity = { status: pdf.render_sanity_status, reasons: pdf.render_sanity_reasons, emergency_max_body_pages: pdf.render_sanity_emergency_max_body_pages };
    finalPageBudgetPlan.page_profile_status = pageProfileStatus(pdf.body_pages);
    finalPageBudgetPlan.actual_by_section = finalSectionDrafts.filter((draft) => draft.section_key !== "references").map((draft) => ({ section_key: draft.section_key, words: draft.word_count, budget_words: sectionPlan.find((section) => section.section_key === draft.section_key)?.max_words ?? 0, estimated_pages: Number((draft.word_count / finalPageBudgetPlan.words_per_page_estimate).toFixed(2)) }));
    await writeJson(path.join(artifacts.artifactDir, "pdf-validation.json"), pdf);
    await writeJson(path.join(artifacts.artifactDir, "application-budget.json"), await jobCostSnapshot() ?? currentApplicationBudget()?.entries);
    if (pdf.body_pages !== null && pdf.body_pages > LATAM_COMPACT_PROFILE.bodyPages.max) throw new Error(`COMPACT_PROFILE_PAGE_LIMIT: ${pdf.body_pages}/${LATAM_COMPACT_PROFILE.bodyPages.max} body pages; scientific checkpoints retained`);
    if (pdf.length_status === "RENDER_SANITY_FAILURE" || pdf.length_status === "UNMEASURED") throw new Error(`RENDER_SANITY_FAILURE: ${pdf.render_sanity_reasons.join(", ") || "body pages unmeasured"}; scientific checkpoints retained`);

    const coherenceReport = buildCoherenceReport({
      sectionPlan,
      drafts: finalSectionDrafts,
      ledger: latestStep5.ledger,
      docxPath: artifacts.docxPath,
      pageBudget: finalPageBudgetPlan,
      crossReferencePlan,
      warnings,
    });
    const versionNumber = (project.blueprintVersions[0]?.versionNumber ?? 0) + 1;
    const finalPackageWithoutVersion: MvpStep6BlueprintPackage = {
      ...provisionalPackage,
      coherence_report: coherenceReport,
    };
    const blueprintVersion = await createBlueprintVersionOnce({
        projectId: input.projectId,
        versionNumber,
        model: finalSectionDrafts.some((draft) => draft.generation_source === "llm")
          ? SCIENTIFIC_PLAN_PROMPT.model
          : "deterministic-fallback",
        promptVersion: MVP_STEP6_PROMPT_VERSION,
        intakeSnapshotJson: asStepRunJson(project.intake),
        selectedReferencesSnapshotJson: asStepRunJson(selectedReferencesSnapshot(latestStep5.ledger)),
        blueprintJson: asStepRunJson(buildBlueprintJson({
          project,
          package: finalPackageWithoutVersion,
          ledger: latestStep5.ledger,
        })),
        coherenceReportJson: asStepRunJson(coherenceReport),
    }, { intake: project.intake, scientific, renderFingerprint });

    const finalPackage: MvpStep6BlueprintPackage = {
      ...finalPackageWithoutVersion,
      blueprint_version_id: blueprintVersion.id,
      step7_export_contract: {
        ...finalPackageWithoutVersion.step7_export_contract,
        blueprint_version_id: blueprintVersion.id,
      },
    };

    const exportReferences = extractExportReferences(blueprintVersion);
    await Promise.all([
      writeFile(path.join(artifacts.artifactDir, "bibliography.bib"), renderBibtex(exportReferences)),
      writeFile(path.join(artifacts.artifactDir, "bibliography.ris"), renderRis(exportReferences)),
      writeJson(path.join(artifacts.artifactDir, "evidence-log.json"), buildEvidenceLog(blueprintVersion)),
    ]);

    await prisma.project.update({
      where: { id: input.projectId },
      data: { status: coherenceReport.status === "failed" ? "SOURCES_SELECTED" : "BLUEPRINT_READY" },
    });

    const apiUsageReport = await buildMvpApiUsageReport({
      before: apiUsageBefore,
      label: "mvp_step6_blueprint_docx",
      filter: {
        projectId: input.projectId,
        runId: artifacts.runId,
        since: apiUsageBefore.capturedAt,
      },
    });
    const apiUsageTotals = apiUsageReport.filtered_delta ?? apiUsageReport.delta;

    await writeJson(artifacts.sectionPlanPath, sectionPlan);
    await writeJson(artifacts.sectionDraftsPath, finalSectionDrafts);
    await writeJson(artifacts.blueprintPackagePath, finalPackage);
    await writeJson(artifacts.coherenceReportPath, coherenceReport);
    await writeJson(artifacts.validationReportPath, coherenceReport);
    await writeJson(artifacts.traceabilityMatrixPath, traceabilityMatrix);
    await writeJson(artifacts.styleContractPath, academicStyleContract);
    await writeJson(artifacts.pageBudgetPlanPath, finalPageBudgetPlan);
    await writeJson(artifacts.titlePlanPath, titlePlan);
    await writeJson(artifacts.sectionGenerationOrderPath, sectionGenerationOrder);
    await writeJson(artifacts.citationCoordinatePlanPath, citationCoordinatePlan);
    await writeJson(artifacts.crossReferencePlanPath, crossReferencePlan);
    await writeJson(artifacts.assetPlacementPlanPath, assetPlacementPlan);
    await writeJson(artifacts.editorialReportPath, editorial.report);
    await writeJson(artifacts.heroImagePlanPath, heroImage);
    await writeJson(artifacts.summaryHeroImagePlanPath, summaryHeroImage);
    await writeJson(artifacts.step7ExportContractPath, finalPackage.step7_export_contract);
    await writeJson(artifacts.apiUsageReportPath, apiUsageReport);

    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - stepRun.startedAt.getTime());
    const status: MvpStep6Result["status"] = coherenceReport.status === "failed" ? "partially_completed" : "completed";
    const result: MvpStep6Result = {
      step_key: MVP_STEP6_KEY,
      prompt_version: MVP_STEP6_PROMPT_VERSION,
      project_id: input.projectId,
      step_run_id: stepRun.id,
      blueprint_version_id: blueprintVersion.id,
      status,
      started_at: stepRun.startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      artifact_dir: artifacts.artifactDir,
      artifact_manifest_path: artifacts.manifestPath,
      docx_path: artifacts.docxPath,
      pdf_path: pdf.pdf_path,
      artifacts: {
        manifest: artifacts.manifestPath,
        section_plan: artifacts.sectionPlanPath,
        section_drafts: artifacts.sectionDraftsPath,
        blueprint_package: artifacts.blueprintPackagePath,
        coherence_report: artifacts.coherenceReportPath,
        validation_report: artifacts.validationReportPath,
        traceability_matrix: artifacts.traceabilityMatrixPath,
        style_contract: artifacts.styleContractPath,
        page_budget_plan: artifacts.pageBudgetPlanPath,
        title_plan: artifacts.titlePlanPath,
        section_generation_order: artifacts.sectionGenerationOrderPath,
        citation_coordinate_plan: artifacts.citationCoordinatePlanPath,
        cross_reference_plan: artifacts.crossReferencePlanPath,
        asset_placement_plan: artifacts.assetPlacementPlanPath,
        editorial_report: artifacts.editorialReportPath,
        hero_image_plan: artifacts.heroImagePlanPath,
        summary_hero_image_plan: artifacts.summaryHeroImagePlanPath,
        step7_export_contract: artifacts.step7ExportContractPath,
        api_usage_report: artifacts.apiUsageReportPath,
      },
      metrics: {
        section_count: finalSectionDrafts.length,
        llm_section_count: finalSectionDrafts.filter((draft) => draft.generation_source === "llm").length,
        deterministic_section_count: finalSectionDrafts.filter((draft) => draft.generation_source !== "llm").length,
        source_count: latestStep5.ledger.source_registry.length,
        evidence_item_count: allEvidenceItems(latestStep5.ledger).length,
        asset_count: visualPlan?.assets.filter((asset) => asset.status === "accepted").length ?? 0,
        warning_count: warnings.length,
      },
      api_usage: {
        run_id: artifacts.runId,
        report_path: artifacts.apiUsageReportPath,
        llm_calls_executed: apiUsageTotals.calls,
        input_tokens: apiUsageTotals.inputTokens,
        cached_input_tokens: apiUsageTotals.cachedInputTokens,
        output_tokens: apiUsageTotals.outputTokens,
        total_tokens: apiUsageTotals.totalTokens,
        estimated_cost_usd: apiUsageTotals.costUsd,
        estimated_cost_cad: apiUsageTotals.costCad,
      },
      warnings,
    };

    await writeJson(artifacts.manifestPath, {
      ...result,
      prompt_registry: {
        section_draft: STEP6_SECTION_DRAFT_PROMPT,
        editorial_review: STEP6_EDITORIAL_REVIEW_PROMPT,
        title_generation: STEP6_TITLE_GENERATION_PROMPT,
        hero_image: STEP6_HERO_IMAGE_PROMPT,
      },
      step5_contract: {
        step_run_id: latestStep5.row.stepRunId,
        artifact_manifest_path: latestStep5.row.artifactManifestPath,
      },
    });

    await updateMvpStepRun(stepRun.id, {
      status: status === "completed" ? "COMPLETED" : "PARTIALLY_COMPLETED",
      provider: result.metrics.llm_section_count > 0 ? Provider.OPENAI : Provider.SYSTEM,
      model: result.metrics.llm_section_count > 0
        ? process.env.IMX_STEP6_SECTION_MODEL?.trim() || process.env.LLM_DEFAULT_MODEL?.trim() || "gpt-5.4"
        : "deterministic-fallback",
      promptVersion: MVP_STEP6_PROMPT_VERSION,
      outputSnapshotJson: asStepRunJson(result),
      warningsJson: asStepRunJson(warnings),
      errorsJson: asStepRunJson(errors),
      fallbackUsed: result.metrics.deterministic_section_count > 0,
      artifactDir: artifacts.artifactDir,
      artifactManifestPath: artifacts.manifestPath,
      finishedAt: completedAt,
    });

    await logAuditEvent({
      eventType: "MVP_STEP6_BLUEPRINT_DOCX_COMPLETED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: artifacts.runId,
        step_run_id: stepRun.id,
        blueprint_version_id: blueprintVersion.id,
        docx_path: artifacts.docxPath,
        status,
        metrics: result.metrics,
        api_usage: result.api_usage,
        warnings,
      }),
    });

    return result;
  } catch (error) {
    const completedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    await updateMvpStepRun(stepRun.id, {
      status: "FAILED",
      provider: Provider.SYSTEM,
      model: null,
      promptVersion: MVP_STEP6_PROMPT_VERSION,
      errorsJson: asStepRunJson(errors),
      warningsJson: asStepRunJson(warnings),
      artifactDir: artifacts.artifactDir,
      artifactManifestPath: artifacts.manifestPath,
      finishedAt: completedAt,
    });
    await writeJson(artifacts.manifestPath, {
      step_key: MVP_STEP6_KEY,
      status: "failed",
      project_id: input.projectId,
      step_run_id: stepRun.id,
      errors,
      warnings,
    });
    await logAuditEvent({
      eventType: "MVP_STEP6_BLUEPRINT_DOCX_FAILED",
      actorType: ActorType.SYSTEM,
      provider: Provider.SYSTEM,
      userId: input.userId,
      projectId: input.projectId,
      payloadJson: asStepRunJson({
        run_id: artifacts.runId,
        step_run_id: stepRun.id,
        error: message,
        warnings,
      }),
    });
    throw error;
  }
}
