// Bounded design-only evaluation. Frozen private data never enters production fixtures.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createOpenAiProvider } from "@/llm/providers/openai";
import { responseCostBound } from "@/llm/providers/openai-cost-bound";
import { IncompleteStructuredOutputError } from "@/llm/structured-output-error";
import { ApplicationBudget, withApplicationBudget } from "@/server/mvp/application-budget";
import { closeJobCostControl, fingerprint, jobCostSnapshot, stableJson, withJobExecution } from "@/server/mvp/job-execution-context";
import { alternativeIsApprovable, buildMethodEvidencePack, intentFromIntake, scientificDecisionV2Schema } from "@/server/mvp/scientific-decision-contracts";
import { proposeScientificDecision } from "@/server/mvp/scientific-decision-service";
import { jobCostPolicy } from "@/server/mvp/execution-policy";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as selector } from "@/server/mvp/prompts/scientific-design-selector.v3";
import { SCIENTIFIC_DESIGN_SELECTOR_PROMPT as originalSelector } from "@/server/mvp/prompts/scientific-design-selector.v2";
import { SCIENTIFIC_DESIGN_CRITIC_PROMPT as critic } from "@/server/mvp/prompts/scientific-design-critic.v2";
import { SCIENTIFIC_DESIGN_REPAIR_PROMPT as repair } from "@/server/mvp/prompts/scientific-design-repair.v1";
import { SCIENTIFIC_DESIGN_OUTPUT_REPAIR_PROMPT as outputRepair } from "@/server/mvp/prompts/scientific-design-output-repair.v1";
import { qualitativeEducationFixture } from "./mvp/fixtures/qualitative-education-intake";
import type { MvpStep5EvidenceLedger } from "@/server/mvp/evidence-materialization-types";

