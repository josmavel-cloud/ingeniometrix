// Read-only aggregation of evaluated B3 calls; writes only local evaluation reports.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SCIENTIFIC_PLAN_PROMPT as v1 } from "@/server/mvp/prompts/scientific-plan.v1";
import { SCIENTIFIC_PLAN_PROMPT as v2 } from "@/server/mvp/prompts/scientific-plan.v2";
import { SCIENTIFIC_PLAN_PROMPT as v3, SCIENTIFIC_TASKS } from "@/server/mvp/prompts/scientific-plan.v3";
import { SECTION_BUDGET_PROMPT as compact1 } from "@/server/mvp/prompts/section-budget.v1";
import { SECTION_BUDGET_PROMPT as compact2 } from "@/server/mvp/prompts/section-budget.v2";
import { CONSISTENCY_MATRIX_PROMPT as matrix } from "@/server/mvp/prompts/consistency-matrix.v1";
import { HERO_INFOGRAPHIC_PROMPT as hero } from "@/server/mvp/prompts/hero-infographic.v1";
import { STEP2_EVIDENCE_INFORMED_REFINEMENT_PROMPT as step2 } from "@/server/mvp/prompts/step2-evidence-informed-refinement.v2";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT as step5 } from "@/server/mvp/prompts/step5-source-evidence-extraction.v3";

