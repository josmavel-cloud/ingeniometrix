import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import type { LlmProvider } from "@/llm/provider";

import type { MvpStep5EvidenceLedger } from "./evidence-materialization-types";
import { generateValidatedHero, requestGeneratedImage, validateVisual, type VisualQualityResult } from "./final-infographic-v2";
import { MATRIX_VISUAL_PROMPT } from "./prompts/matrix-visual.v1";
import { HERO_INFOGRAPHIC_PROMPT_V2 } from "./prompts/hero-infographic.v2";
import { VISUAL_QA_PROMPT } from "./prompts/visual-qa.v1";
import { consistencyTableRows, type ConsistencyMatrix, type ResearchDefinition, type ResearchDesign } from "./research-plan-contracts";
import type { MvpStep6ContentBlock, MvpStep6HeroImagePlan, MvpStep6SectionDraft, MvpStep6VisualAssetPlan, MvpStep6VisualPlan } from "./step6-blueprint-docx-types";

const COLORS = { dark: "#243c3a", accent: "#467269", pale: "#edf4f2", warm: "#eee9df", border: "#96aaa5" };
export const visualCheckpointPolicy = () => ({ matrix: MATRIX_VISUAL_PROMPT, hero: HERO_INFOGRAPHIC_PROMPT_V2, qa: VISUAL_QA_PROMPT, qa_model: process.env.IMX_VISUAL_QA_MODEL ?? VISUAL_QA_PROMPT.model, renderer: "b4.v1" });

function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function firstSentence(value: string) { return clean(value).split(/(?<=[.!?])\s/)[0] || clean(value); }
function leadingClause(value: string) { return firstSentence(value).split(/[,;:]/)[0].trim(); }
function keywordLabel(value: string, words = 8) { return leadingClause(value).split(/\s+/).slice(0, words).join(" "); }
function significantTokens(value: string) {
  const stop = new Set(["para", "como", "desde", "entre", "sobre", "mediante", "estudio", "propuesto", "propuesta", "investigacion", "diseño", "analisis", "figura", "ejemplo"]);
  return new Set(clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((item) => item.length > 4 && !stop.has(item)));
}
function wrap(value: string, maxChars: number) {
  const words = clean(value).split(" ").filter(Boolean).flatMap((word) => word.match(new RegExp(`.{1,${maxChars}}`, "gu")) ?? []); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > maxChars && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}
