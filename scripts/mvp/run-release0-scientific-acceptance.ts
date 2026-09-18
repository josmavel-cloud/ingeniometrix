import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { ProjectStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { MIN_SELECTED_REFERENCES } from "@/lib/research-workflow";
import {
  buildEvidenceLog,
  extractExportReferences,
  renderBibtex,
  renderRis,
} from "@/server/blueprint/blueprint-export";
import { readLlmUsageRegistry, sumLlmUsageCalls } from "@/server/llm-usage-registry";
import { MVP_STEP1_KEY, normalizeIntakeForMvpProject } from "@/server/mvp/intake-normalization-service";
import { STEP2_EVIDENCE_INFORMED_REFINEMENT_PROMPT } from "@/server/mvp/prompts/step2-evidence-informed-refinement.v2";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT } from "@/server/mvp/prompts/step5-source-evidence-extraction.v3";
import { STEP6_EDITORIAL_REVIEW_PROMPT } from "@/server/mvp/prompts/step6-editorial-review.v1";
import { STEP6_SECTION_DRAFT_PROMPT } from "@/server/mvp/prompts/step6-section-draft.v2";
import { STEP6_TITLE_GENERATION_PROMPT } from "@/server/mvp/prompts/step6-title-generation.v1";
import { runMvpEvidenceMaterialization } from "@/server/mvp/evidence-materialization-service";
import {
  applyMvpStep4FinalSourceSelection,
  prepareMvpStep3SourceSelection,
  requestMvpStep4AdditionalSources,
  type MvpStep3Candidate,
} from "@/server/mvp/source-selection-service";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";
import {
  applyMvpStep2IntakeChoice,
  MVP_STEP2_KEY,
  runMvpEvidenceInformedTopicRefinement,
} from "@/server/mvp/topic-refinement-service";
import { saveIntakeForProject } from "@/server/projects/project-service";

import { qualitativeEducationFixture } from "./fixtures/qualitative-education-intake";
import { seismicEngineeringFixture } from "./fixtures/seismic-engineering-intake";

type CaseKey = "engineering" | "qualitative" | "negative";

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts-local", "release0-scientific-validation", "b2");
const CASE_KEY = (process.argv.find((value) => value.startsWith("--case="))?.split("=")[1] ?? "") as CaseKey;

const negativeFixture = {
  id: "negative-insufficient-evidence",
  label: "Intake insuficiente con afirmacion metodologica no respaldada",
  project: {
    ...qualitativeEducationFixture.project,
    title: "Aplicacion para elevar el rendimiento de todos los universitarios peruanos",
    topicSeedText: "Aplicacion para elevar el rendimiento de todos los universitarios peruanos",
    topicAreaLabel: "Educacion superior",
  },
  intake: {
    topic: "Demostrar que una aplicacion eleva 80 por ciento el rendimiento de todos los universitarios peruanos",
    problemContext: "Sin evidencia disponible.",
    researchLine: "Educacion",
    academicConstraints: undefined,
    targetPopulation: "Todos",
    availableData: undefined,
    preferredMethodology: "Experimental",
    advisorNotes: undefined,
  },
} as const;

const cases = {
  engineering: seismicEngineeringFixture,
  qualitative: qualitativeEducationFixture,
  negative: negativeFixture,
} as const;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function uniqueCandidates(values: MvpStep3Candidate[]) {
  const byId = new Map<string, MvpStep3Candidate>();
  for (const value of values) byId.set(value.reference_id, value);
  return [...byId.values()];
}

function candidateScore(candidate: MvpStep3Candidate) {
  return candidate.selection_score_100
    + (candidate.abstract_available ? 18 : 0)
    + (candidate.pdf_likelihood === "high" ? 30 : candidate.pdf_likelihood === "medium" ? 12 : 0)
    + (candidate.open_access_signal ? 12 : 0)
    + (candidate.doi ? 4 : 0);
}

function selectAcceptanceSources(values: MvpStep3Candidate[]) {
  return uniqueCandidates(values)
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .slice(0, Math.max(3, MIN_SELECTED_REFERENCES));
}