async function main() {
  const root = path.join(process.cwd(), "artifacts-local/release0-scientific-validation/b3");
  const records = new Map<string, any>(), budgets: any[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (entry.name === "application-budget.json") budgets.push({ file, ...JSON.parse(await readFile(file, "utf8")) });
      if (path.basename(dir) !== "provider-calls" || !entry.name.endsWith(".json")) continue;
      const record = JSON.parse(await readFile(file, "utf8"));
      if (record.response?.id && !records.has(record.response.id)) records.set(record.response.id, { file, ...record });
    }
  }
  await walk(root);
  const registries = [v3, v2, v1, compact2, compact1, matrix, step2, step5];
  const calls = [...records.values()].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const inventory = calls.map((r) => ({ call_id: r.response.id, schema: r.request.text?.format?.name, configured_model: r.request.model, actual_model: r.response.model, prompt_version: registries.find((p) => r.request.input.startsWith(p.systemPrompt))?.version ?? (r.request.text?.format?.name === "mvp_intake_normalization" ? "ingeniometrix-step1-intake-normalization-v3" : "existing inline discovery/language template (unchanged)"), max_output_tokens: r.request.max_output_tokens, reasoning: r.request.reasoning ?? "provider default, not supplied", retry_policy: "transport/provider 0; compaction at most 2 calls", usage: r.response.usage, started_at: r.started_at, ended_at: r.ended_at, status: r.response.status, record_path: r.file }));
  const sum = (key: string) => calls.reduce((n, r) => n + (r.response.usage?.[key] ?? 0), 0);
  const allEntries = budgets.flatMap((b) => b.entries);
  const imageEntries = allEntries.filter((e) => e.purpose === "hero_infographic");
  const totalCost = budgets.reduce((n, b) => n + b.committed_usd, 0);
  const summary = { budgets: budgets.map(({ file, cap_usd, committed_usd, entries }) => ({ file, cap_usd, committed_usd, calls: entries.length })), total_acceptance_estimated_usd: totalCost, normal_and_repair_text_cost_usd: allEntries.filter((e) => e.purpose === "text").reduce((n, e) => n + (e.estimated_usd ?? e.reserved_usd), 0), deep_research_cost_usd: 0, deep_research_live_status: "NOT_RUN: both positive cases LIMITED, no expansion required", image_cost_usd: imageEntries.reduce((n, e) => n + e.estimated_usd, 0), image_calls: imageEntries, text_calls: calls.length, text_usage: { input_tokens: sum("input_tokens"), output_tokens: sum("output_tokens"), cached_tokens: calls.reduce((n, r) => n + (r.response.usage?.input_tokens_details?.cached_tokens ?? 0), 0), total_tokens: sum("total_tokens"), missing_usage_calls: calls.filter((r) => !r.response.usage).length }, provider_call_duration_ms: calls.reduce((n, r) => n + Date.parse(r.ended_at) - Date.parse(r.started_at), 0), models: [...new Set(calls.map((r) => r.response.model))], note: "USD estimated from provider-reported tokens, not invoice. All failed/repair attempts included. Copied checkpoint records deduplicated by response.id. Durations here are provider intervals, not full backend duration." };
  if (totalCost > 5) throw new Error("Acceptance spend exceeded cap");
  await writeFile(path.join(root, "usage-summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(path.join(root, "provider-call-inventory.json"), JSON.stringify(inventory, null, 2));
  const lines = ["# PROMPTS_USED — B3", "", "Solo fixtures B3. No secretos ni intakes privados. Este inventario incluye intentos fallidos y reparaciones, sin duplicar checkpoints.", "", "## Arreglo efectivo", "", "Responses recibe un unico input string concatenado; no roles system/developer separados. JSON Schema estricto completo en cada request. store=false; modelos y max_output_tokens abajo. No reasoning/temperature explicitos. Imagen: Images API, un prompt, high, 1024x1024, n=1, sin reintentos. Dos solicitudes pagadas de imagen (una por positivo). La de ingenieria fue rechazada visualmente por C2/C3 y sustituida por grafico determinista sin otra llamada.", "", "## Cambios", "", "scientific-plan v1 introduce DAG y diseno; v2 aclara soporte/instrumentos y schema real; v3 impide inferir ausencia universal desde extractos y distingue vocabulario cientifico de jerga de backend. No cambio de modelo gpt-5.4. consistency-matrix v1 sustituye parsing de puntuacion por JSON y tabla nativa. section-budget v1/v2 usa mini para condensacion, preserva pares de evidencia y acota una reparacion de longitud; el limite final es PDF<=18 paginas de cuerpo. hero v1 usa Sunburst; el contexto final excluye IDs internos. Step1/2/discovery/5 conservan prompts/modelos B2. Deep Research no se ejecuto y no figura como prompt utilizado.", "", "## Variables", "", "Intake=fixture normalizado y seleccion humana simulada declarada. stable_definition=problema/preguntas/objetivos; research_design=diseno polimorfico; evidence=extractos verificados con fuente, nivel y uso permitido; coverage=dimensiones cubiertas/faltantes; upstream_sections=borradores estabilizados; word_budget=objetivo editorial; consistency_matrix=JSON validado; final_title=titulo revisado. Compaction: paragraphs y max/target/observed_words. Imagen: problem,subject,constructs sin IDs,methodology,comparison,analysis_workflow. Las definiciones y schemas exactos acompanian cada registro.", "", "## Llamadas observadas", "", "```json", JSON.stringify(inventory, null, 2), "```"];
  for (const registry of [...registries, hero]) lines.push("", `## Plantilla completa: ${registry.version}`, "```json", JSON.stringify(registry, null, 2), "```");
  lines.push("", "## Tareas cientificas completas", "```json", JSON.stringify(SCIENTIFIC_TASKS, null, 2), "```");
  for (const [file, start, end] of [["server/mvp/intake-normalization-service.ts", "function buildPrompt(input: IntakeInput)", "function buildFrontendSummary"], ["server/retrieval/reference-search-v2.ts", "function buildPrompt(intake: IntakeInput)", "function sanitizeKeywordGroups"]]) {
    const source = await readFile(file, "utf8"), from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error("Prompt template marker missing");
    lines.push("", `## Plantilla existente: ${file}`, "```ts", source.slice(from, to), "```");
  }
  lines.push("", "## Solicitudes completas efectivamente enviadas (incluyen schema y datos de fixture)");
  for (const r of calls) lines.push("", `### ${r.response.id}`, "```json", JSON.stringify(r.request, null, 2), "```");
  for (const source of ["engineering/release0-b3-engineering-2026-09-18T23-17-05-733Z/closure", "qualitative/release0-b3-qualitative-2026-09-18T23-36-33-673Z"]) {
    const report = JSON.parse(await readFile(path.join(root, source, "case-result.json"), "utf8"));
    const imageRecord = JSON.parse(await readFile(path.join(report.artifacts.canonical_dir, "step6-hero-image.png.json"), "utf8"));
    lines.push("", `## Imagen efectivamente solicitada: ${report.case_key}`, "```json", JSON.stringify(imageRecord, null, 2), "```");
  }
  await writeFile(path.join(root, "PROMPTS_USED.md"), lines.join("\n"));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