function svgText(input: { text: string; x: number; y: number; width: number; fontSize?: number; bold?: boolean; maxLines?: number }) {
  const fontSize = input.fontSize ?? 30; const lines = wrap(input.text, Math.max(12, Math.floor(input.width / (fontSize * 0.52))));
  const selected = typeof input.maxLines === "number" ? lines.slice(0, input.maxLines) : lines;
  return `<text x="${input.x}" y="${input.y}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${input.bold ? 700 : 400}" fill="${COLORS.dark}">${selected.map((line, index) => `<tspan x="${input.x}" dy="${index === 0 ? 0 : fontSize * 1.22}">${xml(line)}</tspan>`).join("")}</text>`;
}
function fittedSvgText(input: { text: string; x: number; y: number; width: number; height: number; preferredSize?: number; bold?: boolean }) {
  let fontSize = input.preferredSize ?? 30;
  while (fontSize > 18 && wrap(input.text, Math.max(12, Math.floor(input.width / (fontSize * 0.52)))).length * fontSize * 1.22 > input.height) fontSize -= 2;
  const lines = wrap(input.text, Math.max(12, Math.floor(input.width / (fontSize * 0.52))));
  if (lines.length * fontSize * 1.22 > input.height) throw new Error("DECLARATIVE_DIAGRAM_TEXT_OVERFLOW");
  return svgText({ text: input.text, x: input.x, y: input.y, width: input.width, fontSize, bold: input.bold });
}
export async function renderBoxes(input: { outputPath: string; title: string; subtitle: string; boxes: string[]; arrows?: boolean }) {
  const width = 1600; const boxWidth = 1260;
  // Deterministic summaries are labels, not replacements for the complete method.
  // Keep a readable canvas; the full input is retained in a private sidecar.
  const labels = input.boxes.map((text) => clean(text).split(/\s+/).slice(0, 12).join(" "));
  const boxHeight = Math.max(150, ...labels.map((text) => wrap(text, 56).length * 49 + 70));
  const height = Math.max(900, 260 + labels.length * (boxHeight + 18));
  if (height > 2400 || 38 * Math.min(520 / width, 500 / height) * 0.75 < 9) throw new Error("DECLARATIVE_DIAGRAM_TEXT_OVERFLOW: optional diagram cannot retain 9pt labels at final page size");
  const boxes = labels.map((box, index) => {
    const y = 220 + index * (boxHeight + 18);
    return `<rect x="170" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="18" fill="${index % 2 ? COLORS.pale : COLORS.warm}" stroke="${COLORS.border}" stroke-width="2"/>${fittedSvgText({ text: box, x: 215, y: y + 52, width: boxWidth - 90, height: boxHeight - 65, preferredSize: 40 })}${input.arrows && index < input.boxes.length - 1 ? `<path d="M800 ${y + boxHeight}v18" stroke="${COLORS.accent}" stroke-width="6"/><path d="M786 ${y + boxHeight + 10}l14 14 14-14" fill="none" stroke="${COLORS.accent}" stroke-width="6"/>` : ""}`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="white"/>${svgText({ text: input.title, x: 120, y: 90, width: 1360, fontSize: 46, bold: true })}${svgText({ text: input.subtitle, x: 120, y: 145, width: 1360, fontSize: 25 })}${boxes}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(input.outputPath);
  await writeFile(`${input.outputPath}.layout.json`, JSON.stringify({ original_labels: input.boxes, display_labels: labels, full_content_location: "ResearchDesign and methodology", fallback: labels.some((label, i) => label !== clean(input.boxes[i])) ? "deterministic_label_summary" : "adaptive_geometry", width, height, minimum_font_px: 38 }, null, 2));
}

function sourceLabel(ledger: MvpStep5EvidenceLedger, sourceId: string) {
  const source = ledger.source_registry.find((item) => item.source_id === sourceId);
  if (!source) return "Fuente inspeccionada";
  const author = source.authors[0]?.split(/[, ]/)[0] || clean(source.title).split(" ").slice(0, 3).join(" ");
  return `${author}${source.authors.length > 1 ? " et al." : ""} (${source.year ?? "s. f."})`;
}

export function evidenceComparison(ledger: MvpStep5EvidenceLedger, usedSourceIds: string[]): MvpStep6ContentBlock {
  const rows = usedSourceIds.slice(0, 8).map((sourceId) => {
    const extraction = ledger.semantic_extractions.find((item) => item.source_id === sourceId);
    const usable = extraction?.evidence_items.find((item) => item.support_verified !== false && item.allowed_use !== "gap_only");
    const basis = extraction?.evidence_basis === "PDF_FULLTEXT" ? "Texto completo" : extraction?.evidence_basis === "PDF_SAMPLE_TEXT" ? "Texto parcial" : extraction?.evidence_basis === "ABSTRACT_METADATA" ? "Resumen/metadatos" : "Solo metadatos";
    return [sourceLabel(ledger, sourceId), basis, usable ? firstSentence(usable.traceable_summary_es) : "No reportado en el material inspeccionado.", usable?.gaps[0] || extraction?.gaps[0] || "No reportado en el material inspeccionado."];
  });
  return { kind: "table", title: "Comparación de la evidencia inspeccionada", rows: [["Referencia", "Nivel inspeccionado", "Aporte utilizable", "Límite del material"], ...rows], source_note: "Fuente: síntesis de las fuentes inspeccionadas; no constituye una revisión exhaustiva.", render_hint: "compact" };
}

export function researchDesignTable(design: ResearchDesign): MvpStep6ContentBlock {
  const qualitative = design.approach === "qualitative" || design.approach === "theoretical";
  const constructRows = [[
    `Variables/categorías/conceptos (${design.constructs.length})`,
    design.constructs.map((item) => `${item.name} (${item.kind})`).join("; ") || "No aplica al diseño declarado.",
    "Definiciones operativas y dimensiones detalladas en el marco conceptual.",
  ]];
  const rows = [
    ["Paradigma/enfoque", keywordLabel(design.paradigm, 8), design.approach], ["Diseño", leadingClause(design.design), "El desarrollo íntegro se conserva en la metodología."],
    ["Unidad, población o corpus", keywordLabel(design.unit_population_corpus, 12), keywordLabel(design.sampling_selection, 12)], ...constructRows,
    ["Fuentes y técnicas", design.data_material_sources.slice(0, 3).map((value) => keywordLabel(value, 8)).join("; "), `${design.techniques.slice(0, 3).map((value) => keywordLabel(value, 8)).join("; ")}${design.techniques.length > 3 ? `; ${design.techniques.length - 3} técnica(s) adicional(es) descritas en la metodología` : ""}`],
    ["Instrumentos", design.instruments.join("; ") || "Por definir", design.pending_decisions.length ? `${design.pending_decisions.length} decisiones pendientes; véase alcance, limitaciones y decisiones pendientes.` : "Sin decisión crítica pendiente declarada"],
    ["Análisis", firstSentence(design.analysis_method), design.quality_criteria.length ? `${design.quality_criteria.length} criterios declarados; principal: ${leadingClause(design.quality_criteria[0])}` : "Criterios por definir"],
  ];
  return { kind: "table", title: "Diseño de investigación propuesto", rows: [["Componente", "Definición propuesta", qualitative ? "Fuentes/interpretación o decisión pendiente" : "Indicadores/medición o decisión pendiente"], ...rows], source_note: "Fuente: elaboración propia a partir del diseño de investigación estabilizado.", render_hint: "compact" };
}

function publicOrdinalLabel(prefix: string, ids: string[], orderedIds: string[]) {
  return ids.map((id) => `${prefix} ${orderedIds.indexOf(id) + 1}`).join("; ");
}

export function matrixVisualRows(matrix: ConsistencyMatrix, definition: ResearchDefinition, design: ResearchDesign) {
  const questionIds = definition.questions.map((item) => item.id); const objectiveIds = definition.objectives.map((item) => item.id);
  return matrix.rows.map((row) => [
    publicOrdinalLabel("Pregunta", row.question_ids, questionIds),
    publicOrdinalLabel("Objetivo", row.objective_ids, objectiveIds),
    row.construct_ids.map((id) => design.constructs.find((item) => item.id === id)?.name).filter(Boolean).join("; ") || "No aplica",
    design.techniques.slice(0, 2).join("; ") || design.data_material_sources[0] || design.approach,
    [design.analysis_method.split(/(?<=[.!?])\s/)[0], design.quality_criteria[0]].filter(Boolean).join("; "),
  ]);
}

async function renderMatrixComposite(input: { backdropPath: string; outputPath: string; rows: string[][]; definition: ResearchDefinition; design: ResearchDesign }) {
  const width = 2400; const height = 1500; const headers = ["Preguntas", "Objetivos", "Conceptos", "Datos y técnicas", "Análisis y calidad"];
  const columns = [320, 320, 480, 580, 580]; const startX = 60; const headerY = 155; const rowHeight = Math.floor(1170 / Math.max(1, input.rows.length));
  let x = startX;
  const header = headers.map((value, index) => { const current = x; x += columns[index]; return `<rect x="${current}" y="${headerY}" width="${columns[index]}" height="95" fill="${COLORS.accent}" stroke="white" stroke-width="3"/>${svgText({ text: value, x: current + 18, y: headerY + 58, width: columns[index] - 36, fontSize: 28, bold: true })}`; }).join("");
  const body = input.rows.map((row, rowIndex) => { let cellX = startX; const y = headerY + 95 + rowIndex * rowHeight; return row.map((value, index) => { const current = cellX; cellX += columns[index]; return `<rect x="${current}" y="${y}" width="${columns[index]}" height="${rowHeight}" fill="${rowIndex % 2 ? "rgba(237,244,242,0.96)" : "rgba(255,255,255,0.96)"}" stroke="${COLORS.border}" stroke-width="2"/>${svgText({ text: value, x: current + 16, y: y + 42, width: columns[index] - 32, fontSize: 24 })}`; }).join(""); }).join("");
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="rgba(255,255,255,0.78)"/>${svgText({ text: "Matriz visual de consistencia", x: 60, y: 78, width: 2280, fontSize: 44, bold: true })}${svgText({ text: `${input.definition.questions.length} preguntas, ${input.definition.objectives.length} objetivos y ${input.design.constructs.length} conceptos`, x: 60, y: 125, width: 2280, fontSize: 24 })}${header}${body}</svg>`;
  await sharp(input.backdropPath).resize(width, height, { fit: "cover" }).composite([{ input: Buffer.from(overlay) }]).png().toFile(input.outputPath);
}

function insertBeforeFirstTable(draft: MvpStep6SectionDraft, blocks: MvpStep6ContentBlock[]) {
  const index = draft.blocks.findIndex((block) => block.kind === "table"); draft.blocks.splice(index < 0 ? draft.blocks.length : index, 0, ...blocks);
}

export async function buildVisualDeliverables(input: {
  provider: LlmProvider; definition: ResearchDefinition; design: ResearchDesign; matrix: ConsistencyMatrix;
  ledger: MvpStep5EvidenceLedger; usedSourceIds: string[]; drafts: MvpStep6SectionDraft[]; artifactDir: string; heroOutputPath: string;
  projectId?: string; runId?: string;
  imageGeneratorOverride?: typeof requestGeneratedImage;
  visionValidatorOverride?: typeof validateVisual;
  heroGeneratorOverride?: typeof generateValidatedHero;
}) {
  const visualDir = path.join(input.artifactDir, "visuals"); await mkdir(visualDir, { recursive: true });
  const assets: MvpStep6VisualAssetPlan[] = []; const warnings: string[] = []; let initialRequests = 0; let repairRequests = 0;
  const byKey = (key: string) => input.drafts.find((item) => item.section_key === key);
  const trackingAttribution = input.projectId && input.runId ? { projectId: input.projectId, runId: input.runId, stage: "blueprint_generation", source: "buildVisualDeliverables", promptVersion: "ingeniometrix-visual-deliverables-v1" } : undefined;

  const conceptualPath = path.join(visualDir, "conceptual-system-diagram.png");
  const kindLabel = (kind: ResearchDesign["constructs"][number]["kind"]) => ({ variable: "variable", category: "categoría", construct: "constructo", concept: "concepto" })[kind];
  await renderBoxes({ outputPath: conceptualPath, title: "Relaciones conceptuales del estudio propuesto", subtitle: "Representación original; las relaciones se plantean para investigación y no como resultados establecidos.", boxes: [`Problema propuesto: ${firstSentence(input.definition.problem)}`, ...input.design.constructs.slice(0, 3).map((item) => `${kindLabel(item.kind)}: ${item.name}${item.dimensions_indicators.length ? ` — ${item.dimensions_indicators.join("; ")}` : ""}`)] });
  const conceptual: MvpStep6ContentBlock = { kind: "figure", title: "Relaciones conceptuales del estudio propuesto", image_path: conceptualPath, source_note: "Fuente: elaboración propia a partir del problema y del diseño de investigación propuesto.", asset_key: "original:conceptual-system-diagram", source_id: null };
  byKey("conceptual_framework")?.blocks.push({ kind: "paragraph", text: "La figura siguiente sintetiza las relaciones conceptuales que orientan el estudio; representa relaciones propuestas, no hallazgos confirmados." }, conceptual);
  assets.push({ asset_id: "conceptual-system-diagram", asset_type: "conceptual_diagram", purpose: "Explicitar entidades y relaciones propuestas", destination_section: "conceptual_framework", origin: "original_design", content_specification: { problem: input.definition.problem, constructs: input.design.constructs }, supporting_source_ids: input.design.methodological_support.map((item) => item.source_id), rendering_method: "SVG declarativo seguro convertido a PNG con Sharp", caption: conceptual.title, attribution: conceptual.source_note, quality_requirements: ["relaciones propuestas identificables", "sin resultados inventados", "sin rutas o IDs"], status: "accepted", output_paths: [conceptualPath], failure_reason: null, validation: { deterministic: true, width: 1600, height: 900 } });

  const workflowPath = path.join(visualDir, "methodology-workflow.png");
  const procedureBounds = [input.design.procedure[0], input.design.procedure.at(-1)].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index).map((value) => keywordLabel(value, 6));
  const workflow = [`Datos/materiales (${input.design.data_material_sources.length}): ${input.design.data_material_sources.slice(0, 3).map((value) => keywordLabel(value, 5)).join("; ")}`, `Selección: ${keywordLabel(input.design.sampling_selection, 10)}`, `Procedimiento (${input.design.procedure.length} etapas): ${procedureBounds.join(" → ")}`, `Análisis: ${keywordLabel(input.design.analysis_method, 10)}`, `Validación/calidad: ${input.design.quality_criteria.slice(0, 2).map((value) => keywordLabel(value, 6)).join("; ")}`].filter(Boolean);
  await renderBoxes({ outputPath: workflowPath, title: "Flujo metodológico propuesto", subtitle: `${input.design.paradigm} | ${input.design.approach}`, boxes: workflow, arrows: true });
  const workflowBlock: MvpStep6ContentBlock = { kind: "figure", title: "Flujo metodológico propuesto", image_path: workflowPath, source_note: "Fuente: elaboración propia a partir del diseño metodológico propuesto.", asset_key: "original:methodology-workflow", source_id: null };
  const methodology = byKey("methodology"); methodology?.blocks.push(workflowBlock, researchDesignTable(input.design));
  assets.push({ asset_id: "methodology-workflow", asset_type: "methodology_workflow", purpose: "Mostrar datos/materiales, procedimiento, análisis y validación", destination_section: "methodology", origin: "original_design", content_specification: { display_labels: workflow, full_design_fields: { data_material_sources: input.design.data_material_sources, sampling_selection: input.design.sampling_selection, procedure: input.design.procedure, analysis_method: input.design.analysis_method, quality_criteria: input.design.quality_criteria } }, supporting_source_ids: input.design.methodological_support.map((item) => item.source_id), rendering_method: "SVG declarativo seguro convertido a PNG con Sharp", caption: workflowBlock.title, attribution: workflowBlock.source_note, quality_requirements: ["orden metodológico", "sin compromisos inventados"], status: "accepted", output_paths: [workflowPath], failure_reason: null, validation: { deterministic: true, labels_are_condensed_from_full_design: true } });
  assets.push({ asset_id: "research-design-table", asset_type: "research_design_table", purpose: "Presentar el diseño con columnas adaptadas al paradigma", destination_section: "methodology", origin: "original_design", content_specification: researchDesignTable(input.design), supporting_source_ids: input.design.methodological_support.map((item) => item.source_id), rendering_method: "Tabla Word nativa editable", caption: "Diseño de investigación propuesto", attribution: "Elaboración propia", quality_requirements: ["polimorfismo metodológico", "editable"], status: "accepted", output_paths: [], failure_reason: null, validation: { approach: input.design.approach } });

  const evidenceTable = evidenceComparison(input.ledger, input.usedSourceIds); byKey("state_of_knowledge")?.blocks.push(evidenceTable);
  assets.push({ asset_id: "evidence-comparison-table", asset_type: "evidence_comparison_table", purpose: "Comparar aportes y límites de material inspeccionado", destination_section: "state_of_knowledge", origin: "evidence_synthesis", content_specification: evidenceTable, supporting_source_ids: input.usedSourceIds, rendering_method: "Tabla Word nativa editable", caption: evidenceTable.kind === "table" ? evidenceTable.title : "", attribution: evidenceTable.kind === "table" ? evidenceTable.source_note : "", quality_requirements: ["solo evidencia inspeccionada", "nivel declarado", "no exhaustividad"], status: "accepted", output_paths: [], failure_reason: null, validation: { source_count: input.usedSourceIds.length } });

  const matrixRows = matrixVisualRows(input.matrix, input.definition, input.design); const backdropPath = path.join(visualDir, "consistency-matrix-backdrop.initial.png"); const matrixPath = path.join(visualDir, "consistency-matrix-visual.png");
  const layout = { rows: matrixRows.length, columns: 5, exact_text_overlay: true, palette: "muted teal/slate", layout: "landscape matrix" };
  const matrixPrompt = `${MATRIX_VISUAL_PROMPT.systemPrompt}\n\n${MATRIX_VISUAL_PROMPT.userPromptTemplate.replace("{{layout_json}}", JSON.stringify(layout))}`;
  const imageGenerator = input.imageGeneratorOverride ?? requestGeneratedImage;
  const visionValidator = input.visionValidatorOverride ?? validateVisual;
  let matrixQuality: VisualQualityResult | null = null; let matrixError: string | null = null; let matrixGenerated = false; let matrixUsage: unknown = null;
  try {
    initialRequests += 1;
    matrixUsage = await imageGenerator({ purpose: "consistency_matrix_visual", model: MATRIX_VISUAL_PROMPT.model, prompt: matrixPrompt, outputPath: backdropPath, size: "1536x1024", quality: "high" });
    await renderMatrixComposite({ backdropPath, outputPath: matrixPath, rows: matrixRows, definition: input.definition, design: input.design });
    matrixQuality = await visionValidator({ provider: input.provider, imagePath: matrixPath, assetType: "consistency_matrix_image", publicBrief: { row_count: input.matrix.rows.length, column_count: 5, terminology: matrixRows }, requiredProperties: ["matriz real", "filas y columnas legibles", "sin recortes", "sin resultados inventados"], forbiddenExactLabels: [...input.definition.questions.map((item) => item.id), ...input.definition.objectives.map((item) => item.id), ...input.design.constructs.map((item) => item.id)], trackingAttribution });
    matrixGenerated = matrixQuality.pass && matrixQuality.readable && matrixQuality.no_clipping && matrixQuality.matrix_representation;
  } catch (error) { matrixError = error instanceof Error ? error.message : "matrix_generation_failure"; }
  if (!matrixGenerated) {
    warnings.push(`Matriz visual no aceptada: ${matrixQuality?.issues.join("; ") || matrixError || "QA fallida"}`);
    const deterministicBackdrop = path.join(visualDir, "consistency-matrix-backdrop.deterministic.png");
    await sharp({ create: { width: 1536, height: 1024, channels: 4, background: "#edf4f2" } }).png().toFile(deterministicBackdrop);
    await renderMatrixComposite({ backdropPath: deterministicBackdrop, outputPath: matrixPath, rows: matrixRows, definition: input.definition, design: input.design });
  }
  await writeFile(`${matrixPath}.json`, `${JSON.stringify({ prompt_registry: MATRIX_VISUAL_PROMPT, actual_prompt: matrixPrompt, parameters: { model: MATRIX_VISUAL_PROMPT.model, quality: "high", size: "1536x1024", n: 1 }, usage: matrixUsage, visual_quality: matrixQuality, accepted: matrixGenerated, error: matrixError, composition: "AI-generated text-free backdrop followed by deterministic SVG text overlay from the validated matrix", roles: "Images API single prompt; Responses API user input_text + input_image for QA" }, null, 2)}\n`, "utf8");
  const matrixBlock: MvpStep6ContentBlock = { kind: "figure", caption_type: "table", title: "Matriz visual de consistencia", image_path: matrixPath, source_note: "Fuente: elaboración propia a partir de la matriz estructurada validada.", asset_key: "original:consistency-matrix-visual", source_id: null, render_hint: "landscape_full" };
  const matrixDraft = byKey("consistency_matrix"); if (matrixDraft) { const table = matrixDraft.blocks.find((block) => block.kind === "table"); if (table?.kind === "table") { table.rows = consistencyTableRows(input.matrix, input.definition, input.design); table.render_hint = "compact_landscape"; table.title = "Matriz de consistencia editable"; } insertBeforeFirstTable(matrixDraft, [matrixBlock]); }
  assets.push({ asset_id: "consistency-matrix-image", asset_type: "consistency_matrix_image", purpose: "Vista visual de las relaciones de la matriz validada", destination_section: "consistency_matrix", origin: "original_design", content_specification: { semantic_authority_hash: hash(input.matrix), projection_rule: "Relaciones completas entre filas; ordinales públicos para preguntas/objetivos; nombres completos de conceptos; primeras dos técnicas y primera frase de análisis + primer criterio. La tabla editable conserva el contenido íntegro.", rows: matrixRows }, supporting_source_ids: [...new Set(input.matrix.rows.flatMap((row) => row.rationale_evidence.map((item) => item.source_id)))], rendering_method: "Composición de imagen + superposición determinista desde la matriz estructurada", caption: matrixBlock.title, attribution: matrixBlock.source_note, quality_requirements: ["imagen primero", "matriz real", "legible", "sin recortes"], status: matrixGenerated ? "accepted" : "failed", output_paths: [backdropPath, matrixPath], failure_reason: matrixGenerated ? null : matrixError || matrixQuality?.issues.join("; ") || "QA fallida", validation: matrixQuality });
  assets.push({ asset_id: "consistency-matrix-table", asset_type: "consistency_matrix_table", purpose: "Representación completa y editable de la misma matriz", destination_section: "consistency_matrix", origin: "original_design", content_specification: { semantic_authority_hash: hash(input.matrix), rows: consistencyTableRows(input.matrix, input.definition, input.design) }, supporting_source_ids: [...new Set(input.matrix.rows.flatMap((row) => row.rationale_evidence.map((item) => item.source_id)))], rendering_method: "Tabla Word nativa después de la imagen", caption: "Matriz de consistencia editable", attribution: "Elaboración propia", quality_requirements: ["editable", "completa", "después de la imagen"], status: "accepted", output_paths: [], failure_reason: null, validation: { row_count: input.matrix.rows.length } });

  const heroGenerator = input.heroGeneratorOverride ?? generateValidatedHero;
  const hero = await heroGenerator({ provider: input.provider, definition: input.definition, design: input.design, outputPath: input.heroOutputPath, maxRepairRequests: Math.max(0, 1 - repairRequests), trackingAttribution });
  initialRequests += hero.initialRequests; repairRequests += hero.repairRequests; warnings.push(...hero.plan.warnings);
  assets.push({ asset_id: "hero-infographic", asset_type: "hero_infographic", purpose: "Comunicar el problema y el enfoque propuesto", destination_section: "cover", origin: "original_design", content_specification: hero.brief, supporting_source_ids: input.design.methodological_support.map((item) => item.source_id), rendering_method: hero.accepted ? "GPT Image 2.5 + QA visual" : "Fallback determinista (no satisface hero requerido)", caption: "Síntesis visual del plan de investigación", attribution: "Elaboración original para el plan", quality_requirements: ["relevante", "sin identificadores internos", "sin resultados inventados", "QA de píxeles"], status: hero.accepted ? "accepted" : "failed", output_paths: hero.attempts.map((item) => item.path).concat(input.heroOutputPath), failure_reason: hero.accepted ? null : hero.plan.warnings.join("; "), validation: hero.attempts.map((item) => item.quality) });

  const equationBlocks = input.drafts.flatMap((draft) => draft.blocks.filter((block): block is Extract<MvpStep6ContentBlock, { kind: "equation" }> => block.kind === "equation").map((block) => ({ draft, block })));
  assets.push({ asset_id: "equations", asset_type: "equation", purpose: "Incluir ecuaciones solo cuando sean científicamente aplicables y respaldadas", destination_section: "methodology", origin: "evidence_synthesis", content_specification: equationBlocks.length ? equationBlocks.map(({ draft, block }) => ({ section: draft.section_key, latex: block.latex, source_id: block.source_id, asset_key: block.asset_key })) : { applicable: false, reason: "El diseño estabilizado y la evidencia aceptada no aportan una ecuación verificable necesaria para expresar el método propuesto; no se añade matemática decorativa o no sustentada." }, supporting_source_ids: equationBlocks.map(({ block }) => block.source_id).filter((value): value is string => Boolean(value)), rendering_method: equationBlocks.length ? "Matemática Word nativa editable desde LaTeX inspeccionado" : "No aplicable", caption: "", attribution: "", quality_requirements: ["relevancia científica", "símbolos definidos", "apoyo verificable"], status: equationBlocks.length ? "accepted" : "not_applicable", output_paths: [], failure_reason: null, validation: { policy: "scientifically_relevant_and_supported_only", equation_count: equationBlocks.length } });

  const subjectTokens = significantTokens([input.definition.problem, input.design.unit_population_corpus, ...input.design.constructs.map((item) => `${item.name} ${item.dimensions_indicators.join(" ")}`)].join(" "));
  for (const draft of input.drafts) {
    for (let index = draft.blocks.length - 1; index >= 0; index -= 1) {
      const block = draft.blocks[index];
      if (block.kind !== "figure" || block.asset_key?.startsWith("original:")) continue;
      const review = input.ledger.semantic_extractions.flatMap((item) => item.asset_reviews).find((item) => item.asset_id === block.asset_key);
      const candidateTokens = significantTokens(`${block.title} ${review?.description_es ?? ""}`);
      const overlap = [...candidateTokens].filter((token) => subjectTokens.has(token));
      const accepted = Boolean(block.image_path && review?.keep_for_blueprint && review.relevance_score_100 >= 75 && overlap.length >= 2);
      if (accepted && review?.description_es) block.title = review.description_es;
      if (!accepted) draft.blocks.splice(index, 1);
      assets.push({ asset_id: block.asset_key ?? `source-asset:${assets.length}`, asset_type: "source_asset", purpose: "Reproducir únicamente activos científicos directamente útiles para el plan actual", destination_section: draft.section_key, origin: "reproduced_source", content_specification: { source_id: block.source_id, asset_key: block.asset_key, image_path: block.image_path, semantic_review: review ?? null }, supporting_source_ids: block.source_id ? [block.source_id] : [], rendering_method: accepted ? "Activo PDF extraído y aceptado por geometría y relevancia semántica" : "Excluido del documento final", caption: block.title, attribution: block.source_note, quality_requirements: ["objeto completo", "legible", "procedencia con página/localizador", "relevancia directa para el plan actual"], status: accepted ? "accepted" : "rejected", output_paths: accepted && block.image_path ? [block.image_path] : [], failure_reason: accepted ? null : `No superó la puerta final de relevancia directa (solapamiento terminológico=${overlap.length}).`, validation: { inherited_step5_quality_gate: true, relevance_score_100: review?.relevance_score_100 ?? null, subject_overlap_terms: overlap } });
    }
  }

  const visualPlan: MvpStep6VisualPlan = { artifact_type: "mvp_step6_visual_plan", artifact_version: "v1", generated_at: new Date().toISOString(), research_design_hash: hash(input.design), matrix_hash: hash(input.matrix), matrix_sequence: ["validate_structured_matrix", "generate_visual_backdrop", "compose_exact_semantic_overlay", "validate_visual_pixels", "render_editable_native_table", "insert_image_first_table_second"], assets, image_requests: { initial: initialRequests, repairs: repairRequests }, warnings };
  const visualPlanPath = path.join(visualDir, "visual-plan.json"); await writeFile(visualPlanPath, `${JSON.stringify(visualPlan, null, 2)}\n`, "utf8");
  return { visualPlan, visualPlanPath, heroImage: hero.plan as MvpStep6HeroImagePlan };
}
