import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { STEP2_EVIDENCE_INFORMED_REFINEMENT_PROMPT as step2 } from "@/server/mvp/prompts/step2-evidence-informed-refinement.v2";
import { STEP5_SOURCE_EVIDENCE_EXTRACTION_PROMPT as step5 } from "@/server/mvp/prompts/step5-source-evidence-extraction.v3";
import { STEP6_SECTION_DRAFT_PROMPT as section } from "@/server/mvp/prompts/step6-section-draft.v2";
import { STEP6_EDITORIAL_REVIEW_PROMPT as editorial } from "@/server/mvp/prompts/step6-editorial-review.v1";
import { STEP6_TITLE_GENERATION_PROMPT as title } from "@/server/mvp/prompts/step6-title-generation.v1";

async function main() {
  const root = path.join(process.cwd(), "artifacts-local", "release0-scientific-validation", "b2");
  const records: any[] = [];
  const promptBySchema: Record<string, [string, string]> = {
    mvp_intake_normalization: ["Step 1: normalizar intake", "ingeniometrix-step1-intake-normalization-v3"],
    reference_search_v2_plan: ["Discovery: plan de consultas", "reference-search-v2 (plantilla inline existente, sin cambio B2)"],
    mvp_evidence_informed_topic_refinement: ["Step 2: refinamiento", step2.version],
    mvp_step5_source_evidence_extraction: ["Step 5: extraer evidencia inspeccionable", step5.version],
    mvp_step6_section_draft: ["Step 6: redactar seccion propuesta", section.version],
    mvp_step6_editorial_review: ["Step 6: revision editorial", editorial.version],
    mvp_step6_title_generation: ["Step 6: titulo", title.version],
  };
  for (const domain of ["engineering", "qualitative"]) for (const run of await readdir(path.join(root, domain))) {
    const dir = path.join(root, domain, run, "provider-calls");
    for (const file of await readdir(dir).catch(() => [])) {
      const call = JSON.parse(await readFile(path.join(dir, file), "utf8"));
      const schema = call.request.text?.format?.name;
      records.push({ call_id: call.response.id, purpose: promptBySchema[schema]?.[0], prompt_version: promptBySchema[schema]?.[1], run, path: path.join(dir, file), started_at: call.started_at, ended_at: call.ended_at, configured_model: call.request.model, actual_model: call.response.model, schema, max_output_tokens: call.request.max_output_tokens, reasoning: call.request.reasoning ?? "not supplied; provider default", usage: call.response.usage, status: call.response.status });
    }
  }
  const sections = ["# PROMPTS_USED — B2", "", "Solo llamadas observadas en las evaluaciones nuevas B2. Todos los intakes son fixtures. No se incluyen secretos ni intakes privados.", "", "## Arreglo real de mensajes y limites", "", "Responses API recibe un unico `input` string: instrucciones + plantilla de usuario interpolada. No hay mensajes system/developer separados. `store:false`, JSON Schema estricto, sin reasoning/temperature explicitos. Transporte SDK y wrapper: 0 reintentos durante B2; helper admite a lo sumo un fallback textual JSON por llamada, no observado en estas ejecuciones. Limite 8000 tokens; editorial 16000. Sin imagen remota ni localizacion visual opcional. Presupuesto preventivo por proceso USD 2.20, con reserva por bytes UTF-8 + schema + 2048 y salida maxima; datos desconocidos no se consideran cero.", "", "## Cambio de prompt", "", "Unico cambio B2: Step 5 v2 -> v3. Mismo gpt-5.4-mini; exige extracto literal en idioma original y limita a 6 items para evitar truncamiento y permitir verificacion determinista. Schema agrega supporting_excerpt. Step 1 conserva prompt; required.en se corrige para schema estricto. Step 2 v2 y Step 6 v2/editorial v1/titulo v1 no cambian. No se migro el modelo de aplicacion.", "", "## Variables dinamicas", "", "Intake: campos estructurados del fixture elegido. Discovery: intake normalizado y contexto de busqueda. Step 2: intake, resumen de busqueda y candidatos reales. Step 5: final_intake_json, section_content_plan_json, source_registry_record_json, evidence_basis, recovered_chunks_json, asset_candidates_json, source_health_json. Step 6: contexto de proyecto/intake, contrato de estilo, seccion y evidencia seleccionada, fuentes/anclas, resumen de secciones previas, plan de paginas y activos. Editorial: borradores completos, restricciones y resumen de secciones. Titulo: contexto y resumen del plan. Las definiciones exactas de placeholders figuran en las plantillas siguientes y los constructores referenciados.", "", "## Llamadas realmente observadas", "", "```json", JSON.stringify(records, null, 2), "```"];
  for (const [label, value, schema] of [
    ["Step 2", step2, "topicRefinementSchema @ server/mvp/topic-refinement-service.ts"],
    ["Step 5", step5, "outputSchema incluido"],
    ["Step 6 seccion", section, "outputSchema incluido"],
    ["Step 6 editorial", editorial, "outputSchema incluido"],
    ["Step 6 titulo", title, "outputSchema incluido"],
  ] as const) sections.push("", `## ${label}`, `Schema: ${schema}`, "```json", JSON.stringify(value, null, 2), "```");
  for (const [label, file, start, end] of [
    ["Step 1", "server/mvp/intake-normalization-service.ts", "function buildPrompt(input: IntakeInput)", "function buildFrontendSummary"],
    ["Discovery", "server/retrieval/reference-search-v2.ts", "function buildPrompt(intake: IntakeInput)", "function sanitizeKeywordGroups"],
  ]) {
    const code = await readFile(file, "utf8");
    const from = code.indexOf(start), to = code.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error(`Template marker missing: ${file}`);
    sections.push("", `## ${label} — plantilla exacta`, `Schema exacto: ${label === "Step 1" ? "normalizedIntakeSchema" : "referenceSearchPlanSchema"} en ${file}; tambien queda completo en request.text.format.schema de cada registro.`, "```ts", code.slice(from, to).trim(), "```");
  }
  sections.push("", "## Solicitud exacta y esquema por llamada", "", "Cada ruta provider-calls registrada arriba conserva la solicitud completa realmente enviada (incluido schema), respuesta, modelo efectivo, tokens y timestamps. No se han creado roles artificiales ni listado prompts de imagen/traduccion que no fueron ejecutados. Las reexportaciones deterministas no agregan prompts ni tokens.");
  await writeFile(path.join(root, "PROMPTS_USED.md"), sections.join("\n"));
  await writeFile(path.join(root, "provider-call-inventory.json"), JSON.stringify(records, null, 2));
  console.log(JSON.stringify({ calls: records.length, path: path.join(root, "PROMPTS_USED.md") }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
