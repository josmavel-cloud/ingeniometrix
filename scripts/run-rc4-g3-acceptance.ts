import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ActorType, Prisma, Provider } from "@prisma/client";
import { getConfiguredLlmProvider } from "@/llm";
import type { LlmProvider } from "@/llm/provider";
import { prisma } from "@/lib/prisma";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { intakeFingerprint } from "@/server/mvp/evidence-continuity";
import type { MvpStep5EvidenceLedger } from "@/server/mvp/evidence-materialization-types";
import { closeJobCostControl, jobCostSnapshot, withJobExecution } from "@/server/mvp/job-execution-context";
import { runMvpStep6BlueprintDocx } from "@/server/mvp/step6-blueprint-docx-service";
import { decisionContextFingerprint } from "@/server/mvp/scientific-decision-contracts";
import { appendGenerationInput, readGenerationInput, withGenerationInput } from "@/server/projects/generation-input-snapshot";

const ROOT = path.resolve("artifacts-local/rc4/g3-acceptance");
const INPUT = path.resolve("artifacts-local/rc4/scientific-design-evaluation-v1/geospatial.input.json");
const DESIGN = path.resolve("artifacts-local/rc4/scientific-design-evaluation-v1/geospatial/repair.output.json");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  if (process.env.RC4_G3_PAID_ACCEPTANCE !== "1") throw new Error("Set RC4_G3_PAID_ACCEPTANCE=1 for the single authorized run");
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("RC4 isolated DB required");
  if (process.env.IMX_ENABLE_DEEP_RESEARCH !== "0") throw new Error("Deep Research must remain disabled");
  if (!process.env.RC4_G3_PROVIDER_MODE?.startsWith("mock") && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY required");
  }
  const frozen = JSON.parse(await readFile(INPUT, "utf8"));
  const selection = JSON.parse(await readFile(DESIGN, "utf8"));
  const alternative = selection.alternatives[0];
  if (!alternative || alternative.definition.questions.length < 3 || alternative.definition.questions.length > 5) throw new Error("Frozen G1 alternative is not compact-profile compatible");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const runId = `rc4-g3-${stamp}`;
  const projectId = randomUUID();
  const userId = randomUUID();
  const jobId = randomUUID();
  const stepRunId = randomUUID();
  const startedAt = new Date();
  const intakeData = {
    topic: frozen.intake.topic,
    problemContext: frozen.intake.problemContext,
    researchLine: frozen.intake.researchLine,
    academicConstraints: frozen.intake.academicConstraints,
    targetPopulation: frozen.intake.targetPopulation,
    availableData: frozen.intake.availableData,
    preferredMethodology: frozen.intake.preferredMethodology,
    advisorNotes: frozen.intake.advisorNotes,
    searchQuery: frozen.intake.searchQuery,
  };
  const ledger = structuredClone(frozen.ledger) as MvpStep5EvidenceLedger;
  ledger.project_id = projectId;
  ledger.step_run_id = stepRunId;
  ledger.intake_fingerprint = intakeFingerprint({ id: "acceptance", projectId, ...intakeData });
  // The canonical fingerprint uses public intake fields; recompute after DB creation below.

  await prisma.user.create({ data: { id: userId, email: `rc4-g3-${stamp}@ingeniometrix.local`, name: "RC4 G3 acceptance" } });
  const project = await prisma.project.create({ data: { id: projectId, userId, title: frozen.intake.topic, degreeLevel: "PREGRADO", country: "PE", language: "es", program: "Ingenieria Civil", university: null, status: "SOURCES_SELECTED", intake: { create: intakeData } }, include: { intake: true } });
  ledger.intake_fingerprint = intakeFingerprint(project.intake!);

  for (let index = 0; index < ledger.source_registry.length; index += 1) {
    const source = ledger.source_registry[index];
    const reference = ledger.references.find((item) => item.reference_id === source.reference_id)!;
    await prisma.reference.upsert({
      where: { id: source.reference_id },
      create: { id: source.reference_id, doi: source.doi, title: source.title, normalizedTitle: normalize(source.title), authorsJson: json(source.authors), year: source.year, venue: reference.reference_metadata?.venue ?? null, landingPageUrl: reference.reference_metadata?.landing_page_url ?? null },
      update: {},
    });
    await prisma.projectReference.create({ data: { projectId, referenceId: source.reference_id, sourceProvider: "OPENALEX", selected: true, selectedOrder: index + 1, selectionReason: "Fixture G1 congelado para aceptacion documental G3; sin nueva recuperacion." } });
  }
  await prisma.mvpStepRun.create({ data: { id: stepRunId, projectId, userId, stepKey: "step_5_evidence_materialization", status: "COMPLETED", provider: Provider.SYSTEM, finishedAt: new Date(), artifactManifestPath: ledger.artifact_manifest_path } });
  await prisma.projectEvidenceLedger.create({ data: { projectId, stepRunId, citationStyle: ledger.citation_style, sourceRegistryJson: json(ledger.source_registry), referencesJson: json(ledger.references), ledgerJson: json(ledger), artifactManifestPath: ledger.artifact_manifest_path } });
  await prisma.blueprintJob.create({ data: { id: jobId, projectId, userId, status: "RUNNING", currentStage: "generating_plan", progress: 55, attempts: 0, maxAttempts: 3, startedAt, lockedAt: startedAt, metadataJson: json({ engine: "canonical-mvp-step5-step6", executionPolicy: "b4.v1", scientificProfile: "rc4", acceptance: "g3" }), stageDataJson: json({ runId, step5: { status: "completed", stepRunId, artifactManifestPath: ledger.artifact_manifest_path } }) } });
  const generationInput = await prisma.$transaction(async (tx) => appendGenerationInput(tx, { jobId, projectId, userId, revision: 1 }));
  const frozenInput = await readGenerationInput(jobId, generationInput.snapshot.id);
  await prisma.blueprintJobStage.create({ data: { jobId, stageKey: "approval:SCIENTIFIC_DESIGN", status: "COMPLETED", progress: 100, completedAt: startedAt, outputJson: json({ contextFingerprint: decisionContextFingerprint(project.intake, ledger), alternative, academicLevel: "PREGRADO", acceptanceFixture: true, userConfirmationNotClaimed: true, note: "Controlled G3 presentation acceptance consumes the frozen G1 conditional design and preserves its pending decisions; it is not a production user approval." }) } });

  const preflight = { maximum_authorized_usd: 2.5, persistent_job_hard_cap_usd: Number(process.env.IMX_JOB_HARD_COST_LIMIT_USD || 2), deep_research: false, selector_calls: 0, critic_calls: 0, estimated_document_calls: "8 scientific + 1 asset planner; checkpoints and circuit breaker are authoritative" };
  await writeFile(path.join(ROOT, `${runId}-preflight.json`), JSON.stringify(preflight, null, 2), { mode: 0o600 });
  let result;
  try {
    const inspectable = ledger.semantic_extractions.flatMap((item) => item.evidence_items).find((item) => item.support_verified === true && item.allowed_use !== "gap_only")!;
    const citation = { source_id: inspectable.source_id, evidence_id: inspectable.evidence_id };
    const narrative = (cited = true) => ({ paragraphs: [{ text: "El plan conserva el diseño aprobado y formula acciones futuras verificables sin presentar resultados ejecutados. Las decisiones pendientes y los límites de la evidencia permanecen explícitos.", citations: cited ? [citation] : [] }], assumptions: [], limitations: ["Las decisiones pendientes deben resolverse antes de ejecutar el estudio."] });
    let mockReviewCalls = 0;
    const mockProvider = { name: "g3-offline-harness", generateStructuredObject: async (request: any) => {
      const phase = request.schemaName.replace("b3_", "");
      if (phase === "problem_definition") return { ...narrative(false), problem: alternative.definition.problem };
      if (phase === "consistency_matrix") return { synthesis: "Las preguntas y objetivos conservan correspondencia uno a uno con el método propuesto.", rows: alternative.definition.questions.map((question: any, index: number) => ({ question_ids: [question.id], objective_ids: [alternative.definition.objectives[index].id], construct_ids: alternative.research_design.constructs.slice(0, 1).map((item: any) => item.id), design_alignment: "Etapa correspondiente del procedimiento aprobado", data_techniques_instruments: alternative.research_design.data_material_sources[0], analysis_quality: alternative.research_design.analysis_method, rationale_evidence: alternative.research_design.methodological_support.slice(0, 1), pending_decisions: alternative.research_design.pending_decisions.slice(0, 1) })) };
      if (request.schemaName === "rc4_g3_scientific_citation_repair_v1") return { sections: { state_of_knowledge: narrative(true), conceptual_framework: narrative(true), methodology: narrative(false) }, matrix: { synthesis: "Las preguntas y objetivos conservan correspondencia uno a uno con el método propuesto.", rows: alternative.definition.questions.map((question: any, index: number) => ({ question_ids: [question.id], objective_ids: [alternative.definition.objectives[index].id], construct_ids: alternative.research_design.constructs.slice(0, 1).map((item: any) => item.id), design_alignment: "Etapa correspondiente del procedimiento aprobado", data_techniques_instruments: alternative.research_design.data_material_sources[0], analysis_quality: alternative.research_design.analysis_method, rationale_evidence: [], pending_decisions: alternative.research_design.pending_decisions.slice(0, 1) })) }, methodological_support: alternative.research_design.methodological_support.slice(0, 1), corrected_findings: ["atribución localizada"], unresolved_critical_issues: [] };
      if (phase === "cross_section_review" || request.schemaName === "rc4_g3_cross_section_repair_review") {
        mockReviewCalls += 1;
        if (process.env.RC4_G3_PROVIDER_MODE === "mock-repair" && mockReviewCalls === 1) return { critical_issues: ["Atribución de prueba no sustentada"], warnings: [], checked_dimensions: ["citas"] };
        return { critical_issues: [], warnings: ["Fixture offline de transporte/documento; no evaluación científica."], checked_dimensions: ["intención", "alineación", "citas"] };
      }
      if (phase === "final_title") return { title: frozen.intake.topic, short_title: "Sistema geoespacial de peligro sísmico", rationale: "Conserva la intención de implementación.", keywords: ["peligro sísmico", "geoespacial"], warnings: [] };
      if (phase === "executive_summary") return narrative(false);
      if (request.schemaName === "rc4_compact_asset_plan_v1") return { proposals: [], omitted_reason: "Fixture offline: los assets se verifican en su suite determinística." };
      return narrative(true);
    }, generateText: async () => "", generateTextDetailed: async () => ({ text: "", usage: { provider: "fixture", model: "fixture", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, costCad: 0, durationMs: 0 } }) } as LlmProvider;
    const provider = process.env.RC4_G3_PROVIDER_MODE?.startsWith("mock") ? mockProvider : getConfiguredLlmProvider();
    result = await withGenerationInput(frozenInput, () => withJobExecution({ jobId, startedAt, stage: "blueprint_generation" }, () => withApplicationBudget(new ApplicationBudget(2.5, 2.0), () => runMvpStep6BlueprintDocx({ userId, projectId, runId, providerOverride: provider }))));
    await prisma.$transaction(async (tx) => {
      await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "COMPLETED", progress: 100, completedAt: new Date(), lockedAt: null } });
      await closeJobCostControl(tx, jobId, "COMPLETED");
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.blueprintJob.update({ where: { id: jobId }, data: { status: "FAILED", completedAt: new Date(), lockedAt: null, errorMessage: error instanceof Error ? error.message : String(error) } });
      await closeJobCostControl(tx, jobId, "FAILED");
    });
    throw error;
  }
  const budget = await withJobExecution({ jobId, startedAt, stage: "report" }, () => jobCostSnapshot());
  const docx = await readFile(result.docx_path);
  const pdf = await readFile(result.pdf_path!);
  const pkg = JSON.parse(await readFile(result.artifacts.blueprint_package, "utf8"));
  const page = JSON.parse(await readFile(result.artifacts.page_budget_plan, "utf8"));
  const summary = { acceptance: "RC4_G3", project_id: projectId, job_id: jobId, version_id: result.blueprint_version_id, result, document_profile: pkg.document_profile, section_order: pkg.section_drafts.map((item: any) => item.section_key), questions: pkg.scientific_plan.definition.questions.length, specific_objectives: pkg.scientific_plan.definition.objectives.length - 1, hypotheses: pkg.scientific_plan.definition.hypotheses_or_propositions, assets: pkg.visual_plan?.assets ?? [], page, budget, hashes: { docx: sha(docx), pdf: sha(pdf) }, scientific_decision_reused: true, selector_calls: 0, critic_calls: 0, acceptance_fixture_note: "Conditional G1 design reused for document acceptance; unresolved decisions remain visible and no production user approval is claimed." };
  await writeFile(path.join(ROOT, `${runId}-summary.json`), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ summary: path.join(ROOT, `${runId}-summary.json`), projectId, jobId, versionId: result.blueprint_version_id, docx: result.docx_path, pdf: result.pdf_path, pages: page, calls: result.api_usage.llm_calls_executed, tokens: result.api_usage.total_tokens, cost: result.api_usage.estimated_cost_usd, hashes: summary.hashes }, null, 2));
}

main().catch(async (error) => { console.error(error); process.exitCode = 1; await prisma.$disconnect(); });