const ROOT = path.resolve("artifacts-local/rc4/scientific-design-evaluation-v1");
const EVALUATION = "rc4-g1-design-v1";
const CASES = ["geospatial", "qualitative", "applied-education", "insufficient"] as const;
type Case = { case_id: string; academic_level: string; taxonomy: string; intake: Record<string, unknown>; ledger: MvpStep5EvidenceLedger; provenance: unknown; baseline?: unknown };
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
async function read(file: string) { return JSON.parse(await readFile(file, "utf8")); }
async function save(file: string, value: unknown, exclusive = false) { await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600, flag: exclusive ? "wx" : "w" }); }
async function freeze(c: Case) {
  const pack = buildMethodEvidencePack(c.ledger);
  const input = { ...c, advanced_fields: Object.fromEntries(["researchScope", "constructs", "pendingDecisions", "academicConstraints", "availableData", "advisorNotes"].map((k) => [k, c.intake[k] ?? null])), user_intent: intentFromIntake({ ...c.intake, degreeLevel: c.academic_level }), selected_sources: pack.selected_sources, evidence_items: pack.items, evidence_levels: pack.source_accounting, missing_information: c.intake.pendingDecisions ?? "See the verbatim intake; no new facts supplied", known_constraints: c.intake.academicConstraints ?? null };
  const frozen = { ...input, input_hash: fingerprint(input), ledger_hash: fingerprint(c.ledger) };
  const file = path.join(ROOT, `${c.case_id}.input.json`);
  try { await save(file, frozen, true); } catch (e: any) { if (e.code !== "EEXIST" || (await read(file)).input_hash !== frozen.input_hash) throw e; }
  return { case: c.case_id, frozen: file, hash: frozen.input_hash, sources: pack.selected_sources.length, items: pack.items.length, source_accounting: pack.source_accounting };
}
async function prepare() {
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const original = await read("artifacts-local/rc4/reference/snapshot.json");
  if (original.job.id !== "1349d6a7-0144-441b-87d0-b075e0fe5e87") throw new Error("Wrong RC3 capture");
  const version = original.versions.find((v: any) => v.id === "0ff500fc-7e85-4958-b43c-705ca800027e");
  const ledger = original.stages.find((s: any) => s.stageKey === "checkpoint:EVIDENCE").outputJson.value;
  const baseline = Object.fromEntries(original.stages.filter((s: any) => /RESEARCH_DESIGN|SECTION_DRAFTS:(problem_definition|research_questions|objectives_and_optional_hypotheses|methodology)/.test(s.stageKey)).map((s: any) => [s.stageKey, s.outputJson.value]));
  const qualitativePath = process.env.IMX_G1_QUALITATIVE_LEDGER ?? path.resolve("../ingeniometrix-wt-mvp-backend-core/artifacts-local/release0-scientific-validation/b3/final/qualitative-delivery/evidence-ledger.json");
  const qualitativeLedger = await read(qualitativePath);
  const cases: Case[] = [
    { case_id: "geospatial", academic_level: "PREGRADO", taxonomy: "FORD-2015:2.1", intake: version.intakeSnapshotJson, ledger, baseline, provenance: { capture: "artifacts-local/rc4/reference/snapshot.json", capture_hash: fingerprint(original), project: original.job.projectId, version: version.id, evidence_enrichment: false } },
    { case_id: "qualitative", academic_level: "MAESTRIA", taxonomy: "FORD-2015:5.3", intake: { ...qualitativeEducationFixture.intake }, ledger: qualitativeLedger, provenance: { fixture: qualitativeEducationFixture.id, ledger: qualitativePath, evidence_enrichment: false } },
    { case_id: "applied-education", academic_level: "PROYECTO_INVESTIGACION", taxonomy: "FORD-2015:5.3", intake: { topic: "Diseñar y evaluar técnicamente un protocolo de retroalimentación formativa para actividades de matemáticas en un entorno digital", problemContext: "Se busca traducir evidencia sobre feedback a un protocolo operativo y evaluar su coherencia y cobertura mediante escenarios de actividad; no se pretende demostrar mejora de aprendizaje sin datos de estudiantes.", targetPopulation: "Actividades de matemáticas y escenarios documentados; la institución y el nivel educativo están pendientes.", researchScope: "Diseño del protocolo y evaluación técnica con ejemplos documentados; sin intervención en estudiantes.", preferredMethodology: "Investigación aplicada documental y evaluación por criterios explícitos", availableData: "Artículos inspeccionados congelados. Ejemplos de actividades por seleccionar; no existen notas ni registros de estudiantes.", academicConstraints: "Proyecto de investigación general sin presupuesto, equipo ni plazo confirmado. No inventar participantes ni efectos causales.", pendingDecisions: "Nivel educativo, actividades, criterios de aceptación y disponibilidad de evaluadores por confirmar.", researchLine: "Evaluación formativa en educación matemática", constructs: "Calidad y oportunidad de retroalimentación; cobertura de errores y orientaciones" }, ledger: qualitativeLedger, provenance: { kind: "evaluation-only new intake; existing frozen education evidence", reused_ledger_hash: fingerprint(qualitativeLedger), evidence_enrichment: false } },
    { case_id: "insufficient", academic_level: "PREGRADO", taxonomy: "CUSTOM_UNRESOLVED", intake: { topic: "Investigar un tema", problemContext: "", availableData: "", pendingDecisions: "Problema, unidad, acceso a datos y método sin definir" }, ledger: { ...ledger, source_registry: [], references: [], semantic_extractions: [], evidence_cards: [] }, provenance: { kind: "deliberately incomplete fixture" } },
  ];
  const prepared = [];
  for (const c of cases) prepared.push(await freeze(c));
  const preflight = cases.slice(0, 3).map((c) => {
    const variables: Record<string, unknown> = { intent_json: intentFromIntake({ ...c.intake, degreeLevel: c.academic_level }), method_evidence_pack_json: buildMethodEvidencePack(c.ledger) };
    const prompt = `${selector.systemPrompt}\n\n${selector.userPromptTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => stableJson(variables[key]))}`;
    return { case: c.case_id, prompt_bytes: Buffer.byteLength(prompt), selector_bound: responseCostBound({ model: selector.model, max_output_tokens: selector.max_output_tokens, reasoning: { effort: "high" }, store: false, input: prompt, text: { format: { type: "json_schema", name: "design_selector_0", strict: true, schema: z.toJSONSchema(scientificDecisionV2Schema) } } }), critic_output_max: critic.max_output_tokens, repair_output_max: repair.max_output_tokens, expected_calls: 2, possible_repair: 1, mandatory_remaining_reserve_usd: jobCostPolicy().mandatoryReserve };
  });
  await save(path.join(ROOT, "manifest.json"), { rubric: "docs/quality/rc4-g1-design-rubric.v1.md", cases: prepared, preflight, calls_per_case: { selector: 1, critic: 1, repair: 1 }, max_paid_cases: 3, job_hard_usd: 2, global_hard_usd: 8, effective_total_hard_usd: 6, retries: 0, prices_checked: "2026-09-22", sources: ["https://developers.openai.com/api/docs/models/gpt-6-astra", "https://developers.openai.com/api/docs/models/gpt-5.6-sol"], prompts: [originalSelector, selector, critic, repair, outputRepair] });
  await writeFile(path.join(ROOT, "PROMPTS_USED.md"), "# G1 design evaluation prompt inventory\n\nConfigured templates; actual dispatches and resolved requests are retained per case.\nNo source retrieval, images or document calls. Actual arrangement: concatenated Responses input, strict JSON schema, store=false, no temperature, no tools, retries=0.\n\n" + [originalSelector, selector, critic, repair, outputRepair].map((p) => `## ${p.id}\n\nVersion: ${p.version}\nModel: ${p.model}\nReasoning: ${p.reasoning_effort}\nMax output: ${p.max_output_tokens}\nSchema: ${p.schema}\nVariables: ${p.variables.join(", ")}\nCost: durable responseCostBound reservation before dispatch; USD2 job / USD8 global cap.\n\n### Complete instructions\n\n${p.systemPrompt}\n\n### Complete user template\n\n${p.userPromptTemplate}\n`).join("\n") + "\nVariable definitions: intent_json = whitelisted original user definition and constraints; method_evidence_pack_json = frozen inspectable excerpts, levels, support permissions and per-source exclusions; decision_json = proposed alternatives only (not previous generated chapters); critique_json = independent findings; partial_output_json = original incomplete provider response, never trusted scientific authority.\n\nChanges from v1: G2 field preservation, explicit method handoffs/scope impact/data status; complete critic dimensions; one critic and one targeted repair maximum. Output recovery was introduced after the first geospatial response ended with max_output_tokens.\n", { mode: 0o600 });
  console.log(JSON.stringify({ preflight }, null, 2));
  console.log(JSON.stringify(prepared, null, 2));
}
async function run(caseId: string, paid: boolean) {
  if (!CASES.includes(caseId as any)) throw new Error("Unknown case");
  const c = await read(path.join(ROOT, `${caseId}.input.json`));
  const { input_hash, ledger_hash, ...payload } = c;
  if (fingerprint(payload) !== input_hash || fingerprint(c.ledger) !== ledger_hash) throw new Error("Frozen input mutated");
  if (caseId !== "insufficient" && !paid) throw new Error("Explicit --paid flag required");
  const directory = path.join(ROOT, caseId); await mkdir(directory, { recursive: true, mode: 0o700 });
  const recover = process.argv.includes("--recover-output");
  await writeFile(path.join(directory, recover ? "output-recovery.lock" : "execution.lock"), new Date().toISOString(), { flag: "wx", mode: 0o600 });
  process.env.LLM_REQUEST_MAX_RETRIES = "0";
  process.env.LLM_REQUEST_TIMEOUT_MS = "240000";
  process.env.IMX_LLM_RUN_BUDGET_USD = "8";
  process.env.IMX_ENABLE_DEEP_RESEARCH = "0";
  process.env.IMX_LLM_AUDIT_DIR = path.join(directory, "provider-calls");
  let key = process.env.OPENAI_API_KEY;
  if (!key && paid) key = parseEnv(await readFile(path.resolve("../ingeniometrix-wt-release0/.env.release"), "utf8")).OPENAI_API_KEY;
  if (!key && paid) throw new Error("OPENAI_API_KEY missing");
  const actual = createOpenAiProvider({ apiKey: key || "offline-unused", defaultModel: selector.model });
  const previous = recover ? await read(path.join(directory, "result.json")) : null;
  let partial: string | null = null;
  if (previous) {
    if (previous.frozen_input_hash !== input_hash || previous.counts.selector !== 1 || previous.counts.critic || previous.counts.repair) throw new Error("Output recovery not eligible");
    const responses = await Promise.all((await readdir(path.join(directory, "provider-calls"))).map((f) => read(path.join(directory, "provider-calls", f))));
    const incomplete = responses.find((r) => r.response.status === "incomplete" && r.response.incomplete_details?.reason === "max_output_tokens");
    if (!incomplete) throw new Error("No actual incomplete response available");
    partial = incomplete.response.output_text;
    await save(path.join(directory, "result.before-output-repair.json"), previous, true);
  }
  const user = previous ? null : await prisma.user.create({ data: { email: `${EVALUATION}-${caseId}-${Date.now()}@example.test` } });
  const project = previous ? await prisma.project.findUniqueOrThrow({ where: { id: previous.project_id } }) : await prisma.project.create({ data: { userId: user!.id, title: String(c.intake.topic), program: "Evaluación privada G1", degreeLevel: c.academic_level, university: null } });
  const startedAt = new Date();
  const job = previous ? await prisma.blueprintJob.update({ where: { id: previous.job_id, projectId: project.id, status: "FAILED" }, data: { status: "RUNNING", startedAt, lockedAt: startedAt, completedAt: null } }) : await prisma.blueprintJob.create({ data: { projectId: project.id, userId: user!.id, status: "RUNNING", startedAt, lockedAt: startedAt, metadataJson: { evaluation: EVALUATION, caseId, frozenInputHash: input_hash } } });
  const counts: Record<"selector" | "critic" | "repair", number> = previous?.counts ?? { selector: 0, critic: 0, repair: 0 }; const reservations: unknown[] = previous ? await read(path.join(directory, "dispatches.json")) : [];
  const provider = { ...actual, async generateStructuredObject(request: any) {
    const type = request.schemaName.startsWith("design_selector") ? "selector" : request.schemaName.startsWith("design_critic") ? "critic" : request.schemaName.startsWith("design_repair") ? "repair" : null;
    // Replay the original paid provider failure; no new selector request is dispatched.
    if (recover && type === "selector" && partial !== null) { const saved = partial; partial = null; throw new IncompleteStructuredOutputError(saved, "max_output_tokens"); }
    if (!paid || !type || counts[type] >= 1) throw new Error("EVALUATION_CALL_LIMIT");
    const bound = responseCostBound({ model: request.model, max_output_tokens: request.maxOutputTokens, reasoning: { effort: request.reasoningEffort }, store: false, input: request.prompt, text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } } });
    const controls = await prisma.blueprintJobStage.findMany({ where: { stageKey: "control:cost", job: { metadataJson: { path: ["evaluation"], equals: EVALUATION } } } });
    const spent = controls.flatMap((row) => (row.outputJson as any).entries).reduce((sum: number, e: any) => sum + (e.estimate ?? e.maximum), 0);
    if (!bound || spent + bound.maximumUsd > 8) throw new Error("GLOBAL_EVALUATION_BUDGET_BLOCKED");
    counts[type]++;
    const record = { type, global_committed_usd: spent, projected_maximum_usd: bound.maximumUsd, model: request.model, output_tokens_max: request.maxOutputTokens, prompt_hash: fingerprint(request.prompt), at: new Date().toISOString() };
    reservations.push(record); await save(path.join(directory, "dispatches.json"), reservations);
    await save(path.join(directory, `${type}.request.json`), request);
    console.log(JSON.stringify(record));
    const value = await actual.generateStructuredObject(request); await save(path.join(directory, `${type}.output.json`), value); return value;
  } } as typeof actual;
  let result: any, error: string | null = null, cost: any;
  await withJobExecution({ jobId: job.id, startedAt, stage: "scientific_design_evaluation" }, async () => {
    try { result = await withApplicationBudget(new ApplicationBudget(2, 1.25), () => proposeScientificDecision({ projectId: project.id, runId: job.id, intake: c.intake, academicLevel: c.academic_level, ledger: c.ledger, provider })); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    cost = await jobCostSnapshot();
  });
  await prisma.$transaction(async (tx) => { await tx.blueprintJob.update({ where: { id: job.id }, data: { status: result ? "WAITING_USER_DECISION" : "FAILED", lockedAt: null, errorMessage: error, completedAt: result ? null : new Date() } }); await closeJobCostControl(tx, job.id, result ? "COMPLETED" : "FAILED"); });
  const usage = (cost?.entries ?? []).map((e: any) => ({ purpose: e.purpose, model: e.actualModel, usage: e.usage, estimate: e.estimate, maximum: e.maximum, status: e.status }));
  const summary = { case_id: caseId, project_id: project.id, job_id: job.id, frozen_input_hash: input_hash, counts, result: result ?? null, error, cost, usage, duration_ms: (previous?.duration_ms ?? 0) + Date.now() - startedAt.getTime(), approvable: result?.decision.alternatives.filter((a: any) => alternativeIsApprovable(a, result.critique)).map((a: any) => a.id) ?? [] };
  await save(path.join(directory, "result.json"), summary);
  console.log(JSON.stringify({ caseId, job: job.id, counts, error, cost: cost?.committed_usd ?? 0, approvable: summary.approvable, duration_ms: summary.duration_ms }));
  if (error && caseId !== "insufficient") process.exitCode = 1;
}
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated RC4 DB required");
  if (process.argv.includes("--prepare")) return prepare();
  const caseId = process.argv.find((a) => a.startsWith("--case="))?.split("=")[1];
  if (!caseId) throw new Error("Use --prepare or --case=...");
  await run(caseId, process.argv.includes("--paid"));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