async function createCaseProject(caseKey: CaseKey, runId: string) {
  const fixture = cases[caseKey];
  const user = await prisma.user.upsert({
    where: { email: `release0-scientific-${caseKey}@ingeniometrix.local` },
    create: { email: `release0-scientific-${caseKey}@ingeniometrix.local`, name: `Release 0 scientific ${caseKey}`, locale: "es-PE" },
    update: { name: `Release 0 scientific ${caseKey}`, locale: "es-PE" },
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      status: ProjectStatus.DRAFT,
      ...fixture.project,
      title: `${fixture.project.title} (${runId})`,
    },
  });
  await saveIntakeForProject(user.id, project.id, { ...fixture.intake });
  return { user, project, fixture };
}

function promptObjectBlock(label: string, value: unknown, schemaReference: string) {
  return [
    `## ${label}`,
    "",
    `Schema: \`${schemaReference}\``,
    "",
    "```json",
    JSON.stringify(value, null, 2),
    "```",
  ].join("\n");
}

async function sourceFunction(file: string, startMarker: string, endMarker: string) {
  const content = await readFile(path.join(process.cwd(), file), "utf8");
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`No se pudo extraer el prompt de ${file}.`);
  return content.slice(start, end).trim();
}

async function writePromptsUsed(outputPath: string, projectIds: string | string[], since: string) {
  const registry = await readLlmUsageRegistry();
  const projectIdSet = new Set(Array.isArray(projectIds) ? projectIds : [projectIds]);
  const calls = registry.recentCalls
    .filter((call) => call.recordedAt >= since && projectIdSet.has(call.attribution?.projectId ?? ""))
    .reverse();
  const intakePrompt = await sourceFunction(
    "server/mvp/intake-normalization-service.ts",
    "function buildPrompt(input: IntakeInput)",
    "function buildFrontendSummary",
  );
  const discoveryPrompt = await sourceFunction(
    "server/retrieval/reference-search-v2.ts",
    "function buildPrompt(intake: IntakeInput)",
    "function sanitizeKeywordGroups",
  );
  const languagePrompt = await sourceFunction(
    "server/retrieval/reference-translation-service.ts",
    "function buildLanguageDetectionPrompt",
    "export function resolveReferenceSourceLanguage",
  );
  const models = [...new Set(calls.map((call) => call.model))];
  const markdown = [
    "# PROMPTS_USED",
    "",
    "Inventario de los prompts potencialmente ejecutados por el caso de aceptacion. Los valores privados del intake no se incluyen; se conservan placeholders o el codigo exacto de plantilla.",
    "",
    "## Configuracion efectiva",
    "",
    `- Modelos observados: ${models.length ? models.map((model) => `\`${model}\``).join(", ") : "ninguno"}`,
    `- max_output_tokens: \`${process.env.LLM_MAX_OUTPUT_TOKENS ?? "no configurado"}\``,
    `- reintentos de transporte: \`${process.env.LLM_REQUEST_MAX_RETRIES ?? "default"}\``,
    "- Roles efectivos: las llamadas de texto/JSON usan un unico `input` textual en Responses API; vision usa un mensaje `user` multimodal.",
    "- Cambios B1: Paso 2, Paso 5 y borrador de seccion Paso 6 anaden delimitacion explicita de evidencia recuperada no confiable. Los demas prompts se conservaron.",
    "",
    "## Llamadas observadas",
    "",
    "```json",
    JSON.stringify(calls.map((call) => ({
      recorded_at: call.recordedAt,
      purpose: call.attribution?.source ?? call.operation,
      operation: call.operation,
      configured_and_used_model: call.model,
      prompt_version: call.attribution?.promptVersion ?? null,
      schema_name: call.attribution?.schemaName ?? null,
      stage: call.attribution?.stage ?? null,
      input_tokens: call.inputTokens,
      cached_input_tokens: call.cachedInputTokens,
      output_tokens: call.outputTokens,
    })), null, 2),
    "```",
    "",
    "## Paso 1 — normalizacion",
    "",
    "Proposito: normalizar el intake sin cambiar su intencion. Entrada: campos del intake. Salida: schema `normalizedIntakeSchema` en `server/mvp/intake-normalization-service.ts`. Plantilla exacta:",
    "",
    "```ts",
    intakePrompt,
    "```",
    "",
    "## Discovery — plan de consulta",
    "",
    "Proposito: plan multilingue para OpenAlex. Entrada: intake. Salida: `referenceSearchPlanSchema` en `server/retrieval/reference-search-v2.ts`. Plantilla exacta:",
    "",
    "```ts",
    discoveryPrompt,
    "```",
    "",
    promptObjectBlock("Paso 2 — refinamiento informado por evidencia", STEP2_EVIDENCE_INFORMED_REFINEMENT_PROMPT, "topicRefinementSchema @ server/mvp/topic-refinement-service.ts"),
    "",
    "## Seleccion — deteccion/traduccion de idioma",
    "",
    "Proposito: deteccion y traduccion de metadatos para presentacion de candidatos. Entrada: titulo/abstract/idioma objetivo. Salida: schemas de `server/retrieval/reference-translation-service.ts`. Plantillas exactas:",
    "",
    "```ts",
    languagePrompt,
    "```",
    "",
    promptObjectBlock("Paso 5 — extraccion de evidencia", STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT, "STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT.outputSchema"),
    "",
    promptObjectBlock("Paso 6 — borrador por seccion", STEP6_SECTION_DRAFT_PROMPT, "STEP6_SECTION_DRAFT_PROMPT.outputSchema"),
    "",
    promptObjectBlock("Paso 6 — revision editorial", STEP6_EDITORIAL_REVIEW_PROMPT, "STEP6_EDITORIAL_REVIEW_PROMPT.outputSchema"),
    "",
    promptObjectBlock("Paso 6 — titulo", STEP6_TITLE_GENERATION_PROMPT, "STEP6_TITLE_GENERATION_PROMPT.outputSchema"),
    "",
    "## Prompts no ejecutados",
    "",
    "La generacion remota de hero images y las ondas visuales/OCR del Paso 5 se deshabilitaron para esta aceptacion. No se presentan como prompts usados.",
    "",
  ].join("\n");
  await writeFile(outputPath, markdown, "utf8");
}

async function runNegative(input: Awaited<ReturnType<typeof createCaseProject>>, runId: string, caseDir: string) {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const step1 = await normalizeIntakeForMvpProject({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step1` });
    const blueprintCount = await prisma.blueprintVersion.count({ where: { projectId: input.project.id } });
    const accepted = step1.input_quality.ready_for_step_2 === false
      && step1.status === "partially_completed"
      && blueprintCount === 0;
    const report = {
      case_key: CASE_KEY,
      run_id: runId,
      project_id: input.project.id,
      technical_execution: "PASS",
      evidence_integrity: accepted ? "PASS" : "FAIL",
      methodological_coherence: accepted ? "PASS" : "FAIL",
      document_export_integrity: "NOT_RUN",
      paid_generation_executed: false,
      step1: {
        status: step1.status,
        completeness_score_100: step1.input_quality.completeness_score_100,
        ready_for_step_2: step1.input_quality.ready_for_step_2,
        missing_fields: step1.input_quality.missing_fields,
        next_action_es: step1.frontend_summary.next_action_es,
      },
      blueprint_count: blueprintCount,
      assertion: "El intake insuficiente se detiene antes de discovery/generacion y no produce un plan aparentemente respaldado.",
      accepted,
    };
    await writeFile(path.join(caseDir, "negative-result.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
  } finally {
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  }
}

async function runPositive(
  input: Awaited<ReturnType<typeof createCaseProject>>,
  runId: string,
  caseDir: string,
  startedAt: string,
  resume = false,
) {
  const effectiveStartedAt = resume ? input.project.createdAt.toISOString() : startedAt;
  const [savedStep1, savedStep2] = resume
    ? await Promise.all([
        prisma.mvpStepRun.findFirst({ where: { projectId: input.project.id, stepKey: MVP_STEP1_KEY }, orderBy: { startedAt: "desc" } }),
        prisma.mvpStepRun.findFirst({ where: { projectId: input.project.id, stepKey: MVP_STEP2_KEY }, orderBy: { startedAt: "desc" } }),
      ])
    : [null, null];
  const step1 = savedStep1?.outputSnapshotJson
    ? JSON.parse(await readFile(savedStep1.artifactManifestPath!, "utf8")) as Awaited<ReturnType<typeof normalizeIntakeForMvpProject>>
    : await normalizeIntakeForMvpProject({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step1` });
  if (!step1.input_quality.ready_for_step_2) throw new Error("El fixture positivo no esta listo para Paso 2.");
  const step2 = savedStep2?.outputSnapshotJson
    ? savedStep2.outputSnapshotJson as unknown as Awaited<ReturnType<typeof runMvpEvidenceInformedTopicRefinement>>
    : await runMvpEvidenceInformedTopicRefinement({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step2` });
  const selectedOption = step2.alternatives.find((option) => option.option_id === step2.recommended_option_id)
    ?? step2.alternatives.find((option) => option.strategy === "balanceada")
    ?? step2.alternatives[0];
  if (!selectedOption) throw new Error("Paso 2 no devolvio una alternativa seleccionable.");
  const step2Selection = resume && savedStep2?.outputSnapshotJson
    ? { project_id: input.project.id, step_run_id: step2.step_run_id, selected_option_id: selectedOption.option_id, selected_strategy: selectedOption.strategy, first_batch_candidate_ids: selectedOption.source_feasibility.first_batch_candidate_ids, discarded_candidate_ids: [], next_action_es: "Seleccion previamente registrada; reanudacion de evaluacion." }
    : await applyMvpStep2IntakeChoice({
        userId: input.user.id,
        projectId: input.project.id,
        optionId: selectedOption.option_id,
        stepRunId: step2.step_run_id,
      });
  const step3 = await prepareMvpStep3SourceSelection({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step3` });
  const step3Candidates = uniqueCandidates([...step3.batches.first.candidates, ...step3.batches.second.candidates]);
  const step4 = step3Candidates.length < MIN_SELECTED_REFERENCES
    ? await requestMvpStep4AdditionalSources({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step4-expand` })
    : null;
  const selectedCandidates = selectAcceptanceSources([
    ...step3Candidates,
    ...(step4?.batches.first.candidates ?? []),
    ...(step4?.batches.second.candidates ?? []),
  ]);
  if (selectedCandidates.length < MIN_SELECTED_REFERENCES) throw new Error(`Solo se recuperaron ${selectedCandidates.length} fuentes seleccionables.`);
  const step4Selection = await applyMvpStep4FinalSourceSelection({
    userId: input.user.id,
    projectId: input.project.id,
    selectedReferenceIds: selectedCandidates.map((candidate) => candidate.reference_id),
    runId: `${runId}-step4-select`,
  });
  const step5 = await runMvpEvidenceMaterialization({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step5` });
  const step6 = await runMvpStep6BlueprintDocx({ userId: input.user.id, projectId: input.project.id, runId: `${runId}-step6` });
  const blueprintVersion = await prisma.blueprintVersion.findUniqueOrThrow({ where: { id: step6.blueprint_version_id } });
  const exportReferences = extractExportReferences(blueprintVersion);
  const evidenceLog = buildEvidenceLog(blueprintVersion);
  const docxPath = path.join(caseDir, `${CASE_KEY}-thesis-plan.docx`);
  const bibtexPath = path.join(caseDir, "references.bib");
  const risPath = path.join(caseDir, "references.ris");
  const evidenceLogPath = path.join(caseDir, "evidence_log.json");
  const ledgerPath = path.join(caseDir, "evidence-ledger.json");
  await Promise.all([
    copyFile(step6.docx_path, docxPath),
    copyFile(step5.artifacts.evidence_ledger, ledgerPath),
    writeFile(bibtexPath, `${renderBibtex(exportReferences)}\n`, "utf8"),
    writeFile(risPath, `${renderRis(exportReferences)}\n`, "utf8"),
    writeFile(evidenceLogPath, `${JSON.stringify(evidenceLog, null, 2)}\n`, "utf8"),
  ]);
  const ledger = JSON.parse(await readFile(step5.artifacts.evidence_ledger, "utf8")) as {
    source_registry?: Array<{ source_id: string; evidence_basis?: string; title?: string; doi?: string | null }>;
    semantic_extractions?: Array<{ evidence_items?: Array<{ source_id: string; evidence_id: string; citation_anchor?: { chunk_id?: string | null } }> }>;
  };
  const sourceIds = new Set((ledger.source_registry ?? []).map((source) => source.source_id));
  const evidenceItems = (ledger.semantic_extractions ?? []).flatMap((extraction) => extraction.evidence_items ?? []);
  const badEvidenceLinks = evidenceItems.filter((item) => !sourceIds.has(item.source_id));
  const documentStat = await stat(docxPath);
  const exportReferenceIds = exportReferences.map((reference) => reference.reference_id);
  const selectedIds = step4Selection.selected_reference_ids;
  const exportsConsistent = exportReferenceIds.length > 0 && exportReferenceIds.every((id) => selectedIds.includes(id));
  const registry = await readLlmUsageRegistry();
  const calls = registry.recentCalls.filter((call) => call.recordedAt >= effectiveStartedAt && call.attribution?.projectId === input.project.id);
  const usage = sumLlmUsageCalls(calls);
  const promptsUsedPath = path.join(caseDir, "PROMPTS_USED.md");
  await writePromptsUsed(promptsUsedPath, input.project.id, effectiveStartedAt);
  const finishedAt = new Date().toISOString();
  const report = {
    case_key: CASE_KEY,
    fixture_id: input.fixture.id,
    run_id: runId,
    project_id: input.project.id,
    blueprint_version_id: blueprintVersion.id,
    selected_option: {
      option_id: selectedOption.option_id,
      strategy: selectedOption.strategy,
      recorded_as_test_action: true,
      selection_result: step2Selection,
    },
    selected_sources: selectedCandidates.map((candidate) => ({
      reference_id: candidate.reference_id,
      title: candidate.title,
      doi: candidate.doi,
      pdf_likelihood: candidate.pdf_likelihood,
      open_access_signal: candidate.open_access_signal,
      abstract_available: candidate.abstract_available,
      selection_score_100: candidate.selection_score_100,
    })),
    technical_execution: step6.status === "completed" ? "PASS" : "PASS_WITH_LIMITATIONS",
    evidence_integrity: badEvidenceLinks.length === 0 && evidenceItems.length > 0 ? "PASS" : "FAIL",
    methodological_coherence: "REQUIRES_SUBSTANTIVE_INSPECTION",
    document_export_integrity: documentStat.size > 0 && exportsConsistent ? "PASS" : "FAIL",
    evidence_strength: {
      materialized_pdf_count: step5.materialized_pdf_count,
      fulltext_chunk_count: step5.fulltext_chunk_count,
      semantic_extraction_count: step5.semantic_extraction_count,
      evidence_item_count: evidenceItems.length,
      evidence_basis_by_source: (ledger.source_registry ?? []).map((source) => ({ source_id: source.source_id, evidence_basis: source.evidence_basis ?? null })),
      invalid_source_links: badEvidenceLinks,
    },
    steps: {
      step1: { status: step1.status, duration_ms: step1.duration_ms, prompt_version: step1.prompt_version },
      step2: { status: step2.status, duration_ms: step2.duration_ms, prompt_version: step2.prompt_version },
      step3: { status: step3.status, duration_ms: step3.duration_ms },
      step4_expand: step4 ? { status: step4.status, duration_ms: step4.duration_ms } : { status: "NOT_RUN_NOT_NEEDED", duration_ms: 0 },
      step4_select: { status: step4Selection.status, duration_ms: step4Selection.duration_ms },
      step5: { status: step5.status, duration_ms: step5.duration_ms, prompt_version: step5.prompt_version },
      step6: { status: step6.status, duration_ms: step6.duration_ms, prompt_version: step6.prompt_version, metrics: step6.metrics },
    },
    backend_duration_ms: Date.parse(finishedAt) - Date.parse(startedAt),
    started_at: effectiveStartedAt,
    completed_at: finishedAt,
    api_usage: usage,
    models_used: [...new Set(calls.map((call) => call.model))],
    artifacts: { docx: docxPath, evidence_log: evidenceLogPath, evidence_ledger: ledgerPath, bibtex: bibtexPath, ris: risPath, prompts_used: promptsUsedPath },
    continuity: {
      project_id: input.project.id,
      step5_step_run_id: step5.step_run_id,
      step6_step_run_id: step6.step_run_id,
      blueprint_version_id: blueprintVersion.id,
      export_reference_ids: exportReferenceIds,
      selected_reference_ids: selectedIds,
      exports_consistent: exportsConsistent,
    },
    visual_inspection: "PENDING",
    warnings: [
      ...(Array.isArray(step1.warnings) ? step1.warnings : []),
      ...(Array.isArray(step2.warnings) ? step2.warnings : []),
      ...(step4?.warnings ?? []),
      ...step5.warnings,
      ...step6.warnings,
    ],
  };
  await writeFile(path.join(caseDir, "case-result.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main() {
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    const db = new URL(process.env[key] ?? "");
    if (db.hostname !== "127.0.0.1" || db.port !== "55434" || db.pathname !== "/imx_b1") throw new Error("Aceptacion permitida solo en la DB aislada verificada 127.0.0.1:55434/imx_b1.");
  }
  const promptsProjectIds = process.argv.find((value) => value.startsWith("--prompts-project="))?.split("=")[1]?.split(",").filter(Boolean);
  const outputDir = process.argv.find((value) => value.startsWith("--output-dir="))?.slice("--output-dir=".length);
  if (promptsProjectIds?.length && outputDir) {
    const projects = await prisma.project.findMany({ where: { id: { in: promptsProjectIds } }, select: { createdAt: true } });
    if (projects.length !== promptsProjectIds.length) throw new Error("No se encontraron todos los proyectos solicitados para PROMPTS_USED.md.");
    await mkdir(outputDir, { recursive: true });
    const promptsUsedPath = path.join(outputDir, "PROMPTS_USED.md");
    const since = projects.map((project) => project.createdAt.toISOString()).sort()[0];
    await writePromptsUsed(promptsUsedPath, promptsProjectIds, since);
    console.log(JSON.stringify({ ok: true, prompts_used: promptsUsedPath }, null, 2));
    return;
  }
  if (!Object.hasOwn(cases, CASE_KEY)) throw new Error("Usa --case=engineering, --case=qualitative o --case=negative.");
  const resumeProjectId = process.argv.find((value) => value.startsWith("--resume-project="))?.split("=")[1];
  const startedAt = new Date().toISOString();
  const runId = `release0-b2-${CASE_KEY}-${stamp()}`;
  const caseDir = path.join(OUTPUT_ROOT, CASE_KEY, runId);
  await mkdir(caseDir, { recursive: true });
  process.env.IMX_LLM_AUDIT_DIR = path.join(caseDir, "provider-calls");
  process.env.IMX_LLM_RUN_BUDGET_USD = CASE_KEY === "negative" ? "0.000001" : "2.20";
  process.env.LLM_MAX_OUTPUT_TOKENS = "8000";
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  process.env.IMX_STEP6_DISABLE_IMAGE_GENERATION = "1";
  process.env.IMX_STEP5_DISABLE_VISUAL_LOCALIZATION = "1";
  const input = resumeProjectId
    ? await prisma.project.findFirstOrThrow({ where: { id: resumeProjectId }, include: { user: true } }).then((project) => ({ user: project.user, project, fixture: cases[CASE_KEY] }))
    : await createCaseProject(CASE_KEY, runId);
  await writeFile(path.join(caseDir, "run-start.json"), JSON.stringify({ project_id: input.project.id, run_id: runId, started_at: startedAt, budget_usd: process.env.IMX_LLM_RUN_BUDGET_USD, fixture: input.fixture.id }));
  console.log(JSON.stringify({ started: true, project_id: input.project.id, case_dir: caseDir }));
  const result = CASE_KEY === "negative"
    ? await runNegative(input, runId, caseDir)
    : await runPositive(input, runId, caseDir, startedAt, Boolean(resumeProjectId));
  console.log(JSON.stringify({ ok: true, case_dir: caseDir, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
